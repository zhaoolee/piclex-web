import {test as base,expect,type Page} from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import {parseArchive} from '../../packages/deck-format/src/archive.mjs';
import {newStudy} from '../../packages/practice/src/study.mjs';
import {createPhotoDeck} from '../../packages/deck-format/src/create.mjs';

const test=base.extend<{importedPhotoGroup:Page}>({
 // Test fixtures are set up before beforeEach hooks, so the init script is applied here before the imports navigate.
 importedPhotoGroup:[async({page},use)=>{await page.addInitScript(()=>localStorage.setItem('piclex-web.import-animation','false'));await threeImportedPhotos(page);await use(page);},{timeout:30000}],
});

test.use({launchOptions:{args:process.platform==='darwin'?['--mute-audio']:[]}});
const api='https://piclex.v2fy.com/v1/web/analyze';
const photo=path.resolve('tests/fixtures/demo/images/cafe.jpg');
const defaultID='local-default-photos';
const quota={daily_limit:10,used:1,remaining:9,resets_at:2000000000};
const labels=[
 {english:'cup',chinese:'杯子',example:'This is a cup.',exampleChinese:'这是一个杯子。',relation:'visible',bbox:[100,200,400,600],anchor:[150,250]},
 {english:'table',chinese:'桌子',example:'This is a table.',exampleChinese:'这是一张桌子。',relation:'visible',bbox:[100,200,900,700],anchor:[500,450]},
 {english:'window',chinese:'窗户',example:'This is a window.',exampleChinese:'这是一扇窗户。',relation:'visible',bbox:[100,200,400,600],anchor:[150,250]},
];
type Stored={id:string;title:string;addedAt:number;hash:string};
async function stored(page:Page):Promise<Stored[]>{
 return page.evaluate(async()=>{
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open('piclex-web-v1');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  const rows=await new Promise<any[]>((resolve,reject)=>{const transaction=db.transaction('decks','readonly'),request=transaction.objectStore('decks').getAll();transaction.oncomplete=()=>resolve(request.result);transaction.onerror=()=>reject(transaction.error);});
  db.close();
  return Promise.all(rows.map(async row=>({id:row.id,title:row.title,addedAt:row.addedAt,hash:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',row.bytes))).map(n=>n.toString(16).padStart(2,'0')).join('')})));
 });
}
async function reviewSettled(page:Page){
 const countdown=page.getByRole('button',{name:/秒后进入拼写，点击取消/}),open=page.getByRole('button',{name:'开练',exact:true});
 await expect(countdown.or(open)).toBeVisible({timeout:20000});
 if(await countdown.isVisible())await countdown.click();
 await expect(open).toBeVisible();
}
async function importAndReview(page:Page){
 await expect(page.getByRole('button',{name:'导入照片',exact:true})).toBeEnabled();
 await page.getByLabel('导入照片制卡',{exact:true}).setInputFiles(photo);
 await reviewSettled(page);
}
async function seed(page:Page,records:{id:string;title:string;addedAt:number;bytes:string}[]){
 await page.evaluate(async records=>{
  const decode=(value:string)=>{const binary=atob(value),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return bytes.buffer;};
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open('piclex-web-v1');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  if(!db.objectStoreNames.contains('decks'))throw Error('decks store is unavailable');
  await new Promise<void>((resolve,reject)=>{
   const transaction=db.transaction('decks','readwrite'),store=transaction.objectStore('decks');
   for(const record of records)store.put({...record,bytes:decode(record.bytes)});
   transaction.oncomplete=()=>resolve();transaction.onerror=transaction.onabort=()=>reject(transaction.error);
  });
  db.close();
 },records);
}

test.beforeEach(async({page})=>{await page.addInitScript(()=>localStorage.setItem('piclex-web.import-animation','false'));});

async function threeImportedPhotos(page:Page){
 let uploads=0;
 await page.route(api,route=>route.fulfill({status:200,headers:{'Access-Control-Allow-Origin':'*'},json:{labels:[labels[uploads++]],quote:null,quota}}));
 await page.goto('/piclex-web/#/capture');
 for(let index=0;index<3;index++){
  if(index)await page.getByRole('button',{name:'继续拍摄',exact:true}).click();
  await importAndReview(page);
 }
 await page.getByRole('button',{name:'开练',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'输入英文',exact:true})).toBeVisible();
}

// Keep independent user journeys within the unchanged 30-second budget.
test('three imported photos become one default deck in learning settings',async({page},info)=>{
 await threeImportedPhotos(page);
 const records=await stored(page);expect(records).toHaveLength(3);
 expect(records.every(record=>record.id.startsWith('local-capture-'))).toBe(true);
 await page.getByRole('button',{name:'当前卡组，学习设置'}).click();
 const picker=page.getByRole('group',{name:'切换卡组'}),group=picker.locator(`[data-deck-id="${defaultID}"]`);
 await expect(group).toHaveCount(1);await expect(group).toHaveAccessibleName('我的照片卡组');
 await expect(picker.getByRole('button',{name:'我的照片卡组',exact:true})).toHaveCount(1);
 await group.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('one-default-group.png')});
 await page.getByRole('button',{name:'关闭',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'输入英文',exact:true})).toBeVisible();
});

test('an imported photo group exports all photos and keeps navigation after reload',async({importedPhotoGroup:page},info)=>{
 await page.getByRole('button',{name:'选择照片',exact:true}).click();
 const gallery=page.getByRole('dialog',{name:'选择照片'});
 await expect(gallery.getByRole('button',{name:/^照片 \d+$/})).toHaveCount(3);
 await page.screenshot({path:info.outputPath('three-photos.png')});
 const download=page.waitForEvent('download');await gallery.getByRole('button',{name:'下载卡组',exact:true}).click();const exported=await download;const file=info.outputPath('group.piclexdeck');await exported.saveAs(file);expect((await parseArchive(new Uint8Array(fs.readFileSync(file)))).photos).toHaveLength(3);
 await gallery.getByRole('button',{name:'照片 2',exact:true}).click();
 await expect(page.getByRole('heading',{name:'桌子',exact:true})).toBeVisible();
 await page.reload();
 await expect(page.getByRole('heading',{name:'桌子',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'选择照片',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'选择照片'}).getByRole('button',{name:/^照片 \d+$/})).toHaveCount(3);
 await page.getByRole('dialog',{name:'选择照片'}).getByRole('button',{name:'照片 3',exact:true}).click();
 await expect(page.getByRole('heading',{name:'窗户',exact:true})).toBeVisible();
});

test('legacy default captures group without touching stored bytes while custom and same-title imports stay separate',async({page})=>{
 const image=new Uint8Array(fs.readFileSync(photo));
 const label=(english:string,chinese:string)=>({english,chinese,example:`This is a ${english}.`,exampleChinese:'',relation:'visible',bbox:[100,200,400,600],anchor:[150,250]});
 const make=async(title:string,english:string,chinese:string,id:string,date:number)=>Buffer.from(await createPhotoDeck({image,title,id,date,labels:[label(english,chinese)]})).toString('base64');
 const customID='local-capture-33333333-3333-4333-8333-333333333333';
 const importedID='local-'+'a'.repeat(64);
 const records=[
  {id:'local-capture-11111111-1111-4111-8111-111111111111',title:'我的照片卡组',addedAt:1600000000001,bytes:await make('我的照片卡组','cup','杯子','11111111-1111-4111-8111-111111111111',1600000000001)},
  {id:'local-capture-22222222-2222-4222-8222-222222222222',title:'我的照片卡组',addedAt:1600000000002,bytes:await make('我的照片卡组','table','桌子','22222222-2222-4222-8222-222222222222',1600000000002)},
  {id:customID,title:'旅行卡组',addedAt:1600000000003,bytes:await make('旅行卡组','train','火车','33333333-3333-4333-8333-333333333333',1600000000003)},
  {id:importedID,title:'我的照片卡组',addedAt:1600000000004,bytes:await make('我的照片卡组','book','书','44444444-4444-4444-8444-444444444444',1600000000004)},
 ];
 await page.goto('/piclex-web/#/decks');
 await expect(page.getByRole('button',{name:'导入自己的卡组',exact:true})).toBeEnabled();
 await seed(page,records);
 const before=await stored(page);
 const originals=await Promise.all(records.slice(0,2).map(async record=>{
  const parsed=await parseArchive(new Uint8Array(Buffer.from(record.bytes,'base64'))),deck={...parsed,fingerprint:parsed.learningFingerprint};
  const state=newStudy(deck);state.round=2;state.words[deck.words[0].id]={input:deck.words[0].english==='cup'?'cup':'ta',hadMistake:false,result:deck.words[0].english==='cup'?'correct':null,quickIndices:null};return state;
 }));
 await page.evaluate(async states=>{
  for(const state of states)localStorage.setItem('piclex-web.study.v2.'+state.fingerprint,JSON.stringify(state));
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open('piclex-web-experience-v1',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  await new Promise<void>((resolve,reject)=>{const t=db.transaction(['events','meta'],'readwrite');
   t.objectStore('events').put({id:`spell:${states[0].fingerprint}:2:${Object.keys(states[0].words)[0]}`,kind:'spelling',result:'correct',wordKey:'cup',credit:1,at:Date.now()});
   t.objectStore('meta').put({total:1,statistics:{spelling:1},milestones:[]},'account');t.oncomplete=()=>resolve();t.onerror=t.onabort=()=>reject(t.error);
  });db.close();
 },originals);
 await page.reload();
 await page.goto('/piclex-web/#/deck/'+records[1].id);
 await expect(page.getByRole('heading',{name:'桌子',exact:true})).toBeVisible();
 await expect(page.getByRole('textbox',{name:'输入英文',exact:true})).toHaveValue('ta');
 await expect(page.getByRole('button',{name:'等级 LV0，1 经验',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'当前卡组，学习设置'}).click();
 const picker=page.getByRole('group',{name:'切换卡组'});
 await expect(picker.locator(`[data-deck-id="${defaultID}"]`)).toHaveCount(1);
 await expect(picker.locator(`[data-deck-id="${defaultID}"]`)).toHaveAccessibleName('我的照片卡组');
 await expect(picker.locator(`[data-deck-id="${customID}"]`)).toHaveAccessibleName('旅行卡组');
 await expect(picker.locator(`[data-deck-id="${importedID}"]`)).toHaveAccessibleName('我的照片卡组');
 await expect(picker.getByRole('button',{name:'我的照片卡组',exact:true})).toHaveCount(2);
 await page.getByRole('button',{name:'关闭',exact:true}).click();
 await page.getByRole('button',{name:'选择照片',exact:true}).click();
 const gallery=page.getByRole('dialog',{name:'选择照片'});
 await expect(gallery.getByRole('button',{name:/^照片 \d+$/})).toHaveCount(2);
 await gallery.getByRole('button',{name:'照片 2',exact:true}).click();
 await page.getByRole('button',{name:'当前卡组，学习设置'}).click();
 await picker.locator(`[data-deck-id="${customID}"]`).click();
 await expect(page.getByRole('heading',{name:'火车',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'当前卡组，学习设置'}).click();
 await picker.locator(`[data-deck-id="${importedID}"]`).click();
 await expect(page.getByRole('heading',{name:'书',exact:true})).toBeVisible();
 const after=await stored(page);
 for(const record of records)expect(after.find(item=>item.id===record.id)).toEqual(before.find(item=>item.id===record.id));
 await expect(page.getByRole('button',{name:'等级 LV0，1 经验',exact:true})).toBeVisible();
 for(const state of originals)expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!), 'piclex-web.study.v2.'+state.fingerprint)).toEqual(state);
});

test('editing a captured photo reuses its slot instead of appending a duplicate',async({page})=>{
 await page.route(api,route=>route.fulfill({status:200,headers:{'Access-Control-Allow-Origin':'*'},json:{labels:[labels[0]],quote:null,quota}}));
 await page.goto('/piclex-web/#/capture');
 await importAndReview(page);
 await page.getByRole('button',{name:'编辑卡片',exact:true}).click();
 await expect(page.getByRole('form',{name:'编辑照片卡片'})).toBeVisible();
 await page.getByLabel('中文释义',{exact:true}).fill('茶杯');
 await page.getByRole('button',{name:'保存修改',exact:true}).click();
 await expect(page.getByRole('button',{name:'开练',exact:true})).toBeVisible();
 expect(await stored(page)).toHaveLength(1);
 await page.getByRole('button',{name:'开练',exact:true}).click();
 await expect(page.getByRole('heading',{name:'茶杯',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'选择照片',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'选择照片'}).getByRole('button',{name:/^照片 \d+$/})).toHaveCount(1);
 await page.getByRole('button',{name:'关闭',exact:true}).click();
 await page.reload();
 await expect(page.getByRole('heading',{name:'茶杯',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'选择照片',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'选择照片'}).getByRole('button',{name:/^照片 \d+$/})).toHaveCount(1);
});


test('camera capture and an upload share the default photo group',async({page})=>{
 let requests=0;await page.route(api,route=>route.fulfill({json:{labels:[labels[requests++]],quote:null,quota}}));
 await page.goto('/piclex-web/#/capture');await importAndReview(page);await page.getByRole('button',{name:'继续拍摄',exact:true}).click();
 await page.evaluate(()=>{
  const canvas=document.createElement('canvas');canvas.width=320;canvas.height=400;
  const ctx=canvas.getContext('2d')!;ctx.fillStyle='green';ctx.fillRect(0,0,320,400);const stream=canvas.captureStream(15);
  const draw=()=>{ctx.fillRect(0,0,320,400);if(stream.getTracks()[0].readyState==='live')requestAnimationFrame(draw);};requestAnimationFrame(draw);
  Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>stream}});
 });
 await page.getByRole('button',{name:'打开相机',exact:true}).click();await expect(page.getByRole('button',{name:'拍下这张照片'})).toBeEnabled();await page.getByRole('button',{name:'拍下这张照片'}).click();
 await reviewSettled(page);await page.getByRole('button',{name:'开练',exact:true}).click();await expect(page.getByRole('heading',{name:'桌子',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'选择照片',exact:true}).click();await expect(page.getByRole('dialog',{name:'选择照片'}).getByRole('button',{name:/^照片 \d+$/})).toHaveCount(2);
});
