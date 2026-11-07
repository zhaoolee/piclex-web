import {test,expect} from '@playwright/test';
import path from 'node:path';

// Only the wrong letter may be red (learning.css `.letter-slot.wrong`); a correct
// prefix must keep the ink colour and the neutral underline on every letter.
const RED='rgb(198, 68, 68)';
const deck=path.resolve('tests/fixtures/demo/decks/cafe.piclexdeck');

async function open(page:any,colorScheme:'light'|'dark'){
 await page.emulateMedia({colorScheme});
 await page.goto('/piclex-web/#/decks',{waitUntil:'domcontentloaded'});
 await page.getByLabel('选择照片卡组文件').setInputFiles(deck);
 const field=page.getByRole('textbox',{name:'输入英文',exact:true});
 await expect(field).toBeVisible();
 return field;
}

const glyphs=(page:any)=>page.evaluate(()=>[...document.querySelectorAll<HTMLElement>('.answer-slots .letter-slot')].map(slot=>{
 const glyph=slot.querySelector<HTMLElement>('.letter-glyph')!,style=getComputedStyle(glyph),line=getComputedStyle(slot);
 const board=slot.closest('.native-answer')!;
 return {letter:glyph.textContent!.trim(),color:style.color,opacity:style.opacity,transform:style.transform,
  underline:line.borderBottomColor,red:slot.classList.contains('wrong'),frame:getComputedStyle(board).borderTopColor};
}));

for(const colorScheme of ['light','dark'] as const)test(`only the wrong letter is red and edits clear it: ${colorScheme}`,async({page})=>{
 const field=await open(page,colorScheme);
 await field.press('c');await field.press('r');await expect(field).toHaveValue('cr');
 const neutral=await glyphs(page);
 const ink=neutral[0].color,underline=neutral[1].underline;
 expect(neutral).toHaveLength([...'croissant'].length);
 for(const glyph of neutral){expect(glyph.red).toBe(false);expect(glyph.color).not.toBe(RED);expect(glyph.underline).not.toBe(RED);expect(glyph.frame).not.toBe(RED);}
 for(const index of [0,1]){expect(neutral[index].color).toBe(ink);expect(neutral[index].underline).toBe(underline);}

 await field.press('x');await expect(field).toHaveValue('crx');
 await expect(page.locator('.native-answer')).toHaveClass(/wrong/);
 const wrong=await glyphs(page);
 expect(wrong[2].red).toBe(true);expect(wrong[2].color).toBe(RED);expect(wrong[2].underline).toBe(RED);expect(wrong[2].frame).toBe(RED);
 for(const index of [0,1]){expect(wrong[index].red).toBe(false);expect(wrong[index].color).toBe(ink);expect(wrong[index].underline).toBe(underline);}
 for(const glyph of wrong.slice(3)){expect(glyph.color).not.toBe(RED);expect(glyph.underline).not.toBe(RED);}

 await field.press('Backspace');await expect(field).toHaveValue('cr');
 await expect(page.locator('.native-answer')).not.toHaveClass(/wrong/);
 const deleted=await glyphs(page);
 for(const glyph of deleted){expect(glyph.red).toBe(false);expect(glyph.color).not.toBe(RED);expect(glyph.underline).not.toBe(RED);expect(glyph.frame).not.toBe(RED);}

 // Correcting the wrong slot in place must not keep the red paint around.
 await field.press('x');await expect(page.locator('.native-answer')).toHaveClass(/wrong/);
 await field.press('Backspace');await field.press('o');await expect(field).toHaveValue('cro');
 await expect(page.locator('.native-answer')).not.toHaveClass(/wrong/);
 const corrected=await glyphs(page);
 expect(corrected[2].red).toBe(false);expect(corrected[2].color).toBe(ink);expect(corrected[2].underline).toBe(underline);expect(corrected[2].frame).not.toBe(RED);
 for(const glyph of corrected){expect(glyph.color).not.toBe(RED);}
});

for(const colorScheme of ['light','dark'] as const)test(`glyph animations never outlive their letter across edits and answers: ${colorScheme}`,async({page})=>{
 // Hold only the glyph animation at its midpoint so this lifetime check does not
 // accidentally pass because 180ms elapsed before the next assertion. The colour
 // tests above and the manual full-page checks use normal animation timing.
 await page.addInitScript(()=>{
  const animate=Element.prototype.animate,tracked:Animation[]=[];
  (window as any).__glyphAnimations=tracked;
  Element.prototype.animate=function(...args:Parameters<typeof animate>){
   const animation=animate.apply(this,args);
   if(this.classList.contains('letter-glyph')){tracked.push(animation);animation.pause();animation.currentTime=90;}
   return animation;
  };
 });
 const field=await open(page,colorScheme);
 const tracked=()=>page.evaluate(()=>(window as any).__glyphAnimations.map((a:Animation)=>({
  state:a.playState,connected:((a.effect as KeyframeEffect).target as Element).isConnected,
 })));
 await field.press('c');await expect(field).toHaveValue('c');
 expect(await tracked()).toEqual([{state:'paused',connected:true}]);
 // A different correct letter must not prematurely stop the first one's effect.
 await field.press('r');await expect(field).toHaveValue('cr');
 expect(await tracked()).toEqual([{state:'paused',connected:true},{state:'paused',connected:true}]);
 await field.press('Backspace');await field.press('x');await expect(field).toHaveValue('cx');
 const duringError=await tracked();
 expect(duringError[0]).toEqual({state:'paused',connected:true});
 expect(duringError[1]).toEqual({state:'idle',connected:false});
 const wrongGlyph=page.locator('.letter-glyph').nth(1);
 expect(await wrongGlyph.evaluate(node=>node.getAnimations().length)).toBe(0);
 await expect(wrongGlyph).toHaveCSS('color',RED);await expect(wrongGlyph).toHaveCSS('opacity','1');
 await expect(page.locator('.letter-slot').nth(1)).toHaveCSS('border-bottom-color',RED);
 await field.press('Backspace');await field.press('r');await expect(field).toHaveValue('cr');
 await expect(page.locator('.letter-glyph').nth(1)).not.toHaveCSS('color',RED);
 await expect(page.locator('.letter-glyph').nth(1)).toHaveCSS('opacity','1');
 expect((await tracked())[1]).toEqual({state:'idle',connected:false});
 // Completion of an owned animation releases the effect without changing colour.
 await page.evaluate(()=>{for(const a of (window as any).__glyphAnimations)if(a.playState==='paused')a.finish();});
 await expect(page.locator('.letter-glyph').first()).toHaveCSS('opacity','1');
 await expect(page.locator('.letter-glyph').first()).toHaveCSS('transform','none');
 // Reveal must cancel a fresh effect; the next answer must start with neutral glyphs.
 await field.press('o');await expect(field).toHaveValue('cro');
 expect((await tracked()).at(-1)).toEqual({state:'paused',connected:true});
 await page.getByRole('button',{name:'不认识',exact:true}).click();
 expect((await tracked()).at(-1)?.state).toBe('idle');
 expect((await glyphs(page)).some(glyph=>glyph.color===RED||glyph.underline===RED)).toBe(false);
 await page.getByRole('button',{name:'下一个',exact:true}).click();
 await expect(page.locator('.native-answer')).not.toHaveClass(/wrong/);
 const next=await glyphs(page);
 expect(next.length).toBeGreaterThan(0);
 expect(next.some(glyph=>glyph.color===RED||glyph.underline===RED||glyph.red)).toBe(false);
 expect(next.every(glyph=>glyph.opacity==='1'&&glyph.transform==='none')).toBe(true);
});
