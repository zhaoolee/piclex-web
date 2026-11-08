import {test,expect,type Page,type Locator} from '@playwright/test';
import path from 'node:path';
async function keyboardIsUncovered(page:Page){
 const keyboard=page.getByRole('region',{name:'虚拟键盘'});
 await expect(keyboard).toBeVisible();
 await expect.poll(()=>keyboard.locator('button').evaluateAll(keys=>keys.every(key=>{
  const box=key.getBoundingClientRect(),bar=document.querySelector('.app-tabs')!.getBoundingClientRect();
  return box.top>=0&&box.bottom<=bar.top&&box.bottom<=visualViewport!.height&&key.contains(document.elementFromPoint(box.x+box.width/2,box.y+box.height/2));
 }))).toBe(true);
 expect(await page.locator('.native-practice').evaluate(n=>n.scrollHeight-n.clientHeight)).toBeLessThanOrEqual(1);
}
test('every keyboard row stays clickable with browser chrome, short screens and mode changes',async({page},info)=>{
 test.setTimeout(90000);
 await page.goto('/piclex-web/#/decks');await expect(page.getByRole('button',{name:'导入自己的卡组'})).toBeEnabled();
 await page.getByLabel('选择照片卡组文件').setInputFiles(path.resolve('tests/fixtures/demo/decks/cafe.piclexdeck'));
 const activate=async(key:Locator)=>info.project.use.hasTouch?key.tap():key.click();
 // These are usable page heights, after the phone browser has taken its bars.
 for(const size of [{width:390,height:668},{width:393,height:640},{width:320,height:568},{width:390,height:430},{width:844,height:390},{width:390,height:844}]){
  await page.setViewportSize(size);await page.getByRole('tab',{name:'拼单词',exact:true}).click();
  await keyboardIsUncovered(page);
  const spelling=page.getByRole('textbox',{name:'输入英文',exact:true});await spelling.click();
  await expect(spelling).toHaveAttribute('readonly','');await expect(spelling).toHaveAttribute('inputmode','none');
  const keyboard=page.getByRole('region',{name:'虚拟键盘'});
  await activate(keyboard.getByRole('button',{name:'按键 Z',exact:true}));await expect(spelling).toHaveValue('z');
  await keyboardIsUncovered(page);await expect(page.locator('.native-answer').getByRole('button',{name:'退格',exact:true})).toHaveCount(0);await activate(keyboard.getByRole('button',{name:'退格',exact:true}));await expect(spelling).toHaveValue('');
  if(size.height===668)await page.screenshot({path:info.outputPath('spelling-browser-chrome.png')});
  await page.getByRole('tab',{name:'练听力',exact:true}).click();await page.getByLabel('句子练习模式',{exact:true}).selectOption('free');
  for(const difficulty of ['hard','easy','medium']){
   await page.getByLabel('听写难度',{exact:true}).selectOption(difficulty);
   await keyboardIsUncovered(page);
   const fields=page.locator('.guided-input input,.dictation-input');
   for(const field of await fields.all()){await expect(field).toHaveAttribute('readonly','');await expect(field).toHaveAttribute('inputmode','none');}
   const first=fields.first();await first.click();await first.press('ControlOrMeta+a');
   // A complete lower keyboard row must work without scrolling the page to it.
   await activate(keyboard.getByRole('button',{name:'按键 Z',exact:true}));await expect(first).toHaveValue('z');
   await first.focus();await first.press('End');await activate(keyboard.getByRole('button',{name:'退格',exact:true}));await expect(first).toHaveValue('');
   await keyboardIsUncovered(page);
   if(size.height===668&&difficulty==='hard')await page.screenshot({path:info.outputPath('dictation-browser-chrome.png')});
  }
  for(const mode of ['chunks','listening']){await page.getByLabel('句子练习模式',{exact:true}).selectOption(mode);await expect(keyboard).toHaveCount(0);}
 }
});
test('hard dictation accepts hardware editing and English paste while remaining keyboard protected',async({page})=>{
 await page.goto('/piclex-web/#/decks');await expect(page.getByRole('button',{name:'导入自己的卡组'})).toBeEnabled();
 await page.getByLabel('选择照片卡组文件').setInputFiles(path.resolve('tests/fixtures/demo/decks/cafe.piclexdeck'));
 await page.getByRole('tab',{name:'练听力',exact:true}).click();await page.getByLabel('句子练习模式').selectOption('free');await page.getByLabel('听写难度').selectOption('hard');
 const field=page.getByRole('textbox',{name:'听写句子',exact:true});await field.pressSequentially('hello');await expect(field).toHaveValue('h ello');await field.press('ArrowLeft');await field.press('Backspace');await expect(field).toHaveValue('h elo');expect(await field.evaluate((node:HTMLTextAreaElement)=>node.selectionStart)).toBe(4);
 await field.press('ControlOrMeta+a');await field.evaluate(node=>{const data=new DataTransfer();data.setData('text/plain','hello world');node.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}));});
 await expect(field).toHaveValue('hello world');await expect(field).toHaveAttribute('readonly','');
 await page.reload();await expect(field).toHaveValue('hello world');await expect(field).toHaveAttribute('inputmode','none');await keyboardIsUncovered(page);
});
