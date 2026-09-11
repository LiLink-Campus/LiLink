import re, pathlib, urllib.request, concurrent.futures
root=pathlib.Path(__file__).parent
base='https://trycampusdate.com/'
html=urllib.request.urlopen(base+'sjtu').read().decode()
(root/'index.html').write_text(html)
pending={'assets/index-Cb0dhm-h.js','assets/index-BaaOpo1n.css'}; seen=set()
def get(path):
 try:
  data=urllib.request.urlopen(base+path,timeout=25).read(); dest=root/path; dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(data)
  return path,data.decode(errors='ignore') if path.endswith(('.js','.css')) else ''
 except Exception as e: return path,''
pending.update(re.findall(r'(?:src|href)="/([^"?#]+)"',html))
while pending:
 batch=pending-seen; pending=set()
 if not batch:break
 with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
  for path,s in pool.map(get,batch):
   seen.add(path)
   for match in re.findall(r'["\'`](?:\./|/)?((?:assets/)?[\w.-]+\.(?:js|css|woff2|png|svg|webp))["\'`]',s):
    p=match if match.startswith('assets/') else 'assets/'+match
    if p not in seen:pending.add(p)
print('Downloaded',len(seen),'public resources')
