<script lang="ts">
  // A procedure's steps while it runs, the done ones ticked, and the line under them.
  import type { Tone } from './maintenance';

  interface Props {
    /** the procedure's id, for the caption's test id */
    id: string;
    milestones: readonly string[];
    /** the step at hand; the number of steps when all are done */
    milestone: number;
    line: { text: string; tone: Tone };
  }

  let { id, milestones, milestone, line }: Props = $props();
</script>

<div class="progress" role="status" aria-live="polite">
  <ol class="steps" data-testid="maintenance-steps-{id}">
    {#each milestones as label, i (label)}
      <li class:done={i < milestone} class:now={i === milestone}>
        <span class="dot" data-testid="maintenance-dot-{id}">{i < milestone ? '✓' : i + 1}</span>
        <small>{label}</small>
      </li>
    {/each}
  </ol>
  <p class="caption {line.tone}" data-testid="maintenance-caption-{id}">{line.text}</p>
</div>

<style>
  small {
    color: var(--dim);
    font-size: var(--text-label);
  }

  .progress {
    padding: var(--space-1) 0 var(--space-2);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-1);
  }

  .steps {
    margin: 0;
    padding: 0;
    list-style: none;
    /* equal columns as wide as the longest label: the circles are evenly spaced whatever the labels */
    display: inline-grid;
    grid-auto-flow: column;
    grid-auto-columns: 1fr;
  }

  li {
    position: relative;
    padding: 0 var(--space-2);
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-1);
  }

  /* the line from the previous circle's edge to this one's */
  li + li::before {
    content: '';
    position: absolute;
    top: 1.2rem;
    right: calc(50% + 1.2rem);
    width: calc(100% - 2.4rem);
    border-top: 1px solid var(--edge);
  }

  .dot {
    box-sizing: border-box;
    width: 2.4rem;
    height: 2.4rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-round);
    border: 1px solid var(--edge);
    color: var(--dim);
    font-weight: 600;
  }

  .done .dot,
  .now .dot {
    background: var(--fg);
    border-color: var(--fg);
    color: var(--bg);
  }

  .now small {
    color: var(--fg);
  }

  .caption {
    margin: 0;
    font-size: var(--text-body);
    color: var(--dim);
  }

  .caption.success {
    color: var(--fg);
    font-weight: 600;
  }

  .caption.error {
    color: var(--temperature);
  }
</style>
