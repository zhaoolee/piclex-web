import {test,expect,type Page} from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import {fillSpelling} from './helpers/spelling';

const cafe=path.resolve('tests/fixtures/demo/decks/cafe.piclexdeck');
const downloadText='下载卡组，在 App 中打开';
const catalog=JSON.parse(fs.readFileSync('apps/public/public/library/catalog.json','utf8'));
const publicCard=catalog[0],publicDeck=JSON.parse(fs.readFileSync('apps/public/public/'+publicCard.payload,'utf8'));

async function seedLevelSix(page:Page){
 await page.evaluate(async()=>{
  const request=indexedDB.open('piclex-web-experience-v1',1);
  request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains('events'))db.createObjectStore('events',{keyPath:'id'});if(!db.objectStoreNames.contains('meta'))db.createObjectStore('meta');};
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  await new Promise<void>((resolve,reject)=>{const transaction=db.transaction('meta','readwrite');transaction.objectStore('meta').put({total:42,statistics:{},milestones:[]},'account');transaction.oncomplete=()=>resolve();transaction.onerror=()=>reject(transaction.error);});
  db.close();window.dispatchEvent(new Event('piclex-experience'));
 });
}

test('spelling completion quick toggle saves the shared preference and restarts on missed characters only',async({page},info)=>{
 await page.goto('/piclex-web/#/decks');
 await page.getByLabel('选择照片卡组文件').setInputFiles(cafe);
 await expect(page.getByRole('heading',{name:'牛角包',exact:true})).toBeVisible();
 await seedLevelSix(page);
 const input=page.getByRole('textbox',{name:'输入英文',exact:true});
 // Mixed round: one clean word, one corrected mistake, one revealed word, then clean words.
 await fillSpelling(page,'croissant');
 await expect(page.getByRole('heading',{name:'勺子',exact:true})).toBeVisible();
 await fillSpelling(page,'spx');
 await expect(page.locator('.native-answer')).toHaveClass(/wrong/);
 await fillSpelling(page,'spoon');
 await expect(page.getByRole('heading',{name:'叉子',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'不认识'}).click();
 await page.getByRole('button',{name:'下一个',exact:true}).click();
 await fillSpelling(page,'plate');
 await fillSpelling(page,'lemon');
 await fillSpelling(page,'table');
 await expect(page.getByRole('heading',{name:'本轮训练完成',exact:true})).toBeVisible();

 const completion=page.locator('.native-completion');
 await expect(completion.getByText(downloadText,{exact:true})).toHaveCount(0);
 const quick=completion.getByRole('switch',{name:'快拼',exact:true});
 await expect(quick).toBeVisible();
 await expect(quick).toBeEnabled();
 await expect(quick).not.toBeChecked();
 await expect(completion.locator('.native-completion-quick small')).toHaveCount(1);
 await expect(completion.locator('.native-completion-quick small')).toHaveText('开启快拼后，只拼写曾经错误的字符');
 await expect(completion).not.toContainText('当前已开启');
 await expect(completion).not.toContainText('当前已关闭');
 await expect(page.locator('canvas.experience-particles')).toHaveCount(0,{timeout:10000});
 if(await page.getByRole('button',{name:'关闭提示',exact:true}).count())await page.getByRole('button',{name:'关闭提示',exact:true}).click();
 await page.screenshot({path:`/work/previews/quick-off-${info.project.name}.png`,fullPage:true});
 await quick.check();
 await expect(quick).toBeChecked();
 await page.waitForTimeout(300);
 await page.screenshot({path:`/work/previews/quick-on-${info.project.name}.png`,fullPage:true});
 await expect(completion.locator('.native-completion-quick small')).toHaveCount(1);
 await expect(completion.locator('.native-completion-quick small')).toHaveText('开启快拼后，只拼写曾经错误的字符');
 await expect(completion).not.toContainText('当前已开启');
 await expect(completion).not.toContainText('当前已关闭');
 expect(await page.evaluate(()=>localStorage.getItem('piclex-web.quick'))).toBe('true');
 const completionURL=page.url();

 // The shortcut is the same personalized setting, not a separate completion-only mode.
 await page.goto('/piclex-web/#/settings/personalization');
 await expect(page.getByRole('switch',{name:'快拼',exact:true})).toBeChecked();
 await page.reload();
 await expect(page.getByRole('switch',{name:'快拼',exact:true})).toBeChecked();

 await page.goto(completionURL);
 await expect(page.getByRole('heading',{name:'本轮训练完成',exact:true})).toBeVisible();
 await expect(page.locator('.native-completion').getByRole('switch',{name:'快拼',exact:true})).toBeChecked();
 await page.getByRole('button',{name:'再来一轮'}).click();
 // Mastered croissant is skipped; the corrected word keeps only its mistaken character.
 await expect(page.getByRole('heading',{name:'勺子',exact:true})).toBeVisible();
 await expect(input).toHaveValue('');
 await expect(page.locator('.letter-slot.empty')).toHaveCount(1);
 await expect(page.locator('.letter-slot.prefilled')).toHaveCount(4);
 await fillSpelling(page,'o');
 await expect(page.getByRole('heading',{name:'叉子',exact:true})).toBeVisible();
});

test('all-mastered completion still offers quick off and restart reopens the deck',async({page})=>{
 const fingerprint=publicDeck.learningFingerprint||publicDeck.fingerprint,words=publicDeck.words;
 const mastered={version:2,fingerprint,index:words.length,round:0,presentation:0,module:'spelling',mode:'chunks',rate:1,difficulty:'hard',quick:true,hiddenChinese:false,
  history:Object.fromEntries(words.map((word:any)=>[word.id,{mastered:true,mistakes:[]}])),
  words:Object.fromEntries(words.map((word:any)=>[word.id,{input:word.english,result:'correct',hadMistake:false,quickIndices:null}])),
  sentences:{},sentenceIndex:0,sentenceFinished:false,pending:null};
 await page.addInitScript(({key,state})=>{try{localStorage.setItem(key,JSON.stringify(state));}catch{}},{key:`piclex-web.study.v2.${fingerprint}`,state:mastered});
 await page.goto('/piclex-web/#/deck/'+publicCard.id);
 await expect(page.getByRole('heading',{name:'本轮训练完成',exact:true})).toBeVisible();
 const completion=page.locator('.native-completion'),quick=completion.getByRole('switch',{name:'快拼',exact:true});
 await expect(completion.getByText(downloadText,{exact:true})).toHaveCount(0);
 await expect(quick).toBeChecked();
 await expect(quick).toBeEnabled();
 await quick.uncheck();
 await expect(quick).not.toBeChecked();
 await expect(completion.locator('.native-completion-quick small')).toHaveCount(1);
 await expect(completion.locator('.native-completion-quick small')).toHaveText('开启快拼后，只拼写曾经错误的字符');
 await expect(completion).not.toContainText('当前已开启');
 await expect(completion).not.toContainText('当前已关闭');
 expect(await page.evaluate(()=>localStorage.getItem('piclex-web.quick'))).toBe('false');
 await page.reload();
 await expect(page.getByRole('heading',{name:'本轮训练完成',exact:true})).toBeVisible();
 await expect(page.locator('.native-completion').getByRole('switch',{name:'快拼',exact:true})).not.toBeChecked();
 await page.getByRole('button',{name:'再来一轮'}).click();
 await expect(page.getByRole('heading',{name:words[0].chinese,exact:true})).toBeVisible();
 await expect(page.getByRole('textbox',{name:'输入英文',exact:true})).toHaveValue('');
});
