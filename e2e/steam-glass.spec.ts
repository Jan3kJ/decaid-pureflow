import { expect, test } from '@playwright/test';
import { mockGateway } from './mock-gateway';
import { toPage } from './touch';

// Steam in glass: the timer a thin lit number in the time colour, the chips edge-only glass chips
// that light when selected, mug and milk lines without a box, and the screenshots of idle and running.

test.use({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });

test('the steam timer is a thin lit number, the chips are glass and mug and milk have no box', async ({ page }) => {
  const gateway = await mockGateway(page);
  await page.goto('/');
  await toPage(page, 'steam');
  await expect(page.getByTestId('screen-steam')).toBeVisible();
  gateway.putOnScale(525);
  await expect(page.getByTestId('steam-milk')).toHaveText('300 g');

  const timer = await page.getByTestId('steam-timer').evaluate((node) => {
    const style = getComputedStyle(node);
    return { weight: style.fontWeight, shadow: style.textShadow, color: style.color };
  });
  expect(timer.weight).toBe('300');
  expect(timer.shadow).not.toBe('none');
  const time = await page.evaluate(() => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--time)';
    document.body.append(probe);
    const colour = getComputedStyle(probe).color;
    probe.remove();
    return colour;
  });
  expect(timer.color).toBe(time);

  for (const id of ['steam-favourite', 'steam-adjust']) {
    const chip = page.getByTestId(id).first();
    const look = await chip.evaluate((node) => {
      const style = getComputedStyle(node);
      return { background: style.backgroundColor, image: style.backgroundImage, radius: parseFloat(style.borderTopLeftRadius) };
    });
    expect(look.background).toBe('rgba(0, 0, 0, 0)');
    expect(look.image).toBe('none');
    expect(look.radius).toBeGreaterThan(30);
  }
  await page.getByTestId('steam-adjust').nth(1).click();
  const selected = page.locator('[data-testid="steam-adjust"][aria-pressed="true"]');
  await expect(selected).toHaveCount(1);
  expect(await selected.evaluate((node) => getComputedStyle(node).boxShadow)).not.toBe('none');

  for (const id of ['steam-mug-weight', 'steam-milk']) {
    const line = page.getByTestId(id).locator('xpath=..');
    const look = await line.evaluate((node) => {
      const style = getComputedStyle(node);
      return { background: style.backgroundColor, border: style.borderTopColor };
    });
    expect(look.background).toBe('rgba(0, 0, 0, 0)');
    expect(look.border).toBe('rgba(0, 0, 0, 0)');
  }
  await page.screenshot({ path: 'test-results/steam-glass-idle.png' });

  await page.getByTestId('steam-set-timer').click();
  gateway.steamFor(10);
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'Steam');
  await expect(page.getByTestId('steam-stop')).toBeVisible();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/steam-glass-running.png' });
});
