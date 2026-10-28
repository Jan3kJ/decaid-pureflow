import { expect, test, type Page } from '@playwright/test';
import { mockGateway, profile, record } from './mock-gateway';
import { swipe } from './touch';

// The picker's delete (spec 3.10 'Profile picker: delete a profile', acceptance 60), against a
// mocked gateway: a swipe from right to left on a stored profile's row shows 'delete', which
// asks once and then sends `DELETE /api/v1/profiles/{id}`; the row leaves the list. The skin's
// defaults and the loaded profile do not open; a vertical drag still scrolls the list, a tap
// still selects, and no swipe on a row moves the shell's pages.

const errors: string[] = [];

test.beforeEach(({ page }) => {
  errors.length = 0;
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
});

const item = (page: Page, title: string) => page.getByTestId('profile-item').filter({ hasText: title });

/** A finger's swipe along a row, from near its right end `dx` pixels across. */
async function swipeRow(page: Page, title: string, dx: number) {
  const box = (await item(page, title).boundingBox())!;
  const from = { x: box.x + box.width - 60, y: box.y + box.height / 2 };
  await swipe(page, from, { x: from.x + dx, y: from.y + 4 });
}

async function picker(page: Page) {
  await page.goto('/');
  await page.getByTestId('open-profiles').click();
  await expect(item(page, 'D-Flow / default')).toHaveCount(1);
}

test('a swipe to the left shows delete, which asks once; cancel keeps the profile, Delete removes it', async ({ page }) => {
  const gateway = await mockGateway(page);
  await picker(page);
  const deletes = () => gateway.requests.filter((request) => request.method === 'DELETE').map((request) => request.path);

  await swipeRow(page, 'D-Flow / default', -200);
  const button = page.getByTestId('profile-delete');
  await expect(button).toHaveCount(1);
  await expect(button).toBeVisible();
  await expect(page.getByTestId('screen-profiles')).toBeVisible();
  // The swipe selected nothing.
  await expect(page.locator('[data-testid="profile-item"][aria-pressed="true"]')).toHaveCount(0);
  await page.screenshot({ path: 'docs/product/picker-delete.png' });

  await button.click();
  const confirm = page.getByTestId('settings-confirm');
  await expect(confirm).toContainText('Delete D-Flow / default?');
  await page.getByTestId('settings-confirm-cancel').click();
  await expect(confirm).toHaveCount(0);
  expect(deletes()).toEqual([]);
  await expect(item(page, 'D-Flow / default')).toHaveCount(1);
  // Cancel is a tap outside the row: it closes too.
  await expect(button).toHaveCount(0);

  // A swipe back to the right closes the row.
  await swipeRow(page, 'D-Flow / default', -200);
  await expect(button).toHaveCount(1);
  await swipeRow(page, 'D-Flow / default', 200);
  await expect(button).toHaveCount(0);

  // Selected first, as the founder put it, then swiped and deleted.
  await item(page, 'D-Flow / default').click();
  await expect(page.getByTestId('profile-detail').locator('h1')).toHaveText('D-Flow / default');
  await swipeRow(page, 'D-Flow / default', -200);
  await button.click();
  await page.getByTestId('settings-confirm-ok').click();
  await expect(item(page, 'D-Flow / default')).toHaveCount(0);
  expect(deletes()).toEqual(['/api/v1/profiles/profile%3Adflow']);
  // One of Decaid's bundled profiles: hidden, not deleted.
  expect(gateway.profiles.find((stored) => stored.id === 'profile:dflow')?.visibility).toBe('hidden');
  await expect(page.getByTestId('profile-detail').locator('h1')).toHaveCount(0);
  await expect(item(page, 'Best practice')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("the skin's defaults and the loaded profile do not open; the loaded one says why", async ({ page }) => {
  const gateway = await mockGateway(page);
  gateway.workflow.profile = gateway.profiles[0].profile;
  await picker(page);

  await swipeRow(page, 'A-Flow / default-light', -200);
  await expect(page.getByTestId('profile-delete')).toHaveCount(0);

  await swipeRow(page, 'Best practice', -200);
  await expect(page.getByTestId('profile-delete')).toHaveCount(0);
  await expect(page.getByTestId('profile-refusal')).toHaveText('loaded on the machine: load another first');
  // The next tap takes the note away.
  await item(page, 'Adaptive v2').click();
  await expect(page.getByTestId('profile-refusal')).toHaveCount(0);
  expect(gateway.requests.filter((request) => request.method === 'DELETE')).toEqual([]);
  expect(errors).toEqual([]);
});

test('a vertical drag scrolls the list, a tap selects, and a tap elsewhere closes an open row', async ({ page }) => {
  const gateway = await mockGateway(page);
  for (let i = 10; i < 40; i += 1) gateway.profiles.push(record(`profile:extra${i}`, profile(`Extra ${i}`, i), null));
  await picker(page);

  const list = page.getByTestId('profile-list');
  const box = (await item(page, 'Extra 20').boundingBox())!;
  // A drag, not a fling: the finger rests before it lifts, so the list is at rest when the next
  // row is measured and dragged (a fling still scrolls it on the CI's runner, spec 3.20).
  await swipe(page, { x: box.x + box.width / 2, y: 700 }, { x: box.x + box.width / 2 + 6, y: 300 }, 120);
  await expect.poll(() => list.evaluate((node) => node.scrollTop)).toBeGreaterThan(100);
  await expect(page.getByTestId('profile-delete')).toHaveCount(0);

  await item(page, 'Extra 30').click();
  await expect(page.getByTestId('profile-detail').locator('h1')).toHaveText('Extra 30');

  // A mouse's drag opens a row as a finger's does; a tap on the filter closes it again.
  const row = (await item(page, 'Extra 31').boundingBox())!;
  await page.mouse.move(row.x + row.width - 40, row.y + row.height / 2);
  await page.mouse.down();
  await page.mouse.move(row.x + row.width - 140, row.y + row.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByTestId('profile-delete')).toBeVisible();
  await expect(page.getByTestId('profile-detail').locator('h1')).toHaveText('Extra 30');
  await page.getByTestId('profile-filter').click();
  await expect(page.getByTestId('profile-delete')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("a failed delete is the picker's error line", async ({ page }) => {
  const gateway = await mockGateway(page);
  await picker(page);
  // Gone from the gateway meanwhile: Decaid answers 404.
  gateway.profiles = gateway.profiles.filter((stored) => stored.id !== 'profile:adaptive');
  await swipeRow(page, 'Adaptive v2', -200);
  await page.getByTestId('profile-delete').click();
  await page.getByTestId('settings-confirm-ok').click();
  await expect(page.getByTestId('profiles-error')).toContainText('The profile could not be deleted');
});
