import { expect, test } from '@playwright/test';
import { mockGateway, profile, record } from './mock-gateway';

// The description's lower border is the accent while more of its text lies below the visible
// part; at the end of the text, and for a text that fits, it is as the others.

const LONG = Array.from({ length: 40 }, (_, i) => `Line ${i + 1} of a long description.`).join('\n');

test('a long description has the accent lower border until scrolled to its end, a short one never has it', async ({ page }) => {
  const gateway = await mockGateway(page);
  const long = { ...profile('Stored / long', 40, 2), notes: LONG };
  gateway.profiles.push(record('profile:long', long, null));
  gateway.profiles.push(record('profile:short', { ...profile('Stored / short', 40, 2), notes: 'Short.' }, null));
  gateway.workflow.profile = long;

  await page.goto('/');
  await page.getByTestId('open-profiles').click();
  await expect(page.getByTestId('profile-detail').locator('h1')).toHaveText('Stored / long');
  const description = page.getByTestId('profile-description');
  const bottom = () => description.evaluate((el) => getComputedStyle(el).borderBottomColor);
  const side = await description.evaluate((el) => getComputedStyle(el).borderTopColor);
  const accent = await page.evaluate(() => {
    const probe = document.createElement('div');
    probe.style.color = 'var(--accent)';
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  });

  await expect(description).toHaveAttribute('data-more', 'true');
  await expect.poll(bottom).toBe(accent);

  await description.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
  await expect(description).toHaveAttribute('data-more', 'false');
  await expect.poll(bottom).toBe(side);

  // Back up a little: more below again.
  await description.evaluate((el) => el.scrollTo({ top: el.scrollHeight / 2 }));
  await expect(description).toHaveAttribute('data-more', 'true');

  // The short one fits and never has it.
  await page.getByTestId('profile-item').filter({ hasText: 'Stored / short' }).click();
  await expect(page.getByTestId('profile-detail').locator('h1')).toHaveText('Stored / short');
  await expect(description).toHaveAttribute('data-more', 'false');
  await expect.poll(bottom).toBe(side);

  // Back on the long one, its text starts at the top with the border.
  await page.getByTestId('profile-item').filter({ hasText: 'Stored / long' }).click();
  await expect(description).toHaveAttribute('data-more', 'true');
  expect(await description.evaluate((el) => el.scrollTop)).toBe(0);
});
