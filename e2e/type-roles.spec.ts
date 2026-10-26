import { expect, test, type Locator, type Page } from '@playwright/test';
import { mockGateway } from './mock-gateway';
import { toPage } from './touch';

// One size per kind of text (spec 3.14, acceptance 95), on the mock gateway: the names of things
// are one role, the text size at weight 600. The profile and the bean on home have the same
// computed size and weight, and so do the rows of the profile, bean and grinder lists and of the
// bean pick. The state word and the page header are names too (Z23). The lint check (scripts/font-sizes.mjs) holds the rest: no literal size in the files.

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

const at = '2026-10-18T10:00:00.000';

async function gateway(page: Page) {
  const mock = (await mockGateway(page)).withDefaults('medium');
  mock.workflow.context = {
    ...mock.workflow.context,
    coffeeName: 'House Blend',
    coffeeRoaster: 'Example Roasters',
    grinderModel: 'Hand grinder',
  };
  mock.beans = [
    { id: 'b1', name: 'House Blend', roaster: 'Example Roasters', decaf: false, archived: false, createdAt: at, updatedAt: at },
  ];
  mock.grinders = [
    { id: 'g1', model: 'Hand grinder', archived: false, settingType: 'numeric', settingSmallStep: 0.5, createdAt: at, updatedAt: at },
  ];
  return mock;
}

/** The computed size, weight and the text role's size of a name. */
function face(locator: Locator) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    const root = getComputedStyle(document.documentElement);
    const rem = parseFloat(root.fontSize);
    return { size: style.fontSize, weight: style.fontWeight, body: `${parseFloat(root.getPropertyValue('--text-body')) * rem}px` };
  });
}

test("home's profile and bean, and the rows of every list, are names: one size and weight", async ({ page }) => {
  await gateway(page);
  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText('Idle');

  const profile = await face(page.getByTestId('profile-name'));
  const bean = await face(page.getByTestId('next-bean'));
  expect(bean).toEqual(profile);
  // The name role: the text size at weight 600.
  expect(profile.size).toBe(profile.body);
  expect(profile.weight).toBe('600');

  await page.getByTestId('open-pick').click();
  expect(await face(page.getByTestId('pick-bean').filter({ hasText: 'House Blend' }).locator('strong'))).toEqual(profile);
  expect(await face(page.getByTestId('pick-grinder').filter({ hasText: 'Hand grinder' }).locator('strong'))).toEqual(profile);

  await page.evaluate(() => localStorage.setItem('pureflow.screen', 'profiles'));
  await page.goto('/');
  const rows = page.getByTestId('profile-item');
  await expect(rows.first()).toBeVisible();
  // The selected row and the others alike.
  for (const row of [rows.first(), rows.nth(2)]) expect(await face(row.locator('.title'))).toEqual(profile);

  await page.evaluate(() => localStorage.setItem('pureflow.screen', 'beans'));
  await page.goto('/');
  expect(await face(page.getByTestId('bean-row').first().locator('strong'))).toEqual(profile);
  await page.getByTestId('beans-kind-grinders').click();
  expect(await face(page.getByTestId('grinder-row').first().locator('strong'))).toEqual(profile);
});

test("the state word and the page header have the profile name's size and weight", async ({ page }) => {
  await gateway(page);
  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText('Idle');
  const profile = await face(page.getByTestId('profile-name'));

  for (const [screen, title] of [
    ['home', null],
    ['steam', 'Steam'],
    ['hot-water', 'Hot water'],
  ] as const) {
    if (screen !== 'home') {
      await toPage(page, 'home');
      await toPage(page, screen);
    }
    const header = page.getByTestId(`screen-${screen}`).locator('header.page-header');
    expect(await face(header.getByTestId('status-title'))).toEqual(profile);
    if (title) {
      await expect(header.getByTestId('page-title')).toHaveText(title);
      expect(await face(header.getByTestId('page-title'))).toEqual(profile);
    }
    // The header row stays one line, as tall as the menu button.
    const row = (await header.boundingBox())!;
    expect(row.height).toBeCloseTo(56, 0);
    const word = (await header.getByTestId('status-title').boundingBox())!;
    expect(word.height).toBeLessThan(row.height);
  }
});
