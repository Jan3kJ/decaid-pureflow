import { expect, test, type Locator, type Page } from '@playwright/test';
import type { Profile } from '../src/api';
import plugin12 from '../src/aflow/fixtures/plugin-1.2.json' with { type: 'json' };
import { mockGateway, record } from './mock-gateway';
import { toPage } from './touch';

// The pressed light of a button, against a mocked gateway: a glow while the finger is down that
// fades out over about 0.35 s after it lifts, on a plain button, a primary one and a stop; a chip
// keeps its own press look; a disabled button and a selected pill take none.

const errors: string[] = [];

test.use({ viewport: { width: 1280, height: 800 } });

test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
  page.on('pageerror', (error) => errors.push(error.message));
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

const shadow = (locator: Locator) => locator.evaluate((node) => getComputedStyle(node).boxShadow);

/** Holds the pointer on the button, then lets go: the light must show, fade and be gone. */
async function glows(page: Page, button: Locator, away = { x: 1, y: 1 }) {
  await expect(button).toBeEnabled();
  expect(await shadow(button)).toBe('none');
  // From the release on, the page itself samples the light on every frame: a busy test machine
  // delays this script's own waits, not the page's clock.
  await button.evaluate((node) => {
    const samples: { at: number; shadow: string }[] = [];
    (window as unknown as { samples: typeof samples }).samples = samples;
    addEventListener(
      'mouseup',
      () => {
        const start = performance.now();
        const sample = () => {
          const at = performance.now() - start;
          samples.push({ at, shadow: getComputedStyle(node).boxShadow });
          if (at < 700) requestAnimationFrame(sample);
        };
        sample();
      },
      { once: true, capture: true },
    );
  });
  const box = (await button.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  expect(await shadow(button)).not.toBe('none');
  // Let go beside the button: nothing is done, so it stays to be read.
  await page.mouse.move(away.x, away.y);
  await page.mouse.up();
  await page.waitForFunction(() => (window as unknown as { samples: { at: number }[] }).samples.at(-1)!.at >= 700);
  const samples = await page.evaluate(() => (window as unknown as { samples: { at: number; shadow: string }[] }).samples);
  // Lit for the first 150 ms, gone by 600 ms.
  const early = samples.filter((sample) => sample.at <= 150);
  expect(early.length).toBeGreaterThan(0);
  expect(early.map((sample) => sample.shadow)).not.toContain('none');
  const late = samples.filter((sample) => sample.at >= 600);
  expect(late.length).toBeGreaterThan(0);
  expect(new Set(late.map((sample) => sample.shadow))).toEqual(new Set(['none']));
}

test("'set timer' glows while it is held and fades after", async ({ page }) => {
  const gateway = await mockGateway(page);
  await page.goto('/');
  await toPage(page, 'steam');
  gateway.putOnScale(525);
  await glows(page, page.getByTestId('steam-set-timer'));
});

test("a dialog's close glows while it is held and fades after", async ({ page }) => {
  const gateway = await mockGateway(page);
  gateway.decaidSettings.blockOnNoScale = true;
  gateway.connectScale(false);
  await page.goto('/');
  await expect(page.getByTestId('state-scale')).toHaveText(/looking for it|not connected/);
  gateway.blockedStart();
  // Let go over the dialog's text, not the scrim, which would cancel it.
  const text = (await page.getByTestId('no-scale-text').boundingBox())!;
  await glows(page, page.getByTestId('no-scale-close'), { x: text.x + 4, y: text.y + 4 });
});

test("the editor's save glows while it is held and fades after", async ({ page }) => {
  const old = { ...(plugin12.find((p) => p.title === 'A-Flow / default-very-dark') as Profile), title: 'A-Flow / my very dark' };
  const gateway = await mockGateway(page);
  gateway.profiles.push(record('profile:old', old, { source: 'user' }));
  gateway.workflow.profile = old;
  await page.addInitScript(() => localStorage.setItem('pureflow.screen', 'editor'));
  await page.goto('/');
  await glows(page, page.getByTestId('save'));
});

test('the stop glows while it is held and fades after', async ({ page }) => {
  const gateway = await mockGateway(page);
  await page.goto('/');
  await gateway.replay(page, 0, 0.6);
  await expect(page.getByTestId('stop')).toBeEnabled();
  await glows(page, page.getByTestId('stop'));
});

test('a chip keeps its own press look', async ({ page }) => {
  await mockGateway(page);
  await page.goto('/');
  await toPage(page, 'steam');
  const chip = page.getByTestId('steam-favourite').nth(1);
  const box = (await chip.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  // The chip's own light, with no fade of the shared rule.
  expect(await shadow(chip)).not.toBe('none');
  expect(await chip.evaluate((node) => getComputedStyle(node).transitionDuration)).toBe('0s');
  await page.mouse.move(1, 1);
  await page.mouse.up();
});

test('a selected pill takes no light of the shared rule', async ({ page }) => {
  const old = { ...(plugin12.find((p) => p.title === 'A-Flow / default-very-dark') as Profile), title: 'A-Flow / my very dark' };
  const gateway = await mockGateway(page);
  gateway.profiles.push(record('profile:old', old, { source: 'user' }));
  gateway.workflow.profile = old;
  await page.addInitScript(() => localStorage.setItem('pureflow.screen', 'editor'));
  await page.goto('/');
  const pill = page.getByTestId('mode-simple');
  await expect(pill).toHaveAttribute('aria-pressed', 'true');
  const selected = await shadow(pill);
  const box = (await pill.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  expect(await shadow(pill)).toBe(selected);
  expect(await pill.evaluate((node) => getComputedStyle(node).transitionDuration)).toBe('0s');
  await page.mouse.move(1, 1);
  await page.mouse.up();
});

test('a disabled button takes no light', async ({ page }) => {
  await mockGateway(page);
  await page.goto('/');
  await toPage(page, 'steam');
  const button = page.getByTestId('steam-set-timer');
  await expect(button).toBeDisabled();
  const box = (await button.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  expect(await shadow(button)).toBe('none');
  await page.mouse.up();
});
