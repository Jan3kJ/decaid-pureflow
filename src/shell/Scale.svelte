<script lang="ts">
  import { SCALE_LABEL } from './machine';
  import type { Skin } from './skin.svelte';

  interface Props {
    skin: Skin;
  }

  let { skin }: Props = $props();

  const HINT = {
    unknown: 'Decaid has not said whether a scale is connected.',
    connected: 'The weight comes from Decaid, as the scale sends it.',
    disconnected: 'Connect the scale in Decaid. A sleeping machine may switch it off.',
  };
</script>

<div class="scale">
  <section class="state {skin.scaleLink}" data-testid="scale-state" data-scale={skin.scaleLink}>
    <span class="dot"></span>
    <div>
      <h1>Scale</h1>
      <p><strong data-testid="scale-link">{SCALE_LABEL[skin.scaleLink]}</strong> {HINT[skin.scaleLink]}</p>
    </div>
  </section>

  <div class="weight" data-testid="scale-page-weight">
    {#if skin.weight === null}
      –
    {:else}
      {skin.weight.toFixed(1)}<i>g</i>
    {/if}
  </div>

  <div class="actions">
    <button class="tare" data-testid="tare" disabled={skin.scaleLink !== 'connected'} onclick={() => skin.tare()}>
      tare
    </button>
    {#if skin.info}
      <p class="info" data-testid="tare-notice">{skin.info}</p>
    {/if}
    {#if skin.notice}
      <p class="notice" data-testid="notice">{skin.notice}</p>
    {/if}
  </div>
</div>

<style>
  .scale {
    height: 100%;
    box-sizing: border-box;
    padding: 1rem 1.2rem;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) minmax(0, 1fr);
    justify-items: center;
    gap: 1rem;
  }

  .state {
    justify-self: stretch;
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .dot {
    flex: none;
    width: 1.1rem;
    height: 1.1rem;
    border-radius: 50%;
    background: var(--dim);
  }
  .connected .dot {
    background: var(--pressure);
  }
  .disconnected .dot {
    background: var(--warn);
  }

  h1 {
    margin: 0;
    font-size: 2.2rem;
    font-weight: 600;
    line-height: 1.15;
  }

  p {
    margin: 0.1rem 0 0;
    color: var(--dim);
    font-size: 1rem;
  }

  p strong {
    margin-right: 0.4rem;
    color: var(--fg);
    font-weight: 600;
  }

  .weight {
    align-self: end;
    color: var(--weight);
    font-size: 8rem;
    font-weight: 600;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }

  i {
    margin-left: 0.2em;
    font-style: normal;
    font-size: 0.35em;
    font-weight: 400;
    color: var(--dim);
  }

  .actions {
    width: 26rem;
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
    text-align: center;
  }

  .tare {
    min-height: 6rem;
    font: inherit;
    font-size: 2rem;
    font-weight: 600;
    color: var(--bg);
    background: var(--fg);
    border: 1px solid var(--fg);
    border-radius: 0.9rem;
    touch-action: manipulation;
    user-select: none;
  }

  .tare:disabled {
    background: var(--panel);
    border-color: var(--line);
    color: var(--dim);
  }

  .info {
    padding: 0.7rem 0.9rem;
    color: var(--fg);
    background: var(--raised);
    border: 1px solid var(--line);
    border-radius: 0.9rem;
  }

  .notice {
    color: var(--warn);
  }
</style>
