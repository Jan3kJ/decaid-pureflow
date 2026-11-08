<svelte:options namespace="svg" />

<script lang="ts">
  // The gradients a measured curve and its glow are stroked with: full colour, fading toward the
  // start over the first fifth of the time axis. One per quantity, in the plot's own pixels.
  interface Props {
    /** the ids of the four gradients are `<id>-flow` and so on */
    id: string;
    /** px, where the time axis starts and ends */
    left: number;
    right: number;
  }

  let { id, left, right }: Props = $props();

  const fadeEnd = $derived(left + (right - left) / 5);
</script>

<defs>
  {#each ['flow', 'pressure', 'temperature', 'weight'] as quantity (quantity)}
    <linearGradient id="{id}-{quantity}" gradientUnits="userSpaceOnUse" x1={left} x2={fadeEnd} y1="0" y2="0">
      <stop offset="0" class={quantity} stop-opacity="0.12" />
      <stop offset="1" class={quantity} />
    </linearGradient>
  {/each}
</defs>

<style>
  stop.flow {
    stop-color: var(--flow);
  }
  stop.pressure {
    stop-color: var(--pressure);
  }
  stop.temperature {
    stop-color: var(--temperature);
  }
  stop.weight {
    stop-color: var(--weight);
  }
</style>
