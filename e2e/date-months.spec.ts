import { expect, test, type Page } from '@playwright/test';
import { mockGateway } from './mock-gateway';
import { dragGrid, pickDate } from './date-picker';
import { flick } from './touch';

// The date picker scrolls through the months against the
// mocked gateway: a vertical drag on the day grid moves the shown month, up to the later one, and
// settles on whole months; a quick flick passes several; the wheel steps too; a drag is no tap,
// a tap picks; the buttons stay.

const errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await mockGateway(page);
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

async function openPicker(page: Page, iso: string) {
  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText('Idle');
  await page.getByTestId('menu').click();
  await page.getByTestId('open-beans').click();
  await expect(page.getByTestId('screen-beans')).toBeVisible();
  const field = page.getByTestId('bean-roast-date');
  await pickDate(page, field, iso);
  await field.click();
  await expect(page.getByTestId('datepicker')).toBeVisible();
  return field;
}

test('a vertical drag on the day grid moves the month by whole months, the year rolling over', async ({ page }) => {
  const field = await openPicker(page, '2026-12-08');
  const shown = page.getByTestId('datepicker-month');
  const height = (await page.getByTestId('datepicker-grid').boundingBox())!.height;
  await expect(shown).toHaveAttribute('data-month', '2026-12');

  // One grid height up: the next month, into the next year; the title follows.
  await dragGrid(page, -height, { x: 30, y: height - 20 });
  await expect(shown).toHaveAttribute('data-month', '2027-01');
  await expect(page.getByTestId('datepicker-month-name')).toHaveText('January');
  await expect(page.getByTestId('datepicker-year')).toHaveText('2027');
  // The grid settles on the month: its first day sits in the grid's first row.
  const grid = (await page.getByTestId('datepicker-grid').boundingBox())!;
  await expect.poll(async () => (await page.getByTestId('datepicker-day-2027-01-01').boundingBox())!.y - grid.y).toBeLessThan(10);

  // One down: the previous month, back into the year before; two down, two back.
  await dragGrid(page, height, { x: 30, y: 20 });
  await expect(shown).toHaveAttribute('data-month', '2026-12');
  await dragGrid(page, height * 0.4);
  await expect(shown).toHaveAttribute('data-month', '2026-12');
  await dragGrid(page, height * 0.6, { x: 30, y: 20 });
  await expect(shown).toHaveAttribute('data-month', '2026-11');

  // A quick flick passes several months.
  const box = (await page.getByTestId('datepicker-grid').boundingBox())!;
  await flick(page, { x: box.x + 30, y: box.y + box.height - 10 }, { x: box.x + 30, y: box.y + box.height - 10 - height * 1.2 });
  await expect.poll(async () => (await shown.getAttribute('data-month'))! >= '2027-01').toBe(true);

  // A slanted drag, up and to the right as the swipe back goes, still moves the month and
  // leaves the beans page where it is.
  const before = (await shown.getAttribute('data-month'))!;
  await dragGrid(page, -height, { x: 20, y: height - 20 }, 80);
  await expect(shown).not.toHaveAttribute('data-month', before);

  // The drags started no swipe of the page behind; nothing was picked.
  await expect(page.getByTestId('screen-beans')).toBeVisible();
  await page.getByTestId('datepicker-cancel').click();
  await expect(field).toHaveText('2026-12-08');
});

test('a drag of a few pixels on a day does not pick it, a tap does; the wheel and the buttons step', async ({ page }) => {
  const field = await openPicker(page, '2026-10-08');
  const shown = page.getByTestId('datepicker-month');
  const day = page.getByTestId('datepicker-day-2026-10-15');
  const at = (await day.boundingBox())!;
  const grid = (await page.getByTestId('datepicker-grid').boundingBox())!;
  await dragGrid(page, -10, { x: at.x - grid.x + at.width / 2, y: at.y - grid.y + at.height / 2 });
  await expect(shown).toHaveAttribute('data-month', '2026-10');
  await expect(page.getByTestId('datepicker')).toBeVisible();
  await expect(field).toHaveText('2026-10-08');

  // The wheel: down shows the later month, up the earlier one, one per notch.
  await page.mouse.move(grid.x + grid.width / 2, grid.y + grid.height / 2);
  await page.mouse.wheel(0, 100);
  await expect(shown).toHaveAttribute('data-month', '2026-11');
  await page.mouse.wheel(0, -100);
  await expect(shown).toHaveAttribute('data-month', '2026-10');
  await page.mouse.wheel(0, -100);
  await expect(shown).toHaveAttribute('data-month', '2026-09');

  // The buttons stay.
  await page.getByTestId('datepicker-next').click();
  await expect(shown).toHaveAttribute('data-month', '2026-10');
  await page.getByTestId('datepicker-year').click();
  await page.getByTestId('datepicker-prev').click();
  await expect(shown).toHaveAttribute('data-month', '2025-10');
  await page.getByTestId('datepicker-next').click();
  await expect(shown).toHaveAttribute('data-month', '2026-10');

  await day.tap();
  await expect(page.getByTestId('datepicker')).toHaveCount(0);
  await expect(field).toHaveText('2026-10-15');
});
