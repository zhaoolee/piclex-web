import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const bytes=fs.readFileSync('tests/fixtures/demo/decks/cafe.piclexdeck');
const source='https://decks.example.test/feed.json?token='+('long-source-'.repeat(25));
const entry={deckID:'b121e100-0000-4000-8000-000000000001',author:'PicLex',description:'测试卡组',version:1,photoCount:1,wordCount:6,title:'测试照片卡组',packageURL:'https://decks.example.test/deck.piclexdeck',packageBytes:bytes.length,packageSHA256:createHash('sha256').update(bytes).digest('hex'),access:'public'};
async function open(page:any){await page.getByRole('button',{name:'下载第三方卡组',exact:true}).click();await page.locator('.deck-subscriptions>summary').click();}
async function install(page:any){
 await page.addInitScript(()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async(text:string)=>{(window as any).__copied=text;}}});});
 await page.route(source,(route:any)=>route.fulfill({json:{format:'com.piclex.deck-source',schemaVersion:1,decks:[entry]}}));
 await page.route(entry.packageURL,(route:any)=>route.fulfill({body:bytes,contentType:'application/zip'}));
 await page.goto('/piclex-web/#/learn');await page.getByRole('button',{name:'下载第三方卡组',exact:true}).click();await page.getByRole('textbox',{name:'粘贴卡组 URL'}).fill(source);await page.getByRole('button',{name:'下载卡组',exact:true}).click();await page.getByRole('button',{name:'测试照片卡组 下载',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
}
async function storedSnapshot(page:any){return page.evaluate(async()=>{const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('piclex-web-v1');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});const decks:any[]=await new Promise((resolve,reject)=>{const t=db.transaction('decks','readonly'),r=t.objectStore('decks').getAll();t.oncomplete=()=>resolve(r.result);t.onerror=()=>reject(t.error);});db.close();return Promise.all(decks.map(async d=>({...d,bytes:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',d.bytes)))})));});}

test('links collapse, copy feedback, confirmation and persistent cancellation preserve downloaded bytes and draft',async({page},info)=>{
 await page.setViewportSize({width:320,height:700});await install(page);await page.getByRole('button',{name:'按键 X',exact:true}).click();const draft=await page.getByRole('textbox',{name:'输入英文',exact:true}).inputValue();const before=await storedSnapshot(page);
 await open(page);const row=page.getByRole('article',{name:entry.title});await expect(row).toBeVisible();await expect(row.locator('.subscription-url')).toHaveCount(0);
 const collapsed=(await row.boundingBox())!.height;await row.getByRole('button',{name:'订阅链接',exact:true}).click();await expect(row.locator('.subscription-url')).toHaveText(source);expect((await row.boundingBox())!.height).toBeGreaterThan(collapsed+60);
 await row.getByRole('button',{name:'订阅链接',exact:true}).click();await row.getByRole('button',{name:`复制${entry.title}的订阅链接`}).click();await expect(row.getByText('已复制',{exact:true})).toBeVisible();expect(await page.evaluate(()=>(window as any).__copied)).toBe(source);
 for(const theme of ['light','dark']){await page.evaluate(theme=>localStorage.setItem('piclex-web.theme',theme),theme);await page.reload();await open(page);await expect(page.locator('html')).toHaveAttribute('data-theme',theme);await page.screenshot({path:info.outputPath(`subscription-${theme}.png`),fullPage:true});expect(await row.evaluate(n=>n.scrollWidth<=n.clientWidth)).toBe(true);}
 await row.getByRole('button',{name:'取消订阅',exact:true}).click();let confirm=page.getByRole('dialog',{name:'取消订阅？',exact:true});await expect(confirm).toContainText(entry.title);await expect(confirm).toContainText('已下载卡片和学习记录会保留');await confirm.getByRole('button',{name:'保留订阅'}).click();await expect(row).toBeVisible();
 await row.getByRole('button',{name:'取消订阅',exact:true}).click();await page.keyboard.press('Escape');await expect(confirm).toHaveCount(0);await expect(row).toBeVisible();
 await row.getByRole('button',{name:'取消订阅',exact:true}).click();await page.screenshot({path:info.outputPath('unsubscribe-confirmation.png'),fullPage:true});await confirm.getByRole('button',{name:'取消订阅',exact:true}).click();await expect(row).toHaveCount(0);expect(await storedSnapshot(page)).toEqual(before);await page.getByRole('button',{name:'关闭',exact:true}).click();await expect(page.getByRole('textbox',{name:'输入英文',exact:true})).toHaveValue(draft);
 await page.reload();await open(page);await expect(page.getByText('暂无订阅',{exact:true})).toBeVisible();expect(await storedSnapshot(page)).toEqual(before);await page.getByRole('textbox',{name:'粘贴卡组 URL'}).fill(source);await page.getByRole('button',{name:'下载卡组',exact:true}).click();await page.getByRole('button',{name:'测试照片卡组 恢复订阅',exact:true}).click();await expect(row).toBeVisible();expect(await storedSnapshot(page)).toEqual(before);
});

test('failed clipboard and storage writes do not falsely confirm or remove a subscription',async({page})=>{
 await install(page);await open(page);const row=page.getByRole('article',{name:entry.title});
 await page.evaluate(()=>{Object.defineProperty(navigator,'clipboard',{value:{writeText:async()=>{throw Error('denied');}}});});await row.getByRole('button',{name:`复制${entry.title}的订阅链接`}).click();await expect(row.getByRole('alert')).toContainText('无法自动复制');await expect(row.locator('.subscription-url')).toBeVisible();
 await page.evaluate(()=>{const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(value,...args){if(this.name==='subscriptions'&&!value.active)throw new DOMException('quota','QuotaExceededError');return put.call(this,value,...args);};});
 await row.getByRole('button',{name:'取消订阅',exact:true}).click();const confirm=page.getByRole('dialog',{name:'取消订阅？',exact:true});await confirm.getByRole('button',{name:'取消订阅',exact:true}).click();await expect(confirm.getByRole('alert')).toContainText('订阅状态未能保存');expect(await page.evaluate(async()=>{const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('piclex-web-v1');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});try{return await new Promise((resolve,reject)=>{const r=db.transaction('subscriptions','readonly').objectStore('subscriptions').getAll();r.onsuccess=()=>resolve(r.result[0].active);r.onerror=()=>reject(r.error);});}finally{db.close();}})).toBe(true);await confirm.getByRole('button',{name:'保留订阅'}).click();await expect(row).toBeVisible();
});
