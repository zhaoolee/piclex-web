import {test,expect,type Page} from '@playwright/test';
import fs from 'node:fs';
import {resolve} from 'node:path';
import {fillSpelling} from './helpers/spelling';
const catalog=JSON.parse(fs.readFileSync('apps/public/public/library/catalog.json','utf8')),card=catalog[0],deck=JSON.parse(fs.readFileSync('apps/public/public/'+card.payload,'utf8'));
const parameters=(url:string)=>new URLSearchParams(url.split('?').at(-1));
// Serve the same production build HTML from disk so Linux WebKit's document
// transport and a fetch/fulfill round trip cannot race the navigation; browser URL,
// JavaScript, photos and every other request still come from the real server.
test.beforeEach(async({context,browserName})=>{if(browserName==='webkit')await context.route('**/piclex-web/',route=>route.fulfill({path:resolve('dist/index.html')}));});
test.afterEach(async({context})=>{await context.unrouteAll({behavior:'wait'});});
test('startup navigation before the first hash subscription is not lost',async({page})=>{
 await page.addInitScript(()=>{
  const add=window.addEventListener.bind(window);let moved=false;
  window.addEventListener=((type:string,listener:any,options:any)=>{
   if(type==='hashchange'&&!moved){moved=true;const oldURL=location.href;history.replaceState(null,'','#/settings/about');window.dispatchEvent(new HashChangeEvent('hashchange',{oldURL,newURL:location.href}));}
   add(type,listener,options);
  }) as typeof window.addEventListener;
 });
 await page.goto('/piclex-web/#/decks');
 await expect(page).toHaveURL(/#\/settings\/about$/);
 await expect(page.getByRole('heading',{name:'关于',exact:true})).toBeVisible();
});
async function photoHash(page:Page){await expect(page.locator('.photo-browse img')).toBeVisible();return page.locator('.photo-browse img').evaluate(async(image)=>{const data=await (await fetch((image as HTMLImageElement).src)).arrayBuffer();return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data))).map(n=>n.toString(16).padStart(2,'0')).join('');});}
test('share restores module, photo and sentence in a fresh browser without sender progress',async({page,browser})=>{
 await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async(text:string)=>{(window as any).__shared=text;}}}));
 await page.goto('/piclex-web/#/deck/'+card.id);const input=page.getByRole('textbox',{name:'输入英文',exact:true});await expect(input).toBeVisible();
 const draft=deck.words[0].english.slice(0,1);await fillSpelling(page,draft);const spellingURL=page.url();const history=await page.evaluate(()=>window.history.length);
 await page.getByRole('tab',{name:'练听力',exact:true}).click();await page.getByLabel('句子练习模式').selectOption('listening');
 await page.getByRole('button',{name:'选择照片',exact:true}).click();await page.getByRole('button',{name:'照片 2',exact:true}).click();
 await expect.poll(()=>parameters(page.url()).get('photo')).toBe('2');await page.getByRole('button',{name:'下一句',exact:true}).click();
 const shared=page.url(),text=await page.locator('.listening-sentence').innerText(),photo=await photoHash(page);
 expect(parameters(shared).get('module')).toBe('listening');expect(parameters(shared).get('mode')).toBe('listening');expect(parameters(shared).get('word')).toBeTruthy();expect(await page.evaluate(()=>window.history.length)).toBe(history);
 await page.getByRole('button',{name:'选择照片',exact:true}).click();await page.getByRole('button',{name:'分享卡组',exact:true}).click();expect(await page.evaluate(()=>(window as any).__shared)).toBe(shared);await page.getByRole('button',{name:'关闭',exact:true}).click();
 const clean=await browser.newContext();try{const receiver=await clean.newPage();await receiver.goto(shared);await expect(receiver.getByRole('tab',{name:'练听力',exact:true})).toHaveAttribute('aria-selected','true');await expect(receiver.locator('.listening-sentence')).toHaveText(text);expect(await photoHash(receiver)).toBe(photo);await expect(receiver.getByRole('button',{name:'播放',exact:true})).toBeVisible();await receiver.goto(spellingURL);await expect(receiver.getByRole('textbox',{name:'输入英文',exact:true})).toHaveValue('');}finally{await clean.close();}
 await page.reload();await expect(page.locator('.listening-sentence')).toHaveText(text);await page.getByRole('button',{name:'设置',exact:true}).click();await page.goBack();await expect(page.locator('.listening-sentence')).toHaveText(text);
 await page.goto(spellingURL);await expect(input).toHaveValue(draft);
});
test('same-deck links and refresh restore dictation difficulty, legacy links still open, invalid locations recover',async({page})=>{
 await page.goto('/piclex-web/#/deck/'+card.id+'?module=listening&mode=free&difficulty=easy&photo=2');
 await expect(page.getByLabel('听写难度')).toHaveValue('easy');await expect.poll(()=>parameters(page.url()).get('photo')).toBe('2');
 await page.getByLabel('听写难度').selectOption('medium');await expect.poll(()=>parameters(page.url()).get('difficulty')).toBe('medium');await page.reload();await expect(page.getByLabel('听写难度')).toHaveValue('medium');
 await page.evaluate(id=>{location.hash=`/deck/${id}?module=speaking&photo=3`;},card.id);await expect(page.getByRole('tab',{name:'练口语',exact:true})).toHaveAttribute('aria-selected','true');await expect.poll(()=>parameters(page.url()).get('photo')).toBe('3');
 await page.goto('/piclex-web/#/deck/'+card.id);await expect(page.locator('.native-header')).toBeVisible();await expect.poll(()=>parameters(page.url()).get('photo')).toBe('3');
 await page.goto('/piclex-web/#/deck/'+card.id+'?module=invalid&photo=99999999&word=missing&sentence=-1');await expect(page.locator('.native-header')).toBeVisible();await expect.poll(()=>parameters(page.url()).get('photo')).toBe('3');
});
test('opening a link to an already completed spelling starts a writable new attempt',async({page})=>{
 const first=deck.words[0],second=deck.words[1],input=page.getByRole('textbox',{name:'输入英文',exact:true});
 await page.goto('/piclex-web/#/deck/'+card.id);
 await fillSpelling(page,first.english);
 await expect(page.getByRole('heading',{name:second.chinese,exact:true})).toBeVisible();
 const link=`/piclex-web/#/deck/${card.id}?module=spelling&photo=${first.imageIndex+1}&word=${encodeURIComponent(first.id)}`;
 await page.goto(link);await expect(page.getByRole('heading',{name:first.chinese,exact:true})).toBeVisible();
 await expect(input).toHaveValue('');await expect(page.getByRole('button',{name:'不认识'})).toBeEnabled();
 await fillSpelling(page,first.english.slice(0,1));await expect(input).toHaveValue(first.english.slice(0,1));
});
test('an incoming learning link wins over a pending local module update',async({page})=>{
 await page.goto('/piclex-web/#/deck/'+card.id);
 await expect(page.getByRole('textbox',{name:'输入英文',exact:true})).toBeVisible();
 const target=`/deck/${card.id}?module=listening&mode=free&difficulty=easy&photo=2`;
 // Both actions precede the queued hashchange: React must not write the older
 // tab state over the incoming link while committing the local interaction.
 await page.evaluate(hash=>{
  location.hash=hash;
  (Array.from(document.querySelectorAll<HTMLElement>('[role=tab]')).find(tab=>tab.textContent?.includes('练口语'))!).click();
 },target);
 await expect(page.getByRole('tab',{name:'练听力',exact:true})).toHaveAttribute('aria-selected','true');
 await expect(page.getByLabel('听写难度')).toHaveValue('easy');
 await expect.poll(()=>parameters(page.url()).get('photo')).toBe('2');
 await page.reload();
 await expect(page.getByLabel('听写难度')).toHaveValue('easy');
});
