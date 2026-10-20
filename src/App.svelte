<script lang="ts">
  import { onMount } from 'svelte';
  import Beans from './beans/Beans.svelte';
  import Editor from './editor/Editor.svelte';
  import { editorFor } from './editor/route';
  import History from './history/History.svelte';
  import HotWater from './hotwater/HotWater.svelte';
  import Home from './shell/Home.svelte';
  import type { Screen } from './shell/nav';
  import Profiles from './shell/Profiles.svelte';
  import SettingsPage from './settings-page/SettingsPage.svelte';
  import type { LoadAnswer } from './shell/load-warning.svelte';
  import { Skin } from './shell/skin.svelte';
  import { backupTime } from './settings-backup';
  import Steam from './steam/Steam.svelte';
  import StepEditor from './steps/StepEditor.svelte';
  import { PAGES, commits, decide, isPage, neighbour, offset, onControl, type Page, type Point } from './shell/swipe';
  import UnsavedDialog from './shell/UnsavedDialog.svelte';

  const skin = new Skin();
  onMount(() => skin.connect());

  // One horizontal gesture for the pages and the shot history (src/shell/swipe.ts, spec 3.8):
  // hot water, home and steam are one row, and a swipe slides to the neighbour, which is drawn
  // beside the page only while it comes in; on home a swipe to the right from the left fifth
  // opens the history instead. Not over the shot's overlay: after the shot a touch there closes
  // it. A drag that starts on a control is the control's.
  const home = $derived(skin.screen === 'home');
  /** The slide's length, in milliseconds; with reduced motion there is no slide. */
  const SLIDE_MS = 220;
  let main: HTMLElement;
  let swipe: (Point & { id: number; page: boolean; dx: number; last: number; time: number; velocity: number }) | null = null;
  /** The drawn offset of the pages, in CSS pixels. */
  let dx = $state(0);
  /** The neighbour coming in, drawn beside the page. */
  let incoming: Page | null = $state(null);
  /** The slide finishing or springing back after the finger let go. */
  let settling = $state(false);
  const strip = $derived(incoming ? [skin.screen, incoming] : [skin.screen]);
  const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** Where a screen of the strip lies, as a CSS transform; none for the page at rest. */
  function placed(screen: Screen): string {
    const index = isPage(screen) && isPage(skin.screen) ? PAGES.indexOf(screen) - PAGES.indexOf(skin.screen) : 0;
    return index === 0 && dx === 0 ? '' : `translateX(calc(${index * 100}% + ${dx}px))`;
  }

  function onpointerdown(event: PointerEvent) {
    swipe = null;
    if (settling || !isPage(skin.screen) || skin.historyOpen || (home && skin.shotOpen)) return;
    if (onControl(event.target as Element, main)) return;
    swipe = {
      x: event.clientX,
      y: event.clientY,
      id: event.pointerId,
      page: false,
      dx: 0,
      last: event.clientX,
      time: event.timeStamp,
      velocity: 0,
    };
  }

  function onpointermove(event: PointerEvent) {
    if (!swipe || event.pointerId !== swipe.id || !isPage(skin.screen)) return;
    const now = { x: event.clientX, y: event.clientY };
    if (!swipe.page) {
      const gesture = decide(swipe, now, innerWidth, skin.screen);
      if (gesture === null) return;
      if (gesture !== 'page') {
        swipe = null;
        if (gesture === 'history') skin.historyOpen = true;
        return;
      }
      // Held by the strip from here: the button the finger went down on gets no click.
      swipe.page = true;
      main.setPointerCapture(event.pointerId);
    }
    const elapsed = event.timeStamp - swipe.time;
    if (elapsed > 0) swipe.velocity = (now.x - swipe.last) / elapsed;
    swipe.last = now.x;
    swipe.time = event.timeStamp;
    swipe.dx = now.x - swipe.x;
    incoming = neighbour(skin.screen, swipe.dx);
    dx = still() ? 0 : offset(skin.screen, swipe.dx);
  }

  function endSwipe(event: PointerEvent) {
    if (!swipe || event.pointerId !== swipe.id) return;
    const { page, dx: moved, velocity } = swipe;
    swipe = null;
    if (!page || !isPage(skin.screen)) return;
    const target = event.type === 'pointerup' && commits(moved, velocity, innerWidth) ? neighbour(skin.screen, moved) : null;
    if (still()) {
      incoming = null;
      if (target) skin.go(target);
      return;
    }
    settling = true;
    dx = target ? Math.sign(moved) * main.clientWidth : 0;
    setTimeout(() => {
      if (target) skin.go(target);
      settling = false;
      incoming = null;
      dx = 0;
    }, SLIDE_MS);
  }
</script>

{#snippet frame(screen: Screen)}
  {@const atHome = screen === 'home'}
  <!-- The left edge: the way back to home, and on home the tab of the shot history (spec 3.1). -->
  <nav>
    {#if atHome}
      <button class="tab" data-testid="nav-history" onclick={() => (skin.historyOpen = true)}>
        <span>history</span>
      </button>
    {:else}
      <!-- Only the way back: the page's state line says the machine's state (spec 3.9). -->
      <button class="back" data-testid="nav-home" aria-label="back to home" onclick={() => skin.leave('home')}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 4l-8 8 8 8" /></svg>
      </button>
    {/if}
  </nav>

  <div class="screen" data-testid="screen-{screen}">
    {#if screen === 'home'}
      <Home {skin} />
    {:else if screen === 'profiles'}
      <Profiles {skin} />
    {:else if screen === 'editor'}
      <!-- Every profile that is not A-Flow opens in the step editor (spec 3.6, research.md 17.5). -->
      {#if editorFor(skin.workflow?.profile) === 'steps'}
        <StepEditor {skin} />
      {:else}
        <Editor {skin} />
      {/if}
    {:else if screen === 'steam'}
      <Steam {skin} />
    {:else if screen === 'hot-water'}
      <HotWater {skin} />
    {:else if screen === 'settings'}
      <SettingsPage {skin} />
    {:else if screen === 'beans'}
      <Beans {skin} />
    {/if}
  </div>

  <!-- The right edge of home: the tab of the steam page, the mirror of the history's (founder, 2026-10-13).
       It is split (spec 3.7): steam keeps most of it, hot water takes the rest at the bottom. -->
  {#if atHome}
    <nav class="right">
      <button class="tab" data-testid="open-steam" onclick={() => skin.go('steam')}>
        <span>steam</span>
      </button>
      <button class="tab water" data-testid="open-hot-water" onclick={() => skin.go('hot-water')}>
        <span>hot water</span>
      </button>
    </nav>
  {/if}
{/snippet}

<main
  bind:this={main}
  class:pages={isPage(skin.screen)}
  {onpointerdown}
  {onpointermove}
  onpointerup={endSwipe}
  onpointercancel={endSwipe}
>
  {#each strip as screen (screen)}
    <!-- The neighbour coming in is only a picture of its page until it is the page. -->
    <div
      class="page"
      class:home={screen === 'home'}
      class:settling
      style:transform={placed(screen)}
      inert={screen !== skin.screen}
      aria-hidden={screen !== skin.screen}
    >
      {@render frame(screen)}
    </div>
  {/each}

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
    overflow: hidden;
  }

  /* A finger that moves sideways on the pages is the strip's swipe, not the browser's pan. */
  main.pages {
    touch-action: pan-y;
  }

  /* A page of the strip fills the screen; the neighbour coming in lies beside it. */
  .page {
    position: absolute;
    inset: 0;
    display: grid;
    grid-template-columns: 4rem minmax(0, 1fr);
    background: var(--bg);
  }

  .page.settling {
    transition: transform 220ms ease-out;
  }

  /* Home's edge tabs are thinner than the way back, their labels larger (founder, 2026-10-17):
     56 CSS pixels, still a finger's target. */
  .page.home {
    grid-template-columns: 3.5rem minmax(0, 1fr) 3.5rem;
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
