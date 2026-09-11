from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import os
os.chdir(Path(__file__).parent)
class Handler(SimpleHTTPRequestHandler):
 def do_GET(self):
  if self.path.split('?')[0].startswith('/api/'):
   self.send_error(501,'No backend in this preview');return
  if self.path=='/' or self.path.startswith('/sjtu'):
   self.path='/index.html'
  super().do_GET()
ThreadingHTTPServer(('127.0.0.1',4173),Handler).serve_forever()
