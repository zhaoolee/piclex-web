import {fillSpelling,fillEnglish} from './helpers/spelling';
import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
const catalog=JSON.parse(fs.readFileSync('apps/public/public/library/catalog.json','utf8'));
const first=catalog[0],firstDeck=JSON.parse(fs.readFileSync('apps/public/public/'+first.payload,'utf8'));
const fixture=path.resolve('tests/fixtures/demo/decks/cafe.piclexdeck');
test('first learning visit opens the first official deck in spelling without a chooser',async({page},info)=>{
 await page.goto('/piclex-web/#/learn');await expect(page.getByRole('heading',{name:firstDeck.words[0].chinese,exact:true})).toBeVisible();await expect(page.getByRole('tab',{name:'拼单词',exact:true})).toHaveAttribute('aria-selected','true');await expect(page.getByRole('textbox',{name:'输入英文',exact:true})).toBeVisible();await expect(page.locator('.home')).toHaveCount(0);await expect(page).toHaveURL(new RegExp('#/deck/'+first.id+'(?:\\?|$)'));await page.screenshot({path:info.outputPath(`default-learning-${info.project.name}.png`),fullPage:true});
});
test('learning tab and capture start choose a deck while explicit library remains available',async({page})=>{
 await page.goto('/piclex-web/#/capture');const tabs=page.getByRole('navigation',{name:'底部导航'});await tabs.getByRole('button',{name:'学习',exact:true}).click();await expect(page.getByRole('textbox',{name:'输入英文',exact:true})).toBeVisible();await expect(page.locator('.home')).toHaveCount(0);
 await page.getByRole('button',{name:'下载第三方卡组',exact:true}).click();await expect(page.getByRole('textbox',{name:'粘贴卡组 URL'})).toBeVisible();await page.getByRole('button',{name:'关闭',exact:true}).click();await tabs.getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('button',{name:'照片卡组',exact:true}).click();await expect(page.locator('.settings-deck-item')).toHaveCount(catalog.filter((c:any)=>c.sourceURL!=='https://piclex.v2fy.com/decks/source.json').length);await expect(page.locator('.settings-deck-item[data-official=true]')).toHaveCount(0);
 await tabs.getByRole('button',{name:'拍摄',exact:true}).click();await tabs.getByRole('button',{name:'学习',exact:true}).click();await expect(page.getByRole('textbox',{name:'输入英文',exact:true})).toBeVisible();
});
test('remembered local deck opens spelling without losing spelling or listening drafts',async({page})=>{
 await page.goto('/piclex-web/#/decks');await expect(page.getByRole('button',{name:'导入自己的卡组',exact:true})).toBeEnabled();await page.getByLabel('选择照片卡组文件').setInputFiles(fixture);const input=page.getByRole('textbox',{name:'输入英文',exact:true});await fillSpelling(page,'cr');
 await page.getByRole('tab',{name:'练听力',exact:true}).click();await page.getByLabel('句子练习模式').selectOption('free');await page.getByLabel('听写难度').selectOption('hard');await fillEnglish(page.getByRole('textbox',{name:'听写句子',exact:true}),'Ilike');
 const tabs=page.getByRole('navigation',{name:'底部导航'});await tabs.getByRole('button',{name:'设置',exact:true}).click();await tabs.getByRole('button',{name:'学习',exact:true}).click();await expect(input).toHaveValue('cr');await expect(page.getByRole('heading',{name:'牛角包',exact:true})).toBeVisible();
 await page.getByRole('tab',{name:'练听力',exact:true}).click();await expect(page.getByRole('textbox',{name:'听写句子',exact:true})).toHaveValue('I like');await page.reload();await expect(page.getByRole('tab',{name:'练听力',exact:true})).toHaveAttribute('aria-selected','true');
 await tabs.getByRole('button',{name:'学习',exact:true}).click();await expect(input).toHaveValue('cr');await page.goto('/piclex-web/#/learn');await expect(input).toHaveValue('cr');await expect(page).toHaveURL(/#\/deck\/local-/);
});
test('missing remembered deck falls back and a failed catalog has a recovery action',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('piclex-web.last-deck','local-missing'));
 await page.goto('/piclex-web/#/learn');await expect(page.getByRole('heading',{name:firstDeck.words[0].chinese,exact:true})).toBeVisible();await expect(page).toHaveURL(new RegExp('#/deck/'+first.id+'(?:\\?|$)'));
 await page.route('**/library/catalog.json',route=>route.fulfill({status:503,body:'unavailable'}));await page.goto('/piclex-web/?catalog-error#/learn');await expect(page.getByRole('heading',{name:'暂时无法打开',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'重新加载',exact:true})).toBeVisible();await expect(page.locator('.home')).toHaveCount(0);
});
