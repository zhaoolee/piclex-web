import { expect, test, type Locator, type Page } from '@playwright/test';
import { SurvivalGame } from '../../packages/laboratory/src/engine.mjs';
import { captureRun, readRun } from '../../packages/laboratory/src/run-state.mjs';
import { starterWords } from '../../packages/laboratory/src/words.mjs';

const runKey = 'piclex.lab.run.v1';

async function project(frame: Locator, x: number, y: number) {
  const rect = (await frame.boundingBox())!;
  // The iframe's logical right and down point along the outer viewport's
  // down and left. Send trusted input through the top-level browser.
  return { x: rect.x + rect.width - y, y: rect.y + x };
}

async function pressGame(page: Page, frame: Locator, hasTouch: boolean, control: Locator) {
  await expect(control).toBeVisible();
  const center = await control.evaluate(el => {
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  const point = await project(frame, center.x, center.y);
  if (hasTouch) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
}

test('a tall viewport presents a playable game along its long edge', async ({ page, browserName, hasTouch }, info) => {
  const portrait = { width: 390, height: 780 };
  await page.setViewportSize(portrait);

  let frameLoads = 0;
  page.on('framenavigated', frame => {
    if (frame.parentFrame() && new URL(frame.url()).pathname.endsWith('/lab/index.html')) frameLoads++;
  });
  await page.goto('/piclex-web/#/settings/lab');
  const frame = page.locator('iframe[title="薯薯求生"]');
  const game = frame.contentFrame();
  const start = game.getByRole('button', { name: '开始冒险', exact: true });
  const pause = game.getByRole('button', { name: '暂停', exact: true });
  const paused = game.getByRole('heading', { name: '已暂停', exact: true });
  const tabs = page.getByRole('navigation', { name: '底部导航' });

  async function expectLandscapeFrame(width: number, height: number) {
    await expect.poll(() => game.locator('html').evaluate(el => ({
      width: innerWidth,
      height: innerHeight,
      scrollWidth: el.scrollWidth,
      scrollHeight: el.scrollHeight,
      landscape: matchMedia('(orientation:landscape)').matches,
    }))).toEqual({ width, height, scrollWidth: width, scrollHeight: height, landscape: true });
    await expect(game.locator('#rotate-device')).toBeHidden();
  }

  await expect(frame).toBeVisible();
  expect(await frame.boundingBox()).toEqual({ x: 0, y: 0, ...portrait });
  await expectLandscapeFrame(portrait.height, portrait.width);
  expect(await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight])).toEqual([portrait.width, portrait.height]);
  await expect(tabs).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('locked-portrait-game.png') });

  await pressGame(page, frame, hasTouch, game.getByRole('button', { name: /^成就与解锁/ }));
  await expect(game.getByRole('heading', { name: '成就与解锁' })).toBeVisible();
  await pressGame(page, frame, hasTouch, game.locator('#achievement-next'));
  await expect(game.locator('.page-controls')).toContainText('2 /');
  await pressGame(page, frame, hasTouch, game.locator('#close-achievements'));
  await pressGame(page, frame, hasTouch, start);
  await expect(pause).toBeVisible();

  const playerX = async () => readRun(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), runKey))?.player.x;
  const initialX = await playerX();
  expect(initialX).toBeGreaterThan(0);
  const stage = game.locator('#stage');
  const waitForMotionFrame = () => stage.evaluate(() => new Promise<void>(resolve =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  ));

  if (hasTouch) {
    const origin = await stage.evaluate(el => {
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    const from = await project(frame, origin.x, origin.y);
    const to = await project(frame, origin.x + 70, origin.y);
    const cdp = browserName === 'chromium' ? await page.context().newCDPSession(page) : null;
    try {
      if (cdp) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [to] });
      } else {
        await page.mouse.move(from.x, from.y);
        await page.mouse.down();
        await page.mouse.move(to.x, to.y, { steps: 4 });
      }
      await expect(game.locator('#joystick')).toHaveClass(/active/);
      await expect(game.locator('#stick')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 27, 0)');
      await waitForMotionFrame();
    } finally {
      if (cdp) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await cdp.detach();
      } else await page.mouse.up();
    }
    await expect(game.locator('#joystick')).not.toHaveClass(/active/);
  } else {
    await page.keyboard.down('ArrowRight');
    try {
      await waitForMotionFrame();
    } finally {
      await page.keyboard.up('ArrowRight');
    }
  }
  await pressGame(page, frame, hasTouch, pause);
  await expect(paused).toBeVisible();
  expect(await playerX()).toBeGreaterThan(initialX);

  await page.setViewportSize({ width: 780, height: 390 });
  await expectLandscapeFrame(780, 390);
  await expect(frame).toHaveCSS('transform', 'none');
  await expect(paused).toBeVisible();
  await page.screenshot({ path: info.outputPath('actual-landscape-game.png') });
  await page.setViewportSize({ width: 390, height: 700 });
  await expectLandscapeFrame(700, 390);
  await expect(paused).toBeVisible();
  expect(frameLoads).toBe(1);

  await pressGame(page, frame, hasTouch, game.getByRole('button', { name: '返回实验室', exact: true }));
  await expect(frame).toHaveCount(0);
  await expect(tabs).toBeVisible();
  await page.getByRole('button', { name: '薯薯求生', exact: true }).click();
  await pressGame(page, frame, hasTouch, game.getByRole('button', { name: /^继续冒险 · 第 1 波/ }));
  await expect(pause).toBeVisible();
});

test('the spelling dialog accepts input on a short rotated game surface', async ({ page, hasTouch }, info) => {
  await page.setViewportSize({ width: 320, height: 600 });

  const checkpoint = new SurvivalGame({ words: starterWords, random: () => .32 });
  checkpoint.startWave();
  checkpoint.coins = 500;
  checkpoint.enterShop();
  await page.addInitScript(({ key, value }) => {
    if (window === window.top) localStorage.setItem(key, value);
  }, { key: runKey, value: JSON.stringify(captureRun(checkpoint)) });

  await page.goto('/piclex-web/#/settings/lab');
  const frame = page.locator('iframe[title="薯薯求生"]');
  await expect(frame).toBeVisible();
  const game = frame.contentFrame();
  await pressGame(page, frame, hasTouch, game.getByRole('button', { name: /^继续冒险 · 第 1 波/ }));
  await expect(game.getByRole('heading', { name: '路边小店' })).toBeVisible();
  await pressGame(page, frame, hasTouch, game.locator('button[data-offer]').first());
  const dialog = game.locator('#spelling');
  await expect(dialog).toBeVisible();
  const bounds = await dialog.evaluate(el => {
    const r = el.getBoundingClientRect();
    return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
  });
  expect(bounds).toBe(true);
  const filled = dialog.locator('#letter-board [data-letter]');
  const before = await filled.count();
  await pressGame(page, frame, hasTouch, dialog.locator('#letter-bank button').first());
  await expect(filled).toHaveCount(before + 1);
  await page.screenshot({ path: info.outputPath('locked-portrait-spelling.png') });
  await pressGame(page, frame, hasTouch, dialog.getByRole('button', { name: '暂时返回商店' }));
  await expect(dialog).toBeHidden();
  await expect(game.getByRole('heading', { name: '路边小店' })).toBeVisible();
});


test('the long edge follows the game area even inside a wide browser window', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 850 });
  await page.goto('/piclex-web/#/settings/lab');
  const area = page.locator('.laboratory-page');
  const frame = area.locator('iframe');
  const game = frame.contentFrame();
  await expect(frame).toBeVisible();

  for (const { width, height } of [{ width: 390, height: 780 }, { width: 520, height: 520 }, { width: 780, height: 390 }]) {
    await area.evaluate((el, size) => {
      el.style.width = `${size.width}px`;
      el.style.height = `${size.height}px`;
    }, { width, height });
    await expect.poll(() => game.locator('html').evaluate(() => [innerWidth, innerHeight])).toEqual([
      Math.max(width, height), Math.min(width, height),
    ]);
    expect(await frame.boundingBox()).toEqual({ x: 0, y: 0, width, height });
    await expect(frame).toHaveCSS('transform', height > width ? `matrix(0, 1, -1, 0, ${width}, 0)` : 'none');
    await expect(game.locator('#rotate-device')).toBeHidden();
    await expect(game.getByRole('button', { name: '开始冒险', exact: true })).toBeVisible();
  }
  expect(page.viewportSize()).toEqual({ width: 1000, height: 850 });
});
