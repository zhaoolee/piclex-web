import {test,expect,type Page} from '@playwright/test';
import path from 'node:path';
async function viewport(page:Page){
 await page.setViewportSize({width:393,height:852});
 await page.addInitScript(()=>{
  const w=window as any,v=window.visualViewport!;w.__viewport={height:668,width:393,offsetTop:0,offsetLeft:0,scale:1};w.__unsafeFocus=[];
  for(const name of Object.keys(w.__viewport))Object.defineProperty(v,name,{configurable:true,get:()=>w.__viewport[name]});
  w.__moveViewport=(next:any,event='resize')=>{Object.assign(w.__viewport,next);v.dispatchEvent(new Event(event));};
  const focus=HTMLElement.prototype.focus;HTMLElement.prototype.focus=function(options){if(this.matches('.spelling-input,.guided-input input')&&!options?.preventScroll)w.__unsafeFocus.push(this.className);return focus.call(this,options);};
 });
 await page.goto('/piclex-web/#/decks');await expect(page.getByRole('button',{name:'导入自己的卡组',exact:true})).toBeEnabled();await page.getByLabel('选择照片卡组文件').setInputFiles(path.resolve('tests/fixtures/demo/decks/cafe.piclexdeck'));await expect(page.getByRole('textbox',{name:'输入英文',exact:true})).toBeVisible();await page.getByRole('button',{name:'关闭提示',exact:true}).click();
}
async function fit(page:Page){
 await expect(page.locator('.native-header')).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>{
  const v=visualViewport!,nav=document.querySelector('.app-tabs')!.getBoundingClientRect(),header=document.querySelector('.native-header')!.getBoundingClientRect(),tabs=document.querySelector('.module-tabs')!.getBoundingClientRect(),main=document.querySelector('.native-practice')!.getBoundingClientRect();
  const bottom=v.offsetTop+v.height;
  return {header:header.top>=v.offsetTop-1,modules:tabs.bottom<=bottom,nav:Math.abs(bottom-nav.bottom-12)<2,joined:Math.abs(nav.top-main.bottom-12)<2,outer:Math.abs(main.top-v.offsetTop)<2,keyboard:[...document.querySelectorAll('.virtual-keyboard button')].every(n=>{const b=n.getBoundingClientRect();return b.top>=v.offsetTop&&b.bottom<=nav.top&&b.right<=v.offsetLeft+v.width;})};
 })).toEqual({header:true,modules:true,nav:true,joined:true,outer:true,keyboard:true});
}
test('learning header, input and tabs share the moving visual viewport instead of the layout viewport',async({page},info)=>{
 await viewport(page);await fit(page);
 for(const change of [{height:668,offsetTop:124,event:'scroll'},{height:430,offsetTop:64,event:'resize'},{height:712,offsetTop:0,event:'scroll'},{height:668,offsetTop:0,event:'resize'}]){
  await page.evaluate(c=>(window as any).__moveViewport(c,c.event),change);await fit(page);
  const field=page.getByRole('textbox',{name:'输入英文',exact:true});await field.click();await page.getByRole('button',{name:'按键 Z',exact:true}).click();await expect(field).toHaveValue('z');await page.getByRole('button',{name:'退格',exact:true}).click();await fit(page);
 }
 expect(await page.evaluate(()=>(window as any).__unsafeFocus)).toEqual([]);
 await page.screenshot({path:info.outputPath('chrome-bars-spelling.png'),clip:{x:0,y:0,width:393,height:668}});
 await page.getByRole('tab',{name:'练听力',exact:true}).click();await page.getByLabel('句子练习模式').selectOption('free');
 await expect(page.getByLabel('听写难度')).toHaveCount(0);
 await fit(page);const field=page.locator('.guided-input input').first();await field.click();await expect(field).toHaveAttribute('readonly','');await expect(field).toHaveAttribute('inputmode','none');await fit(page);
 await page.getByRole('tab',{name:'拼单词',exact:true}).click();await page.reload();await fit(page);expect(await page.evaluate(()=>(window as any).__unsafeFocus)).toEqual([]);
});
test('viewport ownership handles dialogs, pinch zoom and leaving practice without locking settings',async({page})=>{
 await viewport(page);await page.evaluate(()=>(window as any).__moveViewport({height:430,offsetTop:180},'scroll'));await fit(page);
 await page.getByRole('button',{name:'当前卡组，学习设置',exact:true}).click();const dialog=page.getByRole('dialog');await expect.poll(()=>dialog.evaluate(n=>{const b=n.getBoundingClientRect(),v=visualViewport!;return b.top>=v.offsetTop&&b.bottom<=v.offsetTop+v.height;})).toBe(true);await page.getByRole('button',{name:'关闭',exact:true}).click();await fit(page);
 const before=await page.locator('#root').boundingBox();await page.evaluate(()=>(window as any).__moveViewport({height:215,offsetTop:200,scale:2}));await expect(page.locator('#root')).toHaveCSS('height','430px');expect(await page.locator('#root').boundingBox()).toEqual(before);
 await page.evaluate(()=>(window as any).__moveViewport({height:668,offsetTop:0,scale:1}));await fit(page);
 await page.getByRole('button',{name:'设置',exact:true}).click();await expect(page.locator('html')).not.toHaveAttribute('data-practice');await expect(page.locator('#root')).toHaveCSS('position','static');expect(await page.evaluate(()=>document.documentElement.style.getPropertyValue('--page-vh'))).toBe('');
 await page.getByRole('button',{name:'外观与主题',exact:true}).click();await page.getByRole('button',{name:/内置主题/}).click();await expect(page.getByRole('heading',{name:'内置主题',exact:true})).toBeVisible();await page.setViewportSize({width:393,height:430});await expect.poll(()=>page.evaluate(()=>{scrollTo(0,200);return scrollY;})).toBeGreaterThan(0);
});
