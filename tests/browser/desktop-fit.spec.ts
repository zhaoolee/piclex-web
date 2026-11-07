import {fillEnglish} from './helpers/spelling';
import {test,expect} from '@playwright/test';
import fs from 'node:fs';
const card=JSON.parse(fs.readFileSync('apps/public/public/library/catalog.json','utf8'))[0];
test('desktop preserves full photograph and fits answer, rate and keyboard without scrolling',async({page},info)=>{
 test.skip(info.project.name!=='desktop','Desktop keyboard layout only');test.setTimeout(90000);
 for(const viewport of [{width:1280,height:720},{width:1366,height:768},{width:1440,height:900}]){
  await page.setViewportSize(viewport);await page.goto('/piclex-web/#/deck/'+card.id);await page.getByRole('tab',{name:'拼单词',exact:true}).click();
  for(const mode of ['spelling','free-easy','free-medium','free-hard']){
   if(mode!=='spelling'){await page.getByRole('tab',{name:'练听力',exact:true}).click();await page.getByLabel('句子练习模式',{exact:true}).selectOption('free');await page.getByLabel('听写难度',{exact:true}).selectOption(mode.slice(5));}
   await expect(page.locator('.focus-image')).toBeVisible();
   await expect.poll(()=>page.locator('.native-practice').evaluate(n=>n.scrollHeight-n.clientHeight)).toBeLessThanOrEqual(1);
   const geometry=await page.evaluate(()=>{
    const root=document.querySelector('.native-practice')!,photo=document.querySelector('.photo-browse')!.getBoundingClientRect(),img=document.querySelector<HTMLImageElement>('.focus-image')!,image=img.getBoundingClientRect(),keyboard=document.querySelector('.virtual-keyboard')!.getBoundingClientRect(),tabs=document.querySelector('.app-tabs')!.getBoundingClientRect(),select=document.querySelector<HTMLSelectElement>('[aria-label="播放速度"]')!,rate=select.getBoundingClientRect();
    const font=getComputedStyle(select),canvas=document.createElement('canvas'),context=canvas.getContext('2d')!;context.font=font.font;
    return {scroll:root.scrollTop,photo:photo.toJSON(),image:image.toJSON(),ratio:img.naturalWidth/img.naturalHeight,keyboard:keyboard.toJSON(),tabs:tabs.toJSON(),rate:rate.toJSON(),available:rate.width-parseFloat(font.paddingLeft)-parseFloat(font.paddingRight),text:context.measureText(select.selectedOptions[0].textContent!).width};
   });
   expect(geometry.scroll).toBe(0);expect(geometry.photo.height).toBeGreaterThanOrEqual(220);expect(geometry.image.width/geometry.image.height).toBeCloseTo(geometry.ratio,2);
   expect(geometry.image.top).toBeGreaterThanOrEqual(geometry.photo.top-.5);expect(geometry.image.bottom).toBeLessThanOrEqual(geometry.photo.bottom+.5);expect(geometry.image.left).toBeGreaterThanOrEqual(geometry.photo.left-.5);expect(geometry.image.right).toBeLessThanOrEqual(geometry.photo.right+.5);
   expect(geometry.keyboard.bottom).toBeLessThanOrEqual(geometry.tabs.top);expect(geometry.rate.bottom).toBeLessThanOrEqual(geometry.keyboard.top);expect(geometry.available).toBeGreaterThan(geometry.text);
   await page.getByLabel('播放速度',{exact:true}).selectOption('1.15');await expect(page.getByLabel('播放速度',{exact:true})).toHaveValue('1.15');await page.getByLabel('播放速度',{exact:true}).selectOption('1');
   if(mode==='spelling'){
    await fillEnglish(page.getByRole('textbox',{name:'输入英文',exact:true}),'z');await expect(page.locator('.native-answer')).toHaveClass(/wrong/);await expect(page.locator('.answer-feedback')).toHaveCount(0);
    await expect.poll(()=>page.locator('.native-practice').evaluate(n=>n.scrollHeight-n.clientHeight)).toBeLessThanOrEqual(1);
    await page.getByRole('button',{name:'退格',exact:true}).click();
   }
  }
 }
});
