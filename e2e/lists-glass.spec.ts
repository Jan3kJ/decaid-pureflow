import { expect, test } from '@playwright/test';
import { mockGateway, profile } from './mock-gateway';

// The lists in glass: rows on one glass panel with faint separators and no box of their own, the
// chosen row with the lit edge, fields as a bottom line that lights while typed in. It writes
// test-results/lists-glass-*.png for the commit.

test.use({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });

test('the history: entries are borderless rows on one glass panel', async ({ page }) => {
  const gateway = await mockGateway(page);
  const light = profile('A-Flow / default-light', 48, 9);
  gateway.addShot('shot-1', '2026-10-10T08:00:00.000000', light, { coffeeName: 'Red Brick', coffeeRoaster: 'Square Mile' });
  gateway.addShot('shot-2', '2026-10-12T08:00:00.000000', profile('Best practice', 40, 4), {});
  await page.goto('/');
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'Idle');
  await page.getByTestId('history-handle').click();
  await expect(page.getByTestId('history-entry')).toHaveCount(2);

  const row = await page
    .getByTestId('history-entry')
    .first()
    .evaluate((node) => {
      const style = getComputedStyle(node);
      return { background: style.backgroundColor, border: style.borderTopColor, image: style.backgroundImage };
    });
  expect(row.background).toBe('rgba(0, 0, 0, 0)');
  expect(row.border).toBe('rgba(0, 0, 0, 0)');
  expect(row.image).toBe('none');
  const list = await page.getByTestId('history-list').evaluate((node) => getComputedStyle(node).backgroundImage);
  expect(list).toContain('gradient');
  const separator = await page
    .getByTestId('history-list')
    .locator('li')
    .nth(1)
    .evaluate((node) => getComputedStyle(node).borderTopWidth);
  expect(separator).toBe('1px');
  await page.waitForTimeout(600); // the sheet has slid in
  await page.screenshot({ path: 'test-results/lists-glass-history.png' });
});

test('beans: the chosen row is lit, the form fields are bottom lines and glow while typed in', async ({ page }) => {
  await mockGateway(page);
  await page.goto('/');
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'Idle');
  await page.getByTestId('menu').click();
  await page.getByTestId('open-beans').click();
  await expect(page.getByTestId('screen-beans')).toBeVisible();
  for (const [name, roaster] of [
    ['Red Brick', 'Square Mile'],
    ['Gesha', 'Tim Wendelboe'],
  ]) {
    await page.getByTestId('beans-add').click();
    await page.getByTestId('bean-name').fill(name);
    await page.getByTestId('bean-roaster').fill(roaster);
    await page.getByTestId('bean-save').click();
    await expect(page.getByTestId('bean-form').locator('h2')).toHaveText(`${roaster} · ${name}`);
  }
  const rows = page.getByTestId('bean-row');
  await expect(rows).toHaveCount(2);
  const lit = await rows.first().evaluate((node) => getComputedStyle(node).boxShadow);
  const plain = await rows.nth(1).evaluate((node) => getComputedStyle(node).boxShadow);
  expect(lit).not.toBe('none');
  expect(plain).toBe('none');

  const field = page.getByTestId('bean-name');
  const idle = await field.evaluate((node) => {
    const style = getComputedStyle(node);
    return { background: style.backgroundColor, top: style.borderTopWidth, bottom: style.borderBottomWidth, shadow: style.boxShadow };
  });
  expect(idle).toEqual({ background: 'rgba(0, 0, 0, 0)', top: '0px', bottom: '1px', shadow: 'none' });
  await field.focus();
  expect(await field.evaluate((node) => getComputedStyle(node).boxShadow)).not.toBe('none');
  await page.screenshot({ path: 'test-results/lists-glass-beans.png' });

  await page.getByTestId('beans-add').click();
  await page.getByTestId('bean-name').fill('Kenya AA');
  await page.getByTestId('bean-roast-date').click();
  await expect(page.getByTestId('datepicker')).toBeVisible();
  await page.screenshot({ path: 'test-results/lists-glass-date.png' });
  await page.getByTestId('datepicker-cancel').click();
  await page.screenshot({ path: 'test-results/lists-glass-bean-form.png' });
});
