import {test,expect,type Page} from '@playwright/test';
import path from 'node:path';
import {fillSpelling} from './helpers/spelling';

const deck=path.resolve('tests/fixtures/demo/decks/cafe.piclexdeck');

async function open(page:Page){
 await page.goto('/piclex-web/#/decks',{waitUntil:'domcontentloaded'});
 await page.getByLabel('选择照片卡组文件').setInputFiles(deck);
 const field=page.getByRole('textbox',{name:'输入英文',exact:true});
 await expect(field).toBeVisible();
 return field;
}
const board=(page:Page)=>page.locator('.answer-slots');
async function freeze(page:Page){
 await page.clock.install();
 await page.clock.pauseAt(await page.evaluate(()=>Date.now()+1000));
}
// Everything the sweep paints lives in glyph/underline pseudo-elements, so the
// answer board keeps exactly one real span per letter.
const paint=(page:Page)=>page.evaluate(()=>{
 const root=document.querySelector<HTMLElement>('.answer-slots')!,slots=[...root.querySelectorAll<HTMLElement>('.letter-slot')];
 const first=slots[0].getBoundingClientRect(),last=slots.at(-1)!.getBoundingClientRect();
 const glyph=slots[0].querySelector<HTMLElement>('.letter-glyph')!,gold=getComputedStyle(glyph,'::before'),line=getComputedStyle(slots[0],'::after');
 return {slots:slots.length,goldClass:root.classList.contains('gold-sweep'),text:root.textContent,
  glyphs:root.querySelectorAll('.letter-glyph').length,glyphText:glyph.textContent,
  wordWidth:last.right-first.left,boardWidth:root.getBoundingClientRect().width,
  variable:parseFloat(slots[0].style.getPropertyValue('--gold-word')),
  offsets:slots.map(slot=>parseFloat(slot.style.getPropertyValue('--gold-offset'))),
  content:gold.content,background:gold.backgroundImage,clip:gold.backgroundClip,filter:gold.filter,
  underlineContent:line.content,underlineBackground:line.backgroundImage,underlineHeight:line.height,underlineFilter:line.filter};
});

test('a fresh correct answer sweeps the real glyphs and underlines once',async({page})=>{
 const field=await open(page);
 await freeze(page);
 await fillSpelling(page,'croissant');
 await expect(page.locator('.native-answer')).not.toHaveClass(/wrong/);
 await expect(board(page)).toHaveClass(/gold-sweep/);
 const gold=await paint(page);
 expect(gold.slots).toBe(9);expect(gold.glyphs).toBe(9);expect(gold.text).toBe('croissant');expect(gold.glyphText).toBe('c');
 // The band is the word's own width, not the full answer panel.
 expect(gold.variable).toBeCloseTo(gold.wordWidth,1);
 expect(gold.variable).toBeLessThan(gold.boardWidth);
 expect(gold.offsets[0]).toBe(0);expect(gold.offsets.at(-1)!).toBeGreaterThan(0);
 for(let i=1;i<gold.offsets.length;i++)expect(gold.offsets[i]).toBeGreaterThan(gold.offsets[i-1]);
 // PracticeGoldSweepStyle palette, clipped to text, with the 4px inner and 10px outer halo.
 expect(gold.content).toBe('"c"');expect(gold.clip).toBe('text');
 expect(gold.background).toContain('rgb(255, 247, 196)');expect(gold.background).toContain('rgb(145, 80, 26)');expect(gold.background).toContain('rgb(232, 153, 43)');
 expect(gold.filter).toContain('4px');expect(gold.filter).toContain('10px');expect(gold.filter).toContain('rgba(255, 201, 71, 0.78)');expect(gold.filter).toContain('rgba(224, 122, 26, 0.58)');
 // Underlines are part of the same gold layer, never a gradient on the slot border itself.
 expect(gold.underlineContent).toBe('""');expect(gold.underlineHeight).toBe('1.5px');
 expect(gold.underlineBackground).toContain('rgb(255, 247, 196)');
 expect(gold.underlineFilter).toContain('4px');expect(gold.underlineFilter).toContain('10px');
 // The sweep stays visible inside the untouched 300ms auto-advance window.
 await page.clock.runFor(200);
 await expect(board(page)).toHaveClass(/gold-sweep/);
 await expect(field).toHaveValue('croissant');
 // The advance still happens at its original time; the gold leaves no residue.
 await page.clock.runFor(200);
 await expect(page.getByRole('heading',{name:'勺子',exact:true})).toBeVisible();
 await expect(board(page)).not.toHaveClass(/gold-sweep/);
 const next=await paint(page);
 expect(next.goldClass).toBe(false);expect(next.content).toBe('none');expect(next.underlineContent).toBe('none');
 expect(next.offsets.some(value=>!Number.isNaN(value))).toBe(false);
});

test('a corrected answer also sweeps once when it becomes reviewed',async({page})=>{
 const field=await open(page);
 await freeze(page);
 await fillSpelling(page,'crx');
 await expect(page.locator('.native-answer')).toHaveClass(/wrong/);
 await fillSpelling(page,'cro');
 await expect(page.locator('.native-answer')).not.toHaveClass(/wrong/);
 await fillSpelling(page,'croissant');
 await expect(page.locator('.native-answer')).not.toHaveClass(/wrong/);
 await expect(board(page)).toHaveClass(/gold-sweep/);
 const gold=await paint(page);
 expect(gold.content).toBe('"c"');expect(gold.background).toContain('rgb(255, 247, 196)');
 await page.clock.runFor(400);
 await expect(page.getByRole('heading',{name:'勺子',exact:true})).toBeVisible();
 await expect(board(page)).not.toHaveClass(/gold-sweep/);
});

test('reveal and the next question never replay the sweep',async({page})=>{
 const field=await open(page);
 await fillSpelling(page,'cro');
 await page.getByRole('button',{name:/^不认识/}).click();
 await expect(field).toHaveValue('croissant');
 await expect(board(page)).not.toHaveClass(/gold-sweep/);
 const revealed=await paint(page);
 expect(revealed.content).toBe('none');expect(revealed.underlineContent).toBe('none');
 await page.getByRole('button',{name:'下一个',exact:true}).click();
 await expect(page.getByRole('heading',{name:'勺子',exact:true})).toBeVisible();
 await expect(board(page)).not.toHaveClass(/gold-sweep/);
 await page.waitForTimeout(350);
 await expect(board(page)).not.toHaveClass(/gold-sweep/);
 expect((await paint(page)).content).toBe('none');
});

test('reopening a saved completed answer never replays the sweep',async({page})=>{
 const field=await open(page);
 await fillSpelling(page,'croissant');
 await expect(page.getByRole('heading',{name:'勺子',exact:true})).toBeVisible();
 // Wait for the completed grade to reach storage, then reopen that saved word.
 await expect.poll(()=>page.evaluate(()=>{
  for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i)!;
   if(!key.startsWith('piclex-web.study.v2.'))continue;
   const state=JSON.parse(localStorage.getItem(key)!);
   if(state.words&&Object.values(state.words).some((draft:any)=>draft?.result==='correct'))return key;
  }return '';
 })).not.toBe('');
 const saved=await page.evaluate(()=>{
  for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i)!;
   if(!key.startsWith('piclex-web.study.v2.'))continue;
   const state=JSON.parse(localStorage.getItem(key)!);
   if(state.words&&Object.values(state.words).some((draft:any)=>draft?.result==='correct')){
    return key;
   }
  }return '';
 });
 expect(saved).not.toBe('');
 await page.reload({waitUntil:'domcontentloaded'});
 const restored=page.getByRole('textbox',{name:'输入英文',exact:true});
 await expect(restored).toHaveValue('');
 await expect(page.getByRole('heading',{name:'勺子',exact:true})).toBeVisible();
 await expect(board(page)).not.toHaveClass(/gold-sweep/);
 const gold=await paint(page);
 expect(gold.content).toBe('none');expect(gold.goldClass).toBe(false);
 // Reopening a saved answer follows the existing fresh-attempt behavior, without replaying history.
 await page.waitForTimeout(400);
 await expect(restored).toHaveValue('');
 await expect(board(page)).not.toHaveClass(/gold-sweep/);
});

test('reduced motion skips the sweep entirely',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 await open(page);
 await freeze(page);
 await fillSpelling(page,'croissant');
 await expect(board(page)).not.toHaveClass(/gold-sweep/);
 const paintState=await paint(page);
 expect(paintState.content).toBe('none');expect(paintState.underlineContent).toBe('none');
 expect(paintState.filter).toBe('none');
});

test('hiding the page or leaving the board cancels an in-flight sweep',async({page})=>{
 const field=await open(page);
 await freeze(page);
 await fillSpelling(page,'croissant');
 await expect(board(page)).toHaveClass(/gold-sweep/);
 await page.getByRole('button',{name:'当前卡组，学习设置',exact:true}).click();
 await expect(board(page)).not.toHaveClass(/gold-sweep/);
 expect((await paint(page)).content).toBe('none');
 await page.getByRole('button',{name:'关闭',exact:true}).click();
 // The panel's pause clears auto-advance; the same completed board must stay settled.
 await expect(board(page)).not.toHaveClass(/gold-sweep/);
 await page.getByRole('button',{name:'下一个',exact:true}).click();
 await expect(page.getByRole('heading',{name:'勺子',exact:true})).toBeVisible();
 await fillSpelling(page,'spoon');
 await expect(board(page)).toHaveClass(/gold-sweep/);
 await page.evaluate(()=>{
  Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});
  document.dispatchEvent(new Event('visibilitychange'));
 });
 await expect(board(page)).not.toHaveClass(/gold-sweep/);
 expect((await paint(page)).content).toBe('none');
});
