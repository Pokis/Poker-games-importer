# Poker Hand History to SQLite Importer

This project provides a Python script that parses standard PokerStars hand history text files and imports them into a SQLite database. 

It tracks the actions of the "Hero" (the player who has their hole cards visible in the file) to compute statistics such as chips put into the pot, total chips won, net result, and rake paid (in case of cash games).

## Requirements
- Python 3.7+

## Usage

You can run the script via the command line and pass one or more `.txt` files or directories containing hand histories. If you provide a directory, the script will automatically recursively search for all `HH*.txt` files inside it.

```bash
python import_hands.py "HH20260527 T4002467877 8-Game $50 + $5.txt" "folder/with/hands"
```

If you are using PowerShell and the filename contains a `$` symbol, it is recommended to wrap the filename in single quotes `''` to prevent PowerShell from trying to interpolate it as a variable:

```bash
python import_hands.py 'HH20260527 T4002467877 8-Game $50 + $5.txt'
```

By default, this will create a SQLite database named `poker_hands.db` in the current directory and insert the parsed hands.

### Options
- `--db <filename>`: Specify a custom path for the SQLite database.
- `--filter <pattern>`: Override the default file matching pattern when scanning directories (default is `HH*.txt`).

Examples:
```bash
python import_hands.py --db custom_poker.db 'HH20260527 T4002467877 8-Game $50 + $5.txt'
python import_hands.py --filter "HH*Badugi.txt" "folder/with/hands"
```

## Running Tests

Unit tests are included to ensure that regex patterns and mathematical calculations for pot sizing and rake are correct.

To run the unit tests, execute:
```bash
python test_import_hands.py
```

## Database Schema

The script will create a table named `hands` with the following columns:

| Column | Type | Description |
|--------|------|-------------|
| `hand_number` | TEXT | The unique PokerStars hand identifier (Primary Key) |
| `tournament_number` | TEXT | The ID of the tournament, or "CASH" for cash games |
| `buy_in` | REAL | The total buy-in amount in USD (sum of splits, e.g. 25+25+5 = 55.0) |
| `tournament_type` | TEXT | The type of the tournament / cash table |
| `game_type` | TEXT | The specific variant being played in this hand |
| `bb` | REAL | The Big Blind or Big Bet size |
| `player` | TEXT | The name of the Hero who the statistics correspond to |
| `net_result_chips` | REAL | The net amount of chips won or lost by the Hero |
| `net_result_bb` | REAL | The net result divided by the `bb` |
| `rake` | REAL | Proportional rake paid by the Hero based on pot share (CASH games only) |
| `showdown` | BOOLEAN | Indicates whether the Hero participated in showdown and showed/mucked their hand (1 = True, 0 = False) |

You can explore the generated SQLite database using any DB viewer (like DB Browser for SQLite) or by using the `sqlite3` CLI:
```bash
sqlite3 poker_hands.db "SELECT * FROM hands LIMIT 5;"
```
