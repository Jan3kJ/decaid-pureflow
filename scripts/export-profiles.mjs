#!/usr/bin/env node
// Writes src/steps/fixtures/export-profiles.json: every profile of a Decaid export's profiles.json,
// so the shot model's checks run on the profiles a user has, not only on the bundled ones.
//
//   node scripts/export-profiles.mjs <export .zip, its folder, or its profiles.json>
//
// Each entry is the profile as bundled-profiles.json holds it, without its author and notes: a
// person's name or words never reach the repository. The export stays out of the repository.
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/** The keys of a profile that are kept, in this order. */
const KEPT = [
  'version',
  'title',
  'beverage_type',
  'steps',
  'tank_temperature',
  'target_weight',
  'target_volume',
  'target_volume_count_start',
];

function readProfiles(path) {
  if (!path || !existsSync(path)) {
    console.error('usage: node scripts/export-profiles.mjs <Decaid export .zip, its folder, or its profiles.json>');
    process.exit(2);
  }
  if (statSync(path).isDirectory()) return JSON.parse(readFileSync(join(path, 'profiles.json'), 'utf8'));
  if (path.endsWith('.json')) return JSON.parse(readFileSync(path, 'utf8'));
  const files = unzipSync(readFileSync(path), { filter: (file) => file.name.endsWith('profiles.json') });
  const entry = Object.values(files)[0];
  if (!entry) throw new Error(`no profiles.json in ${path}`);
  return JSON.parse(new TextDecoder().decode(entry));
}

const records = readProfiles(process.argv[2]);
const profiles = records
  .map((record) => record.profile ?? record)
  .map((profile) => Object.fromEntries(KEPT.filter((key) => key in profile).map((key) => [key, profile[key]])));
writeFileSync(join(root, 'src/steps/fixtures/export-profiles.json'), `${JSON.stringify(profiles, null, 1)}\n`);
console.log(`${profiles.length} profiles written, ${profiles.filter((profile) => profile.steps?.length).length} with steps`);
