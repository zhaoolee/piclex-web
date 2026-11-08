import pathlib,subprocess,hashlib,json,sys,os
root=pathlib.Path('/work');out=pathlib.Path('/evidence');out.mkdir(exist_ok=True)
def fixtures():return {str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in (root/'tests/fixtures/demo').rglob('*') if p.is_file()}
before=fixtures();results=[]
for name,command in [('decks',['npm','run','decks:build']),('unit',['npm','test']),('deploy',['npm','run','test:deploy']),('content',['npm','run','content:build']),('build',['npm','run','build'])]:
 with (out/(name+'.log')).open('w') as log:code=subprocess.run(command,cwd=root,stdout=log,stderr=subprocess.STDOUT,env={**os.environ,'PICLEX_CONTENT_CACHE':'/work/.cache/piclex-content'}).returncode
 results.append({'check':name,'exit':code});(out/'checks.json').write_text(json.dumps(results,indent=2))
 print(name+': '+str(code),flush=True)
 if code:sys.exit(code)
 if name=='decks':assert fixtures()==before,'Fixture bytes changed'
