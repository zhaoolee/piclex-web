# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: layout-audit.spec.ts >> listening loops at end, retains position through a sheet and handles failures and fixed-rate repeat
- Location: tests/browser/layout-audit.spec.ts:52:1

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: '播放', exact: true })

```

# Page snapshot

```yaml
- generic [ref=e2]:
  - link "跳到内容" [ref=e3] [cursor=pointer]:
    - /url: "#main-content"
  - main "学习" [ref=e5]:
    - generic [ref=e6]:
      - button "返回单词学习" [ref=e7] [cursor=pointer]
      - generic [ref=e9]:
        - button "等级 LV0，0 经验" [ref=e10] [cursor=pointer]:
          - generic:
            - strong: LV0
        - button "当前卡组，学习设置" [ref=e11] [cursor=pointer]:
          - progressbar "等级经验" [ref=e13]:
            - generic [ref=e14]: 0.00%
          - generic [ref=e15]:
            - generic [ref=e16]: 咖啡馆的早晨
            - generic [aria-hidden] [ref=e17]: ▾
        - progressbar "本轮练习进度" [ref=e18]
      - button "下载第三方卡组" [ref=e19] [cursor=pointer]:
        - strong [ref=e20]: 下载
        - generic [ref=e21]: 第三方卡组
    - tablist "学习模块" [ref=e22]:
      - tab "拼单词" [ref=e23] [cursor=pointer]
      - tab "练听力" [selected] [ref=e25] [cursor=pointer]
      - tab "练口语" [ref=e28] [cursor=pointer]
    - generic [ref=e30]:
      - article [ref=e31]:
        - generic [ref=e32]:
          - img "完整场景照片" [ref=e34]
          - button "选择照片" [ref=e35] [cursor=pointer]
        - generic [ref=e36]:
          - combobox "句子练习模式" [ref=e37]:
            - option "随身听" [selected]
            - option "词块拼句"
            - option "自由听写"
          - group [ref=e38]:
            - generic "背景声：咖啡厅" [ref=e39] [cursor=pointer]
            - option "很轻"
            - option "轻柔" [selected]
            - option "适中"
      - region "随身听" [ref=e42]:
        - paragraph [ref=e43]:
          - generic [ref=e44]: The
          - generic [ref=e45]: table
          - generic [ref=e46]: is
          - generic [ref=e47]: made
          - generic [ref=e48]: of
          - generic [ref=e49]: dark
          - generic [ref=e50]: wood.
        - paragraph [ref=e51]: 这张桌子是深色木头做的。
        - alert [ref=e52]: 朗读暂时不可用，请检查浏览器的语音与播放权限。
    - generic [ref=e53]:
      - generic [ref=e54]:
        - generic [ref=e55]: 句子位置（按词）
        - slider "句子播放位置" [ref=e56] [cursor=pointer]: "0"
      - generic [ref=e57]:
        - generic "播放列表位置" [ref=e58]: 6/6
        - generic [ref=e59]:
          - generic [aria-hidden] [ref=e60]: ↻
          - combobox "循环方式" [ref=e61] [cursor=pointer]:
            - option "单句播五遍"
            - option "单句播一遍" [selected]
            - option "单句快3慢2"
            - option "仅单句循环"
        - combobox "播放速度" [ref=e62] [cursor=pointer]:
          - option "0.75×"
          - option "0.85×"
          - option "1×" [selected]
          - option "1.15×"
      - generic [ref=e63]:
        - button "上一句" [active] [ref=e64] [cursor=pointer]
        - button "重新准备" [ref=e66] [cursor=pointer]
        - button "下一句" [ref=e68] [cursor=pointer]
  - navigation "底部导航" [ref=e70]:
    - generic [ref=e71]:
      - button "拍摄" [ref=e72] [cursor=pointer]
      - button "学习" [ref=e75] [cursor=pointer]
      - button "设置" [ref=e78] [cursor=pointer]
  - button "选择照片卡组文件"
```

# Test source

```ts
  1  | import {observeAmbienceMix,ambienceGain} from './helpers/ambience';
  2  | import {test,expect,type Page} from '@playwright/test';
  3  | import path from 'node:path';
  4  | import fs from 'node:fs';
  5  | const catalog=JSON.parse(fs.readFileSync('apps/public/public/library/catalog.json','utf8'));
  6  | async function open(page:Page){
  7  |  await page.goto('/piclex-web/#/decks');await expect(page.getByRole('button',{name:'导入自己的卡组',exact:true})).toBeEnabled();
  8  |  await page.getByLabel('选择照片卡组文件').setInputFiles(path.resolve('tests/fixtures/demo/decks/cafe.piclexdeck'));
  9  |  await expect(page.getByRole('heading',{name:'牛角包',exact:true})).toBeVisible();await page.getByRole('button',{name:'关闭提示',exact:true}).click();
  10 | }
  11 | async function photoColors(page:Page,selector:string){
  12 |  await expect.poll(()=>page.locator('.native-practice').evaluate(e=>e.style.getPropertyValue('--photo-background'))).not.toBe('');
  13 |  const palette=await page.locator('.native-practice').evaluate(e=>({background:e.style.getPropertyValue('--photo-background'),ink:e.style.getPropertyValue('--photo-ink')}));
  14 |  const normalized=(value:string)=>`rgb(${value.match(/\d+/g)!.join(', ')})`;
  15 |  await expect(page.locator(selector)).toHaveCSS('background-color',normalized(palette.background));
  16 |  for(const node of await page.locator(`${selector}, ${selector} h1, ${selector} small, ${selector}>select`).all())await expect(node).toHaveCSS('color',normalized(palette.ink));
  17 |  const luminance=(value:string)=>value.match(/\d+/g)!.map(Number).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
  18 |  const a=luminance(palette.background),b=luminance(palette.ink);expect((Math.max(a,b)+.05)/(Math.min(a,b)+.05)).toBeGreaterThanOrEqual(4.5);
  19 | }
  20 | async function speech(page:Page){await page.evaluate(()=>{const w=window as any;w.__utterances=[];Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{speak:(u:any)=>w.__utterances.push(u),cancel(){},getVoices:()=>[]}});});}
  21 | async function listen(page:Page){await page.getByRole('tab',{name:'练听力',exact:true}).click();await page.getByLabel('句子练习模式',{exact:true}).selectOption('listening');}
  22 | async function end(page:Page){await page.evaluate(()=>{const u=(window as any).__utterances.at(-1);u.onstart?.();u.onend?.();});}
  23 | async function geometry(page:Page){
  24 |  const buttons=page.locator('.listening-transport>button');const boxes=await buttons.evaluateAll(nodes=>nodes.map(n=>{const b=n.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height,bottom:b.bottom};}));
  25 |  expect(boxes).toHaveLength(3);expect(Math.max(...boxes.map(b=>b.w))-Math.min(...boxes.map(b=>b.w))).toBeLessThan(1);
  26 |  const nav=(await page.getByRole('navigation',{name:'底部导航'}).boundingBox())!;for(const b of boxes){expect(b.h).toBeGreaterThanOrEqual(44);expect(b.bottom).toBeLessThanOrEqual(nav.y+1);}
  27 |  const metadata=(await page.locator('.listening-metadata').boundingBox())!,seek=(await page.getByRole('slider',{name:'句子播放位置'}).boundingBox())!;
  28 |  expect(metadata.y+metadata.height).toBeLessThanOrEqual(boxes[0].y);expect(seek.y+seek.height).toBeLessThanOrEqual(metadata.y+1);
  29 |  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  30 | }
  31 | for(const theme of ['light','dark'])test(`native listening controls and speaking dock fit all viewports in ${theme}`,async({page},info)=>{
  32 |  test.setTimeout(90000);await page.emulateMedia({colorScheme:theme as 'light'|'dark'});await open(page);await photoColors(page,'.native-hint');await speech(page);
  33 |  await page.evaluate(()=>{(window as any).SpeechRecognition=class{start(){}abort(){}};});
  34 |  for(const [width,height] of [[390,844],[320,568],[844,390],[1440,1000]]){
  35 |   await page.setViewportSize({width,height});await listen(page);await geometry(page);
  36 |   await expect(page.getByText('每张照片只听一句',{exact:true})).toHaveCount(0);await expect(page.getByLabel('循环方式')).toHaveValue('once');
  37 |   const summary=page.locator('.sentence-ambience summary');await summary.scrollIntoViewIfNeeded();await summary.click();await expect(page.getByRole('button',{name:'咖啡厅',exact:true})).toBeVisible();await page.getByLabel('背景声音量').selectOption('0.15');await page.getByRole('button',{name:'轻柔钢琴',exact:true}).click();await summary.click();await page.getByRole('button',{name:'关闭',exact:true}).click();
  38 |   await photoColors(page,'.sentence-toolbar');if(theme==='light')await expect(page.locator('.listening-transport button').first()).not.toHaveCSS('box-shadow','none');
  39 |   await page.screenshot({path:info.outputPath(`listening-${theme}-${width}x${height}.png`)});
  40 |   await page.getByRole('tab',{name:'练口语',exact:true}).click();await expect(page.locator('.native-hint')).toHaveCount(0);
  41 |   const next=page.locator('.reading-next');await next.scrollIntoViewIfNeeded();const rect=(await next.boundingBox())!,nav=(await page.getByRole('navigation',{name:'底部导航'}).boundingBox())!;expect(rect.y+rect.height).toBeLessThanOrEqual(nav.y+1);
  42 |   await page.getByRole('button',{name:'开始跟读',exact:true}).click();await expect(page.locator('.reading-state')).toContainText('正在收音');await page.getByRole('button',{name:'听示范',exact:true}).click();await expect(page.locator('.reading-state')).toContainText('麦克风已关闭');
  43 |   await page.screenshot({path:info.outputPath(`speaking-${theme}-${width}x${height}.png`)});
  44 |  }
  45 | });
  46 | test('single-card preference lives in personalization, preserves choice on reload and filters both directions',async({page})=>{
  47 |  await open(page);await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('button',{name:'个性化设置',exact:true}).click();const single=page.getByRole('switch',{name:'单卡单句模式'});await expect(single).not.toBeChecked();await single.check();await page.reload();await expect(single).toBeChecked();
  48 |  await page.getByRole('button',{name:'学习',exact:true}).click();await speech(page);await listen(page);await expect(page.getByLabel('播放列表位置')).toHaveText('1/1');const sentence=await page.locator('.listening-sentence').innerText();
  49 |  await page.getByRole('button',{name:'下一句',exact:true}).click();await expect(page.locator('.listening-sentence')).toHaveText(sentence);await page.getByRole('button',{name:'上一句',exact:true}).click();await expect(page.getByLabel('播放列表位置')).toHaveText('1/1');
  50 |  await page.getByRole('button',{name:'当前卡组，学习设置',exact:true}).click();await expect(page.getByRole('switch')).toHaveCount(0);await expect(page.getByRole('group',{name:'切换卡组'})).toBeVisible();await page.getByRole('button',{name:'关闭',exact:true}).click();await page.getByRole('button',{name:'选择照片',exact:true}).click();await expect(page.locator('.native-photo-grid')).toBeVisible();
  51 | });
  52 | test('listening loops at end, retains position through a sheet and handles failures and fixed-rate repeat',async({page})=>{
  53 |  await open(page);await speech(page);await listen(page);await page.getByRole('button',{name:'上一句',exact:true}).click();const last=await page.getByLabel('播放列表位置').innerText();expect(last.split('/')[0]).toBe(last.split('/')[1]);
> 54 |  await page.getByRole('button',{name:'播放',exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as any).__utterances.length)).toBe(1);await end(page);await expect(page.getByLabel('播放列表位置')).toHaveText(/^1\//);
     |                                                        ^ Error: locator.click: Test timeout of 30000ms exceeded.
  55 |  await expect.poll(()=>page.evaluate(()=>(window as any).__utterances.length)).toBe(2);await page.evaluate(()=>{const u=(window as any).__utterances.at(-1);u.onstart?.();u.onboundary?.({charIndex:10});});
  56 |  await page.getByRole('button',{name:'当前卡组，学习设置',exact:true}).click();await page.getByRole('button',{name:'关闭',exact:true}).click();await expect(page.getByRole('button',{name:'播放',exact:true})).toBeVisible();expect(Number(await page.getByRole('slider',{name:'句子播放位置'}).inputValue())).toBeGreaterThan(0);
  57 |  await page.getByLabel('循环方式').selectOption('fastThreeSlowTwo');await expect(page.getByLabel('播放速度',{exact:true})).toBeDisabled();await expect(page.getByLabel('播放速度',{exact:true})).toHaveValue('1');
  58 |  await page.getByRole('button',{name:'播放',exact:true}).click();await page.evaluate(()=>{(window as any).__utterances.at(-1).onerror?.({error:'network'});});await expect(page.getByRole('button',{name:'重新准备',exact:true})).toBeVisible();await page.getByRole('button',{name:'重新准备',exact:true}).click();await expect(page.getByRole('button',{name:'准备中…',exact:true})).toBeVisible();
  59 | });
  60 | test('native ambience loops, ducks during speech, persists and stops at panels, hidden page and module changes',async({page})=>{
  61 |  await observeAmbienceMix(page);
  62 |  await page.addInitScript(()=>{const w=window as any,Original=window.Audio;w.__ambiences=[];w.Audio=class extends Original{constructor(src?:string){super(src);if(src?.includes('/ambience/'))w.__ambiences.push(this);this.muted=true;}};});
  63 |  await open(page);await speech(page);await listen(page);await page.locator('.sentence-ambience summary').click();await page.getByRole('button',{name:'咖啡厅',exact:true}).click();
  64 |  await expect.poll(()=>page.evaluate(()=>(window as any).__ambiences.at(-1)?.paused)).toBe(false);expect(await page.evaluate(()=>(window as any).__ambiences.at(-1).loop)).toBe(true);
  65 |  await page.getByRole('button',{name:'播放',exact:true}).click();await page.evaluate(()=>{(window as any).__utterances.at(-1).onstart?.();});await expect.poll(()=>ambienceGain(page)).toBeCloseTo(.28*.22*.22,3);
  66 |  await page.getByRole('button',{name:'当前卡组，学习设置',exact:true}).click();expect(await page.evaluate(()=>(window as any).__ambiences.every((a:HTMLAudioElement)=>a.paused))).toBe(true);await page.getByRole('button',{name:'关闭',exact:true}).click();expect(await page.evaluate(()=>(window as any).__ambiences.every((a:HTMLAudioElement)=>a.paused))).toBe(true);
  67 |  await page.locator('.sentence-ambience summary').click();await page.getByRole('button',{name:'咖啡厅',exact:true}).click();await expect.poll(()=>page.evaluate(()=>(window as any).__ambiences.at(-1).paused)).toBe(false);
  68 |  await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));expect(await page.evaluate(()=>(window as any).__ambiences.every((a:HTMLAudioElement)=>a.paused))).toBe(true);await page.getByRole('tab',{name:'练口语',exact:true}).click();expect(await page.evaluate(()=>(window as any).__ambiences.every((a:HTMLAudioElement)=>a.paused&&!a.getAttribute('src')))).toBe(true);
  69 |  await page.reload();await listen(page);await expect(page.locator('.sentence-ambience summary')).toHaveAttribute('aria-label','背景声：咖啡厅');
  70 | });
  71 | test('theme navigation and editor match native compact hierarchy and preserve separate day/night selections',async({page},info)=>{
  72 |  await page.goto('/piclex-web/#/settings/appearance');await page.getByLabel('外观模式',{exact:true}).selectOption('light');await page.getByRole('button',{name:/内置主题/}).click();await expect(page).toHaveURL(/settings\/themes$/);await expect(page.getByRole('dialog')).toHaveCount(0);
  73 |  for(const [width,height] of [[320,568],[390,844],[844,390],[1440,1000]]){
  74 |   await page.setViewportSize({width,height});const rows=page.locator('.theme-swatch');await expect(rows).toHaveCount(16);const a=(await rows.nth(0).boundingBox())!,b=(await rows.nth(1).boundingBox())!;expect(a.x).toBe(b.x);expect(b.y).toBeGreaterThanOrEqual(a.y+a.height);expect(a.height).toBeLessThanOrEqual(76);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  75 |  }
  76 |  await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Catppuccin',exact:true}).click();await page.screenshot({path:info.outputPath('themes-native-list.png')});await page.getByRole('button',{name:'返回外观与主题',exact:true}).click();
  77 |  await page.getByRole('button',{name:'创建自定义主题',exact:true}).click();await expect(page.locator('.theme-preview')).toHaveCount(0);await page.getByRole('textbox',{name:'主题名称'}).fill('浅色自定义');await page.getByRole('button',{name:'保存主题',exact:true}).click();await page.getByLabel('外观模式',{exact:true}).selectOption('dark');await expect(page.locator('html')).toHaveAttribute('data-palette','chatgpt');await page.getByLabel('外观模式',{exact:true}).selectOption('light');await expect(page.locator('.custom-theme-row button.settings-row')).toHaveAttribute('aria-pressed','true');
  78 | });
  79 | test('dragging a listening seek bar commits once instead of restarting on every movement',async({page})=>{
  80 |  await open(page);await speech(page);await listen(page);await page.getByRole('button',{name:'播放',exact:true}).click();await page.evaluate(()=>(window as any).__utterances.at(-1).onstart?.());
  81 |  const slider=page.getByRole('slider',{name:'句子播放位置'}),b=(await slider.boundingBox())!;
  82 |  await page.mouse.move(b.x+b.width*.2,b.y+b.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width*.8,b.y+b.height/2,{steps:8});expect(await page.evaluate(()=>(window as any).__utterances.length)).toBe(1);await page.mouse.up();await expect.poll(()=>page.evaluate(()=>(window as any).__utterances.length)).toBe(2);
  83 | });
  84 | 
```