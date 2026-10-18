import { describe, expect, it } from 'vitest';
import type { FirmwareCatalog } from '../api';
import { appUpdateText, progressText, summarize } from './firmware';

/** As the rig's Decaid 0.8.8 answered with the simulated DE1Pro (build 1337), 2026-10-18. */
const RIG: FirmwareCatalog = {
  artifacts: [
    { id: 'de1-1352', build: 1352, versionLabel: '1352', channel: 'stable', eligibility: { status: 'applicable', reasons: [] } },
    { id: 'de1-1358', build: 1358, versionLabel: '1358', channel: 'stable', eligibility: { status: 'applicable', reasons: [] } },
  ],
  machine: { model: 'DE1Pro', build: 1337 },
  recommendedArtifactId: 'de1-1358',
  updateAvailable: true,
  operation: { state: 'idle' },
};

describe('the firmware status (research.md 20.10 S2c)', () => {
  it("names the recommended build when an update is available", () => {
    const summary = summarize(RIG);
    expect([summary.status, summary.model, summary.installedBuild, summary.latest?.id, summary.operation]).toEqual([
      'update-available',
      'DE1Pro',
      1337,
      'de1-1358',
      'idle',
    ]);
  });

  it('is up to date only when Decaid says so, and unknown when it cannot', () => {
    expect(summarize({ ...RIG, updateAvailable: false, recommendedArtifactId: null }).status).toBe('up-to-date');
    const offline = summarize({
      ...RIG,
      machine: null,
      updateAvailable: null,
      recommendedArtifactId: null,
      artifacts: RIG.artifacts!.map((artifact) => ({ ...artifact, eligibility: { status: 'unknown', reasons: ['machine_not_connected'] } })),
    });
    expect([offline.status, offline.reason, offline.latest?.id]).toEqual(['unknown', 'machine_not_connected', 'de1-1358']);
    expect(summarize(null).status).toBe('unknown');
  });

  it('a machine newer than every bundled build is ahead, not failed', () => {
    const beta = summarize({
      ...RIG,
      machine: { model: 'DE1Pro', build: 1400 },
      updateAvailable: false,
      recommendedArtifactId: null,
      artifacts: RIG.artifacts!.map((artifact) => ({ ...artifact, eligibility: { status: 'notApplicable', reasons: ['not_newer'] } })),
    });
    expect(beta.status).toBe('ahead');
  });

  it('says what an update does while it runs', () => {
    expect(progressText({ status: 'erasing', progress: 0 })).toBe('Erasing…');
    expect(progressText({ status: 'uploading', progress: 0.42 })).toBe('Uploading 42 %');
    expect(progressText({ status: 'uploading', progress: 1 })).toBe('Verifying…');
    expect(progressText({ status: 'error', progress: -1, error: 'crc' })).toBe('Failed: crc');
    expect(progressText({ status: 'done', progress: 1 })).toMatch(/Restart/);
  });

  it("says Decaid's own update as the gateway reports it", () => {
    const state = { phase: 'idle' as const, currentVersion: '0.8.8', latestVersion: null, releaseUrl: 'https://github.com/decentespresso/decaid/releases', installable: false };
    expect(appUpdateText(state)).toBe('No update known.');
    expect(appUpdateText({ ...state, phase: 'available', latestVersion: '0.8.9' })).toBe('Decaid 0.8.9 is available.');
    expect(appUpdateText({ ...state, phase: 'downloading', progress: 0.5 })).toBe('Downloading 50 %');
  });
});
