import { expect, test, type Page } from '@playwright/test';
import type { Profile } from '../src/api';
import blooming from '../src/steps/fixtures/bundled-profiles.json' with { type: 'json' };
import { mockGateway } from './mock-gateway';

// One case for the words of buttons: a button's word is lower
// case. The corner menu's entries and titles stay in sentence case: a menu item, the settings'
// category list and a button that leads with a name or title in bold (a profile, a bean, a skin,
// the sleep screen's 'Asleep') are left out; so are a button named by its aria-label (an icon or
// a name, not a word) and a value written in capitals (a plugin's 'WARNING'). Every main screen
// of the mock is walked, so a new button keeps the rule.

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

/** The words of the visible buttons on the page that start with an upper-case letter. */
function capitalised(page: Page, where: string): Promise<string[]> {
  return page.locator('button:visible').evaluateAll(
    (buttons, where) =>
      buttons
        .filter((button) => !button.closest('[role="menu"], nav') && !button.hasAttribute('aria-label'))
        .filter((button) => {
          // The first text the button shows: a word of the skin's, or a name in bold.
          const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT, {
            acceptNode: (node) => (node.textContent?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP),
          });
          const first = walker.nextNode();
          return !first?.parentElement?.closest('strong, b, .title, .name');
        })
        .map((button) => (button as HTMLElement).innerText.trim())
        .filter((text) => /^\p{Lu}/u.test(text) && text !== text.toUpperCase())
        .map((text) => `${where}: ${text}`),
    where,
  );
}

async function open(page: Page, screen: string) {
  await page.evaluate((screen) => localStorage.setItem('pureflow.screen', screen), screen);
  await page.goto('/');
  await expect(page.getByTestId(`screen-${screen}`)).toBeVisible();
}

test("every button's word on the main screens starts lower case; the menu and titles excepted", async ({ page }) => {
  const at = '2026-10-18T10:00:00.000';
  const gateway = (await mockGateway(page)).withDefaults('medium');
  gateway.beans = [
    { id: 'b1', name: 'House Blend', roaster: 'Example Roasters', decaf: false, archived: false, createdAt: at, updatedAt: at },
  ];
  gateway.grinders = [
    { id: 'g1', model: 'Hand grinder', archived: false, settingType: 'numeric', settingSmallStep: 0.5, createdAt: at, updatedAt: at },
  ];
  const found: string[] = [];

  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText('Idle');
  found.push(...(await capitalised(page, 'home')));
  await page.getByTestId('open-pick').click();
  await expect(page.getByTestId('pick-use')).toBeVisible();
  found.push(...(await capitalised(page, 'bean pick')));
  await page.getByTestId('pick-cancel').click();
  await page.getByTestId('history-handle').tap();
  await expect(page.getByTestId('history')).toBeVisible();
  found.push(...(await capitalised(page, 'history')));

  for (const screen of ['profiles', 'editor', 'steam', 'hot-water']) {
    await open(page, screen);
    found.push(...(await capitalised(page, screen)));
  }

  await open(page, 'beans');
  await page.getByTestId('bean-row').first().click();
  await expect(page.getByTestId('bean-archive')).toBeVisible();
  found.push(...(await capitalised(page, 'beans')));
  await page.getByTestId('beans-kind-grinders').click();
  await page.getByTestId('grinder-row').first().click();
  await expect(page.getByTestId('grinder-archive')).toBeVisible();
  found.push(...(await capitalised(page, 'grinders')));

  // The step editor: a profile that is not A-Flow.
  const mine = { ...structuredClone(blooming.find((entry) => entry.title === 'Blooming Espresso') as Profile), title: 'My blooming' };
  gateway.workflow.profile = mine;
  await open(page, 'editor');
  await expect(page.getByTestId('step-card-0')).toBeVisible();
  found.push(...(await capitalised(page, 'step editor')));

  await open(page, 'settings');
  const categories = page.locator('[data-testid^="settings-category-"]');
  for (let i = 0; i < (await categories.count()); i++) {
    await categories.nth(i).click();
    await expect(categories.nth(i)).toHaveAttribute('aria-current', 'true');
    // Each category reads its values first; its buttons are there once it has.
    await expect(page.getByTestId('settings-content').getByText(/^Reading/)).toHaveCount(0);
    found.push(...(await capitalised(page, `settings ${await categories.nth(i).innerText()}`)));
  }

  expect(found).toEqual([]);
});

// One case for the settings' texts: a title (the page's, a category's, a subcategory's) starts
// with a capital, every row label and hint starts lower case. A proper noun keeps its capital, and
// so does a text that is not the skin's own words: a name (a device, a plugin, a schedule, the
// skin), a plugin's own label or a gateway's message, marked `.name` or `.warn`.
const PROPER_NOUNS = ['Decaid', "Decaid's", 'Decent', 'A-Flow', 'Wi-Fi', 'Streamline', 'USB', 'GitHub', 'DE1', 'Bengle', 'IP', 'UI'];

/** The labels and hints of the settings panel that start with an upper-case letter. */
function capitalisedTexts(page: Page, where: string): Promise<string[]> {
  return page
    .getByTestId('settings-content')
    .locator(
      '.about > strong:visible, .about > small:visible, .about > span:visible, .row > strong:first-child:visible, section > p.hint:visible',
    )
    .evaluateAll(
      (texts, [where, proper]) =>
        texts
          .filter((text) => !text.closest('.name, .warn'))
          .map((text) => (text as HTMLElement).innerText.trim())
          .filter((text) => /^\p{Lu}/u.test(text) && !proper.includes(text.split(/[\s:,;.]/)[0]))
          .map((text) => `${where}: ${text}`),
      [where, PROPER_NOUNS] as const,
    );
}

test('every label and hint in settings starts lower case but for a proper noun; titles keep their capital', async ({ page }) => {
  await mockGateway(page);
  await page.goto('/');
  await open(page, 'settings');
  const found: string[] = [];
  const titles: string[] = [];
  const categories = page.locator('[data-testid^="settings-category-"]');
  for (let i = 0; i < (await categories.count()); i++) {
    await categories.nth(i).click();
    await expect(categories.nth(i)).toHaveAttribute('aria-current', 'true');
    await expect(page.getByTestId('settings-content').getByText(/^Reading/)).toHaveCount(0);
    const where = `settings ${await categories.nth(i).innerText()}`;
    found.push(...(await capitalisedTexts(page, where)));
    titles.push(where, ...(await page.getByTestId('settings-content').locator('h2:visible').allInnerTexts()));
  }

  expect(found).toEqual([]);
  expect(titles.filter((title) => !/^(settings )?[\p{Lu}\d]/u.test(title))).toEqual([]);
});
