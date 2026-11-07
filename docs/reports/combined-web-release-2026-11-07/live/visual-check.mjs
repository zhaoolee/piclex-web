import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
const output='docs/reports/combined-web-release-2026-11-07/live';await fs.mkdir(output,{recursive:true});const results=[];
for(const [name,origin] of [['pages','https://zhaoolee.com'],['domestic','https://piclex.v2fy.com']]){
 const browser=await chromium.launch({channel:'chrome',headless:true,args:['--mute-audio','--autoplay-policy=document-user-activation-required'],ignoreDefaultArgs:['--autoplay-policy=no-user-gesture-required']});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:1});const page=await context.newPage();
  await page.addInitScript(()=>{if(window.speechSynthesis)window.speechSynthesis.speak=()=>{};const Original=window.Audio;window.__liveAudio={attempts:0,started:0,errors:[]};window.Audio=class extends Original{play(){const original=this.src.includes('/library/')&&this.src.endsWith('.mp3');const promise=super.play();if(original){window.__liveAudio.attempts++;promise.then(()=>window.__liveAudio.started++,e=>window.__liveAudio.errors.push(e.name));}return promise;}};});
  const cdp=await context.newCDPSession(page),read=async()=>{const r=await cdp.send('Runtime.evaluate',{expression:`(()=>({icon:!!document.querySelector('.audio-unlock'),active:navigator.userActivation.hasBeenActive,audio:window.__liveAudio,photo:[...document.querySelectorAll('.photo-focus img')].some(i=>i.complete&&i.naturalWidth>0),feedback:!!document.querySelector('.answer-feedback')}))()`,returnByValue:true,userGesture:false});return r.result.value;};
  const until=async predicate=>{for(let i=0;i<600;i++){const v=await read();if(predicate(v))return v;await new Promise(r=>setTimeout(r,100));}throw Error('Live state timed out: '+JSON.stringify(await read()));};
  await page.goto(origin+'/piclex-web/#/deck/0a1ff2e2-3db0-4bb1-889a-b27b62798cbe');
  const before=await until(v=>v.icon&&v.photo&&v.audio.errors.includes('NotAllowedError'));if(before.active||before.feedback)throw Error('Invalid initial page state');
  let shot=await cdp.send('Page.captureScreenshot');await fs.writeFile(`${output}/${name}-before-interaction.png`,Buffer.from(shot.data,'base64'));
  await page.locator('.audio-unlock').click();const after=await until(v=>!v.icon&&v.audio.started===1);
  shot=await cdp.send('Page.captureScreenshot');await fs.writeFile(`${output}/${name}-after-unlock.png`,Buffer.from(shot.data,'base64'));results.push({name,origin,before,after});
 }finally{await browser.close();}
}
await fs.writeFile(`${output}/actual-audio.json`,JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results));
