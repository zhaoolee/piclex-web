import {test,expect,type Page} from '@playwright/test';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {fillEnglish} from './helpers/spelling';
const catalog=JSON.parse(fs.readFileSync('apps/public/public/library/catalog.json','utf8'));
test('guided word blanks show readable underlines and preserve typing, reveal and difficulty changes',async({page},info)=>{
 await page.goto('/piclex-web/#/deck/'+catalog.find((deck:{title:string})=>deck.title==='程序员工作英语').id);
 await page.getByRole('tab',{name:'练听力',exact:true}).click();
 await page.getByLabel('句子练习模式',{exact:true}).selectOption('free');
 await page.getByLabel('听写难度',{exact:true}).selectOption('easy');
 const words=page.locator('.guided-word'),fields=words.locator('input');
 await expect(words).toHaveCount(3);
 expect((await words.allTextContents()).join('')).not.toMatch(/[\p{L}\p{N}]/u);
 for(const field of await fields.all()){
  await expect(field).toHaveValue('');await expect(field).toHaveAttribute('readonly','');
 }
 const boxes=await words.evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().toJSON()));
 expect(boxes[0].width).toBe(boxes[1].width);expect(boxes[2].width).toBeGreaterThan(boxes[1].width);
 await fields.first().focus();
 expect(await fields.first().evaluate(el=>getComputedStyle(el).outlineStyle)).toBe('none');
 await page.locator('.photo-focus img').first().waitFor({state:'visible'});
 await page.screenshot({path:info.outputPath('guided-empty.png')});
 const second=fields.nth(1);
 await fillEnglish(second,"im");await expect(second).toHaveValue("im");
 await expect(words.nth(1).locator('.guided-letters')).toHaveText("i'm");
 await expect(words.nth(1).locator('.guided-letters')).toContainText('m');
 await expect(words.nth(1).locator('.bad-letter')).toHaveCount(0);
 await second.focus();await second.press('End');await second.press('Backspace');await expect(second).toHaveValue("i");
 await page.getByLabel('听写难度',{exact:true}).selectOption('medium');
 await expect(fields.nth(1)).toHaveValue("i");
 const equalWidths=await words.evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().width));
 expect(new Set(equalWidths).size).toBe(1);
 await page.getByLabel('听写难度',{exact:true}).selectOption('easy');
 await expect(page.locator('.peek-letter')).toHaveCount(0);
 const peek=words.first();
 // Difficulty changes can still be scrolling the panel into view; a real
 // scroll cancels a hold, so start only after the word's geometry settles.
 await peek.scrollIntoViewIfNeeded();await peek.evaluate(node=>new Promise<void>(resolve=>{let previous='',since=performance.now();const frame=()=>{const b=node.getBoundingClientRect(),next=JSON.stringify([b.x,b.y,b.width,b.height,node.closest('.native-body')?.scrollTop]);if(next!==previous){previous=next;since=performance.now();}if(performance.now()-since>=250)resolve();else requestAnimationFrame(frame);};requestAnimationFrame(frame);}));
 await peek.hover();await page.mouse.down();await expect(page.locator('.word-peek-english')).toHaveText('Hi');await expect(page.locator('.word-peek-meaning')).not.toHaveText('查询中…');
 await page.mouse.up();await expect(page.locator('.word-peek')).toHaveCount(0);
 await peek.hover();await page.mouse.down();await expect(page.locator('.word-peek-english')).toHaveText('Hi');await expect(page.locator('.word-peek-meaning')).not.toHaveText('查询中…');
 await page.mouse.move(5,5);await page.mouse.up();await expect(page.locator('.word-peek')).toHaveCount(0);
 await expect(fields.first()).toHaveValue('');
 await page.getByLabel('听写难度',{exact:true}).selectOption('hard');
 await expect(page.locator('.guided-input')).toHaveCount(0);
 await page.getByLabel('听写难度',{exact:true}).selectOption('easy');
 await expect(fields.nth(1)).toHaveValue("i");
 await page.screenshot({path:info.outputPath('guided-typed.png')});
});
test('long guided words wrap without covering the next word or reserving an icon row',async({page},info)=>{
 const card=catalog[0],deck=JSON.parse(fs.readFileSync('apps/public/public/'+card.payload,'utf8'));
 deck.words[0].example='A pneumonoultramicroscopicsilicovolcanoconiosis appears.';
 const body=JSON.stringify(deck),sha=createHash('sha256').update(body).digest('hex');
 await page.route('**/library/catalog.json',route=>route.fulfill({json:catalog.map((entry:{id:string})=>entry.id===card.id?{...entry,payloadSHA256:sha}:entry)}));
 await page.route('**/'+card.payload,route=>route.fulfill({body,contentType:'application/json'}));
 await page.setViewportSize({width:320,height:568});
 await page.goto('/piclex-web/#/deck/'+card.id);
 await page.getByRole('tab',{name:'练听力',exact:true}).click();
 await page.getByLabel('句子练习模式',{exact:true}).selectOption('free');
 await page.getByLabel('听写难度',{exact:true}).selectOption('easy');
 const words=page.locator('.guided-word');await expect(words).toHaveCount(3);
 const geometry=await words.nth(1).evaluate(el=>{
  const rect=el.getBoundingClientRect(),letters=[...el.querySelectorAll('.guided-letters i')].map(n=>n.getBoundingClientRect());
  return {bottom:Math.max(...letters.map(r=>r.bottom)),right:Math.max(...letters.map(r=>r.right)),left:Math.min(...letters.map(r=>r.left)),wordRight:rect.right,wordLeft:rect.left,wordBottom:rect.bottom,padding:getComputedStyle(el).paddingBottom,rows:new Set(letters.map(r=>r.top)).size};
 });
 expect(geometry.rows).toBeGreaterThan(1);expect(geometry.bottom).toBeLessThanOrEqual(geometry.wordBottom);expect(geometry.padding).toBe('0px');await expect(page.locator('.peek-letter')).toHaveCount(0);
 expect(geometry.right).toBeLessThanOrEqual(geometry.wordRight);expect(geometry.left).toBeGreaterThanOrEqual(geometry.wordLeft);
 expect((await words.nth(2).boundingBox())!.y).toBeGreaterThan(geometry.bottom);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await words.nth(1).scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('guided-long-word.png')});
});
async function learn(page:Page){
 await page.goto('/piclex-web/#/deck/'+catalog[0].id);
 await expect(page.getByRole('textbox',{name:'输入英文',exact:true})).toBeVisible();
}
test('avatar level sheet enters the real game with the current deck and returns to the same listening draft',async({page},info)=>{
 await learn(page);await page.getByRole('tab',{name:'练听力',exact:true}).click();
 await page.getByLabel('句子练习模式',{exact:true}).selectOption('chunks');
 const chip=page.locator('.chunk-bank .chunk').first(),text=await chip.innerText();await chip.click();
 const url=page.url();
 await page.locator('.practice-level-target').click();
 const dialog=page.getByRole('dialog',{name:'我的等级'});
 await expect(dialog.getByRole('button',{name:'薯薯求生',exact:true})).toBeEnabled();
 const summaryY=(await dialog.locator('.level-summary').boundingBox())!.y;
 await dialog.getByRole('heading',{name:'升级规则',exact:true}).scrollIntoViewIfNeeded();
 expect((await dialog.locator('.level-summary').boundingBox())!.y).toBe(summaryY);
 await dialog.locator('.level-scroll').evaluate(el=>el.scrollTop=0);
 await dialog.screenshot({path:info.outputPath('level-sheet.png')});

 await dialog.getByRole('button',{name:'薯薯求生',exact:true}).click();
 await page.setViewportSize({width:844,height:390});
 const frame=page.frameLocator('iframe');
 await expect(frame.getByRole('button',{name:'开始冒险',exact:true})).toBeVisible();
 expect(await page.locator('iframe').evaluate(el=>((el as HTMLIFrameElement).contentWindow as any).PICLEX_LAB_WORDS.length)).toBe(catalog[0].count);
 await frame.locator('#exit').click();
 await expect(page).toHaveURL(url);
 await expect(page.getByRole('tab',{name:'练听力',exact:true})).toHaveAttribute('aria-selected','true');
 await expect(page.locator('.chunk-answer .chunk')).toHaveText([text]);
 await expect(page.locator('iframe')).toHaveCount(0);
});
test('settings level entry offers game loading recovery back to the level page',async({page})=>{
 await page.route('**/lab/assets/hero.png',route=>route.abort());
 await page.goto('/piclex-web/#/settings');await page.locator('.settings-level-card').click();
 await expect(page.getByRole('button',{name:'薯薯求生',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'薯薯求生',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('素材加载失败');
 await page.getByRole('button',{name:'返回我的等级',exact:true}).click();
 await expect(page.getByRole('heading',{name:'我的等级',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'薯薯求生',exact:true})).toBeEnabled();
});
test('rewards have real details, learning and settings routes, and saved milestones remain visible after spending',async({page})=>{
 await learn(page);await page.locator('.practice-level-target').click();
 await page.getByRole('button',{name:'键盘声音，LV3 解锁',exact:true}).click();
 await expect(page.getByRole('progressbar',{name:'键盘声音解锁进度'})).toHaveAttribute('value','0');
 await page.getByRole('button',{name:'去拼几个单词',exact:true}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByRole('tab',{name:'拼单词',exact:true})).toHaveAttribute('aria-selected','true');
 await page.evaluate(async()=>{const r=indexedDB.open('piclex-web-experience-v1',1);const db=await new Promise<IDBDatabase>((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});await new Promise<void>((resolve,reject)=>{const t=db.transaction('meta','readwrite');t.objectStore('meta').put({total:12,statistics:{spelling:20,gameSpent:8},milestones:[{level:1,at:1},{level:2,at:2},{level:3,at:3},{level:4,at:4}]},'account');t.oncomplete=()=>resolve();t.onerror=()=>reject(t.error);});db.close();window.dispatchEvent(new Event('piclex-experience'));});
 await expect(page.locator('.practice-level-target')).toHaveAttribute('aria-label','等级 LV3，12 经验');
 await page.locator('.practice-level-target').click();
 await expect(page.locator('.level-milestone').filter({has:page.getByText('LV4',{exact:true})})).toHaveAttribute('data-reached','true');
 await page.getByRole('button',{name:'键盘声音，LV3 已解锁',exact:true}).click();
 await page.getByRole('button',{name:'去设置，体验新玩法',exact:true}).click();
 await expect(page.getByLabel('按键音',{exact:true}).locator('option[value=alpaca]')).toBeEnabled();
 await page.reload();await expect(page.getByLabel('按键音',{exact:true}).locator('option[value=alpaca]')).toBeEnabled();
});
for(const theme of ['light','dark'])test(`${theme} listening answer trays remain distinct from the page and selected chips have a visible outline`,async({page},info)=>{
 await page.addInitScript(theme=>localStorage.setItem('piclex-web.theme',theme),theme);
 await page.setViewportSize({width:390,height:844});await learn(page);
 await page.getByRole('tab',{name:'练听力',exact:true}).click();await page.getByLabel('句子练习模式',{exact:true}).selectOption('chunks');
 const tray=page.locator('.chunk-answer');
 const colors=await tray.evaluate(el=>({tray:getComputedStyle(el).backgroundColor,page:getComputedStyle(el.closest('.native-practice')!).backgroundColor}));
 expect(colors.tray).not.toBe(colors.page);expect(colors.tray).not.toBe('rgba(0, 0, 0, 0)');
 const first=page.locator('.chunk-bank .chunk').first(),text=await first.innerText();await first.click();
 const selected=tray.getByRole('button',{name:text,exact:true});
 const border=await selected.evaluate(el=>({color:getComputedStyle(el).borderTopColor,width:getComputedStyle(el).borderTopWidth,background:getComputedStyle(el).backgroundColor}));
 expect(border.width).toBe('1px');expect(border.color).not.toBe('rgba(0, 0, 0, 0)');
 await page.screenshot({path:info.outputPath(`listening-${theme}.png`)});
 await selected.click();await expect(tray.locator('.chunk')).toHaveCount(0);await expect(page.locator('.chunk-bank').getByRole('button',{name:text,exact:true})).toHaveCount(1);
 await page.getByLabel('句子练习模式',{exact:true}).selectOption('free');
 for(const difficulty of ['easy','medium','hard']){
  await page.getByLabel('听写难度',{exact:true}).selectOption(difficulty);
  const inputArea=page.locator(difficulty==='hard'?'.dictation-input':'.guided-input');
  expect(await inputArea.evaluate(el=>getComputedStyle(el).backgroundColor)).toBe(colors.tray);
 }
 await page.locator('.practice-level-target').click();
 await expect(page.getByRole('button',{name:'薯薯求生',exact:true})).toBeVisible();
 await page.getByRole('dialog').screenshot({path:info.outputPath(`level-${theme}.png`)});
});
