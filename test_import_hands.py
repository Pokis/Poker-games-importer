import unittest
import sqlite3
import tempfile
import os
from import_hands import HandParser, create_database

class TestHandParser(unittest.TestCase):
    def setUp(self):
        self.fd, self.db_path = tempfile.mkstemp()
        self.conn = create_database(self.db_path)
        self.parser = HandParser()

    def tearDown(self):
        self.conn.close()
        os.close(self.fd)
        os.unlink(self.db_path)

    def write_temp_file(self, content):
        fd, path = tempfile.mkstemp(suffix=".txt")
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            f.write(content)
        return path

    def get_hand_from_db(self, hand_number):
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM hands WHERE hand_number=?", (hand_number,))
        return cursor.fetchone()

    def test_cash_game_badugi(self):
        hand_text = """
PokerStars Hand #260317098719:  Badugi Limit ($2.50/$5.00 USD) - 2026/04/02 18:02:20 EET [2026/04/02 11:02:20 ET]
Table 'Gaviola III' 8-max Seat #8 is the button
Seat 1: brokestinas ($70 in chips) 
Seat 8: Joke8989 ($123.60 in chips) 
brokestinas: posts small blind $1.25
radoslavL11: posts big blind $2.50
*** DEALING HANDS ***
Dealt to brokestinas [7h 3s 5h 6d]
Joke8989: raises $2.50 to $7.50
brokestinas: raises $2.50 to $10
Joke8989: calls $2.50
*** FIRST DRAW ***
Joke8989: bets $2.50
brokestinas: calls $2.50
*** SECOND DRAW ***
Joke8989: bets $5
brokestinas: calls $5
*** THIRD DRAW ***
Joke8989: checks 
brokestinas: checks 
*** SHOW DOWN ***
brokestinas: shows [3s 6d 2h 8c] (Badugi: 8,6,3,2)
brokestinas collected $53.35 from pot
*** SUMMARY ***
Total pot $55 | Rake $1.65 
        """
        temp_file = self.write_temp_file(hand_text.strip())
        self.parser.parse_file(temp_file, self.conn)
        os.unlink(temp_file)

        row = self.get_hand_from_db("260317098719")
        self.assertIsNotNone(row)
        
        # Unpack expected row
        hand_number, tournament_number, buy_in, tournament_type, game_type, bb, player, net_result_chips, net_result_bb, rake, showdown = row
        
        self.assertEqual(hand_number, "260317098719")
        self.assertEqual(tournament_number, "CASH")
        self.assertEqual(buy_in, 0.0)
        self.assertEqual(tournament_type, "Badugi Limit")
        self.assertEqual(game_type, "Badugi Limit")
        self.assertEqual(bb, 5.0)
        self.assertEqual(player, "brokestinas")
        self.assertTrue(showdown)
        
        # Calculation for put in: SB 1.25 + raise 8.75 + call 2.50 + call 5 = 17.50
        # Win: 53.35
        # Net result: 53.35 - 17.50 = 35.85
        self.assertAlmostEqual(net_result_chips, 35.85, places=2)
        self.assertAlmostEqual(net_result_bb, 35.85 / 5.0, places=2)
        
        # Rake: hero won 53.35 from 55 pot. Rake = 1.65 * (53.35 / 55.0) = 1.6005
        self.assertAlmostEqual(rake, 1.65 * (53.35 / 55.0), places=2)


    def test_tournament_8_game(self):
        hand_text = """
PokerStars Hand #260946776010: Tournament #4002467877, $25+$25+$5 USD 8-Game (Triple Draw 2-7 Lowball Limit) - Level I (160/320) - 2026/05/27 20:05:58 EET [2026/05/27 13:05:58 ET]
Table '4002467877 1' 6-max Seat #3 is the button
Seat 1: brokestinas (10480 in chips, $25 bounty) 
Seat 5: Keep3r (10800 in chips, $25 bounty) 
Keep3r: posts small blind 80
brokestinas: posts big blind 160
*** DEALING HANDS ***
Dealt to brokestinas [3c Qs 2s Ah 9c]
Keep3r: raises 160 to 320
brokestinas: calls 160
*** FIRST DRAW ***
brokestinas: bets 160
Keep3r: calls 160
*** SECOND DRAW ***
brokestinas: bets 320
Keep3r: calls 320
*** THIRD DRAW ***
brokestinas: bets 320
Keep3r: folds 
Uncalled bet (320) returned to brokestinas
brokestinas collected 1600 from pot
*** SUMMARY ***
Total pot 1600 | Rake 0 
        """
        temp_file = self.write_temp_file(hand_text.strip())
        self.parser.parse_file(temp_file, self.conn)
        os.unlink(temp_file)

        row = self.get_hand_from_db("260946776010")
        self.assertIsNotNone(row)
        
        hand_number, tournament_number, buy_in, tournament_type, game_type, bb, player, net_result_chips, net_result_bb, rake, showdown = row
        
        self.assertEqual(tournament_number, "4002467877")
        self.assertEqual(buy_in, 55.0)
        self.assertEqual(tournament_type, "8-Game")
        self.assertEqual(game_type, "Triple Draw 2-7 Lowball Limit")
        self.assertEqual(bb, 320.0)
        self.assertFalse(showdown)
        
        # Calculation for put in: BB 160 + call 160 + bet 160 + bet 320 = 800 (the 320 was returned)
        # Win: 1600
        # Net result: 1600 - 800 = +800
        self.assertAlmostEqual(net_result_chips, 800.0)
        self.assertAlmostEqual(net_result_bb, 800.0 / 320.0)
        self.assertEqual(rake, 0.0)

    def test_post_ante(self):
        hand_text = """
PokerStars Hand #260946892373: Tournament #4002467877, $25+$25+$5 USD 8-Game (Razz Limit) - Level IV (200/400) - 2026/05/27 20:17:39 EET [2026/05/27 13:17:39 ET]
Table '4002467877 1' 6-max
Seat 1: brokestinas (8560 in chips, $25 bounty) 
Seat 3: 21fireman89 (9680 in chips, $25 bounty) 
Seat 5: Keep3r (12400 in chips, $25 bounty) 
brokestinas: posts the ante 40
21fireman89: posts the ante 40
Keep3r: posts the ante 40
*** 3rd STREET ***
Dealt to brokestinas [Kd 4s 9d]
Keep3r: brings in for 60
brokestinas: folds 
21fireman89: raises 140 to 200
Keep3r: calls 140
*** 4th STREET ***
21fireman89: bets 200
Keep3r: calls 200
*** 5th STREET ***
21fireman89: bets 400
Keep3r: folds 
Uncalled bet (400) returned to 21fireman89
21fireman89 collected 920 from pot
*** SUMMARY ***
Total pot 920 | Rake 0 
        """
        temp_file = self.write_temp_file(hand_text.strip())
        self.parser.parse_file(temp_file, self.conn)
        os.unlink(temp_file)

        row = self.get_hand_from_db("260946892373")
        self.assertIsNotNone(row)
        
        hand_number, tournament_number, buy_in, tournament_type, game_type, bb, player, net_result_chips, net_result_bb, rake, showdown = row
        
        self.assertEqual(game_type, "Razz Limit")
        self.assertFalse(showdown)
        # Put in: Ante 40
        # Collected: 0
        # Net result: -40
        self.assertAlmostEqual(net_result_chips, -40.0)

if __name__ == '__main__':
    unittest.main()
