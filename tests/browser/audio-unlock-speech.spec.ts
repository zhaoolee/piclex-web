import {test,expect,type Page} from '@playwright/test';
import fs from 'node:fs';
const catalog=JSON.parse(fs.readFileSync('apps/public/public/library/catalog.json','utf8'));
const plain=catalog.find((deck:any)=>deck.id==='add03b54-d0a7-46fd-88c8-2aa0fa7f0c7f'),plainDeck=JSON.parse(fs.readFileSync('apps/public/public/'+plain.payload,'utf8'));
const song=catalog.find((deck:any)=>deck.id==='0a1ff2e2-3db0-4bb1-889a-b27b62798cbe'),songDeck=JSON.parse(fs.readFileSync('apps/public/public/'+song.payload,'utf8'));
async function mockSpeech(page:Page,initial='denied'){
 await page.addInitScript(initial=>{
  const w=window as any;w.__spoken=[];w.__all=[];w.__held=[];w.__speechAttempts=0;w.__started=0;w.__speechMode=initial;
  class Utterance{lang='';rate=1;voice=null;text:string;onstart:any;onend:any;onerror:any;onpause:any;onresume:any;onboundary:any;constructor(text:string){this.text=text;}}
  Object.defineProperty(window,'SpeechSynthesisUtterance',{configurable:true,writable:true,value:Utterance});
  Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{
   speak(utterance:any){w.__spoken.push(utterance.text);w.__all.push(utterance);w.__speechAttempts++;const mode=w.__speechMode;
    if(mode==='hold'){w.__held.push(utterance);return;}
    queueMicrotask(()=>{if(mode==='denied'||mode==='failed')utterance.onerror?.({error:mode==='denied'?'not-allowed':'synthesis-failed'});else{w.__started++;utterance.onstart?.();setTimeout(()=>utterance.onend?.(),60);}});},
   cancel(){},getVoices(){return [];},get paused(){return false;}
  }});
 },initial);
}
test('speech policy denial keeps one retryable request, ignores stale callbacks and only hides on real start',async({page})=>{
 await mockSpeech(page);await page.goto('/piclex-web/#/deck/'+plain.id);
 const icon=page.getByRole('button',{name:'开启声音，播放当前内容',exact:true});
 await expect(icon).toBeVisible();await expect(page.locator('[role=alert]')).toHaveCount(0);
 expect(await page.evaluate(()=>({attempts:(window as any).__speechAttempts,started:(window as any).__started,text:(window as any).__spoken[0]}))).toEqual({attempts:1,started:0,text:plainDeck.words[0].example});
 // The denied utterance must not revive blocked state through a late callback.
 await page.evaluate(()=>{const w=window as any;w.__all[0].onstart?.();w.__all[0].onend?.();});
 await expect(icon).toBeVisible();expect(await page.evaluate(()=>(window as any).__started)).toBe(0);
 await icon.click();
 await expect.poll(()=>page.evaluate(()=>(window as any).__speechAttempts)).toBe(2);
 await expect(icon).toBeVisible();expect(await page.evaluate(()=>(window as any).__started)).toBe(0);
 await page.evaluate(()=>{(window as any).__speechMode='hold';});
 await icon.click();
 await expect.poll(()=>page.evaluate(()=>(window as any).__speechAttempts)).toBe(3);
 await expect(icon).toBeVisible();expect(await page.evaluate(()=>(window as any).__started)).toBe(0);
 // A second gesture while the retry is pending must not queue it again.
 await icon.click();await page.waitForTimeout(120);
 expect(await page.evaluate(()=>(window as any).__speechAttempts)).toBe(3);
 await page.evaluate(()=>{const w=window as any,u=w.__held.shift();w.__started++;u.onstart?.();setTimeout(()=>u.onend?.(),30);});
 await expect(icon).toHaveCount(0);
 await expect.poll(()=>page.evaluate(()=>{const w=window as any;return w.__spoken.slice(0,3);})).toEqual([plainDeck.words[0].example,plainDeck.words[0].example,plainDeck.words[0].example]);
 await expect(page.locator('[role=alert]')).toHaveCount(0);
});
test('a later denied TTS word retries only that word, not the clip that already finished',async({page})=>{
 await mockSpeech(page);
 await page.addInitScript(()=>{
  const w=window as any,Original=window.Audio;
  w.__clipPlays=0;
  w.Audio=class extends Original{
   constructor(src?:string){super(src);(this as any).__clip=!!src?.includes('/library/')&&src.endsWith('.mp3');}
   play(){if((this as any).__clip){w.__clipPlays++;queueMicrotask(()=>{try{Object.defineProperty(this,'duration',{configurable:true,value:2});this.onloadedmetadata?.();this.onended?.();}catch{}});return Promise.resolve();}return super.play();}
  };
 });
 await page.goto('/piclex-web/#/deck/'+song.id);
 const icon=page.getByRole('button',{name:'开启声音，播放当前内容',exact:true});
 await expect(icon).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>(window as any).__spoken)).toEqual([songDeck.words[0].english]);
 expect(await page.evaluate(()=>(window as any).__clipPlays)).toBe(1);
 await page.evaluate(()=>{(window as any).__speechMode='allowed';});
 await icon.click();
 await expect.poll(()=>page.evaluate(()=>(window as any).__spoken)).toEqual([songDeck.words[0].english,songDeck.words[0].english]);
 expect(await page.evaluate(()=>(window as any).__clipPlays)).toBe(1);
 await expect(icon).toHaveCount(0);
});

// A missing speech service must not cover navigation with a startup toast or
// carry a stale error into another exercise. Explicit playback still reports it.
test('automatic service failure stays quiet and explicit errors belong only to the current content',async({page})=>{
 await mockSpeech(page,'failed');
 await page.goto('/piclex-web/#/deck/'+plain.id);
 await expect.poll(()=>page.evaluate(()=>(window as any).__speechAttempts)).toBe(1);
 await expect(page.getByText('朗读暂时不可用，请检查浏览器的语音与播放权限。',{exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'下载第三方卡组',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.getByRole('button',{name:'关闭',exact:true}).click();
 await page.getByRole('tab',{name:'练听力',exact:true}).click();await page.getByLabel('句子练习模式',{exact:true}).selectOption('listening');
 await expect(page.getByRole('button',{name:'播放',exact:true})).toBeVisible();await page.getByRole('button',{name:'播放',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('朗读暂时不可用');await expect(page.getByRole('button',{name:'重新准备',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'下一句',exact:true}).click();await expect(page.getByRole('alert')).toHaveCount(0);await expect(page.getByRole('button',{name:'播放',exact:true})).toBeVisible();
});

test('silent startup retries in first typing gesture, then next word plays after refresh',async({page})=>{
 await mockSpeech(page,'hold');
 await page.goto('/piclex-web/#/deck/'+plain.id);
 await page.reload();
 const icon=page.getByRole('button',{name:'开启声音，播放当前内容',exact:true});
 await expect(icon).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>(window as any).__speechAttempts)).toBe(1);
 await page.evaluate(()=>{(window as any).__speechMode='allowed';});
 const field=page.getByRole('textbox',{name:'输入英文',exact:true});
 const letters=plainDeck.words[0].english.replace(/[^a-z]/gi,'');
 await field.press(letters[0]);
 await expect(field).toHaveValue(letters[0]);
 await expect(icon).toHaveCount(0);
 await expect.poll(()=>page.evaluate(()=>(window as any).__started)).toBeGreaterThan(0);
 // Old accepted-but-never-started callback cannot restore the previous request.
 await page.evaluate(()=>{const u=(window as any).__held[0];u.onstart?.();u.onerror?.({error:'not-allowed'});});
 await expect(icon).toHaveCount(0);
 for(const letter of letters.slice(1))await field.press(letter);
 await expect(field).toHaveValue('');
 await expect.poll(()=>page.evaluate(()=>(window as any).__spoken)).toContain(plainDeck.words[1].example);
 await expect(page.locator('.playback-label')).not.toContainText('准备音频');
});

test('no speech callback leaves preparation and remains retryable',async({page})=>{
 await mockSpeech(page,'hold');await page.goto('/piclex-web/#/deck/'+plain.id);
 const icon=page.getByRole('button',{name:'开启声音，播放当前内容',exact:true});
 await expect(icon).toBeVisible();await icon.click();
 await expect.poll(()=>page.evaluate(()=>(window as any).__speechAttempts)).toBe(2);
 await expect(page.locator('.playback-label')).not.toContainText('准备音频',{timeout:6500});
 await expect(icon).toBeVisible();
 await page.evaluate(()=>{(window as any).__speechMode='allowed';});await icon.click();
 await expect(icon).toHaveCount(0);
 await expect.poll(()=>page.evaluate(()=>(window as any).__started)).toBeGreaterThan(0);
});

test('free dictation shares spelling’s Auto voice and replays without canceling an idle service',async({page},info)=>{
 await page.addInitScript(()=>{
  const w=window as any;
  const remote={name:'Google US English',lang:'en-US',voiceURI:'remote',localService:false},local={name:'Samantha',lang:'en-US',voiceURI:'local',localService:true};
  let active=false;
  w.__utterances=[];w.__idleCancels=0;
  Object.defineProperty(window,'SpeechSynthesisUtterance',{configurable:true,value:class {constructor(public text:string){}}});
  Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{
   getVoices:()=>[remote,local],cancel(){if(!active)w.__idleCancels++;active=false;},get paused(){return false;},
   speak(utterance:SpeechSynthesisUtterance){
    active=true;
    w.__utterances.push({text:utterance.text,voice:utterance.voice?.voiceURI,requestedAt:performance.now()});
    // The browser's service can take longer to start than the app takes to request it.
    const startup=utterance.voice?.localService?20:1600;
    setTimeout(()=>utterance.onstart?.(new Event('start') as SpeechSynthesisEvent),startup);
    setTimeout(()=>{active=false;utterance.onend?.(new Event('end') as SpeechSynthesisEvent);},startup+150);
   }
  }});
 });
 const utterance=(index:number)=>page.evaluate(index=>(window as any).__utterances[index],index);
 const spelling=page.getByRole('tab',{name:'拼单词',exact:true}),listening=page.getByRole('tab',{name:'练听力',exact:true});
 const play=page.getByRole('button',{name:'播放句子',exact:true});
 const touch=!!info.project.use.hasTouch;
 await page.goto('/piclex-web/#/deck/'+plain.id+'?module=listening&mode=free&difficulty=easy');
 await expect.poll(async()=>(await utterance(0))?.text).toBe(plainDeck.words[0].example);
 const first=await utterance(0);
 expect(first.voice).toBe('remote');
 await expect(play).toBeVisible();

 const idle=await page.evaluate(()=>(window as any).__idleCancels);
 await page.evaluate(eventName=>window.addEventListener(eventName,()=>{(window as any).__gestureAt=performance.now();},{capture:true,once:true}),touch?'click':'keydown');
 if(touch)await play.tap();else await page.keyboard.press('Space');
 await expect.poll(async()=>(await utterance(1))?.voice).toBe(first.voice);
 const replay=await utterance(1);
 expect(replay.text).toBe(first.text);
 expect(replay.requestedAt-await page.evaluate(()=>(window as any).__gestureAt)).toBeLessThan(350);
 expect(await page.evaluate(()=>(window as any).__idleCancels)).toBe(idle);
 await expect(page.getByRole('progressbar',{name:'播放进度'})).toBeVisible();
 await expect(play).toBeVisible();

 await spelling.click();
 await page.getByRole('button',{name:'播放句子和单词',exact:true}).click();
 await expect.poll(async()=>(await utterance(2))?.text).toBe(first.text);
 expect((await utterance(2)).voice).toBe(first.voice);

 await listening.click();
 await page.getByLabel('句子练习模式',{exact:true}).selectOption('free');
 await page.evaluate(()=>localStorage.setItem('practice.speechVoiceIdentifier','local'));
 if(touch)await play.tap();else await page.keyboard.press('Space');
 await expect.poll(async()=>(await utterance(3))?.voice).toBe('local');
});
