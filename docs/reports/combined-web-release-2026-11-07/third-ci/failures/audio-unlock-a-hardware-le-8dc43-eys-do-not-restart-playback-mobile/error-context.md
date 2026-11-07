# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: audio-unlock.spec.ts >> a hardware letter unlocks without losing the first letter and later keys do not restart playback
- Location: tests/browser/audio-unlock.spec.ts:55:1

# Error details

```
Error: Timed out waiting for letter unlock: {"attempts":1,"played":0,"errors":["NotAllowedError"],"paused":true,"icon":true,"active":true}
```

# Test source

```ts
  1   | import {test,expect,type Page} from '@playwright/test';
  2   | import type {CDPSession} from 'playwright-core';
  3   | import fs from 'node:fs';
  4   | 
  5   | // Launch an isolated browser: Playwright's runner may grant activation through
  6   | // trace snapshots or evaluation. The first policy observation uses CDP only.
  7   | test.use({trace:'off',screenshot:'off'});
  8   | const catalog=JSON.parse(fs.readFileSync('apps/public/public/library/catalog.json','utf8'));
  9   | const song=catalog.find((deck:any)=>deck.id==='0a1ff2e2-3db0-4bb1-889a-b27b62798cbe'),songDeck=JSON.parse(fs.readFileSync('apps/public/public/'+song.payload,'utf8'));
  10  | const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
  11  | 
  12  | async function launchPractice(playwright:any,testInfo:any,instrument:(page:Page)=>Promise<void>,contextOptions:Record<string,unknown>={}){
  13  |  const browser=await playwright.chromium.launch({channel:testInfo.project.use.channel,headless:true,args:['--mute-audio','--autoplay-policy=document-user-activation-required'],ignoreDefaultArgs:['--autoplay-policy=no-user-gesture-required']});
  14  |  const context=await browser.newContext({baseURL:testInfo.project.use.baseURL,viewport:testInfo.project.use.viewport,hasTouch:testInfo.project.use.hasTouch,isMobile:testInfo.project.use.isMobile,deviceScaleFactor:testInfo.project.use.deviceScaleFactor,...contextOptions});
  15  |  const page=await context.newPage();await instrument(page);
  16  |  const cdp=await context.newCDPSession(page);
  17  |  return {browser,context,page,cdp,close:()=>browser.close()};
  18  | }
  19  | async function read<T>(cdp:CDPSession,expression:string){
  20  |  const {result,exceptionDetails}=await cdp.send('Runtime.evaluate',{expression,returnByValue:true,userGesture:false,awaitPromise:true});
  21  |  if(exceptionDetails)throw Error(exceptionDetails.exception?.description||exceptionDetails.text);
  22  |  return result.value as T;
  23  | }
  24  | async function until<T>(cdp:CDPSession,expression:string,accept:(value:T)=>boolean,label:string,timeout=15000){
  25  |  const end=Date.now()+timeout;let value:T;
  26  |  do{value=await read<T>(cdp,expression);if(accept(value))return value;await sleep(50);}while(Date.now()<end);
> 27  |  throw Error(`Timed out waiting for ${label}: ${JSON.stringify(value)}`);
      |        ^ Error: Timed out waiting for letter unlock: {"attempts":1,"played":0,"errors":["NotAllowedError"],"paused":true,"icon":true,"active":true}
  28  | }
  29  | async function instrumentMedia(page:Page){
  30  |  await page.addInitScript(()=>{
  31  |   const w=window as any,Original=window.Audio,clip=(src:string)=>src.includes('/library/')&&src.endsWith('.mp3');
  32  |   w.__media=[];w.__mediaAttempts=0;w.__mediaPlayed=0;w.__mediaErrors=[];w.__mediaSources=[];
  33  |   w.Audio=class extends Original{
  34  |    constructor(src?:string){super(src);if(src&&clip(src)){w.__media.push(this);w.__mediaSources.push(src);}}
  35  |    play(){const promise=super.play();if(clip(this.src)){w.__mediaAttempts++;promise.then(()=>{w.__mediaPlayed++;},error=>{w.__mediaErrors.push((error as DOMException).name||'Error');});}return promise;}
  36  |   };
  37  |  });
  38  | }
  39  | async function mediaState(cdp:CDPSession){return read<{attempts:number;played:number;errors:string[];paused:boolean;icon:boolean;active:boolean}>(cdp,`(()=>({attempts:__mediaAttempts,played:__mediaPlayed,errors:__mediaErrors.slice(),paused:__media.every(a=>a.paused),icon:!!document.querySelector('.audio-unlock'),active:navigator.userActivation?.hasBeenActive}))()`);}
  40  | 
  41  | test('real original audio: first load is blocked, the photo icon unlocks exactly that clip and disappears',async({playwright},testInfo)=>{
  42  |  const {page,cdp,close}=await launchPractice(playwright,testInfo,instrumentMedia);
  43  |  try{
  44  |   await page.goto('/piclex-web/#/deck/'+song.id);
  45  |   const blocked=await until<Awaited<ReturnType<typeof mediaState>>>(cdp,`(()=>({attempts:__mediaAttempts,played:__mediaPlayed,errors:__mediaErrors.slice(),paused:__media.every(a=>a.paused),icon:!!document.querySelector('.audio-unlock'),active:navigator.userActivation?.hasBeenActive}))()`,value=>value.icon&&value.attempts>0,'blocked first clip');
  46  |   expect(blocked.active).toBe(false);expect(blocked.errors).toContain('NotAllowedError');expect(blocked.played).toBe(0);
  47  |   await page.locator('.audio-unlock').click();
  48  |   await expect(page.locator('.audio-unlock')).toHaveCount(0);
  49  |   const played=await until<Awaited<ReturnType<typeof mediaState>>>(cdp,`(()=>({attempts:__mediaAttempts,played:__mediaPlayed,errors:__mediaErrors.slice(),paused:__media.every(a=>a.paused),icon:!!document.querySelector('.audio-unlock'),active:navigator.userActivation?.hasBeenActive}))()`,value=>value.played===1&&!value.icon,'retried original clip');
  50  |   expect(played.attempts).toBe(2);
  51  |   expect((await page.evaluate(()=>(window as any).__mediaSources[0]))).toContain(songDeck.words[0].audio.sha256+'.mp3');
  52  |  }finally{await close();}
  53  | });
  54  | 
  55  | test('a hardware letter unlocks without losing the first letter and later keys do not restart playback',async({playwright},testInfo)=>{
  56  |  const {page,cdp,close}=await launchPractice(playwright,testInfo,instrumentMedia);
  57  |  try{
  58  |   await page.goto('/piclex-web/#/deck/'+song.id);
  59  |   await until<Awaited<ReturnType<typeof mediaState>>>(cdp,`(()=>({attempts:__mediaAttempts,played:__mediaPlayed,errors:__mediaErrors.slice(),paused:__media.every(a=>a.paused),icon:!!document.querySelector('.audio-unlock'),active:navigator.userActivation?.hasBeenActive}))()`,value=>value.icon&&value.attempts>0,'blocked before typing');
  60  |   await page.keyboard.press('f');
  61  |   await expect(page.getByRole('textbox',{name:'输入英文',exact:true})).toHaveValue('f');
  62  |   const played=await until<Awaited<ReturnType<typeof mediaState>>>(cdp,`(()=>({attempts:__mediaAttempts,played:__mediaPlayed,errors:__mediaErrors.slice(),paused:__media.every(a=>a.paused),icon:!!document.querySelector('.audio-unlock'),active:navigator.userActivation?.hasBeenActive}))()`,value=>value.played===1&&!value.icon,'letter unlock');
  63  |   await page.keyboard.press('i');
  64  |   await expect(page.getByRole('textbox',{name:'输入英文',exact:true})).toHaveValue('fi');
  65  |   await sleep(350);
  66  |   const after=await mediaState(cdp);expect(after.attempts).toBe(played.attempts);expect(after.icon).toBe(false);
  67  |  }finally{await close();}
  68  | });
  69  | 
  70  | test('one real tap on the virtual F unlocks, keeps f, and a second tap never replays the blocked clip',async({playwright},testInfo)=>{
  71  |  const {page,cdp,close}=await launchPractice(playwright,testInfo,instrumentMedia,{viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  72  |  try{
  73  |   await page.goto('/piclex-web/#/deck/'+song.id);
  74  |   await until<Awaited<ReturnType<typeof mediaState>>>(cdp,`(()=>({attempts:__mediaAttempts,played:__mediaPlayed,errors:__mediaErrors.slice(),paused:__media.every(a=>a.paused),icon:!!document.querySelector('.audio-unlock'),active:navigator.userActivation?.hasBeenActive}))()`,value=>value.icon&&value.attempts>0,'blocked before touch key');
  75  |   await page.getByRole('button',{name:'按键 F',exact:true}).tap();
  76  |   await expect(page.getByRole('textbox',{name:'输入英文',exact:true})).toHaveValue('f');
  77  |   const played=await until<Awaited<ReturnType<typeof mediaState>>>(cdp,`(()=>({attempts:__mediaAttempts,played:__mediaPlayed,errors:__mediaErrors.slice(),paused:__media.every(a=>a.paused),icon:!!document.querySelector('.audio-unlock'),active:navigator.userActivation?.hasBeenActive}))()`,value=>value.played===1&&!value.icon,'first tap unlock');
  78  |   await page.getByRole('button',{name:'按键 I',exact:true}).tap();
  79  |   await expect(page.getByRole('textbox',{name:'输入英文',exact:true})).toHaveValue('fi');
  80  |   await sleep(300);const after=await mediaState(cdp);expect(after.attempts).toBe(played.attempts);expect(after.icon).toBe(false);
  81  |  }finally{await close();}
  82  | });
  83  | 
  84  | test('changing module grants interaction permission, hides the icon and never replays stale audio',async({playwright},testInfo)=>{
  85  |  const {page,cdp,close}=await launchPractice(playwright,testInfo,instrumentMedia);
  86  |  try{
  87  |   await page.goto('/piclex-web/#/deck/'+song.id);
  88  |   await until<Awaited<ReturnType<typeof mediaState>>>(cdp,`(()=>({attempts:__mediaAttempts,played:__mediaPlayed,errors:__mediaErrors.slice(),paused:__media.every(a=>a.paused),icon:!!document.querySelector('.audio-unlock'),active:navigator.userActivation?.hasBeenActive}))()`,value=>value.icon&&value.attempts>0,'blocked before module change');
  89  |   await page.getByRole('tab',{name:'练听力',exact:true}).click();
  90  |   await expect(page.locator('.native-practice')).toHaveAttribute('data-module','listening');
  91  |   // The navigation gesture grants interaction permission while the old
  92  |   // spelling request is discarded; its icon must not linger.
  93  |   await expect(page.locator('.audio-unlock')).toHaveCount(0);
  94  |   const settled=await mediaState(cdp);await sleep(500);const later=await mediaState(cdp);
  95  |   expect(later.attempts).toBe(settled.attempts);
  96  |   expect(later.errors.filter(error=>!['NotAllowedError','AbortError'].includes(error))).toEqual([]);
  97  |   expect(later.paused).toBe(true);expect(later.icon).toBe(false);
  98  |   await page.locator('.playback-button').click();
  99  |   const retried=await until<Awaited<ReturnType<typeof mediaState>>>(cdp,`(()=>({attempts:__mediaAttempts,played:__mediaPlayed,errors:__mediaErrors.slice(),paused:__media.every(a=>a.paused),icon:!!document.querySelector('.audio-unlock'),active:navigator.userActivation?.hasBeenActive}))()`,value=>value.played===1&&!value.icon,'fallback retries current exercise');
  100 |   expect(retried.attempts).toBe(settled.attempts+1);
  101 |  }finally{await close();}
  102 | });
  103 | 
```