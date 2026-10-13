<script lang="ts">
  import { DEFAULT_PROFILES, hasSecondFill, type AFlowParams, type NumberField } from '../aflow';
  import { PAUSE_SECONDS } from '../aflow/constants';
  import { PHASE_LABEL, type LineId, type PhaseId } from './curve';
  import { FIELD_LABEL, FIELD_STEP, PHASE_FIELDS, formatValue, snap } from './fields';
  import Graph from './Graph.svelte';
  import StepList from './StepList.svelte';
  import ValueChip from './ValueChip.svelte';

  // The prototype (D5) works on the default profiles only: nothing is loaded, saved or sent.
  let profileId = $state(DEFAULT_PROFILES[0].id);
  let params: AFlowParams = $state({ ...DEFAULT_PROFILES[0].params });
  let mode: 'simple' | 'detail' = $state('simple');
  let selected: PhaseId = $state('fill');
  let stepsOpen = $state(false);

  const profile = $derived(DEFAULT_PROFILES.find((p) => p.id === profileId)!);
  const phases = $derived(
    (Object.keys(PHASE_LABEL) as PhaseId[]).filter((id) => id !== 'secondFill' || hasSecondFill(params)),
  );

  const TONE: Partial<Record<NumberField, LineId>> = {
    fillFlow: 'flow',
    secondFillFlow: 'flow',
    pourFlow: 'flow',
    infusePressure: 'pressure',
    pourPressure: 'pressure',
    fillTemperature: 'temperature',
    pourTemperature: 'temperature',
  };

  function pick(id: string) {
    profileId = id;
    params = { ...DEFAULT_PROFILES.find((p) => p.id === id)!.params };
    if (selected === 'secondFill' && !hasSecondFill(params)) selected = 'infuse';
  }

  function set(field: NumberField, value: number) {
    params[field] = value;
  }

  function step(field: NumberField, direction: 1 | -1) {
    params[field] = snap(field, params[field] + direction * FIELD_STEP[field]);
  }

  function toggleSecondFill() {
    params.pauseDuration = hasSecondFill(params) ? 0 : PAUSE_SECONDS;
    if (hasSecondFill(params)) selected = mode === 'detail' ? 'secondFill' : selected;
    else if (selected === 'secondFill') selected = 'infuse';
  }
</script>

<div class="editor" class:detail={mode === 'detail'}>
  <header>
    <div class="group" role="group" aria-label="start from a default profile">
      {#each DEFAULT_PROFILES as p (p.id)}
        <button
          class="seg"
          aria-pressed={p.id === profileId}
          data-testid="profile-{p.id}"
          onclick={() => pick(p.id)}
        >
          {p.id.replace('default-', '').replaceAll('-', ' ')}
        </button>
      {/each}
    </div>
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
      <Graph {params} {mode} {selected} onchange={set} onselect={(id) => (selected = id)} />
    </div>
  </section>

  {#if mode === 'detail'}
    <aside data-testid="detail-panel">
      <h2>{PHASE_LABEL[selected]}</h2>
      {#each PHASE_FIELDS[selected] as field (field)}
        <ValueChip
          label={FIELD_LABEL[field]}
          value={formatValue(field, params[field])}
          tone={TONE[field] ?? 'none'}
          testid={field}
          onstep={(d) => step(field, d)}
        />
      {/each}
      <h2 class="shot">shot</h2>
      <ValueChip
        label={FIELD_LABEL.dose}
        value={formatValue('dose', params.dose)}
        testid="dose"
        onstep={(d) => step('dose', d)}
      />
    </aside>
  {/if}

  <footer>
    <button
      class="toggle"
      aria-pressed={hasSecondFill(params)}
      data-testid="toggle-second-fill"
      onclick={toggleSecondFill}
    >
      <span class="lamp"></span>2nd fill
    </button>
    <button
      class="toggle"
      data-testid="toggle-flow"
      aria-label="flow direction"
      onclick={() => (params.flowUp = !params.flowUp)}
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
      class="toggle fold"
      aria-expanded={stepsOpen}
      data-testid="toggle-steps"
      onclick={() => (stepsOpen = !stepsOpen)}
    >
      profile steps <span class="arrow" class:down={stepsOpen}>▾</span>
    </button>
  </footer>

  {#if stepsOpen}
    <section class="steps">
      <StepList {params} title={profile.title} />
    </section>
  {/if}
</div>

<style>
  .editor {
    height: 100%;
    box-sizing: border-box;
    padding: 0.8rem 1rem;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr) auto auto;
    grid-template-areas: 'header' 'stage' 'footer' 'steps';
    gap: 0.7rem 1rem;
  }

  .editor.detail {
    grid-template-columns: minmax(0, 1fr) 19rem;
    grid-template-areas: 'header header' 'stage panel' 'footer footer' 'steps steps';
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

  button {
    font: inherit;
    color: var(--fg);
    border: 1px solid var(--line);
    background: var(--panel);
    touch-action: manipulation;
    user-select: none;
  }

  .seg {
    min-height: 3.25rem;
    min-width: 6.5rem;
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
    gap: 0.6rem;
  }

  h2 {
    margin: 0;
    min-height: 3.25rem;
    display: flex;
    align-items: center;
    font-size: 1.3rem;
    font-weight: 600;
  }

  h2.shot {
    min-height: 0;
    margin-top: auto;
    padding-top: 0.6rem;
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
    min-height: 3.5rem;
    min-width: 9.5rem;
    padding: 0 1.3rem;
    border-radius: 1.75rem;
    font-size: 1.05rem;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.6rem;
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

  .fold {
    margin-left: auto;
    min-width: 0;
    color: var(--dim);
  }

  .fold .arrow {
    color: var(--dim);
  }

  .legend {
    margin-left: 1rem;
    display: flex;
    gap: 1.2rem;
    font-size: 0.85rem;
    color: var(--dim);
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
    padding: 0.5rem 0.4rem;
  }
</style>
