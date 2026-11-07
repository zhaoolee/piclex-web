import {expect} from '@playwright/test';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const bytes=fs.readFileSync('tests/fixtures/demo/decks/cafe.piclexdeck');
export const source='https://decks.example.test/feed.json?token='+('long-source-'.repeat(25));
export const entry={deckID:'b121e100-0000-4000-8000-000000000001',author:'PicLex',description:'测试卡组',version:1,photoCount:1,wordCount:6,title:'测试照片卡组',packageURL:'https://decks.example.test/deck.piclexdeck',packageBytes:bytes.length,packageSHA256:createHash('sha256').update(bytes).digest('hex'),access:'public'};
export async function open(page:any){await page.getByRole('button',{name:'下载第三方卡组',exact:true}).click();await page.locator('.deck-subscriptions>summary').click();}
export async function install(page:any){
 await page.addInitScript(()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async(text:string)=>{(window as any).__copied=text;}}});});
 await page.route(source,(route:any)=>route.fulfill({json:{format:'com.piclex.deck-source',schemaVersion:1,decks:[entry]}}));
 await page.route(entry.packageURL,(route:any)=>route.fulfill({body:bytes,contentType:'application/zip'}));
 await page.goto('/piclex-web/#/learn');await page.getByRole('button',{name:'下载第三方卡组',exact:true}).click();await page.getByRole('textbox',{name:'粘贴卡组 URL'}).fill(source);await page.getByRole('button',{name:'下载卡组',exact:true}).click();await page.getByRole('button',{name:'测试照片卡组 下载',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
}
export async function storedSnapshot(page:any){return page.evaluate(async()=>{const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('piclex-web-v1');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});const decks:any[]=await new Promise((resolve,reject)=>{const t=db.transaction('decks','readonly'),r=t.objectStore('decks').getAll();t.oncomplete=()=>resolve(r.result);t.onerror=()=>reject(t.error);});db.close();return Promise.all(decks.map(async d=>({...d,bytes:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',d.bytes)))})));});}

