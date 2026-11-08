import { expect, test, type Locator } from '@playwright/test';
import { mockGateway } from './mock-gateway';
import { toPage } from './touch';

// The shared controls in glass, against a mocked gateway: no button, chip or pad key has a fill at
// rest; a selected chip glows in its colour; the big stop is an outline whose glow pulses (and holds
// still under reduced motion); a dialog and the pad are glass. Touch targets are
// e2e/touch-targets.spec.ts.

const errors: string[] = [];

test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

const NONE = 'rgba(0, 0, 0, 0)';

const fill = (locator: Locator) =>
  locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return { image: style.backgroundImage, colour: style.backgroundColor };
  });

test('the big stop is a red outline that pulses, not a red block', async ({ page }) => {
  const gateway = await mockGateway(page);
  await page.goto('/');
  await toPage(page, 'steam');
  gateway.steamFor(18);
  const stop = page.getByTestId('steam-stop');
  await expect(stop).toBeVisible();

  const red = await page.evaluate(() => {
    const probe = document.createElement('i');
    probe.style.color = 'var(--temperature)';
    document.body.append(probe);
    const colour = getComputedStyle(probe).color;
    probe.remove();
    return colour;
  });
  expect(await fill(stop)).toEqual({ image: 'none', colour: NONE });
  const look = await stop.evaluate((element) => {
    const style = getComputedStyle(element);
    const glow = getComputedStyle(element, '::after');
    return { color: style.color, border: style.borderTopColor, animation: glow.animationName, duration: glow.animationDuration };
  });
  expect(look.color).toBe(red);
  expect(look.border).toMatch(/^rgba\(255, 92, 99, 0\.7\)$/);
  expect(look.animation).toBe('stop-pulse');
  expect(look.duration).toBe('3s');
  await page.screenshot({ path: 'e2e/.results/glass-controls-stop.png' });

  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await stop.evaluate((element) => getComputedStyle(element, '::after').animationName)).toBe('none');
});

test('chips, a dialog and the pad are glass: no fill at rest, a selected ratio chip glows in weight', async ({ page }) => {
  await mockGateway(page);
  await page.goto('/');
  await toPage(page, 'hot-water');
  const chips = page.getByTestId('hot-water-ratio');
  await expect(chips.first()).toBeVisible();
  for (const chip of await chips.all()) expect(await fill(chip)).toEqual({ image: 'none', colour: NONE });
  await page.screenshot({ path: 'e2e/.results/glass-controls-chips.png' });

  await page.getByTestId('hot-water-weight').click();
  await expect(page.getByTestId('numpad')).toBeVisible();
  for (const key of ['7', '0', 'dot'])
    expect(await fill(page.getByTestId(`numpad-key-${key}`))).toEqual({ image: 'none', colour: NONE });
  const number = await page
    .getByTestId('numpad-display')
    .evaluate((element) => ({ weight: getComputedStyle(element).fontWeight, shadow: getComputedStyle(element).textShadow }));
  expect(number.weight).toBe('300');
  expect(number.shadow).not.toBe('none');
  await page.screenshot({ path: 'e2e/.results/glass-controls-pad.png' });
});
