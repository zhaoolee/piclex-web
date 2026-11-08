# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: learning-parity.spec.ts >> guided word blanks show readable underlines and preserve typing, reveal and difficulty changes
- Location: tests/browser/learning-parity.spec.ts:6:1

# Error details

```
Error: expect(locator).toHaveValue(expected) failed

Locator:  locator('.guided-word').locator('input').nth(1)
Expected: "i'm"
Received: "im"
Timeout:  5000ms

Call log:
  - Expect "toHaveValue" locator('.guided-word').locator('input').nth(1) with timeout 5000ms
  - waiting for locator('.guided-word').locator('input').nth(1)
    14 × locator resolved to <input readonly lang="en" value="im" inputmode="none" autocorrect="off" autocomplete="off" spellcheck="false" autocapitalize="none" aria-label="第 2 个单词，2 个字母"/>
       - unexpected value "im"

```

```yaml
- textbox "第 2 个单词，2 个字母": im
```

# Test source

```ts
  1   | import {test,expect,type Page} from '@playwright/test';
  2   | import fs from 'node:fs';
  3   | import {createHash} from 'node:crypto';
  4   | import {fillEnglish} from './helpers/spelling';
  5   | const catalog=JSON.parse(fs.readFileSync('apps/public/public/library/catalog.json','utf8'));
  6   | test('guided word blanks show readable underlines and preserve typing, reveal and difficulty changes',async({page},info)=>{
  7   |  await page.goto('/piclex-web/#/deck/'+catalog.find((deck:{title:string})=>deck.title==='程序员工作英语').id);
  8   |  await page.getByRole('tab',{name:'练听力',exact:true}).click();
  9   |  await page.getByLabel('句子练习模式',{exact:true}).selectOption('free');
  10  |  await page.getByLabel('听写难度',{exact:true}).selectOption('easy');
  11  |  const words=page.locator('.guided-word'),fields=words.locator('input');
  12  |  await expect(words).toHaveCount(3);
  13  |  expect((await words.allTextContents()).join('')).not.toMatch(/[\p{L}\p{N}]/u);
  14  |  for(const field of await fields.all()){
  15  |   await expect(field).toHaveValue('');await expect(field).toHaveAttribute('readonly','');
  16  |  }
  17  |  const boxes=await words.evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().toJSON()));
  18  |  expect(boxes[0].width).toBe(boxes[1].width);expect(boxes[2].width).toBeGreaterThan(boxes[1].width);
  19  |  await fields.first().focus();
  20  |  expect(await fields.first().evaluate(el=>getComputedStyle(el).outlineStyle)).toBe('none');
  21  |  await page.locator('.photo-focus img').first().waitFor({state:'visible'});
  22  |  await page.screenshot({path:info.outputPath('guided-empty.png')});
  23  |  const second=fields.nth(1);
> 24  |  await fillEnglish(second,"i'm");await expect(second).toHaveValue("i'm");
      |                                                       ^ Error: expect(locator).toHaveValue(expected) failed
  25  |  await expect(words.nth(1).locator('.guided-letters')).toContainText('m');
  26  |  await expect(words.nth(1).locator('.bad-letter')).toHaveCount(0);
  27  |  await second.focus();await second.press('End');await second.press('Backspace');await expect(second).toHaveValue("i'");
  28  |  await page.getByLabel('听写难度',{exact:true}).selectOption('medium');
  29  |  await expect(fields.nth(1)).toHaveValue("i'");
  30  |  const equalWidths=await words.evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().width));
  31  |  expect(new Set(equalWidths).size).toBe(1);
  32  |  await page.getByLabel('听写难度',{exact:true}).selectOption('easy');
  33  |  await expect(page.locator('.peek-letter')).toHaveCount(0);
  34  |  const peek=words.first();
  35  |  // Difficulty changes can still be scrolling the panel into view; a real
  36  |  // scroll cancels a hold, so start only after the word's geometry settles.
  37  |  await peek.scrollIntoViewIfNeeded();await peek.evaluate(node=>new Promise<void>(resolve=>{let previous='',since=performance.now();const frame=()=>{const b=node.getBoundingClientRect(),next=JSON.stringify([b.x,b.y,b.width,b.height,node.closest('.native-body')?.scrollTop]);if(next!==previous){previous=next;since=performance.now();}if(performance.now()-since>=250)resolve();else requestAnimationFrame(frame);};requestAnimationFrame(frame);}));
  38  |  await peek.hover();await page.mouse.down();await expect(page.locator('.word-peek-english')).toHaveText('Hi');await expect(page.locator('.word-peek-meaning')).not.toHaveText('查询中…');
  39  |  await page.mouse.up();await expect(page.locator('.word-peek')).toHaveCount(0);
  40  |  await peek.hover();await page.mouse.down();await expect(page.locator('.word-peek-english')).toHaveText('Hi');await expect(page.locator('.word-peek-meaning')).not.toHaveText('查询中…');
  41  |  await page.mouse.move(5,5);await page.mouse.up();await expect(page.locator('.word-peek')).toHaveCount(0);
  42  |  await expect(fields.first()).toHaveValue('');
  43  |  await page.getByLabel('听写难度',{exact:true}).selectOption('hard');
  44  |  await expect(page.locator('.guided-input')).toHaveCount(0);
  45  |  await page.getByLabel('听写难度',{exact:true}).selectOption('easy');
  46  |  await expect(fields.nth(1)).toHaveValue("i'");
  47  |  await page.screenshot({path:info.outputPath('guided-typed.png')});
  48  | });
  49  | test('long guided words wrap without covering the next word or reserving an icon row',async({page},info)=>{
  50  |  const card=catalog[0],deck=JSON.parse(fs.readFileSync('apps/public/public/'+card.payload,'utf8'));
  51  |  deck.words[0].example='A pneumonoultramicroscopicsilicovolcanoconiosis appears.';
  52  |  const body=JSON.stringify(deck),sha=createHash('sha256').update(body).digest('hex');
  53  |  await page.route('**/library/catalog.json',route=>route.fulfill({json:catalog.map((entry:{id:string})=>entry.id===card.id?{...entry,payloadSHA256:sha}:entry)}));
  54  |  await page.route('**/'+card.payload,route=>route.fulfill({body,contentType:'application/json'}));
  55  |  await page.setViewportSize({width:320,height:568});
  56  |  await page.goto('/piclex-web/#/deck/'+card.id);
  57  |  await page.getByRole('tab',{name:'练听力',exact:true}).click();
  58  |  await page.getByLabel('句子练习模式',{exact:true}).selectOption('free');
  59  |  await page.getByLabel('听写难度',{exact:true}).selectOption('easy');
  60  |  const words=page.locator('.guided-word');await expect(words).toHaveCount(3);
  61  |  const geometry=await words.nth(1).evaluate(el=>{
  62  |   const rect=el.getBoundingClientRect(),letters=[...el.querySelectorAll('.guided-letters i')].map(n=>n.getBoundingClientRect());
  63  |   return {bottom:Math.max(...letters.map(r=>r.bottom)),right:Math.max(...letters.map(r=>r.right)),left:Math.min(...letters.map(r=>r.left)),wordRight:rect.right,wordLeft:rect.left,wordBottom:rect.bottom,padding:getComputedStyle(el).paddingBottom,rows:new Set(letters.map(r=>r.top)).size};
  64  |  });
  65  |  expect(geometry.rows).toBeGreaterThan(1);expect(geometry.bottom).toBeLessThanOrEqual(geometry.wordBottom);expect(geometry.padding).toBe('0px');await expect(page.locator('.peek-letter')).toHaveCount(0);
  66  |  expect(geometry.right).toBeLessThanOrEqual(geometry.wordRight);expect(geometry.left).toBeGreaterThanOrEqual(geometry.wordLeft);
  67  |  expect((await words.nth(2).boundingBox())!.y).toBeGreaterThan(geometry.bottom);
  68  |  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  69  |  await words.nth(1).scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('guided-long-word.png')});
  70  | });
  71  | async function learn(page:Page){
  72  |  await page.goto('/piclex-web/#/deck/'+catalog[0].id);
  73  |  await expect(page.getByRole('textbox',{name:'输入英文',exact:true})).toBeVisible();
  74  | }
  75  | test('avatar level sheet enters the real game with the current deck and returns to the same listening draft',async({page},info)=>{
  76  |  await learn(page);await page.getByRole('tab',{name:'练听力',exact:true}).click();
  77  |  await page.getByLabel('句子练习模式',{exact:true}).selectOption('chunks');
  78  |  const chip=page.locator('.chunk-bank .chunk').first(),text=await chip.innerText();await chip.click();
  79  |  const url=page.url();
  80  |  await page.locator('.practice-level-target').click();
  81  |  const dialog=page.getByRole('dialog',{name:'我的等级'});
  82  |  await expect(dialog.getByRole('button',{name:'薯薯求生',exact:true})).toBeEnabled();
  83  |  const summaryY=(await dialog.locator('.level-summary').boundingBox())!.y;
  84  |  await dialog.getByRole('heading',{name:'升级规则',exact:true}).scrollIntoViewIfNeeded();
  85  |  expect((await dialog.locator('.level-summary').boundingBox())!.y).toBe(summaryY);
  86  |  await dialog.locator('.level-scroll').evaluate(el=>el.scrollTop=0);
  87  |  await dialog.screenshot({path:info.outputPath('level-sheet.png')});
  88  | 
  89  |  await dialog.getByRole('button',{name:'薯薯求生',exact:true}).click();
  90  |  await page.setViewportSize({width:844,height:390});
  91  |  const frame=page.frameLocator('iframe');
  92  |  await expect(frame.getByRole('button',{name:'开始冒险',exact:true})).toBeVisible();
  93  |  expect(await page.locator('iframe').evaluate(el=>((el as HTMLIFrameElement).contentWindow as any).PICLEX_LAB_WORDS.length)).toBe(catalog[0].count);
  94  |  await frame.locator('#exit').click();
  95  |  await expect(page).toHaveURL(url);
  96  |  await expect(page.getByRole('tab',{name:'练听力',exact:true})).toHaveAttribute('aria-selected','true');
  97  |  await expect(page.locator('.chunk-answer .chunk')).toHaveText([text]);
  98  |  await expect(page.locator('iframe')).toHaveCount(0);
  99  | });
  100 | test('settings level entry offers game loading recovery back to the level page',async({page})=>{
  101 |  await page.route('**/lab/assets/hero.png',route=>route.abort());
  102 |  await page.goto('/piclex-web/#/settings');await page.locator('.settings-level-card').click();
  103 |  await expect(page.getByRole('button',{name:'薯薯求生',exact:true})).toBeEnabled();
  104 |  await page.getByRole('button',{name:'薯薯求生',exact:true}).click();
  105 |  await expect(page.getByRole('alert')).toContainText('素材加载失败');
  106 |  await page.getByRole('button',{name:'返回我的等级',exact:true}).click();
  107 |  await expect(page.getByRole('heading',{name:'我的等级',exact:true})).toBeVisible();
  108 |  await expect(page.getByRole('button',{name:'薯薯求生',exact:true})).toBeEnabled();
  109 | });
  110 | test('rewards have real details, learning and settings routes, and saved milestones remain visible after spending',async({page})=>{
  111 |  await learn(page);await page.locator('.practice-level-target').click();
  112 |  await page.getByRole('button',{name:'键盘声音，LV3 解锁',exact:true}).click();
  113 |  await expect(page.getByRole('progressbar',{name:'键盘声音解锁进度'})).toHaveAttribute('value','0');
  114 |  await page.getByRole('button',{name:'去拼几个单词',exact:true}).click();
  115 |  await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByRole('tab',{name:'拼单词',exact:true})).toHaveAttribute('aria-selected','true');
  116 |  await page.evaluate(async()=>{const r=indexedDB.open('piclex-web-experience-v1',1);const db=await new Promise<IDBDatabase>((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});await new Promise<void>((resolve,reject)=>{const t=db.transaction('meta','readwrite');t.objectStore('meta').put({total:12,statistics:{spelling:20,gameSpent:8},milestones:[{level:1,at:1},{level:2,at:2},{level:3,at:3},{level:4,at:4}]},'account');t.oncomplete=()=>resolve();t.onerror=()=>reject(t.error);});db.close();window.dispatchEvent(new Event('piclex-experience'));});
  117 |  await expect(page.locator('.practice-level-target')).toHaveAttribute('aria-label','等级 LV3，12 经验');
  118 |  await page.locator('.practice-level-target').click();
  119 |  await expect(page.locator('.level-milestone').filter({has:page.getByText('LV4',{exact:true})})).toHaveAttribute('data-reached','true');
  120 |  await page.getByRole('button',{name:'键盘声音，LV3 已解锁',exact:true}).click();
  121 |  await page.getByRole('button',{name:'去设置，体验新玩法',exact:true}).click();
  122 |  await expect(page.getByLabel('按键音',{exact:true}).locator('option[value=alpaca]')).toBeEnabled();
  123 |  await page.reload();await expect(page.getByLabel('按键音',{exact:true}).locator('option[value=alpaca]')).toBeEnabled();
  124 | });
```