import {fillEnglish} from './helpers/spelling';
import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
const card=JSON.parse(fs.readFileSync('apps/public/public/library/catalog.json','utf8'))[0];
for(const kind of ['portrait','landscape'])test(`listening preserves the full ${kind} scene above the keyboard across layouts`,async({page},info)=>{
 test.setTimeout(90000);
 if(kind==='portrait')await page.goto('/piclex-web/#/deck/'+card.id);
 else{
  await page.goto('/piclex-web/#/decks');await expect(page.getByRole('button',{name:'导入自己的卡组'})).toBeEnabled();
  await page.getByLabel('选择照片卡组文件').setInputFiles(path.resolve('tests/fixtures/demo/decks/cafe.piclexdeck'));
 }
 await page.getByRole('tab',{name:'练听力',exact:true}).click();
 const mode=page.getByRole('combobox',{name:'句子练习模式'}),image=page.locator('.focus-image'),keyboard=page.getByRole('region',{name:'虚拟键盘'});
 const contained=async()=>{
  await expect(image).toBeVisible();
  await expect.poll(async()=>image.evaluate((img:HTMLImageElement)=>{
   const a=img.getBoundingClientRect(),b=img.parentElement!.getBoundingClientRect();
   return img.naturalWidth>0&&Math.abs(a.width/a.height-img.naturalWidth/img.naturalHeight)<.01&&a.left>=b.left-1&&a.top>=b.top-1&&a.right<=b.right+1&&a.bottom<=b.bottom+1;
  })).toBe(true);
  expect((await page.locator('.photo-browse').boundingBox())!.height).toBeGreaterThanOrEqual(info.project.use.hasTouch?139:219);
 };
 for(const size of [{width:1280,height:720},{width:1440,height:1000},{width:390,height:844}]){
  await page.setViewportSize(size);await mode.selectOption('free');
  for(const difficulty of ['hard','easy','medium']){await page.getByLabel('听写难度').selectOption(difficulty);await contained();}
  await page.getByLabel('听写难度').selectOption('hard');
  const xp=(await page.locator('.learning-experience b').boundingBox())!,title=(await page.locator('.practice-deck-target').boundingBox())!;expect(xp.y).toBeGreaterThanOrEqual(title.y);expect(xp.y+xp.height).toBeLessThanOrEqual(title.y+title.height);
  {
   await expect(keyboard).toBeVisible();
   await keyboard.scrollIntoViewIfNeeded();
   const k=(await keyboard.boundingBox())!,tabs=(await page.getByRole('navigation',{name:'底部导航'}).boundingBox())!;
   expect(k.y+k.height).toBeLessThanOrEqual(tabs.y+1);
   expect((await keyboard.getByRole('button',{name:'按键 Q',exact:true}).boundingBox())!.height).toBeGreaterThanOrEqual(26);
  }
  if(kind==='portrait'&&size.width===(info.project.name==='desktop'?1280:390))await page.screenshot({path:`test-results/listening-photo-${info.project.name}.png`});
  for(const next of ['chunks','listening']){await mode.selectOption(next);await contained();await expect(keyboard).toHaveCount(0);}
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
 await page.setViewportSize({width:390,height:430});await mode.selectOption('free');await page.getByLabel('听写难度').selectOption('hard');await contained();
 expect(await page.locator('.native-body').evaluate(el=>el.scrollHeight>el.clientHeight)).toBe(true);
 const dictation=page.getByRole('textbox',{name:'听写句子',exact:true});
 await fillEnglish(dictation,'wrong');
 if(info.project.name==='desktop'){await keyboard.getByRole('button',{name:'退格',exact:true}).click();await expect(dictation).toHaveValue(kind==='portrait'?'w ro n':'w ron');}
 await fillEnglish(dictation,kind==='portrait'?'Iamstillinbad':'Acroissantisonthewoodenplatx');
 await expect(page.getByRole('button',{name:'检查答案',exact:true})).toHaveCount(0);
 await expect(page.getByText('再听一次，试着修改答案',{exact:true})).toBeVisible();
 if(info.project.name==='desktop'){await keyboard.getByRole('button',{name:'退格',exact:true}).click();await expect(page.getByText('再听一次，试着修改答案',{exact:true})).toHaveCount(0);}
 await page.clock.install();await page.clock.pauseAt(await page.evaluate(()=>Date.now()+1000));
 await fillEnglish(dictation,kind==='portrait'?'Iamstillinbed':'Acroissantisonthewoodenplate');
 await expect(page.locator('.sentence-actions-pending')).toHaveCount(1);
});
