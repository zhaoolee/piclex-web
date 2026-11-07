# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: http-crypto.spec.ts >> HTTP local import works and corrupt archives cannot replace it
- Location: tests/browser/http-crypto.spec.ts:27:1

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: getByRole('status')
Expected substring: "照片内容校验失败"
Error: strict mode violation: getByRole('status') resolved to 2 elements:
    1) <div role="status" class="load-progress">…</div> aka getByText('正在加载图片正在连接…')
    2) <div class="toast" role="status">…</div> aka getByRole('status').filter({ hasText: '照片内容校验失败，原有卡组未改变。' })

Call log:
  - Expect "toContainText" getByRole('status') with timeout 5000ms
  - waiting for getByRole('status')

```

# Page snapshot

```yaml
- generic [ref=e2]:
  - link "跳到内容" [ref=e3]:
    - /url: "#main-content"
  - main [ref=e5]:
    - generic [ref=e6]:
      - generic [ref=e7]:
        - paragraph [ref=e8]: EVERYDAY SCENES. EVERYDAY ENGLISH.
        - heading "把眼前的生活， 变成英语。" [level=1] [ref=e9]: 把眼前的生活，变成英语。
        - paragraph [ref=e10]: 从一张照片开始。看见场景，听见发音，亲手拼出那个词，让记忆有画面。
        - button "开始练习" [ref=e11] [cursor=pointer]
        - paragraph [ref=e13]: 免费体验 · 无需登录 · 进度保存在浏览器
      - button "开始Basic English 850 场景卡片卡组" [ref=e14] [cursor=pointer]:
        - img "Basic English 850 场景卡片" [ref=e15]
        - generic [ref=e16]:
          - generic [ref=e17]: 100 个场景 · 850 个词
          - strong [ref=e18]: Basic English 850 场景卡片
    - region [ref=e20]:
      - generic [ref=e21]:
        - generic [ref=e22]:
          - paragraph [ref=e23]: YOUR NEXT SMALL DISCOVERY
          - heading "今天，想学哪套卡组？" [level=2] [ref=e24]
        - button "导入自己的卡组" [ref=e25] [cursor=pointer]
      - generic [ref=e27]:
        - button "Basic English 850 场景卡片 Basic English 850 场景卡片 850个基础英语词的场景学习卡，已完整制作。本版包含C001–C100共100个场景、850个目标词，每词附中文、英美音标、搭配与原创中英例句；完善504个局部区域框、346个语境词，支持按词查看对应画面，配有原创中英配文。 100 张卡片 · 850 个词" [ref=e28] [cursor=pointer]:
          - img "Basic English 850 场景卡片" [ref=e30]
          - generic [ref=e31]:
            - heading "Basic English 850 场景卡片" [level=3] [ref=e32]
            - paragraph [ref=e34]: 850个基础英语词的场景学习卡，已完整制作。本版包含C001–C100共100个场景、850个目标词，每词附中文、英美音标、搭配与原创中英例句；完善504个局部区域框、346个语境词，支持按词查看对应画面，配有原创中英配文。
            - generic [ref=e35]: 100 张卡片 · 850 个词
        - button "程序员工作英语 程序员工作英语 程序员工作英语：8类常见工作沟通，每类10个场景，共80张黑底白线火柴人场景卡、320个词条；原创纯英文A/B对话与独立中文译文，免费学习。 80 张卡片 · 320 个词" [ref=e36] [cursor=pointer]:
          - img "程序员工作英语" [ref=e38]
          - generic [ref=e39]:
            - heading "程序员工作英语" [level=3] [ref=e40]
            - paragraph [ref=e42]: 程序员工作英语：8类常见工作沟通，每类10个场景，共80张黑底白线火柴人场景卡、320个词条；原创纯英文A/B对话与独立中文译文，免费学习。
            - generic [ref=e43]: 80 张卡片 · 320 个词
        - button "程序员 Vibe Coding 程序员 Vibe Coding 8个子专题，第一季规划40期，当前23张场景卡、92个词条。黑底白线火柴人与OpenAI Logo对话；每张含双语场景说明、四话轮A/B对白和4个相关词条。 23 张卡片 · 92 个词" [ref=e44] [cursor=pointer]:
          - img "程序员 Vibe Coding" [ref=e46]
          - generic [ref=e47]:
            - heading "程序员 Vibe Coding" [level=3] [ref=e48]
            - paragraph [ref=e50]: 8个子专题，第一季规划40期，当前23张场景卡、92个词条。黑底白线火柴人与OpenAI Logo对话；每张含双语场景说明、四话轮A/B对白和4个相关词条。
            - generic [ref=e51]: 23 张卡片 · 92 个词
        - button "下班后，去摄影吧！ 下班后，去摄影吧！ 程序员的摄影器材与影像英语：50个原创双语场景、200个摄影与视频学习词条，涵盖选购、镜头、参数、布光、配件、人像、外拍、后期、视频与声音。 50 张卡片 · 200 个词" [ref=e52] [cursor=pointer]:
          - img "下班后，去摄影吧！" [ref=e54]
          - generic [ref=e55]:
            - heading "下班后，去摄影吧！" [level=3] [ref=e56]
            - paragraph [ref=e58]: 程序员的摄影器材与影像英语：50个原创双语场景、200个摄影与视频学习词条，涵盖选购、镜头、参数、布光、配件、人像、外拍、后期、视频与声音。
            - generic [ref=e59]: 50 张卡片 · 200 个词
        - button "新概念英语第二册 新概念英语第二册 个人学习：第1–96课，1054句按原句顺序，每句一个单词，保留重复词与重复句。241张原创场景配图。 241 张卡片 · 1054 个词" [ref=e60] [cursor=pointer]:
          - img "新概念英语第二册" [ref=e62]
          - generic [ref=e63]:
            - heading "新概念英语第二册" [level=3] [ref=e64]
            - paragraph [ref=e66]: 个人学习：第1–96课，1054句按原句顺序，每句一个单词，保留重复词与重复句。241张原创场景配图。
            - generic [ref=e67]: 241 张卡片 · 1054 个词
        - button "经典英语歌曲 经典英语歌曲 通过经典英语歌曲练习拼词与歌词默写，按歌曲及原歌词顺序学习，保留重复句。现收录 Galway Girl、God Is a Girl（Chillout Mix）、Hotel California、Yesterday Once More、Take Me Home, Country Roads 和 Loves Me Not（t.A.T.u.）：6首歌曲、53张场景卡、342句歌词与原唱片段，附中文译文。后续歌曲追加到同一卡组。原音频需摄影学英语353版或更高版本。 53 张卡片 · 342 个词" [ref=e68] [cursor=pointer]:
          - img "经典英语歌曲" [ref=e70]
          - generic [ref=e71]:
            - heading "经典英语歌曲" [level=3] [ref=e72]
            - paragraph [ref=e74]: 通过经典英语歌曲练习拼词与歌词默写，按歌曲及原歌词顺序学习，保留重复句。现收录 Galway Girl、God Is a Girl（Chillout Mix）、Hotel California、Yesterday Once More、Take Me Home, Country Roads 和 Loves Me Not（t.A.T.u.）：6首歌曲、53张场景卡、342句歌词与原唱片段，附中文译文。后续歌曲追加到同一卡组。原音频需摄影学英语353版或更高版本。
            - generic [ref=e75]: 53 张卡片 · 342 个词
        - button "经典电影台词 经典电影台词 每张卡学习一个出现在电影原句中的词，搭配原句、中译与真实电影配图。现有100张卡、100个目标词，持续更新。 100 张卡片 · 100 个词" [ref=e76] [cursor=pointer]:
          - img "经典电影台词" [ref=e78]
          - generic [ref=e79]:
            - heading "经典电影台词" [level=3] [ref=e80]
            - paragraph [ref=e82]: 每张卡学习一个出现在电影原句中的词，搭配原句、中译与真实电影配图。现有100张卡、100个目标词，持续更新。
            - generic [ref=e83]: 100 张卡片 · 100 个词
        - button "咖啡馆的早晨 咖啡馆的早晨 你自己的照片与词汇 我的卡组 · 6 个词" [ref=e84] [cursor=pointer]:
          - img "咖啡馆的早晨" [ref=e86]
          - generic [ref=e87]:
            - heading "咖啡馆的早晨" [level=3] [ref=e88]
            - paragraph [ref=e90]: 你自己的照片与词汇
            - generic [ref=e91]: 我的卡组 · 6 个词
      - paragraph [ref=e92]: 支持 App 导出的 .piclexdeck 文件，最多 128 MiB。照片只保存在当前浏览器。
    - generic [ref=e93]:
      - generic [ref=e95]:
        - heading "你的照片，就是你的词书。" [level=2] [ref=e96]
        - paragraph [ref=e97]: 用摄影学英语 iPhone App 拍照制卡，在自己的生活里持续练习。
      - link "探索 iPhone App" [ref=e98]:
        - /url: https://apps.apple.com/cn/app/id6808490052
  - navigation "底部导航" [ref=e100]:
    - generic [ref=e101]:
      - button "拍摄" [ref=e102] [cursor=pointer]
      - button "学习" [ref=e105] [cursor=pointer]
      - button "设置" [ref=e108] [cursor=pointer]
  - button "选择照片卡组文件"
  - status [ref=e111]:
    - generic [ref=e112]: 照片内容校验失败，原有卡组未改变。
    - button "关闭提示" [ref=e113] [cursor=pointer]
```

# Test source

```ts
  1  | import {test,expect} from '@playwright/test';
  2  | import fs from 'node:fs';
  3  | import {unzipSync,zipSync} from 'fflate';
  4  | import {decodeProgress,stableID} from '../../packages/backup/src/progress.mjs';
  5  | 
  6  | const origin='http://piclex-http.test';
  7  | const catalog=JSON.parse(fs.readFileSync('apps/public/public/library/catalog.json','utf8'));
  8  | const first=catalog[0],deck=JSON.parse(fs.readFileSync('apps/public/public/'+first.payload,'utf8'));
  9  | const fixture=fs.readFileSync('tests/fixtures/demo/decks/cafe.piclexdeck');
  10 | test.beforeEach(async({page,baseURL})=>{
  11 |  // Forward bytes, not the browser URL: this is a real insecure HTTP origin.
  12 |  await page.route(origin+'/**',async route=>{
  13 |   const url=new URL(route.request().url());
  14 |   const response=await route.fetch({url:new URL(url.pathname+url.search,baseURL).href});
  15 |   await route.fulfill({response});
  16 |  });
  17 | });
  18 | async function insecure(page:import('@playwright/test').Page){
  19 |  expect(await page.evaluate(()=>({secure:isSecureContext,subtle:typeof crypto.subtle}))).toEqual({secure:false,subtle:'undefined'});
  20 | }
  21 | test('HTTP official deck opens and reloads without WebCrypto',async({page})=>{
  22 |  await page.goto(origin+'/piclex-web/#/learn');await insecure(page);
  23 |  await expect(page.getByRole('heading',{name:deck.words[0].chinese,exact:true})).toBeVisible();
  24 |  await expect(page.getByRole('textbox',{name:'输入英文',exact:true})).toBeVisible();
  25 |  await page.reload();await expect(page.getByRole('heading',{name:deck.words[0].chinese,exact:true})).toBeVisible();
  26 | });
  27 | test('HTTP local import works and corrupt archives cannot replace it',async({page})=>{
  28 |  await page.goto(origin+'/piclex-web/#/decks');await insecure(page);
  29 |  await page.getByLabel('选择照片卡组文件').setInputFiles({name:'cafe.piclexdeck',mimeType:'application/octet-stream',buffer:fixture});
  30 |  await expect(page.getByRole('heading',{name:'牛角包',exact:true})).toBeVisible();
  31 |  const files=unzipSync(fixture),photo=Object.keys(files).find(p=>p.endsWith('.jpg'))!;files[photo][42]^=1;
  32 |  await page.goto(origin+'/piclex-web/#/decks');
  33 |  await page.getByLabel('选择照片卡组文件').setInputFiles({name:'broken.piclexdeck',mimeType:'application/octet-stream',buffer:Buffer.from(zipSync(files))});
> 34 |  await expect(page.getByRole('status')).toContainText('照片内容校验失败');
     |                                         ^ Error: expect(locator).toContainText(expected) failed
  35 |  await page.goto(origin+'/piclex-web/#/learn');
  36 |  await expect(page.getByRole('heading',{name:'牛角包',exact:true})).toBeVisible();
  37 | });
  38 | 
  39 | test('HTTP automatic progress reads and publishes verified snapshots without secure-only crypto',async({page})=>{
  40 |  const dav='https://dav-http.example.test',folder='/dav/PicLex/progress/';
  41 |  const native=fs.readFileSync('tests/fixtures/backup/native-progress.json');
  42 |  const name='PicLex-progress-v1-'+JSON.parse(native.toString()).contentSHA256.slice(0,20)+'.json';
  43 |  const files=new Map<string,Buffer>([[folder+name,native]]),requests:string[]=[];
  44 |  await page.route(dav+'/**',async route=>{
  45 |   const req=route.request(),path=new URL(req.url()).pathname,method=req.method();requests.push(method+' '+path);
  46 |   const reply=(status:number,body:Buffer|string='')=>route.fulfill({status,body,headers:{'access-control-allow-origin':origin,'access-control-allow-methods':'GET, PUT, MOVE, DELETE, MKCOL, PROPFIND, OPTIONS','access-control-allow-headers':'authorization, content-type, depth, destination, overwrite, if-none-match'}});
  47 |   if(method==='OPTIONS')return reply(204);
  48 |   if(method==='PROPFIND')return reply(207,'<d:multistatus xmlns:d="DAV:">'+[path,...(path===folder?[...files.keys()].filter(p=>p.startsWith(folder)&&!p.includes('.complete-uploading-')):[])].map(p=>`<d:response><d:href>${p}</d:href><d:propstat><d:prop><d:resourcetype>${p.endsWith('/')?'<d:collection/>':''}</d:resourcetype></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`).join('')+'</d:multistatus>');
  49 |   if(method==='GET')return reply(files.has(path)?200:404,files.get(path));
  50 |   if(method==='MKCOL')return reply(201);
  51 |   if(method==='PUT'){expect(req.headers()['if-none-match']).toBe('*');expect(files.has(path)).toBe(false);files.set(path,req.postDataBuffer()!);return reply(201);}
  52 |   if(method==='MOVE'){const destination=new URL(req.headers().destination).pathname;expect(req.headers().overwrite).toBe('F');expect(files.has(destination)).toBe(false);files.set(destination,files.get(path)!);files.delete(path);return reply(201);}
  53 |   if(method==='DELETE'){expect(path).toContain('.complete-uploading-');files.delete(path);return reply(204);}
  54 |   return reply(405);
  55 |  });
  56 |  await page.addInitScript(address=>localStorage.setItem('piclex-web.webdav.connection',JSON.stringify({address,username:'fixture',password:'fixture',remember:true})),dav+'/dav/');
  57 |  await page.goto(origin+'/piclex-web/#/settings/data/webdav');await insecure(page);
  58 |  await page.evaluate(()=>window.dispatchEvent(new Event('online')));
  59 |  await expect(page.getByText('等级与学习进度已自动同步',{exact:true})).toBeVisible({timeout:20000});
  60 |  await page.goto(origin+'/piclex-web/#/settings/level');await expect(page.locator('.level-page')).toContainText('共 5 经验');
  61 |  // A new local event forces the staging upload/MOVE/readback path on HTTP.
  62 |  await page.evaluate(async()=>{
  63 |   const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('piclex-web-experience-v1');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  64 |   await new Promise<void>((resolve,reject)=>{const t=db.transaction('events','readwrite');t.objectStore('events').put({id:'http-reading',kind:'reading',credit:3,wordCount:3,at:Date.now()});t.oncomplete=()=>resolve();t.onerror=()=>reject(t.error);});db.close();
  65 |  });
  66 |  await page.goto(origin+'/piclex-web/#/settings/data/webdav');await page.evaluate(()=>window.dispatchEvent(new Event('online')));
  67 |  await expect.poll(()=>requests.filter(r=>r.startsWith('MOVE ')).length).toBeGreaterThan(0);
  68 |  await expect(page.getByText('等级与学习进度已自动同步',{exact:true})).toBeVisible();
  69 |  const snapshots=await Promise.all([...files.values()].map(b=>decodeProgress(new Uint8Array(b))));
  70 |  const expectedID=await stableID('http-reading');
  71 |  expect(snapshots.some(c=>c.readingEvents?.some((e:any)=>e.id===expectedID))).toBe(true);
  72 |  expect([...files.keys()].every(p=>p.endsWith('.json')&&!p.includes('.complete-uploading-'))).toBe(true);
  73 |  expect(requests.some(r=>r.includes('.piclexdeck'))).toBe(false);
  74 | });
  75 | 
```