<script lang="ts">
  import { onMount } from 'svelte';
  import type { ProfileRecord } from '../api';
  import NumberPad from '../editor/NumberPad.svelte';
  import { startChoices, startName } from '../editor/start';
  import {
    PROFILE_FIELDS,
    RATIO_RANGE,
    STEAM_FIELDS,
    profileValue,
    steamValue,
    withRatio,
    withStartProfile,
    withSteamValue,
    type ProfileField,
    type Settings,
    type SteamField,
  } from '../settings';
  import Dialog from '../ui/Dialog.svelte';
  import Lever from '../ui/Lever.svelte';
  import { PRODUCT_NAME, PRODUCT_VERSION } from '../product';
  import { backupTime } from '../settings-backup';
  import type { Skin } from '../shell/skin.svelte';
  import { SETTINGS_TREE } from './tree';
  import { errorMessage } from '../error-message';
  import { importQuestion, importReport, planImport, runImport, type ImportPlan } from '../editor/import';
  import Confirm from './Confirm.svelte';
  import Skins from './Skins.svelte';
  import LocalInstall from './LocalInstall.svelte';
  import { saveDeveloper } from './local-install';
  import { DISPLAY_SIZES, LINE_WIDTHS, signed, type DisplayChoice } from '../display';

  interface Props {
    skin: Skin;
    /** developer options: Skin > Developer shows; kept on this tablet, not in the settings */
    developer: boolean;
  }

  let { skin, developer = $bindable() }: Props = $props();

  function toggleDeveloper() {
    developer = !developer;
    saveDeveloper(developer);
  }

  // The category Skin of the settings page: the skin's own settings, all in
  // the one settings object (src/settings.ts) and so in its KV backup. It keeps the test ids of the
  // settings page it came from.
  const SUB = Object.fromEntries(SETTINGS_TREE.find((category) => category.id === 'skin')!.subcategories.map((sub) => [sub.id, sub]));
  type Switch = {
    key: 'firstStepWorkaround' | 'showProfileSteps' | 'showGraphLegend' | 'showShotValues';
    id: string;
    title: string;
    hint: string;
  };
  const SWITCHES: Switch[] = [
    {
      key: 'firstStepWorkaround',
      id: 'first-step-workaround',
      title: 'first-step workaround',
      hint: 'a profile from the editor starts with a Pre Fill step of 1 s, for a machine that skips the first step.',
    },
    {
      key: 'showProfileSteps',
      id: 'show-profile-steps',
      title: 'profile steps',
      hint: 'the editor has a button that shows the generated steps under the graph. It opens closed.',
    },
  ];

  const GRAPH_SWITCHES: Switch[] = [
    {
      key: 'showGraphLegend',
      id: 'show-graph-legend',
      title: 'legend',
      hint: 'the shot graph names its curves under it, and what a dashed line is.',
    },
    {
      key: 'showShotValues',
      id: 'show-shot-values',
      title: 'shot values',
      hint: 'after a shot its overlay shows the values of preinfusion, extraction and the whole shot under the graph.',
    },
  ];

  /** Skin > Display: Streamline's two sizes, each a factor of the settings object */
  const DISPLAY: {
    key: 'displaySize' | 'lineWidth';
    id: string;
    title: string;
    hint: string;
    choices: DisplayChoice[];
  }[] = [
    {
      key: 'displaySize',
      id: 'display-size',
      title: 'display size',
      hint: 'every text, button and graph of the skin, larger or smaller. Medium fits the screen as designed.',
      choices: DISPLAY_SIZES,
    },
    {
      key: 'lineWidth',
      id: 'line-width',
      title: 'chart line width',
      hint: 'the curves of the shot graph, the profile previews and the A-Flow editor.',
      choices: LINE_WIDTHS,
    },
  ];

  const settings: Settings = $derived(skin.settings);
  /** the value the number pad is open for */
  let typing: SteamField | null = $state.raw(null);
  /** the name over the number pad: the group and the value, "mugs: s" */
  const named = (field: SteamField) =>
    `${STEAM_FIELDS.find((group) => group.fields.some((entry) => entry.id === field.id))?.title}: ${field.label}`;

  /** an adjust button's amount as the steam page shows it, '−8'; the unit stays in its own element */
  const shown = (field: SteamField) => {
    const value = steamValue(settings.steam, field);
    return field.key === 'adjustments' ? signed(value, '') : `${+value.toFixed(1)}`;
  };

  function confirm(value: number) {
    if (typing) skin.setSettings({ steam: withSteamValue(settings.steam, typing, value) });
    typing = null;
  }

  /** the value of the category Profile the number pad is open for */
  let typingProfile: ProfileField | null = $state.raw(null);
  const shownProfile = (field: ProfileField) => `${profileValue(settings, field)}`;

  function confirmProfile(value: number) {
    if (typingProfile) skin.setSettings({ [typingProfile.key]: profileValue(settings, typingProfile, value) });
    typingProfile = null;
  }

  /** the ratio favourite of the hot water page the number pad is open for */
  let typingRatio: number | null = $state(null);
  const shownRatio = (index: number) => `${+settings.hotWater.ratios[index].toFixed(1)}`;

  function confirmRatio(value: number) {
    if (typingRatio !== null) skin.setSettings({ hotWater: withRatio(settings.hotWater, typingRatio, value) });
    typingRatio = null;
  }

  // The editor's start row: what a slot can hold is read from the gateway.
  let records: ProfileRecord[] | null = $state.raw(null);
  let unread: string | null = $state(null);
  /** the slot whose list is open */
  let choosing: number | null = $state(null);
  const choices = $derived(startChoices(records ?? []));
  /** a chosen profile the editor no longer finds; unknown while the list is not read */
  const isMissing = (title: string) => !!records && !choices.some((choice) => choice.title === title);
  /** a slot's list: every profile that is not in another slot */
  const offered = $derived(
    choices.filter((choice) => !settings.startProfiles.some((title, i) => i !== choosing && title === choice.title)),
  );

  async function readProfiles() {
    unread = null;
    try {
      records = await skin.client.listProfiles();
    } catch (cause) {
      unread = `The profiles could not be read: ${errorMessage(cause)}`;
    }
  }

  function choose(title: string | null) {
    if (choosing !== null) skin.setSettings({ startProfiles: withStartProfile(settings.startProfiles, choosing, title) });
    choosing = null;
  }

  onMount(readProfiles);

  // The import of old A-Flow profiles: it reads the list again, asks, converts.
  /** what the question is about; null while it is not asked */
  let importing: ImportPlan | null = $state.raw(null);
  let importBusy = $state(false);
  /** what the last import, or the look for one, found */
  let imported: string | null = $state(null);

  async function findOld() {
    imported = null;
    importBusy = true;
    try {
      const plan = planImport(await skin.client.listProfiles());
      if (plan.convert.length) importing = plan;
      else imported = importQuestion(plan);
    } catch (cause) {
      imported = `The profiles could not be read: ${errorMessage(cause)}`;
    }
    importBusy = false;
  }

  async function convertOld() {
    const plan = importing!;
    importing = null;
    importBusy = true;
    imported = 'Converting …';
    const result = await runImport(skin.client, plan, settings.firstStepWorkaround);
    imported = importReport(plan, result);
    importBusy = false;
    await readProfiles();
  }

  // The backup in Decaid's KV store: its time, and a restore with a confirm.
  let confirming = $state(false);
  /** what the last restore did */
  let restored: string | null = $state(null);

  async function restore() {
    confirming = false;
    try {
      const backup = await skin.restoreBackup();
      restored = backup
        ? `Restored the backup${backup.savedAt ? ` of ${backupTime(backup.savedAt)}` : ''}.`
        : 'There is no backup in Decaid.';
    } catch (cause) {
      restored = `The backup could not be read: ${errorMessage(cause)}`;
    }
  }
</script>

<section id="sub-skin-steam" data-testid="settings-steam">
  <h2>{SUB['skin-steam'].name}</h2>
  <p class="hint">{SUB['skin-steam'].hint}</p>
  {#each STEAM_FIELDS as group (group.title)}
    <div class="row">
      <div class="about">
        <strong>{group.title}</strong>
        <small>{group.hint}</small>
      </div>
      <div class="values">
        {#each group.fields as field (field.id)}
          <button class="value" data-testid="setting-{field.id}" onclick={() => (typing = field)}>
            <small>{field.label}</small>
            <b>{shown(field)}<i>{field.unit}</i></b>
          </button>
        {/each}
      </div>
    </div>
  {/each}
</section>

<!-- The hot water page's ratio favourites. -->
<section id="sub-skin-hot-water" data-testid="settings-hot-water">
  <h2>{SUB['skin-hot-water'].name}</h2>
  <p class="hint">{SUB['skin-hot-water'].hint}</p>
  <div class="row">
    <div class="about">
      <strong>ratios</strong>
      <small>last shot × ratio is the stop at weight</small>
    </div>
    <div class="values">
      {#each settings.hotWater.ratios, index}
        <button class="value" data-testid="setting-ratio-{index + 1}" onclick={() => (typingRatio = index)}>
          <small>{index + 1}</small>
          <b><i class="lead">1:</i>{shownRatio(index)}</b>
        </button>
      {/each}
    </div>
  </div>
</section>

<section id="sub-skin-profile" data-testid="settings-profile">
  <h2>{SUB['skin-profile'].name}</h2>
  <!-- The editor's maximum flow and the dose of a shot that has none -->
  <div class="row">
    <div class="about">
      <strong>editor and dose</strong>
      <small>the highest flow the A-Flow editor offers; the dose of a shot that has none</small>
    </div>
    <div class="values">
      {#each PROFILE_FIELDS as field (field.id)}
        <button class="value" data-testid="setting-{field.id}" onclick={() => (typingProfile = field)}>
          <small>{field.label}</small>
          <b>{shownProfile(field)}<i>{field.unit}</i></b>
        </button>
      {/each}
    </div>
  </div>
  {#each SWITCHES as item (item.key)}
    {@render lever(item)}
  {/each}

  <div class="row">
    <span class="about">
      <strong>old A-Flow profiles</strong>
      <small>converts every older A-Flow profile to A-Flow 3.0, as the editor's save does; Decaid's bundled ones are skipped.</small>
      {#if imported}<small data-testid="aflow-import-result">{imported}</small>{/if}
    </span>
    <button class="retry" data-testid="aflow-import" disabled={importBusy} onclick={findOld}>convert to 3.0</button>
  </div>

  <div class="start" data-testid="settings-start">
    <div class="row">
      <div class="about">
        <strong>start row</strong>
        <small>the editor's profiles to start from, up to five. A tap on a slot chooses its profile.</small>
      </div>
      {#if unread}
        <button class="retry" data-testid="start-retry" onclick={readProfiles}>{unread} try again</button>
      {/if}
    </div>
    <div class="slots">
      {#each settings.startProfiles as title, index (index)}
        <button
          class="value slot"
          class:missing={title !== null && isMissing(title)}
          data-testid="start-slot-{index + 1}"
          onclick={() => (choosing = index)}
        >
          <small>{index + 1}</small>
          {#if title === null}
            <span class="none">empty</span>
          {:else}
            <b class="truncate">{startName(title)}</b>
            {#if isMissing(title)}<small class="warn" data-testid="start-missing">missing</small>{/if}
          {/if}
        </button>
      {/each}
    </div>
  </div>
</section>

<section id="sub-skin-graph" data-testid="settings-graph">
  <h2>{SUB['skin-graph'].name}</h2>
  {#each GRAPH_SWITCHES as item (item.key)}
    {@render lever(item)}
  {/each}
</section>

<section id="sub-skin-display" data-testid="settings-display">
  <h2>{SUB['skin-display'].name}</h2>
  <p class="hint">{SUB['skin-display'].hint}</p>
  {#each DISPLAY as item (item.key)}
    <div class="row">
      <span class="about">
        <strong>{item.title}</strong>
        <small>{item.hint}</small>
      </span>
      <div class="chips" data-testid="setting-{item.id}">
        {#each item.choices as choice (choice.value)}
          <button
            class="chip select-fill"
            aria-pressed={settings[item.key] === choice.value}
            data-testid="setting-{item.id}-{choice.value}"
            onclick={() => skin.setSettings({ [item.key]: choice.value })}>{choice.label}</button
          >
        {/each}
      </div>
    </div>
  {/each}
</section>

<section id="sub-skin-active" data-testid="settings-skins">
  <h2>{SUB['skin-active'].name}</h2>
  <p class="hint">{SUB['skin-active'].hint}</p>
  <Skins {skin} />
</section>

<!-- The backup in Decaid's KV store, and the skin's name and version. -->
<section id="sub-skin-backup" data-testid="settings-backup">
  <h2>{SUB['skin-backup'].name}</h2>
  <div class="row">
    <span class="about">
      <strong>backup</strong>
      <small data-testid="backup-time">
        {skin.backupAt ? `in Decaid, ${backupTime(skin.backupAt)}` : 'none yet'}; every change is copied to Decaid
      </small>
      {#if skin.backupError}<small class="warn" data-testid="backup-error">{skin.backupError}</small>{/if}
      {#if restored}<small data-testid="backup-restored">{restored}</small>{/if}
    </span>
    <button class="retry" data-testid="backup-restore" onclick={() => ((restored = null), (confirming = true))}
      >restore from backup</button
    >
  </div>
  <div class="row">
    <span class="about">
      <strong>{PRODUCT_NAME}</strong>
      <small>version {PRODUCT_VERSION}</small>
    </span>
  </div>
  <Lever checked={developer} testid="setting-developer" onchange={toggleDeveloper}>
    <span class="about">
      <strong>developer options</strong>
      <small>shows Skin > Developer, to install a build from a server on your PC. Only on this tablet.</small>
    </span>
  </Lever>
</section>

{#if developer}
  <section id="sub-skin-developer" data-testid="settings-developer">
    <h2>{SUB['skin-developer'].name}</h2>
    <p class="hint">{SUB['skin-developer'].hint}</p>
    <LocalInstall {skin} />
  </section>
{/if}

{#snippet lever(item: Switch)}
  <Lever checked={settings[item.key]} testid="setting-{item.id}" onchange={(on: boolean) => skin.setSettings({ [item.key]: on })}>
    <span class="about">
      <strong>{item.title}</strong>
      <small>{item.hint}</small>
    </span>
  </Lever>
{/snippet}

{#if confirming}
  <Dialog label="restore from backup" width="28rem" maxHeight="80vh" testid="backup-confirm" oncancel={() => (confirming = false)}>
    <div class="dialog">
      <h2>Restore from backup?</h2>
      <p>Every setting on this page becomes the backup's{skin.backupAt ? ` of ${backupTime(skin.backupAt)}` : ''}.</p>
      <div class="actions">
        <button class="retry" data-testid="backup-cancel" onclick={() => (confirming = false)}>cancel</button>
        <button class="retry primary" data-testid="backup-confirm-restore" onclick={restore}>restore</button>
      </div>
    </div>
  </Dialog>
{/if}

{#if importing}
  <Confirm
    title="Convert old A-Flow profiles?"
    text={importQuestion(importing)}
    ok="convert"
    onok={convertOld}
    oncancel={() => (importing = null)}
  />
{/if}

{#if choosing !== null}
  <Dialog label="slot {choosing + 1}" width="28rem" maxHeight="80vh" testid="start-choices" oncancel={() => (choosing = null)}>
    <div class="dialog">
      <h2>slot {choosing + 1}</h2>
      <ul>
        <li>
          <button
            class="choice select-fill"
            aria-pressed={settings.startProfiles[choosing] === null}
            data-testid="start-choice-empty"
            onclick={() => choose(null)}><span class="none">empty</span></button
          >
        </li>
        {#each offered as choice (choice.title)}
          <li>
            <button
              class="choice select-fill"
              aria-pressed={settings.startProfiles[choosing] === choice.title}
              data-testid="start-choice"
              data-title={choice.title}
              onclick={() => choose(choice.title)}>{choice.name}</button
            >
          </li>
        {/each}
        {#if !records && !unread}<li class="none">Reading the profiles …</li>{/if}
      </ul>
    </div>
  </Dialog>
{/if}

{#if typing}
  <NumberPad
    label={named(typing)}
    unit={typing.unit}
    min={typing.min}
    max={typing.max}
    decimals={typing.decimals}
    current={shown(typing)}
    onconfirm={confirm}
    oncancel={() => (typing = null)}
  />
{/if}

{#if typingRatio !== null}
  <NumberPad
    label="hot water: ratio {typingRatio + 1} (1:n)"
    unit=""
    min={RATIO_RANGE.min}
    max={RATIO_RANGE.max}
    decimals={true}
    current={shownRatio(typingRatio)}
    onconfirm={confirmRatio}
    oncancel={() => (typingRatio = null)}
  />
{/if}

{#if typingProfile}
  <NumberPad
    label={typingProfile.label}
    unit={typingProfile.unit}
    min={typingProfile.min}
    max={typingProfile.max}
    decimals={true}
    current={shownProfile(typingProfile)}
    onconfirm={confirmProfile}
    oncancel={() => (typingProfile = null)}
  />
{/if}

<style>
  section {
    padding: var(--space-1) var(--space-3) var(--space-2);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--panel);
    scroll-margin-top: 0.6rem;
  }

  h2 {
    margin: var(--space-2) 0 0.1rem;
    font-size: var(--text-title);
    font-weight: 600;
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: 0.8rem 0;
    border-top: 1px solid var(--line);
  }

  .about {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    text-align: left;
  }

  strong {
    font-size: var(--text-body);
    font-weight: 600;
  }

  small {
    color: var(--dim);
    font-size: var(--text-label);
  }

  .warn {
    color: var(--temperature);
  }

  .values {
    flex: none;
    display: flex;
    gap: var(--space-2);
  }

  .value {
    width: 7rem;
    min-height: 4.2rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-1);
    background: var(--raised);
    border: 1px solid var(--line);
    border-radius: var(--radius);
  }

  .value b {
    font-size: var(--text-value);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .value .lead {
    margin: 0 0.1em 0 0;
  }

  i {
    margin-left: 0.25em;
    font-style: normal;
    font-size: var(--text-label);
    font-weight: 400;
    color: var(--dim);
  }

  .slots {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: var(--space-2);
    padding-bottom: var(--space-1);
  }

  .value.slot {
    width: auto;
    min-width: 0;
    padding: 0 0.6rem;
  }

  .slot b {
    max-width: 100%;
    font-size: var(--text-value);
  }

  .slot.missing {
    border-color: var(--temperature);
  }

  .none {
    color: var(--dim);
    font-style: italic;
  }

  .retry {
    flex: none;
    min-height: var(--control);
    padding: 0 1rem;
    background: var(--raised);
    border: 1px solid var(--line);
    border-radius: var(--radius);
  }

  .actions {
    margin-top: 1rem;
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
  }

  .dialog {
    min-height: 0;
    padding: var(--space-1) var(--space-3) var(--space-3);
    display: flex;
    flex-direction: column;
  }

  .dialog p {
    margin: 0;
    color: var(--dim);
  }

  ul {
    min-height: 0;
    margin: var(--space-2) 0 0;
    padding: 0;
    list-style: none;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .choice {
    width: 100%;
    min-height: var(--control-big);
    padding: 0 1rem;
    text-align: left;
    font-size: var(--text-body);
    background: var(--raised);
    border: 1px solid var(--line);
    border-radius: var(--radius);
  }

  .chips {
    flex: none;
    display: flex;
    gap: var(--space-1);
  }

  .hint {
    margin-bottom: var(--space-1);
  }
</style>
