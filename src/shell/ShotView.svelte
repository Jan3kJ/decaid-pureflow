<script lang="ts">
  import ShotGraph from '../graph/ShotGraph.svelte';
  import { beanLabel } from '../history/entries';
  import { homeShot } from './home-shot';
  import NextShot from './NextShot.svelte';
  import { phaseTable, type PhaseRow } from './phases';
  import type { Skin } from './skin.svelte';

  interface Props {
    skin: Skin;
  }

  let { skin }: Props = $props();

  // Home is the shot screen (spec 3.11): one graph on the left, and the right column of a fixed
  // width with the shot's time, weight and values, so nothing changes size when a shot starts.
  // While the shot runs the curves are live and stop is at the column's bottom; after it the
  // shot stays with the per-phase table until the next one starts (`homeShot`).
  const shown = $derived(homeShot(skin.shot, skin.recalled?.series ?? null, skin.weight, skin.newestShot));
  const running = $derived(shown.kind === 'running');
  const finished = $derived(shown.kind === 'finished');
  const recalled = $derived(shown.kind === 'recalled' ? skin.recalled : null);
  const snapshot = $derived(skin.link === 'machine' ? skin.snapshot : null);
  const brewing = $derived(snapshot?.state.state === 'espresso' && running);
  const profile = $derived(skin.workflow?.profile);
  const target = $derived(skin.workflow?.context?.targetYield || null);
  // The profile step that runs: the machine's frame number, not its substate (research 8.2).
  const step = $derived(brewing && snapshot ? profile?.steps[snapshot.profileFrame]?.name : undefined);
  // In espresso before water moves: the graph and the timer wait (shot.ts).
  const heating = $derived(brewing && shown.series.t.length === 0);
  // Streamline's table of the shot (phases.ts), once it is over and the setting shows it.
  const table = $derived(
    finished && skin.shot && skin.settings.showShotValues ? phaseTable(skin.shot.samples, skin.shot.finalWeight) : null,
  );
  const rows = $derived(
    table
      ? ([
          ['preinfusion', 'Preinfusion', table.preinfusion],
          ['extraction', 'Extraction', table.extraction],
          ['total', 'Total', table.total],
        ] as const)
      : [],
  );
  const PLOT = { running: 'shot-plot', finished: 'last-shot', recalled: 'history-graph', none: 'empty-graph' } as const;
  const LABEL = {
    running: 'live shot',
    finished: 'last shot',
    recalled: 'last shot of the history entry',
    none: 'no shot yet',
  } as const;
  const value = (number: number | null | undefined, digits = 1) =>
    number === null || number === undefined ? '–' : number.toFixed(digits);
  const cell = (row: Partial<PhaseRow> | null, key: keyof PhaseRow) => row?.[key] ?? '';
</script>

<div class="shot" class:values={table !== null} data-testid="home-shot" data-shot={shown.kind}>
  <header data-testid="shot-caption">
    {#if recalled}
      {@const entry = recalled.entry}
      <span class="recalled" data-testid="recalled">
        last shot with
        <strong data-testid="recalled-profile">{entry.profileTitle}</strong>
        <strong data-testid="recalled-bean">{beanLabel(entry.bean)}</strong>
        {#if entry.grinderSetting}
          <strong data-testid="recalled-grinder">grinder {entry.grinderSetting}</strong>
        {/if}
      </span>
      <button class="chip" data-testid="dismiss-recalled" onclick={() => skin.dismissRecalled()}>dismiss</button>
    {:else if finished}
      <span data-testid="espresso-step">
        shot finished
        <strong data-testid="last-shot-time">{value(shown.seconds)} s</strong>
        {#if shown.weight !== null}
          <strong class="weight" data-testid="last-shot-weight">{value(shown.weight)} g</strong>
        {/if}
      </span>
    {:else if running}
      <span data-testid="espresso-step">{heating ? 'heating' : (step ?? (brewing ? '' : skin.status.title))}</span>
    {/if}
  </header>

  <div class="plot" data-testid={PLOT[shown.kind]}>
    <ShotGraph
      {...shown.series}
      fit={finished || recalled !== null}
      minSeconds={skin.expectedSeconds}
      legend={skin.settings.showGraphLegend}
      label={LABEL[shown.kind]}
    />
  </div>

  {#if table}
    <table data-testid="shot-phases">
      <thead>
        <tr>
          <th></th>
          <th>s</th>
          <th class="weight">g</th>
          <th>ml</th>
          <th class="temperature">°C</th>
          <th class="flow">ml/s</th>
          <th class="pressure">bar</th>
        </tr>
      </thead>
      <tbody>
        {#each rows as [id, name, row] (id)}
          <tr data-testid="phase-{id}" class={id}>
            <th>{name}</th>
            {#each ['seconds', 'weight', 'volume', 'temperature', 'flow', 'pressure'] as const as key (key)}
              <td data-testid="phase-{id}-{key}">{cell(row, key)}</td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}

  <aside data-testid="shot-column">
    <!-- The profile and bean for the next shot; while a shot runs their room goes to stop. -->
    {#if !running}
      <NextShot {skin} />
    {/if}
    <div class="big">
      <small>time</small>
      <b data-testid="shot-timer">{value(shown.seconds)}<i>s</i></b>
    </div>
    <div class="big weight">
      <small>weight{target ? `, stops at ${+target.toFixed(1)} g` : ''}</small>
      <b data-testid="shot-weight">{value(shown.weight)}<i>g</i></b>
    </div>
    <dl>
      <div class="pressure">
        <dt>pressure</dt>
        <dd data-testid="shot-pressure">{value(snapshot?.pressure)} <i>bar</i></dd>
      </div>
      <div class="flow">
        <dt>flow</dt>
        <dd data-testid="shot-flow">{value(snapshot?.flow)} <i>ml/s</i></dd>
      </div>
      <div class="temperature">
        <dt>temperature</dt>
        <dd data-testid="shot-temperature">{value(snapshot?.groupTemperature)} <i>°C</i></dd>
      </div>
    </dl>
    {#if skin.notice}
      <p class="notice" data-testid="notice">{skin.notice}</p>
    {:else if skin.info}
      <p class="notice info" data-testid="tare-notice">{skin.info}</p>
    {/if}
    <!-- Nothing is started here: the DE1 is started at the machine. What runs can be stopped. -->
    {#if running || skin.canStop}
      <button class="stop" data-testid="stop" disabled={!skin.canStop} onclick={() => skin.stop()}>stop</button>
    {/if}
  </aside>
</div>

<style>
  .shot {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 17rem;
    grid-template-rows: auto minmax(0, 1fr);
    grid-template-areas: 'header side' 'plot side';
    gap: 0.6rem 1.2rem;
  }

  /* The table's row only when it is drawn: without it the graph takes its height and its gap. */
  .shot.values {
    grid-template-rows: auto minmax(0, 1fr) auto;
    grid-template-areas: 'header side' 'plot side' 'table side';
  }

  header {
    grid-area: header;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    min-height: 3.2rem;
    color: var(--dim);
    font-size: var(--text-body);
  }

  header > span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  header strong {
    margin-left: 0.8rem;
    color: var(--fg);
    font-size: var(--text-value);
    font-variant-numeric: tabular-nums;
  }

  header strong.weight {
    color: var(--weight);
  }

  .recalled strong {
    font-size: var(--text-body);
  }

  .chip {
    flex: none;
    min-width: 7rem;
    min-height: 3.2rem;
    padding: 0 1rem;
    font: inherit;
    font-size: var(--text-body);
    color: var(--fg);
    border: 1px solid var(--line);
    background: var(--panel);
    border-radius: 0.9rem;
    touch-action: manipulation;
    user-select: none;
  }

  .plot {
    grid-area: plot;
    min-height: 0;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--panel);
  }

  table {
    grid-area: table;
    /* `collapse` would drop the frame's rounded corners */
    border-collapse: separate;
    border-spacing: 0;
    font-size: var(--text-value);
    font-variant-numeric: tabular-nums;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--panel);
  }

  th,
  td {
    padding: 0.25rem 0.8rem;
    text-align: left;
    white-space: nowrap;
  }

  thead th {
    padding-top: 0.5rem;
    color: var(--dim);
    font-size: var(--text-label);
    font-weight: 400;
  }

  tbody th {
    color: var(--dim);
    font-weight: 600;
    text-align: right;
  }

  tbody tr:last-child th,
  tbody tr:last-child td {
    padding-bottom: 0.5rem;
  }

  tr.total td {
    font-weight: 700;
  }

  thead .weight {
    color: var(--weight);
  }
  thead .temperature {
    color: var(--temperature);
  }
  thead .flow {
    color: var(--flow);
  }
  thead .pressure {
    color: var(--pressure);
  }

  aside {
    grid-area: side;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
  }

  small,
  dt {
    color: var(--dim);
    font-size: var(--text-label);
  }

  i {
    font-style: normal;
    font-size: 0.5em;
    font-weight: 400;
    color: var(--dim);
    margin-left: 0.2em;
  }

  .big {
    display: flex;
    flex-direction: column;
  }

  .big b {
    font-size: var(--text-big);
    font-weight: 600;
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
  }

  .big.weight b {
    color: var(--weight);
  }

  dl {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  dl div {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
  }

  dd {
    margin: 0;
    font-size: var(--text-title);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  dd i {
    font-size: 0.6em;
  }

  .pressure dd {
    color: var(--pressure);
  }
  .flow dd {
    color: var(--flow);
  }
  .temperature dd {
    color: var(--temperature);
  }

  .notice {
    margin: 0;
    color: var(--warn);
    font-size: var(--text-label);
  }

  .info {
    color: var(--fg);
  }

  .stop {
    margin-top: auto;
    min-height: 7rem;
    font: inherit;
    font-size: var(--text-large);
    font-weight: 600;
    color: var(--bg);
    background: var(--temperature);
    border: 1px solid var(--temperature);
    border-radius: var(--radius);
    touch-action: manipulation;
    user-select: none;
  }

  .stop:disabled {
    background: var(--panel);
    border-color: var(--line);
    color: var(--dim);
  }
</style>
