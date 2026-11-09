import {observeAmbienceMix,ambienceGain} from './helpers/ambience';
import {test,expect} from '@playwright/test';
import path from 'node:path';
async function open(page:any){
 await page.goto('/piclex-web/#/decks');
 await page.getByLabel('选择照片卡组文件').setInputFiles(path.resolve('tests/fixtures/demo/decks/cafe.piclexdeck'));
 await expect(page.locator('.focus-box')).toBeVisible();
}
test('default cafe is controllable in spelling; choice survives modules and reload, pauses on exit',async({page},info)=>{
 await observeAmbienceMix(page);
 await page.addInitScript(()=>{const Original=window.Audio,w=window as any;w.__ambience=[];w.Audio=class extends Original{constructor(src?:string){super(src);this.muted=true;if(src?.includes('/ambience/'))w.__ambience.push(this);}};});
 await open(page);
 const press=(locator:any)=>info.project.use.hasTouch?locator.tap():locator.click();
 const menu=page.locator('.sentence-ambience');await expect(menu.locator('summary')).toHaveAttribute('aria-label','背景声：咖啡厅');
 await press(menu.locator('summary'));
 await expect.poll(()=>page.evaluate(()=>{const a=(window as any).__ambience.at(-1);return a&&!a.paused&&a.currentTime>0&&a.loop&&a.src.endsWith('/cafe.m4a');})).toBe(true);
 await expect.poll(()=>ambienceGain(page)).toBeCloseTo(.28*.22,3);
 await press(menu.getByRole('button',{name:'轻柔钢琴'}));
 await expect.poll(()=>page.evaluate(()=>{const a=(window as any).__ambience.at(-1);return a&&!a.paused&&a.currentTime>0&&a.src.endsWith('/piano.m4a');})).toBe(true);
 await press(page.getByRole('tab',{name:'练听力',exact:true}));await expect(menu.locator('summary')).toHaveAttribute('aria-label','背景声：轻柔钢琴');
 await page.reload();await expect(menu.locator('summary')).toHaveAttribute('aria-label','背景声：轻柔钢琴');
 await press(menu.locator('summary'));await menu.getByLabel('背景声音量').selectOption('0.45');
 await expect.poll(()=>ambienceGain(page)).toBeCloseTo(.45*.22,3);
 await press(menu.getByRole('button',{name:'关闭',exact:true}));await expect.poll(()=>page.evaluate(()=>(window as any).__ambience.every((a:HTMLAudioElement)=>a.paused))).toBe(true);
 await press(menu.locator('summary'));await press(menu.getByRole('button',{name:'咖啡厅'}));
 await expect.poll(()=>page.evaluate(()=>(window as any).__ambience.at(-1)?.paused)).toBe(false);
 await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
 await expect.poll(()=>page.evaluate(()=>(window as any).__ambience.every((a:HTMLAudioElement)=>a.paused))).toBe(true);
 await page.screenshot({path:info.outputPath('ambience.png')});
});
test('gradient stays on the ring surface through resize, pause and reduced motion',async({page},info)=>{
 await open(page);
 const ring=page.locator('.focus-box'),mask=ring.locator('.focus-ring');
 for(const [width,height] of [[180,130],[30,30],[160,40],[40,160]]){
  await ring.evaluate((el,[width,height])=>{Object.assign((el as HTMLElement).style,{width:width+'px',height:height+'px',left:'180px',top:'110px'});},[width,height]);
  await expect(mask).toHaveCSS('transform','none');
  const paint=await mask.evaluate(el=>{const css=getComputedStyle(el,'::after'),box=el.getBoundingClientRect();return {gradient:css.backgroundImage,texture:parseFloat(css.width),diagonal:Math.hypot(box.width,box.height)};});
  expect(paint.gradient).toContain('conic-gradient');expect(paint.texture).toBeGreaterThan(paint.diagonal);
 }
 await page.emulateMedia({reducedMotion:'reduce'});
 expect(await mask.evaluate(el=>getComputedStyle(el,'::after').animationName)).toBe('none');
 await page.screenshot({path:info.outputPath('ring.png')});
});

test('background gain and media clock stay steady through typing, and duck only for playback',async({page},info)=>{
 await observeAmbienceMix(page,true);
 await page.addInitScript(()=>{
  const w=window as any,play=HTMLMediaElement.prototype.play;
  w.__keyPlays=0;
  HTMLMediaElement.prototype.play=function(){if(this.src.endsWith('/cherry-mx-blue.mp3'))w.__keyPlays++;return play.call(this);};
  Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{
   getVoices:()=>[],cancel(){},speak(utterance:SpeechSynthesisUtterance){queueMicrotask(()=>{
    utterance.onstart?.(new Event('start') as SpeechSynthesisEvent);
    if(w.__holdSpeech)w.__utterance=utterance;else utterance.onend?.(new Event('end') as SpeechSynthesisEvent);
   });}
  }});
 });
 await open(page);
 const field=page.getByRole('textbox',{name:'输入英文',exact:true});
 await page.locator('.sentence-ambience summary').click();
 await expect.poll(()=>page.evaluate(()=>{const m=(window as any).__ambienceMixes.at(-1);return m&&!m.sound.paused&&m.sound.currentTime>0&&m.context.state==='running';})).toBe(true);
 await expect.poll(()=>ambienceGain(page)).toBeCloseTo(.28*.22,3);
 expect(await page.evaluate(()=>(window as any).__ambienceMixes.at(-1).sound.volume)).toBe(1);
 await page.getByLabel('背景声音量').selectOption('0.45');await expect.poll(()=>ambienceGain(page)).toBeCloseTo(.45*.22,3);
 await page.locator('.sentence-ambience summary').click();
 await field.focus();
 await page.evaluate(()=>{
  const w=window as any,mix=w.__ambienceMixes.at(-1),events:string[]=[],samples:{gain:number;time:number;paused:boolean}[]=[];
  for(const name of ['pause','waiting','seeking','play'])mix.sound.addEventListener(name,()=>events.push(name));
  const sample=()=>samples.push({gain:mix.node.gain.value,time:mix.sound.currentTime,paused:mix.sound.paused});
  sample();const timer=setInterval(sample,12);
  w.__stopSamples=()=>{clearInterval(timer);return {events,samples,players:w.__ambienceMixes.length,keys:w.__keyPlays};};
 });
 for(const key of 'CROI'){
  if(info.project.use.hasTouch)await page.getByRole('button',{name:`按键 ${key}`,exact:true}).tap();
  else await page.keyboard.press(key.toLowerCase());
 }
 await expect(field).toHaveValue('croi');
 await page.waitForTimeout(300);
 const trace=await page.evaluate(()=>(window as any).__stopSamples()) as {events:string[];samples:{gain:number;time:number;paused:boolean}[];players:number;keys:number};
 expect(trace.players).toBe(1);expect(trace.keys).toBeGreaterThanOrEqual(4);expect(trace.events).toEqual([]);
 expect(trace.samples.every((sample,i)=>!sample.paused&&(!i||sample.time>=trace.samples[i-1].time))).toBe(true);
 expect(trace.samples.at(-1)!.time-trace.samples[0].time).toBeGreaterThan(.15);
 expect(Math.min(...trace.samples.map(sample=>sample.gain))).toBeGreaterThan(.09);
 await info.attach('typing-background-clock',{body:JSON.stringify(trace),contentType:'application/json'});
 await page.evaluate(()=>{(window as any).__holdSpeech=true;});
 await page.getByRole('button',{name:'播放句子和单词',exact:true}).click();
 await expect.poll(()=>ambienceGain(page)).toBeCloseTo(.45*.22*.22,3);
 await page.evaluate(()=>{const w=window as any;w.__holdSpeech=false;w.__utterance.onend?.();});
 await expect.poll(()=>ambienceGain(page)).toBeCloseTo(.45*.22,3);
 // Real decoded source samples: even the loudest background at the highest UI
 // level must stay below the default keyboard recording.
 const levels=await page.evaluate(async()=>{
  const context=new OfflineAudioContext(2,48000,48000);
  const decode=async(path:string)=>context.decodeAudioData(await(await fetch('/piclex-web/audio/'+path)).arrayBuffer());
  const rms=(buffer:AudioBuffer)=>{let sum=0,count=0;for(let c=0;c<buffer.numberOfChannels;c++){for(const sample of buffer.getChannelData(c)){sum+=sample*sample;count++;}}return Math.sqrt(sum/count);};
  const key=rms(await decode('cherry-mx-blue.mp3')),backgrounds=[];
  for(const file of ['ambience/cafe.m4a','ambience/piano.m4a']){const buffer=await decode(file),render=new OfflineAudioContext(buffer.numberOfChannels,buffer.length,buffer.sampleRate),source=render.createBufferSource(),gain=render.createGain();source.buffer=buffer;gain.gain.value=.45*.22;source.connect(gain);gain.connect(render.destination);source.start();const mixed=rms(await render.startRendering());backgrounds.push({file,relativeDb:20*Math.log10(mixed/key)});}
  return backgrounds;
 });
 for(const result of levels)expect(result.relativeDb).toBeLessThan(-6);
 await info.attach('decoded-background-key-levels',{body:JSON.stringify(levels),contentType:'application/json'});
 await page.locator('.sentence-ambience summary').click();await page.getByRole('button',{name:'关闭',exact:true}).click();await page.reload();await expect(page.locator('.sentence-ambience summary')).toHaveAttribute('aria-label','背景声：关闭');
 await page.locator('.sentence-ambience summary').click();await page.getByRole('button',{name:'咖啡厅',exact:true}).click();await expect.poll(()=>ambienceGain(page)).toBeCloseTo(.45*.22,3);
 await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));await expect.poll(()=>page.evaluate(()=>(window as any).__ambienceMixes.every((m:any)=>m.sound.paused))).toBe(true);
});

test('an unavailable audio mixer never falls back to full-volume background or breaks typing',async({page})=>{
 await page.addInitScript(()=>{
  const w=window as any;w.__ambientStarts=0;w.__keyStarts=0;
  w.AudioContext=class{constructor(){throw new Error('audio output unavailable');}};
  const play=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){if(this.src.includes('/ambience/'))w.__ambientStarts++;if(this.src.includes('/cherry-mx-blue.mp3'))w.__keyStarts++;return play.call(this);};
 });
 await open(page);await page.getByRole('button',{name:'按键 C',exact:true}).click();await expect(page.getByRole('textbox',{name:'输入英文',exact:true})).toHaveValue('c');
 await expect(page.locator('.sentence-ambience summary')).toHaveAttribute('aria-label','背景声：咖啡厅，播放失败');
 expect(await page.evaluate(()=>(window as any).__ambientStarts)).toBe(0);expect(await page.evaluate(()=>(window as any).__keyStarts)).toBeGreaterThan(0);
});
