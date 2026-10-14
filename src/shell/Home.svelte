<script lang="ts">
  import ShotGraph from '../graph/ShotGraph.svelte';
  import { beanLabel } from '../history/entries';
  import { shotSeconds, shotWeight } from './shot';
  import type { Skin } from './skin.svelte';

  interface Props {
    skin: Skin;
  }

  let { skin }: Props = $props();

  const context = $derived(skin.workflow?.context);
  const grams = (value: number | null | undefined) => (value ? `${+value.toFixed(1)} g` : '–');
  // The finished shot stays here until it is dismissed or the next one starts.
  const last = $derived(skin.shot?.ended ? skin.shot : null);
  const lastWeight = $derived(shotWeight(last));
  // An entry restored from the shot history, with the graph of its latest shot (spec 3.5).
  const recalled = $derived(skin.recalled);
</script>

<div class="home">
  <section class="status {skin.status.tone}" data-testid="status" data-link={skin.link}>
    <span class="dot"></span>
    <div>
      <h1 data-testid="status-title">{skin.status.title}</h1>
      <p data-testid="status-detail">{skin.status.detail}</p>
    </div>
  </section>

  <div class="tools">
    <button class="chip" data-testid="open-scale" onclick={() => skin.go('scale')}>
      <small>scale</small>
      <span data-testid="scale-weight">{skin.weight === null ? 'none' : `${skin.weight.toFixed(1)} g`}</span>
    </button>
    <button class="chip" data-testid="open-settings" onclick={() => skin.go('settings')}>settings</button>
    <button class="chip" data-testid="sleep" disabled={!skin.canSleep} onclick={() => skin.sleep()}>sleep</button>
  </div>

  <section class="last">
    {#if recalled}
      {@const entry = recalled.entry}
      <header>
        <span class="recalled" data-testid="recalled">
          last shot with
          <strong data-testid="recalled-profile">{entry.profileTitle}</strong>
          <strong data-testid="recalled-bean">{beanLabel(entry.bean)}</strong>
          {#if entry.grinderSetting}
            <strong data-testid="recalled-grinder">grinder {entry.grinderSetting}</strong>
          {/if}
        </span>
        <button class="chip" data-testid="dismiss-recalled" onclick={() => skin.dismissRecalled()}>dismiss</button>
      </header>
      <div class="plot" data-testid="history-graph">
        <ShotGraph
          {...recalled.series}
          targetWeight={entry.latest.workflow?.context?.targetYield}
          fit
          legend={skin.settings.showGraphLegend}
          label="last shot of the history entry"
        />
      </div>
    {:else if last}
      <header>
        <span>
          last shot
          <strong data-testid="last-shot-time">{shotSeconds(last).toFixed(1)} s</strong>
          {#if lastWeight !== null}
            <strong class="weight" data-testid="last-shot-weight">{lastWeight.toFixed(1)} g</strong>
          {/if}
        </span>
        <button class="chip" data-testid="dismiss-shot" onclick={() => skin.dismissShot()}>dismiss</button>
      </header>
      <div class="plot" data-testid="last-shot">
        <ShotGraph
          {...last.series}
          targetWeight={context?.targetYield}
          fit
          legend={skin.settings.showGraphLegend}
          label="last shot"
        />
      </div>
    {/if}
  </section>

  <div class="side">
    <button class="profile" data-testid="open-profiles" onclick={() => skin.go('profiles')}>
      <small>profile</small>
      <strong data-testid="profile-name">{skin.workflow?.profile?.title ?? '–'}</strong>
      <span class="numbers">
        <span><small>dose</small> <b data-testid="dose">{grams(context?.targetDoseWeight)}</b></span>
        <span><small>stop at</small> <b data-testid="target-weight">{grams(context?.targetYield)}</b></span>
      </span>
    </button>

    {#if skin.action === 'stop'}
      <button class="go stop" data-testid="stop" onclick={() => skin.stop()}>stop</button>
    {:else}
      <button class="go" data-testid="start" disabled={skin.action !== 'start'} onclick={() => skin.start()}>
        start espresso
      </button>
    {/if}
    {#if skin.notice}
      <p class="notice" data-testid="notice">{skin.notice}</p>
    {/if}

    <div class="row">
      <button class="chip" data-testid="open-steam" onclick={() => skin.go('steam')}>steam</button>
      <button class="chip" data-testid="open-editor" onclick={() => skin.go('editor')}>editor</button>
    </div>
  </div>
</div>

<style>
  .home {
    height: 100%;
    box-sizing: border-box;
    padding: 1rem 1.2rem;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 23rem;
    grid-template-rows: auto minmax(0, 1fr);
    grid-template-areas: 'status tools' 'last side';
    gap: 1rem 1.2rem;
  }

  .status {
    grid-area: status;
    display: flex;
    align-items: center;
    gap: 1rem;
    min-width: 0;
  }

  .dot {
    flex: none;
    width: 1.1rem;
    height: 1.1rem;
    border-radius: 50%;
    background: var(--dim);
  }
  .ok .dot {
    background: var(--pressure);
  }
  .busy .dot {
    background: var(--flow);
  }
  .warn .dot {
    background: var(--warn);
  }

  h1 {
    margin: 0;
    font-size: 2.2rem;
    font-weight: 600;
    line-height: 1.15;
  }

  .warn h1 {
    color: var(--warn);
  }

  p {
    margin: 0.1rem 0 0;
    color: var(--dim);
    font-size: 1rem;
  }

  button {
    font: inherit;
    color: var(--fg);
    border: 1px solid var(--line);
    background: var(--panel);
    border-radius: 0.9rem;
    touch-action: manipulation;
    user-select: none;
  }

  small {
    color: var(--dim);
    font-size: 0.85rem;
  }

  .tools,
  .row {
    display: flex;
    gap: 0.6rem;
  }

  .tools {
    grid-area: tools;
    align-items: center;
  }

  .chip {
    flex: 1;
    min-height: 3.2rem;
    padding: 0 1rem;
    font-size: 1rem;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  .chip:disabled {
    color: var(--dim);
  }

  .last {
    grid-area: last;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .last header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    color: var(--dim);
  }

  .last header strong {
    margin-left: 0.8rem;
    color: var(--fg);
    font-size: 1.3rem;
    font-variant-numeric: tabular-nums;
  }

  .last header strong.weight {
    color: var(--weight);
  }

  .last header .recalled {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .last header .recalled strong {
    font-size: 1.1rem;
  }

  .last header .chip {
    flex: none;
    min-width: 7rem;
  }

  .plot {
    flex: 1;
    min-height: 0;
    border: 1px solid var(--line);
    border-radius: 0.9rem;
    background: var(--panel);
  }

  .side {
    grid-area: side;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
  }

  .profile {
    padding: 0.9rem 1.1rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    text-align: left;
  }

  .profile strong {
    font-size: 1.4rem;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .numbers {
    margin-top: 0.4rem;
    display: flex;
    gap: 1.6rem;
  }

  .numbers b {
    font-size: 1.5rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .go {
    flex: 1;
    min-height: 6rem;
    font-size: 2rem;
    font-weight: 600;
    background: var(--fg);
    border-color: var(--fg);
    color: var(--bg);
  }

  .go:disabled {
    background: var(--panel);
    border-color: var(--line);
    color: var(--dim);
  }

  .go.stop {
    background: var(--temperature);
    border-color: var(--temperature);
  }

  .notice {
    margin: 0;
    color: var(--warn);
    font-size: 0.95rem;
  }

  .row .chip {
    min-height: 4rem;
    font-size: 1.2rem;
  }
</style>
