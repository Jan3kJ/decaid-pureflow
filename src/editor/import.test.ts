import { describe, expect, it } from 'vitest';
import { DEFAULT_PROFILES, readSteps, type StoredProfile } from '../aflow';
import plugin12 from '../aflow/fixtures/plugin-1.2.json' with { type: 'json' };
import rig14 from '../aflow/fixtures/rig-plugin-1.4.json' with { type: 'json' };
import type { Profile } from '../api';
import { fakeGateway } from './gateway.fake';
import { importQuestion, importReport, planImport, runImport } from './import';
import { SKIN_METADATA, saveAs } from './save';
import { readRecord } from './storage';

const asProfile = (profile: StoredProfile, title: string) => ({ ...(profile as unknown as Profile), title });
const pluginProfile = (name: string) => (plugin12 as unknown as Profile[]).find((p) => p.title === `A-Flow / ${name}`)!;
const rigProfile = (name: string) => (rig14 as unknown as Profile[]).find((p) => p.title === `A-Flow / ${name}`)!;
const notAFlow: Profile = {
  ...pluginProfile('default-dark'),
  title: 'Best practice',
  steps: [{ ...pluginProfile('default-dark').steps[0], name: 'preinfusion' }],
};

/** A gateway with: two old profiles of the user's, one changed beyond reading, Decaid's five bundled ones, a 3.0 profile, and a profile that is not A-Flow. */
async function rig() {
  const gateway = fakeGateway();
  const mine = gateway.make(asProfile(pluginProfile('default-dark'), 'A-Flow / mine'));
  const old = gateway.make(asProfile(rigProfile('default-very-dark'), 'A-Flow / old one'));
  const broken = gateway.make({
    ...asProfile(pluginProfile('default-light'), 'A-Flow / broken'),
    steps: pluginProfile('default-light').steps.map((step, i) => (i === 1 ? { ...step, pump: 'flow' as const } : step)),
  });
  const bundled = (rig14 as unknown as Profile[]).map((profile) => gateway.make(profile, { isDefault: true }));
  const hiddenOld = gateway.make(asProfile(pluginProfile('default-medium'), 'A-Flow / hidden'), { visibility: 'hidden' });
  const other = gateway.make(notAFlow);
  gateway.records.push(mine, old, broken, ...bundled, hiddenOld, other);
  const current = await saveAs(gateway.client, DEFAULT_PROFILES[0].params, { title: 'A-Flow / current' }, false);
  return { gateway, mine, old, broken, bundled, current };
}

describe('planImport', () => {
  it('converts the visible old A-Flow profiles, skips the bundled ones, lists the unreadable', async () => {
    const { gateway, mine, old, broken, bundled } = await rig();
    expect(readSteps(gateway.records.find((r) => r.id === broken.id)!.profile)).toMatchObject({ ok: false, aflow: true });

    const plan = planImport(gateway.records);
    expect(plan.convert.map((entry) => entry.record.id)).toEqual([mine.id, old.id]);
    expect(plan.convert[1].params).toEqual((readSteps(old.profile) as { params: unknown }).params);
    expect(plan.skipped.map((record) => record.id)).toEqual(bundled.map((record) => record.id));
    expect(plan.unread.map((record) => record.id)).toEqual([broken.id]);
  });

  it("skips a stored profile under the title of one of the skin's defaults, as the bundled", () => {
    const gateway = fakeGateway();
    const copy = gateway.make(rigProfile('default-light'));
    expect(planImport([copy]).skipped).toEqual([copy]);
  });

  it('leaves 3.0 profiles alone, those whose steps were changed elsewhere too', async () => {
    const gateway = fakeGateway();
    const record = await saveAs(gateway.client, DEFAULT_PROFILES[1].params, { title: 'A-Flow / mine' }, false);
    const changed = { ...record, profile: { ...record.profile, steps: record.profile.steps.slice(0, -1) } };
    expect(planImport([record, changed])).toEqual({ convert: [], skipped: [], unread: [] });
  });
});

describe('profiles of a Decaid export', () => {
  const withFirst = (profile: Profile, title: string, first: Record<string, unknown>) => ({
    ...asProfile(profile, title),
    steps: [{ ...profile.steps[0], ...first }, ...profile.steps],
  });

  it('reads a Pre Fill at another temperature than the Fill, as the plugin writes it', () => {
    const base = rigProfile('default-dark');
    const steps = base.steps.map((step) => (step.name === 'Pre Fill' ? { ...step, temperature: step.temperature + 2 } : step));
    expect(steps.some((step) => step.name === 'Pre Fill')).toBe(true);
    const read = readSteps({ ...base, steps });
    expect(read.ok && read.dropped).toContain('preFill');
  });

  it('lists a step of its own in front of the A-Flow steps as unread, with its name, instead of leaving it out', () => {
    const gateway = fakeGateway();
    const record = gateway.make(withFirst(pluginProfile('default-dark'), 'A-Flow / coldbrew', { name: 'Prewet', sensor: 'water' }));
    const plan = planImport([record]);
    expect(plan.unread).toEqual([record]);
    expect(importQuestion(plan)).toContain(`“A-Flow / coldbrew” (its first step “Prewet” is not one of A-Flow's`);
  });
});

describe('runImport', () => {
  it("stores each as 3.0 through the editor's save, the old one its parent and hidden", async () => {
    const { gateway, mine, old } = await rig();
    const plan = planImport(gateway.records);
    const result = await runImport(gateway.client, plan, false);

    expect(result.failed).toEqual([]);
    expect(result.converted.map((record) => record.profile.title)).toEqual(['A-Flow / mine', 'A-Flow / old one']);
    for (const [index, parent] of [mine, old].entries()) {
      const record = result.converted[index];
      expect(record.parentId).toBe(parent.id);
      expect(record.metadata).toMatchObject(SKIN_METADATA);
      expect(readRecord(record)).toEqual(plan.convert[index].params);
      expect(gateway.records.find((r) => r.id === parent.id)!.visibility).toBe('hidden');
    }
    // A second run finds nothing more to convert.
    const again = planImport(gateway.records);
    expect(again.convert).toEqual([]);
    expect(importReport(plan, result)).toBe(
      'Converted 2, skipped 5, could not read 1. Not read: “A-Flow / broken” (a value of “Infuse” is missing).',
    );
  });

  it('goes on after a profile Decaid refuses, and names it', async () => {
    const gateway = fakeGateway();
    // Two old profiles with the same steps under two titles: Decaid keeps one profile per set of steps.
    const first = gateway.make(asProfile(pluginProfile('default-dark'), 'A-Flow / one'));
    const second = gateway.make(asProfile(rigProfile('default-dark'), 'A-Flow / two'));
    gateway.records.push(first, second);
    const plan = planImport(gateway.records);
    expect(plan.convert).toHaveLength(2);

    const result = await runImport(gateway.client, plan, false);
    expect(result.converted.map((record) => record.profile.title)).toEqual(['A-Flow / one']);
    expect(result.failed.map((failure) => failure.title)).toEqual(['A-Flow / two']);
    expect(result.failed[0].reason).toContain('“A-Flow / one”');
    expect(gateway.records.find((r) => r.id === second.id)!.visibility).toBe('visible');
    expect(importReport(plan, result)).toMatch(
      /^Converted 1, skipped 0, could not read 0, refused by Decaid 1\. “A-Flow \/ two” was not converted: /,
    );
  });
});

describe('importQuestion', () => {
  it('names how many it found, skips and cannot read', async () => {
    const { gateway } = await rig();
    expect(importQuestion(planImport(gateway.records))).toBe(
      '2 old A-Flow profiles are stored as A-Flow 3.0; each old version stays in Decaid, hidden. ' +
        "Skipped: 5 profiles bundled with Decaid, for which the skin's defaults stand. Cannot be read: “A-Flow / broken” (a value of “Infuse” is missing).",
    );
  });

  it('says so when there is nothing to convert', () => {
    expect(importQuestion({ convert: [], skipped: [], unread: [] })).toBe('There is no old A-Flow profile to convert.');
  });
});
