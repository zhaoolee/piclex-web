import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {chromium,webkit,expect} from '@playwright/test';
import {startWebDAV} from './webdav-server.mjs';

const [browserName,baseURL,output,channel='chrome']=process.argv.slice(2);
if(!['chromium','webkit'].includes(browserName)||!baseURL||!output)throw Error('Expected browser, URL and test output directory');
const mib=Number(process.env.PICLEX_LARGE_TEST_MIB||128),root=path.join(output,'server'),profile=path.join(output,'profile'),cert=path.join(output,'tls');
fs.mkdirSync(path.join(root,'PicLex'),{recursive:true});
execFileSync('python3',['tests/support/make-large-backup.py',path.join(root,'PicLex'),String(mib)]);
const fixture=JSON.parse(fs.readFileSync(path.join(root,'PicLex/fixture.json'),'utf8'));fs.unlinkSync(path.join(root,'PicLex/fixture.json'));
execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',cert+'.key','-out',cert+'.crt','-subj','/CN=127.0.0.1','-addext','subjectAltName=IP:127.0.0.1','-days','1'],{stdio:'ignore'});
const remote=await startWebDAV(root,cert);
const context=await (browserName==='webkit'?webkit:chromium).launchPersistentContext(profile,{...(browserName==='chromium'&&channel!=='chromium'?{channel}:{}),headless:true,args:browserName==='chromium'||process.platform==='darwin'?['--mute-audio']:[],ignoreHTTPSErrors:true,viewport:{width:390,height:844}});
const page=await context.newPage(),errors=[],observations=[];page.on('pageerror',e=>errors.push(e.message));
// This is a data/transport stress test. Native mouse/touch activation is covered
// separately by webdav-backup.spec.ts; use DOM button activation here so input
// delivery in a persistent automation window cannot hide a transfer failure.
async function activate(button){await expect(button).toBeEnabled();await button.evaluate(node=>node.click());}
const visit=route=>page.goto(new URL('/piclex-web/#/settings/'+route,baseURL).href);
async function choose(name){await visit('data/webdav/restore');await activate(page.getByRole('button',{name:'刷新备份列表',exact:true}));await activate(page.getByRole('button',{name,exact:true}));await page.getByRole('button',{name:'恢复照片和学习进度',exact:true}).or(page.getByRole('alert')).first().waitFor({timeout:15*60000});if(await page.getByRole('alert').count())throw Error(await page.getByRole('alert').first().innerText());}
async function commit(){
 // Restore reloads the document. A missing dialog can be the transient empty
 // page, so wait for that navigation before issuing the next route change.
 await Promise.all([page.waitForEvent('domcontentloaded',{timeout:60000}),activate(page.getByRole('button',{name:'恢复照片和学习进度',exact:true}))]);
 await expect(page.getByRole('heading',{name:'恢复备份',exact:true})).toBeVisible();
 await expect(page.locator('dialog')).toHaveCount(0);
}
let passed=false;const started=Date.now();
const status=setInterval(()=>console.log('TRANSFER_BYTES',JSON.stringify(remote.stats)),30000);
try{
 console.log('LARGE_FIXTURE',fixture);
 await visit('data/webdav/connection');await page.getByLabel('服务器地址',{exact:true}).fill(remote.url);await page.getByLabel('账号',{exact:true}).fill('fixture');await page.getByLabel('密码',{exact:true}).fill('fixture');await activate(page.getByRole('button',{name:'保存并连接',exact:true}));await page.getByText('连接成功',{exact:true}).waitFor();
 await choose('PicLex-Backup-large');await commit();observations.push({phase:'restore',ms:Date.now()-started});
 await visit('data');await page.getByRole('button',{name:`已拍照片 ${fixture.count}`,exact:true}).waitFor();
 await page.goto(new URL('/piclex-web/#/deck/local-backup-'+fixture.firstID,baseURL).href);await page.getByRole('heading',{name:'相机',exact:true}).waitFor();
 await visit('level');await expect(page.locator('.level-page')).toContainText('共 5 经验');
 await visit('data/webdav');const upload=Date.now();await activate(page.getByRole('button',{name:'创建完整备份',exact:true}));await page.getByText('WebDAV 完整备份完成。',{exact:true}).waitFor({timeout:15*60000});observations.push({phase:'upload-and-readback',ms:Date.now()-upload});
 const name=fs.readdirSync(path.join(root,'PicLex')).find(n=>n.startsWith('PicLex-Backup-')&&n!=='PicLex-Backup-large');expect(name).toBeTruthy();const saved=path.join(root,'PicLex',name);
 const result=JSON.parse(execFileSync('python3',['tests/support/verify-large-backup.py',saved],{encoding:'utf8'}));expect(result.photoCount).toBe(fixture.count);expect(result.imageSHA256).toBe(fixture.imageSHA256);expect(result.zip64).toBe(fixture.archiveBytes>0xffffffff);
 if(process.env.PICLEX_NATIVE_ZIP_CHECK){const native=execFileSync(process.env.PICLEX_NATIVE_ZIP_CHECK,[path.join(saved,'photos.piclexdeck')],{encoding:'utf8'});fs.writeFileSync(path.join(output,'native-zip-check.txt'),native);console.log('NATIVE_ZIP_VERIFIED',native);}
 console.log('LARGE_UPLOAD',result);await choose(name);await commit();await visit('data');await page.getByRole('button',{name:`已拍照片 ${fixture.count}`,exact:true}).waitFor();
 const records=await page.evaluate(async started=>{const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('piclex-web-v1');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});const rows=await new Promise((resolve,reject)=>{const r=db.transaction('backupPhotos').objectStore('backupPhotos').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});db.close();const root=await navigator.storage.getDirectory(),transfers=await root.getDirectoryHandle('piclex-backup-transfers');let files=0;for await(const [name,dir]of transfers.entries())if(Number(name.split('-')[1])>=started)for await(const _ of dir.entries())files++;return{count:rows.length,referenced:rows.filter(p=>p.imageRef&&!p.image).length,files};},started);
 expect(records.referenced).toBe(fixture.count);expect(records.files).toBe(fixture.count);expect(errors).toEqual([]);
 const report={mib,fixture,result,records,observations,received:remote.stats.received,sent:remote.stats.sent,browser:await page.evaluate(()=>navigator.userAgent)};fs.writeFileSync(path.join(output,'large-report.json'),JSON.stringify(report,null,2));console.log('LARGE_PASSED',report);passed=true;
}finally{
 clearInterval(status);if(!passed){await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});fs.writeFileSync(path.join(output,'failure.txt'),await page.locator('body').innerText().catch(()=>''));}await page.evaluate(async started=>{const root=await navigator.storage.getDirectory(),parent=await root.getDirectoryHandle('piclex-backup-transfers');const names=[];for await(const [name]of parent.entries())if(/^job-\d+-[\da-f-]+$/.test(name)&&Number(name.split('-')[1])>=started)names.push(name);for(const name of names)await parent.removeEntry(name,{recursive:true});},started).catch(()=>{});await context.close();await remote.close();fs.rmSync(profile,{recursive:true,force:true});fs.rmSync(root,{recursive:true,force:true});fs.rmSync(cert+'.key',{force:true});fs.rmSync(cert+'.crt',{force:true});
}
