import { expect, test, type Locator, type Page } from '@playwright/test';
import type { Profile } from '../src/api';
import blooming from '../src/steps/fixtures/bundled-profiles.json' with { type: 'json' };
import { mockGateway } from './mock-gateway';
import { back, swipe, toPage } from './touch';

// Warning, danger and off, against a mocked gateway: `--warn`
// is the orange #ff8a3d and text that warns has the '⚠' before it; an action that deletes or
// discards is an outline in the warning colour, never filled; a disabled main button looks as the
// steam page's 'set timer' does when off; the picker's 'loaded' tag is the accent colour.

const errors: string[] = [];

test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
});

/** A CSS colour as the browser computes it, e.g. 'var(--warn)' as 'rgb(255, 138, 61)'. */
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
      color: style.color,
      background: style.backgroundColor,
      border: style.borderTopColor,
      opacity: style.opacity,
      sign: getComputedStyle(element, '::before').content,
    };
  });

// The sign and a no-break space, so the sign never ends a line on its own.
const SIGN = '"⚠ "';

test('--warn is the orange #ff8a3d; Off and the scale warning are in it, after the warning sign', async ({ page }) => {
  const gateway = await mockGateway(page);
  gateway.setMachineSteamTarget(0);
  await page.goto('/');
  const warn = await colour(page, 'var(--warn)');
  expect(warn).toBe('rgb(255, 138, 61)');

  await toPage(page, 'steam');
  const title = page.getByTestId('screen-steam').getByTestId('status-title');
  await expect(title).toHaveText('Off');
  expect(await look(title)).toMatchObject({ color: warn, sign: SIGN });

  gateway.connectScale(false);
  const scale = page.getByTestId('screen-steam').getByTestId('state-scale');
  await expect(scale).toHaveText('looking for it');
  expect(await look(scale)).toMatchObject({ color: warn, sign: SIGN });
  // A warning is not a weight: the weight's yellow is far from it.
  expect(warn).not.toBe(await colour(page, 'var(--weight)'));
  await page.screenshot({ path: 'e2e/.results/warn-steam.png' });
  expect(errors).toEqual([]);
});

const BLOOMING = blooming.find((entry) => entry.title === 'Blooming Espresso') as Profile;

/** A gateway that holds 'My blooming' as a stored profile and as the workflow's: the loaded one, in the step editor. */
async function withMine(page: Page) {
  const gateway = await mockGateway(page);
  const mine: Profile = { ...structuredClone(BLOOMING), title: 'My blooming' };
  gateway.profiles.push({
    id: 'profile:mine',
    profile: structuredClone(mine),
    metadataHash: 'm',
    compoundHash: 'c',
    parentId: null,
    visibility: 'visible',
    isDefault: false,
    createdAt: '2026-10-16T04:00:00Z',
    updatedAt: '2026-10-16T04:00:00Z',
    metadata: { source: 'other-app' },
  });
  gateway.workflow.profile = structuredClone(mine);
}

test("the picker's delete, in the row and in its dialog, is the warning outline, not filled; the loaded tag is the accent", async ({
  page,
}) => {
  await withMine(page);
  await page.goto('/');
  await page.getByTestId('open-profiles').click();
  const items = page.getByTestId('profile-item');
  const row = items.filter({ hasText: 'D-Flow / default' });
  await expect(row).toHaveCount(1);
  const warn = await colour(page, 'var(--warn)');
  const outline = { color: warn, border: warn, background: 'rgba(0, 0, 0, 0)' };

  // The loaded tag on a row that is not the selected one.
  const loaded = items.filter({ hasText: 'loaded' });
  await expect(loaded).toHaveCount(1);
  await items.filter({ hasNotText: 'loaded' }).first().click();
  await expect(loaded).toHaveAttribute('aria-pressed', 'false');
  expect((await look(loaded.locator('.tag.loaded'))).color).toBe(await colour(page, 'var(--accent)'));

  const box = (await row.boundingBox())!;
  const from = { x: box.x + box.width - 60, y: box.y + box.height / 2 };
  await swipe(page, from, { x: from.x - 200, y: from.y + 4 });
  const remove = page.getByTestId('profile-delete');
  await expect(remove).toBeVisible();
  expect(await look(remove)).toMatchObject(outline);

  await remove.click();
  const ok = page.getByTestId('settings-confirm-ok');
  await expect(ok).toHaveText('delete');
  expect(await look(ok)).toMatchObject(outline);
  await page.screenshot({ path: 'e2e/.results/danger-picker.png' });
  expect(errors).toEqual([]);
});

test("'delete step' and its dialog's delete are the warning outline; 'delete step' has the sign", async ({ page }) => {
  await withMine(page);
  await page.goto('/');
  await page.getByTestId('open-editor').click();
  const warn = await colour(page, 'var(--warn)');

  const step = page.getByTestId('step-delete-0');
  await expect(step).toBeVisible();
  expect(await look(step)).toMatchObject({ color: warn, border: warn, background: 'rgba(0, 0, 0, 0)', sign: SIGN });
  await step.click();
  const confirm = page.getByTestId('delete-confirm');
  await expect(confirm).toBeVisible();
  expect(await look(confirm)).toMatchObject({ color: warn, border: warn, background: 'rgba(0, 0, 0, 0)' });
  await page.screenshot({ path: 'e2e/.results/danger-step.png' });
  expect(errors).toEqual([]);
});

test("a disabled 'set', bean 'save' and grinder 'save' look as the steam page's 'set timer' when off", async ({ page }) => {
  await mockGateway(page);
  await page.goto('/');
  await toPage(page, 'steam');
  const timer = page.getByTestId('steam-set-timer');
  await expect(timer).toBeDisabled();
  const off = await look(timer);
  expect(off).toMatchObject({
    color: await colour(page, 'var(--dim)'),
    background: await colour(page, 'var(--panel)'),
    border: await colour(page, 'var(--line)'),
    opacity: '1',
  });

  // The number pad's 'set' with nothing typed.
  await page.goto('/');
  await page.getByTestId('menu').click();
  await page.getByTestId('open-settings').click();
  await page.getByTestId('settings-category-skin').click();
  await page.getByTestId('setting-adjust-1').click();
  await page.getByTestId('numpad-clear').click();
  const set = page.getByTestId('numpad-confirm');
  await expect(set).toBeDisabled();
  expect(await look(set)).toMatchObject(off);
  await page.screenshot({ path: 'e2e/.results/off-numpad.png' });
  await page.getByTestId('numpad-cancel').click();
  await back(page);

  await page.getByTestId('menu').click();
  await page.getByTestId('open-beans').click();
  const bean = page.getByTestId('bean-save');
  await expect(bean).toBeDisabled();
  expect(await look(bean)).toMatchObject(off);
  await page.screenshot({ path: 'e2e/.results/off-bean.png' });
  await page.getByTestId('beans-kind-grinders').click();
  const grinder = page.getByTestId('grinder-save');
  await expect(grinder).toBeDisabled();
  expect(await look(grinder)).toMatchObject(off);
  expect(errors).toEqual([]);
});
