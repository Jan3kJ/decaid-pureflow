import { expect, test, type Page } from '@playwright/test';
import { mockGateway, type MockGateway } from './mock-gateway';

// The warnings of Decaid's shot feed during a shot, against the mocked gateway: a scale lost
// while a shot with a target weight pours gives a notice on every screen until the shot ends,
// once per shot; an abnormal end gives a popup with Decaid's words, once per shot, with 'close'.

const errors: string[] = [];
let gateway: MockGateway;

test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
  page.on('pageerror', (error) => errors.push(error.message));
  gateway = await mockGateway(page);
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

const NOTICE = 'The scale was lost: stop at weight is off for the rest of this shot. Stop it by hand.';
const notice = (page: Page) => page.getByTestId('scale-lost');
const popup = (page: Page) => page.getByTestId('abnormal-end-dialog');

async function pouring(page: Page) {
  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText('Idle');
  await gateway.replay(page, 0, 0.6);
  await expect(page.getByTestId('home-shot')).toHaveAttribute('data-shot', 'running');
}

test('a scale lost in a shot with a target weight shows the notice on every screen until the shot ends, once', async ({ page }) => {
  await pouring(page);
  await expect(notice(page)).toHaveCount(0);
  gateway.sendScaleLost();
  await expect(notice(page)).toHaveText(NOTICE);
  await expect(notice(page)).toHaveClass(/refused/);
  await page.screenshot({ path: 'docs/product/scale-lost-home.png' });

  // The notice lies inside the screen and leaves the stop button free.
  const at = (await notice(page).boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(at.x).toBeGreaterThanOrEqual(0);
  expect(at.x + at.width).toBeLessThanOrEqual(viewport.width);
  expect(at.y + at.height).toBeLessThanOrEqual(viewport.height);
  const stop = (await page.getByTestId('stop').boundingBox())!;
  const apart = at.x + at.width <= stop.x || stop.x + stop.width <= at.x || at.y + at.height <= stop.y || stop.y + stop.height <= at.y;
  expect(apart).toBe(true);

  // Every frame after it says it too, the scale back or not: still one notice.
  gateway.sendScaleLost();
  await expect(notice(page)).toHaveCount(1);

  // The shot ends: the notice goes, and a late frame of the same shot does not bring it back.
  await gateway.replay(page, 0.6, 1);
  await expect(page.getByTestId('home-shot')).toHaveAttribute('data-shot', 'finished');
  await expect(notice(page)).toHaveCount(0);
  gateway.sendScaleLost();
  await page.waitForTimeout(300);
  await expect(notice(page)).toHaveCount(0);

  // The next shot that loses its scale shows it again.
  await gateway.replay(page, 0, 0.6);
  gateway.sendScaleLost();
  await expect(notice(page)).toHaveText(NOTICE);
});

test('the notice shows on another screen too, and goes with the frame of the finished shot', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText('Idle');
  await page.getByTestId('menu').click();
  await page.getByTestId('open-settings').click();
  await expect(page.getByTestId('settings-content')).toBeVisible();
  // The frame alone: the machine's espresso would bring home, as every start does.
  gateway.sendScaleLost(false, 'elsewhere');
  await expect(notice(page)).toHaveText(NOTICE);
  await page.screenshot({ path: 'docs/product/scale-lost-settings.png' });
  gateway.sendShotState({ shotId: 'elsewhere', state: 'finished', scaleLost: true });
  await expect(notice(page)).toHaveCount(0);
  await expect(page.getByTestId('settings-content')).toBeVisible();
});

test('no notice without a target weight, nor on a machine that stops at the weight itself', async ({ page }) => {
  gateway.workflow.context = { ...gateway.workflow.context, targetYield: 0 };
  await pouring(page);
  gateway.sendScaleLost();
  await page.waitForTimeout(300);
  await expect(notice(page)).toHaveCount(0);

  gateway.workflow.context = { ...gateway.workflow.context, targetYield: 36 };
  await page.reload();
  await expect(page.getByTestId('home-shot')).toHaveAttribute('data-shot', /running|finished/);
  gateway.sendScaleLost(true);
  await page.waitForTimeout(300);
  await expect(notice(page)).toHaveCount(0);
});

test("a shot's abnormal end shows the popup once, with Decaid's words, and 'close' closes it", async ({ page }) => {
  await pouring(page);
  gateway.sendScaleLost();
  await expect(notice(page)).toBeVisible();
  gateway.sendTerminal('disconnected', 'Shot tracking torn down mid-shot');
  await expect(popup(page)).toBeVisible();
  await expect(page.getByTestId('abnormal-end-text')).toHaveText('The shot ended abnormally: Shot tracking torn down mid-shot.');
  await expect(popup(page).getByRole('button')).toHaveText(['close']);
  // The shot has ended: the notice of its lost scale goes with it.
  await expect(notice(page)).toHaveCount(0);
  await page.screenshot({ path: 'docs/product/abnormal-end.png' });
  await page.getByTestId('abnormal-end-close').click();
  await expect(popup(page)).toHaveCount(0);

  // The same shot's terminal again: no second popup.
  gateway.sendTerminal('disconnected', 'Shot tracking torn down mid-shot');
  await page.waitForTimeout(300);
  await expect(popup(page)).toHaveCount(0);
});

test('without details the popup says the reason, and Escape closes it', async ({ page }) => {
  await pouring(page);
  gateway.sendTerminal('disconnected');
  await expect(page.getByTestId('abnormal-end-text')).toHaveText("The shot ended abnormally: the machine's connection was lost.");
  await page.keyboard.press('Escape');
  await expect(popup(page)).toHaveCount(0);

  gateway.sendTerminal('error', null, 'another-shot');
  await expect(page.getByTestId('abnormal-end-text')).toHaveText('The shot ended abnormally.');
  await page.keyboard.press('Escape');
  await expect(popup(page)).toHaveCount(0);
});

test('no popup and no notice for an ordinary shot', async ({ page }) => {
  await pouring(page);
  gateway.sendStop('targetWeight');
  await gateway.replay(page, 0.6, 1);
  await expect(page.getByTestId('home-shot')).toHaveAttribute('data-shot', 'finished');
  await page.waitForTimeout(300);
  await expect(popup(page)).toHaveCount(0);
  await expect(notice(page)).toHaveCount(0);
});
