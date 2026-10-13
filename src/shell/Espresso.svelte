<script lang="ts">
  import ShotGraph from '../graph/ShotGraph.svelte';
  import { emptySeries, shotSeconds } from './shot';
  import type { Skin } from './skin.svelte';

  interface Props {
    skin: Skin;
  }

  let { skin }: Props = $props();

  const series = $derived(skin.shot?.series ?? emptySeries());
  const snapshot = $derived(skin.link === 'machine' ? skin.snapshot : null);
  const brewing = $derived(snapshot?.state.state === 'espresso');
  const profile = $derived(skin.workflow?.profile);
  const target = $derived(skin.workflow?.context?.targetYield || null);
  // The profile step that runs: the machine's frame number, not its substate (research 8.2).
  const step = $derived(brewing && snapshot ? profile?.steps[snapshot.profileFrame]?.name : undefined);
  const value = (number: number | null | undefined, digits = 1) =>
    number === null || number === undefined ? '–' : number.toFixed(digits);
</script>

<div class="espresso">
  <header>
    <strong data-testid="espresso-profile">{profile?.title ?? '–'}</strong>
    <span data-testid="espresso-step">{step ?? (brewing ? '' : skin.status.title)}</span>
  </header>

  <div class="plot">
    <ShotGraph {...series} targetWeight={target} label="live shot" />
  </div>

  <aside>
    <div class="big">
      <small>time</small>
      <b data-testid="shot-timer">{shotSeconds(skin.shot).toFixed(1)}<i>s</i></b>
    </div>
    <div class="big weight">
      <small>weight{target ? `, stops at ${+target.toFixed(1)} g` : ''}</small>
      <b data-testid="shot-weight">{value(skin.weight)}<i>g</i></b>
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
    {/if}
    <button data-testid="stop" disabled={skin.action !== 'stop'} onclick={() => skin.stop()}>stop</button>
  </aside>
</div>

<style>
  .espresso {
    height: 100%;
    box-sizing: border-box;
    padding: 1rem 1.2rem;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 17rem;
    grid-template-rows: auto minmax(0, 1fr);
    grid-template-areas: 'header side' 'plot side';
    gap: 0.8rem 1.2rem;
  }

  header {
    grid-area: header;
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
    min-height: 2rem;
  }

  header strong {
    font-size: 1.4rem;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  header span {
    color: var(--dim);
    font-size: 1.1rem;
    white-space: nowrap;
  }

  .plot {
    grid-area: plot;
    min-height: 0;
    border: 1px solid var(--line);
    border-radius: 0.9rem;
    background: var(--panel);
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
    font-size: 0.85rem;
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
    font-size: 3.6rem;
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
    font-size: 1.6rem;
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
    font-size: 0.95rem;
  }

  button {
    margin-top: auto;
    min-height: 7rem;
    font: inherit;
    font-size: 2.2rem;
    font-weight: 600;
    color: var(--bg);
    background: var(--temperature);
    border: 1px solid var(--temperature);
    border-radius: 0.9rem;
    touch-action: manipulation;
    user-select: none;
  }

  button:disabled {
    background: var(--panel);
    border-color: var(--line);
    color: var(--dim);
  }
</style>
