<script lang="ts">
  import type { Snippet } from 'svelte';
  import Dialog from '../ui/Dialog.svelte';
  import { cornerOf, lightOf } from './corner';
  import type { HeatTarget } from './machine';
  import Menu from './Menu.svelte';
  import type { Skin } from './skin.svelte';
  import StateLine from './StateLine.svelte';

  interface Props {
    skin: Skin;
    /** passed on to the state line */
    heat?: HeatTarget;
    /** the page's title beside the menu */
    title?: string;
    titleTestid?: string;
    /** what the page adds left of the title */
    beside?: Snippet;
  }

  let { skin, heat, title, titleTestid = 'page-title', beside }: Props = $props();

  const status = $derived(skin.statusFor(heat ?? null));
  const corner = $derived(cornerOf(skin.link, status));
  const light = $derived(lightOf(skin.link, status, skin.link === 'machine' ? (skin.snapshot?.state.state ?? null) : null));

  let details = $state(false);
  // A fault that is gone takes its popup with it.
  $effect(() => {
    if (corner.kind !== 'fault') details = false;
  });
</script>

<!-- One header for home, steam and hot water, laid on the page's two columns: the readings centred over the
     main frame, the page's title and the menu over the column. The machine's state is a light behind the row;
     the top left corner holds only a dim word or a fault. -->
<header class="page-header light-{light}" data-light={light}>
  <div class="light" aria-hidden="true"></div>
  <div class="start">
    {#if corner.kind === 'word'}
      <span class="word" data-testid="status-word">{corner.word}</span>
    {:else if corner.kind === 'fault'}
      <button class="fault" data-testid="status-fault" onclick={() => (details = true)}>{corner.title}</button>
    {/if}
  </div>
  <StateLine {skin} {heat} />
  <div class="end">
    {@render beside?.()}
    {#if title}
      <h1 class="title" data-testid={titleTestid}>{title}</h1>
    {/if}
    <Menu {skin} />
  </div>
</header>

{#if details && corner.kind === 'fault'}
  <Dialog labelledby="status-fault-title" width="min(36rem, 90vw)" testid="status-dialog" oncancel={() => (details = false)}>
    <div class="content">
      <h2 id="status-fault-title" data-testid="status-dialog-title">{corner.title}</h2>
      <p data-testid="status-dialog-detail">{corner.detail}</p>
      <div class="actions">
        <button class="action" data-testid="status-dialog-close" onclick={() => (details = false)}>close</button>
        {#if corner.reconnect}
          <button
            class="action primary"
            data-testid="status-reconnect"
            onclick={() => {
              skin.reconnect();
              details = false;
            }}>reconnect</button
          >
        {/if}
      </div>
    </div>
  </Dialog>
{/if}

<style>
  .page-header {
    position: relative;
    display: grid;
    /* the page's columns: the main frame's and the column's width, which the page sets */
    grid-template-columns: minmax(0, 1fr) var(--side-width, 21rem);
    align-items: center;
    column-gap: var(--space-3);
    /* as tall as the menu's touch target, so the readings sit at the same height on every page */
    min-height: var(--control-big);
  }

  /* the machine's state as a faint light behind the row */
  .light {
    position: absolute;
    inset: -0.8rem calc(-1 * var(--space-3)) -0.4rem;
    background: radial-gradient(60% 140% at 38% 0%, color-mix(in srgb, var(--light, transparent) 37.5%, transparent), transparent 80%);
    opacity: 0;
    transition: opacity 0.8s;
    pointer-events: none;
  }

  .light-heating .light,
  .light-flow .light,
  .light-steam .light,
  .light-fault .light {
    opacity: 1;
  }

  .light-heating,
  .light-steam {
    --light: var(--temperature);
  }

  .light-flow {
    --light: var(--flow);
  }

  .light-fault {
    --light: var(--warn);
  }

  .light-heating .light {
    animation: breathe 3s ease-in-out infinite;
  }

  @keyframes breathe {
    50% {
      opacity: 0.55;
    }
  }

  /* the readings, centred over the main frame, and the corner's word at the frame's left end */
  .start,
  :global(.page-header > .state) {
    grid-row: 1;
    grid-column: 1;
  }

  /* above the light, which comes first; positioned, but no stacking context, so the menu's backdrop covers the page */
  .start,
  .end,
  :global(.page-header > .state) {
    position: relative;
  }

  .start {
    justify-self: start;
    min-width: 0;
  }

  .word,
  .fault {
    font-size: var(--text-body);
    white-space: nowrap;
  }

  .word {
    color: var(--dim);
  }

  .fault {
    min-height: var(--control-big);
    padding: 0;
    color: var(--warn);
    font-weight: 600;
    background: none;
    border: 0;
  }

  .end {
    grid-row: 1;
    grid-column: 2;
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-3);
  }

  /* a name, quiet: small capitals of light */
  .title {
    flex: none;
    margin: 0;
    font-size: var(--text-value);
    font-weight: 300;
    letter-spacing: 0.3em;
    text-transform: uppercase;
    color: var(--dim);
    white-space: nowrap;
  }

  .content {
    padding: var(--space-1) var(--space-3) var(--space-3);
  }

  h2 {
    margin: var(--space-2) 0 var(--space-1);
    font-size: var(--text-title);
    font-weight: 600;
    color: var(--warn);
  }

  p {
    margin: 0;
    color: var(--dim);
  }

  .actions {
    margin-top: 1rem;
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
  }
</style>
