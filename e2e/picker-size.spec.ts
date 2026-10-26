import { expect, test, type Page } from '@playwright/test';
import { mockGateway, profile, record } from './mock-gateway';

// The picker's graph keeps its size (spec 3.16 item 1): one square box at the panel's width for
// every profile, the description the buffer under it that scrolls; title, author, the values,
// the graph, the caption line and load stay where they are while the list is paged through. On
// a lower display the graph gives way, the same for every profile.

const LONG = Array.from(
  { length: 40 },
  (_, i) => `Line ${i + 1} of a long description, which scrolls inside its own field and never moves the graph.`,
).join('\n');

const TITLES = ['Bare', 'Short', "80's Espresso", 'A-Flow / default-dark'];

async function setUp(page: Page) {
  const gateway = await mockGateway(page);
  gateway.profiles.push(record('profile:bare', { ...profile('Bare', 36), notes: '', author: '' }, null));
  gateway.profiles.push(record('profile:short', { ...profile('Short', 36), notes: 'A short one.' }, null));
  gateway.profiles.push(record('profile:long', { ...profile("80's Espresso", 36, 3), notes: LONG }, null));
  await page.goto('/');
  await page.getByTestId('open-profiles').click();
}

/** The boxes of the panel's fixed parts, rounded to the pixel, for the selected profile. */
async function layout(page: Page, title: string) {
  await page.getByTestId('profile-item').filter({ hasText: title }).first().click();
  const detail = page.getByTestId('profile-detail');
  await expect(detail.locator('h1')).toHaveText(title);
  const box = async (selector: string) => {
    const found = (await detail.locator(selector).boundingBox())!;
    return [found.x, found.y, found.width, found.height].map(Math.round);
  };
  return {
    title: await box('h1'),
    author: await box('[data-testid="profile-author"]'),
    values: await box('dl'),
    graph: await box('[data-testid="profile-preview"]'),
    caption: await box('[data-testid="profile-caption"]'),
    edit: await box('[data-testid="edit-profile"]'),
    load: await box('[data-testid="load-profile"]'),
  };
}

test('on the 1280 x 800 tablet the graph is one square box for every profile and a long description scrolls', async ({ page }) => {
  await setUp(page);
  const first = await layout(page, TITLES[0]);
  const [, , width, height] = first.graph;
  expect(Math.abs(width - height)).toBeLessThanOrEqual(1);
  for (const title of TITLES.slice(1)) expect(await layout(page, title), title).toEqual(first);

  // 80's Espresso's description scrolls inside its field, which ends above load.
  await layout(page, "80's Espresso");
  const notes = page.getByTestId('profile-description');
  const field = await notes.evaluate((element) => ({ client: element.clientHeight, scroll: element.scrollHeight }));
  expect(field.client).toBeGreaterThan(0);
  expect(field.scroll).toBeGreaterThan(field.client);
  const notesBox = (await notes.boundingBox())!;
  expect(notesBox.y + notesBox.height).toBeLessThanOrEqual(first.load[1]);
  await notes.evaluate((element) => element.scrollTo(0, element.scrollHeight));
  await expect.poll(() => notes.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  expect((await layout(page, "80's Espresso")).graph).toEqual(first.graph);

  // Paging through the whole list by tap, ten profiles and more, leaves every fixed part in place.
  const titles = await page.getByTestId('profile-item').locator('.title').allTextContents();
  expect(titles.length).toBeGreaterThanOrEqual(10);
  for (const title of titles) expect(await layout(page, title), title).toEqual(first);
  await layout(page, "80's Espresso");
  await page.screenshot({ path: 'docs/product/profile-picker-size.png' });
});

test('on a display too low for the square the graph gives way, the same for every profile', async ({ page }) => {
  // Every size is in rem, which follows the viewport, so a lower tablet alone keeps the square:
  // it is too low with the largest display size of Skin > Display on top.
  await page.addInitScript(() => localStorage.setItem('pureflow.settings', JSON.stringify({ displaySize: 1.3 })));
  await page.setViewportSize({ width: 1280, height: 560 });
  await setUp(page);
  const first = await layout(page, TITLES[0]);
  const [, , width, height] = first.graph;
  expect(height).toBeLessThan(width - 1);
  const rem = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
  expect(height).toBeGreaterThanOrEqual(Math.floor(6 * rem));
  for (const title of TITLES.slice(1)) expect(await layout(page, title), title).toEqual(first);
  // The description keeps its few lines while the graph gives way.
  const field = await page.getByTestId('profile-description').evaluate((element) => element.clientHeight);
  expect(field).toBeGreaterThan(2 * rem);
  await page.screenshot({ path: 'docs/product/profile-picker-low.png' });
});
