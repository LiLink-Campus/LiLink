from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from pathlib import Path
import os
os.chdir(Path(__file__).parent)
ThreadingHTTPServer(('127.0.0.1',4174),SimpleHTTPRequestHandler).serve_forever()
