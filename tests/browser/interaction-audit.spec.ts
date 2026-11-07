import {test,expect,type Page} from '@playwright/test';
import fs from 'node:fs';
import {fillEnglish} from './helpers/spelling';
const catalog=JSON.parse(fs.readFileSync('apps/public/public/library/catalog.json','utf8'));
async function open(page:Page){
 await page.addInitScript(()=>{const w=window as any;w.__spoken=[];w.__cancels=0;Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{speak:(u:any)=>w.__spoken.push(u),cancel:()=>w.__cancels++,getVoices:()=>[]}});});
 await page.goto('/piclex-web/#/deck/'+catalog[0].id);await expect(page.getByRole('textbox',{name:'输入英文',exact:true})).toBeVisible();
 // Establish successful first-load audio before measuring each user action.
 // Host speech availability must not inject a blocked-gesture retry into this fixture.
 await expect.poll(()=>page.evaluate(()=>(window as any).__spoken.length)).toBe(1);
 await page.evaluate(()=>{const w=window as any;w.__spoken[0].onstart?.();w.__spoken=[];w.__cancels=0;});
}
test('reveal speaks the word, next speaks the next prompt, and tapping the selected tab leaves playback intact',async({page})=>{
 await open(page);await page.getByRole('button',{name:'不认识',exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as any).__spoken.at(-1)?.text)).toBe('bed');
 await page.getByRole('button',{name:'下一个',exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as any).__spoken.length)).toBe(2);
 await page.evaluate(()=>{const u=(window as any).__spoken.at(-1);u.onstart?.();u.onboundary?.({charIndex:4});});
 const cancels=await page.evaluate(()=>(window as any).__cancels);await page.getByRole('tab',{name:'拼单词',exact:true}).click();await expect(page.locator('.playback-button')).toHaveText('重新播放');expect(await page.evaluate(()=>(window as any).__cancels)).toBe(cancels);
 await expect(page.getByRole('button',{name:'播放英文发音'})).toHaveCount(0);
});
test('dictation assistance speaks its answer; replay of a correct answer holds the current sentence',async({page})=>{
 await page.clock.install();await open(page);await page.getByRole('tab',{name:'练听力',exact:true}).click();await page.getByLabel('句子练习模式',{exact:true}).selectOption('free');
 // Freeze the answer deadline before entering the final character: slow CI must still click replay before auto-next.
 await page.clock.pauseAt(await page.evaluate(()=>Date.now()+1000));
 await fillEnglish(page.getByRole('textbox',{name:'听写句子',exact:true}),'I am still in bed');
 await page.locator('.playback-button').click();await expect.poll(()=>page.evaluate(()=>(window as any).__spoken.at(-1)?.text)).toBe('I am still in bed.');
 await page.clock.runFor(1150);await expect(page.getByRole('textbox',{name:'听写句子',exact:true})).toHaveValue('I am still in bed');
 await page.getByRole('button',{name:'下一个',exact:true}).click();await page.clock.runFor(150);await expect.poll(()=>page.evaluate(()=>(window as any).__spoken.length)).toBe(2);
 await page.getByRole('button',{name:'听不懂',exact:true}).click();await expect(page.locator('.sentence-feedback')).toContainText('参考答案');await expect.poll(()=>page.evaluate(()=>(window as any).__spoken.length)).toBe(3);
});
test('demonstration releases the microphone before playing and restarting reading stops the example',async({page})=>{
 await open(page);await page.evaluate(()=>{const w=window as any;w.__aborted=0;w.SpeechRecognition=class{onresult:any;onerror:any;onend:any;start(){}abort(){w.__aborted++;}};});
 await page.getByRole('tab',{name:'练口语',exact:true}).click();await page.getByRole('button',{name:'开始跟读',exact:true}).click();await page.getByRole('button',{name:'听示范',exact:true}).click();
 expect(await page.evaluate(()=>(window as any).__aborted)).toBe(1);await expect(page.getByRole('button',{name:'开始跟读',exact:true})).toBeVisible();expect(await page.evaluate(()=>(window as any).__spoken.length)).toBe(1);
 const before=await page.evaluate(()=>(window as any).__cancels);await page.getByRole('button',{name:'开始跟读',exact:true}).click();expect(await page.evaluate(()=>(window as any).__cancels)).toBeGreaterThan(before);
});
async function trackClassicKeyAudio(page:Page){
 await page.addInitScript(()=>{localStorage.setItem('piclex-web.typing-sound-id','classic');const w=window as any,Original=window.Audio;w.__keyCalls=0;w.__keyStarts=0;w.__keyErrors=[];w.__keyVoices=[];w.Audio=class extends Original{constructor(src?:string){super(src);if(src?.includes('key-click.wav')){this.muted=true;w.__keyVoices.push(this);this.addEventListener('playing',()=>w.__keyStarts++);const play=this.play.bind(this);this.play=()=>{w.__keyCalls++;const result=play();result.catch(e=>w.__keyErrors.push(e.name));return result;};}}};});
}
test('classic key sound works at LV0 for physical and touch input, dictation and backspace',async({page},info)=>{
 await trackClassicKeyAudio(page);
 await open(page);const keyboard=page.getByRole('region',{name:'虚拟键盘'});const key=keyboard.getByRole('button',{name:'按键 B',exact:true});if(info.project.use.hasTouch)await key.tap();else await key.click();
 await expect.poll(()=>page.evaluate(()=>(window as any).__keyStarts)).toBeGreaterThan(0);expect(await page.evaluate(()=>(window as any).__keyCalls)).toBe(1);
 await page.getByRole('textbox',{name:'输入英文',exact:true}).press('e');await page.getByRole('button',{name:'退格',exact:true}).click();expect(await page.evaluate(()=>(window as any).__keyCalls)).toBe(3);
 await page.getByRole('tab',{name:'练听力',exact:true}).click();await page.getByLabel('句子练习模式',{exact:true}).selectOption('free');
 for(const difficulty of ['hard','medium','easy']){await page.getByLabel('听写难度',{exact:true}).selectOption(difficulty);const target=page.getByRole('region',{name:'虚拟键盘'}).getByRole('button',{name:'按键 I',exact:true});const before=await page.evaluate(()=>(window as any).__keyCalls);if(info.project.use.hasTouch)await target.tap();else await target.click();expect(await page.evaluate(()=>(window as any).__keyCalls)).toBe(before+1);}
 expect(await page.evaluate(()=>(window as any).__keyErrors)).toEqual([]);
 const decoded=await page.evaluate(async()=>{const bytes=await fetch('/piclex-web/audio/key-click.wav').then(r=>r.arrayBuffer());const context=new OfflineAudioContext(1,1,44100),buffer=await context.decodeAudioData(bytes);return {duration:buffer.duration,peak:Math.max(...buffer.getChannelData(0).map(Math.abs))};});expect(decoded.duration).toBeGreaterThan(0);expect(decoded.peak).toBeGreaterThan(.01);
});
test('keyboard sound mute survives settings navigation and a full reload',async({page},info)=>{
 await trackClassicKeyAudio(page);await open(page);
 const key=page.getByRole('region',{name:'虚拟键盘'}).getByRole('button',{name:'按键 B',exact:true});
 if(info.project.use.hasTouch)await key.tap();else await key.click();
 await expect.poll(()=>page.evaluate(()=>(window as any).__keyStarts)).toBeGreaterThan(0);
 await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('button',{name:'个性化设置',exact:true}).click();await page.getByRole('button',{name:/^键盘声音/}).click();const toggle=page.getByRole('switch',{name:'键盘敲击音',exact:true});await expect(toggle).toBeEnabled();await expect(toggle).toBeChecked();await toggle.uncheck();await page.getByRole('button',{name:'学习',exact:true}).click();await page.getByRole('tab',{name:'练听力',exact:true}).click();await page.getByLabel('句子练习模式',{exact:true}).selectOption('free');
 await page.reload();await expect(page.getByRole('region',{name:'虚拟键盘'})).toBeVisible();await page.getByRole('region',{name:'虚拟键盘'}).getByRole('button',{name:'按键 I',exact:true}).click();expect(await page.evaluate(()=>(window as any).__keyCalls)).toBe(0);
});

test('reading keeps partial matches, closes its microphone on completion and continues in speaking',async({page})=>{
 await open(page);await page.evaluate(()=>{const w=window as any;w.__readers=[];w.SpeechRecognition=class{onresult:any;onerror:any;onend:any;aborted=false;start(){w.__readers.push(this);}abort(){this.aborted=true;}};});
 await page.getByRole('tab',{name:'练口语',exact:true}).click();await page.getByRole('button',{name:'开始跟读',exact:true}).click();
 await page.evaluate(()=>(window as any).__readers[0].onresult({results:[[{transcript:'I am still'}]]}));await expect(page.locator('.reading-sentence .matched')).toHaveCount(3);await expect(page.locator('.reading-sentence')).toHaveText('I am still in bed.');
 await page.evaluate(()=>(window as any).__readers[0].onresult({results:[[{transcript:'in bed'}]]}));await expect(page.locator('.reading-sentence .matched')).toHaveCount(5);expect(await page.evaluate(()=>(window as any).__readers[0].aborted)).toBe(true);
 await expect.poll(()=>page.evaluate(()=>(window as any).__readers.length)).toBe(2);await expect(page.getByRole('tab',{name:'练口语',exact:true})).toHaveAttribute('aria-selected','true');
 await page.getByRole('tab',{name:'拼单词',exact:true}).click();expect(await page.evaluate(()=>(window as any).__readers.every((r:any)=>r.aborted))).toBe(true);
 await expect(page.locator('.answer-feedback')).toHaveCount(0);
});
