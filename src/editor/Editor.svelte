<script lang="ts">
  import {
    DEFAULT_PROFILES,
    hasSecondFill,
    paramRanges,
    resolveParams,
    type AFlowParams,
    type NumberField,
  } from '../aflow';
  import { loadSettings, saveSettings } from '../settings';
  import { PHASE_LABEL, type EditField, type PhaseId } from './curve';
  import { dragValue, setValue, toggleFlow, toggleSecondFill } from './edit';
  import {
    FIELD_LABEL,
    FIELD_STEP,
    FIELD_TONE,
    PANEL_LABEL,
    PHASE_FIELDS,
    formatValue,
    snap,
    typedStep,
  } from './fields';
  import Graph from './Graph.svelte';
  import NameDialog from './NameDialog.svelte';
  import NumberPad from './NumberPad.svelte';
  import StepList from './StepList.svelte';
  import ValueChip from './ValueChip.svelte';

  interface PickerProfile {
    id: string;
    name: string;
    title: string;
    params: AFlowParams;
  }

  const defaults: PickerProfile[] = DEFAULT_PROFILES.map((p) => ({
    ...p,
    name: p.id.replace('default-', ''),
  }));

  // The prototype works on fixture data: nothing is loaded, saved or sent. A profile that was
  // 'saved as' lives in this list until the page unloads.
  let saved: PickerProfile[] = $state([]);
  let profileId = $state(defaults[0].id);
  let params: AFlowParams = $state({ ...defaults[0].params });
  let mode: 'simple' | 'detail' = $state('simple');
  let selected: PhaseId = $state('fill');
  let naming = $state(false);
  /** the value the number pad is open for */
  let typing: EditField | null = $state(null);
  // The settings page (D8c) will own this value; until then the button in the footer sets it.
  let settings = $state(loadSettings());

  const profiles = $derived([...defaults, ...saved]);
  const profile = $derived(profiles.find((p) => p.id === profileId)!);
  const resolved = $derived(resolveParams(params));
  const ranges = paramRanges();
  const phases = $derived(
    (Object.keys(PHASE_LABEL) as PhaseId[]).filter((id) => id !== 'secondFill' || hasSecondFill(params)),
  );

  function pick(id: string) {
    profileId = id;
    params = { ...profiles.find((p) => p.id === id)!.params };
    if (selected === 'secondFill' && !hasSecondFill(params)) selected = 'infuse';
  }

  /**
   * What 'save as' does once a name is confirmed. Here it adds the profile to the picker for
   * the session; D7 replaces this body with the real saving to Decaid.
   */
  function saveAs(name: string) {
    const id = `saved-${saved.length + 1}`;
    saved.push({ id, name, title: `A-Flow / ${name}`, params: { ...params } });
    profileId = id;
  }

  function edit(field: EditField, value: number) {
    params = setValue(params, field, value);
    if (selected === 'secondFill' && !hasSecondFill(params)) selected = 'infuse';
  }

  function drag(field: NumberField, value: number) {
    params = dragValue(params, field, value);
  }

  function step(field: EditField, direction: 1 | -1) {
    edit(field, snap(field, resolved[field] + direction * FIELD_STEP[field]));
  }

  function switchSecondFill() {
    params = toggleSecondFill(params);
    if (hasSecondFill(params)) selected = mode === 'detail' ? 'secondFill' : selected;
    else if (selected === 'secondFill') selected = 'infuse';
  }

  function showSteps(show: boolean) {
    settings.showProfileSteps = show;
    saveSettings(settings);
  }
</script>

<div class="editor" class:detail={mode === 'detail'}>
  <header>
    <div class="group picker" role="group" aria-label="profile" data-testid="picker">
      {#each profiles as p (p.id)}
        <button
          class="seg"
          aria-pressed={p.id === profileId}
          data-testid="profile-{p.id}"
          onclick={() => pick(p.id)}
        >
          {p.name}
        </button>
      {/each}
    </div>
    <div class="group">
      <button class="seg action" data-testid="save-as" onclick={() => (naming = true)}>
        save as
      </button>
      <div class="group" role="group" aria-label="editor mode">
        <button
          class="seg"
          aria-pressed={mode === 'simple'}
          data-testid="mode-simple"
          onclick={() => (mode = 'simple')}>simple</button
        >
        <button
          class="seg"
          aria-pressed={mode === 'detail'}
          data-testid="mode-detail"
          onclick={() => (mode = 'detail')}>detail</button
        >
      </div>
    </div>
  </header>

  <section class="stage">
    {#if mode === 'detail'}
      <div class="phases" role="group" aria-label="phase">
        {#each phases as id (id)}
          <button
            class="seg"
            aria-pressed={id === selected}
            data-testid="phase-{id}"
            onclick={() => (selected = id)}
          >
            {PHASE_LABEL[id]}
          </button>
        {/each}
      </div>
    {/if}
    <div class="plot">
      <Graph
        {params}
        {mode}
        {selected}
        ondrag={drag}
        onedit={edit}
        onselect={(id) => (selected = id)}
      />
    </div>
  </section>

  {#if mode === 'detail'}
    <aside data-testid="detail-panel">
      <h2>{PHASE_LABEL[selected]}</h2>
      {#each PHASE_FIELDS[selected] as field (field)}
        <ValueChip
          label={PANEL_LABEL[field]}
          value={formatValue(field, resolved[field])}
          tone={FIELD_TONE[field] ?? 'none'}
          testid={field}
          onstep={(d) => step(field, d)}
          onedit={() => (typing = field)}
        />
      {/each}
      <h2 class="shot">shot</h2>
      <ValueChip
        label={PANEL_LABEL.dose}
        value={formatValue('dose', params.dose)}
        testid="dose"
        onstep={(d) => step('dose', d)}
        onedit={() => (typing = 'dose')}
      />
    </aside>
  {/if}

  <footer>
    <button
      class="toggle"
      aria-pressed={hasSecondFill(params)}
      data-testid="toggle-second-fill"
      onclick={switchSecondFill}
    >
      <span class="lamp"></span>2nd fill
    </button>
    <button
      class="toggle"
      data-testid="toggle-flow"
      aria-label="flow direction"
      onclick={() => (params = toggleFlow(params))}
    >
      <span class="arrow" class:down={!params.flowUp}>↗</span>{params.flowUp
        ? 'flow up'
        : 'flow down'}
    </button>
    <div class="legend">
      <span class="flow">flow ml/s</span>
      <span class="pressure">pressure bar</span>
      <span class="temperature">temperature °C</span>
    </div>
    <button
      class="toggle setting"
      aria-pressed={settings.showProfileSteps}
      data-testid="toggle-steps"
      onclick={() => showSteps(!settings.showProfileSteps)}
    >
      <span class="lamp"></span>profile steps
    </button>
  </footer>

  {#if settings.showProfileSteps}
    <section class="steps">
      <StepList {params} title={profile.title} />
    </section>
  {/if}
</div>

{#if naming}
  <NameDialog
    taken={profiles.map((p) => p.name)}
    onconfirm={(name) => {
      naming = false;
      saveAs(name);
    }}
    oncancel={() => (naming = false)}
  />
{/if}

{#if typing}
  {@const field = typing}
  <NumberPad
    label={FIELD_LABEL[field]}
    unit={ranges[field].unit}
    min={ranges[field].min}
    max={ranges[field].max}
    decimals={typedStep(field) < 1}
    current={formatValue(field, resolved[field]).replace(/ .*$/, '')}
    onconfirm={(value) => {
      edit(field, snap(field, value, undefined, typedStep(field)));
      typing = null;
    }}
    oncancel={() => (typing = null)}
  />
{/if}

<style>
  .editor {
    height: 100%;
    box-sizing: border-box;
    padding: 0.7rem 1rem;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr) auto auto;
    grid-template-areas: 'header' 'stage' 'footer' 'steps';
    gap: 0.6rem 1rem;
  }

  /* The panel runs down to the bottom edge: a phase has up to six values and the dose. */
  .editor.detail {
    grid-template-columns: minmax(0, 1fr) 19rem;
    grid-template-areas: 'header header' 'stage panel' 'footer panel' 'steps panel';
  }

  header {
    grid-area: header;
    display: flex;
    justify-content: space-between;
    gap: 1rem;
  }

  .group,
  .phases {
    display: flex;
    gap: 0.4rem;
  }

  header > .group:last-child {
    gap: 1rem;
  }

  /* Saved profiles are added on the right: the picker scrolls when they no longer fit. */
  .picker {
    min-width: 0;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .picker .seg {
    flex: none;
    max-width: 14rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  button {
    font: inherit;
    color: var(--fg);
    border: 1px solid var(--line);
    background: var(--panel);
    touch-action: manipulation;
    user-select: none;
  }

  .seg {
    min-height: 3rem;
    min-width: 6rem;
    padding: 0 1.1rem;
    border-radius: 0.9rem;
    font-size: 1rem;
  }

  .seg[aria-pressed='true'] {
    background: var(--fg);
    border-color: var(--fg);
    color: var(--bg);
    font-weight: 600;
  }

  .seg.action {
    background: var(--raised);
    white-space: nowrap;
  }

  .stage {
    grid-area: stage;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .phases .seg {
    flex: 1;
    min-width: 0;
    padding: 0 0.4rem;
  }

  .plot {
    flex: 1;
    min-height: 0;
    background: var(--panel);
    border-radius: 1rem;
  }

  aside {
    grid-area: panel;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  h2 {
    margin: 0;
    min-height: 3rem;
    display: flex;
    align-items: center;
    font-size: 1.3rem;
    font-weight: 600;
  }

  h2.shot {
    min-height: 0;
    margin-top: auto;
    padding-top: 0.5rem;
    font-size: 0.9rem;
    font-weight: 400;
    color: var(--dim);
  }

  footer {
    grid-area: footer;
    display: flex;
    align-items: center;
    gap: 0.8rem;
  }

  .toggle {
    min-height: 3rem;
    min-width: 9rem;
    padding: 0 1.2rem;
    border-radius: 1.5rem;
    font-size: 1.05rem;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.6rem;
    white-space: nowrap;
  }

  .lamp {
    width: 0.8rem;
    height: 0.8rem;
    border-radius: 50%;
    border: 2px solid var(--dim);
  }

  .toggle[aria-pressed='true'] {
    border-color: var(--flow);
  }

  .toggle[aria-pressed='true'] .lamp {
    background: var(--flow);
    border-color: var(--flow);
  }

  .arrow {
    display: inline-block;
    color: var(--flow);
    font-size: 1.2rem;
    line-height: 1;
  }

  .arrow.down {
    transform: scaleY(-1);
  }

  /* A setting, not a part of the profile: it is quieter than the two toggles. */
  .setting {
    margin-left: auto;
    min-width: 0;
    color: var(--dim);
  }

  .setting[aria-pressed='true'] {
    border-color: var(--line);
  }

  .setting[aria-pressed='true'] .lamp {
    background: var(--dim);
    border-color: var(--dim);
  }

  .legend {
    margin-left: 0.6rem;
    display: flex;
    gap: 1rem;
    font-size: 0.85rem;
    color: var(--dim);
    white-space: nowrap;
  }

  .legend span::before {
    content: '';
    display: inline-block;
    width: 1.1rem;
    height: 0.24rem;
    margin-right: 0.4rem;
    border-radius: 0.12rem;
    vertical-align: middle;
    background: var(--tone);
  }

  .legend .flow {
    --tone: var(--flow);
  }
  .legend .pressure {
    --tone: var(--pressure);
  }
  .legend .temperature {
    --tone: var(--temperature);
  }

  .steps {
    grid-area: steps;
    background: var(--panel);
    border-radius: 1rem;
    padding: 0.4rem 0.4rem;
  }
</style>
