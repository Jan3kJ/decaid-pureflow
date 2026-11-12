import { expect, test, type Page } from '@playwright/test';
import { mockGateway } from './mock-gateway';
import { toPage } from './touch';

// Skin > Developer's six look values, 0.0 to 2.0 in steps of 0.05: kept on this tablet, put on the root
// as custom properties while developer options are on, and read by the graphs, the hot water lines and
// every glow of the skin (src/settings-page/local-install.ts, src/app.css).

test.use({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });

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

const ALL = ['glow-range', 'glow-brightness', 'curve-thick', 'water-line-thick', 'water-line-glow', 'water-spot-glow'];
const PROPERTIES = [
  '--glow-range',
  '--glow-brightness',
  '--curve-thick',
  '--water-line-thick',
  '--water-line-glow',
  '--water-spot-glow',
];

/** The tablet's own storage: developer options on, and these values (the keys of src/settings-page/local-install.ts). */
async function tuned(page: Page, values: Record<string, number>, developer = true) {
  await page.addInitScript(
    ([stored, on]) => {
      if (on) localStorage.setItem('pureflow.developer', 'on');
      localStorage.setItem('pureflow.tuning', JSON.stringify(stored));
    },
    [values, developer] as const,
  );
}

const root = (page: Page) =>
  page.evaluate((names) => names.map((name) => document.documentElement.style.getPropertyValue(name)), PROPERTIES);

async function openDeveloper(page: Page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('pureflow.screen', 'home'));
  await page.goto('/');
  await page.getByTestId('menu').click();
  await page.getByTestId('open-settings').click();
  await page.getByTestId('settings-category-skin').click();
  await page.getByTestId('settings-sub-skin-backup').click();
  if ((await page.getByTestId('setting-developer').getAttribute('aria-checked')) !== 'true') {
    await page.getByTestId('setting-developer').click();
  }
  await page.getByTestId('settings-sub-skin-developer').click();
}

const strokes = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((element) => {
      const style = getComputedStyle(element);
      return { width: parseFloat(style.strokeWidth), opacity: parseFloat(style.opacity) };
    });

/** The alphas of every colour in a shadow value. */
const alphas = (shadow: string) => [...shadow.matchAll(/rgba?\(([^)]*)\)/g)].map((match) => parseFloat(match[1].split(',')[3] ?? '1'));

/** The blur radii in px of a shadow value, each after its colour, as computed styles write them. */
const reaches = (shadow: string) =>
  [...shadow.matchAll(/rgba?\([^)]*\)\s+\d+(?:\.\d+)?px\s+\d+(?:\.\d+)?px\s+(\d+(?:\.\d+)?)px/g)].map((m) => +m[1]);

test('six rows step in 0.05, keep 0.35, reset, and are the defaults again with developer options off', async ({ page }) => {
  await mockGateway(page);
  await openDeveloper(page);
  for (const id of ALL) await expect(page.getByTestId(`tuning-${id}-value`)).toHaveText('1.00');
  await expect(page.getByTestId('tuning-reset')).toBeDisabled();

  for (let i = 0; i < 13; i++) await page.getByTestId('tuning-glow-range-less').click();
  await expect(page.getByTestId('tuning-glow-range-value')).toHaveText('0.35');
  await page.getByTestId('tuning-water-spot-glow-more').click();
  await page.getByTestId('tuning-curve-thick-less').click();
  expect(await root(page)).toEqual(['0.35', '1', '0.95', '1', '1', '1.05']);

  // the page opens where it was left
  await page.reload();
  await page.getByTestId('settings-sub-skin-developer').click();
  await expect(page.getByTestId('tuning-glow-range-value')).toHaveText('0.35');
  expect(await page.evaluate(() => localStorage.getItem('pureflow.tuning'))).toContain('0.35');

  // not on the root, and kept, with the switch off
  await page.getByTestId('settings-sub-skin-backup').click();
  await page.getByTestId('setting-developer').click();
  expect(await root(page)).toEqual(['1', '1', '1', '1', '1', '1']);
  await page.getByTestId('setting-developer').click();
  expect(await root(page)).toEqual(['0.35', '1', '0.95', '1', '1', '1.05']);

  await page.getByTestId('settings-sub-skin-developer').click();
  await page.getByTestId('tuning-reset').click();
  for (const id of ALL) await expect(page.getByTestId(`tuning-${id}-value`)).toHaveText('1.00');
  expect(await root(page)).toEqual(['1', '1', '1', '1', '1', '1']);
  expect(await page.evaluate(() => localStorage.getItem('pureflow.tuning'))).toBeNull();
});

test('a stored value out of range is the default, one off a step is rounded; off gives the defaults', async ({ page }) => {
  await mockGateway(page);
  await tuned(page, { glowRange: 3, glowBrightness: -1, curveThick: 0.37, waterLineThick: 0 });
  await page.goto('/');
  expect(await root(page)).toEqual(['1', '1', '0.35', '0', '1', '1']);
});

test('the home graph, the glows of home and a press follow glow range, brightness and thickness', async ({ page }) => {
  const gateway = await mockGateway(page);
  await page.goto('/');
  await gateway.replay(page, 0, 1);
  const plain = {
    line: await strokes(page, '[data-testid=shot-line-pressure]'),
    outer: await strokes(page, '.glow.outer'),
    inner: await strokes(page, '.glow.inner'),
  };
  const timer = page.getByTestId('shot-timer');
  const textShadow = () => timer.evaluate((element) => getComputedStyle(element).textShadow);
  expect(alphas(await textShadow())[0]).toBeCloseTo(0.45, 2);

  await tuned(page, { glowRange: 2, glowBrightness: 0, curveThick: 0.5 });
  await page.reload();
  await gateway.replay(page, 0, 1);
  const line = await strokes(page, '[data-testid=shot-line-pressure]');
  expect(line.width).toBeCloseTo(plain.line.width * 0.5, 2);
  const outer = await strokes(page, '.glow.outer');
  expect(outer.width).toBeCloseTo(plain.outer.width * 2 * 0.5, 2);
  expect(outer.opacity).toBe(0);
  expect((await strokes(page, '.glow.inner')).opacity).toBe(0);
  // no glow on the live numbers and none on a pressed button
  expect(alphas(await textShadow()).every((alpha) => alpha === 0)).toBe(true);
  const button = page.getByTestId('menu');
  await button.hover();
  await page.mouse.down();
  const pressed = await button.evaluate((element) => getComputedStyle(element).boxShadow);
  await page.mouse.move(0, 0);
  await page.mouse.up();
  expect(alphas(pressed).every((alpha) => alpha === 0)).toBe(true);

  // brightness 2 doubles the glow strokes' opacity and the text glow's alpha
  await tuned(page, { glowBrightness: 2 });
  await page.reload();
  await gateway.replay(page, 0, 1);
  expect((await strokes(page, '.glow.inner')).opacity).toBeCloseTo(plain.inner.opacity * 2, 3);
  expect(alphas(await textShadow())[0]).toBeCloseTo(0.9, 2);
});

test("hot water's line thickness, line glow and spot glow follow their own values", async ({ page }) => {
  await mockGateway(page);
  await page.goto('/');
  await toPage(page, 'hot-water');
  const slider = page.getByTestId('hot-water-slider-time');
  const light = async () => {
    await toPage(page, 'hot-water');
    await slider.click({ position: { x: 20, y: 20 } });
    await expect(slider).toHaveAttribute('data-lit', 'true');
    // the line and the halo ease in
    await slider.evaluate((element) => Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished)));
    return slider.evaluate((element) => {
      const fill = getComputedStyle(element.querySelector('.fill')!);
      const rest = getComputedStyle(element.querySelector('.rest')!);
      const number = element.querySelector('.value')!;
      const halo = getComputedStyle(number, '::before');
      return {
        fill: parseFloat(fill.height),
        rest: parseFloat(rest.height),
        lineShadow: fill.boxShadow,
        haloWidth: parseFloat(halo.width),
        haloOpacity: parseFloat(halo.opacity),
        text: getComputedStyle(number.querySelector('b')!).textShadow,
      };
    });
  };
  const plain = await light();
  expect(plain.fill).toBe(3);
  expect(plain.rest).toBe(1);
  expect(plain.haloOpacity).toBe(1);
  expect(reaches(plain.lineShadow)).toEqual([9.6, 25.6]);
  expect(reaches(plain.text)).toEqual([12.8, 38.4]);

  // thickness 2: the lines twice as thick, the glows as they were
  await tuned(page, { waterLineThick: 2 });
  await page.reload();
  const thick = await light();
  expect(thick.fill).toBe(6);
  expect(thick.rest).toBe(2);
  expect(thick.lineShadow).toBe(plain.lineShadow);
  expect(thick.haloWidth).toBeCloseTo(plain.haloWidth, 1);

  // line glow 0 with spot glow 2: no line shadow reach, a larger halo and number shadow
  await tuned(page, { waterLineGlow: 0, waterSpotGlow: 2 });
  await page.reload();
  const split = await light();
  expect(reaches(split.lineShadow)).toEqual([0, 0]);
  expect(split.haloWidth).toBeGreaterThan(plain.haloWidth * 1.5);
  expect(reaches(split.text)).toEqual([25.6, 76.8]);

  // spot glow 0 with line glow 2: no halo, no number shadow reach, a wider line glow
  await tuned(page, { waterLineGlow: 2, waterSpotGlow: 0 });
  await page.reload();
  const other = await light();
  expect(other.haloOpacity).toBe(0);
  expect(reaches(other.text)).toEqual([0, 0]);
  expect(reaches(other.lineShadow)).toEqual([19.2, 51.2]);

  // brightness 0: no light at all
  await tuned(page, { glowBrightness: 0 });
  await page.reload();
  const dark = await light();
  expect(alphas(dark.lineShadow).every((alpha) => alpha === 0)).toBe(true);
  expect(alphas(dark.text).every((alpha) => alpha === 0)).toBe(true);
});
