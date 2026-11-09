import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {unzipSync,zipSync,strFromU8,strToU8} from 'fflate';

// A full-photo label reproduces the missing horizontal edges on short photo cards.
const archive=unzipSync(readFileSync(new URL('../fixtures/demo/decks/cafe.piclexdeck',import.meta.url)));
const manifest=JSON.parse(strFromU8(archive['manifest.json']));
const entry=manifest.photos[0],photo=JSON.parse(strFromU8(archive[entry.jsonPath]));
for(const label of photo.labels){label.boundingBox={left:0,top:0,right:1000,bottom:1000};label.positionUnavailable=false;}
archive[entry.jsonPath]=strToU8(JSON.stringify(photo));
entry.jsonSHA256=createHash('sha256').update(archive[entry.jsonPath]).digest('hex');
archive['manifest.json']=strToU8(JSON.stringify(manifest));
const fixture=Buffer.from(zipSync(archive));

for(const scheme of ['light','dark'] as const) test(`all four target edges remain visible with keyboard and resize: ${scheme}`,async({page},info)=>{
 await page.emulateMedia({colorScheme:scheme});
 await page.goto('/piclex-web/#/decks');
 await page.getByLabel('选择照片卡组文件').setInputFiles({name:'full-photo.piclexdeck',mimeType:'application/zip',buffer:fixture});
 await expect(page.locator('.focus-box')).toBeVisible();
 for(const size of [{width:390,height:844},{width:390,height:640},{width:320,height:568},{width:390,height:430},{width:844,height:390}]){
  await page.setViewportSize(size);
  await expect.poll(()=>page.locator('.focus-box').evaluate(el=>{
   const b=el.getBoundingClientRect(),p=el.parentElement!.getBoundingClientRect();
   return b.left>=p.left+3.9&&b.top>=p.top+3.9&&b.right<=p.right-3.9&&b.bottom<=p.bottom-3.9;
  })).toBe(true);
  // Sample throughout the old half-second transition window after resize.
  const samples=await page.evaluate(async()=>{
   const results:boolean[]=[];const until=performance.now()+550;
   while(performance.now()<until){await new Promise(requestAnimationFrame);const el=document.querySelector('.focus-box')!,b=el.getBoundingClientRect(),p=el.parentElement!.getBoundingClientRect();results.push(b.left>=p.left+3.9&&b.top>=p.top+3.9&&b.right<=p.right-3.9&&b.bottom<=p.bottom-3.9);}
   return results;
  });expect(samples.every(Boolean)).toBe(true);
  expect(await page.locator('.focus-ring').evaluate(el=>getComputedStyle(el,'::after').backgroundImage)).toContain('conic-gradient');
  if(size.height===640)await page.screenshot({path:info.outputPath(`four-edges-${scheme}.png`)});
 }
 await page.emulateMedia({reducedMotion:'reduce'});
 expect(await page.locator('.focus-ring').evaluate(el=>getComputedStyle(el,'::after').animationName)).toBe('none');
});
