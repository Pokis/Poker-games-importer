import http.server
import socketserver
import json
import sqlite3
import urllib.parse
from pathlib import Path

PORT = 8000
DB_FILE = "poker_hands.db"

class PokerAPIHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        parsed_path = urllib.parse.urlparse(self.path)
        
        if parsed_path.path == '/api/hands':
            self.handle_api()
        else:
            # Serve static files
            super().do_GET()
            
    def handle_api(self):
        if not Path(DB_FILE).exists():
            self.send_error(500, "Database file not found.")
            return
            
        try:
            conn = sqlite3.connect(DB_FILE)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            cursor.execute("SELECT * FROM hands")
            rows = cursor.fetchall()
            
            data = [dict(row) for row in rows]
            
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(data).encode('utf-8'))
            
        except Exception as e:
            self.send_error(500, f"Database error: {str(e)}")
        finally:
            if 'conn' in locals():
                conn.close()

if __name__ == "__main__":
    with socketserver.TCPServer(("", 0), PokerAPIHandler) as httpd:
        actual_port = httpd.server_address[1]
        print(f"Serving dashboard at http://localhost:{actual_port}")
        print("Press Ctrl+C to stop.")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server.")
