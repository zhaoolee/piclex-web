import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import {fillEnglish} from './helpers/spelling';
const catalog=JSON.parse(fs.readFileSync('apps/public/public/library/catalog.json','utf8')),card=catalog.find((c:any)=>c.title==='程序员工作英语');
test('easy has no eye controls or reserved row; word hold preserves bilingual help and input',async({page},info)=>{
 await page.goto('/piclex-web/#/deck/'+card.id+'?module=listening&mode=free&difficulty=easy');
 const words=page.locator('.guided-word'),fields=words.locator('input'),tooltip=page.getByRole('tooltip');await expect(words).toHaveCount(3);
 await expect(page.locator('.peek-letter')).toHaveCount(0);await expect(page.getByRole('button',{name:/按住查看第/})).toHaveCount(0);
 for(const word of await words.all()){const geometry=await word.evaluate(n=>({height:n.getBoundingClientRect().height,padding:getComputedStyle(n).paddingBottom,input:n.querySelector('input')!.getBoundingClientRect().height}));expect(geometry.padding).toBe('0px');expect(geometry.height).toBe(36);expect(geometry.input).toBe(36);}
 await fillEnglish(fields.nth(1),'x');const draft=await fields.evaluateAll(nodes=>nodes.map(n=>(n as HTMLInputElement).value));await expect(fields.nth(1)).toBeFocused();
 await words.first().scrollIntoViewIfNeeded();await page.waitForTimeout(300);const box=(await words.first().boundingBox())!;
 await page.mouse.move(box.x+8,box.y+14);await page.mouse.down();await expect(tooltip).toBeVisible();await expect(tooltip.locator('.word-peek-english')).toHaveText('Hi');await expect(tooltip.locator('.word-peek-meaning')).not.toHaveText(/查询中|暂不可用|暂无释义/);await expect(fields.nth(1)).toBeFocused();
 if(info.project.name==='mobile'&&process.env.PARITY_EVIDENCE)await page.screenshot({path:process.env.PARITY_EVIDENCE+'/eye-removal-hold.png',scale:'css'});
 await page.mouse.up();await expect(tooltip).toHaveCount(0);await expect(fields.nth(1)).toBeFocused();expect(await fields.evaluateAll(nodes=>nodes.map(n=>(n as HTMLInputElement).value))).toEqual(draft);
 await fields.nth(1).press('y');await expect(fields.nth(1)).toHaveValue('xy');await fields.nth(1).focus();await fields.nth(1).press('End');await fields.nth(1).press('Backspace');await expect(fields.nth(1)).toHaveValue('x');
 await page.mouse.move(box.x+8,box.y+14);await page.mouse.down();await expect(tooltip).toBeVisible();await page.mouse.move(box.x+28,box.y+14);await expect(tooltip).toHaveCount(0);await page.mouse.up();
 await page.mouse.move(box.x+8,box.y+14);await page.mouse.down();await page.mouse.up();await page.waitForTimeout(450);await expect(tooltip).toHaveCount(0);
 await page.mouse.move(box.x+8,box.y+14);await page.mouse.down();await expect(tooltip).toBeVisible();await page.locator('.sentence-content').evaluate(n=>n.dispatchEvent(new Event('scroll')));await expect(tooltip).toHaveCount(0);await page.mouse.up();
 await expect(page.locator('.virtual-keyboard')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight+1)).toBe(true);
 // Old hard/medium links and picks all open the single guided attempt.
 await expect(page.getByLabel('听写难度')).toHaveCount(0);
 await page.goto('/piclex-web/#/deck/'+card.id+'?module=listening&mode=free&difficulty=hard');
 await expect(page.locator('.guided-input')).toBeVisible();await expect(page.getByRole('textbox',{name:'听写句子',exact:true})).toHaveCount(0);await expect(page.locator('.peek-letter')).toHaveCount(0);
 await expect(page.locator('.guided-word input').nth(1)).toHaveValue('x');
 if(info.project.name==='mobile'&&process.env.PARITY_EVIDENCE)await page.screenshot({path:process.env.PARITY_EVIDENCE+'/eye-removal-easy.png',scale:'css'});
});
