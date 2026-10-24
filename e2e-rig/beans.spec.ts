import { expect, test, type Page } from '@playwright/test';
import type { BeanBatch, CatalogueBean, Grinder, MachineSnapshot, PaginatedShots, ProfileRecord, ShotRecord } from '../src/api';
import type { RigWorkflow } from './gateway';
import { IDLE } from './idle';
import { pickDate } from '../e2e/date-picker';
import { back } from '../e2e/touch';

// Acceptance item 52, its first half (spec 3.9 item 19, research.md 29.8), against the rig:
// through the beans screen a bean and a grinder of the test's own are added (name and roaster
// typed), edited, archived (gone from Decaid's list, there with `includeArchived`) and restored;
// home's pick writes them with a grinder setting into the workflow's context, and the next
// simulated shot's record holds them, found again by `GET /shots?beanId=` and `?grinderId=`.
// The test deletes the shot, the bags, the bean and the grinder (Decaid 0.8.8 refuses to delete
// a bean that still has bags: research.md 29.12) and puts the context back as it was.

const GATEWAY = 'http://localhost:8080';
const PROFILE = 'Rao Allongé';
const YIELD = 3;
const NAME = 'pureflow-rig-bean';
const ROASTER = 'pureflow-rig';
const MODEL = 'pureflow-rig-grinder';
const WRITTEN = ['coffeeName', 'coffeeRoaster', 'beanBatchId', 'grinderSetting', 'grinderModel', 'grinderId'] as const;

async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(GATEWAY + path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${text.slice(0, 200)}`);
  return (text ? JSON.parse(text) : undefined) as T;
}

const shotIds = async (): Promise<string[]> =>
  (await api<PaginatedShots>('GET', '/api/v1/shots?limit=100')).items.map((shot) => shot.id);
const machineState = async (): Promise<string> => (await api<MachineSnapshot>('GET', '/api/v1/machine/state')).state.state;
const beans = (all = true) => api<CatalogueBean[]>('GET', `/api/v1/beans${all ? '?includeArchived=true' : ''}`);
const batches = () => api<BeanBatch[]>('GET', '/api/v1/bean-batches?includeArchived=true');
const grinders = (all = true) => api<Grinder[]>('GET', `/api/v1/grinders${all ? '?includeArchived=true' : ''}`);
const ids = (items: { id: string }[]) => items.map((item) => item.id).sort();

/** One simulated shot with the workflow as it is, the profile and a small yield set; returns its record. */
async function pull(page: Page, profile: unknown): Promise<ShotRecord> {
  const known = await shotIds();
  await api('PUT', '/api/v1/workflow', { profile, context: { targetYield: YIELD } });
  await api('PUT', '/api/v1/machine/state/espresso');
  await expect.poll(machineState, { timeout: 15_000, intervals: [200] }).toBe('espresso');
  try {
    await expect.poll(machineState, { timeout: 40_000, intervals: [300] }).not.toBe('espresso');
  } catch {
    await api('PUT', '/api/v1/machine/state/idle');
  }
  let id: string | undefined;
  await expect
    .poll(async () => (id = (await shotIds()).find((candidate) => !known.includes(candidate))), { timeout: 30_000, intervals: [500] })
    .toBeTruthy();
  await page.waitForTimeout(500);
  return api<ShotRecord>('GET', `/api/v1/shots/${encodeURIComponent(id!)}`);
}

let gatewayUp = false;

test.beforeAll(async () => {
  try {
    gatewayUp = (await api<MachineSnapshot>('GET', '/api/v1/machine/state')).state.state !== undefined;
  } catch {
    gatewayUp = false;
  }
});

test('beans and grinders: added, edited, archived and restored on the screen; the pick is in the next shot', async ({ page }) => {
  test.skip(!gatewayUp, `no machine at ${GATEWAY}: start the rig (docs/research.md 8.8)`);

  const workflowBefore = await api<RigWorkflow>('GET', '/api/v1/workflow');
  const shotsBefore = await shotIds();
  const profiles = await api<ProfileRecord[]>('GET', '/api/v1/profiles');
  const profile = profiles.find((record) => record.profile.title === PROFILE)!.profile;
  const [beansBefore, batchesBefore, grindersBefore] = [ids(await beans()), ids(await batches()), ids(await grinders())];

  try {
    await page.goto('/');
    await expect(page.getByTestId('status-title')).toHaveText(IDLE, { timeout: 15_000 });
    await page.getByTestId('menu').click();
    await page.getByTestId('open-beans').click();
    await expect(page.getByTestId('screen-beans')).toBeVisible();

    // A bean, typed, with its first bag.
    await page.getByTestId('bean-name').fill(NAME);
    await page.getByTestId('bean-roaster').fill(ROASTER);
    await pickDate(page, page.getByTestId('bean-roast-date'), '2026-10-08');
    await page.getByTestId('bean-save').click();
    await expect(page.getByTestId('bean-row').filter({ hasText: NAME })).toContainText('roasted 2026-10-08');
    const bean = (await beans()).find((entry) => entry.name === NAME)!;
    expect(bean).toMatchObject({ roaster: ROASTER, archived: false });
    const bag = (await api<BeanBatch[]>('GET', `/api/v1/beans/${bean.id}/batches`))[0];
    expect(bag.roastDate).toBe('2026-10-08T00:00:00.000');

    // Edited: only the notes go out, and are read back.
    await page.getByTestId('bean-notes').fill('rig notes');
    await page.getByTestId('bean-save').click();
    await expect(page.getByTestId('bean-save')).toBeDisabled();
    expect((await api<CatalogueBean>('GET', `/api/v1/beans/${bean.id}`)).notes).toBe('rig notes');

    // Archived after the confirm: out of Decaid's list, in it with includeArchived; then restored.
    await page.getByTestId('bean-archive').click();
    await page.getByTestId('settings-confirm-ok').click();
    await expect(page.getByTestId('bean-row').filter({ hasText: NAME })).toHaveCount(0);
    expect(ids(await beans(false))).not.toContain(bean.id);
    expect((await beans()).find((entry) => entry.id === bean.id)?.archived).toBe(true);
    await page.getByTestId('beans-show-archived').click();
    await page.getByTestId('bean-row').filter({ hasText: NAME }).click();
    await page.getByTestId('bean-restore').click();
    await expect(page.getByTestId('bean-archive')).toBeVisible();
    expect(ids(await beans(false))).toContain(bean.id);
    await page.getByTestId('beans-show-archived').click();

    // A grinder, the same way.
    await page.getByTestId('beans-kind-grinders').click();
    await page.getByTestId('grinder-model').fill(MODEL);
    await page.getByTestId('grinder-step').click();
    for (const key of ['0', '.', '5']) await page.keyboard.press(key);
    await page.keyboard.press('Enter');
    await page.getByTestId('grinder-save').click();
    await expect(page.getByTestId('grinder-row').filter({ hasText: MODEL })).toHaveCount(1);
    const grinder = (await grinders()).find((entry) => entry.model === MODEL)!;
    expect(grinder).toMatchObject({ settingType: 'numeric', settingSmallStep: 0.5, archived: false });
    await page.getByTestId('grinder-burrs').fill('rig burrs');
    await page.getByTestId('grinder-save').click();
    await expect(page.getByTestId('grinder-save')).toBeDisabled();
    expect((await api<Grinder>('GET', `/api/v1/grinders/${grinder.id}`)).burrs).toBe('rig burrs');
    await page.getByTestId('grinder-archive').click();
    await page.getByTestId('settings-confirm-ok').click();
    await expect(page.getByTestId('grinder-row').filter({ hasText: MODEL })).toHaveCount(0);
    expect(ids(await grinders(false))).not.toContain(grinder.id);
    expect((await grinders()).find((entry) => entry.id === grinder.id)?.archived).toBe(true);
    await page.getByTestId('beans-show-archived').click();
    await page.getByTestId('grinder-row').filter({ hasText: MODEL }).click();
    await page.getByTestId('grinder-restore').click();
    await expect(page.getByTestId('grinder-archive')).toBeVisible();
    expect(ids(await grinders(false))).toContain(grinder.id);
    await page.screenshot({ path: 'e2e-rig/.results/beans-rig.png' });

    // The pick on home: the bean, the grinder, the setting 0.5 above the one set now.
    await back(page);
    await api('PUT', '/api/v1/workflow', { context: { grinderSetting: '5.0' } });
    await page.reload();
    await expect(page.getByTestId('next-setting')).toHaveText('5.0');
    await page.getByTestId('open-pick').click();
    await page.getByTestId('pick-bean').filter({ hasText: NAME }).click();
    await page.getByTestId('pick-grinder').filter({ hasText: MODEL }).click();
    await page.getByTestId('pick-setting-up').click();
    await expect(page.getByTestId('pick-setting')).toHaveText('5.5');
    await page.getByTestId('pick-use').click();
    await expect(page.getByTestId('next-bean')).toHaveText(`${ROASTER} · ${NAME}`);
    const picked = {
      coffeeName: NAME,
      coffeeRoaster: ROASTER,
      beanBatchId: bag.id,
      grinderId: grinder.id,
      grinderModel: MODEL,
      grinderSetting: '5.5',
    };
    expect((await api<RigWorkflow>('GET', '/api/v1/workflow')).context).toMatchObject(picked);

    // The next shot's record holds the pick, and Decaid's filters find it by bean and by grinder.
    const shot = await pull(page, profile);
    expect(shot.workflow!.context).toMatchObject(picked);
    const byBean = await api<PaginatedShots>('GET', `/api/v1/shots?beanId=${bean.id}`);
    expect(byBean.items.map((item) => item.id)).toEqual([shot.id]);
    const byGrinder = await api<PaginatedShots>('GET', `/api/v1/shots?grinderId=${grinder.id}`);
    expect(byGrinder.items.map((item) => item.id)).toEqual([shot.id]);
  } finally {
    if ((await machineState().catch(() => undefined)) === 'espresso') await api('PUT', '/api/v1/machine/state/idle');
    await page.waitForTimeout(5000);
    for (const id of await shotIds()) {
      if (!shotsBefore.includes(id)) await api('DELETE', `/api/v1/shots/${encodeURIComponent(id)}`);
    }
    const context = workflowBefore.context ?? {};
    await api('PUT', '/api/v1/workflow', {
      profile: workflowBefore.profile,
      context: {
        ...Object.fromEntries(WRITTEN.map((key) => [key, context[key] ?? null])),
        targetYield: context.targetYield ?? 0,
        targetDoseWeight: context.targetDoseWeight ?? null,
      },
    });
    // The bags first: Decaid refuses to delete a bean that has some.
    for (const batch of await batches()) {
      if (!batchesBefore.includes(batch.id)) await api('DELETE', `/api/v1/bean-batches/${batch.id}`);
    }
    for (const entry of await beans()) {
      if (!beansBefore.includes(entry.id)) await api('DELETE', `/api/v1/beans/${entry.id}`);
    }
    for (const entry of await grinders()) {
      if (!grindersBefore.includes(entry.id)) await api('DELETE', `/api/v1/grinders/${entry.id}`);
    }
  }

  expect(await shotIds()).toEqual(shotsBefore);
  expect(ids(await beans())).toEqual(beansBefore);
  expect(ids(await batches())).toEqual(batchesBefore);
  expect(ids(await grinders())).toEqual(grindersBefore);
  expect(await api<ProfileRecord[]>('GET', '/api/v1/profiles')).toHaveLength(profiles.length);
  const workflowAfter = await api<RigWorkflow>('GET', '/api/v1/workflow');
  expect(workflowAfter.profile).toEqual(workflowBefore.profile);
  expect(workflowAfter.context).toEqual(workflowBefore.context);
});
