<script lang="ts">
  interface Props {
    label: string;
    value: string;
    testid: string;
    /** flow, pressure, temperature, or none for times and weights */
    tone?: 'flow' | 'pressure' | 'temperature' | 'none';
    /** shows the value alone until it is tapped (the chips on the graph) */
    compact?: boolean;
    onstep: (direction: 1 | -1) => void;
  }

  let { label, value, testid, tone = 'none', compact = false, onstep }: Props = $props();

  let open = $state(false);
  let root: HTMLDivElement | undefined = $state();
  let delay: ReturnType<typeof setTimeout> | undefined;
  let repeat: ReturnType<typeof setInterval> | undefined;

  // One step on the press; holding the button keeps stepping.
  function press(event: PointerEvent, direction: 1 | -1) {
    event.preventDefault();
    release();
    onstep(direction);
    delay = setTimeout(() => {
      repeat = setInterval(() => onstep(direction), 70);
    }, 450);
  }

  function release() {
    clearTimeout(delay);
    clearInterval(repeat);
  }

  function key(event: KeyboardEvent, direction: 1 | -1) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onstep(direction);
    }
  }

  function outside(event: PointerEvent) {
    if (open && root && !root.contains(event.target as Node)) open = false;
  }

  $effect(() => release);
</script>

<svelte:window onpointerdown={outside} />

<div class="chip {tone}" class:compact class:open bind:this={root} data-testid="chip-{testid}">
  {#if !compact || open}
    <button
      class="step"
      data-step="minus"
      aria-label="less {label}"
      onpointerdown={(e) => press(e, -1)}
      onpointerup={release}
      onpointerleave={release}
      onpointercancel={release}
      onkeydown={(e) => key(e, -1)}>−</button
    >
  {/if}
  {#if compact}
    <button class="body" aria-expanded={open} onclick={() => (open = !open)}>
      <span class="label">{label}</span>
      <span class="value" data-testid="chip-value-{testid}">{value}</span>
    </button>
  {:else}
    <div class="body">
      <span class="label">{label}</span>
      <span class="value" data-testid="chip-value-{testid}">{value}</span>
    </div>
  {/if}
  {#if !compact || open}
    <button
      class="step"
      data-step="plus"
      aria-label="more {label}"
      onpointerdown={(e) => press(e, 1)}
      onpointerup={release}
      onpointerleave={release}
      onpointercancel={release}
      onkeydown={(e) => key(e, 1)}>+</button
    >
  {/if}
</div>

<style>
  .chip {
    --tone: var(--fg);
    display: flex;
    align-items: stretch;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 0.9rem;
    overflow: hidden;
    touch-action: none;
    user-select: none;
  }

  .chip.flow {
    --tone: var(--flow);
  }
  .chip.pressure {
    --tone: var(--pressure);
  }
  .chip.temperature {
    --tone: var(--temperature);
  }

  .body {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.1rem;
    padding: 0.4rem 0.6rem;
    background: none;
    border: 0;
    color: inherit;
    font: inherit;
    white-space: nowrap;
  }

  .label {
    font-size: 0.8rem;
    color: var(--dim);
  }

  .value {
    font-size: 1.35rem;
    font-weight: 600;
    color: var(--tone);
    font-variant-numeric: tabular-nums;
  }

  .step {
    width: 4rem;
    min-height: 4rem;
    background: var(--raised);
    border: 0;
    color: var(--fg);
    font: inherit;
    font-size: 1.8rem;
    line-height: 1;
  }

  .step:active {
    background: var(--line);
  }

  .compact {
    border-radius: 1.4rem;
    background: var(--raised);
  }

  .compact .body {
    flex-direction: row;
    gap: 0.4rem;
    min-height: 2.75rem;
    padding: 0 0.9rem;
  }

  .compact .value {
    font-size: 1.1rem;
  }

  .compact .step {
    width: 3.5rem;
    min-height: 3.5rem;
  }

  .compact.open {
    box-shadow: 0 0.3rem 1.2rem rgb(0 0 0 / 60%);
  }
</style>
