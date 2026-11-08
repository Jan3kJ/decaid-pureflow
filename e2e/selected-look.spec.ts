import { expect, test, type Locator, type Page } from '@playwright/test';
import { MEASUREMENTS, mockGateway, profile } from './mock-gateway';
import { paint } from './paint';
import { toPage } from './touch';

// One selected look, against a mocked gateway: whatever is selected, a chip, a mode, a tab or a row
// of a list, is the profile picker's row: a white frame on the raised background, its words as they
// are unselected. Left out are the page dots (they say 'page', a dot too small for a frame) and the
// editor's lamp toggles, which are switches.

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

/** A CSS colour as the browser computes it, e.g. 'var(--fg)' as 'rgb(232, 234, 237)'. */
const colour = (page: Page, value: string) =>
  page.evaluate((value) => {
    const probe = document.createElement('i');
    probe.style.color = value;
    document.body.append(probe);
    const computed = getComputedStyle(probe).color;
    probe.remove();
    return computed;
  }, value);

const look = (locator: Locator) =>
  locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      background: style.backgroundImage === 'none' ? style.backgroundColor : style.backgroundImage,
      border: style.borderTopColor,
    };
  });

/** The colour and weight of a control's words and of what is inside it. */
const words = (locator: Locator) =>
  locator.evaluate((element) =>
    [element, ...element.querySelectorAll('*')].map((part) => {
      const style = getComputedStyle(part);
      return { color: style.color, weight: style.fontWeight };
    }),
  );

async function outline(page: Page) {
  const [border, background] = await Promise.all([colour(page, 'var(--fg)'), paint(page, 'var(--raised)')]);
  return { background, border };
}

/** Every selected control on the screen: none may differ from the picker's row. */
async function expectOneLook(page: Page, least: number) {
  const wanted = await outline(page);
  const found = await page.evaluate(() =>
    [...document.querySelectorAll('[aria-pressed="true"], [aria-current="true"]')]
      .filter((element) => !element.matches('[data-testid^="toggle-"]'))
      .map((element) => {
        const style = getComputedStyle(element);
        return {
          control: element.getAttribute('data-testid'),
          background: style.backgroundImage === 'none' ? style.backgroundColor : style.backgroundImage,
          border: style.borderTopColor,
          width: style.borderTopWidth,
        };
      }),
  );
  expect(found.length).toBeGreaterThanOrEqual(least);
  for (const { control, background, border, width } of found) {
    expect({ control, background, border }).toEqual({ control, ...wanted });
    expect(parseFloat(width), `${control}'s frame`).toBeGreaterThan(0);
  }
}

async function open(page: Page, screen: string) {
  await page.goto('/');
  await page.evaluate((screen) => localStorage.setItem('pureflow.screen', screen), screen);
  await page.goto('/');
  await expect(page.getByTestId(`screen-${screen}`)).toBeVisible();
}

test("selected on hot water and steam: the picker's look, the words as they are unselected", async ({ page }) => {
  const gateway = await mockGateway(page);
  gateway.addShot('shot-40', '2026-10-17T07:00:00', profile('A-Flow / default-medium', 42, 9), { targetYield: 40 });
  gateway.measurements['shot-40'] = MEASUREMENTS.map((measurement, i, all) => ({
    ...measurement,
    scale: i === all.length - 1 && measurement.scale ? { ...measurement.scale, weight: 40 } : measurement.scale,
  }));
  gateway.putOnScale(212.4);
  await page.goto('/');

  await toPage(page, 'hot-water');
  const [ratio, other] = [page.getByTestId('hot-water-ratio').first(), page.getByTestId('hot-water-ratio').nth(1)];
  const before = await words(ratio);
  await ratio.click();
  await expect(ratio).toHaveAttribute('aria-pressed', 'true');
  await expect(other).toHaveAttribute('aria-pressed', 'false');
  await page.screenshot({ path: 'e2e/.results/selected-hot-water.png' });
  await expectOneLook(page, 1);
  expect(await words(ratio)).toEqual(before);
  expect(await words(other)).toEqual(before);

  await toPage(page, 'steam');
  const adjust = page.getByTestId('steam-adjust').first();
  const favourite = page.getByTestId('steam-favourite').first();
  const plain = await words(page.getByTestId('steam-adjust').nth(1));
  await adjust.click();
  await expect(adjust).toHaveAttribute('aria-pressed', 'true');
  await favourite.click();
  await expect(favourite).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: 'e2e/.results/selected-steam.png' });
  await expectOneLook(page, 2);
  expect(await words(adjust)).toEqual(plain);
});

test('selected in the picker, the beans, the settings and the history: the one look', async ({ page }) => {
  await mockGateway(page);
  await page.goto('/');
  const wanted = await outline(page);

  await page.getByTestId('open-profiles').click();
  await page.getByTestId('profile-item').first().click();
  const row = page.locator('[data-testid="profile-item"][aria-pressed="true"]');
  await expect(row).toHaveCount(1);
  expect(await look(row)).toEqual(wanted);
  await page.screenshot({ path: 'e2e/.results/selected-picker.png' });

  await open(page, 'beans');
  await expect(page.getByTestId('beans-kind-beans')).toHaveAttribute('aria-current', 'true');
  await expect(page.getByTestId('beans-add')).toHaveAttribute('aria-current', 'true');
  await expectOneLook(page, 2);
  await page.screenshot({ path: 'e2e/.results/selected-beans.png' });

  await open(page, 'settings');
  await expect(page.locator('[data-testid^="settings-category-"][aria-current="true"]')).toHaveCount(1);
  await page.getByTestId('settings-category-quickadjustments').click();
  await page.getByTestId('settings-sub-watertank').click();
  await page.getByTestId('setting-tank-unit-mm').click();
  await expect(page.getByTestId('setting-tank-unit-mm')).toHaveAttribute('aria-pressed', 'true');
  await expectOneLook(page, 2);
  await page.screenshot({ path: 'e2e/.results/selected-settings.png' });

  await open(page, 'home');
  await page.getByTestId('history-handle').tap();
  const all = page.getByTestId('filter-all');
  await expect(all).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => (await page.getByTestId('history').boundingBox())?.x).toBe(0);
  await expectOneLook(page, 1);
  await page.screenshot({ path: 'e2e/.results/selected-history.png' });
});

test('selected in the editor: the modes and the phase column', async ({ page }) => {
  (await mockGateway(page)).withDefaults('light');
  await page.addInitScript(() => localStorage.setItem('pureflow.screen', 'editor'));
  await page.goto('/');
  await expect(page.getByTestId('graph')).toBeVisible();
  await expect(page.getByTestId('mode-simple')).toHaveAttribute('aria-pressed', 'true');
  await expectOneLook(page, 1);

  // The column of the selected phase is the same look, in the drawing's words.
  await page.getByTestId('mode-detail').click();
  await expect(page.getByTestId('mode-detail')).toHaveAttribute('aria-pressed', 'true');
  const column = page.locator('rect.column.selected');
  await expect(column).toHaveCount(1);
  const drawn = await column.evaluate((element) => {
    const style = getComputedStyle(element);
    return { background: style.fill, border: style.stroke };
  });
  expect(drawn).toEqual({ ...(await outline(page)), background: await colour(page, 'var(--glass-flat)') });
  await page.screenshot({ path: 'e2e/.results/selected-editor-detail.png' });
});

test('selected in the step editor: the tab', async ({ page }) => {
  const gateway = await mockGateway(page);
  gateway.workflow.profile = profile('My blooming', 36, 9);
  await page.goto('/');
  await page.getByTestId('open-editor').click();
  await expect(page.getByTestId('tab-cards')).toHaveAttribute('aria-pressed', 'true');
  await expectOneLook(page, 1);
});

test("a mark that is no selection has no white frame: the date picker's today, the history chip whose list is open", async ({
  page,
}) => {
  await mockGateway(page);
  await page.goto('/');
  const { border: white } = await outline(page);
  const grey = await colour(page, 'var(--dim)');

  await open(page, 'beans');
  await page.getByTestId('bean-roast-date').click();
  const today = page.locator('button.day.today');
  await expect(today).toHaveAttribute('aria-pressed', 'false');
  expect((await look(today)).border).toBe(grey);
  await page.locator('button.day:not(.today)').first().click();
  await page.getByTestId('bean-roast-date').click();
  await expect(page.locator('button.day[aria-pressed="true"]')).toHaveCount(1);
  await expectOneLook(page, 3);
  expect((await look(today)).border).toBe(grey);
  await page.screenshot({ path: 'e2e/.results/selected-date-picker.png' });
  await page.getByTestId('datepicker-cancel').click();

  await open(page, 'home');
  await page.getByTestId('history-handle').tap();
  await expect.poll(async () => (await page.getByTestId('history').boundingBox())?.x).toBe(0);
  await page.getByTestId('filter-bean').tap();
  await expect(page.getByTestId('filter-options')).toBeVisible();
  expect((await look(page.getByTestId('filter-bean'))).border).toBe(grey);
  expect((await look(page.getByTestId('filter-all'))).border).toBe(white);
});

test('the main button keeps its white fill', async ({ page }) => {
  await mockGateway(page);
  await page.goto('/');
  await page.getByTestId('open-profiles').click();
  await page.getByTestId('profile-item').first().click();
  expect((await look(page.getByTestId('load-profile'))).background).toBe(await colour(page, 'var(--fg)'));
});
