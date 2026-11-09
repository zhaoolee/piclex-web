import {test,expect,type Locator,type Page} from '@playwright/test';
import fs from 'node:fs';
import {fillEnglish} from './helpers/spelling';

const catalog=JSON.parse(fs.readFileSync('apps/public/public/library/catalog.json','utf8'));
const sentenceDeck=catalog.find((deck:{title:string})=>deck.title==='程序员工作英语');
const basicDeck=catalog[0];

// Hold only after navigation and the word geometry have settled.
async function settleWord(control:Locator){
 await control.scrollIntoViewIfNeeded();
 await control.evaluate(node=>new Promise<void>(resolve=>{
  let previous='',stableSince=performance.now();
  const frame=()=>{
   const box=node.getBoundingClientRect(),body=node.closest('.native-body');
   const next=JSON.stringify([box.x,box.y,box.width,box.height,body?.scrollTop]);
   if(next!==previous){previous=next;stableSince=performance.now();}
   if(performance.now()-stableSince>=250){resolve();return;}
   requestAnimationFrame(frame);
  };requestAnimationFrame(frame);
 }));
}

async function openGuided(page:any,difficulty='easy'){
 await page.goto('/piclex-web/#/deck/'+sentenceDeck.id);
 await page.getByRole('tab',{name:'练听力',exact:true}).click();
 await page.getByLabel('句子练习模式',{exact:true}).selectOption('free');
 await page.getByLabel('听写难度',{exact:true}).selectOption(difficulty);
}

test('guided actual-word hold shows English and Chinese, then releases without changing focus or draft',async({page},info)=>{
 await page.route('**/dictionary/h.json',route=>route.fulfill({json:{hi:'嗨；你好'}}));
 await openGuided(page,'easy');
 const words=page.locator('.guided-word'),fields=words.locator('input');
 await expect(words).toHaveCount(3);
 const first=words.first();await settleWord(first);const box=await first.boundingBox();
 await page.mouse.move(box!.x+12,box!.y+14);await page.mouse.down();await page.waitForTimeout(430);
 const tooltip=page.locator('.word-peek');
 await expect(tooltip).toBeVisible();
 await expect(tooltip.locator('.word-peek-english')).toHaveText('Hi');
 await expect(tooltip.locator('.word-peek-meaning')).toHaveText('嗨；你好');
 await page.mouse.up();await expect(tooltip).toHaveCount(0);
 await expect(fields.first()).toHaveValue('');
 await fields.first().focus();
 await fillEnglish(fields.first(),'Hi');
 await expect(fields.first()).toHaveValue('Hi');await expect(page.locator('.guided-input input:focus')).toHaveCount(1);
 const focusedLabel=await page.locator('.guided-input input:focus').getAttribute('aria-label');
 await settleWord(first);const filledBox=await first.boundingBox();await page.mouse.move(filledBox!.x+8,filledBox!.y+14);await page.mouse.down();
 await expect(tooltip).toBeVisible();
 expect(await page.locator('.guided-input input:focus').getAttribute('aria-label')).toBe(focusedLabel);
 if(info.project.name==='mobile'){
  await page.screenshot({path:'../web-peek-light.png'});
  await page.emulateMedia({colorScheme:'dark'});await page.screenshot({path:'../web-peek-dark.png'});
 }
 await page.mouse.up();await expect(tooltip).toHaveCount(0);
 expect(await page.locator('.guided-input input:focus').getAttribute('aria-label')).toBe(focusedLabel);

 await expect(page.locator('.peek-letter')).toHaveCount(0);
 await expect(fields.first()).toHaveValue('Hi');
});

test('hard-input hold peeks an existing written word and a late dictionary reply cannot resurrect it',async({page})=>{
 let release!:()=>void;
 const gate=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/dictionary/h.json',async route=>{await gate;await route.fulfill({json:{hi:'嗨；你好'}});});
 await openGuided(page,'hard');
 const sentence=page.getByRole('textbox',{name:'听写句子',exact:true});
 await fillEnglish(sentence,'Hi');
 const box=await sentence.boundingBox();
 await page.mouse.move(box!.x+18,box!.y+20);await page.mouse.down();await page.waitForTimeout(430);
 const tooltip=page.locator('.word-peek');
 await expect(tooltip).toBeVisible();
 await expect(tooltip.locator('.word-peek-english')).toHaveText('Hi');
 await page.mouse.up();await expect(tooltip).toHaveCount(0);
 release();await page.waitForTimeout(150);
 await expect(tooltip).toHaveCount(0);
 await expect(sentence).toHaveValue('Hi');await expect(sentence).toBeFocused();
});

test('successful chunks hide Next and the challenge row while auto-advance runs once',async({page})=>{
 await page.goto('/piclex-web/#/deck/'+basicDeck.id);
 await page.getByRole('tab',{name:'练听力',exact:true}).click();
 const bank=page.getByLabel('待选词块');
 for(const text of ['I','am','still','in','bed.'])await bank.getByRole('button',{name:text,exact:true}).click();
 await expect(page.locator('.sentence-actions-pending')).toHaveCount(1);
 await expect(page.locator('.sentence-feedback')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'下一个',exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'挑战自由听写',exact:true})).toHaveCount(0);
 const before=page.url();
 await expect.poll(()=>page.url(),{timeout:2500}).not.toBe(before);
 const after=page.url();
 await page.waitForTimeout(1200);
 expect(page.url()).toBe(after);
});

test('paused automatic advance and assisted answers keep a manual Next fallback',async({page})=>{
 await page.goto('/piclex-web/#/deck/'+basicDeck.id);
 await page.getByRole('tab',{name:'练听力',exact:true}).click();
 const bank=page.getByLabel('待选词块');
 for(const text of ['I','am','still','in','bed.'])await bank.getByRole('button',{name:text,exact:true}).click();
 await page.getByRole('button',{name:'播放句子',exact:true}).click();
 await expect(page.getByRole('button',{name:'挑战自由听写',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'下一个',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'下一个',exact:true}).click();
 await page.getByRole('button',{name:'听不懂',exact:true}).click();
 await expect(page.locator('.sentence-feedback[role=status]')).toContainText('参考答案');
 await expect(page.getByRole('button',{name:'下一个',exact:true})).toBeVisible();
});

test('hard word help targets the pointed word instead of the old caret and ignores blank space',async({page},info)=>{
 await openGuided(page);
 const second=page.locator('.guided-word').nth(1);
 await settleWord(second);await second.hover();await page.mouse.down();
 const tooltip=page.getByRole('tooltip');await expect(tooltip).toBeVisible();
 const expected=await tooltip.locator('.word-peek-english').innerText();await page.mouse.up();
 await page.getByLabel('听写难度',{exact:true}).selectOption('hard');
 const field=page.getByRole('textbox',{name:'听写句子',exact:true});await fillEnglish(field,'xxyy');
 const fieldValue=await field.inputValue();expect(fieldValue.replace(/[^a-z]/gi,'')).toBe('xxyy');const split=fieldValue.indexOf(' ');expect(split).toBeGreaterThan(0);
 const point=await field.evaluate((node:HTMLTextAreaElement,{value,split})=>{
  node.setSelectionRange(0,0);const box=node.getBoundingClientRect(),css=getComputedStyle(node),ctx=document.createElement('canvas').getContext('2d')!;ctx.font=css.font;
  return {x:box.left+node.clientLeft+parseFloat(css.paddingLeft)+ctx.measureText(value.slice(0,split+1)).width+ctx.measureText(value[split+1]||value[split]).width/2,y:box.top+node.clientTop+parseFloat(css.paddingTop)+parseFloat(css.lineHeight)/2};
 },{value:fieldValue,split});
 await page.mouse.move(point.x,point.y);
 if(!info.project.use.hasTouch){
  await expect(tooltip.locator('.word-peek-english')).toHaveText(expected);
  expect(await field.evaluate((node:HTMLTextAreaElement)=>node.selectionStart)).toBe(0);
 }
 await page.mouse.down();await expect(tooltip).toBeVisible();
 await expect(tooltip.locator('.word-peek-english')).toHaveText(expected);
 expect(await field.evaluate((node:HTMLTextAreaElement)=>node.selectionStart)).toBe(0);
 await page.mouse.up();await expect(tooltip).toHaveCount(0);await expect(field).toHaveValue(fieldValue);
 expect(await field.evaluate((node:HTMLTextAreaElement)=>node.selectionStart)).toBe(0);
 const box=await field.boundingBox();await page.mouse.move(box!.x+box!.width-6,box!.y+box!.height-6);await page.mouse.down();
 await page.waitForTimeout(500);await expect(tooltip).toHaveCount(0);await page.mouse.up();
});

test('a pending hold is cancelled by difficulty changes and scrolling before it can reveal',async({page})=>{
 await openGuided(page);
 const word=page.locator('.guided-word').first(),box=await word.boundingBox();
 await page.mouse.move(box!.x+8,box!.y+14);await page.mouse.down();
 await page.getByLabel('听写难度',{exact:true}).selectOption('medium');
 await page.waitForTimeout(500);await expect(page.getByRole('tooltip')).toHaveCount(0);await page.mouse.up();
 const next=await word.boundingBox();await page.mouse.move(next!.x+8,next!.y+14);await page.mouse.down();
 await page.locator('.sentence-content').evaluate(node=>node.dispatchEvent(new Event('scroll')));
 await page.waitForTimeout(500);await expect(page.getByRole('tooltip')).toHaveCount(0);await page.mouse.up();
});

test('failed dictionary loads can retry on a later hold',async({page})=>{
 let requests=0;await page.route('**/dictionary/h.json',route=>++requests===1?route.abort():route.fulfill({json:{hi:'嗨；你好'}}));
 await openGuided(page);const word=page.locator('.guided-word').first();
 await settleWord(word);await word.hover();await page.mouse.down();await expect(page.getByRole('tooltip')).toContainText('释义暂不可用');await page.mouse.up();
 await page.mouse.down();await expect(page.getByRole('tooltip')).toContainText('嗨；你好');await page.mouse.up();expect(requests).toBe(2);
});

for(const scenario of [{difficulty:'easy'},{difficulty:'medium'},{difficulty:'hard'},{difficulty:'hard',viewport:{width:390,height:667}},{difficulty:'hard',viewport:{width:844,height:390}}])test(`free ${scenario.difficulty}${scenario.viewport?` ${scenario.viewport.width}x${scenario.viewport.height}`:''} success preserves button dimensions without a success row or transient Next`,async({page},info)=>{
 const {difficulty}=scenario;if(scenario.viewport)await page.setViewportSize(scenario.viewport);
 await openGuided(page,difficulty);
 await page.evaluate(()=>{
  (window as any).__nextFlashes=0;
  new MutationObserver(()=>{if([...document.querySelectorAll('button')].some(button=>button.textContent?.trim()==='下一个'))(window as any).__nextFlashes++;}).observe(document.querySelector('.native-practice')!,{childList:true,subtree:true});
 });
 const controls=page.locator('.sentence-footer');
 const measure=()=>controls.evaluate(node=>{
  const rect=(selector:string)=>{const r=node.querySelector(selector)!.getBoundingClientRect();return {width:r.width,height:r.height};};
  return {replay:rect('.playback-button'),rate:rect('.playback-rate'),actions:rect('.sentence-actions'),height:node.getBoundingClientRect().height};
 });
 const before=await measure(),url=page.url();
 if(difficulty==='hard')await fillEnglish(page.getByRole('textbox',{name:'听写句子',exact:true}),'HiImAlex');
 else for(const [i,word] of ['Hi',"I'm",'Alex'].entries())await fillEnglish(page.locator('.guided-input input').nth(i),word);
 await expect(page.locator('.sentence-actions-pending')).toHaveCount(1);
 await expect(page.locator('.sentence-feedback')).toHaveCount(0);
 await expect(page.getByText('听写正确！',{exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'下一个',exact:true})).toHaveCount(0);
 expect(await measure()).toEqual(before);
 if(info.project.name==='mobile')await page.screenshot({path:info.outputPath(`stable-${difficulty}-complete.png`)});
 await expect.poll(()=>page.url(),{timeout:2500}).not.toBe(url);
 expect(await measure()).toEqual(before);
 expect(await page.evaluate(()=>(window as any).__nextFlashes)).toBe(0);
});

const programmer=JSON.parse(fs.readFileSync('apps/public/public/'+sentenceDeck.payload,'utf8'));
const progressWord=programmer.words.find((word:{example:string})=>word.example.includes("Here's my progress:"));
const progressURL=(sentence:string,difficulty='easy')=>'/piclex-web/#/deck/'+sentenceDeck.id+'?'+new URLSearchParams({module:'listening',mode:'free',difficulty,word:progressWord.id,sentence});
async function isolateSpeech(page:Page){
 await page.addInitScript(()=>Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{
  getVoices:()=>[],cancel(){},speak(utterance:SpeechSynthesisUtterance){queueMicrotask(()=>{utterance.onstart?.(new Event('start') as SpeechSynthesisEvent);utterance.onend?.(new Event('end') as SpeechSynthesisEvent);});}
 }}));
}

test('desktop free dictation resumes on a background click and shows a bilingual hover without moving the caret',async({page},info)=>{
 test.skip(!!info.project.use.hasTouch,'Desktop mouse interaction');
 await isolateSpeech(page);
 await page.goto(progressURL('1'));
 const fields=page.locator('.guided-word input'),second=fields.nth(1);
 await fields.first().pressSequentially('heres');
 await expect(second).toBeFocused();
 await page.keyboard.press('m');
 const progress=page.locator('.guided-word').nth(2);
 await settleWord(progress);
 const punctuation=page.locator('.guided-punctuation').first();
 await page.screenshot({path:info.outputPath('desktop-dictation.png'),fullPage:true});
 expect.soft(await punctuation.evaluate(node=>parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(16);
 await progress.hover();
 const tooltip=page.getByRole('tooltip');
 await expect.soft(tooltip.locator('.word-peek-english')).toHaveText('progress',{timeout:1500});
 await expect.soft(tooltip.locator('.word-peek-meaning')).toHaveText('进展',{timeout:1500});
 await expect(second).toBeFocused();
 await page.screenshot({path:info.outputPath('desktop-hover.png'),fullPage:true});
 await page.locator('.sentence-toolbar').click({position:{x:240,y:14}});
 await expect(tooltip).toHaveCount(0);
 await expect(second).toBeFocused();
 await page.keyboard.press('y');
 await expect(second).toHaveValue('my');
 await expect(fields.nth(2)).toBeFocused();
 await page.getByLabel('听写难度').focus();
 await expect(page.getByLabel('听写难度')).toBeFocused();
 await page.locator('.sentence-toolbar').click({position:{x:240,y:14}});
 await expect(fields.nth(2)).toBeFocused();
 await page.keyboard.press('p');
 await expect(fields.nth(2)).toHaveValue('p');
 // Headless tabs emulate focus independently; exercise window re-entry from a
 // blurred field in addition to the real pointer click above.
 await page.evaluate(()=>{(document.activeElement as HTMLElement)?.blur();window.dispatchEvent(new FocusEvent('focus'));});
 await expect(fields.nth(2)).toBeFocused();
 await page.keyboard.press('r');
 await expect(fields.nth(2)).toHaveValue('pr');
});

async function observeCompletionCue(page:Page){
 await page.addInitScript(()=>{
  const w=window as any,start=AudioBufferSourceNode.prototype.start,decode=OfflineAudioContext.prototype.decodeAudioData;
  w.__cues={started:0,ended:0};
  OfflineAudioContext.prototype.decodeAudioData=function(data){return decode.call(this,data).then(buffer=>{w.__cueBuffer=buffer;return buffer;});};
  AudioBufferSourceNode.prototype.start=function(...args){
   if(this.buffer&&this.buffer===w.__cueBuffer){
    w.__cues.started++;w.__cues.scheduled=performance.now();
    w.__cues.duration=this.buffer.duration;w.__cues.output=this.context.state;
    const startTime=this.context.currentTime;
    this.addEventListener('ended',()=>{w.__cues.ended++;w.__cues.elapsed=this.context.currentTime-startTime;},{once:true});
   }
   start.apply(this,args);
  };
  document.addEventListener('animationstart',event=>{
   if(/^letter-gold-(slide|sweep)$/.test(event.animationName))w.__cues.animation??=performance.now();
  },true);
 });
}

for(const difficulty of ['easy','medium','hard'])test(`fresh free ${difficulty} completion lights the full answer and plays the spelling cue once`,async({page},info)=>{
 await isolateSpeech(page);
 await observeCompletionCue(page);
 // The first success must use the original cue even when the standalone WAV
 // is unavailable on a cold network.
 await page.route('**/audio/correct-word.wav',route=>route.abort());
 const wrapped=difficulty==='easy'&&!!info.project.use.hasTouch;
 const letters=wrapped?'Heresmyprogressthesearchfeatureisreadyforreview':'Onetestisfailing';
 await page.goto(progressURL(wrapped?'1':'3',difficulty));
 const answer=page.locator(difficulty==='hard'?'.hard-dictation-peek':'.guided-input');
 const background=await answer.evaluate(node=>getComputedStyle(node).backgroundColor);
 const url=page.url();
 if(difficulty==='hard')await page.getByRole('textbox',{name:'听写句子'}).pressSequentially(letters);
 else if(wrapped){
  for(const letter of letters.toLowerCase())await page.locator(`.virtual-key[data-key="${letter}"]`).tap();
 }
 else{
  await answer.locator('input').first().focus();
  await page.keyboard.type(letters);
 }
 await expect(page.locator('.sentence-actions-pending')).toHaveCount(1);
 await expect(answer).toHaveClass(/gold-sweep/);
 const paint=await answer.evaluate(node=>{
  const layers=[...node.querySelectorAll('.dictation-gold-text,.dictation-gold-row')],styles=layers.map(layer=>getComputedStyle(layer));
  const masks=[...node.querySelectorAll('.dictation-gold-mask')];
  const glyphs=[...node.querySelectorAll('.guided-letters .letter-glyph')];
  const rows=new Set(glyphs.map(glyph=>glyph.getBoundingClientRect().top)).size;
  const band=masks[0]?getComputedStyle(masks[0],'::after'):styles[0];
  return {count:layers.length,rows,glyphs:glyphs.length,allClipped:masks.length?masks.length===layers.length&&masks.every(mask=>getComputedStyle(mask).maskImage.startsWith('url("data:image/png;base64,')):styles.every(style=>style.backgroundClip==='text'),
   animation:band?.animationName,palette:band?.backgroundImage,halo:styles[0]?.filter,
   background:getComputedStyle(node).backgroundColor,boardOverlay:getComputedStyle(node,'::after').content};
 });
 expect(paint.count).toBe(difficulty==='easy'?paint.rows:difficulty==='medium'?4:1);
 if(difficulty==='easy')expect(paint.glyphs).toBe(letters.length);
 if(wrapped)expect(paint.rows).toBeGreaterThan(1);
 expect(paint.allClipped).toBe(true);expect(paint.palette).toContain('rgb(255, 247, 196)');
 expect(paint.animation).toBe(difficulty==='easy'?'letter-gold-slide':'letter-gold-sweep, letter-gold-fade');
 expect(paint.halo).toContain('4px');expect(paint.halo).toContain('10px');
 expect(paint.background).toBe(background);expect(paint.boardOverlay).toBe('none');
 const cue=()=>page.evaluate(()=>(window as any).__cues);
 await expect.poll(cue).toMatchObject({started:1,ended:1,duration:expect.closeTo(.32,2),output:'running',animation:expect.any(Number)});
 const timing=await cue();
 expect(timing.elapsed).toBeGreaterThanOrEqual(.30);
 expect(Math.abs(timing.scheduled-timing.animation)).toBeLessThan(100);
 await info.attach('completion-cue-timing',{body:JSON.stringify(timing),contentType:'application/json'});
 if(info.project.name==='desktop'){
  await answer.evaluate(node=>{
   for(const animation of node.getAnimations({subtree:true})){
    if(!(animation instanceof CSSAnimation)||!animation.animationName.startsWith('letter-gold-'))continue;
    animation.pause();animation.currentTime=140;
   }
  });
  await page.screenshot({path:info.outputPath('sentence-gold.png'),fullPage:true});
 }
 await expect.poll(()=>page.url()).not.toBe(url);
 await expect(answer).not.toHaveClass(/gold-sweep/);
 await page.getByRole('button',{name:'听不懂',exact:true}).click();
 await expect(page.getByText('参考答案',{exact:true})).toBeVisible();
 expect((await cue()).started).toBe(1);
});

test('a delayed cue decode never rings after the sentence feedback has started',async({page})=>{
 await isolateSpeech(page);
 await observeCompletionCue(page);
 await page.addInitScript(()=>{
  const decode=OfflineAudioContext.prototype.decodeAudioData;
  const gate=new Promise<void>(resolve=>{(window as any).__releaseCueDecode=resolve;});
  OfflineAudioContext.prototype.decodeAudioData=function(data){return gate.then(()=>decode.call(this,data));};
 });
 const releaseAudio=()=>page.evaluate(()=>(window as any).__releaseCueDecode?.());
 try{
  await page.goto(progressURL('3'));
  const board=page.locator('.guided-input');
  await board.locator('input').first().focus();
  const url=page.url();
  await page.keyboard.type('Onetestisfailing');
  await expect(board).toHaveClass(/gold-sweep/,{timeout:500});
  expect(await page.evaluate(()=>(window as any).__cues.started)).toBe(0);
  await releaseAudio();
  await expect.poll(()=>page.evaluate(()=>!!(window as any).__cueBuffer)).toBe(true);
  await expect.poll(()=>page.url()).not.toBe(url);
  expect(await page.evaluate(()=>(window as any).__cues.started)).toBe(0);
 }finally{await releaseAudio().catch(()=>{});}
});
