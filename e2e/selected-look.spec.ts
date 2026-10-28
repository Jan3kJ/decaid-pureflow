import { expect, test, type Locator, type Page } from '@playwright/test';
import { mockGateway } from './mock-gateway';
import { toPage } from './touch';

// One selected look per kind (spec 3.18 item 7, acceptance 130), against a mocked gateway: a choice
// of one among a few (a chip, a mode, a tab, history's 'all') is the white fill; the row whose
// detail is shown beside its list (the picker, the bean and grinder lists, the settings'
// categories) is the white outline on the raised background.

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
    return { color: style.color, background: style.backgroundColor, border: style.borderTopColor };
  });

async function looks(page: Page) {
  const [fg, bg, raised] = await Promise.all(['var(--fg)', 'var(--bg)', 'var(--raised)'].map((value) => colour(page, value)));
  return { fill: { color: bg, background: fg, border: fg }, outline: { background: raised, border: fg } };
}

async function open(page: Page, screen: string) {
  await page.goto('/');
  await page.evaluate((screen) => localStorage.setItem('pureflow.screen', screen), screen);
  await page.goto('/');
  await expect(page.getByTestId(`screen-${screen}`)).toBeVisible();
}

test("a selected chip, mode, tab and history's 'all' are the white fill", async ({ page }) => {
  await mockGateway(page);
  await page.goto('/');
  const { fill } = await looks(page);

  await toPage(page, 'steam');
  const chip = page.getByTestId('steam-favourite').and(page.locator('[aria-pressed="true"]'));
  await expect(chip).toHaveCount(1);
  expect(await look(chip)).toEqual(fill);
  await page.screenshot({ path: 'e2e/.results/selected-steam.png' });

  await open(page, 'beans');
  const tab = page.getByTestId('beans-kind-beans');
  await expect(tab).toHaveAttribute('aria-current', 'true');
  expect(await look(tab)).toEqual(fill);

  await open(page, 'home');
  await page.getByTestId('history-handle').tap();
  const all = page.getByTestId('filter-all');
  await expect(all).toHaveAttribute('aria-pressed', 'true');
  expect(await look(all)).toEqual(fill);
  await expect.poll(async () => (await page.getByTestId('history').boundingBox())?.x).toBe(0);
  await page.screenshot({ path: 'e2e/.results/selected-history.png' });
});

test('the row whose detail is shown beside its list is the white outline', async ({ page }) => {
  await mockGateway(page);
  await page.goto('/');
  const { outline } = await looks(page);

  await page.getByTestId('open-profiles').click();
  await page.getByTestId('profile-item').first().click();
  const row = page.locator('[data-testid="profile-item"][aria-pressed="true"]');
  await expect(row).toHaveCount(1);
  expect(await look(row)).toMatchObject(outline);
  await page.screenshot({ path: 'e2e/.results/selected-picker.png' });

  await open(page, 'beans');
  const add = page.getByTestId('beans-add');
  await expect(add).toHaveAttribute('aria-current', 'true');
  expect(await look(add)).toMatchObject(outline);
  await page.screenshot({ path: 'e2e/.results/selected-beans.png' });

  await open(page, 'settings');
  const category = page.locator('[data-testid^="settings-category-"][aria-current="true"]');
  await expect(category).toHaveCount(1);
  expect(await look(category)).toMatchObject(outline);
  await page.screenshot({ path: 'e2e/.results/selected-settings.png' });
});
