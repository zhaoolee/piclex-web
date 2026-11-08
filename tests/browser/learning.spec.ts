import {fillEnglish} from './helpers/spelling';
import {fillSpelling} from './helpers/spelling';
import { test, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
const catalog=JSON.parse(fs.readFileSync('apps/public/public/library/catalog.json','utf8'));
const publicCard=catalog[0];
const publicDeck=JSON.parse(fs.readFileSync('apps/public/public/'+publicCard.payload,'utf8'));
const words=['croissant','spoon','fork','plate','lemon','table'];
test('a visitor can complete a scene, resume after refresh, and restart without a phone',async({page},testInfo)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const phoneRequests:string[]=[];page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))phoneRequests.push(r.url())});
 await page.goto('/piclex-web/#/decks');await expect(page.getByRole('heading',{name:'今天，想学哪套卡组？'})).toBeVisible();
 await page.screenshot({path:`test-results/home-${testInfo.project.name}.png`,fullPage:true});
 await page.getByLabel('选择照片卡组文件').setInputFiles(path.resolve('tests/fixtures/demo/decks/cafe.piclexdeck'));
 await expect(page.getByRole('heading',{name:'牛角包',exact:true})).toBeVisible();
 const input=page.getByRole('textbox',{name:'输入英文'});
 await fillSpelling(page,'crx');await expect(page.locator('.native-answer')).toHaveClass(/wrong/);await expect(page.locator('.answer-feedback')).toHaveCount(0);await fillSpelling(page,'cr');await expect(page.locator('.native-answer')).not.toHaveClass(/wrong/);
 await page.reload();await expect(input).toHaveValue('cr');
 await page.screenshot({path:`test-results/practice-${testInfo.project.name}.png`,fullPage:true});
 for(const [i,word] of words.entries()){
   await fillSpelling(page,word);
   if(i<words.length-1) await expect(input).toHaveValue('');
 }
 await expect(page.getByRole('heading',{name:'本轮训练完成'})).toBeVisible();
 await expect(page.getByText('拼对 5 个词，复习 1 个词。')).toBeVisible();
 await page.reload();await expect(page.getByRole('heading',{name:'本轮训练完成'})).toBeVisible();
 await page.getByRole('button',{name:'再来一轮'}).click();await expect(input).toHaveValue('');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect(phoneRequests).toEqual([]);expect(errors).toEqual([]);
});
test('local archives survive refresh; duplicate and invalid imports preserve previous progress',async({page})=>{
 await page.goto('/piclex-web/#/decks');await expect(page.getByRole('button',{name:'导入自己的卡组'})).toBeEnabled();
 const chooser=page.getByLabel('选择照片卡组文件');
 await chooser.setInputFiles(path.resolve('tests/fixtures/demo/decks/travel.piclexdeck'));
 await expect(page.getByRole('heading',{name:'护照',exact:true})).toBeVisible();
 await fillSpelling(page,'pass');await page.reload();
 await expect(page.getByRole('textbox',{name:'输入英文'})).toHaveValue('pass');
 await page.goto('/piclex-web/#/decks');
 await chooser.setInputFiles({name:'bad.piclexdeck',mimeType:'application/zip',buffer:Buffer.from('bad')});
 await expect(page.locator('.toast[role="status"]')).toContainText('损坏');
 await chooser.setInputFiles(path.resolve('tests/fixtures/demo/decks/travel.piclexdeck'));
 await expect(page.getByRole('textbox',{name:'输入英文'})).toHaveValue('pass');
 await page.goto('/piclex-web/#/decks');
 await expect(page.locator('.deck-card')).toHaveCount(catalog.length + 1);
});
test('direct links, reveal, dark theme and unknown decks have usable states',async({page})=>{
 await page.goto('/piclex-web/#/deck/'+publicCard.id);await expect(page.getByRole('heading',{name:publicDeck.words[0].chinese,exact:true})).toBeVisible();
 await page.getByRole('navigation',{name:'底部导航'}).getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('button',{name:'外观与主题',exact:true}).click();await page.getByLabel('外观模式',{exact:true}).selectOption('dark');await page.getByRole('navigation',{name:'底部导航'}).getByRole('button',{name:'学习',exact:true}).click();await page.reload();
 await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
 await page.getByRole('button',{name:'不认识'}).click();await expect(page.getByRole('textbox',{name:'输入英文'})).toHaveValue(publicDeck.words[0].english);
 await page.getByRole('button',{name:'下一个',exact:true}).click();await expect(page.getByRole('heading',{name:publicDeck.words[1].chinese,exact:true})).toBeVisible();
 await page.goto('/piclex-web/#/deck/missing');await expect(page.getByRole('heading',{name:'暂时无法打开'})).toBeVisible();
 await page.getByRole('button',{name:'返回全部卡组'}).click();await expect(page.getByRole('heading',{name:'今天，想学哪套卡组？'})).toBeVisible();
});

test('public catalog reuses existing content and practice never downloads a whole archive',async({page})=>{
 const requests:string[]=[];page.on('request',request=>requests.push(new URL(request.url()).pathname));
 await page.goto('/piclex-web/#/decks');
 await expect(page.locator('.deck-card')).toHaveCount(catalog.length);
 await expect(page.getByRole('heading',{name:'Basic English 850 场景卡片',exact:true})).toBeVisible();
 await expect(page.getByRole('heading',{name:'新概念英语第二册',exact:true})).toBeVisible();
 await expect(page.getByRole('heading',{name:'程序员面试',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'开始练习',exact:true}).click();
 await expect(page.getByRole('heading',{name:publicDeck.words[0].chinese,exact:true})).toBeVisible();
 // Wait for the bounded current + five-photo window; exact paths also reject duplicate downloads.
 const expectedPhotos=publicDeck.photos.slice(0,6).map((photo:{path:string})=>'/piclex-web/'+photo.path).sort();
 await expect.poll(()=>requests.filter(url=>url.includes('/photos/')).sort()).toEqual(expectedPhotos);
 expect(requests.some(url=>url.endsWith('.piclexdeck'))).toBe(false);
 await fillSpelling(page,publicDeck.words[0].english);
 await expect(page.getByRole('heading',{name:publicDeck.words[1].chinese,exact:true})).toBeVisible();
 await page.reload();await expect(page.getByRole('heading',{name:publicDeck.words[1].chinese,exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});


test('native modules preserve independent sentence drafts, shuffle order and photo navigation',async({page},testInfo)=>{
 await page.goto('/piclex-web/#/deck/'+publicCard.id);
 await fillSpelling(page,'b');
 await page.getByRole('tab',{name:'练听力'}).click();
 const mode=page.getByRole('combobox',{name:'句子练习模式'});
 await expect(mode).toHaveValue('chunks');
 const bank=page.getByLabel('待选词块');const selected=page.getByLabel('已选词块');
 const bankOrder=await bank.getByRole('button').allTextContents();
 await bank.getByRole('button',{name:'I',exact:true}).click();
 await mode.selectOption('free');await fillEnglish(page.getByRole('textbox',{name:'听写句子'}),'Iam');
 await mode.selectOption('chunks');await expect(selected).toContainText('I');
 await page.getByRole('button',{name:'选择照片',exact:true}).click();
 await page.getByRole('button',{name:'照片 2',exact:true}).click();
 await expect(selected.getByRole('button')).toHaveCount(0);
 await page.getByRole('button',{name:'选择照片',exact:true}).click();
 await page.getByRole('button',{name:'照片 1',exact:true}).click();
 await expect(selected.getByRole('button')).toHaveText(['I']);
 await page.reload();await expect(selected.getByRole('button')).toHaveText(['I']);
 expect(await bank.getByRole('button').allTextContents()).toEqual(bankOrder.filter(t=>t!=='I'));
 await mode.selectOption('free');await expect(page.getByRole('textbox',{name:'听写句子'})).toHaveValue('I am');
 await page.getByRole('button',{name:'听不懂',exact:true}).click();
 await expect(page.getByRole('status').filter({hasText:'参考答案'})).toBeVisible();
 await expect(page.getByRole('textbox',{name:'听写句子'})).toHaveValue(publicDeck.words[0].example);
 await page.getByRole('tab',{name:'拼单词'}).click();await expect(page.getByRole('textbox',{name:'输入英文'})).toHaveValue('b');
 await expect.poll(()=>page.locator('.focus-box').evaluate(n=>getComputedStyle(n,'::after').animationDuration)).toBe('5s');
 await page.screenshot({path:`test-results/native-spelling-${testInfo.project.name}.png`,fullPage:true});
 await page.getByRole('tab',{name:'练听力'}).click();await mode.selectOption('chunks');
 await page.screenshot({path:`test-results/native-chunks-${testInfo.project.name}.png`,fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('sentence fill checks automatically; failed order can be corrected and assistance does not claim success',async({page})=>{
 await page.goto('/piclex-web/#/deck/'+publicCard.id);await page.getByRole('tab',{name:'练听力'}).click();
 const bank=page.getByLabel('待选词块'),selected=page.getByLabel('已选词块');
 for(const text of ['am','I','still','in','bed.'])await bank.getByRole('button',{name:text,exact:true}).click();
 await expect(page.locator('.sentence-feedback[role=status]')).toContainText('顺序还需要调整');
 await selected.getByRole('button',{name:'I',exact:true}).press('Alt+ArrowLeft');
 await expect(page.getByLabel('已选词块').getByRole('button').first()).toBeDisabled();
 await expect(page.locator('.sentence-feedback')).toHaveCount(0);
 // Replay pauses the successful chunk attempt's delayed advance, restoring the
 // manual challenge action for this still-visible sentence.
 await page.getByRole('button',{name:'播放句子',exact:true}).click();
 await expect(page.getByRole('button',{name:'挑战自由听写'})).toBeVisible();
 await page.getByRole('button',{name:'挑战自由听写'}).click();
 const dictation=page.getByRole('textbox',{name:'听写句子'});
 await fillEnglish(dictation,'Iamstillinbad');
 await expect(page.getByRole('button',{name:'检查答案',exact:true})).toHaveCount(0);
 await expect(page.locator('.sentence-feedback[role=status]')).toContainText('再听一次');
 await dictation.press('Backspace');await expect(page.locator('.sentence-feedback')).toHaveCount(0);
 await fillEnglish(dictation,'Iamstillinbad');await expect(page.locator('.sentence-feedback[role=status]')).toContainText('再听一次');
 await page.getByRole('button',{name:'显示答案',exact:true}).click();await expect(page.locator('.standard-answer')).toContainText('I am still in bed.');
 await page.getByRole('button',{name:'重新拼写',exact:true}).click();await expect(page.getByRole('textbox',{name:'听写句子'})).toHaveValue('');
 await fillEnglish(page.getByRole('textbox',{name:'听写句子'}),'iamstillinbed');
 await expect(page.getByRole('textbox',{name:'听写句子'})).toHaveValue(''); // auto-advance to next sentence
 await page.getByRole('button',{name:'当前卡组，学习设置'}).click();await expect(page.getByRole('dialog',{name:'选择卡组',exact:true})).toBeVisible();await page.getByRole('button',{name:'关闭',exact:true}).click();
 await page.getByRole('tab',{name:'拼单词'}).click();await expect(page.locator('.answer-feedback')).toHaveCount(0);
});

test('guided dictation, listening controls, compact height and reduced-motion remain usable',async({page})=>{
 await page.goto('/piclex-web/#/deck/'+publicCard.id);await page.getByRole('tab',{name:'练听力'}).click();
 await page.getByRole('combobox',{name:'句子练习模式'}).selectOption('free');
 await page.getByRole('combobox',{name:'听写难度'}).selectOption('easy');
 await expect(page.getByRole('textbox',{name:/第 \d+ 个单词/})).toHaveCount(5);
 await fillEnglish(page.getByRole('textbox',{name:'第 2 个单词，2 个字母',exact:true}),'am');
 await page.getByRole('combobox',{name:'听写难度'}).selectOption('medium');
 await expect(page.getByRole('textbox',{name:'第 2 个单词',exact:true})).toHaveValue('am');
 await page.getByRole('combobox',{name:'句子练习模式'}).selectOption('listening');
 await expect(page.getByRole('combobox',{name:'循环方式'})).toBeVisible();
 await expect(page.getByRole('slider',{name:'句子播放位置'})).toBeVisible();
 await page.getByRole('tab',{name:'拼单词'}).click();await page.setViewportSize({width:390,height:430});
 await page.getByRole('button',{name:'不认识',exact:true}).scrollIntoViewIfNeeded();
 const rect=await page.getByRole('button',{name:'不认识',exact:true}).boundingBox();expect(rect!.y+rect!.height).toBeLessThanOrEqual(378);
 await page.emulateMedia({reducedMotion:'reduce'});await expect.poll(()=>page.locator('.focus-box').evaluate(n=>getComputedStyle(n,'::after').animationName)).toBe('none');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});


test('speaking starts only on explicit action and stops when leaving the module',async({page})=>{
 await page.addInitScript(()=>{
  const state={starts:0,aborts:0};(window as any).__speechTest=state;
  (window as any).SpeechRecognition=class {onresult:any;onend:any;onerror:any;start(){state.starts++;this.onresult?.({results:[[{transcript:'I am still in bed'}]]});}abort(){state.aborts++;}};
 });
 await page.goto('/piclex-web/#/deck/'+publicCard.id);await page.getByRole('tab',{name:'练口语'}).click();
 expect(await page.evaluate(()=>(window as any).__speechTest.starts)).toBe(0);
 await expect(page.getByText('浏览器可能将语音发送给其识别服务；点击后授权麦克风。')).toBeVisible();
 await page.getByRole('button',{name:'开始跟读',exact:true}).click();
 await expect(page.locator('.reading-state')).toContainText('朗读完成');
 await page.getByRole('tab',{name:'拼单词'}).click();
 expect(await page.evaluate(()=>(window as any).__speechTest.aborts)).toBe(1);
 await page.getByRole('tab',{name:'练口语'}).click();
 await expect(page.locator('.reading-transcript')).toContainText('I am still in bed');
 expect(await page.evaluate(()=>(window as any).__speechTest.starts)).toBe(1);
});
