import {expect,test,type Page} from '@playwright/test';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import {entry,install,source,storedSnapshot} from './helpers/subscriptions';
import {fillSpelling} from './helpers/spelling';

const catalog=JSON.parse(fs.readFileSync('apps/public/public/library/catalog.json','utf8'));
const [first,second]=catalog;
const load=(card:any)=>JSON.parse(fs.readFileSync('apps/public/public/'+card.payload,'utf8'));
const paid={id:'a7e08e87-33ff-44a1-a686-8275696dcc93',title:'付费测试卡组',
 cover:'https://piclex.v2fy.com/decks/a7e08e87-33ff-44a1-a686-8275696dcc93/v1-0000000000000000/cover-portrait.jpg'};
const fixture=fs.readFileSync('tests/fixtures/demo/decks/cafe.piclexdeck');

async function picker(page:Page){
 await page.getByRole('button',{name:'当前卡组，学习设置',exact:true}).click();
 return page.getByRole('dialog',{name:'选择卡组'});
}

test.beforeEach(async({page})=>{
 await page.addInitScript(()=>{
  const play=HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play=function(){this.muted=true;return play.call(this);};
  Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{getVoices:()=>[],speak:(utterance:any)=>queueMicrotask(()=>utterance.onend?.()),cancel(){},addEventListener(){},removeEventListener(){}}});
  const connect=AudioNode.prototype.connect;
  AudioNode.prototype.connect=function(destination:AudioNode|AudioParam,...ports:any[]){
   if(destination instanceof AudioDestinationNode){
    const output=this.context.createGain();
    output.gain.value=0;
    Reflect.apply(connect,output,[destination]);
    return Reflect.apply(connect,this,[output,...ports]);
   }
   return Reflect.apply(connect,this,[destination,...ports]);
  } as typeof AudioNode.prototype.connect;
 });
});

test('cover grid shows separate saved progress and opens paid deck actions without switching',async({page},info)=>{
 await page.route('**/library/purchase-catalog.json',route=>route.fulfill({json:[paid]}));
 await page.route(paid.cover,route=>route.fulfill({path:'apps/public/public/'+first.covers.portrait}));
 await page.addInitScript(({first,second})=>{
  for(const [card,index] of [[first,0],[second,2]] as const){
   localStorage.setItem('piclex-web.study.v2.'+card.learningFingerprint,JSON.stringify({
    version:2,fingerprint:card.learningFingerprint,index
   }));
  }
 },{first,second});
 await page.goto('/piclex-web/#/deck/'+first.id);
 await expect(page.getByRole('heading',{name:load(first).words[0].chinese,exact:true})).toBeVisible();
 const url=page.url(),dialog=await picker(page);
 const firstCard=dialog.locator('.practice-deck-item').filter({has:page.locator(`[data-deck-id="${first.id}"]`)});
 const secondCard=dialog.locator('.practice-deck-item').filter({has:page.locator(`[data-deck-id="${second.id}"]`)});
 const current=firstCard.locator('.practice-deck-option');
 await expect(current).toHaveAttribute('aria-pressed','true');
 await expect(firstCard.locator('.practice-deck-percent')).toHaveText('0%');
 await expect(secondCard.locator('.practice-deck-percent')).toHaveText(Math.round(200/second.count)+'%');
 await expect(firstCard.locator('.practice-deck-footer')).not.toContainText(first.title);
 const cover=(await current.boundingBox())!,percent=(await firstCard.locator('.practice-deck-percent').boundingBox())!,more=(await firstCard.getByRole('button',{name:first.title+'的更多操作'}).boundingBox())!;
 expect(percent.x).toBeCloseTo(cover.x,0);expect(percent.y).toBeGreaterThan(cover.y+cover.height);
 expect(more.x+more.width).toBeCloseTo(cover.x+cover.width,0);
 const artwork=current.locator('img');
 await expect(artwork).toHaveCSS('object-fit','cover');
 await expect(artwork).toBeVisible();
 const image=(await artwork.boundingBox())!;
 expect(image.x).toBeCloseTo(cover.x,0);
 expect(image.width).toBeCloseTo(cover.width,0);
 expect(cover.width/cover.height).toBeCloseTo(2/3,2);
 await page.screenshot({path:info.outputPath('picker.png'),animations:'disabled'});
 const menu=dialog.getByRole('button',{name:paid.title+'的更多操作'});
 await menu.click();
 await expect(dialog.getByRole('link',{name:'在 iOS App 中购买'})).toHaveAttribute('href','piclex://decks/'+paid.id);
 await expect(dialog.getByRole('link',{name:'获取 iOS App'})).toHaveAttribute('href',/apps\.apple\.com/);
 const paidCover=dialog.locator(`[data-deck-id="${paid.id}"]`);
 await expect(paidCover).toBeDisabled();
 await expect(paidCover).toHaveCSS('opacity','1');
 await expect(page).toHaveURL(url);
 await page.screenshot({path:info.outputPath('purchase-menu.png'),animations:'disabled'});
 await page.keyboard.press('Escape');await expect(menu).toHaveAttribute('aria-expanded','false');
 await expect(dialog).toBeVisible();await expect(menu).toBeFocused();
 await secondCard.locator('.practice-deck-option').click();
 await expect(dialog).toHaveCount(0);
 await expect(page.getByRole('heading',{name:load(second).words[2].chinese,exact:true})).toBeVisible();
 await page.reload();
 const reopened=await picker(page);
 await expect(reopened.locator('.practice-deck-item').filter({has:page.locator(`[data-deck-id="${second.id}"]`)}).locator('.practice-deck-percent')).toHaveText(Math.round(200/second.count)+'%');
});

test('one update action checks, retries a corrupt subscription and keeps the current draft',async({page})=>{
 await install(page);
 await fillSpelling(page,'x');
 const input=page.getByRole('textbox',{name:'输入英文',exact:true}),draft=await input.inputValue(),url=page.url();
 const before=await storedSnapshot(page);
 const version=2;let broken=true;
 await page.route(source,route=>route.fulfill({json:{format:'com.piclex.deck-source',schemaVersion:1,decks:[{...entry,version}]}}));
 await page.route(entry.packageURL,route=>route.fulfill({body:broken?Buffer.alloc(fixture.length):fixture,contentType:'application/zip'}));
 const dialog=await picker(page);
 const menu=dialog.getByRole('button',{name:entry.title+'的更多操作'});
 await menu.click();await dialog.getByRole('button',{name:'更新卡组',exact:true}).click();
 await expect(dialog.getByRole('status')).toContainText('校验失败');
 expect(await storedSnapshot(page)).toEqual(before);
 broken=false;
 await menu.click();await dialog.getByRole('button',{name:'更新卡组',exact:true}).click();
 await expect(dialog.getByRole('status')).toHaveText('已更新至 v2');
 await expect(page).toHaveURL(url);
 await dialog.getByRole('button',{name:'关闭',exact:true}).click();
 await expect(input).toHaveValue(draft);
 const reopened=await picker(page);
 await reopened.getByRole('button',{name:entry.title+'的更多操作'}).click();
 await reopened.getByRole('button',{name:'更新卡组',exact:true}).click();
 await expect(reopened.getByRole('status')).toHaveText('已是最新版本');
});

test('public update replaces only a verified newer payload and keeps the same practice',async({page})=>{
 const value=load(first);
 const initial={...first,version:1},fingerprint='f'.repeat(64),changedTitle=first.title+'新版';
 const payload=JSON.stringify({...value,fingerprint,title:changedTitle});
 const latest={...initial,version:2,fingerprint,title:changedTitle,payload:'library/update/deck.json',
  payloadSHA256:createHash('sha256').update(payload).digest('hex')};
 let current=initial,valid=false;
 await page.route('**/library/catalog.json',route=>route.fulfill({json:[current,...catalog.slice(1)]}));
 await page.route('**/library/update/deck.json',route=>route.fulfill({body:valid?payload:'{}',contentType:'application/json'}));
 await page.goto('/piclex-web/#/deck/'+first.id);
 const input=page.getByRole('textbox',{name:'输入英文',exact:true});
 await fillSpelling(page,'x');const draft=await input.inputValue(),url=page.url();
 const dialog=await picker(page);
 const menu=dialog.getByRole('button',{name:first.title+'的更多操作'});
 await menu.click();await dialog.getByRole('button',{name:'更新卡组',exact:true}).click();
 await expect(dialog.getByRole('status')).toHaveText('已是最新版本');
 current=latest;
 await menu.click();await dialog.getByRole('button',{name:'更新卡组',exact:true}).click();
 await expect(dialog.getByRole('status')).toContainText('校验失败');
 await expect(dialog.locator(`[data-deck-id="${first.id}"]`)).toHaveAttribute('aria-pressed','true');
 valid=true;
 await menu.click();await dialog.getByRole('button',{name:'更新卡组',exact:true}).click();
 await expect(dialog.getByRole('status')).toHaveText('已更新至 v2');
 await expect(dialog.getByRole('button',{name:changedTitle,exact:true})).toHaveAttribute('aria-pressed','true');
 await dialog.getByRole('button',{name:'关闭',exact:true}).click();
 await expect(input).toHaveValue(draft);
 await expect(page).toHaveURL(url);
});
