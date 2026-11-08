# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: spelling-feedback.spec.ts >> no result line moves answer, photo, playback or keyboard in error, correct, corrected or revealed states: dark
- Location: tests/browser/spelling-feedback.spec.ts:53:52

# Error details

```
Error: revealed answer playback width

expect(received).toBeCloseTo(expected, precision)

Expected: 410.203125
Received: 432

Expected precision:    0
Expected difference: < 0.5
Received difference:   21.796875
```

# Page snapshot

```yaml
- generic [ref=e2]:
  - link "跳到内容" [ref=e3] [cursor=pointer]:
    - /url: "#main-content"
  - main "学习" [ref=e5]:
    - generic [ref=e6]:
      - generic [ref=e7]:
        - button "等级 LV1，2 经验" [ref=e8] [cursor=pointer]:
          - generic:
            - strong: LV1
        - button "当前卡组，学习设置" [ref=e9] [cursor=pointer]:
          - progressbar "等级经验" [ref=e11]:
            - generic [ref=e12]: 0.00%
          - generic [ref=e13]:
            - generic [ref=e14]: 咖啡馆的早晨
            - generic [aria-hidden] [ref=e15]: ▾
        - progressbar "本轮练习进度" [ref=e16]
      - button "下载第三方卡组" [ref=e17] [cursor=pointer]:
        - strong [ref=e18]: 下载
        - generic [ref=e19]: 第三方卡组
    - tablist "学习模块" [ref=e20]:
      - tab "拼单词" [selected] [ref=e21] [cursor=pointer]
      - tab "练听力" [ref=e24] [cursor=pointer]
      - tab "练口语" [ref=e26] [cursor=pointer]
    - generic [ref=e28]:
      - article [ref=e29]:
        - generic [ref=e30]:
          - img "训练照片，彩色框标示当前物体" [ref=e32]
          - button "选择照片" [ref=e33] [cursor=pointer]
        - generic [ref=e34]:
          - button "隐藏中文提示" [ref=e35] [cursor=pointer]:
            - heading "叉子" [level=1] [ref=e36]
          - group [ref=e37]:
            - generic "背景声：咖啡厅" [ref=e38] [cursor=pointer]
            - option "很轻"
            - option "轻柔" [selected]
            - option "适中"
      - button "查看例句并练口语" [ref=e41] [cursor=pointer]:
        - generic [ref=e42]:
          - generic [ref=e43]: A
          - generic [ref=e44]: ____
          - generic [ref=e45]: rests
          - generic [ref=e46]: "on"
          - generic [ref=e47]: the
          - generic [ref=e48]: table.
        - generic [ref=e49]: 一把叉子放在桌上。
    - generic [ref=e50]:
      - generic [ref=e51]:
        - generic [aria-hidden] [ref=e52]:
          - generic [ref=e53]: f
          - generic [ref=e55]: o
          - generic [ref=e57]: r
          - generic [ref=e59]: k
        - textbox "输入英文" [active] [ref=e61]: fork
      - generic [ref=e62]:
        - button "准备音频…" [ref=e63] [cursor=pointer]:
          - generic [aria-hidden] [ref=e66]: 空格
        - generic [ref=e67]:
          - combobox "播放速度" [ref=e68]:
            - option "0.75×"
            - option "0.85×"
            - option "1.0×" [selected]
            - option "1.15×"
          - generic [aria-hidden]: ⌄
      - button "下一个" [ref=e69] [cursor=pointer]
    - region "虚拟键盘" [ref=e70]:
      - generic [ref=e71]:
        - button "按键 Q" [ref=e72] [cursor=pointer]: q
        - button "按键 W" [ref=e73] [cursor=pointer]: w
        - button "按键 E" [ref=e74] [cursor=pointer]: e
        - button "按键 R" [ref=e75] [cursor=pointer]: r
        - button "按键 T" [ref=e76] [cursor=pointer]: t
        - button "按键 Y" [ref=e77] [cursor=pointer]: "y"
        - button "按键 U" [ref=e78] [cursor=pointer]: u
        - button "按键 I" [ref=e79] [cursor=pointer]: i
        - button "按键 O" [ref=e80] [cursor=pointer]: o
        - button "按键 P" [ref=e81] [cursor=pointer]: p
      - generic [ref=e82]:
        - button "按键 A" [ref=e83] [cursor=pointer]: a
        - button "按键 S" [ref=e84] [cursor=pointer]: s
        - button "按键 D" [ref=e85] [cursor=pointer]: d
        - button "按键 F" [ref=e86] [cursor=pointer]: f
        - button "按键 G" [ref=e87] [cursor=pointer]: g
        - button "按键 H" [ref=e88] [cursor=pointer]: h
        - button "按键 J" [ref=e89] [cursor=pointer]: j
        - button "按键 K" [ref=e90] [cursor=pointer]: k
        - button "按键 L" [ref=e91] [cursor=pointer]: l
      - generic [ref=e92]:
        - button "按键 Z" [ref=e93] [cursor=pointer]: z
        - button "按键 X" [ref=e94] [cursor=pointer]: x
        - button "按键 C" [ref=e95] [cursor=pointer]: c
        - button "按键 V" [ref=e96] [cursor=pointer]: v
        - button "按键 B" [ref=e97] [cursor=pointer]: b
        - button "按键 N" [ref=e98] [cursor=pointer]: "n"
        - button "按键 M" [ref=e99] [cursor=pointer]: m
        - button "退格" [ref=e100] [cursor=pointer]: ⌫
  - navigation "底部导航" [ref=e101]:
    - generic [ref=e102]:
      - button "拍摄" [ref=e103] [cursor=pointer]
      - button "学习" [ref=e106] [cursor=pointer]
      - button "设置" [ref=e109] [cursor=pointer]
  - button "选择照片卡组文件"
  - status:
    - generic: 卡组已保存到当前浏览器。
    - button "关闭提示" [ref=e112] [cursor=pointer]
```

# Test source

```ts
  1   | import {test,expect} from '@playwright/test';
  2   | import path from 'node:path';
  3   | async function open(page:any){
  4   |  await page.goto('/piclex-web/#/decks',{waitUntil:'domcontentloaded'});
  5   |  await page.getByLabel('选择照片卡组文件').setInputFiles(path.resolve('tests/fixtures/demo/decks/cafe.piclexdeck'));
  6   |  await expect(page.getByRole('textbox',{name:'输入英文',exact:true})).toBeVisible();
  7   |  await page.evaluate(()=>Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{speak:(u:any)=>{(window as any).__feedbackSpeech=u;},cancel:()=>{},getVoices:()=>[]}}));
  8   | }
  9   | test('hardware input survives replay focus, protected IME keys, and keeps dialogs isolated',async({page})=>{
  10  |  await open(page);const field=page.getByRole('textbox',{name:'输入英文',exact:true});
  11  |  await field.press('c');await expect(field).toHaveValue('c');
  12  |  await page.locator('.playback-button').click();await page.keyboard.press('r');await expect(field).toHaveValue('cr');
  13  |  await page.locator('.playback-button').click();await page.locator('.playback-button').dispatchEvent('keydown',{key:'Process',code:'KeyO',keyCode:229,bubbles:true,cancelable:true});await expect(field).toHaveValue('cro');await field.press('Backspace');
  14  |  await field.dispatchEvent('keydown',{key:'Process',code:'KeyO',keyCode:229,bubbles:true,cancelable:true});await expect(field).toHaveValue('cro');
  15  |  await field.dispatchEvent('keydown',{key:'你',code:'',keyCode:229,bubbles:true,cancelable:true});await expect(field).toHaveValue('cro');
  16  |  await page.getByRole('button',{name:'隐藏中文提示',exact:true}).click();await page.keyboard.press('Backspace');await expect(field).toHaveValue('cr');
  17  |  await page.keyboard.press('o');await expect(field).toHaveValue('cro');
  18  |  await page.getByRole('button',{name:'当前卡组，学习设置',exact:true}).click();await page.keyboard.press('i');await expect(field).toHaveValue('cro');
  19  |  await page.getByRole('button',{name:'关闭',exact:true}).click();await page.keyboard.press('i');await expect(field).toHaveValue('croi');
  20  |  await page.getByRole('button',{name:'退格',exact:true}).click();await expect(field).toHaveValue('cro');
  21  | });
  22  | for(const colorScheme of ['light','dark'] as const)test(`spelling progress stays below glyphs and playback grows from a fixed left edge: ${colorScheme}`,async({page},info)=>{
  23  |  await page.emulateMedia({colorScheme});await open(page);const field=page.getByRole('textbox',{name:'输入英文',exact:true});
  24  |  await field.pressSequentially('croissa');
  25  |  // ResizeObserver updates the SVG viewBox after layout; typing can finish first.
  26  |  // Wait for the rendered result while keeping the exact geometry assertions.
  27  |  await expect(async()=>{
  28  |   const geometry=await page.evaluate(()=>{
  29  |    const glyphs=[...document.querySelectorAll('.letter-glyph')].map(e=>e.getBoundingClientRect());
  30  |    return [...document.querySelectorAll<SVGPathElement>('.spelling-glow path')].map(p=>({top:p.getBoundingClientRect().top,glyphBottom:Math.max(...glyphs.map(r=>r.bottom)),filter:getComputedStyle(p).filter}));
  31  |   });
  32  |   expect(geometry).toHaveLength(2);
  33  |   for(const g of geometry){expect(g.top).toBeGreaterThanOrEqual(g.glyphBottom);expect(g.filter).toBe('none');}
  34  |  }).toPass({timeout:5000});
  35  |  await page.locator('.playback-button').click();await page.evaluate(()=>(window as any).__feedbackSpeech.onstart());
  36  |  const bar=page.getByRole('progressbar',{name:'播放进度'});await expect.poll(async()=>Number(await bar.getAttribute('aria-valuenow'))).toBeGreaterThan(0);
  37  |  const segment=page.locator('.playback-activity'),fill=page.locator('.playback-fill');await expect(segment).toHaveCount(0);
  38  |  await expect.poll(async()=>(await fill.boundingBox())!.width).toBeGreaterThan(0);await expect(fill).toHaveCSS('animation-name','none');
  39  |  await page.evaluate(()=>(window as any).__feedbackSpeech.onboundary({charIndex:10}));
  40  |  await expect.poll(async()=>(await fill.boundingBox())!.width).toBeGreaterThan(0);
  41  |  const left=(await bar.boundingBox())!.x;expect((await fill.boundingBox())!.x).toBeCloseTo(left,0);
  42  |  await page.evaluate(()=>(window as any).__feedbackSpeech.onboundary({charIndex:20}));
  43  |  await expect.poll(async()=>Number(await bar.getAttribute('aria-valuenow'))).toBeGreaterThan(10);
  44  |  expect((await fill.boundingBox())!.x).toBeCloseTo(left,0);
  45  |  await page.screenshot({path:info.outputPath(`feedback-${colorScheme}.png`)});
  46  |  await page.evaluate(()=>(window as any).__feedbackSpeech.onboundary({charIndex:10}));await expect(bar).toHaveAttribute('aria-valuenow',/^[1-9]\d?$/);await expect(segment).toHaveCount(0);
  47  |  await page.emulateMedia({reducedMotion:'reduce'});await page.locator('.playback-button').click();await expect(bar).toHaveCount(0);await page.evaluate(()=>(window as any).__feedbackSpeech.onstart());await expect(segment).toHaveCount(0);await expect(fill).toHaveCSS('transition-duration','0s');await expect.poll(async()=>Number(await bar.getAttribute('aria-valuenow'))).toBeGreaterThan(0);
  48  | });
  49  | 
  50  | // The App marks a mismatch with a red board only. The removed result line used
  51  | // to grow the footer and push the photo, playback and keyboard around on phones;
  52  | // the answer itself stays in the input line for errors, success and reveal.
  53  | for(const colorScheme of ['light','dark'] as const)test(`no result line moves answer, photo, playback or keyboard in error, correct, corrected or revealed states: ${colorScheme}`,async({page},info)=>{
  54  |  await page.emulateMedia({colorScheme});await open(page);
  55  |  const keyboard=page.getByRole('region',{name:'虚拟键盘'}),answer=page.locator('.native-answer'),feedback=page.locator('.answer-feedback'),field=page.getByRole('textbox',{name:'输入英文',exact:true});
  56  |  // Tap/click the key's own coordinates: locator.tap() scrolls the practice
  57  |  // surface into view and can spend the 1px of pre-existing horizontal
  58  |  // overflow as a scrollLeft shift instead of the layout regression we assert.
  59  |  const press=async(key:string)=>{
  60  |   const box=await keyboard.getByRole('button',{name:key==='BACKSPACE'?'退格':`按键 ${key}`,exact:true}).boundingBox();
  61  |   if(!box)throw new Error(`missing keyboard key ${key}`);
  62  |   const x=box.x+box.width/2,y=box.y+box.height/2;
  63  |   if(info.project.use.hasTouch)await page.touchscreen.tap(x,y);else await page.mouse.click(x,y);
  64  |  };
  65  |  const geometry=()=>page.evaluate(()=>{
  66  |   const box=(selector:string)=>{const r=document.querySelector(selector)!.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
  67  |   return {answer:box('.native-answer'),photo:box('.photo-browse'),playback:box('.native-playback'),keyboard:box('.virtual-keyboard')};
  68  |  });
  69  |  const border=()=>answer.evaluate(node=>{const style=getComputedStyle(node);return {color:style.borderTopColor,width:style.borderTopWidth};});
  70  |  await expect(page.locator('.focus-image')).toBeVisible();
  71  |  await expect.poll(()=>page.evaluate(()=>{const image=document.querySelector<HTMLImageElement>('.focus-image');return !!image&&image.complete&&image.naturalWidth>0;})).toBe(true);
  72  |  await expect.poll(()=>page.locator('.native-practice').evaluate(node=>node.scrollHeight-node.clientHeight)).toBeLessThanOrEqual(1);
  73  |  // Take the baseline only after two consecutive reads agree: the photo budget
  74  |  // is measured by ResizeObserver and lands a frame or two after the image.
  75  |  let settled=await geometry();
  76  |  await expect.poll(async()=>{const current=await geometry(),same=JSON.stringify(current)===JSON.stringify(settled);settled=current;return same;},{intervals:[100,150,250,400]}).toBe(true);
  77  |  const baseline=await geometry();
  78  |  const stable=async(label:string)=>{
  79  |   expect(await page.locator('.native-practice').evaluate(node=>node.scrollLeft)).toBe(0);
  80  |   const current=await geometry();
  81  |   for(const key of ['answer','photo','playback','keyboard'] as const){
  82  |    const before=baseline[key],after=current[key];
  83  |    expect(after.x,`${label} ${key} x`).toBeCloseTo(before.x,0);
  84  |    expect(after.y,`${label} ${key} y`).toBeCloseTo(before.y,0);
> 85  |    expect(after.width,`${label} ${key} width`).toBeCloseTo(before.width,0);
      |                                                ^ Error: revealed answer playback width
  86  |    expect(after.height,`${label} ${key} height`).toBeCloseTo(before.height,0);
  87  |   }
  88  |  };
  89  |  const recovered=async()=>{await expect(answer).not.toHaveClass(/wrong/);await expect(feedback).toHaveCount(0);expect((await border()).color).not.toBe('rgb(198, 68, 68)');};
  90  |  await press('C');await press('R');await press('X');
  91  |  await expect(field).toHaveValue('crx');await expect(answer).toHaveClass(/wrong/);await expect(feedback).toHaveCount(0);await expect(page.getByText('请删除错误字母后继续输入')).toHaveCount(0);
  92  |  const error=await border();expect(error.color).toBe('rgb(198, 68, 68)');expect(['1px','2px']).toContain(error.width);
  93  |  await stable('first error');await page.screenshot({path:info.outputPath(`spelling-error-${colorScheme}.png`)});
  94  |  await press('BACKSPACE');await expect(field).toHaveValue('cr');await recovered();await stable('deleted back to the correct prefix');
  95  |  await press('X');await expect(field).toHaveValue('crx');await expect(answer).toHaveClass(/wrong/);await expect(feedback).toHaveCount(0);await stable('second error');
  96  |  await press('BACKSPACE');await press('O');await expect(field).toHaveValue('cro');await recovered();await stable('correct prefix after the second error');
  97  |  await page.screenshot({path:info.outputPath(`spelling-recovered-${colorScheme}.png`)});
  98  |  // Freeze the 300ms auto-advance so the transient completion states can be
  99  |  // measured without racing the next word. Earlier errors make this first word
  100 |  // a correction; the next two words cover plain success and reveal.
  101 |  await page.clock.install();await page.clock.pauseAt(await page.evaluate(()=>Date.now()+1000));
  102 |  for(const key of ['I','S','S','A','N','T'] as const)await press(key);
  103 |  await expect(field).toHaveValue('croissant');await expect(answer).not.toHaveClass(/wrong/);await expect(feedback).toHaveCount(0);await stable('corrected answer');
  104 |  await page.clock.runFor(400);await expect(field).toHaveValue('');await expect(page.locator('.native-hint h1')).toHaveText('勺子');
  105 |  for(const key of ['S','P','O','O','N'] as const)await press(key);
  106 |  await expect(field).toHaveValue('spoon');await expect(answer).not.toHaveClass(/wrong/);await expect(feedback).toHaveCount(0);await stable('correct answer');
  107 |  await page.clock.runFor(400);await expect(field).toHaveValue('');await expect(page.locator('.native-hint h1')).toHaveText('叉子');
  108 |  await page.getByRole('button',{name:/^不认识/}).click();
  109 |  await expect(field).toHaveValue('fork');await expect(answer).not.toHaveClass(/wrong/);await expect(feedback).toHaveCount(0);await stable('revealed answer');
  110 | });
  111 | 
```