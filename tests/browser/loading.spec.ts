import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import http from 'node:http';
import {fillSpelling} from './helpers/spelling';
const catalog=JSON.parse(fs.readFileSync('apps/public/public/library/catalog.json','utf8')),card=catalog[0];
const payload=fs.readFileSync('apps/public/public/'+card.payload),deck=JSON.parse(payload.toString());
const photo=fs.readFileSync('apps/public/public/'+deck.photos[0].path);
test('the inline Pac-Man maze appears before app assets and leaves after the styled app mounts',async({page})=>{
 let releaseStyle!:()=>void,releaseScript!:()=>void;
 const styleGate=new Promise<void>(resolve=>releaseStyle=resolve),scriptGate=new Promise<void>(resolve=>releaseScript=resolve);
 await page.route(/\/assets\/main-[^/]+\.css$/,async route=>{await styleGate;await route.continue();});
 await page.route(/\/assets\/main-[^/]+\.js$/,async route=>{await scriptGate;await route.continue();});
 try{
  await page.goto('/piclex-web/#/capture',{waitUntil:'commit'});
  const loader=page.getByRole('status',{name:'页面加载中'});
  await expect(loader).toBeVisible();
  const maze=loader.locator('.boot-maze');
  await expect(maze).toHaveCount(1);
  const box=await maze.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(180);expect(box!.width).toBeLessThanOrEqual(210);
  expect(box!.height).toBeGreaterThanOrEqual(120);expect(box!.height).toBeLessThanOrEqual(140);
  // 2D maze: drawn walls plus one square pellet per corridor tile.
  await expect(loader.locator('.boot-wall')).toHaveCount(1);
  expect(await loader.locator('.boot-wall').evaluate(el=>parseFloat(getComputedStyle(el).strokeWidth))).toBeGreaterThan(1);
  const dots=loader.locator('.boot-dot');
  expect(await dots.count()).toBeGreaterThan(40);
  expect(await dots.evaluateAll(els=>els.every(el=>el.getAttribute('width')===el.getAttribute('height')&&Number(el.getAttribute('width'))>=2))).toBe(true);
  await expect(loader.locator('.boot-pac')).toHaveCount(1);
  await expect(loader.locator('.boot-pac .boot-frame')).toHaveCount(3);
  const meta=await maze.evaluate(el=>({tiles:Number(el.getAttribute('data-tiles')),cycle:Number(el.getAttribute('data-cycle'))}));
  expect(meta.tiles).toBeGreaterThan(20);expect(meta.cycle).toBeGreaterThan(4);
  // Sample the whole loop: the maze route must move on both axes, one corridor
  // tile at a time (never diagonally, never straight through a wall), and the
  // facing must snap to the four axis directions at the corners.
  const samples=await loader.locator('.boot-pac').evaluate((el,{tiles,step})=>{
   const anims=el.getAnimations();
   const walk=anims.find(a=>(a as CSSAnimation).animationName==='boot-path')!;
   const face=anims.find(a=>(a as CSSAnimation).animationName==='boot-face')!;
   walk.pause();face.pause();
   const out:{x:number;y:number;deg:number}[]=[];
   for(let tile=0;tile<tiles;tile++){
    walk.currentTime=tile*step;face.currentTime=tile*step;
    const s=getComputedStyle(el),[tx,ty]=s.getPropertyValue('translate').split(' ').map(v=>parseFloat(v));
    out.push({x:Math.round(tx),y:Math.round(ty),deg:((parseFloat(s.getPropertyValue('rotate'))||0)%360+360)%360});
   }
   return out;
  },{tiles:meta.tiles,step:meta.cycle*1000/meta.tiles});
  expect(samples).toHaveLength(meta.tiles);
  for(let i=1;i<samples.length;i++){
   const a=samples[i-1],b=samples[i],movedX=a.x!==b.x,movedY=a.y!==b.y;
   expect(movedX!==movedY).toBe(true);
   expect(Math.abs(b.x-a.x)+Math.abs(b.y-a.y)).toBe(12);
  }
  const xs=samples.map(s=>s.x),ys=samples.map(s=>s.y);
  expect(new Set(xs).size).toBeGreaterThan(2);expect(new Set(ys).size).toBeGreaterThan(2);
  expect(Math.max(...xs)-Math.min(...xs)).toBeGreaterThanOrEqual(72);
  expect(Math.max(...ys)-Math.min(...ys)).toBeGreaterThanOrEqual(72);
  expect([...new Set(samples.map(s=>s.deg))].sort((a,b)=>a-b)).toEqual([0,90,180,270]);
  // Pellet removal shares the route clock: a square vanishing as Pac-Man reaches
  // it stays gone until the loop restarts and then comes back.
  const fade=await loader.locator('.boot-arena').evaluate((arena,cycleMs)=>{
   const clock=arena.getAnimations().find(a=>(a as CSSAnimation).animationName==='boot-clock')!;
   clock.pause();
   const dot=[...arena.querySelectorAll('.boot-dot')].find(el=>{const d=Number((el as SVGRectElement).style.getPropertyValue('--d'));return d>0.1&&d<0.9;}) as SVGRectElement;
   const d=Number(dot.style.getPropertyValue('--d'));
   const read=(t:number)=>{clock.currentTime=t;return parseFloat(getComputedStyle(dot).opacity);};
   return {d,start:read(0),before:read(d*cycleMs-40),after:read(d*cycleMs+40),restored:read(cycleMs+40)};
  },meta.cycle*1000);
  expect(fade.d).toBeGreaterThan(0.1);expect(fade.d).toBeLessThan(0.9);
  expect(fade.start).toBe(1);expect(fade.before).toBe(1);expect(fade.after).toBe(0);expect(fade.restored).toBe(1);
  await expect.poll(()=>loader.locator('.boot-pac .boot-frame-a').evaluate(el=>getComputedStyle(el).animationName)).toBe('boot-chomp-a');
  await expect.poll(()=>loader.locator('.boot-pac .boot-frame-c').evaluate(el=>getComputedStyle(el).animationName)).toBe('boot-chomp-c');
  await expect.poll(()=>loader.locator('.boot-pac').evaluate(el=>getComputedStyle(el).color)).toBe('rgb(36, 36, 36)');
  await page.emulateMedia({reducedMotion:'reduce'});
  await expect.poll(()=>loader.locator('.boot-pac .boot-frame-c').evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
  await expect.poll(()=>loader.locator('.boot-pac').evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
  await expect.poll(()=>loader.locator('.boot-arena').evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
  // Without animation the shared clock stays at 0, so every pellet except the
  // one Pac-Man already stands on is shown again.
  await expect.poll(()=>loader.locator('.boot-dot').evaluateAll(els=>els.filter(el=>parseFloat(getComputedStyle(el).opacity)===1).length)).toBeGreaterThan(40);
  await expect.poll(()=>loader.locator('.boot-pac .boot-frame-b').evaluate(el=>getComputedStyle(el).opacity)).toBe('1');
  await expect.poll(()=>loader.locator('.boot-pac .boot-frame-a').evaluate(el=>getComputedStyle(el).opacity)).toBe('0');
  releaseScript();
  await expect.poll(()=>page.locator('#root').evaluate(el=>el.childElementCount)).toBeGreaterThan(0);
  await expect(loader).toBeVisible();
  releaseStyle();
  await expect(loader).toHaveCount(0);
  await expect(page.getByRole('navigation',{name:'底部导航'})).toBeVisible();
 }finally{releaseScript();releaseStyle();}
});
test('all bottom icon assets start loading before any tap and delayed atlases retain square static icons',async({page})=>{
 const requested:string[]=[],loadedFrames=new Set<string>();let unlock!:()=>void;const gate=new Promise<void>(resolve=>unlock=resolve);
 page.on('request',r=>{if(/\/icons\/tab-/.test(r.url()))requested.push(r.url());});
 page.on('requestfinished',r=>{if(r.resourceType()==='image'&&/\/icons\/tab-.*-frames\.png$/.test(r.url()))loadedFrames.add(r.url());});
 await page.route('**/icons/tab-*-frames.png',async route=>{await gate;await route.continue();});
 await page.goto('/piclex-web/#/capture',{waitUntil:'domcontentloaded'});
 await expect.poll(()=>new Set(requested.map(url=>new URL(url).pathname)).size).toBe(6);
 const tabs=page.getByRole('navigation',{name:'底部导航'});
 await tabs.getByRole('button',{name:'设置',exact:true}).click();await expect(tabs.locator('.native-tab-motion')).toHaveCount(0);
 for(const icon of await tabs.locator('.native-tab-icon').all()){const rect=await icon.boundingBox();expect(rect!.width).toBeGreaterThan(18);expect(rect!.height).toBe(rect!.width);}
 // networkidle can occur before requestIdleCallback starts the background warmup.
 // Wait for the three actual image fetches (not just HTML fetch preloads).
 unlock();await expect.poll(()=>loadedFrames.size,{timeout:15000}).toBe(3);await page.waitForLoadState('networkidle');
 for(const name of ['学习','拍摄','设置'])await tabs.getByRole('button',{name,exact:true}).click();
 await expect(tabs.locator('.native-tab-motion')).toHaveCount(0,{timeout:3000});
});
// Playwright routing disables HTTP caching, so the delayed-image test above
// cannot also validate cache reuse. Exercise the normal browser cache separately.
test('warmed bottom icons reuse image bytes when navigating without request interception',async({page})=>{
 const loadedFrames=new Set<string>();
 page.on('requestfinished',r=>{if(r.resourceType()==='image'&&/\/icons\/tab-.*-frames\.png$/.test(r.url()))loadedFrames.add(r.url());});
 await page.goto('/piclex-web/#/capture');
 await expect.poll(()=>loadedFrames.size,{timeout:15000}).toBe(3);
 await page.waitForLoadState('networkidle');
 const resources=()=>page.evaluate(()=>performance.getEntriesByType('resource').filter(e=>/\/icons\/tab-/.test(e.name)).map(e=>({name:e.name,transferSize:(e as PerformanceResourceTiming).transferSize})));
 const before=await resources();expect(new Set(before.map(e=>e.name)).size).toBe(6);
 const tabs=page.getByRole('navigation',{name:'底部导航'});
 for(const name of ['学习','拍摄','设置'])await tabs.getByRole('button',{name,exact:true}).click();
 await expect(tabs.locator('.native-tab-motion')).toHaveCount(0,{timeout:3000});await page.waitForLoadState('networkidle');
 // A memory/disk hit transfers zero bytes; conditional validation can report
 // the Resource Timing header allowance (300 bytes), but must not redownload PNG data.
 const subsequent=(await resources()).slice(before.length);
 for(const entry of subsequent){expect(before.some(e=>e.name===entry.name)).toBe(true);expect(entry.transferSize).toBeLessThanOrEqual(300);}
});
test('deck and photo downloads display actual intermediate progress, then clear after decoding',async({page},testInfo)=>{
 let releaseDeck!:()=>void,releasePhoto!:()=>void;
 const deckGate=new Promise<void>(r=>releaseDeck=r),photoGate=new Promise<void>(r=>releasePhoto=r);
 const server=http.createServer(async(req,res)=>{const bytes=req.url==='/deck'?payload:photo;res.writeHead(200,{'Content-Type':req.url==='/deck'?'application/json':'image/jpeg','Content-Length':bytes.length,'Access-Control-Allow-Origin':'*'});const split=Math.floor(bytes.length/2);res.write(bytes.subarray(0,split));await(req.url==='/deck'?deckGate:photoGate);res.end(bytes.subarray(split));});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const port=(server.address() as any).port;
 try{
  await page.route('**/'+card.payload,route=>route.continue({url:`http://127.0.0.1:${port}/deck`}));
  await page.route('**/'+deck.photos[0].path,route=>route.continue({url:`http://127.0.0.1:${port}/photo`}));
  await page.goto('/piclex-web/#/deck/'+card.id,{waitUntil:'domcontentloaded'});
  const data=page.getByRole('progressbar',{name:'正在加载卡组',exact:true});await expect(data).toBeVisible();await expect.poll(async()=>Number(await data.getAttribute('value'))).toBeGreaterThan(0);expect(Number(await data.getAttribute('value'))).toBeLessThan(100);
  const bounds=await data.boundingBox(),height=page.viewportSize()!.height;expect(bounds!.y).toBeGreaterThan(height*.3);expect(bounds!.y).toBeLessThan(height*.7);
  await page.screenshot({path:testInfo.outputPath('deck-download-progress.png')});
  releaseDeck();const image=page.getByRole('progressbar',{name:'正在加载图片',exact:true});await expect(image).toBeVisible();await expect.poll(async()=>Number(await image.getAttribute('value'))).toBeGreaterThan(0);expect(Number(await image.getAttribute('value'))).toBeLessThan(100);await expect(page.locator('.focus-image')).toHaveCount(0);
  await page.screenshot({path:testInfo.outputPath('photo-download-progress.png')});
  releasePhoto();await expect(page.locator('.focus-image')).toBeVisible();await expect(image).toHaveCount(0);expect(await page.locator('.focus-image').evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth>0)).toBe(true);
 }finally{releaseDeck();releasePhoto();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
test('a failed photo has an explicit retry action and no endless progress bar',async({page})=>{
 let attempts=0;await page.route('**/'+deck.photos[0].path,async route=>{if(++attempts===1)await route.abort();else await route.continue();});
 await page.goto('/piclex-web/#/deck/'+card.id);await expect(page.getByText('图片加载失败，点击重试',{exact:true})).toBeVisible();await expect(page.getByRole('progressbar',{name:'正在加载图片',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'重新加载图片',exact:true}).click();await expect(page.locator('.focus-image')).toBeVisible();await expect(page.getByText('图片加载失败，点击重试',{exact:true})).toHaveCount(0);expect(attempts).toBe(2);
});

test('finishing a word keeps its photo visible when the download completes late',async({page})=>{
 const index=deck.words.findIndex((word:{english:string;imageIndex:number},i:number)=>/^[a-z]+$/i.test(word.english)&&deck.words[i+1]&&word.imageIndex!==deck.words[i+1].imageIndex);
 const word=deck.words[index],next=deck.words[index+1],path=deck.photos[word.imageIndex].path;
 const bytes=fs.readFileSync('apps/public/public/'+path);
 let finish!:()=>void;
 const gate=new Promise<void>(resolve=>finish=resolve);
 const server=http.createServer(async(_req,res)=>{
  res.writeHead(200,{'Content-Type':'image/jpeg','Content-Length':bytes.length,'Access-Control-Allow-Origin':'*'});
  const split=Math.floor(bytes.length/2);
  res.write(bytes.subarray(0,split));await gate;res.end(bytes.subarray(split));
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const {port}=server.address() as {port:number};
 try{
  await page.addInitScript(()=>{
   localStorage.setItem('piclex-web.typing-sound','false');
   Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{speak(){},cancel(){},getVoices:()=>[],addEventListener(){},removeEventListener(){}}});
  });
  await page.clock.install();
  await page.route('**/'+path,route=>route.continue({url:'http://127.0.0.1:'+port+'/photo'}));
  await page.goto('/piclex-web/#/deck/'+card.id+'?module=spelling&word='+encodeURIComponent(word.id));
  const progress=page.getByRole('progressbar',{name:'正在加载图片',exact:true});
  await expect.poll(async()=>Number(await progress.getAttribute('value'))).toBeGreaterThan(0);
  await fillSpelling(page,word.english);
  await page.clock.runFor(600);
  await expect(page.getByRole('heading',{name:word.chinese,exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'下一个',exact:true})).toBeVisible();
  await page.evaluate(gloss=>{
   const observer=new MutationObserver(()=>{
    if(document.querySelector('.focus-image')&&document.querySelector('.native-hint-word')?.textContent===gloss){
     document.documentElement.dataset.latePhotoDisplayed='true';
     observer.disconnect();
    }
   });
   observer.observe(document.body,{childList:true,subtree:true});
  },word.chinese);
  finish();
  await expect(page.locator('html')).toHaveAttribute('data-late-photo-displayed','true');
  await expect(page.getByRole('heading',{name:next.chinese,exact:true})).toBeVisible();
 }finally{finish();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
