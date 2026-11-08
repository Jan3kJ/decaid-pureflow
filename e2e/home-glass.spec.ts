import { expect, test } from '@playwright/test';
import { mockGateway } from './mock-gateway';

// Home in glass: the cards and the picker's rows are glass, the right column's live numbers are
// thin with a glow in their colour, the captions are small capitals, and the ring's arc glows in
// the flow's blue. It writes test-results/home-glass-*.png for the commit.

test.use({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });

test('home: glass cards, thin lit numbers, small-capital captions, the ring glows; the picker is glass', async ({ page }) => {
  const gateway = await mockGateway(page);
  await page.goto('/');
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'Idle');

  for (const id of ['open-profiles', 'open-pick']) {
    const card = await page.getByTestId(id).evaluate((node) => {
      const style = getComputedStyle(node.closest<HTMLElement>('.profile') ?? node);
      return { image: style.backgroundImage, border: style.borderTopWidth };
    });
    expect(card.image).toContain('gradient');
    expect(card.border).toBe('1px');
  }
  for (const id of ['shot-timer', 'shot-weight', 'shot-pressure', 'shot-flow', 'shot-temperature']) {
    const number = await page.getByTestId(id).evaluate((node) => {
      const style = getComputedStyle(node);
      return { weight: style.fontWeight, shadow: style.textShadow };
    });
    expect(number.weight, id).toBe('300');
    expect(number.shadow, id).not.toBe('none');
  }
  for (const id of ['shot-timer-label', 'shot-weight-label']) {
    await expect(page.getByTestId(id)).toHaveCSS('text-transform', 'uppercase');
  }
  await page.screenshot({ path: 'test-results/home-glass-idle.png' });

  gateway.waterFor('flush', 6, 6, 90);
  await expect(page.getByTestId('water-view')).toHaveCount(1);
  await page.waitForTimeout(1200);
  const arc = await page.locator('[data-testid="water-ring"] .glow-arc').evaluate((node) => {
    const style = getComputedStyle(node);
    return { opacity: style.opacity, width: parseFloat(style.strokeWidth) };
  });
  expect(Number(arc.opacity)).toBeLessThan(0.3);
  expect(arc.width).toBeGreaterThan(5);
  await page.screenshot({ path: 'test-results/home-glass-ring.png' });
});

test('the picker: the rows are glass with the faint edge, a selected row lights', async ({ page }) => {
  await mockGateway(page);
  await page.goto('/');
  await page.getByTestId('open-profiles').click();
  const row = page.getByTestId('profile-item').first();
  await expect(row).toBeVisible();
  const look = await row.evaluate((node) => {
    const style = getComputedStyle(node);
    return { image: style.backgroundImage, border: style.borderTopColor };
  });
  expect(look.image).toContain('gradient');
  expect(look.border).toBe('rgba(255, 255, 255, 0.07)');
  await row.click();
  await expect(row).toHaveAttribute('aria-pressed', 'true');
  expect(await row.evaluate((node) => getComputedStyle(node).boxShadow)).not.toBe('none');
  await page.screenshot({ path: 'test-results/home-glass-picker.png' });
});
