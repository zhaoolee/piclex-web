import {test,expect,type Page,type Locator} from '@playwright/test';
import path from 'node:path';
async function press(locator:Locator,touch:boolean){if(touch)await locator.tap();else await locator.click();}
async function mockSpeech(page:Page){
 await page.evaluate(()=>{
  const w=window as any;w.__utterances=[];
  Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{speak:(utterance:any)=>{w.__utterances.push(utterance);},cancel:()=>{},getVoices:()=>[]}});
 });
}
async function emit(page:Page,event:string,index=-1,detail:any={}){
 await page.evaluate(({event,index,detail})=>{const u=(window as any).__utterances.at(index);if(!u)throw new Error('Expected a queued utterance');u['on'+event]?.(detail);},{event,index,detail});
}
async function open(page:Page){
 await page.goto('/piclex-web/#/decks');
 await expect(page.getByRole('button',{name:'导入自己的卡组',exact:true})).toBeEnabled();
 await page.getByLabel('选择照片卡组文件').setInputFiles(path.resolve('tests/fixtures/demo/decks/cafe.piclexdeck'));
 await expect(page.getByRole('heading',{name:'牛角包',exact:true})).toBeVisible();
}
test('App replay button keeps its geometry and fills in place across sentence, word, replay and rate change',async({page},info)=>{
 // Return to idle through the real module controls after first-entry autoplay.
 await open(page);await page.getByRole('tab',{name:'练听力',exact:true}).click();await page.getByRole('tab',{name:'拼单词',exact:true}).click();await mockSpeech(page);const touch=!!info.project.use.hasTouch;
 const button=page.locator('.playback-button'),bar=page.getByRole('progressbar',{name:'播放进度'}),row=page.locator('.native-playback');
 await expect(button.locator('.playback-label')).toHaveText('播放句子和单词');const before=await row.boundingBox(),buttonBefore=await button.boundingBox();
 await press(button,touch);await expect(button.locator('.playback-label')).toHaveText('准备音频…');await expect(bar).toHaveCount(0);
 await emit(page,'start');await expect(button.locator('.playback-label')).toHaveText('重新播放');await expect(bar).toBeVisible();
 await expect(page.getByRole('button',{name:'停止播放'})).toHaveCount(0);await expect(row.getByRole('button')).toHaveCount(1);
 await emit(page,'boundary',-1,{charIndex:10});await expect.poll(async()=>Number(await bar.getAttribute('aria-valuenow'))).toBeGreaterThan(0);
 expect(await row.boundingBox()).toEqual(before);expect(await button.boundingBox()).toEqual(buttonBefore);
 await press(page.getByRole('region',{name:'虚拟键盘'}).getByRole('button',{name:'按键 C',exact:true}),touch);
 await expect(page.getByRole('textbox',{name:'输入英文',exact:true})).toHaveValue('c');
 await page.screenshot({path:info.outputPath('playback-progress.png')});
 await press(button,touch);await expect(button.locator('.playback-label')).toHaveText('准备音频…');await emit(page,'boundary',0,{charIndex:40});await emit(page,'end',0);
 await expect.poll(()=>page.evaluate(()=>(window as any).__utterances.length)).toBe(2);await expect(bar).toHaveCount(0);
 await emit(page,'start');await emit(page,'boundary',-1,{charIndex:12});
 await page.getByLabel('播放速度',{exact:true}).selectOption('0.75');
 await expect.poll(()=>page.evaluate(()=>(window as any).__utterances.at(-1).rate)).toBe(.75);await expect(button.locator('.playback-label')).toHaveText('准备音频…');
 await emit(page,'start');await emit(page,'end');
 await expect.poll(()=>page.evaluate(()=>(window as any).__utterances.at(-1).text)).toBe('croissant');
 const halfway=Number(await bar.getAttribute('aria-valuenow'));expect(halfway).toBeGreaterThan(0);expect(halfway).toBeLessThan(100);
 await emit(page,'start');await emit(page,'boundary',-1,{charIndex:4});expect(Number(await bar.getAttribute('aria-valuenow'))).toBeGreaterThanOrEqual(halfway);
 await emit(page,'end');await expect(button.locator('.playback-label')).toHaveText('播放句子和单词');await expect(bar).toHaveCount(0);
 await emit(page,'start');await emit(page,'end');await expect(button.locator('.playback-label')).toHaveText('播放句子和单词');
 await expect(page.getByRole('textbox',{name:'输入英文',exact:true})).toHaveValue('c');
});
test('errors, mode changes and leaving the page clear progress and reject old callbacks',async({page},info)=>{
 await open(page);await mockSpeech(page);const touch=!!info.project.use.hasTouch,button=page.locator('.playback-button');
 await press(button,touch);await emit(page,'start');await emit(page,'boundary',-1,{charIndex:8});await emit(page,'error',-1,{error:'network'});
 await expect(button.locator('.playback-label')).toHaveText('播放句子和单词');await expect(page.getByRole('progressbar',{name:'播放进度'})).toHaveCount(0);
 await emit(page,'start');await expect(button.locator('.playback-label')).toHaveText('播放句子和单词');
 await press(button,touch);await emit(page,'start');await press(page.getByRole('tab',{name:'练听力',exact:true}),touch);
 await expect(button.locator('.playback-label')).toHaveText('播放句子');await emit(page,'boundary',-1,{charIndex:20});await emit(page,'end');await expect(button.locator('.playback-label')).toHaveText('播放句子');
 await press(button,touch);await emit(page,'start');await emit(page,'boundary',-1,{charIndex:8});
 await expect(page.getByRole('progressbar',{name:'播放进度'})).toBeVisible();await expect(page.locator('.native-playback').getByRole('button')).toHaveCount(1);
 await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));await expect(button.locator('.playback-label')).toHaveText('播放句子');
 await emit(page,'start');await emit(page,'end');await expect(page.getByRole('progressbar',{name:'播放进度'})).toHaveCount(0);
});
async function fillFrames(page:Page,duration=700){
 await expect(page.locator('.playback-fill')).toBeVisible();
 return page.evaluate(duration=>new Promise<{time:number;value:number}[]>((resolve,reject)=>{
  const samples:{time:number;value:number}[]=[];const start=performance.now();
  // Collect enough actual frames even when a busy browser misses the nominal
  // window. Keep every distinct-value, monotonicity and per-frame step assertion.
  const sample=(time:number)=>{const fill=document.querySelector('.playback-fill');if(!fill){reject(Error('Missing playback fill'));return;}samples.push({time,value:new DOMMatrixReadOnly(getComputedStyle(fill).transform).a});if(time-start>=duration&&samples.length>=12)resolve(samples);else if(time-start>5000)reject(Error('Insufficient animation frames'));else requestAnimationFrame(sample);};requestAnimationFrame(sample);
 }),duration);
}
function expectSmooth(samples:{time:number;value:number}[]){
 expect(new Set(samples.map(s=>s.value.toFixed(4))).size).toBeGreaterThan(8);
 expect(samples.at(-1)!.value-samples[0].value).toBeGreaterThan(.02);
 for(let i=1;i<samples.length;i++){expect(samples[i].value).toBeGreaterThanOrEqual(samples[i-1].value-.001);expect(samples[i].value-samples[i-1].value).toBeLessThan((samples[i].time-samples[i-1].time)*.002+.02);}
}
test('speech without boundary events animates continuously, freezes on pause and resumes without jumping',async({page},info)=>{
 await open(page);await mockSpeech(page);const button=page.locator('.playback-button'),bar=page.getByRole('progressbar',{name:'播放进度'});
 await press(button,!!info.project.use.hasTouch);await expect(bar).toHaveCount(0);await emit(page,'start');
 expectSmooth(await fillFrames(page));await expect(page.locator('.playback-activity')).toHaveCount(0);
 await page.screenshot({path:info.outputPath('smooth-speech-progress.png')});
 await emit(page,'pause');
 const paused=await fillFrames(page,520);
 expect(Math.max(...paused.map(s=>s.value))-Math.min(...paused.map(s=>s.value))).toBeLessThan(.001);
 await emit(page,'resume');expectSmooth(await fillFrames(page));await emit(page,'end');
 await expect.poll(()=>page.evaluate(()=>(window as any).__utterances.at(-1).text)).toBe('croissant');await emit(page,'start');expectSmooth(await fillFrames(page,400));
 expect(Number(await bar.getAttribute('aria-valuenow'))).toBeLessThan(100);await emit(page,'end');await expect(bar).toHaveCount(0);
});
test('sparse speech boundaries calibrate the continuous fill without a visible jump',async({page},info)=>{
 await open(page);await mockSpeech(page);await press(page.locator('.playback-button'),!!info.project.use.hasTouch);await emit(page,'start');
 expectSmooth(await fillFrames(page,400));await emit(page,'boundary',-1,{charIndex:32});expectSmooth(await fillFrames(page,250));
 await emit(page,'boundary',-1,{charIndex:2});expectSmooth(await fillFrames(page,400));
 await page.getByRole('tab',{name:'练听力',exact:true}).click();await emit(page,'resume');await emit(page,'boundary',0,{charIndex:40});await expect(page.getByRole('progressbar',{name:'播放进度'})).toHaveCount(0);
});
test('reduced motion retains estimated speech progress and only the real end completes it',async({page},info)=>{
 await page.emulateMedia({reducedMotion:'reduce'});await open(page);await mockSpeech(page);await page.clock.install();
 const button=page.locator('.playback-button'),bar=page.getByRole('progressbar',{name:'播放进度'});
 await press(button,!!info.project.use.hasTouch);await emit(page,'start');await page.clock.runFor(500);
 await expect(page.locator('.playback-fill')).toHaveCSS('transition-duration','0s');expect(Number(await bar.getAttribute('aria-valuenow'))).toBeGreaterThan(0);
 await page.clock.runFor(12000);expect(Number(await bar.getAttribute('aria-valuenow'))).toBeLessThan(100);await expect(button.locator('.playback-label')).toHaveText('重新播放');
 await emit(page,'end');await page.clock.runFor(200);await emit(page,'start');await page.clock.runFor(5000);expect(Number(await bar.getAttribute('aria-valuenow'))).toBeLessThan(100);await emit(page,'end');await page.clock.runFor(200);await expect(bar).toHaveCount(0);
});

test('original audio fills the button from its clock even without timeupdate and stops advancing while paused',async({page},info)=>{
 const fs=await import('node:fs');const catalog=JSON.parse(fs.readFileSync('apps/public/public/library/catalog.json','utf8'));const song=catalog.find((c:any)=>c.id==='0a1ff2e2-3db0-4bb1-889a-b27b62798cbe');
 await page.addInitScript(()=>{
  const w=window as any,Original=window.Audio;w.__clockAudio=[];w.__clockPlays=[];
  w.Audio=class extends Original{
   constructor(src?:string){super(src);this.muted=true;if(src?.includes('/library/')&&src.endsWith('.mp3')){w.__clockAudio.push(this);Object.defineProperty(this,'ontimeupdate',{get:()=>null,set:()=>{}});}}
   play(){if(w.__clockAudio.includes(this))w.__clockPlays.push({time:this.currentTime,rate:this.playbackRate});return super.play();}
  };
 });
 await page.goto('/piclex-web/#/deck/'+song.id);const button=page.locator('.playback-button'),bar=page.getByRole('progressbar',{name:'播放进度'});await expect(button).toBeVisible();await page.getByLabel('播放速度',{exact:true}).selectOption('0.75');
 await expect.poll(async()=>Number(await bar.getAttribute('aria-valuenow'))).toBeGreaterThan(3);
 const geometry=await button.boundingBox();await expect(page.locator('.playback-fill')).toHaveCSS('opacity','0.28');await expect(page.locator('.playback-activity')).toHaveCount(0);
 await page.evaluate(()=>(window as any).__clockAudio.at(-1).pause());
 // Give the sampler one turn to observe the final media time, then require no drift.
 await page.waitForTimeout(70);const paused=await bar.getAttribute('aria-valuenow');await page.waitForTimeout(160);expect(await bar.getAttribute('aria-valuenow')).toBe(paused);
 await page.screenshot({path:info.outputPath('original-audio-progress.png')});
 const playsBeforeReplay=await page.evaluate(()=>(window as any).__clockPlays.length);
 await press(button,!!info.project.use.hasTouch);
 await expect.poll(()=>page.evaluate(()=>(window as any).__clockPlays.length)).toBe(playsBeforeReplay+1);
 expect(await page.evaluate(()=>(window as any).__clockPlays.at(-1))).toEqual({time:0,rate:.75});
 await expect.poll(()=>page.evaluate(()=>(window as any).__clockAudio.at(-1).currentTime)).toBeGreaterThan(.1);
 expect(await button.boundingBox()).toEqual(geometry);
 await page.getByRole('tab',{name:'练听力',exact:true}).click();await expect(bar).toHaveCount(0);expect(await page.evaluate(()=>(window as any).__clockAudio.every((a:HTMLAudioElement)=>a.paused))).toBe(true);
});
