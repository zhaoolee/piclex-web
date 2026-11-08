import {expect,test,type Locator,type Page} from '@playwright/test';
import path from 'node:path';
import {fillSpelling} from './helpers/spelling';

const cafe=path.resolve('tests/fixtures/demo/decks/cafe.piclexdeck');
const travel=path.resolve('tests/fixtures/demo/decks/travel.piclexdeck');
const cafeTitle='咖啡馆的早晨',travelTitle='下一站，出发';
const heads={header:'.native-header',battery:'.practice-progress-battery',level:'.practice-level-target',deck:'.practice-deck-target',xp:'.practice-experience-target .learning-experience',lane:'.practice-deck-lane',title:'.practice-deck-lane > span',arrow:'.practice-deck-lane > i'};
type Box={x:number;y:number;width:number;height:number};
type Geometry=Record<string,Box>;

async function prepare(page:Page,theme:'light'|'dark'){
 await page.addInitScript(theme=>localStorage.setItem('piclex-web.theme',theme),theme);
 // System speech is isolated here, independently of the browser's --mute-audio flag.
 await page.addInitScript(()=>{
  const w=window as any;w.__deckProgressSpeech=0;
  // These visual tests do not assert autoplay policy; retain native playback events silently.
  const play=HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play=function(){this.volume=0;return play.call(this);};
  Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{paused:false,speaking:false,pending:false,getVoices:()=>[],speak:(utterance:any)=>{w.__deckProgressSpeech++;queueMicrotask(()=>utterance.onend?.());},cancel:()=>{},pause:()=>{},resume:()=>{},addEventListener:()=>{},removeEventListener:()=>{}}});
 });
}

async function importDeck(page:Page,file:string,heading:string){
 await page.goto('/piclex-web/#/decks');
 await expect(page.getByRole('button',{name:'导入自己的卡组',exact:true})).toBeEnabled();
 await page.getByLabel('选择照片卡组文件').setInputFiles(file);
 await expect(page.getByRole('heading',{name:heading,exact:true})).toBeVisible();
 await page.getByRole('button',{name:'关闭提示',exact:true}).click();
}

async function geometry(page:Page):Promise<Geometry>{
 const result:Geometry={};
 for(const [name,selector] of Object.entries(heads)){
  const box=await page.locator(selector).boundingBox();
  expect(box,`${name} geometry`).not.toBeNull();
  result[name]=box!;
 }
 return result;
}

function expectSameGeometry(before:Geometry,after:Geometry){
 for(const key of Object.keys(before)){
  expect(Math.abs(before[key].x-after[key].x),`${key} x`).toBeLessThanOrEqual(.5);
  expect(Math.abs(before[key].y-after[key].y),`${key} y`).toBeLessThanOrEqual(.5);
  expect(Math.abs(before[key].width-after[key].width),`${key} width`).toBeLessThanOrEqual(.5);
  expect(Math.abs(before[key].height-after[key].height),`${key} height`).toBeLessThanOrEqual(.5);
 }
}

const ratioOf=(lane:Locator)=>lane.evaluate(el=>Number(getComputedStyle(el).getPropertyValue('--deck-progress')));
const backgroundOf=(lane:Locator)=>lane.evaluate(el=>getComputedStyle(el).backgroundImage);
const durationOf=(lane:Locator)=>lane.evaluate(el=>getComputedStyle(el).transitionDuration);
const distance=(a:number[],b:number[])=>a.slice(0,3).reduce((sum,value,index)=>sum+Math.abs(value-b[index]),0);

async function lanePixels(page:Page,points:{body:number;beyond:number;edge:number}){
 const lane=page.locator('.practice-deck-lane');
 await expect(page.locator('canvas.experience-particles')).toHaveCount(0,{timeout:10_000});
 await lane.evaluate(el=>el.querySelectorAll('span,i').forEach(node=>((node as HTMLElement).style.visibility='hidden')));
 try{
  const png=await lane.screenshot();
  return await page.evaluate(async ({png,points})=>{
   const image=new Image();image.src='data:image/png;base64,'+png;await image.decode();
   const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
   const context=canvas.getContext('2d');if(!context)throw new Error('Canvas 2D unavailable');
   context.drawImage(image,0,0);
   const y=Math.floor(canvas.height/2);
   const sample=(fraction:number)=>Array.from(context.getImageData(Math.max(0,Math.min(canvas.width-1,Math.floor(canvas.width*fraction))),y,1,1).data);
   return {body:sample(points.body),beyond:sample(points.beyond),edge:sample(points.edge)};
  },{png:png.toString('base64'),points});
 }finally{
  await lane.evaluate(el=>el.querySelectorAll('span,i').forEach(node=>((node as HTMLElement).style.visibility='')));
 }
}

for(const theme of ['light','dark'] as const)test(`deck lane shows real traversal without moving the header in ${theme}`,async({page})=>{
 await prepare(page,theme);
 await importDeck(page,cafe,'牛角包');
 await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
 const lane=page.locator('.practice-deck-lane'),title=lane.locator('span'),arrow=lane.locator('i');
 await expect(title).toHaveText(cafeTitle);await expect(arrow).toHaveText('▾');
 const baseline=await geometry(page),baseBackground=await backgroundOf(lane),width=(await lane.boundingBox())!.width;
 expect(await ratioOf(lane)).toBeCloseTo(0,3);expect(await durationOf(lane)).toBe('0.25s');
 const empty=await lanePixels(page,{body:.08,beyond:.30,edge:.95});
 expect(distance(empty.body,empty.beyond)).toBeLessThan(3);

 await fillSpelling(page,'croissant');
 await expect(page.getByRole('heading',{name:'勺子',exact:true})).toBeVisible();
 const progress=1/6;
 await expect.poll(()=>ratioOf(lane)).toBeCloseTo(progress,3);
 await expect.poll(()=>backgroundOf(lane)).not.toBe(baseBackground);
 await page.waitForTimeout(300);
 const filled=await lanePixels(page,{body:.08,beyond:.30,edge:progress-.5/width});
 const bodyDistance=distance(filled.body,filled.beyond);
 expect(bodyDistance).toBeGreaterThan(12);
 expect(distance(filled.edge,filled.beyond)).toBeLessThan(bodyDistance);
 expectSameGeometry(baseline,await geometry(page));
 await expect(title).toHaveText(cafeTitle);await expect(arrow).toHaveText('▾');

 for(const tab of ['练听力','练口语']){
  await page.getByRole('tab',{name:tab,exact:true}).click();
  await expect(page.getByRole('tab',{name:tab,exact:true})).toHaveAttribute('aria-selected','true');
  await expect.poll(()=>ratioOf(lane)).toBeCloseTo(progress,3);
 }
 await page.getByRole('tab',{name:'拼单词',exact:true}).click();
 await expect.poll(()=>ratioOf(lane)).toBeCloseTo(progress,3);
 expectSameGeometry(baseline,await geometry(page));

 await page.reload();
 await expect(page.getByRole('textbox',{name:'输入英文',exact:true})).toBeVisible();
 await expect.poll(()=>ratioOf(lane)).toBeCloseTo(progress,3);
 expectSameGeometry(baseline,await geometry(page));
});

test('switching decks and reload preserve the original deck ratio',async({page})=>{
 await prepare(page,'light');
 await importDeck(page,cafe,'牛角包');
 const lane=page.locator('.practice-deck-lane'),cafeID=decodeURIComponent(new URL(page.url()).hash.replace(/^#\/deck\//,'').split('?')[0]);
 const baseline=await geometry(page);
 await fillSpelling(page,'croissant');
 await expect.poll(()=>ratioOf(lane)).toBeCloseTo(1/6,3);
 const progressed=await geometry(page);

 await importDeck(page,travel,'护照');
 await expect(lane.locator('span')).toHaveText(travelTitle);
 await expect.poll(()=>ratioOf(lane)).toBeCloseTo(0,3);
 await page.getByRole('button',{name:'当前卡组，学习设置',exact:true}).click();
 const picker=page.getByRole('group',{name:'切换卡组',exact:true});
 await expect(picker.locator(`[data-deck-id="${cafeID}"]`)).toHaveAttribute('aria-pressed','false');
 await picker.locator(`[data-deck-id="${cafeID}"]`).click();
 await expect(page).toHaveURL(new RegExp(`/deck/${cafeID}(?:\\?|$)`));
 await expect(page.getByRole('heading',{name:'勺子',exact:true})).toBeVisible();
 await expect(lane.locator('span')).toHaveText(cafeTitle);
 await expect.poll(()=>ratioOf(lane)).toBeCloseTo(1/6,3);
 expectSameGeometry(progressed,await geometry(page));

 await page.reload();
 await expect(page.getByRole('heading',{name:'勺子',exact:true})).toBeVisible();
 await expect.poll(()=>ratioOf(lane)).toBeCloseTo(1/6,3);
 expectSameGeometry(baseline,await geometry(page));
});

test('deck lane respects reduced motion and reaches empty and completed bounds',async({page})=>{
 await prepare(page,'light');
 await importDeck(page,cafe,'牛角包');
 const lane=page.locator('.practice-deck-lane'),input=page.getByRole('textbox',{name:'输入英文',exact:true});
 expect(await durationOf(lane)).toBe('0.25s');
 await page.emulateMedia({reducedMotion:'reduce'});
 await expect.poll(()=>durationOf(lane)).toBe('0s');

 const width=(await lane.boundingBox())!.width,points={body:1-4/width,beyond:.30,edge:1-.5/width};
 const empty=await lanePixels(page,points);
 expect(await ratioOf(lane)).toBeCloseTo(0,3);

 for(const word of ['croissant','spoon','fork','plate','lemon','table']){
  await fillSpelling(page,word);
  if(word!=='table')await expect(input).toHaveValue('');
 }
 await expect(page.getByRole('heading',{name:'本轮训练完成',exact:true})).toBeVisible();
 await expect.poll(()=>ratioOf(lane)).toBeCloseTo(1,3);
 const full=await lanePixels(page,points),bodyDistance=distance(full.body,empty.body);
 expect(bodyDistance).toBeGreaterThan(12);
 expect(distance(full.edge,empty.edge)).toBeLessThan(bodyDistance);

 await page.getByRole('button',{name:'再来一轮',exact:true}).click();
 await expect(input).toBeVisible();
 await expect.poll(()=>ratioOf(lane)).toBeCloseTo(0,3);
});
