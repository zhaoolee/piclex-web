import urllib.request,json,hashlib,re,sys
sites={'pages':'https://zhaoolee.com/piclex-web/','domestic':'https://piclex.v2fy.com/piclex-web/'}
def read(url):
 req=urllib.request.Request(url,headers={'Cache-Control':'no-cache'})
 with urllib.request.urlopen(req,timeout=45) as response:return response.read()
expected=sys.argv[1];result={}
for name,base in sites.items():
 manifest=json.loads(read(base+'release.json'));assert manifest['sourceRevision']==expected,(name,manifest['sourceRevision'],expected)
 html=read(base);files=manifest['files']
 refs=['piclex-web/index.html']+['piclex-web/'+p for p in re.findall(r'(?:src|href)="/piclex-web/([^"?#]+\.(?:js|css))"',html.decode())]
 checked=[]
 for path in dict.fromkeys(refs):
  data=html if path.endswith('/index.html') else read(base+path.removeprefix('piclex-web/'))
  sha=hashlib.sha256(data).hexdigest();assert sha==files[path]['sha256'],(name,path)
  checked.append({'path':path,'sha256':sha,'bytes':len(data)})
 result[name]={'url':base,'sourceRevision':manifest['sourceRevision'],'releaseID':manifest['releaseID'],'manifestFiles':len(manifest['files']),'assets':checked}
print(json.dumps(result,ensure_ascii=False,indent=2))
