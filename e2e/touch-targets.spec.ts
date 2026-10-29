import { expect, test, type Page } from '@playwright/test';
import type { Profile } from '../src/api';
import blooming from '../src/steps/fixtures/bundled-profiles.json' with { type: 'json' };
import { mockGateway } from './mock-gateway';

// Touch targets (spec 3.18 item 8, acceptance 133): every visible, enabled button and
// `[role=button]` on the mock's screens is at least MIN_REM on its short side, in CSS px at the
// page's root font size. The minimum is kept here alone; spec 8 asks whether it should be more.
const MIN_REM = 3;

// The one exception: the history handle is a narrow strip at the edge, and an edge swipe as well.
const EXCEPTED = new Set(['history-handle']);

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

/** The visible, enabled buttons on the page whose short side is under the minimum. */
function small(page: Page, where: string): Promise<string[]> {
  return page.locator('button:visible, [role="button"]:visible').evaluateAll(
    (elements, { where, minRem, excepted }) => {
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
      return elements
        .filter((element) => !(element as HTMLButtonElement).disabled && element.getAttribute('aria-disabled') !== 'true')
        .filter((element) => !excepted.includes(element.getAttribute('data-testid') ?? ''))
        .map((element) => {
          const box = element.getBoundingClientRect();
          return { element, short: Math.min(box.width, box.height) };
        })
        .filter(({ short }) => short > 0 && short < minRem * rem - 0.5)
        .map(({ element, short }) => {
          const name =
            element.getAttribute('data-testid') ??
            element.getAttribute('aria-label') ??
            (element as HTMLElement).innerText.trim().replace(/\s+/g, ' ');
          return `${where}: ${name} (${short.toFixed(1)} px)`;
        });
    },
    { where, minRem: MIN_REM, excepted: [...EXCEPTED] },
  );
}

async function open(page: Page, screen: string) {
  await page.evaluate((screen) => localStorage.setItem('pureflow.screen', screen), screen);
  await page.goto('/');
  await expect(page.getByTestId(`screen-${screen}`)).toBeVisible();
}

test(`every button on the mock's screens is at least ${MIN_REM} rem on its short side; the history handle excepted`, async ({
  page,
}) => {
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
  found.push(...(await small(page, 'home')));
  await page.getByTestId('open-pick').click();
  await expect(page.getByTestId('pick-use')).toBeVisible();
  found.push(...(await small(page, 'bean pick')));
  await page.getByTestId('pick-cancel').click();
  await page.getByTestId('history-handle').tap();
  await expect(page.getByTestId('history')).toBeVisible();
  found.push(...(await small(page, 'history')));

  for (const screen of ['profiles', 'steam', 'hot-water']) {
    await open(page, screen);
    found.push(...(await small(page, screen)));
  }

  await open(page, 'editor');
  found.push(...(await small(page, 'editor simple')));
  await page.getByTestId('mode-detail').click();
  await expect(page.getByTestId('detail-panel')).toBeVisible();
  found.push(...(await small(page, 'editor detail')));

  await open(page, 'beans');
  await page.getByTestId('bean-row').first().click();
  await expect(page.getByTestId('bean-archive')).toBeVisible();
  found.push(...(await small(page, 'beans')));
  await page.getByTestId('beans-kind-grinders').click();
  await page.getByTestId('grinder-row').first().click();
  await expect(page.getByTestId('grinder-archive')).toBeVisible();
  found.push(...(await small(page, 'grinders')));

  // The step editor: a profile that is not A-Flow.
  const mine = { ...structuredClone(blooming.find((entry) => entry.title === 'Blooming Espresso') as Profile), title: 'My blooming' };
  gateway.workflow.profile = mine;
  await open(page, 'editor');
  await expect(page.getByTestId('step-card-0')).toBeVisible();
  found.push(...(await small(page, 'step editor')));

  await open(page, 'settings');
  const categories = page.locator('[data-testid^="settings-category-"]');
  for (let i = 0; i < (await categories.count()); i++) {
    await categories.nth(i).click();
    await expect(categories.nth(i)).toHaveAttribute('aria-current', 'true');
    // Each category reads its values first; its buttons are there once it has.
    await expect(page.getByTestId('settings-content').getByText(/^Reading/)).toHaveCount(0);
    found.push(...(await small(page, `settings ${await categories.nth(i).innerText()}`)));
  }

  expect(found).toEqual([]);
});
