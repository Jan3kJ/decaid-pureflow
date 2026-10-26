import { expect, test, type Page } from '@playwright/test';
import { mockGateway, type MockGateway } from './mock-gateway';
import { pickDate } from './date-picker';
import { saveAnswered, slowSave } from './catalogue-save';

// The bean and grinder catalogue and the pick for the next shot (spec 3.9 item 19, acceptance
// 52's first half, research.md 29.8) against the mocked gateway: home's menu opens the screen;
// a bean and a grinder are added, edited, archived after a confirm, listed again with 'show
// archived' and restored; home's chip opens the pick, which writes bean, grinder and setting in
// one `PUT /api/v1/workflow`. The same against the running gateway: e2e-rig/beans.spec.ts.

const errors: string[] = [];
let gateway: MockGateway;

test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  gateway = await mockGateway(page);
});

test.afterEach(() => {
  expect(errors).toEqual([]);
});

async function openBeans(page: Page) {
  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText('Idle');
  await page.getByTestId('menu').click();
  await page.getByTestId('open-beans').click();
  await expect(page.getByTestId('screen-beans')).toBeVisible();
}

const noSideScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test('a bean is added with name and roaster typed, edited, archived, listed with show archived and restored', async ({ page }) => {
  await openBeans(page);
  await expect(page.getByTestId('beans-empty')).toHaveText('No beans yet.');
  // Name and roaster are required.
  await expect(page.getByTestId('bean-save')).toBeDisabled();
  await page.getByTestId('bean-name').fill('Red Brick');
  await expect(page.getByTestId('bean-save')).toBeDisabled();
  await page.getByTestId('bean-roaster').fill('Square Mile');
  await pickDate(page, page.getByTestId('bean-roast-date'), '2026-10-08');
  await page.getByTestId('bean-save').click();

  // The bean, then its first bag with the roast date.
  await expect(page.getByTestId('bean-row')).toHaveCount(1);
  await expect(page.getByTestId('bean-row')).toContainText('Square Mile · Red Brick');
  await expect(page.getByTestId('bean-row')).toContainText('roasted 2026-10-08');
  expect(gateway.calls('POST', '/api/v1/beans').map((call) => call.body)).toEqual([{ name: 'Red Brick', roaster: 'Square Mile' }]);
  const bean = gateway.beans[0];
  expect(gateway.calls('POST', `/api/v1/beans/${bean.id}/batches`).map((call) => call.body)).toEqual([{ roastDate: '2026-10-08' }]);
  await expect(page.getByTestId('bean-form').locator('h2')).toHaveText('Square Mile · Red Brick');

  // An edit sends only what changed; a field another app wrote stays.
  gateway.beans[0] = { ...bean, country: 'Brazil' };
  // The gateway answers slowly: the check waits for the save's answer, not for a disabled save.
  await slowSave(page, `/api/v1/beans/${bean.id}`);
  await page.getByTestId('bean-notes').fill('chocolate');
  const beanSaved = saveAnswered(page, `/api/v1/beans/${bean.id}`);
  await page.getByTestId('bean-save').click();
  await beanSaved;
  await expect(page.getByTestId('bean-save')).toBeDisabled();
  expect(gateway.calls('PUT', `/api/v1/beans/${bean.id}`).map((call) => call.body)).toEqual([{ notes: 'chocolate' }]);
  expect(gateway.beans[0]).toMatchObject({ notes: 'chocolate', country: 'Brazil' });
  await page.screenshot({ path: 'docs/product/beans.png' });

  // Archive asks first; Cancel leaves it.
  await page.getByTestId('bean-archive').click();
  await expect(page.getByTestId('settings-confirm')).toContainText('Archive Square Mile · Red Brick?');
  await page.getByTestId('settings-confirm-cancel').click();
  expect(gateway.beans[0].archived).toBe(false);
  await page.getByTestId('bean-archive').click();
  await page.getByTestId('settings-confirm-ok').click();
  await expect(page.getByTestId('bean-row')).toHaveCount(0);
  expect(gateway.calls('PUT', `/api/v1/beans/${bean.id}`).at(-1)!.body).toEqual({ archived: true });

  // Show archived lists it again, to restore it.
  await page.getByTestId('beans-show-archived').click();
  await expect(page.getByTestId('bean-row')).toContainText('archived');
  await page.getByTestId('bean-row').click();
  await expect(page.getByTestId('bean-archived')).toBeVisible();
  await page.getByTestId('bean-restore').click();
  await expect(page.getByTestId('bean-archive')).toBeVisible();
  await page.getByTestId('beans-show-archived').click();
  await expect(page.getByTestId('bean-row')).toHaveCount(1);
  expect(gateway.beans[0].archived).toBe(false);
  expect(await noSideScroll(page)).toBe(true);
});

test('the roast date is picked on the skin picker: a day sets it, clear empties it, cancel changes nothing', async ({ page }) => {
  await openBeans(page);
  await page.getByTestId('bean-name').fill('Red Brick');
  await page.getByTestId('bean-roaster').fill('Square Mile');
  const field = page.getByTestId('bean-roast-date');
  await expect(field).toHaveText('no roast date');
  expect(await page.locator('input[type="date"]').count()).toBe(0);

  // It opens on today's month, today ringed; the arrows step by month, after a tap on the year by year.
  const now = new Date();
  const key = (year: number, month: number) => {
    const index = year * 12 + month;
    return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
  };
  const [year, month] = [now.getFullYear(), now.getMonth()];
  const shown = page.getByTestId('datepicker-month');
  await field.click();
  await expect(page.getByTestId('datepicker-backdrop')).toHaveAttribute('data-no-swipe', '');
  await expect(shown).toHaveAttribute('data-month', key(year, month));
  await expect(page.locator('.day.today')).toHaveCount(1);
  await page.getByTestId('datepicker-next').click();
  await expect(shown).toHaveAttribute('data-month', key(year, month + 1));
  await page.getByTestId('datepicker-prev').click();
  await page.getByTestId('datepicker-prev').click();
  await expect(shown).toHaveAttribute('data-month', key(year, month - 1));
  await page.getByTestId('datepicker-year').click();
  await page.getByTestId('datepicker-next').click();
  await expect(shown).toHaveAttribute('data-month', key(year + 1, month - 1));
  await page.getByTestId('datepicker-prev').click();
  await page.getByTestId('datepicker-prev').click();
  await expect(shown).toHaveAttribute('data-month', key(year - 1, month - 1));
  await page.getByTestId('datepicker-cancel').click();
  await expect(page.getByTestId('datepicker')).toHaveCount(0);
  await expect(field).toHaveText('no roast date');

  // A day sets the date and closes; it opens again on that month with the day filled.
  await pickDate(page, field, '2026-10-08');
  await expect(field).toHaveText('2026-10-08');
  await field.click();
  await expect(shown).toHaveAttribute('data-month', '2026-10');
  await expect(page.getByTestId('datepicker-day-2026-10-08')).toHaveAttribute('aria-pressed', 'true');
  await page.screenshot({ path: 'docs/product/date-picker.png' });
  // A tap beside the dialog cancels it, clear empties the field.
  await page.getByTestId('datepicker-backdrop').click({ position: { x: 10, y: 10 } });
  await expect(field).toHaveText('2026-10-08');
  await field.click();
  await page.getByTestId('datepicker-clear').click();
  await expect(field).toHaveText('no roast date');
  await field.click();
  await page.getByTestId('datepicker-today').click();
  await expect(field).toHaveText(`${key(year, month)}-${String(now.getDate()).padStart(2, '0')}`);

  // A date after today is allowed; the stored value is the ISO date.
  await pickDate(page, field, `${year + 1}-03-02`);
  await page.getByTestId('bean-save').click();
  await expect(page.getByTestId('bean-row')).toContainText(`roasted ${year + 1}-03-02`);
  const bean = gateway.beans[0];
  expect(gateway.calls('POST', `/api/v1/beans/${bean.id}/batches`).map((call) => call.body)).toEqual([
    { roastDate: `${year + 1}-03-02` },
  ]);
});

test('a new bag archives the current one after a confirm; the search finds a bean by its words', async ({ page }) => {
  await openBeans(page);
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
  // Newest first.
  await expect(page.getByTestId('bean-row').first()).toContainText('Gesha');
  await page.getByTestId('beans-search').fill('square');
  await expect(page.getByTestId('bean-row')).toHaveCount(1);
  await page.getByTestId('bean-row').click();
  const red = gateway.beans.find((bean) => bean.name === 'Red Brick')!;
  const first = gateway.batches.find((batch) => batch.beanId === red.id)!;

  await page.getByTestId('bean-new-bag').click();
  await expect(page.getByTestId('settings-confirm')).toContainText('A new bag of Square Mile · Red Brick?');
  await page.getByTestId('settings-confirm-ok').click();
  await expect.poll(() => gateway.batches.filter((batch) => batch.beanId === red.id).length).toBe(2);
  expect(gateway.batches.find((batch) => batch.id === first.id)!.archived).toBe(true);
  // The new bag's roast date is set on the form.
  await pickDate(page, page.getByTestId('bean-roast-date'), '2026-10-19');
  await page.getByTestId('bean-save').click();
  await expect(page.getByTestId('bean-row')).toContainText('roasted 2026-10-19');
  const bag = gateway.batches.find((batch) => batch.beanId === red.id && !batch.archived)!;
  expect(gateway.calls('PUT', `/api/v1/bean-batches/${bag.id}`).map((call) => call.body)).toEqual([{ roastDate: '2026-10-19' }]);
});

test('a grinder is added, edited, archived after a confirm, listed with show archived and restored', async ({ page }) => {
  await openBeans(page);
  await page.getByTestId('beans-kind-grinders').click();
  await expect(page.getByTestId('beans-empty')).toHaveText('No grinders yet.');
  await expect(page.getByTestId('grinder-save')).toBeDisabled();
  await page.getByTestId('grinder-model').fill('Niche Zero');
  await page.getByTestId('grinder-burrs').fill('63 mm conical');
  // The step of the pick's − and +, on the number pad.
  await page.getByTestId('grinder-step').click();
  await expect(page.getByTestId('numpad')).toBeVisible();
  for (const key of ['0', '.', '5']) await page.keyboard.press(key);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('grinder-step')).toContainText('0.5');
  await page.getByTestId('grinder-save').click();
  await expect(page.getByTestId('grinder-row')).toHaveCount(1);
  expect(gateway.calls('POST', '/api/v1/grinders').map((call) => call.body)).toEqual([
    { model: 'Niche Zero', burrs: '63 mm conical', settingType: 'numeric', settingSmallStep: 0.5 },
  ]);

  const grinder = gateway.grinders[0];
  await slowSave(page, `/api/v1/grinders/${grinder.id}`);
  await page.getByTestId('grinder-notes').fill('zeroed at burr touch');
  const grinderSaved = saveAnswered(page, `/api/v1/grinders/${grinder.id}`);
  await page.getByTestId('grinder-save').click();
  await grinderSaved;
  await expect(page.getByTestId('grinder-save')).toBeDisabled();
  expect(gateway.calls('PUT', `/api/v1/grinders/${grinder.id}`).map((call) => call.body)).toEqual([{ notes: 'zeroed at burr touch' }]);

  await page.getByTestId('grinder-archive').click();
  await expect(page.getByTestId('settings-confirm')).toContainText('Archive Niche Zero?');
  await page.getByTestId('settings-confirm-ok').click();
  await expect(page.getByTestId('grinder-row')).toHaveCount(0);
  await page.getByTestId('beans-show-archived').click();
  await page.getByTestId('grinder-row').click();
  await page.getByTestId('grinder-restore').click();
  await expect(page.getByTestId('grinder-archive')).toBeVisible();
  expect(gateway.grinders[0].archived).toBe(false);
  expect(await noSideScroll(page)).toBe(true);
});

test("home's chip opens the pick: bean, grinder and setting go out in one PUT and show on the chip; 'no bean' clears", async ({
  page,
}) => {
  const at = '2026-10-20T10:00:00.000';
  gateway.beans = [
    { id: 'b1', name: 'Red Brick', roaster: 'Square Mile', decaf: false, archived: false, createdAt: at, updatedAt: at },
    { id: 'b2', name: 'Old Crop', roaster: 'Square Mile', decaf: false, archived: true, createdAt: at, updatedAt: at },
  ];
  gateway.batches = [{ id: 'bag1', beanId: 'b1', frozen: false, archived: false, createdAt: at, updatedAt: at }];
  gateway.grinders = [
    { id: 'g1', model: 'Niche Zero', archived: false, settingType: 'numeric', settingSmallStep: 0.5, createdAt: at, updatedAt: at },
  ];
  // DYE2's keys, as on the rig (research.md 29.4): the pick leaves them alone.
  gateway.workflow.context = { ...gateway.workflow.context, extras: { basketId: null, rpm: null } };
  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText('Idle');
  await expect(page.getByTestId('next-bean')).toHaveText('no bean');
  await expect(page.getByTestId('next-setting')).toHaveText('5.2');

  // The pick is under the profile button at the top of home's right column (spec 3.11).
  const [profiles, pick] = await Promise.all(
    ['open-profiles', 'open-pick'].map(async (id) => (await page.getByTestId(id).boundingBox())!),
  );
  expect(pick.y).toBeGreaterThanOrEqual(profiles.y + profiles.height);
  await expect(page.getByTestId('shot-column').getByTestId('open-pick')).toBeVisible();

  await page.getByTestId('open-pick').click();
  await expect(page.getByTestId('pick')).toBeVisible();
  // Archived beans are not offered; the only grinder is chosen by itself.
  await expect(page.getByTestId('pick-bean')).toHaveCount(1);
  await expect(page.getByTestId('pick-no-bean')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('pick-grinder')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('pick-bean').click();
  await page.getByTestId('pick-setting-up').click();
  await page.getByTestId('pick-setting-up').click();
  await expect(page.getByTestId('pick-setting')).toHaveText('6.2');
  await page.screenshot({ path: 'docs/product/beans-pick.png' });
  const before = gateway.calls('PUT', '/api/v1/workflow').length;
  await page.getByTestId('pick-use').click();
  await expect(page.getByTestId('pick')).toHaveCount(0);
  const puts = gateway.calls('PUT', '/api/v1/workflow').slice(before);
  expect(puts.map((call) => call.body)).toEqual([
    {
      context: {
        coffeeName: 'Red Brick',
        coffeeRoaster: 'Square Mile',
        beanBatchId: 'bag1',
        grinderId: 'g1',
        grinderModel: 'Niche Zero',
        grinderSetting: '6.2',
      },
    },
  ]);
  expect(gateway.workflow.context.extras).toEqual({ basketId: null, rpm: null });
  await expect(page.getByTestId('next-bean')).toHaveText('Square Mile · Red Brick');
  await expect(page.getByTestId('next-setting')).toHaveText('6.2');

  // Opened again it starts from the pick; 'no bean' clears the three bean fields.
  await page.getByTestId('open-pick').click();
  await expect(page.getByTestId('pick-bean')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('pick-no-bean').click();
  await page.getByTestId('pick-use').click();
  await expect(page.getByTestId('next-bean')).toHaveText('no bean');
  expect(gateway.workflow.context).not.toHaveProperty('coffeeName');
  expect(gateway.workflow.context).not.toHaveProperty('beanBatchId');
  expect(gateway.workflow.context).toMatchObject({ grinderId: 'g1', grinderSetting: '6.2' });
});

test('the setting is typed on the number pad; Cancel leaves the workflow as it was', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('status-title')).toHaveText('Idle');
  await page.getByTestId('open-pick').click();
  await expect(page.getByTestId('pick-empty')).toBeVisible();
  await page.getByTestId('pick-setting').click();
  for (const key of ['1', '1', '.', '5']) await page.keyboard.press(key);
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('pick-setting')).toHaveText('11.5');
  const before = gateway.calls('PUT', '/api/v1/workflow').length;
  await page.getByTestId('pick-cancel').click();
  await expect(page.getByTestId('pick')).toHaveCount(0);
  expect(gateway.calls('PUT', '/api/v1/workflow').length).toBe(before);
  await expect(page.getByTestId('next-setting')).toHaveText('5.2');
  // The pick's link opens the catalogue.
  await page.getByTestId('open-pick').click();
  await page.getByTestId('pick-catalogue').click();
  await expect(page.getByTestId('screen-beans')).toBeVisible();
});
