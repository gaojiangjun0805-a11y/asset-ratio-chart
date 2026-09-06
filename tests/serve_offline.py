"""Local QA: forbid every off-origin connection while serving the release."""
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from functools import partial
from pathlib import Path

class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Content-Security-Policy',"connect-src 'self'; script-src 'self'; img-src 'self' data:")
        super().end_headers()

root=Path(__file__).resolve().parents[1]/'site'
ThreadingHTTPServer(('127.0.0.1',8796),partial(Handler,directory=str(root))).serve_forever()
