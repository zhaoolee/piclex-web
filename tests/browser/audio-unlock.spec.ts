import {test,expect,type Page} from '@playwright/test';
import type {CDPSession} from 'playwright-core';
import fs from 'node:fs';

// Launch an isolated browser: Playwright's runner may grant activation through
// trace snapshots or evaluation. The first policy observation uses CDP only.
test.use({trace:'off',screenshot:'off'});
const catalog=JSON.parse(fs.readFileSync('apps/public/public/library/catalog.json','utf8'));
const song=catalog.find((deck:any)=>deck.id==='0a1ff2e2-3db0-4bb1-889a-b27b62798cbe'),songDeck=JSON.parse(fs.readFileSync('apps/public/public/'+song.payload,'utf8'));
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));

async function launchPractice(playwright:any,testInfo:any,instrument:(page:Page)=>Promise<void>,contextOptions:Record<string,unknown>={}){
 const browser=await playwright.chromium.launch({channel:testInfo.project.use.channel,headless:true,args:['--mute-audio','--autoplay-policy=document-user-activation-required'],ignoreDefaultArgs:['--autoplay-policy=no-user-gesture-required']});
 const context=await browser.newContext({baseURL:testInfo.project.use.baseURL,viewport:testInfo.project.use.viewport,hasTouch:testInfo.project.use.hasTouch,isMobile:testInfo.project.use.isMobile,deviceScaleFactor:testInfo.project.use.deviceScaleFactor,...contextOptions});
 const page=await context.newPage();await instrument(page);
 const cdp=await context.newCDPSession(page);
 return {browser,context,page,cdp,close:()=>browser.close()};
}
async function read<T>(cdp:CDPSession,expression:string){
 const {result,exceptionDetails}=await cdp.send('Runtime.evaluate',{expression,returnByValue:true,userGesture:false,awaitPromise:true});
 if(exceptionDetails)throw Error(exceptionDetails.exception?.description||exceptionDetails.text);
 return result.value as T;
}
async function until<T>(cdp:CDPSession,expression:string,accept:(value:T)=>boolean,label:string,timeout=15000){
 const end=Date.now()+timeout;let value:T;
 do{value=await read<T>(cdp,expression);if(accept(value))return value;await sleep(50);}while(Date.now()<end);
 throw Error(`Timed out waiting for ${label}: ${JSON.stringify(value)}`);
}
async function instrumentMedia(page:Page){
 await page.addInitScript(()=>{
  const w=window as any,Original=window.Audio,clip=(src:string)=>src.includes('/library/')&&src.endsWith('.mp3');
  w.__media=[];w.__mediaAttempts=0;w.__mediaPlayed=0;w.__mediaErrors=[];w.__mediaSources=[];
  w.Audio=class extends Original{
   constructor(src?:string){super(src);if(src&&clip(src)){w.__media.push(this);w.__mediaSources.push(src);}}
   play(){const promise=super.play();if(clip(this.src)){w.__mediaAttempts++;promise.then(()=>{w.__mediaPlayed++;},error=>{w.__mediaErrors.push((error as DOMException).name||'Error');});}return promise;}
  };
 });
}
async function mediaState(cdp:CDPSession){return read<{attempts:number;played:number;errors:string[];paused:boolean;icon:boolean;active:boolean}>(cdp,`(()=>({attempts:__mediaAttempts,played:__mediaPlayed,errors:__mediaErrors.slice(),paused:__media.every(a=>a.paused),icon:!!document.querySelector('.audio-unlock'),active:navigator.userActivation?.hasBeenActive}))()`);}

test('real original audio: first load is blocked, the photo icon unlocks exactly that clip and disappears',async({playwright},testInfo)=>{
 const {page,cdp,close}=await launchPractice(playwright,testInfo,instrumentMedia);
 try{
  await page.goto('/piclex-web/#/deck/'+song.id);
  const blocked=await until<Awaited<ReturnType<typeof mediaState>>>(cdp,`(()=>({attempts:__mediaAttempts,played:__mediaPlayed,errors:__mediaErrors.slice(),paused:__media.every(a=>a.paused),icon:!!document.querySelector('.audio-unlock'),active:navigator.userActivation?.hasBeenActive}))()`,value=>value.icon&&value.attempts>0,'blocked first clip');
  expect(blocked.active).toBe(false);expect(blocked.errors).toContain('NotAllowedError');expect(blocked.played).toBe(0);
  await page.locator('.audio-unlock').click();
  await expect(page.locator('.audio-unlock')).toHaveCount(0);
  const played=await until<Awaited<ReturnType<typeof mediaState>>>(cdp,`(()=>({attempts:__mediaAttempts,played:__mediaPlayed,errors:__mediaErrors.slice(),paused:__media.every(a=>a.paused),icon:!!document.querySelector('.audio-unlock'),active:navigator.userActivation?.hasBeenActive}))()`,value=>value.played===1&&!value.icon,'retried original clip');
  expect(played.attempts).toBe(2);
  expect((await page.evaluate(()=>(window as any).__mediaSources[0]))).toContain(songDeck.words[0].audio.sha256+'.mp3');
 }finally{await close();}
});

test('a hardware letter unlocks without losing the first letter and later keys do not restart playback',async({playwright},testInfo)=>{
 const {page,cdp,close}=await launchPractice(playwright,testInfo,instrumentMedia);
 try{
  // A busy device may receive its first key before React paints the blocked
  // state or flushes passive effects. Start on the real policy rejection.
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  await page.goto('/piclex-web/#/deck/'+song.id);
  const blocked=await until<Awaited<ReturnType<typeof mediaState>>>(cdp,`(()=>({attempts:__mediaAttempts,played:__mediaPlayed,errors:__mediaErrors.slice(),paused:__media.every(a=>a.paused),icon:!!document.querySelector('.audio-unlock'),active:navigator.userActivation?.hasBeenActive}))()`,value=>value.errors.includes('NotAllowedError')&&value.attempts>0,'blocked before typing');
  expect(blocked.active).toBe(false);expect(blocked.played).toBe(0);
  await page.keyboard.press('f');
  await expect(page.getByRole('textbox',{name:'输入英文',exact:true})).toHaveValue('f');
  const played=await until<Awaited<ReturnType<typeof mediaState>>>(cdp,`(()=>({attempts:__mediaAttempts,played:__mediaPlayed,errors:__mediaErrors.slice(),paused:__media.every(a=>a.paused),icon:!!document.querySelector('.audio-unlock'),active:navigator.userActivation?.hasBeenActive}))()`,value=>value.played===1&&!value.icon,'letter unlock');
  await page.keyboard.press('i');
  await expect(page.getByRole('textbox',{name:'输入英文',exact:true})).toHaveValue('fi');
  await sleep(350);
  const after=await mediaState(cdp);expect(after.attempts).toBe(played.attempts);expect(after.icon).toBe(false);
 }finally{await close();}
});

test('one real tap on the virtual F unlocks, keeps f, and a second tap never replays the blocked clip',async({playwright},testInfo)=>{
 const {page,cdp,close}=await launchPractice(playwright,testInfo,instrumentMedia,{viewport:{width:390,height:844},hasTouch:true,isMobile:true});
 try{
  await page.goto('/piclex-web/#/deck/'+song.id);
  await until<Awaited<ReturnType<typeof mediaState>>>(cdp,`(()=>({attempts:__mediaAttempts,played:__mediaPlayed,errors:__mediaErrors.slice(),paused:__media.every(a=>a.paused),icon:!!document.querySelector('.audio-unlock'),active:navigator.userActivation?.hasBeenActive}))()`,value=>value.icon&&value.attempts>0,'blocked before touch key');
  await page.getByRole('button',{name:'按键 F',exact:true}).tap();
  await expect(page.getByRole('textbox',{name:'输入英文',exact:true})).toHaveValue('f');
  const played=await until<Awaited<ReturnType<typeof mediaState>>>(cdp,`(()=>({attempts:__mediaAttempts,played:__mediaPlayed,errors:__mediaErrors.slice(),paused:__media.every(a=>a.paused),icon:!!document.querySelector('.audio-unlock'),active:navigator.userActivation?.hasBeenActive}))()`,value=>value.played===1&&!value.icon,'first tap unlock');
  await page.getByRole('button',{name:'按键 I',exact:true}).tap();
  await expect(page.getByRole('textbox',{name:'输入英文',exact:true})).toHaveValue('fi');
  await sleep(300);const after=await mediaState(cdp);expect(after.attempts).toBe(played.attempts);expect(after.icon).toBe(false);
 }finally{await close();}
});

test('changing module grants interaction permission, hides the icon and never replays stale audio',async({playwright},testInfo)=>{
 const {page,cdp,close}=await launchPractice(playwright,testInfo,instrumentMedia);
 try{
  await page.goto('/piclex-web/#/deck/'+song.id);
  await until<Awaited<ReturnType<typeof mediaState>>>(cdp,`(()=>({attempts:__mediaAttempts,played:__mediaPlayed,errors:__mediaErrors.slice(),paused:__media.every(a=>a.paused),icon:!!document.querySelector('.audio-unlock'),active:navigator.userActivation?.hasBeenActive}))()`,value=>value.icon&&value.attempts>0,'blocked before module change');
  await page.getByRole('tab',{name:'练听力',exact:true}).click();
  await expect(page.locator('.native-practice')).toHaveAttribute('data-module','listening');
  // The navigation gesture grants interaction permission while the old
  // spelling request is discarded; its icon must not linger.
  await expect(page.locator('.audio-unlock')).toHaveCount(0);
  const settled=await mediaState(cdp);await sleep(500);const later=await mediaState(cdp);
  expect(later.attempts).toBe(settled.attempts);
  expect(later.errors.filter(error=>!['NotAllowedError','AbortError'].includes(error))).toEqual([]);
  expect(later.paused).toBe(true);expect(later.icon).toBe(false);
  await page.locator('.playback-button').click();
  const retried=await until<Awaited<ReturnType<typeof mediaState>>>(cdp,`(()=>({attempts:__mediaAttempts,played:__mediaPlayed,errors:__mediaErrors.slice(),paused:__media.every(a=>a.paused),icon:!!document.querySelector('.audio-unlock'),active:navigator.userActivation?.hasBeenActive}))()`,value=>value.played===1&&!value.icon,'fallback retries current exercise');
  expect(retried.attempts).toBe(settled.attempts+1);
 }finally{await close();}
});
