import {test,expect} from '@playwright/test';
import path from 'node:path';
async function open(page:any){
 await page.goto('/piclex-web/#/decks',{waitUntil:'domcontentloaded'});
 await page.getByLabel('选择照片卡组文件').setInputFiles(path.resolve('tests/fixtures/demo/decks/cafe.piclexdeck'));
 await expect(page.getByRole('textbox',{name:'输入英文',exact:true})).toBeVisible();
 await page.evaluate(()=>Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{speak:(u:any)=>{(window as any).__feedbackSpeech=u;},cancel:()=>{},getVoices:()=>[]}}));
}
test('hardware input survives replay focus, protected IME keys, and keeps dialogs isolated',async({page})=>{
 await open(page);const field=page.getByRole('textbox',{name:'输入英文',exact:true});
 await field.press('c');await expect(field).toHaveValue('c');
 await page.locator('.playback-button').click();await page.keyboard.press('r');await expect(field).toHaveValue('cr');
 await page.locator('.playback-button').click();await page.locator('.playback-button').dispatchEvent('keydown',{key:'Process',code:'KeyO',keyCode:229,bubbles:true,cancelable:true});await expect(field).toHaveValue('cro');await field.press('Backspace');
 await field.dispatchEvent('keydown',{key:'Process',code:'KeyO',keyCode:229,bubbles:true,cancelable:true});await expect(field).toHaveValue('cro');
 await field.dispatchEvent('keydown',{key:'你',code:'',keyCode:229,bubbles:true,cancelable:true});await expect(field).toHaveValue('cro');
 await page.getByRole('button',{name:'隐藏中文提示',exact:true}).click();await page.keyboard.press('Backspace');await expect(field).toHaveValue('cr');
 await page.keyboard.press('o');await expect(field).toHaveValue('cro');
 await page.getByRole('button',{name:'当前卡组，学习设置',exact:true}).click();await page.keyboard.press('i');await expect(field).toHaveValue('cro');
 await page.getByRole('button',{name:'关闭',exact:true}).click();await page.keyboard.press('i');await expect(field).toHaveValue('croi');
 await page.getByRole('button',{name:'退格',exact:true}).click();await expect(field).toHaveValue('cro');
});
for(const colorScheme of ['light','dark'] as const)test(`spelling progress stays below glyphs and playback grows from a fixed left edge: ${colorScheme}`,async({page},info)=>{
 await page.emulateMedia({colorScheme});await open(page);const field=page.getByRole('textbox',{name:'输入英文',exact:true});
 await field.pressSequentially('croissa');
 // ResizeObserver updates the SVG viewBox after layout; typing can finish first.
 // Wait for the rendered result while keeping the exact geometry assertions.
 await expect(async()=>{
  const geometry=await page.evaluate(()=>{
   const glyphs=[...document.querySelectorAll('.letter-glyph')].map(e=>e.getBoundingClientRect());
   return [...document.querySelectorAll<SVGPathElement>('.spelling-glow path')].map(p=>({top:p.getBoundingClientRect().top,glyphBottom:Math.max(...glyphs.map(r=>r.bottom)),filter:getComputedStyle(p).filter}));
  });
  expect(geometry).toHaveLength(2);
  for(const g of geometry){expect(g.top).toBeGreaterThanOrEqual(g.glyphBottom);expect(g.filter).toBe('none');}
 }).toPass({timeout:5000});
 await page.locator('.playback-button').click();await page.evaluate(()=>(window as any).__feedbackSpeech.onstart());
 const bar=page.getByRole('progressbar',{name:'播放进度'});await expect.poll(async()=>Number(await bar.getAttribute('aria-valuenow'))).toBeGreaterThan(0);
 const segment=page.locator('.playback-activity'),fill=page.locator('.playback-fill');await expect(segment).toHaveCount(0);
 await expect.poll(async()=>(await fill.boundingBox())!.width).toBeGreaterThan(0);await expect(fill).toHaveCSS('animation-name','none');
 await page.evaluate(()=>(window as any).__feedbackSpeech.onboundary({charIndex:10}));
 await expect.poll(async()=>(await fill.boundingBox())!.width).toBeGreaterThan(0);
 const left=(await bar.boundingBox())!.x;expect((await fill.boundingBox())!.x).toBeCloseTo(left,0);
 await page.evaluate(()=>(window as any).__feedbackSpeech.onboundary({charIndex:20}));
 await expect.poll(async()=>Number(await bar.getAttribute('aria-valuenow'))).toBeGreaterThan(10);
 expect((await fill.boundingBox())!.x).toBeCloseTo(left,0);
 await page.screenshot({path:info.outputPath(`feedback-${colorScheme}.png`)});
 await page.evaluate(()=>(window as any).__feedbackSpeech.onboundary({charIndex:10}));await expect(bar).toHaveAttribute('aria-valuenow',/^[1-9]\d?$/);await expect(segment).toHaveCount(0);
 await page.emulateMedia({reducedMotion:'reduce'});await page.locator('.playback-button').click();await expect(bar).toHaveCount(0);await page.evaluate(()=>(window as any).__feedbackSpeech.onstart());await expect(segment).toHaveCount(0);await expect(fill).toHaveCSS('transition-duration','0s');await expect.poll(async()=>Number(await bar.getAttribute('aria-valuenow'))).toBeGreaterThan(0);
});

// The App marks a mismatch with a red board only. The removed result line used
// to grow the footer and push the photo, playback and keyboard around on phones;
// the answer itself stays in the input line for errors, success and reveal.
for(const colorScheme of ['light','dark'] as const)test(`no result line moves answer, photo, playback or keyboard in error, correct, corrected or revealed states: ${colorScheme}`,async({page},info)=>{
 await page.emulateMedia({colorScheme});await open(page);
 const keyboard=page.getByRole('region',{name:'虚拟键盘'}),answer=page.locator('.native-answer'),feedback=page.locator('.answer-feedback'),field=page.getByRole('textbox',{name:'输入英文',exact:true});
 // Tap/click the key's own coordinates: locator.tap() scrolls the practice
 // surface into view and can spend the 1px of pre-existing horizontal
 // overflow as a scrollLeft shift instead of the layout regression we assert.
 const press=async(key:string)=>{
  const box=await keyboard.getByRole('button',{name:key==='BACKSPACE'?'退格':`按键 ${key}`,exact:true}).boundingBox();
  if(!box)throw new Error(`missing keyboard key ${key}`);
  const x=box.x+box.width/2,y=box.y+box.height/2;
  if(info.project.use.hasTouch)await page.touchscreen.tap(x,y);else await page.mouse.click(x,y);
 };
 const geometry=()=>page.evaluate(()=>{
  const box=(selector:string)=>{const r=document.querySelector(selector)!.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
  return {answer:box('.native-answer'),photo:box('.photo-browse'),playback:box('.native-playback'),keyboard:box('.virtual-keyboard')};
 });
 const border=()=>answer.evaluate(node=>{const style=getComputedStyle(node);return {color:style.borderTopColor,width:style.borderTopWidth};});
 await expect(page.locator('.focus-image')).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>{const image=document.querySelector<HTMLImageElement>('.focus-image');return !!image&&image.complete&&image.naturalWidth>0;})).toBe(true);
 await expect.poll(()=>page.locator('.native-practice').evaluate(node=>node.scrollHeight-node.clientHeight)).toBeLessThanOrEqual(1);
 // Take the baseline only after two consecutive reads agree: the photo budget
 // is measured by ResizeObserver and lands a frame or two after the image.
 let settled:Awaited<ReturnType<typeof geometry>>|undefined;
 await expect.poll(async()=>{const current=await geometry(),same=settled!==undefined&&JSON.stringify(current)===JSON.stringify(settled);settled=current;return same;},{intervals:[100,150,250,400]}).toBe(true);
 const baseline=await geometry();
 const stable=async(label:string)=>{
  expect(await page.locator('.native-practice').evaluate(node=>node.scrollLeft)).toBe(0);
  const current=await geometry();
  for(const key of ['answer','photo','playback','keyboard'] as const){
   const before=baseline[key],after=current[key];
   expect(after.x,`${label} ${key} x`).toBeCloseTo(before.x,0);
   expect(after.y,`${label} ${key} y`).toBeCloseTo(before.y,0);
   expect(after.width,`${label} ${key} width`).toBeCloseTo(before.width,0);
   expect(after.height,`${label} ${key} height`).toBeCloseTo(before.height,0);
  }
 };
 const recovered=async()=>{await expect(answer).not.toHaveClass(/wrong/);await expect(feedback).toHaveCount(0);expect((await border()).color).not.toBe('rgb(198, 68, 68)');};
 await press('C');await press('R');await press('X');
 await expect(field).toHaveValue('crx');await expect(answer).toHaveClass(/wrong/);await expect(feedback).toHaveCount(0);await expect(page.getByText('请删除错误字母后继续输入')).toHaveCount(0);
 const error=await border();expect(error.color).toBe('rgb(198, 68, 68)');expect(['1px','2px']).toContain(error.width);
 await stable('first error');await page.screenshot({path:info.outputPath(`spelling-error-${colorScheme}.png`)});
 await press('BACKSPACE');await expect(field).toHaveValue('cr');await recovered();await stable('deleted back to the correct prefix');
 await press('X');await expect(field).toHaveValue('crx');await expect(answer).toHaveClass(/wrong/);await expect(feedback).toHaveCount(0);await stable('second error');
 await press('BACKSPACE');await press('O');await expect(field).toHaveValue('cro');await recovered();await stable('correct prefix after the second error');
 await page.screenshot({path:info.outputPath(`spelling-recovered-${colorScheme}.png`)});
 // Freeze the 300ms auto-advance so the transient completion states can be
 // measured without racing the next word. Earlier errors make this first word
 // a correction; the next two words cover plain success and reveal.
 await page.clock.install();await page.clock.pauseAt(await page.evaluate(()=>Date.now()+1000));
 for(const key of ['I','S','S','A','N','T'] as const)await press(key);
 await expect(field).toHaveValue('croissant');await expect(answer).not.toHaveClass(/wrong/);await expect(feedback).toHaveCount(0);await stable('corrected answer');
 await page.clock.runFor(400);await expect(field).toHaveValue('');await expect(page.locator('.native-hint h1')).toHaveText('勺子');
 for(const key of ['S','P','O','O','N'] as const)await press(key);
 await expect(field).toHaveValue('spoon');await expect(answer).not.toHaveClass(/wrong/);await expect(feedback).toHaveCount(0);await stable('correct answer');
 await page.clock.runFor(400);await expect(field).toHaveValue('');await expect(page.locator('.native-hint h1')).toHaveText('叉子');
 await page.getByRole('button',{name:/^不认识/}).click();
 await expect(field).toHaveValue('fork');await expect(answer).not.toHaveClass(/wrong/);await expect(feedback).toHaveCount(0);await stable('revealed answer');
});
