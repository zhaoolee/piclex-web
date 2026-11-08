import {encodePositions,decodePositions,positionName,positionAnchor} from '../../packages/backup/src/positions.mjs';
import {test as baseTest,expect,webkit,type Page} from '@playwright/test';
import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';import {startWebDAV} from '../support/webdav-server.mjs';import {createHash} from 'node:crypto';
import {createPhotoDeck} from '../../packages/deck-format/src/create.mjs';
import {decodeProgress,encodeProgress} from '../../packages/backup/src/progress.mjs';
const test=baseTest.extend({context:async({context,browserName},use,info)=>{if(browserName!=='webkit'){await use(context);return;}const profile=info.outputPath('webkit-profile'),persistent=await webkit.launchPersistentContext(profile,{headless:true,ignoreHTTPSErrors:true,args:process.platform==='darwin'?['--mute-audio']:[],viewport:{width:390,height:844},isMobile:true,hasTouch:true});try{
 // Linux WebKit's persistent HTTP cache can fail a revalidated module with
 // 'WebKit encountered an internal error' before React starts after restore.
 // A pass-through asset route isolates this transport fixture from that cache;
 // persistent OPFS, actual HTTPS WebDAV traffic and restore assertions remain.
 await persistent.route('**/piclex-web/assets/*.js',route=>route.continue());
 await use(persistent);
 }finally{await persistent.close();fs.rmSync(profile,{recursive:true,force:true});}}});
test.use({ignoreHTTPSErrors:true});
test.describe.configure({mode:'default'});
let testStarted=0;test.beforeEach(()=>{testStarted=Date.now();});
let origin='https://dav.example.test';const base='/dav/',root=base+'PicLex/',nativeName='PicLex-Backup-20261105-native';
const photoID='55555555-5555-4555-8555-555555555555';
const progress=fs.readFileSync('tests/fixtures/backup/native-progress.json');
let cleanup:(()=>Promise<void>)|null=null;
test.afterEach(async()=>{await cleanup?.();cleanup=null;});
async function server(page:Page,options:{failPut?:boolean;corruptReadback?:boolean;slow?:boolean;slowPut?:boolean;oversize?:boolean}={}){
 const directory=test.info().outputPath('small-server'),certificate=test.info().outputPath('small-tls');fs.mkdirSync(path.join(directory,'PicLex',nativeName),{recursive:true});
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',certificate+'.key','-out',certificate+'.crt','-subj','/CN=127.0.0.1','-addext','subjectAltName=IP:127.0.0.1','-days','1'],{stdio:'ignore'});
 const remote=await startWebDAV(directory,certificate,{auth:'test-account:test-secret'});origin=new URL(remote.url).origin;Object.assign(remote.stats,options);
 cleanup=async()=>{await remote.close();fs.rmSync(directory,{recursive:true,force:true});fs.rmSync(certificate+'.key',{force:true});fs.rmSync(certificate+'.crt',{force:true});};
 const absolute=(p:string)=>path.join(directory,p.slice(base.length));
 const files={get:(p:string)=>fs.existsSync(absolute(p))?fs.readFileSync(absolute(p)):undefined,set:(p:string,b:Buffer)=>fs.writeFileSync(absolute(p),b),has:(p:string)=>fs.existsSync(absolute(p)),*[Symbol.iterator]():Generator<[string,Buffer]>{for(const folder of fs.readdirSync(path.join(directory,'PicLex')))for(const name of fs.readdirSync(path.join(directory,'PicLex',folder))){const p=root+folder+'/'+name;yield [p,fs.readFileSync(absolute(p))];}}};
 const photo=Buffer.from(await createPhotoDeck({image:new Uint8Array(fs.readFileSync('tests/fixtures/covers/portrait.jpg')),title:'相机照片',id:photoID,labels:[{english:'camera',chinese:'相机',example:'This is a camera.',exampleChinese:'这是一台相机。',relation:'scene_extension'}]}));
 const manifest={format:'com.zhaoolee.piclex.complete-backup',version:1,photos:'photos.piclexdeck',learningProgress:'learning-progress.json',photoCount:1,photosSHA256:createHash('sha256').update(photo).digest('hex'),progressSHA256:JSON.parse(progress.toString()).contentSHA256};
 for(const [name,bytes]of Object.entries({'photos.piclexdeck':photo,'learning-progress.json':progress,'backup.json':Buffer.from(JSON.stringify(manifest))}))files.set(root+nativeName+'/'+name,bytes);
 return {async putPositions(rows:any[]){const bytes=encodePositions(rows),name=await positionName(bytes);fs.mkdirSync(absolute(root+'positions/'),{recursive:true});files.set(root+'positions/'+name,Buffer.from(bytes));return name;},putProgress(bytes:Buffer){const name='PicLex-progress-v1-'+JSON.parse(bytes.toString()).contentSHA256.slice(0,20)+'.json';fs.mkdirSync(absolute(root+'progress/'),{recursive:true});files.set(root+'progress/'+name,bytes);return name;},files,stats:remote.stats,requests:remote.requests,get directories(){return new Set([base,root,...fs.readdirSync(path.join(directory,'PicLex')).map(n=>root+n+'/')]);}};
}
async function connect(page:Page){await page.goto('/piclex-web/#/settings/data/webdav/connection');await page.getByLabel('服务器地址',{exact:true}).fill(origin+base);await page.getByLabel('账号',{exact:true}).fill('test-account');await page.getByLabel('密码',{exact:true}).fill('test-secret');await page.getByRole('button',{name:'保存并连接',exact:true}).click();await expect(page.getByText('连接成功',{exact:true})).toBeVisible();}
// The restore reload must finish before a follow-up full navigation in WebKit.
async function restore(page:Page){await page.goto('/piclex-web/#/settings/data/webdav/restore');await page.getByRole('button',{name:'刷新备份列表',exact:true}).click();await page.getByRole('button',{name:nativeName,exact:true}).click();await expect(page.getByRole('dialog',{name:'恢复完整备份？'})).toBeVisible();await Promise.all([page.waitForEvent('load'),page.getByRole('button',{name:'恢复照片和学习进度',exact:true}).click()]);await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.locator('.photo-data-page')).toBeVisible();}
async function xp(page:Page){await page.goto('/piclex-web/#/settings/level');await expect(page.locator('.level-page')).toContainText('共 5 经验');}
test('App backup restores into Web, duplicate restore is idempotent, and Web publishes App-compatible progress',async({page},info)=>{
 const remote=await server(page);await connect(page);await page.reload();await expect(page.getByLabel('密码',{exact:true})).toHaveValue('test-secret');expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('piclex-web.webdav.connection')!).password)).toBe('');
 await restore(page);await xp(page);await restore(page);await xp(page);
 await page.goto('/piclex-web/#/deck/local-backup-'+photoID);await expect(page.getByRole('heading',{name:'相机',exact:true})).toBeVisible();await expect.poll(()=>page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('piclex-web.study.v2.')).map(k=>JSON.parse(localStorage.getItem(k)!)).some(s=>s.history['55555555-5555-4555-8555-555555555555:0']?.mistakes?.[0]===2))).toBe(true);
 for(const letter of 'CAMERA')await page.getByRole('button',{name:'按键 '+letter,exact:true}).click();await page.goto('/piclex-web/#/settings/level');await expect(page.locator('.level-page')).toContainText('共 6 经验');
 await page.goto('/piclex-web/#/settings/data/webdav');await page.getByRole('button',{name:'创建完整备份',exact:true}).click();await expect(page.getByText('WebDAV 完整备份完成。',{exact:true})).toBeVisible();
 const folder=[...remote.directories].find(p=>p.startsWith(root+'PicLex-Backup-')&&p!==root+nativeName+'/')!;expect(folder).toBeTruthy();const bytes=remote.files.get(folder+'learning-progress.json')!;const content=await decodeProgress(new Uint8Array(bytes));expect(content.progress[0].wordKey).toBe('camera');expect(content.progress[0].attempts).toBe(4);expect(content.progress[0].correctAnswers).toBe(3);expect(content.readingEvents[0].experience).toBe(4);expect(content.events).toHaveLength(2);fs.writeFileSync(info.outputPath('web-progress.json'),bytes);
 for(const [name,b]of remote.files)if(name.startsWith(folder))expect(b.includes(Buffer.from('test-secret'))).toBe(false);
 await page.goto('/piclex-web/#/settings/data');await expect(page.getByRole('button',{name:'已拍照片 1',exact:true})).toBeVisible();await page.screenshot({path:info.outputPath('photo-data.png')});await page.getByRole('button',{name:'数据备份与恢复',exact:true}).click();await expect(page.getByRole('button',{name:'远程 WebDAV',exact:true})).toBeVisible();
});
test('corrupt remote progress is rejected before saving photos or credits; password field stays masked',async({page})=>{const remote=await server(page);await connect(page);await expect(page.getByLabel('密码',{exact:true})).toHaveAttribute('type','password');const p=root+nativeName+'/learning-progress.json',bad=JSON.parse(remote.files.get(p)!.toString());bad.content.progress[0].correctAnswers=99;remote.files.set(p,Buffer.from(JSON.stringify(bad)));await page.goto('/piclex-web/#/settings/data/webdav/restore');await page.getByRole('button',{name:'刷新备份列表',exact:true}).click();await page.getByRole('button',{name:nativeName,exact:true}).click();await expect(page.getByRole('alert')).toContainText('校验');await expect(page.getByRole('dialog')).toHaveCount(0);await page.goto('/piclex-web/#/settings/data');await expect(page.getByRole('button',{name:'已拍照片 0',exact:true})).toBeVisible();});
test('native photo-data hierarchy fits small screens and short viewports with usable configuration controls',async({page},info)=>{await server(page);await connect(page);for(const size of [{width:320,height:568},{width:844,height:390},{width:1440,height:1000}]){await page.setViewportSize(size);const button=page.getByRole('button',{name:'保存并连接',exact:true});await button.scrollIntoViewIfNeeded();const box=await button.boundingBox(),nav=await page.locator('.app-tabs').boundingBox();expect(box!.y+box!.height).toBeLessThanOrEqual(nav!.y);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}await page.setViewportSize({width:390,height:844});await page.getByLabel('服务器地址',{exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('webdav-connection.png')});});

test('failed upload cleans only its own staging directory and retains existing backups',async({page})=>{const remote=await server(page,{failPut:true});await connect(page);await page.goto('/piclex-web/#/settings/data/webdav');await page.getByRole('button',{name:'创建完整备份',exact:true}).click();await expect(page.getByRole('alert')).toContainText('存储空间不足');expect(remote.requests.filter(r=>r.method==='DELETE')).toHaveLength(1);expect([...remote.directories].some(p=>p.includes('.complete-uploading-'))).toBe(false);expect(remote.files.has(root+nativeName+'/photos.piclexdeck')).toBe(true);expect(remote.requests.some(r=>r.method==='MOVE')).toBe(false);});
test('successful PUT and MOVE are not reported as a valid backup when readback is corrupt',async({page})=>{const remote=await server(page,{corruptReadback:true});await connect(page);await page.goto('/piclex-web/#/settings/data/webdav');await page.getByRole('button',{name:'创建完整备份',exact:true}).click();await expect(page.getByRole('alert')).toContainText('校验失败');expect(remote.requests.some(r=>r.method==='DELETE')).toBe(false);await expect(page.getByText('WebDAV 完整备份完成。',{exact:true})).toHaveCount(0);});
// An empty grid also matches the transient reload document. Wait for the new
// document and the intended page before navigating again; keep all data checks.
test('local complete ZIP restores idempotently and recycled photos can return to practice',async({page},info)=>{await server(page);await connect(page);await restore(page);await page.goto('/piclex-web/#/settings/data/local');const download=page.waitForEvent('download');await page.getByRole('button',{name:'立即完整备份',exact:true}).click();const file=await download,path=info.outputPath('local-complete.zip');await file.saveAs(path);await page.goto('/piclex-web/#/settings/data/local/restore');await page.getByLabel('选择完整备份 ZIP',{exact:true}).setInputFiles(path);await expect(page.getByRole('dialog')).toContainText('1 张照片');await Promise.all([page.waitForEvent('domcontentloaded'),page.getByRole('button',{name:'恢复照片和学习进度',exact:true}).click()]);await expect(page.getByRole('dialog')).toHaveCount(0);await xp(page);await page.goto('/piclex-web/#/settings/data/photos');await page.locator('.data-photo-grid button').click();await Promise.all([page.waitForEvent('domcontentloaded'),page.getByRole('button',{name:'移入回收站',exact:true}).click()]);await expect(page.getByRole('heading',{name:'已拍照片',exact:true})).toBeVisible();await expect(page.getByText('暂无已拍照片',{exact:true})).toBeVisible();await expect(page.locator('.data-photo-grid button')).toHaveCount(0);await page.goto('/piclex-web/#/settings/data/trash');await page.locator('.data-photo-grid button').click();await Promise.all([page.waitForEvent('domcontentloaded'),page.getByRole('button',{name:'恢复照片',exact:true}).click()]);await expect(page.getByRole('heading',{name:'回收站',exact:true})).toBeVisible();await expect(page.getByText('回收站为空',{exact:true})).toBeVisible();await expect(page.locator('.data-photo-grid button')).toHaveCount(0);await page.goto('/piclex-web/#/settings/data/photos');await expect(page.locator('.data-photo-grid button')).toHaveCount(1);await page.goto('/piclex-web/#/deck/local-backup-'+photoID);await expect(page.getByRole('heading',{name:'相机',exact:true})).toBeVisible();});
test('legacy Web completion exports its original word and date without awarding restored answers again',async({page},info)=>{const remote=await server(page);await connect(page);const at=1600000000000,wordID=photoID+':0',fingerprint='old-web-fingerprint',id=`spell:${fingerprint}:0:${wordID}`;await page.evaluate(async({at,wordID,fingerprint,id})=>{localStorage.setItem('piclex-web.study.v2.'+fingerprint,JSON.stringify({version:2,fingerprint,round:0,words:{[wordID]:{input:'camera',result:'correct',quickIndices:null}},history:{[wordID]:{mastered:true,mistakes:[]}}}));const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('piclex-web-experience-v1',1);r.onupgradeneeded=()=>{r.result.createObjectStore('events',{keyPath:'id'});r.result.createObjectStore('meta');};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});await new Promise<void>((resolve,reject)=>{const t=db.transaction(['events','meta'],'readwrite');t.objectStore('events').put({id,kind:'spelling',credit:1,at});t.objectStore('meta').put({total:1,statistics:{spelling:1},milestones:[]},'account');t.oncomplete=()=>resolve();t.onerror=()=>reject(t.error);});db.close();},{at,wordID,fingerprint,id});await page.goto('/piclex-web/#/settings/data/webdav');await page.getByRole('button',{name:'创建完整备份',exact:true}).click();await expect(page.getByText('WebDAV 完整备份完成。',{exact:true})).toBeVisible();const folder=[...remote.directories].find(p=>p.startsWith(root+'PicLex-Backup-')&&p!==root+nativeName+'/')!;const content=await decodeProgress(new Uint8Array(remote.files.get(folder+'learning-progress.json')!));expect(content.progress[0]).toMatchObject({wordKey:'camera',attempts:1,lastPracticedAt:at});expect(content.events[0].wordKey).toBe('camera');await restore(page);await page.goto('/piclex-web/#/settings/level');await expect(page.locator('.level-page')).toContainText('共 6 经验');});
test('authentication is not forwarded to a redirected WebDAV host',async({page,browserName})=>{test.skip(browserName==='webkit','Playwright WebKit cannot fulfill redirect responses; request policy also has a unit test.');let leaked=false;await page.route('https://outside.example.test/**',route=>{leaked=true;return route.abort();});await page.route(origin+'/**',route=>route.fulfill({status:302,headers:{location:'https://outside.example.test/','access-control-allow-origin':'*'}}));await page.goto('/piclex-web/#/settings/data/webdav/connection');await page.getByLabel('服务器地址',{exact:true}).fill(origin+base);await page.getByLabel('账号',{exact:true}).fill('test-account');await page.getByLabel('密码',{exact:true}).fill('test-secret');await page.getByRole('button',{name:'保存并连接',exact:true}).click();await expect(page.getByRole('alert')).toContainText('无法连接');expect(leaked).toBe(false);});

async function temporaryFiles(page:Page){return page.evaluate(async(testStarted)=>{const root=await navigator.storage.getDirectory();try{const parent=await root.getDirectoryHandle('piclex-backup-transfers');let count=0;for await(const [name,dir]of (parent as any).entries())if(Number(name.split('-')[1])>=testStarted)for await(const _ of dir.entries())count++;return count;}catch(e){if(e.name==='NotFoundError')return 0;throw e;}},testStarted);}
test('quota and native 20 GiB limit failures leave existing data intact and clean temporary files',async({page})=>{const remote=await server(page);await connect(page);await restore(page);await page.goto('/piclex-web/#/settings/data/webdav/restore');await page.evaluate(()=>Object.defineProperty(FileSystemFileHandle.prototype,'createWritable',{configurable:true,value:async()=>{throw new DOMException('Test quota exceeded','QuotaExceededError');}}));await page.getByRole('button',{name:'刷新备份列表',exact:true}).click();await page.getByRole('button',{name:nativeName,exact:true}).click();await expect(page.getByRole('alert')).toContainText('空间不足');await expect.poll(()=>temporaryFiles(page)).toBe(1);await page.reload();remote.stats.oversize=true;await page.getByRole('button',{name:'刷新备份列表',exact:true}).click();await page.getByRole('button',{name:nativeName,exact:true}).click();await expect(page.getByRole('alert')).toContainText('20 GB');await expect.poll(()=>temporaryFiles(page)).toBe(1);await xp(page);await page.goto('/piclex-web/#/settings/data');await expect(page.getByRole('button',{name:'已拍照片 1',exact:true})).toBeVisible();});
test('cancel download and upload removes only operation files and keeps photos and progress',async({page})=>{const remote=await server(page);await connect(page);await restore(page);remote.stats.slow=true;await page.goto('/piclex-web/#/settings/data/webdav/restore');await page.getByRole('button',{name:'刷新备份列表',exact:true}).click();await page.getByRole('button',{name:nativeName,exact:true}).click();await page.getByRole('button',{name:'取消',exact:true}).click();await expect(page.getByRole('alert')).toContainText('取消');await expect.poll(()=>temporaryFiles(page)).toBe(1);remote.stats.slow=false;remote.stats.slowPut=true;await page.goto('/piclex-web/#/settings/data/webdav');await page.getByRole('button',{name:'创建完整备份',exact:true}).click();await expect.poll(()=>remote.requests.some(r=>r.method==='PUT')).toBe(true);await page.getByRole('button',{name:'取消',exact:true}).click();await expect(page.getByRole('alert')).toContainText('取消');await expect.poll(()=>remote.requests.filter(r=>r.method==='DELETE').length).toBe(1);await expect.poll(()=>temporaryFiles(page)).toBe(1);expect([...remote.directories].some(p=>p.includes('.complete-uploading-'))).toBe(false);expect(remote.files.has(root+nativeName+'/photos.piclexdeck')).toBe(true);await xp(page);});

test('conservative storage estimates do not reject valid backups',async({page})=>{await server(page);await connect(page);await page.evaluate(()=>Object.defineProperty(Object.getPrototypeOf(navigator.storage),'estimate',{configurable:true,value:async()=>({usage:1,quota:2})}));await restore(page);await xp(page);await page.goto('/piclex-web/#/settings/data');await expect(page.getByRole('button',{name:'已拍照片 1',exact:true})).toBeVisible();});


test('automatic progress imports native XP without photos and unchanged sync never uploads a deck',async({page})=>{
 const remote=await server(page);const name=remote.putProgress(progress);
 await connect(page);await page.goto('/piclex-web/#/settings/data/webdav');
 await expect(page.getByText('等级与学习进度已自动同步',{exact:true})).toBeVisible({timeout:20000});
 await xp(page);await page.goto('/piclex-web/#/settings/data');
 await expect(page.getByRole('button',{name:'已拍照片 0',exact:true})).toBeVisible();
 expect(remote.requests.filter(r=>r.method==='GET').every(r=>r.path.startsWith(root+'progress/'))).toBe(true);
 expect(remote.requests.some(r=>r.method==='PUT')).toBe(false);
 const count=remote.requests.length;
 await page.evaluate(()=>window.dispatchEvent(new Event('online')));
 await expect.poll(()=>remote.requests.slice(count).some(r=>r.method==='GET'&&r.path.endsWith(name))).toBe(true);
 await xp(page);expect(remote.requests.some(r=>r.method==='PUT')).toBe(false);
});

test('automatic progress merges offline web and native receipts once and retries failed uploads',async({page})=>{
 const remote=await server(page);remote.putProgress(progress);
 await connect(page);await page.goto('/piclex-web/#/settings/data/webdav');
 await expect(page.getByText('等级与学习进度已自动同步',{exact:true})).toBeVisible({timeout:20000});
 remote.stats.failPut=true;
 // Simulate an already committed offline reading receipt, then a connectivity event.
 await page.evaluate(async()=>{
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('piclex-web-experience-v1');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  await new Promise<void>((resolve,reject)=>{const t=db.transaction('events','readwrite');t.objectStore('events').put({id:'offline-reading',kind:'reading',credit:3,wordCount:3,at:Date.now()});t.oncomplete=()=>resolve();t.onerror=()=>reject(t.error);});db.close();
  window.dispatchEvent(new Event('piclex-experience'));
  window.dispatchEvent(new Event('online'));
 });
 await expect(page.getByText('WebDAV 存储空间不足。',{exact:true})).toBeVisible();
 remote.stats.failPut=false;await page.evaluate(()=>window.dispatchEvent(new Event('online')));
 await expect(page.getByText('等级与学习进度已自动同步',{exact:true})).toBeVisible();
 const outputs=[...remote.files].filter(([p])=>p.startsWith(root+'progress/')&&p.endsWith('.json'));
 expect(outputs).toHaveLength(2);
 const contents=await Promise.all(outputs.map(([,b])=>decodeProgress(new Uint8Array(b))));
 const original=await decodeProgress(new Uint8Array(progress));
 expect(contents.some(c=>c.readingEvents?.length===2&&c.events.length===original.events.length&&c.events[0].id===original.events[0].id)).toBe(true);
 await page.goto('/piclex-web/#/settings/level');await expect(page.locator('.level-page')).toContainText('共 8 经验');
 const puts=remote.requests.filter(r=>r.method==='PUT').length;
 await page.evaluate(()=>window.dispatchEvent(new Event('online')));
 await page.goto('/piclex-web/#/settings/data/webdav');await expect(page.getByText('等级与学习进度已自动同步',{exact:true})).toBeVisible({timeout:20000});
 expect(remote.requests.filter(r=>r.method==='PUT')).toHaveLength(puts);
 expect(remote.requests.filter(r=>r.method==='GET').every(r=>r.path.startsWith(root+'progress/'))).toBe(true);
});

test('automatic progress merges concurrent native snapshots and opt out stops transfers',async({page})=>{
 const remote=await server(page);remote.putProgress(progress);
 const content=await decodeProgress(new Uint8Array(progress));
 const branch={progress:[],memories:[],events:[],readingEvents:[{id:'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA',completedAt:Date.now(),wordCount:2,experience:3}]};
 remote.putProgress(Buffer.from(JSON.stringify(await encodeProgress(branch))));
 await connect(page);await page.goto('/piclex-web/#/settings/data/webdav');
 await expect(page.getByText('等级与学习进度已自动同步',{exact:true})).toBeVisible({timeout:20000});
 await page.goto('/piclex-web/#/settings/level');await expect(page.locator('.level-page')).toContainText('共 8 经验');
 await page.goto('/piclex-web/#/settings/data/webdav');await page.getByRole('checkbox',{name:'自动同步等级与学习进度'}).uncheck();
 const before=remote.requests.length;await page.evaluate(()=>window.dispatchEvent(new Event('online')));
 await expect(page.getByText('学习进度自动同步已关闭',{exact:true})).toBeVisible();expect(remote.requests).toHaveLength(before);
 const outputs=[...remote.files].filter(([p])=>p.startsWith(root+'progress/')&&p.endsWith('.json'));
 expect(outputs).toHaveLength(3);
 expect(remote.requests.some(r=>r.path.endsWith('.piclexdeck'))).toBe(false);
});

test('corrupt standalone progress is rejected without publishing or replacing local records',async({page})=>{
 const remote=await server(page);const bad=JSON.parse(progress.toString());bad.content.progress[0].attempts+=1;remote.putProgress(Buffer.from(JSON.stringify(bad)));
 await connect(page);await page.goto('/piclex-web/#/settings/data/webdav');
 await expect(page.getByText(/学习进度.*校验/)).toBeVisible({timeout:20000});
 expect(remote.requests.some(r=>r.method==='PUT'||r.method==='DELETE')).toBe(false);
 await page.goto('/piclex-web/#/settings/level');await expect(page.locator('.level-page')).toContainText('共 0 经验');
});


test('deck positions receive native anchors without changing XP and defer while typing',async({page})=>{
 const remote=await server(page);remote.putProgress(progress);
 const catalog=JSON.parse(fs.readFileSync('apps/public/public/library/catalog.json','utf8')),card=catalog[0],deck={...JSON.parse(fs.readFileSync('apps/public/public/'+card.payload,'utf8')),id:card.id};
 const row={deck:'deck:'+card.id.toLowerCase(),...positionAnchor(deck,{index:3}),updatedAt:Date.now(),revision:'11111111-1111-4111-8111-111111111111'};
 await remote.putPositions([row]);await connect(page);await page.goto('/piclex-web/#/settings/data/webdav');await expect(page.getByText('等级与学习进度已自动同步',{exact:true})).toBeVisible({timeout:20000});
 await xp(page);await page.goto('/piclex-web/#/deck/'+card.id);await expect.poll(()=>new URLSearchParams(page.url().split('?')[1]).get('word')).toBe(deck.words[3].id);
 const input=page.getByRole('textbox',{name:'输入英文',exact:true});await input.pressSequentially(deck.words[3].english.slice(0,1));const typed=await input.inputValue();
 const next={...row,...positionAnchor(deck,{index:6}),updatedAt:row.updatedAt+1000,revision:'22222222-2222-4222-8222-222222222222'};
 await remote.putPositions([next]);await page.evaluate(()=>window.dispatchEvent(new Event('online')));
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('piclex-web.deck-positions.v1')!).positions[0].revision)).toBe(next.revision);
 expect(new URLSearchParams(page.url().split('?')[1]).get('word')).toBe(deck.words[3].id);await expect(input).toHaveValue(typed);
 await input.press('ControlOrMeta+a');await input.press('Backspace');await expect(input).toHaveValue('');
 await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await expect.poll(()=>new URLSearchParams(page.url().split('?')[1]).get('word')).toBe(deck.words[6].id);
 await xp(page);expect(remote.requests.some(r=>r.path.endsWith('.piclexdeck'))).toBe(false);
});

test('deck positions publish navigation and a fresh browser resumes the same word',async({page,browser})=>{
 const remote=await server(page);await connect(page);
 const catalog=JSON.parse(fs.readFileSync('apps/public/public/library/catalog.json','utf8')),card=catalog[0],deck={...JSON.parse(fs.readFileSync('apps/public/public/'+card.payload,'utf8')),id:card.id};
 await page.goto('/piclex-web/#/deck/'+card.id);await expect(page.getByRole('textbox',{name:'输入英文',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'选择照片',exact:true}).click();await page.getByRole('button',{name:'照片 2',exact:true}).click();
 const target=deck.words.find((w:any)=>w.imageIndex===1);await expect.poll(()=>new URLSearchParams(page.url().split('?')[1]).get('word')).toBe(target.id);
 await expect.poll(()=>page.evaluate(()=>localStorage.getItem('piclex-web.deck-positions.v1')!==null)).toBe(true);
 await page.evaluate(()=>window.dispatchEvent(new Event('online')));await expect.poll(()=>[...remote.files].filter(([p])=>p.startsWith(root+'positions/')&&p.endsWith('.json')).length).toBeGreaterThan(0);
 const output=[...remote.files].filter(([p])=>p.startsWith(root+'positions/')&&p.endsWith('.json')).at(-1)![1];const rows=decodePositions(new Uint8Array(output));expect(rows[0]).toMatchObject({deck:'deck:'+card.id.toLowerCase(),...positionAnchor(deck,{index:deck.words.indexOf(target)})});
 const other=await browser.newContext({ignoreHTTPSErrors:true});try{const receiver=await other.newPage();await connect(receiver);await receiver.goto('/piclex-web/#/settings/data/webdav');await expect(receiver.getByText('等级与学习进度已自动同步',{exact:true})).toBeVisible({timeout:20000});await receiver.goto('/piclex-web/#/deck/'+card.id);await expect.poll(()=>new URLSearchParams(receiver.url().split('?')[1]).get('word')).toBe(target.id);}finally{await other.close();}
 expect(remote.requests.some(r=>r.path.endsWith('.piclexdeck'))).toBe(false);
});

test('a failed sync worker cannot publish and a fresh worker safely retries',async({page})=>{
 const remote=await server(page);remote.putProgress(progress);
 await page.addInitScript(()=>{const NativeWorker=window.Worker;window.Worker=class extends NativeWorker{
  constructor(url:string|URL,options?:WorkerOptions){super(url,options);if(String(url).includes('progress-worker')&&localStorage.getItem('fixture.worker-recovered')!=='true')setTimeout(()=>this.dispatchEvent(new Event('error')),0);}
 };});
 await connect(page);await page.goto('/piclex-web/#/settings/data/webdav');
 await expect(page.getByText('同步处理未能完成，稍后会自动重试。',{exact:true})).toBeVisible({timeout:20000});
 expect(remote.requests.some(r=>r.method==='PUT')).toBe(false);
 await page.evaluate(()=>{localStorage.setItem('fixture.worker-recovered','true');window.dispatchEvent(new Event('online'));});
 await expect(page.getByText('等级与学习进度已自动同步',{exact:true})).toBeVisible({timeout:20000});
 await xp(page);expect(remote.requests.some(r=>r.method==='PUT')).toBe(false);
});

test('a legacy completion written after sync starts keeps its word and date',async({page})=>{
 const remote=await server(page),at=1600000000000,wordID=photoID+':0',fingerprint='concurrent-legacy',id=`spell:${fingerprint}:0:${wordID}`;
 await page.addInitScript(()=>{
  const NativeWorker=window.Worker;let held=false;
  window.Worker=class extends NativeWorker{
   postMessage(message:any){
    if(message.operation==='collect'&&!held){held=true;(window as any).releaseLegacySync=()=>super.postMessage(message);return;}
    super.postMessage(message);
   }
  };
 });
 await connect(page);
 await expect.poll(()=>page.evaluate(()=>typeof (window as any).releaseLegacySync)).toBe('function');
 await page.evaluate(async({at,wordID,fingerprint,id})=>{
  localStorage.setItem('piclex-web.study.v2.'+fingerprint,JSON.stringify({version:2,fingerprint,round:0,words:{[wordID]:{input:'camera',result:'correct',quickIndices:null}},history:{[wordID]:{mastered:true,mistakes:[]}}}));
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('piclex-web-experience-v1',1);r.onupgradeneeded=()=>{r.result.createObjectStore('events',{keyPath:'id'});r.result.createObjectStore('meta');};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  await new Promise<void>((resolve,reject)=>{const t=db.transaction(['events','meta'],'readwrite');t.objectStore('events').put({id,kind:'spelling',credit:1,at});t.objectStore('meta').put({total:1,statistics:{spelling:1},milestones:[]},'account');t.oncomplete=()=>resolve();t.onerror=()=>reject(t.error);});db.close();
  (window as any).releaseLegacySync();
 },{at,wordID,fingerprint,id});
 await page.goto('/piclex-web/#/settings/data/webdav');await expect(page.getByText('等级与学习进度已自动同步',{exact:true})).toBeVisible();
 const snapshots=[...remote.files].filter(([p])=>p.startsWith(root+'progress/')&&p.endsWith('.json'));expect(snapshots).toHaveLength(1);
 const content=await decodeProgress(new Uint8Array(snapshots[0][1]));expect(content.progress[0]).toMatchObject({wordKey:'camera',attempts:1,lastPracticedAt:at});expect(content.events).toHaveLength(1);expect(content.events[0]).toMatchObject({wordKey:'camera',completedAt:at});
 await page.getByRole('button',{name:'创建完整备份',exact:true}).click();await expect(page.getByText('WebDAV 完整备份完成。',{exact:true})).toBeVisible();
 const folder=[...remote.directories].find(p=>p.startsWith(root+'PicLex-Backup-')&&p!==root+nativeName+'/')!,exported=await decodeProgress(new Uint8Array(remote.files.get(folder+'learning-progress.json')!));
 expect(exported.events).toEqual(content.events);expect(exported.progress).toEqual(content.progress);
 await page.goto('/piclex-web/#/settings/level');await expect(page.locator('.level-page')).toContainText('共 1 经验');
});

test('automatic sync waits for a typing pause and resumes without changing the current answer',async({page})=>{
 const remote=await server(page);remote.putProgress(progress);await connect(page);
 await page.goto('/piclex-web/#/settings/data/webdav');await expect(page.getByText('等级与学习进度已自动同步',{exact:true})).toBeVisible({timeout:20000});
 const catalog=JSON.parse(fs.readFileSync('apps/public/public/library/catalog.json','utf8'));
 await page.goto('/piclex-web/#/deck/'+catalog[0].id);
 const input=page.getByRole('textbox',{name:'输入英文',exact:true});await expect(input).toBeVisible();
 await input.press('z');const answer=await input.inputValue(),url=page.url(),requests=remote.requests.length;
 await page.evaluate(()=>window.dispatchEvent(new Event('online')));
 for(let i=0;i<8;i++){await page.waitForTimeout(200);await input.press('Backspace');await input.press('z');}
 expect(remote.requests.length).toBe(requests);await expect(input).toHaveValue(answer);expect(page.url()).toBe(url);
 await expect.poll(()=>remote.requests.slice(requests).some(r=>r.method==='GET'&&r.path.includes('/progress/')),{timeout:10000}).toBe(true);
 await expect(input).toHaveValue(answer);expect(page.url()).toBe(url);
 await page.goto('/piclex-web/#/settings/data/webdav');await expect(page.getByText('等级与学习进度已自动同步',{exact:true})).toBeVisible({timeout:20000});await xp(page);
});
