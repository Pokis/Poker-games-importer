import sqlite3
import re
import sys
import argparse
from pathlib import Path
from collections import defaultdict

def create_database(db_path):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS hands (
            hand_number TEXT PRIMARY KEY,
            tournament_number TEXT,
            buy_in REAL,
            tournament_type TEXT,
            game_type TEXT,
            bb REAL,
            player TEXT,
            net_result_chips REAL,
            net_result_bb REAL,
            rake REAL,
            showdown BOOLEAN
        )
    ''')
    conn.commit()
    return conn

class HandParser:
    def __init__(self):
        self.reset_hand()

    def reset_hand(self):
        self.hand_number = None
        self.tournament_number = None
        self.buy_in = 0.0
        self.tournament_type = None
        self.game_type = None
        self.bb = 0.0
        self.hero = None
        self.players_dealt_to = set()
        self.hero_showdown = False
        
        self.put_in = defaultdict(float)
        self.street_inv = defaultdict(float)
        self.total_win = defaultdict(float)
        self.total_pot = 0.0
        self.hand_rake = 0.0
        self.is_cash = False

    def new_street(self):
        self.street_inv = defaultdict(float)

    def extract_game_types(self, game_str):
        # Extracts tournament type and game type
        match = re.search(r'^(.*?)\s+\((.*?)\)', game_str)
        if match:
            return match.group(1).strip(), match.group(2).strip()
        return game_str.strip(), game_str.strip()

    def parse_file(self, filepath, conn):
        cursor = conn.cursor()
        with open(filepath, 'r', encoding='utf-8-sig') as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                self.parse_line(line, cursor)

        # Save last hand if any
        if self.hand_number:
            self.save_hand(cursor)
            self.reset_hand()
        conn.commit()

    def save_hand(self, cursor):
        if not self.hand_number or not self.hero:
            return

        net_result_chips = self.total_win[self.hero] - self.put_in[self.hero]
        net_result_bb = net_result_chips / self.bb if self.bb else 0.0

        hero_rake = 0.0
        if self.is_cash and self.total_pot > 0:
            hero_rake = (self.total_win[self.hero] / self.total_pot) * self.hand_rake

        try:
            print(f"Saving hand {self.hand_number} with net {net_result_chips}")
            cursor.execute('''
                INSERT OR REPLACE INTO hands (
                    hand_number, tournament_number, buy_in, tournament_type, game_type, 
                    bb, player, net_result_chips, net_result_bb, rake, showdown
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                self.hand_number, self.tournament_number, self.buy_in, self.tournament_type, 
                self.game_type, self.bb, self.hero, net_result_chips, net_result_bb, hero_rake,
                self.hero_showdown
            ))
        except Exception as e:
            print(f"Error inserting hand {self.hand_number}: {e}")

    def parse_line(self, line, cursor):
        if line.startswith("PokerStars Hand #"):
            # New hand starts
            if self.hand_number:
                self.save_hand(cursor)
            self.reset_hand()

            # Pattern for Tournament
            tourney_match = re.search(r'PokerStars Hand #(\d+):\s+Tournament #(\d+),\s+([\d\.\+\$]+)\s+[A-Z]+\s+(.+?)\s+-\s+Level\s+[A-ZIVX]+\s+\(([\d\.]+)/([\d\.]+)\)', line)
            if tourney_match:
                self.hand_number = tourney_match.group(1)
                self.tournament_number = tourney_match.group(2)
                # Parse buyin e.g. "$25+$25+$5" -> 55.0
                buy_in_str = tourney_match.group(3).replace('$', '')
                self.buy_in = sum(float(x) for x in buy_in_str.split('+'))
                self.tournament_type, self.game_type = self.extract_game_types(tourney_match.group(4))
                self.bb = float(tourney_match.group(6))
                self.is_cash = False
                return

            # Pattern for Cash
            cash_match = re.search(r'PokerStars Hand #(\d+):\s+(.+?)\s+\(\$([\d\.]+)/\$([\d\.]+)\s*USD\)', line)
            if cash_match:
                self.hand_number = cash_match.group(1)
                self.tournament_number = "CASH"
                self.buy_in = 0.0
                self.tournament_type, self.game_type = self.extract_game_types(cash_match.group(2))
                self.bb = float(cash_match.group(4))
                self.is_cash = True
                return

        if not self.hand_number:
            return

        if line.startswith("Dealt to "):
            match = re.search(r'Dealt to (.*?) \[[^\]]* [^\]]*\]', line)
            if match:
                player = match.group(1)
                if not self.hero:
                    self.hero = player
            return

        if line.startswith("*** "):
            if "DEALING HANDS" not in line and "SUMMARY" not in line and "SHOW DOWN" not in line and "HOLE CARDS" not in line:
                self.new_street()
            return

        # Action: posts the ante
        match = re.search(r'^([^:]+):\s+posts the ante\s+\$?([\d\.]+)', line)
        if match:
            player, amount = match.group(1), float(match.group(2))
            self.put_in[player] += amount
            return

        # Action: posts
        match = re.search(r'^([^:]+):\s+(?:posts|posts small & big blinds|posts small blind|posts big blind)\s+\$?([\d\.]+)', line)
        if match:
            player, amount = match.group(1), float(match.group(2))
            self.put_in[player] += amount
            self.street_inv[player] += amount
            return

        # Action: bets or calls
        match = re.search(r'^([^:]+):\s+(?:bets|calls)\s+\$?([\d\.]+)', line)
        if match:
            player, amount = match.group(1), float(match.group(2))
            self.put_in[player] += amount
            self.street_inv[player] += amount
            return

        # Action: raises
        match = re.search(r'^([^:]+):\s+raises\s+\$?[\d\.]+\s+to\s+\$?([\d\.]+)', line)
        if match:
            player, amount = match.group(1), float(match.group(2))
            added_amount = amount - self.street_inv[player]
            self.put_in[player] += added_amount
            self.street_inv[player] = amount
            return

        # Action: brings in for
        match = re.search(r'^([^:]+):\s+brings in for\s+\$?([\d\.]+)', line)
        if match:
            player, amount = match.group(1), float(match.group(2))
            self.put_in[player] += amount
            self.street_inv[player] += amount
            return

        # Action: Uncalled bet returned
        match = re.search(r'^Uncalled bet \(\$?([\d\.]+)\) returned to (.*)', line)
        if match:
            amount, player = float(match.group(1)), match.group(2)
            self.put_in[player] -= amount
            self.street_inv[player] -= amount
            return

        # Action: showdown shows/mucks
        match = re.search(r'^([^:]+):\s+(shows \[.*\]|mucks hand)', line)
        if match:
            player = match.group(1)
            if player == self.hero:
                self.hero_showdown = True
            return

        # Collected from pot
        match = re.search(r'^(.*?)\s+collected\s+\$?([\d\.]+)\s+from pot', line)
        if match:
            player, amount = match.group(1), float(match.group(2))
            self.total_win[player] += amount
            return

        # Summary total pot / rake
        match = re.search(r'^Total pot \$?([\d\.]+)\s*\|\s*Rake \$?([\d\.]+)', line)
        if match:
            self.total_pot = float(match.group(1))
            self.hand_rake = float(match.group(2))
            return


def main():
    parser = argparse.ArgumentParser(description="Poker Hand History to SQLite Importer")
    parser.add_argument("paths", nargs="+", help="Hand history text files or directories to parse")
    parser.add_argument("--db", default="poker_hands.db", help="SQLite database file (default: poker_hands.db)")
    parser.add_argument("--filter", default="HH*.txt", help="File pattern to match when scanning directories (default: HH*.txt)")
    args = parser.parse_args()

    db_path = Path(args.db)
    
    # If adding new columns to an existing database during development,
    # it's best to drop the table or create a new DB. 
    # For now, we will just connect to it (SQLite IF NOT EXISTS will skip if it exists, 
    # so we might need a fresh DB to see 'showdown').
    conn = create_database(db_path)

    hand_parser = HandParser()
    
    files_to_parse = []
    for path_str in args.paths:
        p = Path(path_str)
        if p.is_file():
            files_to_parse.append(p)
        elif p.is_dir():
            files_to_parse.extend(p.rglob(args.filter))
            
    # De-duplicate files
    files_to_parse = list(set(files_to_parse))
    total_files = len(files_to_parse)
    
    if total_files == 0:
        print("No files found to process.")
        return
        
    print(f"Importing {total_files} files into {db_path}...")

    for idx, filepath in enumerate(files_to_parse, 1):
        print(f"[{idx}/{total_files}] Processing {filepath}")
        hand_parser.parse_file(filepath, conn)

    conn.close()
    print("Done!")

if __name__ == "__main__":
    main()
