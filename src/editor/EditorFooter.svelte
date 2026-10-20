<script lang="ts">
  // The A-Flow editor's footer: the 2nd fill and the flow direction, the legend, and the
  // profile steps' toggle where the setting shows it.
  interface Props {
    secondFill: boolean;
    flowUp: boolean;
    /** the setting 'profile steps': without it the toggle is hidden */
    showSteps: boolean;
    stepsOpen: boolean;
    onsecondfill: () => void;
    onflow: () => void;
    onsteps: () => void;
  }

  let { secondFill, flowUp, showSteps, stepsOpen, onsecondfill, onflow, onsteps }: Props = $props();
</script>

<footer>
  <button class="toggle" aria-pressed={secondFill} data-testid="toggle-second-fill" onclick={onsecondfill}>
    <span class="lamp"></span>2nd fill
  </button>
  <button class="toggle" data-testid="toggle-flow" aria-label="flow direction" onclick={onflow}>
    <span class="arrow" class:down={!flowUp}>↗</span>{flowUp ? 'flow up' : 'flow down'}
  </button>
  <div class="legend">
    <span class="flow">flow ml/s</span>
    <span class="pressure">pressure bar</span>
    <span class="temperature">temperature °C</span>
  </div>
  {#if showSteps}
    <button class="toggle setting" aria-pressed={stepsOpen} data-testid="toggle-steps" onclick={onsteps}>
      <span class="lamp"></span>profile steps
    </button>
  {/if}
</footer>

<style>
  footer {
    grid-area: footer;
    display: flex;
    align-items: center;
    gap: 0.8rem;
  }

  button {
    font: inherit;
    color: var(--fg);
    border: 1px solid var(--line);
    background: var(--panel);
    touch-action: manipulation;
    user-select: none;
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
</style>
