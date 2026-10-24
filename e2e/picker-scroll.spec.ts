import { expect, test } from '@playwright/test';
import { mockGateway, profile, record } from './mock-gateway';

// The picker opens on the loaded profile, not at the top of the list (founder, 2026-10-24).

test('the picker scrolls to the loaded profile', async ({ page }) => {
  const gateway = await mockGateway(page);
  for (let i = 0; i < 40; i++)
    gateway.profiles.push(record(`profile:s${i}`, profile(`Stored / ${String(i).padStart(2, '0')}`, 40, 4)));
  const deep = profile('Stored / deep', 40, 4);
  gateway.profiles.push(record('profile:deep', deep));
  for (let i = 40; i < 50; i++) gateway.profiles.push(record(`profile:s${i}`, profile(`Stored / ${i}`, 40, 4)));
  gateway.workflow.profile = deep;

  await page.goto('/');
  await page.getByTestId('open-profiles').click();
  const row = page.locator('[data-testid="profile-item"][data-loaded="true"]');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('Stored / deep');
  const inside = async () => {
    const list = (await page.getByTestId('profile-list').boundingBox())!;
    const box = (await row.boundingBox())!;
    return box.y >= list.y - 1 && box.y + box.height <= list.y + list.height + 1;
  };
  await expect.poll(inside).toBe(true);
  await page.screenshot({ path: 'docs/product/picker-scrolled.png' });
});
