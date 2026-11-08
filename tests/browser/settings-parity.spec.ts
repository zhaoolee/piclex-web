import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const catalog=JSON.parse(fs.readFileSync('apps/public/public/library/catalog.json','utf8'));
const packageBytes=fs.readFileSync('tests/fixtures/demo/decks/cafe.piclexdeck');
const fixture={deckID:'11111111-1111-4111-8111-111111111111',title:'测试照片卡组',author:'Fixture publisher',version:1,photoCount:1,wordCount:6,packageURL:'https://decks.example.test/deck.piclexdeck',packageBytes:packageBytes.length,packageSHA256:createHash('sha256').update(packageBytes).digest('hex'),access:'public'};
async function mockQuota(page:any){await page.route('**/v1/web/quota',route=>route.fulfill({json:{quota:{remaining:7,daily_limit:10,used:3,resets_at:0}}}));}

test('settings navigation before the first hash subscription leaves the old restore page',async({page})=>{
 await page.addInitScript(()=>{
  const add=window.addEventListener.bind(window);let moved=false;
  window.addEventListener=((type:string,listener:any,options:any)=>{
   if(type==='hashchange'&&!moved){moved=true;const oldURL=location.href;history.replaceState(null,'','#/settings/data');window.dispatchEvent(new HashChangeEvent('hashchange',{oldURL,newURL:location.href}));}
   add(type,listener,options);
  }) as typeof window.addEventListener;
 });
 await page.goto('/piclex-web/#/settings/data/webdav/restore');
 await expect(page).toHaveURL(/#\/settings\/data$/);
 await expect(page.getByRole('heading',{name:'照片数据',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'已拍照片 0',exact:true})).toBeVisible();
});

test('settings matches native hierarchy, pins the level card and retains theme and native subpages',async({page},info)=>{
 await mockQuota(page);await page.setViewportSize({width:390,height:844});await page.goto('/piclex-web/#/settings');
 await expect(page.locator('.settings-home-rows > .settings-row')).toHaveText(['AI配置官方模型','照片卡组','照片数据','外观与主题','个性化设置','关于']);
 await expect(page.locator('.settings-official-carousel > button')).toHaveCount(4);
 await expect(page.getByRole('button',{name:'薯薯求生',exact:true})).toHaveCount(0);
 const card=page.locator('.settings-level-card'),before=(await card.boundingBox())!;
 await page.getByRole('button',{name:'关于',exact:true}).scrollIntoViewIfNeeded();expect((await card.boundingBox())!.y).toBe(before.y);
 await page.locator('.settings-home-rows').evaluate(n=>n.scrollTop=0);
 await page.screenshot({path:info.outputPath('settings-native-light.png')});
 await page.getByRole('button',{name:'AI配置 官方模型',exact:true}).click();await expect(page.getByText('7 / 10',{exact:true})).toBeVisible();await page.getByRole('button',{name:'返回设置',exact:true}).click();
 await page.getByRole('button',{name:'外观与主题',exact:true}).click();await page.getByLabel('外观模式',{exact:true}).selectOption('dark');await page.reload();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');await expect(page.getByLabel('外观模式',{exact:true})).toHaveValue('dark');await page.getByRole('button',{name:'返回设置',exact:true}).click();await page.screenshot({path:info.outputPath('settings-native-dark.png')});
 await page.setViewportSize({width:802,height:1034});await page.screenshot({path:info.outputPath('settings-overview-dark.png')});
 await page.getByRole('button',{name:'个性化设置',exact:true}).click();await page.getByRole('button',{name:'实验室',exact:true}).click();await expect(page.getByRole('button',{name:'薯薯求生',exact:true})).toBeVisible();await expect(page.locator('iframe')).toHaveCount(0);
 for(const size of [{width:320,height:568},{width:844,height:390},{width:1440,height:1000}]){await page.setViewportSize(size);await page.goto('/piclex-web/#/settings');await page.getByRole('button',{name:'关于',exact:true}).scrollIntoViewIfNeeded();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);const row=(await page.getByRole('button',{name:'关于',exact:true}).boundingBox())!,nav=(await page.getByRole('navigation',{name:'底部导航'}).boundingBox())!;expect(row.y+row.height).toBeLessThanOrEqual(nav.y);}
});

test('third party download preserves the current draft, validates the package, and makes it selectable',async({page},info)=>{
 await page.route('https://decks.example.test/feed.json',route=>route.fulfill({json:{format:'com.piclex.deck-source',schemaVersion:1,decks:[fixture]}}));
 await page.route(fixture.packageURL,route=>route.fulfill({body:packageBytes,contentType:'application/zip'}));
 await page.goto('/piclex-web/#/learn');const input=page.getByRole('textbox',{name:'输入英文',exact:true});await expect(input).toBeVisible();await input.press('x');const draft=await input.inputValue(),url=page.url();
 await page.getByRole('button',{name:'下载第三方卡组',exact:true}).click();await expect(page.getByRole('heading',{name:'下载第三方卡组',exact:true})).toBeVisible();await page.screenshot({path:info.outputPath('third-party-download.png')});
 await page.getByRole('textbox',{name:'粘贴卡组 URL'}).fill('https://decks.example.test/feed.json');await page.getByRole('button',{name:'下载卡组',exact:true}).click();await page.getByRole('button',{name:'测试照片卡组 下载',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page).toHaveURL(url);await expect(input).toHaveValue(draft);
 await page.getByRole('button',{name:'当前卡组，学习设置',exact:true}).click();await expect(page.getByRole('group',{name:'切换卡组'}).getByRole('button')).toHaveCount(catalog.length+1);await page.getByRole('button',{name:'关闭',exact:true}).click();await page.reload();await expect(input).toHaveValue(draft);
 // A second download never duplicates the installed package.
 await page.getByRole('button',{name:'下载第三方卡组',exact:true}).click();await page.getByRole('textbox',{name:'粘贴卡组 URL'}).fill('https://decks.example.test/feed.json');await page.getByRole('button',{name:'下载卡组',exact:true}).click();await expect(page.getByRole('button',{name:'测试照片卡组 已下载',exact:true})).toBeDisabled();
});

test('failed and cancelled downloads leave practice and stored decks intact',async({page})=>{
 await page.route('https://decks.example.test/feed.json',route=>route.fulfill({json:{format:'com.piclex.deck-source',schemaVersion:1,decks:[{...fixture,packageSHA256:'0'.repeat(64)}]}}));
 await page.route(fixture.packageURL,route=>route.fulfill({body:packageBytes,contentType:'application/zip'}));
 await page.goto('/piclex-web/#/learn');await page.getByRole('button',{name:'下载第三方卡组',exact:true}).click();await page.getByRole('textbox',{name:'粘贴卡组 URL'}).fill('javascript:alert(1)');await expect(page.getByRole('button',{name:'下载卡组',exact:true})).toBeDisabled();await page.getByRole('textbox',{name:'粘贴卡组 URL'}).fill('https://decks.example.test/feed.json');await page.getByRole('button',{name:'下载卡组',exact:true}).click();await page.getByRole('button',{name:'测试照片卡组 下载',exact:true}).click();await expect(page.getByRole('alert')).toContainText('校验失败');await page.getByRole('button',{name:'关闭',exact:true}).click();
 await page.getByRole('button',{name:'当前卡组，学习设置',exact:true}).click();await expect(page.getByRole('group',{name:'切换卡组'}).getByRole('button')).toHaveCount(catalog.length);await page.getByRole('button',{name:'关闭',exact:true}).click();
 let release!:()=>void;const wait=new Promise<void>(r=>release=r);await page.route('https://decks.example.test/slow.piclexdeck',async route=>{await wait;await route.fulfill({body:packageBytes}).catch(()=>{});});
 try{await page.getByRole('button',{name:'下载第三方卡组',exact:true}).click();await page.getByRole('textbox',{name:'粘贴卡组 URL'}).fill('https://decks.example.test/slow.piclexdeck');await page.getByRole('button',{name:'下载卡组',exact:true}).click();await page.getByRole('button',{name:'取消下载',exact:true}).click();await expect(page.getByRole('button',{name:'下载卡组',exact:true})).toBeEnabled();await page.getByRole('button',{name:'关闭',exact:true}).click();}finally{release();}
});

test('keyboard settings use the native samples and eight voices; preview, mute and route cleanup work',async({page},info)=>{
 await page.addInitScript(()=>{const Original=window.Audio,w=window as any;w.__voices=[];w.__starts=0;w.__calls=0;w.Audio=class extends Original{constructor(src?:string){super(src);if(src?.includes('/audio/')&&!src.includes('correct-word')&&!src.includes('/ambience/')){w.__voices.push(this);this.addEventListener('playing',()=>w.__starts++);const play=this.play.bind(this);this.play=()=>{w.__calls++;return play();};}}};});
 await page.goto('/piclex-web/#/settings/keyboard');await expect(page.getByLabel('按键音',{exact:true}).locator('option')).toHaveCount(14);await expect(page.getByLabel('按键音',{exact:true})).toHaveValue('cherry-mx-blue');await expect(page.getByRole('switch',{name:'键盘敲击音'})).toBeChecked();
 await page.getByRole('button',{name:'试听当前按键音',exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as any).__starts)).toBeGreaterThan(0);
 expect(await page.evaluate(()=>(window as any).__voices.length)).toBe(8);expect(await page.evaluate(()=>(window as any).__voices.every((v:HTMLAudioElement)=>v.volume===1&&v.playbackRate===1))).toBe(true);
 await expect(page.getByLabel('按键音',{exact:true}).locator('option[value=cherry-mx-blue]')).toBeEnabled();
 await page.locator('.native-settings-detail').screenshot({path:info.outputPath('keyboard-cherry-mx-blue.png')});
 expect(await page.evaluate(()=>(window as any).__voices.every((v:HTMLAudioElement)=>v.src.endsWith('/cherry-mx-blue.mp3')))).toBe(true);
 await page.getByRole('button',{name:'学习',exact:true}).click();await expect(page.getByRole('textbox',{name:'输入英文',exact:true})).toBeVisible();const blueBefore=await page.evaluate(()=>(window as any).__calls);await page.getByRole('button',{name:'按键 X',exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as any).__calls)).toBe(blueBefore+1);expect(await page.evaluate(()=>(window as any).__voices.slice(-8).every((v:HTMLAudioElement)=>v.src.endsWith('/cherry-mx-blue.mp3')))).toBe(true);
 await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('button',{name:'个性化设置',exact:true}).click();await page.getByRole('button',{name:/^键盘声音/}).click();
 // Every deployed sound matches the separately audited native sample bytes.
 const files=JSON.parse(fs.readFileSync('docs/native-keyboard-sounds.json','utf8'));
 for(const file of files){const response=await page.request.get(`/piclex-web/audio/${file.file}`);expect(createHash('sha256').update(await response.body()).digest('hex')).toBe(file.sha256);}
 await page.evaluate(async()=>{const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('piclex-web-experience-v1',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});await new Promise<void>((resolve,reject)=>{const t=db.transaction('meta','readwrite');t.objectStore('meta').put({total:12,statistics:{},milestones:[]},'account');t.oncomplete=()=>resolve();t.onerror=()=>reject(t.error);});db.close();window.dispatchEvent(new Event('piclex-experience'));});
 await expect(page.getByLabel('按键音',{exact:true}).locator('option[value=alpaca]')).toBeEnabled();
 const before=await page.evaluate(()=>(window as any).__starts);await page.getByLabel('按键音',{exact:true}).selectOption('alpaca');await expect.poll(()=>page.evaluate(()=>(window as any).__starts)).toBeGreaterThan(before);expect(await page.evaluate(()=>localStorage.getItem('piclex-web.typing-sound-id'))).toBe('alpaca');
 await page.getByRole('button',{name:'学习',exact:true}).click();await expect(page.getByRole('textbox',{name:'输入英文',exact:true})).toBeVisible();const typingBefore=await page.evaluate(()=>(window as any).__calls);await page.getByRole('button',{name:'按键 X',exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as any).__calls)).toBe(typingBefore+1);expect(await page.evaluate(()=>(window as any).__voices.slice(-8).every((v:HTMLAudioElement)=>v.src.endsWith('/alpaca.mp3')))).toBe(true);
 await page.getByRole('button',{name:'设置',exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as any).__voices.every((v:HTMLAudioElement)=>v.paused))).toBe(true);await page.getByRole('button',{name:/个性化设置/}).click();await page.getByRole('button',{name:'键盘声音',exact:true}).click();
 await page.getByRole('switch',{name:'键盘敲击音'}).uncheck();await expect.poll(()=>page.evaluate(()=>(window as any).__voices.every((v:HTMLAudioElement)=>v.paused))).toBe(true);const calls=await page.evaluate(()=>(window as any).__calls);await page.getByRole('button',{name:'试听当前按键音',exact:true}).click();expect(await page.evaluate(()=>(window as any).__calls)).toBe(calls);await expect(page.getByRole('status')).toContainText('请先开启');await page.reload();await expect(page.getByRole('switch',{name:'键盘敲击音'})).not.toBeChecked();await expect(page.getByLabel('按键音',{exact:true})).toHaveValue('alpaca');
});
