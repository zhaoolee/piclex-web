import {test,expect} from '@playwright/test';
import {source,entry,open,install} from './helpers/subscriptions';

// Keep appearance/reload checks independent of the continuous cancellation flow.
test('subscription links expand, copy and fit light and dark themes after reload at 320px',async({page},info)=>{
 await page.setViewportSize({width:320,height:700});await install(page);
 const row=page.getByRole('article',{name:entry.title});await open(page);await expect(row).toBeVisible();await expect(row.locator('.subscription-url')).toHaveCount(0);
 const collapsed=(await row.boundingBox())!.height;await row.getByRole('button',{name:'订阅链接',exact:true}).click();await expect(row.locator('.subscription-url')).toHaveText(source);expect((await row.boundingBox())!.height).toBeGreaterThan(collapsed+60);
 await row.getByRole('button',{name:'订阅链接',exact:true}).click();await row.getByRole('button',{name:`复制${entry.title}的订阅链接`}).click();await expect(row.getByText('已复制',{exact:true})).toBeVisible();expect(await page.evaluate(()=>(window as any).__copied)).toBe(source);
 for(const theme of ['light','dark']){await page.evaluate(theme=>localStorage.setItem('piclex-web.theme',theme),theme);await page.reload();await open(page);await expect(row).toBeVisible();await expect(page.locator('html')).toHaveAttribute('data-theme',theme);await page.screenshot({path:info.outputPath(`subscription-${theme}.png`),fullPage:true});expect(await row.evaluate(n=>n.scrollWidth<=n.clientWidth)).toBe(true);}
});
