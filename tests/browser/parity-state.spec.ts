import {evidenceScreenshot} from './helpers/parity-evidence';
import {test,expect,type Page} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {fillEnglish,fillSpelling} from './helpers/spelling';
const catalog=JSON.parse(fs.readFileSync('apps/public/public/library/catalog.json','utf8')),publicCard=catalog[0];
const cafeLastSentence='The table is made of dark wood.';
const tabs=(page:Page)=>page.getByRole('navigation',{name:'底部导航'});
const modeOf=(page:Page)=>page.getByLabel('句子练习模式',{exact:true});
const completion=(page:Page)=>page.getByRole('heading',{name:'本轮句子练习完成',exact:true});
async function importCafe(page:Page){
 await page.goto('/piclex-web/#/decks');
 await expect(page.getByRole('button',{name:'导入自己的卡组',exact:true})).toBeEnabled();
 await page.getByLabel('选择照片卡组文件').setInputFiles(path.resolve('tests/fixtures/demo/decks/cafe.piclexdeck'));
 await expect(page.getByRole('heading',{name:'牛角包',exact:true})).toBeVisible();
}
async function fillGuided(page:Page,sentence:string){
 for(const [index,word] of sentence.split(/\s+/).entries())await fillEnglish(page.locator('.guided-input input').nth(index),word.replace(/[^\p{L}\p{N}]/gu,''));
}
async function finishAssisted(page:Page,count:number){
 for(let i=0;i<count;i++){
  await page.getByRole('button',{name:'听不懂',exact:true}).click();
  await page.getByRole('button',{name:'下一个',exact:true}).click();
 }
}
async function experienceTotal(page:Page){
 return page.evaluate(async()=>{
  const request=indexedDB.open('piclex-web-experience-v1',1);
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  try{return await new Promise<number>((resolve,reject)=>{const t=db.transaction('meta','readonly'),r=t.objectStore('meta').get('account');t.oncomplete=()=>resolve(r.result?.total||0);t.onerror=()=>reject(t.error);});}
  finally{db.close();}
 });
}

test('a warm Learning entry is one-shot and never overrides an explicit listening link',async({page})=>{
 await importCafe(page);
 const spelling=page.getByRole('textbox',{name:'输入英文',exact:true});
 await page.getByRole('tab',{name:'练听力',exact:true}).click();
 await modeOf(page).selectOption('free');await expect(page.getByLabel('听写难度')).toHaveCount(0);
 await fillEnglish(page.locator('.guided-input input').nth(0),'I');await fillEnglish(page.locator('.guided-input input').nth(1),'like');
 const listeningHash=await page.evaluate(()=>location.hash);
 const [deckPath,query]=listeningHash.split('?'),parameters=new URLSearchParams(query||'');
 const deckID=decodeURIComponent(deckPath.replace(/^#\/deck\//,''));
 const explicit=`${deckPath}?module=listening&mode=free&difficulty=easy&photo=${parameters.get('photo')||'1'}&word=${encodeURIComponent(parameters.get('word')||'')}`;
 // Same deck and the same hash: no hashchange can carry the Learning intent.
 await page.evaluate(hash=>{location.hash=hash;},deckPath);
 await expect(page.getByRole('tab',{name:'练听力',exact:true})).toHaveAttribute('aria-selected','true');
 await tabs(page).getByRole('button',{name:'学习',exact:true}).click();
 await expect(page.getByRole('tab',{name:'拼单词',exact:true})).toHaveAttribute('aria-selected','true');
 await expect(spelling).toBeVisible();
 // A consumed intent must not exhaust later Learning requests in the same session.
 await page.getByRole('tab',{name:'练听力',exact:true}).click();
 await expect(page.getByRole('tab',{name:'练听力',exact:true})).toHaveAttribute('aria-selected','true');
 await tabs(page).getByRole('button',{name:'学习',exact:true}).click();
 await expect(page.getByRole('tab',{name:'拼单词',exact:true})).toHaveAttribute('aria-selected','true');
 // Leave the warm session, then reopen the same deck from an explicit listening URL.
 await tabs(page).getByRole('button',{name:'设置',exact:true}).click();
 await page.evaluate(hash=>{location.hash=hash;},explicit);
 await expect(page.getByRole('tab',{name:'练听力',exact:true})).toHaveAttribute('aria-selected','true');
 await expect(modeOf(page)).toHaveValue('free');
 await expect(page.locator('.guided-input')).toBeVisible();await expect(page.getByLabel('听写难度')).toHaveCount(0);
 await expect(page.locator('.guided-input input').nth(0)).toHaveValue('I');await expect(page.locator('.guided-input input').nth(1)).toHaveValue('like');
 expect(await page.evaluate(()=>location.hash)).toContain(deckID);
 if(test.info().project.name==='mobile')await evidenceScreenshot(page,'/01-listening-link.png');
});

test('finished dictation offers challenge, another round and word learning without losing spelling drafts',async({page})=>{
 await importCafe(page);
 const spelling=page.getByRole('textbox',{name:'输入英文',exact:true});
 await fillSpelling(page,'cr');
 await page.getByRole('tab',{name:'练听力',exact:true}).click();
 await modeOf(page).selectOption('chunks');
 await finishAssisted(page,6);
 await expect(completion(page)).toBeVisible();
 const challenge=page.getByRole('button',{name:'挑战这句自由听写',exact:true});
 const restart=page.getByRole('button',{name:'再听写一轮',exact:true});
 const learn=page.locator('.native-completion').getByRole('button',{name:'返回单词学习',exact:true});
 await expect(challenge).toBeVisible();await expect(restart).toBeVisible();await expect(learn).toBeVisible();
 if(test.info().project.name==='mobile')await evidenceScreenshot(page,'/05-dictation-restart.png');
 await learn.click();
 await expect(page.getByRole('tab',{name:'拼单词',exact:true})).toHaveAttribute('aria-selected','true');
 await expect.poll(()=>page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('piclex-web.study.v2.')).some(k=>Object.values(JSON.parse(localStorage.getItem(k)!).words||{}).some((d:any)=>d.input==='cr')))).toBe(true);
 await page.getByRole('tab',{name:'练听力',exact:true}).click();
 await expect(completion(page)).toBeVisible();
 await challenge.click();
 await expect(completion(page)).toHaveCount(0);
 await expect(modeOf(page)).toHaveValue('free');
 const dictation=page.locator('.guided-input input');
 await expect(dictation.first()).toHaveValue('');
 await page.getByRole('button',{name:'听不懂',exact:true}).click();
 await expect(dictation.first()).toHaveValue('The');await expect(dictation.nth(1)).toHaveValue('table');
 await page.getByRole('button',{name:'下一个',exact:true}).click();
 await expect(completion(page)).toBeVisible();
 await expect(challenge).toHaveCount(0);
 await restart.click();
 await expect(completion(page)).toHaveCount(0);
 await expect(modeOf(page)).toHaveValue('free');
 await expect(dictation.first()).toHaveValue('');
 await page.getByRole('tab',{name:'拼单词',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('piclex-web.study.v2.')).some(k=>Object.values(JSON.parse(localStorage.getItem(k)!).words||{}).some((d:any)=>d.input==='cr')))).toBe(true);
});

test('another dictation round preserves reward dedupe identity and spelling history',async({page})=>{
 await importCafe(page);
 const spelling=page.getByRole('textbox',{name:'输入英文',exact:true});
 await fillSpelling(page,'cr');
 await page.getByRole('tab',{name:'练听力',exact:true}).click();
 await modeOf(page).selectOption('free');await expect(page.getByLabel('听写难度')).toHaveCount(0);
 await finishAssisted(page,5);
 const dictation=page.locator('.guided-input input');
 await expect(dictation.first()).toHaveValue('');
 await fillGuided(page,cafeLastSentence);
 await expect(completion(page)).toBeVisible();
 await expect.poll(()=>experienceTotal(page)).toBeGreaterThan(0);
 const total=await experienceTotal(page);
 await page.getByRole('button',{name:'再听写一轮',exact:true}).click();
 await expect(completion(page)).toHaveCount(0);
 await expect(dictation.first()).toHaveValue('');
 await fillGuided(page,cafeLastSentence);
 await expect(completion(page)).toBeVisible();
 await page.waitForTimeout(300);
 expect(await experienceTotal(page)).toBe(total);
 await page.getByRole('tab',{name:'拼单词',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('piclex-web.study.v2.')).some(k=>Object.values(JSON.parse(localStorage.getItem(k)!).words||{}).some((d:any)=>d.input==='cr')))).toBe(true);
});

test('F05 selecting the completed photo opens an editable fresh dictation',async({page})=>{
 await importCafe(page);await page.getByRole('tab',{name:'练听力'}).click();await modeOf(page).selectOption('chunks');await finishAssisted(page,6);await expect(completion(page)).toBeVisible();await page.getByRole('button',{name:'选择照片',exact:true}).click();await page.getByRole('button',{name:'照片 1',exact:true}).click();await expect(completion(page)).toHaveCount(0);const chunk=page.locator('.chunk-bank button').first();await expect(chunk).toBeEnabled();await chunk.click();await expect(page.locator('.chunk-answer button').first()).toBeEnabled();
});
