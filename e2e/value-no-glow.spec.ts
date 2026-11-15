import { expect, test, type Page } from '@playwright/test';
import { mockGateway } from './mock-gateway';
import { toPage } from './touch';

// A number the skin only shows has no glow: the computed text-shadow of every shown value is none, idle and
// while it runs, and the header's. What the user acts on keeps its glow: the number pad's field and the lit line.

test.use({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });

const shadow = (page: Page, testid: string) =>
  page
    .getByTestId(testid)
    .first()
    .evaluate((element) => getComputedStyle(element).textShadow);

async function expectNone(page: Page, testids: string[]) {
  for (const testid of testids) {
    await expect(page.getByTestId(testid).first()).toBeVisible();
    expect(await shadow(page, testid), testid).toBe('none');
  }
}

/** Every element under the header, with a text of its own, has no text shadow. */
async function headerIsPlain(page: Page) {
  const glowing = await page.getByTestId('status').evaluate((status) => {
    const header = status.closest('header') ?? status.parentElement!;
    return [header, ...header.querySelectorAll('*')]
      .filter((element) => getComputedStyle(element).textShadow !== 'none')
      .map((element) => element.getAttribute('data-testid') ?? element.tagName);
  });
  expect(glowing).toEqual([]);
}

const HOME = ['shot-timer', 'shot-weight', 'shot-pressure', 'shot-flow', 'shot-temperature'];

test('home values and the header have no glow, idle and during a shot', async ({ page }) => {
  const gateway = await mockGateway(page);
  await page.goto('/');
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'Idle');
  await expectNone(page, HOME);
  await headerIsPlain(page);

  await gateway.replay(page, 0, 0.6);
  await expect(page.getByTestId('home-shot')).toHaveAttribute('data-shot', 'running');
  await expectNone(page, HOME);
  await headerIsPlain(page);
});

test('the steam timer has no glow, idle and running, nor its scale values', async ({ page }) => {
  const gateway = await mockGateway(page);
  gateway.putOnScale(0);
  await page.goto('/');
  await toPage(page, 'steam');
  await expectNone(page, ['steam-timer', 'steam-weight']);
  gateway.steamReplay(0);
  await expect(page.getByTestId('steam-state')).toContainText('last steam');
  await expectNone(page, ['steam-timer', 'steam-weight']);
  await headerIsPlain(page);
});

test("hot water's 'last shot' and 'scale' have no glow; the lit line and the number pad's field keep theirs", async ({ page }) => {
  const gateway = await mockGateway(page);
  gateway.putOnScale(0);
  await page.goto('/');
  await toPage(page, 'hot-water');
  await expectNone(page, ['hot-water-last-shot', 'hot-water-scale']);
  for (const testid of ['hot-water-last-shot', 'hot-water-scale']) {
    const glowing = await page
      .getByTestId(testid)
      .evaluate((root) => [root, ...root.querySelectorAll('*')].filter((e) => getComputedStyle(e).textShadow !== 'none').length);
    expect(glowing, testid).toBe(0);
  }

  const number = page.getByTestId('hot-water-time');
  await number.click();
  const lit = await number.evaluate((root) =>
    [root, ...root.querySelectorAll('*')].some((e) => getComputedStyle(e).textShadow !== 'none'),
  );
  expect(lit).toBe(true);
  await number.click();
  await expect(page.getByTestId('numpad')).toBeVisible();
  expect(await shadow(page, 'numpad-display')).not.toBe('none');
});
