import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import http from 'node:http';
test('the game route shows Pac-Man while its card deck is preparing',async({page})=>{
 let release!:()=>void;const gate=new Promise<void>(r=>release=r);
 await page.route('**/library/*/*/deck.json',async route=>{await gate;await route.continue().catch(()=>{});});
 try{
  await page.goto('/piclex-web/#/settings/lab',{waitUntil:'domcontentloaded'});
  const loader=page.locator('.lab-loading');
  await expect(loader.getByText('正在准备游戏…',{exact:true})).toBeVisible();
  await expect(page.locator('iframe')).toHaveCount(0);
  const pac=loader.locator('.boot-pac');
  await expect(pac).toHaveCSS('animation-name','boot-path, boot-face');
  await page.emulateMedia({reducedMotion:'reduce'});
  await expect(pac).toHaveCSS('animation-name','none');
  release();
  await expect(page.locator('iframe')).toBeVisible();
  await expect(loader).toHaveCount(0);
 }finally{release();}
});
test('game program delay shows loading immediately and the game return restores navigation',async({page},info)=>{
 await page.setViewportSize({width:844,height:390});let release!:()=>void;const gate=new Promise<void>(r=>release=r);
 await page.route('**/assets/main-*.js',async route=>{if(route.request().frame().parentFrame())await gate;await route.continue().catch(()=>{});});
 const tabs=page.getByRole('navigation',{name:'底部导航'});
 try{
  await page.goto('/piclex-web/#/settings/lab',{waitUntil:'domcontentloaded'});
  await expect(page.locator('.lab-loading')).toBeVisible();
  await expect(page.getByRole('progressbar',{name:'游戏加载进度'})).toBeVisible();
  // The waiting screen reuses the homepage pixel maze instead of a native bar.
  const maze=page.locator('.lab-loading .boot-maze');
  await expect(maze).toHaveCount(1);
  await expect(maze).toHaveAttribute('data-tiles','52');
  await expect(maze).toHaveAttribute('data-cycle','8.32');
  await expect(page.locator('.lab-loading .boot-pac .boot-frame')).toHaveCount(3);
  expect(await page.locator('.lab-loading .boot-dot').count()).toBe(80);
  await expect.poll(()=>page.locator('.lab-loading .boot-arena').evaluate(el=>getComputedStyle(el).animationName)).toBe('boot-clock');
  expect(await page.getByRole('progressbar',{name:'游戏加载进度'}).evaluate(el=>[getComputedStyle(el).width,getComputedStyle(el).height])).toEqual(['1px','1px']);
  await expect(tabs).toHaveCount(0);
  const viewport=await page.evaluate(()=>innerHeight),box=(await page.locator('.laboratory-page').boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(viewport-1);
  expect(box.y+box.height).toBeLessThanOrEqual(viewport+1);
  await page.screenshot({path:info.outputPath('game-program-loading.png')});
  await page.locator('.lab-loading').getByRole('button',{name:'返回实验室',exact:true}).click();
  await expect(page.locator('iframe')).toHaveCount(0);
  await expect(page.locator('.laboratory-page')).toHaveCount(0);
  await expect(tabs).toBeVisible();
  await expect(tabs.getByRole('button',{name:'设置',exact:true})).toHaveAttribute('aria-current','page');
 }finally{release();}
});
test('the standalone game boot cover shows the shared pixel maze instead of a native bar',async({page})=>{
 let release!:()=>void;const gate=new Promise<void>(r=>release=r);
 await page.route('**/assets/main-*.js',async route=>{await gate;await route.continue().catch(()=>{});});
 try{
  await page.goto('/piclex-web/lab/index.html',{waitUntil:'commit'});
  const cover=page.locator('#lab-boot');
  await expect(cover).toBeVisible();
  const maze=cover.locator('.boot-maze');
  await expect(maze).toHaveCount(1);
  await expect(maze).toHaveAttribute('data-tiles','52');
  await expect(maze).toHaveAttribute('data-cycle','8.32');
  await expect(cover.locator('.boot-pac .boot-frame')).toHaveCount(3);
  expect(await cover.locator('.boot-dot').count()).toBe(80);
  await expect.poll(()=>cover.locator('.boot-arena').evaluate(el=>getComputedStyle(el).animationName)).toBe('boot-clock');
  const paint=await page.evaluate(()=>{const cover=getComputedStyle(document.getElementById('lab-boot')!);return {ink:cover.color,bg:cover.backgroundColor,body:getComputedStyle(document.querySelector('#lab-boot .boot-body')!).fill,jaw:getComputedStyle(document.querySelector('#lab-boot .boot-jaw')!).fill};});expect(paint.body).toBe(paint.ink);expect(paint.jaw).toBe(paint.bg);
  const bar=cover.getByRole('progressbar',{name:'游戏加载进度'});
  await expect(bar).toBeVisible();
  expect(await bar.evaluate(el=>[getComputedStyle(el).width,getComputedStyle(el).height])).toEqual(['1px','1px']);
 }finally{release();}
});
test('artwork reports real partial progress then reveals a playable game',async({page},info)=>{
 await page.setViewportSize({width:844,height:390});let release!:()=>void;const gate=new Promise<void>(r=>release=r);
 await page.route('**/lab/assets/hero.webp',async route=>{await gate;await route.continue().catch(()=>{});});
 const tabs=page.getByRole('navigation',{name:'底部导航'});
 try{
  await page.goto('/piclex-web/#/settings/lab',{waitUntil:'domcontentloaded'});
  const bar=page.getByRole('progressbar',{name:'游戏加载进度'});
  await expect(bar).toHaveAttribute('max','15');
  await expect.poll(async()=>Number(await bar.getAttribute('value'))).toBe(14);
  await expect(page.locator('iframe')).toBeHidden();
  await expect(tabs).toHaveCount(0);
  await page.screenshot({path:info.outputPath('game-art-progress.png')});
  release();
  await expect(page.locator('.lab-loading')).toHaveCount(0);
  await expect(page.frameLocator('iframe').getByRole('button',{name:'开始冒险',exact:true})).toBeVisible();
  await expect(tabs).toHaveCount(0);
  const viewport=await page.evaluate(()=>innerHeight),lab=(await page.locator('.laboratory-page').boundingBox())!,frame=(await page.locator('iframe').boundingBox())!;
  expect(lab.height).toBeGreaterThanOrEqual(viewport-1);
  expect(lab.y+lab.height).toBeLessThanOrEqual(viewport+1);
  expect(frame.height).toBeGreaterThanOrEqual(lab.height-1);
  expect(frame.width).toBeGreaterThanOrEqual(lab.width-1);
  expect(await page.evaluate(()=>document.documentElement.scrollHeight)).toBe(viewport);
 }finally{release();}
});
test('the complete artwork preload stays below 1.5 MiB',async({page})=>{
 await page.setViewportSize({width:844,height:390});
 await page.goto('/piclex-web/#/settings/lab',{waitUntil:'domcontentloaded'});
 await expect(page.locator('iframe')).toBeVisible();
 const game=page.frameLocator('iframe');
 await expect(game.getByRole('button',{name:'开始冒险',exact:true})).toBeEnabled();
 const images=await game.locator('body').evaluate(()=>{
  const artwork=new Map<string,number>();
  for(const entry of performance.getEntriesByType('resource') as PerformanceResourceTiming[]){
   const path=new URL(entry.name).pathname;
   if(path.includes('/lab/assets/')&&/\.(png|webp)$/.test(path))artwork.set(path,entry.encodedBodySize);
  }
  return [...artwork.values()];
 });
 expect(images).toHaveLength(15);
 expect(Math.min(...images)).toBeGreaterThan(0);
 expect(images.reduce((sum,bytes)=>sum+bytes,0)).toBeLessThan(1.5*1024*1024);
});
test('failed game resources show retry and preserve an existing adventure',async({page})=>{
 await page.setViewportSize({width:844,height:390});
 const tabs=page.getByRole('navigation',{name:'底部导航'});
 await page.goto('/piclex-web/#/settings/lab');
 const game=page.frameLocator('iframe');
 await game.getByRole('button',{name:'开始冒险',exact:true}).click();
 await game.getByRole('button',{name:'暂停',exact:true}).click();
 await expect(tabs).toHaveCount(0);
 await game.locator('.topbar').getByRole('button',{name:'返回实验室',exact:true}).click();
 await expect(page.locator('iframe')).toHaveCount(0);
 await expect(tabs).toBeVisible();
 await tabs.getByRole('button',{name:'设置',exact:true}).click();
 let failing=true,attempts=0;await page.route('**/lab/assets/hero.webp',route=>{attempts++;return failing?route.abort():route.continue();});await page.getByRole('button',{name:'个性化设置',exact:true}).click();await page.getByRole('button',{name:'实验室',exact:true}).click();await page.getByRole('button',{name:/薯薯求生/}).click();await expect(page.getByRole('alert')).toContainText('素材加载失败');await expect(page.locator('.lab-loading .boot-maze')).toHaveCount(0);await expect(page.getByRole('progressbar',{name:'游戏加载进度'})).toHaveCount(0);failing=false;await page.getByRole('button',{name:'重新加载游戏',exact:true}).click();await expect(game.getByRole('button',{name:/继续冒险 · 第 1 波/})).toBeVisible();expect(attempts).toBeGreaterThanOrEqual(2);
});
test('failed game program has a recovery action instead of a blank canvas',async({page})=>{
 await page.setViewportSize({width:844,height:390});let failed=false;await page.route('**/assets/main-*.js',async route=>{if(route.request().frame().parentFrame()&&!failed){failed=true;await route.abort();}else await route.continue();});
 await page.goto('/piclex-web/#/settings/lab');await expect(page.getByRole('alert')).toBeVisible();await page.getByRole('button',{name:'重新加载游戏',exact:true}).click();await expect(page.frameLocator('iframe').getByRole('button',{name:'开始冒险',exact:true})).toBeVisible();
});

test('a half-downloaded game program shows measured byte progress, not a black screen',async({page,baseURL},info)=>{
 await page.setViewportSize({width:844,height:390});
 const html=fs.readFileSync('dist/lab/index.html','utf8'),assets=JSON.parse(html.match(/window\.PICLEX_LAB_BOOT_ASSETS=(\[.*?\])<\/script>/)![1]);const asset=assets.sort((a:any,b:any)=>b.bytes-a.bytes)[0];const bytes=fs.readFileSync('dist/'+asset.url.replace('/piclex-web/',''));
 let release!:()=>void;const gate=new Promise<void>(r=>release=r);
 // Serve the delayed module on the same origin as the app in every browser.
 const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url!,baseURL);
  if(url.pathname===asset.url){
   const half=Math.floor(bytes.length/2);
   res.writeHead(200,{'Content-Type':'application/javascript','Content-Length':bytes.length});
   res.write(bytes.subarray(0,half));await gate;res.end(bytes.subarray(half));
   return;
  }
  const upstream=http.get(url,response=>{res.writeHead(response.statusCode!,response.headers);response.pipe(res);});
  upstream.on('error',()=>res.destroy());
  res.on('close',()=>upstream.destroy());
 });
 await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const tabs=page.getByRole('navigation',{name:'底部导航'});
 try{const port=(server.address() as any).port;
  await page.goto(`http://127.0.0.1:${port}/piclex-web/#/settings/lab`,{waitUntil:'domcontentloaded'});
  await expect(page.getByText('正在下载游戏程序…',{exact:true})).toBeVisible();
  const bar=page.getByRole('progressbar',{name:'游戏加载进度'});
  await expect.poll(async()=>Number(await bar.getAttribute('value'))).toBeGreaterThan(0);
  expect(Number(await bar.getAttribute('value'))).toBeLessThan(Number(await bar.getAttribute('max')));
  await expect(tabs).toHaveCount(0);
  await page.screenshot({path:info.outputPath('game-byte-progress.png')});
  await page.locator('.lab-loading').getByRole('button',{name:'返回实验室',exact:true}).click();
  await expect(page.locator('iframe')).toHaveCount(0);
  await expect(tabs).toBeVisible();
 }finally{release();server.closeAllConnections();
  await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

test('a slow artwork transfer beyond 45 seconds stays loading and can finish',async({page})=>{
 await page.clock.install();let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);
 await page.route('**/lab/assets/hero.webp',async route=>{await gate;await route.continue().catch(()=>{});});
 try{await page.goto('/piclex-web/#/settings/lab');const bar=page.getByRole('progressbar',{name:'游戏加载进度'});await expect(bar).toHaveAttribute('value','14');await page.clock.fastForward(60000);await expect(page.getByRole('alert')).toHaveCount(0);await expect(bar).toHaveAttribute('value','14');release();await expect(page.locator('.lab-loading')).toHaveCount(0);await expect(page.frameLocator('iframe').getByRole('button',{name:'开始冒险',exact:true})).toBeVisible();}finally{release();}
});
