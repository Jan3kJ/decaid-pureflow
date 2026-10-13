<script lang="ts">
  import ShotGraph from '../graph/ShotGraph.svelte';
  import type { Skin } from '../shell/skin.svelte';
  import { emptySteamSeries, steamSeconds } from './run';
  import { readScale } from './timer';

  interface Props {
    skin: Skin;
  }

  let { skin }: Props = $props();

  // The values are the settings page's; this page only reads them.
  const settings = $derived(skin.settings.steam);

  const series = $derived(skin.steam?.series ?? emptySteamSeries());
  const steaming = $derived(skin.steam !== null && !skin.steam.ended);
  /** s, the timer the machine has: `steamSettings.duration` of the workflow */
  const timer = $derived(skin.workflow?.steamSettings?.duration ?? null);
  const reading = $derived(skin.weight === null ? null : readScale(skin.weight, settings));
  const grams = (value: number) => `${+value.toFixed(1)} g`;
</script>

<div class="steam">
  <header>
    <strong>Steam</strong>
    <span data-testid="steam-state">
      {#if skin.steam}
        {steaming ? 'steaming' : 'last steam'}
        <b data-testid="steam-elapsed">{steamSeconds(skin.steam).toFixed(0)} s</b>
      {:else}
        {skin.status.title}
      {/if}
    </span>
  </header>

  <div class="plot">
    <ShotGraph
      t={series.t}
      pressure={series.pressure}
      temperature={series.temperature}
      yMax={4}
      minSeconds={Math.max(30, timer ?? 0)}
      label="steam graph"
    />
  </div>

  <aside>
    <div class="favourites">
      {#each settings.favourites as seconds, i (i)}
        <button
          class="chip"
          class:on={seconds === timer}
          data-testid="steam-favourite"
          onclick={() => skin.setSteamTimer(seconds)}
        >
          {seconds} s
        </button>
      {/each}
    </div>

    <div class="big">
      <small>steam timer</small>
      <b data-testid="steam-timer">{timer ?? '–'}<i>s</i></b>
    </div>

    <dl>
      <div class="weight">
        <dt>scale</dt>
        <dd data-testid="steam-weight">{skin.weight === null ? '–' : `${skin.weight.toFixed(1)} g`}</dd>
      </div>
      <div>
        <dt>mug</dt>
        <dd>
          {#if reading}
            <span class="size" data-testid="steam-mug">{reading.mug.size}</span>
            <span class="of" data-testid="steam-mug-weight">{grams(reading.mug.weight)}</span>
          {:else}
            –
          {/if}
        </dd>
      </div>
      <div>
        <dt>milk</dt>
        <dd data-testid="steam-milk">{reading ? grams(reading.milk) : '–'}</dd>
      </div>
    </dl>

    <button
      class="set"
      data-testid="steam-set-timer"
      disabled={!reading || reading.seconds === 0}
      onclick={() => reading && skin.setSteamTimer(reading.seconds)}
    >
      set timer
      {#if reading && reading.seconds > 0}
        <b data-testid="steam-seconds">{reading.seconds} s</b>
      {/if}
    </button>

    {#if skin.notice}
      <p class="notice" data-testid="notice">{skin.notice}</p>
    {/if}

    {#if skin.action === 'stop'}
      <button class="go stop" data-testid="steam-stop" onclick={() => skin.stop()}>stop</button>
    {:else}
      <button class="go" data-testid="steam-start" disabled={skin.action !== 'start'} onclick={() => skin.startSteam()}>
        start steam
      </button>
    {/if}
  </aside>
</div>

<style>
  .steam {
    height: 100%;
    box-sizing: border-box;
    padding: 1rem 1.2rem;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 21rem;
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
  }

  header span {
    color: var(--dim);
    font-size: 1.1rem;
    white-space: nowrap;
  }

  header b {
    margin-left: 0.4rem;
    color: var(--fg);
    font-variant-numeric: tabular-nums;
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

  button {
    font: inherit;
    color: var(--fg);
    border: 1px solid var(--line);
    background: var(--panel);
    border-radius: 0.9rem;
    touch-action: manipulation;
    user-select: none;
  }

  .favourites {
    display: flex;
    gap: 0.6rem;
  }

  .chip {
    flex: 1;
    min-height: 4rem;
    font-size: 1.3rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .chip.on {
    border-color: var(--fg);
    background: var(--raised);
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

  .weight dd {
    color: var(--weight);
  }

  .size {
    text-transform: uppercase;
  }

  .of {
    margin-left: 0.5rem;
    font-size: 0.6em;
    font-weight: 400;
    color: var(--dim);
  }

  .set {
    min-height: 4.5rem;
    font-size: 1.4rem;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.6rem;
    background: var(--raised);
  }

  .set b {
    font-variant-numeric: tabular-nums;
  }

  .set:disabled,
  .go:disabled {
    background: var(--panel);
    border-color: var(--line);
    color: var(--dim);
  }

  .notice {
    margin: 0;
    color: var(--warn);
    font-size: 0.95rem;
  }

  .go {
    margin-top: auto;
    min-height: 6rem;
    font-size: 2rem;
    font-weight: 600;
    background: var(--fg);
    border-color: var(--fg);
    color: var(--bg);
  }

  .go.stop {
    background: var(--temperature);
    border-color: var(--temperature);
  }
</style>
