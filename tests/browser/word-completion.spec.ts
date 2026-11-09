import {test,expect,type Page} from '@playwright/test';
import path from 'node:path';
import {fillSpelling} from './helpers/spelling';
import {observeCompletionCue} from './helpers/completion-cue';
async function open(page:Page){await page.goto('/piclex-web/#/decks');await expect(page.getByRole('button',{name:'导入自己的卡组'})).toBeEnabled();await page.getByLabel('选择照片卡组文件').setInputFiles(path.resolve('tests/fixtures/demo/decks/cafe.piclexdeck'));await expect(page.getByRole('heading',{name:'牛角包',exact:true})).toBeVisible();}
async function observe(page:Page){
 await observeCompletionCue(page);
 await page.addInitScript(()=>{
  const Original=window.Audio;
  window.Audio=class extends Original{constructor(src?:string){super(src);this.muted=true;}};
  Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{speak:()=>{},cancel:()=>{},getVoices:()=>[]}});
 });
}
test('keyboard deletion and fresh word success match App; completion survives auto-next and restored answers stay silent',async({page},info)=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await observe(page);await page.route('**/audio/correct-word.wav',route=>route.abort());await open(page);const keyboard=page.getByRole('region',{name:'虚拟键盘'}),input=page.getByRole('textbox',{name:'输入英文',exact:true});
 await expect(keyboard.getByRole('button')).toHaveCount(27);await expect(page.locator('.native-answer button')).toHaveCount(0);
 const tap=async(letter:string)=>{const key=keyboard.getByRole('button',{name:letter==='Backspace'?'退格':`按键 ${letter.toUpperCase()}`,exact:true});if(info.project.use.hasTouch)await key.tap();else await key.click();};
 await tap('z');await expect(input).toHaveValue('z');expect(await page.evaluate(()=>(window as any).__cues.started)).toBe(0);await tap('Backspace');await expect(input).toHaveValue('');
 for(const letter of 'croissant')await tap(letter);
 await expect.poll(()=>page.evaluate(()=>(window as any).__cues.started)).toBe(1);await expect(page.getByRole('heading',{name:'勺子',exact:true})).toBeVisible();await expect.poll(()=>page.evaluate(()=>(window as any).__cues.ended)).toBe(1);expect(await page.evaluate(()=>(window as any).__cues.started)).toBe(1);
 // Corrected and first-try answers both earn the cue; the classic key switch only mutes typing.
 await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('button',{name:'个性化设置',exact:true}).click();await page.getByRole('button',{name:/^键盘声音/}).click();await page.getByRole('switch',{name:'键盘敲击音',exact:true}).uncheck();await page.getByRole('button',{name:'学习',exact:true}).click();for(const letter of 'spoon')await tap(letter);
 await expect.poll(()=>page.evaluate(()=>(window as any).__cues.ended)).toBe(2);expect(await page.evaluate(()=>(window as any).__cues.started)).toBe(2);expect(errors).toEqual([]);
 const played=await page.evaluate(()=>(window as any).__cues);expect(played.elapsed).toBeGreaterThanOrEqual(.30);expect(played.output).toBe('running');
 const decoded=await page.evaluate(()=>{const b=(window as any).__cueBuffer as AudioBuffer;return {duration:b.duration,peak:Math.max(...b.getChannelData(0).map(Math.abs))};});expect(decoded.duration).toBeCloseTo(.32,2);expect(decoded.peak).toBeGreaterThan(.01);
 await page.evaluate(()=>{for(const key of Object.keys(localStorage))if(key.startsWith('piclex-web.study.v2.')){const s=JSON.parse(localStorage[key]);s.index=0;s.pending=null;localStorage[key]=JSON.stringify(s);}history.replaceState(history.state,'',location.hash.split('?')[0]);});await page.reload();await expect(input).toHaveValue('croissant');expect(await page.evaluate(()=>(window as any).__cues.started)).toBe(0);
 await page.locator('.playback-button').click();await page.getByRole('tab',{name:'拼单词',exact:true}).click();await page.getByRole('button',{name:'下一个',exact:true}).click();await expect(input).toHaveValue('');await fillSpelling(page,'s');await expect(input).toHaveValue('s');expect(await page.evaluate(()=>(window as any).__cues.started)).toBe(0);await page.getByRole('button',{name:'不认识',exact:true}).click();await page.getByRole('button',{name:'下一个',exact:true}).click();await page.getByRole('button',{name:'不认识',exact:true}).click();expect(await page.evaluate(()=>(window as any).__cues.started)).toBe(0);
});
test('unavailable success audio does not block completion or the next word',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await observe(page);
 await page.addInitScript(()=>{
  (window as any).__failedCueDecodes=0;
  OfflineAudioContext.prototype.decodeAudioData=function(){
   (window as any).__failedCueDecodes++;
   return Promise.reject(new DOMException('Fixture decode failure','EncodingError'));
  };
 });
 await open(page);await fillSpelling(page,'croissant');
 await expect(page.getByRole('heading',{name:'勺子',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>(window as any).__failedCueDecodes)).toBeGreaterThan(0);
 expect(await page.evaluate(()=>(window as any).__cues.started)).toBe(0);
 expect(errors).toEqual([]);
});
