# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: deck-subscriptions.spec.ts >> links collapse, copy feedback, confirmation and persistent cancellation preserve downloaded bytes and draft
- Location: tests/browser/deck-subscriptions.spec.ts:16:1

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: '测试照片卡组 恢复订阅', exact: true })

```

# Page snapshot

```yaml
- generic [ref=f3e2]:
  - link "跳到内容" [ref=f3e3] [cursor=pointer]:
    - /url: "#main-content"
  - main "学习" [ref=f3e5]:
    - generic [ref=f3e6]:
      - generic [ref=f3e7]:
        - button "等级 LV0，0 经验" [ref=f3e8] [cursor=pointer]:
          - generic:
            - strong: LV0
        - button "当前卡组，学习设置" [ref=f3e9] [cursor=pointer]:
          - progressbar "等级经验" [ref=f3e11]:
            - generic [ref=f3e12]: 0.00%
          - generic [ref=f3e13]:
            - generic [ref=f3e14]: Basic English 850 场景卡片
            - generic [aria-hidden] [ref=f3e15]: ▾
        - progressbar "本轮练习进度" [ref=f3e16]
      - button "下载第三方卡组" [ref=f3e17] [cursor=pointer]:
        - strong [ref=f3e18]: 下载
        - generic [ref=f3e19]: 第三方卡组
    - tablist "学习模块" [ref=f3e20]:
      - tab "拼单词" [selected] [ref=f3e21] [cursor=pointer]
      - tab "练听力" [ref=f3e24] [cursor=pointer]
      - tab "练口语" [ref=f3e26] [cursor=pointer]
    - generic [ref=f3e28]:
      - article [ref=f3e29]:
        - generic [ref=f3e30]:
          - img "训练照片，彩色框标示当前物体" [ref=f3e32]
          - button "选择照片" [ref=f3e33] [cursor=pointer]
        - generic [ref=f3e34]:
          - button "隐藏中文提示" [ref=f3e35] [cursor=pointer]:
            - heading "床" [level=1] [ref=f3e36]
            - generic [ref=f3e37]: /bed/
          - group [ref=f3e38]:
            - generic "背景声：咖啡厅" [ref=f3e39] [cursor=pointer]
            - option "很轻"
            - option "轻柔" [selected]
            - option "适中"
      - button "查看例句并练口语" [ref=f3e42] [cursor=pointer]:
        - generic [ref=f3e43]:
          - generic [ref=f3e44]: I
          - generic [ref=f3e45]: am
          - generic [ref=f3e46]: still
          - generic [ref=f3e47]: in
          - generic [ref=f3e48]: ____
        - generic [ref=f3e49]: 我还在床上。
    - generic [ref=f3e50]:
      - generic [ref=f3e51]:
        - generic [ref=f3e53]: x
        - textbox "输入英文" [ref=f3e59]: x
      - generic [ref=f3e60]:
        - button "播放句子和单词" [ref=f3e61] [cursor=pointer]
        - generic [ref=f3e64]:
          - combobox "播放速度" [ref=f3e65]:
            - option "0.75×"
            - option "0.85×"
            - option "1.0×" [selected]
            - option "1.15×"
          - generic [aria-hidden]: ⌄
      - button "不认识" [ref=f3e66] [cursor=pointer]
    - region "虚拟键盘" [ref=f3e67]:
      - generic [ref=f3e68]:
        - button "按键 Q" [disabled] [ref=f3e69]: q
        - button "按键 W" [disabled] [ref=f3e70]: w
        - button "按键 E" [disabled] [ref=f3e71]: e
        - button "按键 R" [disabled] [ref=f3e72]: r
        - button "按键 T" [disabled] [ref=f3e73]: t
        - button "按键 Y" [disabled] [ref=f3e74]: "y"
        - button "按键 U" [disabled] [ref=f3e75]: u
        - button "按键 I" [disabled] [ref=f3e76]: i
        - button "按键 O" [disabled] [ref=f3e77]: o
        - button "按键 P" [disabled] [ref=f3e78]: p
      - generic [ref=f3e79]:
        - button "按键 A" [disabled] [ref=f3e80]: a
        - button "按键 S" [disabled] [ref=f3e81]: s
        - button "按键 D" [disabled] [ref=f3e82]: d
        - button "按键 F" [disabled] [ref=f3e83]: f
        - button "按键 G" [disabled] [ref=f3e84]: g
        - button "按键 H" [disabled] [ref=f3e85]: h
        - button "按键 J" [disabled] [ref=f3e86]: j
        - button "按键 K" [disabled] [ref=f3e87]: k
        - button "按键 L" [disabled] [ref=f3e88]: l
      - generic [ref=f3e89]:
        - button "按键 Z" [disabled] [ref=f3e90]: z
        - button "按键 X" [disabled] [ref=f3e91]: x
        - button "按键 C" [disabled] [ref=f3e92]: c
        - button "按键 V" [disabled] [ref=f3e93]: v
        - button "按键 B" [disabled] [ref=f3e94]: b
        - button "按键 N" [disabled] [ref=f3e95]: "n"
        - button "按键 M" [disabled] [ref=f3e96]: m
        - button "退格" [disabled] [ref=f3e97]: ⌫
    - dialog [ref=f3e98]:
      - generic [ref=f3e99]:
        - generic [ref=f3e100]:
          - heading "下载第三方卡组" [level=2] [ref=f3e101]
          - button "关闭" [ref=f3e102] [cursor=pointer]
        - generic [ref=f3e104]:
          - textbox "粘贴卡组 URL" [disabled] [ref=f3e105]: https://decks.example.test/feed.json?token=long-source-long-source-long-source-long-source-long-source-long-source-long-source-long-source-long-source-long-source-long-source-long-source-long-source-long-source-long-source-long-source-long-source-long-source-long-source-long-source-long-source-long-source-long-source-long-source-long-source-
          - button "下载卡组" [disabled] [ref=f3e106]:
            - text: 下载卡组
            - generic [aria-hidden] [ref=f3e107]: ↓
        - status [ref=f3e108]:
          - generic [ref=f3e109]: 正在下载卡组
          - progressbar "正在下载卡组" [ref=f3e110]
          - generic [ref=f3e111]: 正在连接…
        - button "取消下载" [ref=f3e112] [cursor=pointer]
        - group [ref=f3e113]:
          - generic "已订阅卡组 0" [ref=f3e114] [cursor=pointer]
          - paragraph [ref=f3e115]: 暂无订阅
  - navigation "底部导航" [ref=f3e116]:
    - generic [ref=f3e117]:
      - button "拍摄" [ref=f3e118] [cursor=pointer]
      - button "学习" [ref=f3e121] [cursor=pointer]
      - button "设置" [ref=f3e124] [cursor=pointer]
  - button "选择照片卡组文件"
```

# Test source

```ts
  1  | import {test,expect} from '@playwright/test';
  2  | import fs from 'node:fs';
  3  | import {createHash} from 'node:crypto';
  4  | const bytes=fs.readFileSync('tests/fixtures/demo/decks/cafe.piclexdeck');
  5  | const source='https://decks.example.test/feed.json?token='+('long-source-'.repeat(25));
  6  | const entry={deckID:'b121e100-0000-4000-8000-000000000001',author:'PicLex',description:'测试卡组',version:1,photoCount:1,wordCount:6,title:'测试照片卡组',packageURL:'https://decks.example.test/deck.piclexdeck',packageBytes:bytes.length,packageSHA256:createHash('sha256').update(bytes).digest('hex'),access:'public'};
  7  | async function open(page:any){await page.getByRole('button',{name:'下载第三方卡组',exact:true}).click();await page.locator('.deck-subscriptions>summary').click();}
  8  | async function install(page:any){
  9  |  await page.addInitScript(()=>{Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async(text:string)=>{(window as any).__copied=text;}}});});
  10 |  await page.route(source,(route:any)=>route.fulfill({json:{format:'com.piclex.deck-source',schemaVersion:1,decks:[entry]}}));
  11 |  await page.route(entry.packageURL,(route:any)=>route.fulfill({body:bytes,contentType:'application/zip'}));
  12 |  await page.goto('/piclex-web/#/learn');await page.getByRole('button',{name:'下载第三方卡组',exact:true}).click();await page.getByRole('textbox',{name:'粘贴卡组 URL'}).fill(source);await page.getByRole('button',{name:'下载卡组',exact:true}).click();await page.getByRole('button',{name:'测试照片卡组 下载',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
  13 | }
  14 | async function storedSnapshot(page:any){return page.evaluate(async()=>{const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('piclex-web-v1');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});const decks:any[]=await new Promise((resolve,reject)=>{const t=db.transaction('decks','readonly'),r=t.objectStore('decks').getAll();t.oncomplete=()=>resolve(r.result);t.onerror=()=>reject(t.error);});db.close();return Promise.all(decks.map(async d=>({...d,bytes:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',d.bytes)))})));});}
  15 | 
  16 | test('links collapse, copy feedback, confirmation and persistent cancellation preserve downloaded bytes and draft',async({page},info)=>{
  17 |  await page.setViewportSize({width:320,height:700});await install(page);await page.getByRole('button',{name:'按键 X',exact:true}).click();const draft=await page.getByRole('textbox',{name:'输入英文',exact:true}).inputValue();const before=await storedSnapshot(page);
  18 |  await open(page);const row=page.getByRole('article',{name:entry.title});await expect(row).toBeVisible();await expect(row.locator('.subscription-url')).toHaveCount(0);
  19 |  const collapsed=(await row.boundingBox())!.height;await row.getByRole('button',{name:'订阅链接',exact:true}).click();await expect(row.locator('.subscription-url')).toHaveText(source);expect((await row.boundingBox())!.height).toBeGreaterThan(collapsed+60);
  20 |  await row.getByRole('button',{name:'订阅链接',exact:true}).click();await row.getByRole('button',{name:`复制${entry.title}的订阅链接`}).click();await expect(row.getByText('已复制',{exact:true})).toBeVisible();expect(await page.evaluate(()=>(window as any).__copied)).toBe(source);
  21 |  for(const theme of ['light','dark']){await page.evaluate(theme=>localStorage.setItem('piclex-web.theme',theme),theme);await page.reload();await open(page);await expect(page.locator('html')).toHaveAttribute('data-theme',theme);await page.screenshot({path:info.outputPath(`subscription-${theme}.png`),fullPage:true});expect(await row.evaluate(n=>n.scrollWidth<=n.clientWidth)).toBe(true);}
  22 |  await row.getByRole('button',{name:'取消订阅',exact:true}).click();let confirm=page.getByRole('dialog',{name:'取消订阅？',exact:true});await expect(confirm).toContainText(entry.title);await expect(confirm).toContainText('已下载卡片和学习记录会保留');await confirm.getByRole('button',{name:'保留订阅'}).click();await expect(row).toBeVisible();
  23 |  await row.getByRole('button',{name:'取消订阅',exact:true}).click();await page.keyboard.press('Escape');await expect(confirm).toHaveCount(0);await expect(row).toBeVisible();
  24 |  await row.getByRole('button',{name:'取消订阅',exact:true}).click();await page.screenshot({path:info.outputPath('unsubscribe-confirmation.png'),fullPage:true});await confirm.getByRole('button',{name:'取消订阅',exact:true}).click();await expect(row).toHaveCount(0);expect(await storedSnapshot(page)).toEqual(before);await page.getByRole('button',{name:'关闭',exact:true}).click();await expect(page.getByRole('textbox',{name:'输入英文',exact:true})).toHaveValue(draft);
> 25 |  await page.reload();await open(page);await expect(page.getByText('暂无订阅',{exact:true})).toBeVisible();expect(await storedSnapshot(page)).toEqual(before);await page.getByRole('textbox',{name:'粘贴卡组 URL'}).fill(source);await page.getByRole('button',{name:'下载卡组',exact:true}).click();await page.getByRole('button',{name:'测试照片卡组 恢复订阅',exact:true}).click();await expect(row).toBeVisible();expect(await storedSnapshot(page)).toEqual(before);
     |                                                                                                                                                                                                                                                                                                                                                        ^ Error: locator.click: Test timeout of 30000ms exceeded.
  26 | });
  27 | 
  28 | test('failed clipboard and storage writes do not falsely confirm or remove a subscription',async({page})=>{
  29 |  await install(page);await open(page);const row=page.getByRole('article',{name:entry.title});
  30 |  await page.evaluate(()=>{Object.defineProperty(navigator,'clipboard',{value:{writeText:async()=>{throw Error('denied');}}});});await row.getByRole('button',{name:`复制${entry.title}的订阅链接`}).click();await expect(row.getByRole('alert')).toContainText('无法自动复制');await expect(row.locator('.subscription-url')).toBeVisible();
  31 |  await page.evaluate(()=>{const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(value,...args){if(this.name==='subscriptions'&&!value.active)throw new DOMException('quota','QuotaExceededError');return put.call(this,value,...args);};});
  32 |  await row.getByRole('button',{name:'取消订阅',exact:true}).click();const confirm=page.getByRole('dialog',{name:'取消订阅？',exact:true});await confirm.getByRole('button',{name:'取消订阅',exact:true}).click();await expect(confirm.getByRole('alert')).toContainText('订阅状态未能保存');expect(await page.evaluate(async()=>{const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('piclex-web-v1');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});try{return await new Promise((resolve,reject)=>{const r=db.transaction('subscriptions','readonly').objectStore('subscriptions').getAll();r.onsuccess=()=>resolve(r.result[0].active);r.onerror=()=>reject(r.error);});}finally{db.close();}})).toBe(true);await confirm.getByRole('button',{name:'保留订阅'}).click();await expect(row).toBeVisible();
  33 | });
  34 | 
```