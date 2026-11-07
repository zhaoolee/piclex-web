# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: learning.spec.ts >> a visitor can complete a scene, resume after refresh, and restart without a phone
- Location: tests/browser/learning.spec.ts:10:1

# Error details

```
Error: expect(locator).toHaveValue(expected) failed

Locator:  getByRole('textbox', { name: '输入英文' })
Expected: ""
Received: "croissant"
Timeout:  5000ms

Call log:
  - Expect "toHaveValue" getByRole('textbox', { name: '输入英文' }) with timeout 5000ms
  - waiting for getByRole('textbox', { name: '输入英文' })
    5 × locator resolved to <input readonly lang="en" inputmode="none" aria-label="输入英文" autocorrect="off" value="croissant" autocomplete="off" spellcheck="false" autocapitalize="none" class="spelling-input"/>
      - unexpected value "croissant"

```

```yaml
- textbox "输入英文": croissant
```

# Test source

```ts
  1   | import {fillEnglish} from './helpers/spelling';
  2   | import {fillSpelling} from './helpers/spelling';
  3   | import { test, expect } from '@playwright/test';
  4   | import path from 'node:path';
  5   | import fs from 'node:fs';
  6   | const catalog=JSON.parse(fs.readFileSync('apps/public/public/library/catalog.json','utf8'));
  7   | const publicCard=catalog[0];
  8   | const publicDeck=JSON.parse(fs.readFileSync('apps/public/public/'+publicCard.payload,'utf8'));
  9   | const words=['croissant','spoon','fork','plate','lemon','table'];
  10  | test('a visitor can complete a scene, resume after refresh, and restart without a phone',async({page},testInfo)=>{
  11  |  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  12  |  const phoneRequests:string[]=[];page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))phoneRequests.push(r.url())});
  13  |  await page.goto('/piclex-web/#/decks');await expect(page.getByRole('heading',{name:'今天，想学哪套卡组？'})).toBeVisible();
  14  |  await page.screenshot({path:`test-results/home-${testInfo.project.name}.png`,fullPage:true});
  15  |  await page.getByLabel('选择照片卡组文件').setInputFiles(path.resolve('tests/fixtures/demo/decks/cafe.piclexdeck'));
  16  |  await expect(page.getByRole('heading',{name:'牛角包',exact:true})).toBeVisible();
  17  |  const input=page.getByRole('textbox',{name:'输入英文'});
  18  |  await fillSpelling(page,'crx');await expect(page.locator('.native-answer')).toHaveClass(/wrong/);await expect(page.locator('.answer-feedback')).toHaveCount(0);await fillSpelling(page,'cr');await expect(page.locator('.native-answer')).not.toHaveClass(/wrong/);
  19  |  await page.reload();await expect(input).toHaveValue('cr');
  20  |  await page.screenshot({path:`test-results/practice-${testInfo.project.name}.png`,fullPage:true});
  21  |  for(const [i,word] of words.entries()){
  22  |    await fillSpelling(page,word);
> 23  |    if(i<words.length-1) await expect(input).toHaveValue('');
      |                                             ^ Error: expect(locator).toHaveValue(expected) failed
  24  |  }
  25  |  await expect(page.getByRole('heading',{name:'本轮训练完成'})).toBeVisible();
  26  |  await expect(page.getByText('拼对 5 个词，复习 1 个词。')).toBeVisible();
  27  |  await page.reload();await expect(page.getByRole('heading',{name:'本轮训练完成'})).toBeVisible();
  28  |  await page.getByRole('button',{name:'再来一轮'}).click();await expect(input).toHaveValue('');
  29  |  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  30  |  expect(phoneRequests).toEqual([]);expect(errors).toEqual([]);
  31  | });
  32  | test('local archives survive refresh; duplicate and invalid imports preserve previous progress',async({page})=>{
  33  |  await page.goto('/piclex-web/#/decks');await expect(page.getByRole('button',{name:'导入自己的卡组'})).toBeEnabled();
  34  |  const chooser=page.getByLabel('选择照片卡组文件');
  35  |  await chooser.setInputFiles(path.resolve('tests/fixtures/demo/decks/travel.piclexdeck'));
  36  |  await expect(page.getByRole('heading',{name:'护照',exact:true})).toBeVisible();
  37  |  await fillSpelling(page,'pass');await page.reload();
  38  |  await expect(page.getByRole('textbox',{name:'输入英文'})).toHaveValue('pass');
  39  |  await page.goto('/piclex-web/#/decks');
  40  |  await chooser.setInputFiles({name:'bad.piclexdeck',mimeType:'application/zip',buffer:Buffer.from('bad')});
  41  |  await expect(page.locator('.toast[role="status"]')).toContainText('损坏');
  42  |  await chooser.setInputFiles(path.resolve('tests/fixtures/demo/decks/travel.piclexdeck'));
  43  |  await expect(page.getByRole('textbox',{name:'输入英文'})).toHaveValue('pass');
  44  |  await page.goto('/piclex-web/#/decks');
  45  |  await expect(page.locator('.deck-card')).toHaveCount(catalog.length + 1);
  46  | });
  47  | test('direct links, reveal, dark theme and unknown decks have usable states',async({page})=>{
  48  |  await page.goto('/piclex-web/#/deck/'+publicCard.id);await expect(page.getByRole('heading',{name:publicDeck.words[0].chinese,exact:true})).toBeVisible();
  49  |  await page.getByRole('navigation',{name:'底部导航'}).getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('button',{name:'外观与主题',exact:true}).click();await page.getByLabel('外观模式',{exact:true}).selectOption('dark');await page.getByRole('navigation',{name:'底部导航'}).getByRole('button',{name:'学习',exact:true}).click();await page.reload();
  50  |  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  51  |  await page.getByRole('button',{name:'不认识'}).click();await expect(page.getByRole('textbox',{name:'输入英文'})).toHaveValue(publicDeck.words[0].english);
  52  |  await page.getByRole('button',{name:'下一个',exact:true}).click();await expect(page.getByRole('heading',{name:publicDeck.words[1].chinese,exact:true})).toBeVisible();
  53  |  await page.goto('/piclex-web/#/deck/missing');await expect(page.getByRole('heading',{name:'暂时无法打开'})).toBeVisible();
  54  |  await page.getByRole('button',{name:'返回全部卡组'}).click();await expect(page.getByRole('heading',{name:'今天，想学哪套卡组？'})).toBeVisible();
  55  | });
  56  | 
  57  | test('public catalog reuses existing content and practice never downloads a whole archive',async({page})=>{
  58  |  const requests:string[]=[];page.on('request',request=>requests.push(new URL(request.url()).pathname));
  59  |  await page.goto('/piclex-web/#/decks');
  60  |  await expect(page.locator('.deck-card')).toHaveCount(catalog.length);
  61  |  await expect(page.getByRole('heading',{name:'Basic English 850 场景卡片',exact:true})).toBeVisible();
  62  |  await expect(page.getByRole('heading',{name:'新概念英语第二册',exact:true})).toBeVisible();
  63  |  await expect(page.getByRole('heading',{name:'程序员面试',exact:true})).toHaveCount(0);
  64  |  await page.getByRole('button',{name:'开始练习',exact:true}).click();
  65  |  await expect(page.getByRole('heading',{name:publicDeck.words[0].chinese,exact:true})).toBeVisible();
  66  |  // Wait for the bounded current + five-photo window; exact paths also reject duplicate downloads.
  67  |  const expectedPhotos=publicDeck.photos.slice(0,6).map((photo:{path:string})=>'/piclex-web/'+photo.path).sort();
  68  |  await expect.poll(()=>requests.filter(url=>url.includes('/photos/')).sort()).toEqual(expectedPhotos);
  69  |  expect(requests.some(url=>url.endsWith('.piclexdeck'))).toBe(false);
  70  |  await fillSpelling(page,publicDeck.words[0].english);
  71  |  await expect(page.getByRole('heading',{name:publicDeck.words[1].chinese,exact:true})).toBeVisible();
  72  |  await page.reload();await expect(page.getByRole('heading',{name:publicDeck.words[1].chinese,exact:true})).toBeVisible();
  73  |  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  74  | });
  75  | 
  76  | 
  77  | test('native modules preserve independent sentence drafts, shuffle order and photo navigation',async({page},testInfo)=>{
  78  |  await page.goto('/piclex-web/#/deck/'+publicCard.id);
  79  |  await fillSpelling(page,'b');
  80  |  await page.getByRole('tab',{name:'练听力'}).click();
  81  |  const mode=page.getByRole('combobox',{name:'句子练习模式'});
  82  |  await expect(mode).toHaveValue('chunks');
  83  |  const bank=page.getByLabel('待选词块');const selected=page.getByLabel('已选词块');
  84  |  const bankOrder=await bank.getByRole('button').allTextContents();
  85  |  await bank.getByRole('button',{name:'I',exact:true}).click();
  86  |  await mode.selectOption('free');await fillEnglish(page.getByRole('textbox',{name:'听写句子'}),'I am');
  87  |  await mode.selectOption('chunks');await expect(selected).toContainText('I');
  88  |  await page.getByRole('button',{name:'选择照片',exact:true}).click();
  89  |  await page.getByRole('button',{name:'照片 2',exact:true}).click();
  90  |  await expect(selected.getByRole('button')).toHaveCount(0);
  91  |  await page.getByRole('button',{name:'选择照片',exact:true}).click();
  92  |  await page.getByRole('button',{name:'照片 1',exact:true}).click();
  93  |  await expect(selected.getByRole('button')).toHaveText(['I']);
  94  |  await page.reload();await expect(selected.getByRole('button')).toHaveText(['I']);
  95  |  expect(await bank.getByRole('button').allTextContents()).toEqual(bankOrder.filter(t=>t!=='I'));
  96  |  await mode.selectOption('free');await expect(page.getByRole('textbox',{name:'听写句子'})).toHaveValue('I am');
  97  |  await page.getByRole('button',{name:'听不懂',exact:true}).click();
  98  |  await expect(page.getByRole('status').filter({hasText:'参考答案'})).toBeVisible();
  99  |  await expect(page.getByRole('textbox',{name:'听写句子'})).toHaveValue(publicDeck.words[0].example);
  100 |  await page.getByRole('tab',{name:'拼单词'}).click();await expect(page.getByRole('textbox',{name:'输入英文'})).toHaveValue('b');
  101 |  await expect.poll(()=>page.locator('.focus-box').evaluate(n=>getComputedStyle(n,'::after').animationDuration)).toBe('5s');
  102 |  await page.screenshot({path:`test-results/native-spelling-${testInfo.project.name}.png`,fullPage:true});
  103 |  await page.getByRole('tab',{name:'练听力'}).click();await mode.selectOption('chunks');
  104 |  await page.screenshot({path:`test-results/native-chunks-${testInfo.project.name}.png`,fullPage:true});
  105 |  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  106 | });
  107 | 
  108 | test('sentence fill checks automatically; failed order can be corrected and assistance does not claim success',async({page})=>{
  109 |  await page.goto('/piclex-web/#/deck/'+publicCard.id);await page.getByRole('tab',{name:'练听力'}).click();
  110 |  const bank=page.getByLabel('待选词块'),selected=page.getByLabel('已选词块');
  111 |  for(const text of ['am','I','still','in','bed.'])await bank.getByRole('button',{name:text,exact:true}).click();
  112 |  await expect(page.locator('.sentence-feedback[role=status]')).toContainText('顺序还需要调整');
  113 |  await selected.getByRole('button',{name:'I',exact:true}).press('Alt+ArrowLeft');
  114 |  await expect(page.getByLabel('已选词块').getByRole('button').first()).toBeDisabled();
  115 |  await expect(page.locator('.sentence-feedback')).toHaveCount(0);
  116 |  // Replay pauses the successful chunk attempt's delayed advance, restoring the
  117 |  // manual challenge action for this still-visible sentence.
  118 |  await page.getByRole('button',{name:'播放句子',exact:true}).click();
  119 |  await expect(page.getByRole('button',{name:'挑战自由听写'})).toBeVisible();
  120 |  await page.getByRole('button',{name:'挑战自由听写'}).click();
  121 |  await fillEnglish(page.getByRole('textbox',{name:'听写句子'}),'I wrong');await page.getByRole('button',{name:'检查答案'}).click();
  122 |  await expect(page.locator('.sentence-feedback[role=status]')).toContainText('再听一次');
  123 |  await page.getByRole('button',{name:'显示答案',exact:true}).click();await expect(page.locator('.standard-answer')).toContainText('I am still in bed.');
```