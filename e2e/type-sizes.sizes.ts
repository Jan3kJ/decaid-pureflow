import { expect, test, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import blooming from '../src/steps/fixtures/bundled-profiles.json' with { type: 'json' };
import type { Profile } from '../src/api';
import { SETTINGS_TREE } from '../src/settings-page/tree';
import { mockGateway, profile, type MockGateway } from './mock-gateway';
import { toPage } from './touch';

// `npm run type-sizes` (scripts/type-sizes.mjs): every text's computed size and weight per screen
// on the mock gateway at the design target, grouped by the role whose token gives that size
// (spec 3.14, 'One size per kind of text'). It writes the listing to TYPE_SIZES_OUT and, with
// TYPE_SIZES_SHOTS, a picture of each screen into that folder.

/** The role tokens of src/app.css, in rem. */
const ROLES: [string, number][] = [
  ['label', 0.85],
  ['body', 1.1],
  ['value', 1.3],
  ['title', 1.6],
  ['large', 2.2],
  ['big', 3.6],
];

interface Text {
  size: number;
  weight: string;
  svg: boolean;
  text: string;
}

const screens: { name: string; texts: Text[] }[] = [];

/** Every visible text node's size and weight on the page as it is now. */
async function record(page: Page, name: string) {
  await page.waitForTimeout(400);
  const texts = await page.evaluate(() => {
    const out: { size: number; weight: string; svg: boolean; text: string }[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent?.trim();
      const parent = node.parentElement;
      if (!text || !parent || parent.closest('style, script')) continue;
      if (!parent.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
      const box = parent.getBoundingClientRect();
      if (box.width === 0 || box.height === 0 || box.right <= 0 || box.left >= innerWidth || box.bottom <= 0 || box.top >= innerHeight)
        continue;
      const style = getComputedStyle(parent);
      out.push({
        size: parseFloat(style.fontSize),
        weight: style.fontWeight,
        svg: parent.closest('svg') !== null,
        text: text.slice(0, 24),
      });
    }
    return out;
  });
  screens.push({ name, texts });
  const shots = process.env.TYPE_SIZES_SHOTS;
  if (shots)
    await page.screenshot({ path: `${shots}/${name.replace(/[^a-z0-9]+/gi, '-')}.png`, animations: 'disabled', caret: 'hide' });
  console.log(`${name}: ${texts.length} texts`);
}

async function gatewayFor(page: Page): Promise<MockGateway> {
  const gateway = (await mockGateway(page)).withDefaults('medium');
  gateway.workflow.context = {
    ...gateway.workflow.context,
    coffeeName: 'House Blend',
    coffeeRoaster: 'Example Roasters',
    grinderModel: 'Hand grinder',
    grinderSetting: '5.5',
  };
  const at = '2026-10-18T10:00:00.000';
  gateway.beans = [
    { id: 'b1', name: 'House Blend', roaster: 'Example Roasters', decaf: false, archived: false, createdAt: at, updatedAt: at },
    {
      id: 'b2',
      name: 'Washed Single Origin',
      roaster: 'Sample Coffee Co',
      decaf: false,
      archived: false,
      createdAt: at,
      updatedAt: at,
    },
  ];
  gateway.grinders = [
    { id: 'g1', model: 'Hand grinder', archived: false, settingType: 'numeric', settingSmallStep: 0.5, createdAt: at, updatedAt: at },
  ];
  gateway.addShot('shot-1', '2026-10-17T08:00:00.000000', profile('A-Flow / default-medium', 42, 9), {
    coffeeName: 'House Blend',
    coffeeRoaster: 'Example Roasters',
    targetYield: 42,
  });
  return gateway;
}

async function home(page: Page) {
  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText('Idle');
}

test('every screen', async ({ page }) => {
  test.setTimeout(240_000);
  const gateway = await gatewayFor(page);
  await home(page);
  await record(page, 'home');

  await page.getByTestId('menu').click();
  await record(page, 'home, menu');
  await home(page);

  await page.getByTestId('history-handle').tap();
  await expect(page.getByTestId('history-entry')).toHaveCount(1);
  await record(page, 'history');
  await home(page);

  await page.getByTestId('open-pick').click();
  await expect(page.getByTestId('pick')).toBeVisible();
  await record(page, 'bean pick');
  await home(page);

  await toPage(page, 'steam');
  await record(page, 'steam');
  await home(page);
  await toPage(page, 'hot-water');
  await record(page, 'hot water');

  for (const screen of ['profiles', 'editor'] as const) {
    await page.evaluate((name) => localStorage.setItem('pureflow.screen', name), screen);
    await page.goto('/');
    await page.waitForTimeout(600);
    await record(page, screen === 'profiles' ? 'picker' : 'editor');
  }

  await page.evaluate(() => localStorage.setItem('pureflow.screen', 'beans'));
  await page.goto('/');
  await expect(page.getByTestId('bean-row').first()).toBeVisible();
  await record(page, 'beans');
  await page.getByTestId('bean-row').first().click();
  await record(page, 'bean form');
  await page.getByTestId('beans-kind-grinders').click();
  await expect(page.getByTestId('grinder-row').first()).toBeVisible();
  await record(page, 'grinders');

  for (const category of SETTINGS_TREE) {
    await page.evaluate(() => localStorage.setItem('pureflow.screen', 'settings'));
    await page.goto('/');
    await page.getByTestId(`settings-category-${category.id}`).click();
    await record(page, `settings ${category.number}. ${category.name}`);
  }

  // The step editor: a profile that is not A-Flow 3.0.
  const mine = { ...structuredClone(blooming.find((entry) => entry.title === 'Blooming Espresso') as Profile), title: 'My blooming' };
  gateway.workflow.profile = mine;
  await page.evaluate(() => localStorage.setItem('pureflow.screen', 'editor'));
  await page.goto('/');
  await expect(page.getByTestId('step-cards')).toBeVisible();
  await record(page, 'step editor');

  const rem = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
  const role = (size: number) => ROLES.find(([, value]) => Math.abs(value * rem - size) < 0.05)?.[0];
  const lines: string[] = [`root ${rem}px; roles: ${ROLES.map(([name, value]) => `${name} ${value}rem`).join(', ')}`];
  const offScale = new Map<string, number>();
  const used = new Set<string>();
  for (const { name, texts } of screens) {
    lines.push('', `== ${name}`);
    const groups = new Map<string, Text[]>();
    for (const text of texts) {
      const rems = +(text.size / rem).toFixed(3);
      const key = `${text.svg ? 'svg ' : ''}${role(text.size) ?? `off-scale ${rems}rem`} ${text.weight}`;
      groups.set(key, [...(groups.get(key) ?? []), text]);
      if (!text.svg) {
        used.add(`${rems}rem`);
        if (!role(text.size)) offScale.set(`${rems}rem`, (offScale.get(`${rems}rem`) ?? 0) + 1);
      }
    }
    for (const [key, group] of [...groups].sort()) {
      const samples = [...new Set(group.map((text) => text.text))].slice(0, 6).join(' | ');
      lines.push(`  ${key.padEnd(28)} ${String(group.length).padStart(3)}  ${samples}`);
    }
  }
  const total = screens.reduce((sum, { texts }) => sum + texts.filter((text) => !text.svg).length, 0);
  const off = [...offScale.values()].reduce((sum, count) => sum + count, 0);
  lines.push(
    '',
    `summary: ${screens.length} screens, ${total} texts outside SVG in ${used.size} sizes; ${off} off the roles' scale in ${offScale.size} sizes` +
      (offScale.size
        ? `: ${[...offScale]
            .sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]))
            .map(([size, count]) => `${size} x${count}`)
            .join(', ')}`
        : ''),
  );
  writeFileSync(process.env.TYPE_SIZES_OUT ?? 'e2e/.results/type-sizes.txt', lines.join('\n') + '\n');
});
