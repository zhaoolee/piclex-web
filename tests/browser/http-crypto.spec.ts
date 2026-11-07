import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import {unzipSync,zipSync} from 'fflate';
import {decodeProgress,stableID} from '../../packages/backup/src/progress.mjs';

const origin='http://piclex-http.test';
const catalog=JSON.parse(fs.readFileSync('apps/public/public/library/catalog.json','utf8'));
const first=catalog[0],deck=JSON.parse(fs.readFileSync('apps/public/public/'+first.payload,'utf8'));
const fixture=fs.readFileSync('tests/fixtures/demo/decks/cafe.piclexdeck');
test.beforeEach(async({page,baseURL})=>{
 // Forward bytes, not the browser URL: this is a real insecure HTTP origin.
 await page.route(origin+'/**',async route=>{
  const url=new URL(route.request().url());
  const response=await route.fetch({url:new URL(url.pathname+url.search,baseURL).href});
  await route.fulfill({response});
 });
});
async function insecure(page:import('@playwright/test').Page){
 expect(await page.evaluate(()=>({secure:isSecureContext,subtle:typeof crypto.subtle}))).toEqual({secure:false,subtle:'undefined'});
}
test('HTTP official deck opens and reloads without WebCrypto',async({page})=>{
 await page.goto(origin+'/piclex-web/#/learn');await insecure(page);
 await expect(page.getByRole('heading',{name:deck.words[0].chinese,exact:true})).toBeVisible();
 await expect(page.getByRole('textbox',{name:'输入英文',exact:true})).toBeVisible();
 await page.reload();await expect(page.getByRole('heading',{name:deck.words[0].chinese,exact:true})).toBeVisible();
});
test('HTTP local import works and corrupt archives cannot replace it',async({page})=>{
 await page.goto(origin+'/piclex-web/#/decks');await insecure(page);
 await page.getByLabel('选择照片卡组文件').setInputFiles({name:'cafe.piclexdeck',mimeType:'application/octet-stream',buffer:fixture});
 await expect(page.getByRole('heading',{name:'牛角包',exact:true})).toBeVisible();
 const files=unzipSync(fixture),photo=Object.keys(files).find(p=>p.endsWith('.jpg'))!;files[photo][42]^=1;
 await page.goto(origin+'/piclex-web/#/decks');
 await page.getByLabel('选择照片卡组文件').setInputFiles({name:'broken.piclexdeck',mimeType:'application/octet-stream',buffer:Buffer.from(zipSync(files))});
 await expect(page.locator('.toast[role="status"]')).toContainText('照片内容校验失败');
 await page.goto(origin+'/piclex-web/#/learn');
 await expect(page.getByRole('heading',{name:'牛角包',exact:true})).toBeVisible();
});

test('HTTP automatic progress reads and publishes verified snapshots without secure-only crypto',async({page})=>{
 const dav='https://dav-http.example.test',folder='/dav/PicLex/progress/';
 const native=fs.readFileSync('tests/fixtures/backup/native-progress.json');
 const name='PicLex-progress-v1-'+JSON.parse(native.toString()).contentSHA256.slice(0,20)+'.json';
 const files=new Map<string,Buffer>([[folder+name,native]]),requests:string[]=[];
 await page.route(dav+'/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname,method=req.method();requests.push(method+' '+path);
  const reply=(status:number,body:Buffer|string='')=>route.fulfill({status,body,headers:{'access-control-allow-origin':origin,'access-control-allow-methods':'GET, PUT, MOVE, DELETE, MKCOL, PROPFIND, OPTIONS','access-control-allow-headers':'authorization, content-type, depth, destination, overwrite, if-none-match'}});
  if(method==='OPTIONS')return reply(204);
  if(method==='PROPFIND')return reply(207,'<d:multistatus xmlns:d="DAV:">'+[path,...(path===folder?[...files.keys()].filter(p=>p.startsWith(folder)&&!p.includes('.complete-uploading-')):[])].map(p=>`<d:response><d:href>${p}</d:href><d:propstat><d:prop><d:resourcetype>${p.endsWith('/')?'<d:collection/>':''}</d:resourcetype></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`).join('')+'</d:multistatus>');
  if(method==='GET')return reply(files.has(path)?200:404,files.get(path));
  if(method==='MKCOL')return reply(201);
  if(method==='PUT'){expect(req.headers()['if-none-match']).toBe('*');expect(files.has(path)).toBe(false);files.set(path,req.postDataBuffer()!);return reply(201);}
  if(method==='MOVE'){const destination=new URL(req.headers().destination).pathname;expect(req.headers().overwrite).toBe('F');expect(files.has(destination)).toBe(false);files.set(destination,files.get(path)!);files.delete(path);return reply(201);}
  if(method==='DELETE'){expect(path).toContain('.complete-uploading-');files.delete(path);return reply(204);}
  return reply(405);
 });
 await page.addInitScript(address=>localStorage.setItem('piclex-web.webdav.connection',JSON.stringify({address,username:'fixture',password:'fixture',remember:true})),dav+'/dav/');
 await page.goto(origin+'/piclex-web/#/settings/data/webdav');await insecure(page);
 await page.evaluate(()=>window.dispatchEvent(new Event('online')));
 await expect(page.getByText('等级与学习进度已自动同步',{exact:true})).toBeVisible({timeout:20000});
 await page.goto(origin+'/piclex-web/#/settings/level');await expect(page.locator('.level-page')).toContainText('共 5 经验');
 // A new local event forces the staging upload/MOVE/readback path on HTTP.
 await page.evaluate(async()=>{
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('piclex-web-experience-v1');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  await new Promise<void>((resolve,reject)=>{const t=db.transaction('events','readwrite');t.objectStore('events').put({id:'http-reading',kind:'reading',credit:3,wordCount:3,at:Date.now()});t.oncomplete=()=>resolve();t.onerror=()=>reject(t.error);});db.close();
 });
 await page.goto(origin+'/piclex-web/#/settings/data/webdav');await page.evaluate(()=>window.dispatchEvent(new Event('online')));
 await expect.poll(()=>requests.filter(r=>r.startsWith('MOVE ')).length).toBeGreaterThan(0);
 await expect(page.getByText('等级与学习进度已自动同步',{exact:true})).toBeVisible();
 const snapshots=await Promise.all([...files.values()].map(b=>decodeProgress(new Uint8Array(b))));
 const expectedID=await stableID('http-reading');
 expect(snapshots.some(c=>c.readingEvents?.some((e:any)=>e.id===expectedID))).toBe(true);
 expect([...files.keys()].every(p=>p.endsWith('.json')&&!p.includes('.complete-uploading-'))).toBe(true);
 expect(requests.some(r=>r.includes('.piclexdeck'))).toBe(false);
});
