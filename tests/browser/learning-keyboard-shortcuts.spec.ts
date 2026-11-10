import {fillEnglish} from './helpers/spelling';
import {test,expect,type Page} from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {unzipSync,zipSync,strFromU8,strToU8} from 'fflate';

const letters=[...'qwertyuiopasdfghjklzxcvbnm'];
const sentenceLetters='acroissantisonthewoodenplate';

async function openCafe(page:Page,sentence?:string){
 // Isolate speech and keep every learning shortcut test silent.
 await page.addInitScript(()=>{
  const w=window as any;w.__speech=[];w.__cancels=0;
  const synth={paused:false,speaking:false,pending:false,getVoices:()=>[],speak:(utterance:any)=>{w.__speech.push(utterance.text);},cancel:()=>{w.__cancels++;},pause:()=>{},resume:()=>{},addEventListener:()=>{},removeEventListener:()=>{}};
  Object.defineProperty(window,'speechSynthesis',{configurable:true,value:synth});
 });
 await page.goto('/piclex-web/#/decks');
 await expect(page.getByRole('button',{name:'导入自己的卡组'})).toBeEnabled();
 const file=path.resolve('tests/fixtures/demo/decks/cafe.piclexdeck');
 if(sentence){const files=unzipSync(fs.readFileSync(file)),manifest=JSON.parse(strFromU8(files['manifest.json'])),entry=manifest.photos[0],photo=JSON.parse(strFromU8(files[entry.jsonPath]));photo.labels[0].learning.example=sentence;files[entry.jsonPath]=strToU8(JSON.stringify(photo));entry.jsonSHA256=createHash('sha256').update(files[entry.jsonPath]).digest('hex');files['manifest.json']=strToU8(JSON.stringify(manifest));await page.getByLabel('选择照片卡组文件').setInputFiles({name:'fixed-punctuation.piclexdeck',mimeType:'application/zip',buffer:Buffer.from(zipSync(files))});}
 else await page.getByLabel('选择照片卡组文件').setInputFiles(file);
 await expect(page.getByRole('textbox',{name:'输入英文',exact:true})).toBeVisible();
 await page.getByRole('tab',{name:'练听力',exact:true}).click();await page.getByRole('tab',{name:'拼单词',exact:true}).click();
}

async function expectLetterKeyboard(page:Page){
 const keyboard=page.getByRole('region',{name:'虚拟键盘'});
 await expect(keyboard).toBeVisible();
 const keys=await keyboard.locator('button[data-key]').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('data-key')));
 expect(keys).toHaveLength(27);
 expect([...keys].sort()).toEqual([...letters,'Backspace'].sort());
 await expect(keyboard.locator('.virtual-key-row')).toHaveCount(3);
}

const playCount=async(page:Page)=>{await page.waitForTimeout(80);return page.evaluate(()=>((window as any).__speech as string[]).length);};
const resetSpeech=async(page:Page)=>{await page.waitForTimeout(80);await page.evaluate(()=>{((window as any).__speech as string[]).length=0;(window as any).__cancels=0;});};
const selection=(page:Page,selector:string)=>page.locator(selector).evaluate((node:HTMLInputElement|HTMLTextAreaElement)=>node.selectionStart);

test('learning keyboards show exactly 26 letters and Backspace at desktop and mobile widths',async({page})=>{
 await page.setViewportSize({width:1440,height:1000});
 await openCafe(page);
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  await page.setViewportSize(viewport);
  await expectLetterKeyboard(page);
 }
 await page.getByRole('tab',{name:'练听力',exact:true}).click();
 await page.getByLabel('句子练习模式',{exact:true}).selectOption('free');
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  await page.setViewportSize(viewport);
  for(const difficulty of ['easy','medium','hard']){
   await page.getByLabel('听写难度',{exact:true}).selectOption(difficulty);
   await expectLetterKeyboard(page);
  }
 }
});

test('PC Esc and Space keycaps follow the desktop media query without changing button names',async({page},info)=>{
 await openCafe(page);
 const esc=page.locator('.esc-keycap').first(),space=page.locator('.space-keycap'),playback=page.getByRole('button',{name:'播放句子和单词',exact:true});
 if(info.project.use.hasTouch){
  await expect(esc).toBeHidden();await expect(space).toBeHidden();
  await expect(playback).not.toHaveAttribute('aria-keyshortcuts','Space');
  return;
 }
 await expect(page.getByRole('button',{name:'不认识',exact:true})).toBeVisible();
 await expect(playback).toHaveAttribute('aria-keyshortcuts','Space');
 await expect(esc).toBeVisible();await expect(space).toBeVisible();
 await page.setViewportSize({width:390,height:844});
 await expect(esc).toBeHidden();await expect(space).toBeHidden();
 await expect(playback).not.toHaveAttribute('aria-keyshortcuts','Space');
});

for(const difficulty of ['easy','medium','hard'])test(`continuous letter-only input inserts sentence separators in free ${difficulty}`,async({page})=>{
 await openCafe(page);
 await page.getByRole('tab',{name:'练听力',exact:true}).click();
 await page.getByLabel('句子练习模式',{exact:true}).selectOption('free');
 await page.getByLabel('听写难度',{exact:true}).selectOption(difficulty);
 await page.clock.install();await page.clock.pauseAt(await page.evaluate(()=>Date.now()+1000));
 if(difficulty==='hard'){
  const field=page.getByRole('textbox',{name:'听写句子',exact:true});
  await field.focus();await field.pressSequentially(sentenceLetters);
  await expect(field).toHaveValue('a croissant is on the wooden plate.');
 }else{
  await page.getByRole('textbox',{name:/第 1 个单词/}).focus();
  await page.keyboard.type(sentenceLetters);
  const values=await page.locator('.guided-input input').evaluateAll(nodes=>nodes.map(node=>(node as HTMLInputElement).value));
  expect(values).toEqual(['a','croissant','is','on','the','wooden','plate']);
 }
});

for(const difficulty of ['easy','medium','hard'])test(`free ${difficulty} dictation checks complete wrong answers without a submit control`,async({page})=>{
 await openCafe(page);
 await page.getByRole('tab',{name:'练听力',exact:true}).click();
 await page.getByLabel('句子练习模式',{exact:true}).selectOption('free');
 await page.getByLabel('听写难度',{exact:true}).selectOption(difficulty);
 await expect(page.getByRole('button',{name:'检查答案',exact:true})).toHaveCount(0);
 await page.clock.install();await page.clock.pauseAt(await page.evaluate(()=>Date.now()+1000));
 const fields=page.locator('.guided-input input,.dictation-input'),words=['A','croissant','is','on','the','wooden','plate.'];
 await fields.first().focus();await page.keyboard.type('x');
 await expect(page.locator('.sentence-feedback')).toHaveCount(0);
 if(difficulty==='hard')await fillEnglish(page.getByRole('textbox',{name:'听写句子',exact:true}),'x'.repeat(sentenceLetters.length));
 else for(const [index,word] of words.entries())await fillEnglish(page.locator('.guided-input input').nth(index),'x'.repeat(word.replace(/[^\p{L}\p{N}]/gu,'').length));
 await expect(page.getByRole('button',{name:'检查答案',exact:true})).toHaveCount(0);
 await expect(page.getByText('再听一次，试着修改答案',{exact:true})).toBeVisible();
 await page.keyboard.press('Backspace');
 await expect(page.getByText('再听一次，试着修改答案',{exact:true})).toHaveCount(0);
 if(difficulty==='hard')await fillEnglish(page.getByRole('textbox',{name:'听写句子',exact:true}),sentenceLetters);
 else for(const [index,word] of words.entries())await fillEnglish(page.locator('.guided-input input').nth(index),word.replace(/[^\p{L}\p{N}]/gu,''));
 await expect(page.locator('.sentence-actions-pending')).toHaveCount(1);
});
for(const difficulty of ['easy','medium'])test(`boundary Backspace returns to the previous ${difficulty} word and deletes its last letter`,async({page})=>{
 await openCafe(page);
 await page.getByRole('tab',{name:'练听力',exact:true}).click();
 await page.getByLabel('句子练习模式',{exact:true}).selectOption('free');
 await page.getByLabel('听写难度',{exact:true}).selectOption(difficulty);
 const first=page.getByRole('textbox',{name:/第 1 个单词/}),second=page.getByRole('textbox',{name:/第 2 个单词/});
 await first.focus();await first.press('a');
 await expect(first).toHaveValue('a');await expect(second).toBeFocused();
 await page.keyboard.press('Backspace');
 await expect(first).toBeFocused();await expect(first).toHaveValue('');
});

test('Space replays exactly once from answer fields and noneditable learning areas; touch has no shortcut',async({page},info)=>{
 await openCafe(page);
 const shortcut=!info.project.use.hasTouch;
 const field=page.getByRole('textbox',{name:'输入英文',exact:true});
 await field.pressSequentially('cr');
 await field.evaluate(node=>node.setSelectionRange(1,1));
 await resetSpeech(page);await page.keyboard.press('Space');
 expect(await field.inputValue()).toBe('cr');expect(await selection(page,'.spelling-input')).toBe(1);
 expect(await playCount(page)).toBe(1); // Existing physical spelling shortcut remains available on narrow/touch pages.

 if(shortcut){
  await resetSpeech(page);
  for(const extra of [{repeat:true},{shiftKey:true},{ctrlKey:true},{altKey:true},{metaKey:true},{isComposing:true}])await field.dispatchEvent('keydown',{key:' ',code:'Space',bubbles:true,cancelable:true,...extra});
  expect(await field.inputValue()).toBe('cr');expect(await selection(page,'.spelling-input')).toBe(1);expect(await playCount(page)).toBe(0);
 }
 await resetSpeech(page);
 await page.locator('.native-practice').evaluate(node=>{(node as HTMLElement).tabIndex=-1;});
 await page.locator('.native-practice').focus();await page.keyboard.press('Space');
 expect(await playCount(page)).toBe(shortcut?1:0);

 await page.getByRole('tab',{name:'练听力',exact:true}).click();
 await page.getByLabel('句子练习模式',{exact:true}).selectOption('free');
 await page.getByLabel('听写难度',{exact:true}).selectOption('easy');
 const guided=page.locator('.guided-input input').nth(1);
 await guided.focus();await guided.pressSequentially('cr');
 const guidedValue=await guided.inputValue();
 await resetSpeech(page);await page.keyboard.press('Space');
 expect(await guided.inputValue()).toBe(guidedValue);expect(await playCount(page)).toBe(shortcut?1:0);

 await page.getByLabel('听写难度',{exact:true}).selectOption('hard');
 const hard=page.getByRole('textbox',{name:'听写句子',exact:true});
 await hard.focus();await hard.press('ControlOrMeta+a');await hard.press('Backspace');await hard.pressSequentially('Iam');
 await hard.evaluate(node=>node.setSelectionRange(1,1));
 const hardValue=await hard.inputValue();
 await resetSpeech(page);await page.keyboard.press('Space');
 expect(await hard.inputValue()).toBe(hardValue);expect(await selection(page,'.dictation-input')).toBe(1);
 expect(await playCount(page)).toBe(shortcut?1:0);

 await page.getByLabel('句子练习模式',{exact:true}).selectOption('chunks');
 await page.locator('.native-practice').focus();
 await resetSpeech(page);await page.keyboard.press('Space');
 expect(await playCount(page)).toBe(shortcut?1:0);

 if(shortcut){
  const playback=page.locator('.playback-button');await playback.focus();
  await resetSpeech(page);await page.keyboard.press('Space');
  await expect.poll(()=>playCount(page)).toBe(1);
 }
});

test('Escape acts once and respects modified, repeated and IME keys, selects, dialogs and chunk menus',async({page},info)=>{
 await openCafe(page);
 const shortcut=!info.project.use.hasTouch;
 const field=page.getByRole('textbox',{name:'输入英文',exact:true}),answer=page.getByText('参考答案',{exact:true});
 await field.pressSequentially('cr');await field.focus();
 for(const extra of [{repeat:true},{shiftKey:true},{ctrlKey:true},{altKey:true},{metaKey:true},{isComposing:true}])await field.dispatchEvent('keydown',{key:'Escape',code:'Escape',bubbles:true,cancelable:true,...extra});
 await expect(field).toHaveValue('cr');
 await page.keyboard.press('Escape');
 await expect(field).toHaveValue('croissant');
 await expect(page.getByRole('button',{name:'下一个',exact:true})).toBeVisible();
 await expect.poll(()=>playCount(page)).toBeGreaterThan(0);
 await resetSpeech(page);await page.keyboard.press('Escape');expect(await field.inputValue()).toBe('croissant');expect(await playCount(page)).toBe(0);

 await page.getByRole('tab',{name:'练听力',exact:true}).click();
 const mode=page.getByLabel('句子练习模式',{exact:true});
 await mode.selectOption('free');await page.getByLabel('听写难度',{exact:true}).selectOption('easy');
 const first=page.getByRole('textbox',{name:/第 1 个单词/});
 await first.focus();
 for(const extra of [{repeat:true},{shiftKey:true},{ctrlKey:true},{altKey:true},{metaKey:true},{isComposing:true}])await first.dispatchEvent('keydown',{key:'Escape',code:'Escape',bubbles:true,cancelable:true,...extra});
 await expect(answer).toHaveCount(0);
 if(!shortcut){await resetSpeech(page);await page.keyboard.press('Escape');await expect(answer).toHaveCount(0);expect(await playCount(page)).toBe(0);return;}
 const playbackWidth=(await page.locator('.native-playback').boundingBox())!.width;
 await resetSpeech(page);await page.keyboard.press('Escape');
 await expect(answer).toBeVisible();await expect.poll(()=>playCount(page)).toBe(1);
 expect((await page.locator('.native-playback').boundingBox())!.width).toBeCloseTo(playbackWidth,0);
 await resetSpeech(page);await page.keyboard.press('Escape');expect(await playCount(page)).toBe(0);

 await page.getByRole('button',{name:'下一个',exact:true}).click();await expect(answer).toHaveCount(0);
 await expect.poll(()=>playCount(page)).toBeGreaterThan(0); // Await the existing delayed next-sentence playback before measuring Escape.
 const difficulty=page.getByLabel('听写难度',{exact:true});await difficulty.focus();
 await resetSpeech(page);await page.keyboard.press('Escape');await expect(answer).toHaveCount(0);expect(await playCount(page)).toBe(0);

 await page.getByRole('button',{name:'当前卡组，学习设置',exact:true}).click();
 const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
 await resetSpeech(page);await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(answer).toHaveCount(0);expect(await playCount(page)).toBe(0);

 await mode.selectOption('chunks');
 await page.locator('.chunk-bank .chunk').first().click();
 const selected=page.locator('.selected-chunk .chunk').first();await selected.focus();
 await selected.dispatchEvent('contextmenu',{bubbles:true,cancelable:true});await expect(page.locator('.chunk-menu')).toBeVisible();
 await resetSpeech(page);await page.keyboard.press('Escape');await expect(page.locator('.chunk-menu')).toHaveCount(0);await expect(answer).toHaveCount(0);expect(await playCount(page)).toBe(0);
 await resetSpeech(page);await page.keyboard.press('Escape');await expect(answer).toBeVisible();await expect.poll(()=>playCount(page)).toBe(1);
});

for(const difficulty of ['easy','medium','hard'])test(`letters alone complete contractions and fixed numbers in ${difficulty}`,async({page})=>{
 await openCafe(page,"I'm in room 3 at 8 pm.");await page.getByRole('tab',{name:'练听力',exact:true}).click();await page.getByLabel('句子练习模式').selectOption('free');await page.getByLabel('听写难度').selectOption(difficulty);
 await page.clock.install();await page.clock.pauseAt(await page.evaluate(()=>Date.now()+1000));
 const fields=page.locator('.guided-input input,.dictation-input');
 if(difficulty!=='hard'){
  await expect(page.locator('.guided-word-fixed')).toHaveText(['3','8']);
  await expect(fields).toHaveCount(5);
 }
 await fields.first().focus();await page.keyboard.type('Iminroomatpm');
 if(difficulty==='hard')await expect(page.getByRole('textbox',{name:'听写句子',exact:true})).toHaveValue("I'm in room 3 at 8 pm.");
 else expect(await fields.evaluateAll(nodes=>nodes.map(n=>(n as HTMLInputElement).value))).toEqual(['Im','in','room','at','pm']);
 await expect(page.locator('.sentence-actions-pending')).toHaveCount(1);await expectLetterKeyboard(page);
});
