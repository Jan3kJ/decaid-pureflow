import { expect, type Locator, type Page } from '@playwright/test';

/** Opens the date picker from its field and taps the ISO date, stepping by month to it. */
export async function pickDate(page: Page, field: Locator, iso: string) {
  await field.click();
  const picker = page.getByTestId('datepicker');
  await expect(picker).toBeVisible();
  const target = iso.slice(0, 7);
  const month = page.getByTestId('datepicker-month');
  for (let steps = 0; steps < 240; steps += 1) {
    const shown = (await month.getAttribute('data-month'))!;
    if (shown === target) break;
    const before = shown;
    await page.getByTestId(shown < target ? 'datepicker-next' : 'datepicker-prev').click();
    await expect(month).not.toHaveAttribute('data-month', before);
  }
  await page.getByTestId(`datepicker-day-${iso}`).click();
  await expect(picker).toHaveCount(0);
}
