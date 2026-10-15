<script lang="ts">
  import { onMount } from 'svelte';
  import Editor from './editor/Editor.svelte';
  import History from './history/History.svelte';
  import { isOpeningSwipe, startsAtEdge, type Point } from './history/swipe';
  import Espresso from './shell/Espresso.svelte';
  import Home from './shell/Home.svelte';
  import Profiles from './shell/Profiles.svelte';
  import Scale from './shell/Scale.svelte';
  import Settings from './shell/Settings.svelte';
  import { Skin } from './shell/skin.svelte';
  import Steam from './steam/Steam.svelte';
  import UnsavedDialog from './shell/UnsavedDialog.svelte';

  const skin = new Skin();
  onMount(() => skin.connect());

  // The shot history opens by its tab or by a swipe from the left edge, on home only: the
  // editor's drags and every other screen never see the gesture (spec 3.1).
  const home = $derived(skin.screen === 'home');
  let swipe: (Point & { id: number }) | null = null;

  function onpointerdown(event: PointerEvent) {
    const start = { x: event.clientX, y: event.clientY };
    swipe = home && !skin.historyOpen && startsAtEdge(start, innerWidth) ? { ...start, id: event.pointerId } : null;
  }

  function onpointermove(event: PointerEvent) {
    if (!swipe || event.pointerId !== swipe.id) return;
    if (isOpeningSwipe(swipe, { x: event.clientX, y: event.clientY }, innerWidth)) {
      swipe = null;
      skin.historyOpen = true;
    }
  }

  const endSwipe = () => (swipe = null);
</script>

<main class:home {onpointerdown} {onpointermove} onpointerup={endSwipe} onpointercancel={endSwipe}>
  <!-- The left edge: the way back to home, and on home the tab of the shot history (spec 3.1). -->
  <nav>
    {#if home}
      <button class="tab" data-testid="nav-history" onclick={() => (skin.historyOpen = true)}>
        <span>history</span>
      </button>
    {:else}
      <button class="back" data-testid="nav-home" aria-label="back to home" onclick={() => skin.leave('home')}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 4l-8 8 8 8" /></svg>
      </button>
      <span class="dot {skin.status.tone}" title={skin.status.title} data-testid="nav-status"></span>
    {/if}
  </nav>

  <div class="screen" data-testid="screen-{skin.screen}">
    {#if skin.screen === 'home'}
      <Home {skin} />
    {:else if skin.screen === 'espresso'}
      <Espresso {skin} />
    {:else if skin.screen === 'profiles'}
      <Profiles {skin} />
    {:else if skin.screen === 'editor'}
      <Editor {skin} />
    {:else if skin.screen === 'steam'}
      <Steam {skin} />
    {:else if skin.screen === 'scale'}
      <Scale {skin} />
    {:else if skin.screen === 'settings'}
      <Settings {skin} />
    {/if}
  </div>

  <!-- The right edge of home: the tab of the steam page, the mirror of the history's (founder, 2026-10-13). -->
  {#if home}
    <nav class="right">
      <button class="tab" data-testid="open-steam" onclick={() => skin.go('steam')}>
        <span>steam</span>
      </button>
    </nav>
  {/if}

  {#if home && skin.historyOpen}
    <History {skin} />
  {/if}
</main>

<!-- Unsaved edits on the machine: asked before any load of the skin (founder, 2026-10-14). -->
{#if skin.unsaved}
  <UnsavedDialog unsaved={skin.unsaved} onanswer={(answer) => skin.answerLoad(answer)} />
{/if}

<!-- A stream the gateway closed with an error does not open again by itself (research.md 9.4). -->
{#if skin.refused}
  <div class="refused" role="alert" data-testid="stream-failed">
    <span>
      Decaid closed the connection{skin.streamError ? `: ${skin.streamError}` : ' with an error'}
    </span>
    <button data-testid="reconnect" onclick={() => skin.reconnect()}>reconnect</button>
  </div>
{/if}

<!-- The machine sleeps: the skin is dark, and a touch anywhere wakes the machine (spec 3.1). -->
{#if skin.asleep}
  <button class="asleep" data-testid="asleep" onpointerdown={() => skin.wake()}>
    <strong>Asleep</strong>
    <span>touch to wake</span>
    {#if skin.notice}
      <span class="warn" data-testid="notice">{skin.notice}</span>
    {/if}
  </button>
{/if}

<style>
  main {
    position: relative;
    height: 100%;
    display: grid;
    grid-template-columns: 4rem minmax(0, 1fr);
  }

  main.home {
    grid-template-columns: 4rem minmax(0, 1fr) 4rem;
  }

  /* A finger that moves sideways on home is the history's swipe, not the browser's pan. */
  main.home {
    touch-action: pan-y;
  }

  nav {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;
    padding: 0.7rem 0 1rem;
    border-right: 1px solid var(--line);
    background: var(--panel);
  }

  nav.right {
    border-right: 0;
    border-left: 1px solid var(--line);
  }

  nav button {
    width: 100%;
    min-height: 3.5rem;
    font: inherit;
    font-size: 2rem;
    line-height: 1;
    color: var(--fg);
    background: none;
    border: none;
    touch-action: manipulation;
  }

  /* The way back: a finger's target of at least 56 CSS pixels, in the accent colour. */
  nav .back {
    height: 4rem;
    display: grid;
    place-items: center;
    color: var(--accent);
  }

  nav .back svg {
    width: 2.6rem;
    height: 2.6rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 3;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  /* The tabs of the history and of steam run down the edges. */
  nav .tab {
    flex: 1;
    font-size: 0.9rem;
    color: var(--dim);
    letter-spacing: 0.08em;
  }

  nav .tab span {
    writing-mode: vertical-rl;
    transform: rotate(180deg);
  }

  nav.right .tab span {
    transform: none;
  }

  .dot {
    width: 0.8rem;
    height: 0.8rem;
    border-radius: 50%;
    background: var(--dim);
  }
  .dot.ok {
    background: var(--pressure);
  }
  .dot.busy {
    background: var(--flow);
  }
  .dot.warn {
    background: var(--warn);
  }

  .screen {
    min-width: 0;
    min-height: 0;
    height: 100%;
  }

  .refused {
    position: fixed;
    left: 50%;
    bottom: 1rem;
    transform: translateX(-50%);
    z-index: 20;
    max-width: 90%;
    box-sizing: border-box;
    padding: 0.6rem 0.6rem 0.6rem 1.2rem;
    display: flex;
    align-items: center;
    gap: 1.2rem;
    color: var(--warn);
    background: var(--raised);
    border: 1px solid var(--warn);
    border-radius: 0.9rem;
    box-shadow: 0 0.6rem 2.4rem rgb(0 0 0 / 70%);
  }

  .refused span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .refused button {
    flex: none;
    min-height: 3.4rem;
    padding: 0 1.6rem;
    font: inherit;
    font-size: 1.2rem;
    font-weight: 600;
    color: var(--bg);
    background: var(--fg);
    border: 0;
    border-radius: 0.7rem;
    touch-action: manipulation;
  }

  .asleep {
    position: fixed;
    inset: 0;
    z-index: 30;
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.6rem;
    font: inherit;
    color: var(--dim);
    background: #000;
    border: 0;
    touch-action: manipulation;
    user-select: none;
  }

  .asleep strong {
    font-size: 2.2rem;
    font-weight: 600;
  }

  .asleep .warn {
    color: var(--warn);
  }

  /* v1 is landscape only: a tablet held upright still gets the landscape layout. */
  @media (orientation: portrait) {
    main {
      width: 100vh;
      height: 100vw;
      transform: rotate(90deg) translateY(-100%);
      transform-origin: top left;
    }
  }
</style>
