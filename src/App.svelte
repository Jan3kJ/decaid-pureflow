<script lang="ts">
  import { onMount } from 'svelte';
  import Editor from './editor/Editor.svelte';
  import { editorFor } from './editor/route';
  import History from './history/History.svelte';
  import HotWater from './hotwater/HotWater.svelte';
  import { isOpeningSwipe, startsAtEdge, type Edge, type Point } from './history/swipe';
  import Home from './shell/Home.svelte';
  import Profiles from './shell/Profiles.svelte';
  import SettingsPage from './settings-page/SettingsPage.svelte';
  import { Skin, type LoadAnswer } from './shell/skin.svelte';
  import { backupTime } from './settings-backup';
  import Steam from './steam/Steam.svelte';
  import StepEditor from './steps/StepEditor.svelte';
  import UnsavedDialog from './shell/UnsavedDialog.svelte';

  const skin = new Skin();
  onMount(() => skin.connect());

  // The shot history opens by its tab or by a swipe from the left edge, on home only: the
  // editor's drags and every other screen never see the gesture (spec 3.1). Its mirror from
  // the right edge opens the steam page, as the steam tab does (spec 3.7). Not over the shot's
  // overlay: after the shot a touch there closes it (spec 3.8).
  const home = $derived(skin.screen === 'home');
  // The steam page's dot says what its state line says: heating against the steam target (spec 3.8).
  const navStatus = $derived(skin.statusFor(skin.screen === 'steam' ? 'steam' : null));
  let swipe: (Point & { id: number; edge: Edge }) | null = null;

  function onpointerdown(event: PointerEvent) {
    const start = { x: event.clientX, y: event.clientY };
    const edge = (['left', 'right'] as const).find((side) => startsAtEdge(start, innerWidth, side));
    swipe = home && !skin.historyOpen && !skin.shotOpen && edge ? { ...start, id: event.pointerId, edge } : null;
  }

  function onpointermove(event: PointerEvent) {
    if (!swipe || event.pointerId !== swipe.id) return;
    if (isOpeningSwipe(swipe, { x: event.clientX, y: event.clientY }, innerWidth, swipe.edge)) {
      const edge = swipe.edge;
      swipe = null;
      if (edge === 'left') skin.historyOpen = true;
      else skin.go('steam');
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
      <span class="dot {navStatus.tone}" title={navStatus.title} data-testid="nav-status"></span>
    {/if}
  </nav>

  <div class="screen" data-testid="screen-{skin.screen}">
    {#if skin.screen === 'home'}
      <Home {skin} />
    {:else if skin.screen === 'profiles'}
      <Profiles {skin} />
    {:else if skin.screen === 'editor'}
      <!-- Every profile that is not A-Flow opens in the step editor (spec 3.6, research.md 17.5). -->
      {#if editorFor(skin.workflow?.profile) === 'steps'}
        <StepEditor {skin} />
      {:else}
        <Editor {skin} />
      {/if}
    {:else if skin.screen === 'steam'}
      <Steam {skin} />
    {:else if skin.screen === 'hot-water'}
      <HotWater {skin} />
    {:else if skin.screen === 'settings'}
      <SettingsPage {skin} />
    {/if}
  </div>

  <!-- The right edge of home: the tab of the steam page, the mirror of the history's (founder, 2026-10-13).
       It is split (spec 3.7): steam keeps most of it, hot water takes the rest at the bottom. -->
  {#if home}
    <nav class="right">
      <button class="tab" data-testid="open-steam" onclick={() => skin.go('steam')}>
        <span>steam</span>
      </button>
      <button class="tab water" data-testid="open-hot-water" onclick={() => skin.go('hot-water')}>
        <span>hot water</span>
      </button>
    </nav>
  {/if}

  {#if home && skin.historyOpen}
    <History {skin} />
  {/if}
</main>

<!-- Unsaved edits on the machine: asked before any load of the skin (founder, 2026-10-14). -->
{#if skin.unsaved}
  <UnsavedDialog unsaved={skin.unsaved} onanswer={(answer: LoadAnswer) => skin.answerLoad(answer)} />
{/if}

<!-- A stream the gateway closed with an error is tried again for 30 s by itself, then waits for this button. -->
{#if skin.refused}
  <div class="refused" role="alert" data-testid="stream-failed">
    <span>
      Decaid closed the connection{skin.streamError ? `: ${skin.streamError}` : ' with an error'}
    </span>
    <button data-testid="reconnect" onclick={() => skin.reconnect()}>reconnect</button>
  </div>
{/if}

<!-- A start without settings took them from the backup in Decaid, said once (founder, 2026-10-14). -->
{#if skin.restoredFrom !== null && !skin.refused}
  <div class="refused restored" role="status" data-testid="settings-restored">
    <span>
      Settings restored from the backup in Decaid{skin.restoredFrom ? ` of ${backupTime(skin.restoredFrom)}` : ''}.
    </span>
    <button data-testid="settings-restored-ok" onclick={() => (skin.restoredFrom = null)}>OK</button>
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

  /* Home's edge tabs are thinner than the way back, their labels larger (founder, 2026-10-17):
     56 CSS pixels, still a finger's target. */
  main.home {
    grid-template-columns: 3.5rem minmax(0, 1fr) 3.5rem;
  }

  /* A finger that moves sideways on home is a swipe of the history or the steam page, not the browser's pan. */
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
    font-size: var(--text-value);
    color: var(--dim);
    letter-spacing: 0.06em;
  }

  nav .tab span {
    writing-mode: vertical-rl;
    transform: rotate(180deg);
  }

  nav.right .tab span {
    transform: none;
  }

  /* A quarter of the edge, under a line: steam's tab above it stays the larger target. */
  nav.right {
    padding-bottom: 0;
  }

  nav.right .tab {
    flex: 3;
  }

  nav.right .tab.water {
    flex: 1;
    border-top: 1px solid var(--line);
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

  .restored {
    color: var(--fg);
    border-color: var(--line);
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
  /* Portrait by the size src/viewport.ts stores, so the keyboard does not turn the app. */
  :global(:root[data-portrait]) main {
    width: var(--app-h);
    height: var(--app-w);
    transform: rotate(90deg) translateY(-100%);
    transform-origin: top left;
  }
</style>
