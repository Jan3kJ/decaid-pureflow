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
  import SmallRing from './shell/SmallRing.svelte';
  import { backupTime } from './settings-backup';
  import { applyDisplay } from './display';
  import Steam from './steam/Steam.svelte';
  import StepEditor from './steps/StepEditor.svelte';
  import {
    PAGES,
    commits,
    decide,
    destination,
    isPage,
    neighbour,
    offset,
    onControl,
    swipes,
    type Page,
    type Point,
  } from './shell/swipe';
  import UnsavedDialog from './shell/UnsavedDialog.svelte';
  import { smallRingRun } from './shell/water';

  const skin = new Skin();
  onMount(() => skin.connect());
  $effect(() => applyDisplay(skin.settings));

  // One horizontal gesture for the pages and the shot history (src/shell/swipe.ts, spec 3.8):
  // hot water, home and steam are one row, and a swipe slides to the neighbour, which is drawn
  // beside the page only while it comes in; on home a swipe to the right from the left fifth
  // opens the history instead. In the editor a swipe to the right leaves for home as its back
  // arrow does, with home not drawn beside it. Not while a shot runs on home. A drag that starts on
  // a control is the control's.
  const home = $derived(skin.screen === 'home');
  // Hot water or flush on a screen without its large ring: one small ring in the left column (spec 3.10).
  const smallRing = $derived(smallRingRun(skin.waterRun, skin.canStop, skin.screen, skin.historyOpen));
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
  // A dot's slide may cross home: the strip holds every page from here to the one coming in.
  const strip = $derived.by((): Screen[] => {
    const screen = skin.screen;
    if (!incoming || !isPage(screen)) return [screen];
    const [from, to] = [PAGES.indexOf(screen), PAGES.indexOf(incoming)];
    return PAGES.slice(Math.min(from, to), Math.max(from, to) + 1);
  });
  /** The pages' names, for the dots. */
  const PAGE_NAMES: Record<Page, string> = { 'hot-water': 'hot water', home: 'home', steam: 'steam' };
  /** Neither the dots nor the history's handle while a shot runs on home: the pages do not swipe then either. */
  const held = $derived(home && skin.shotRunning);
  const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** Where a screen of the strip lies, as a CSS transform; none for the page at rest. */
  function placed(screen: Screen): string {
    const index = isPage(screen) && isPage(skin.screen) ? PAGES.indexOf(screen) - PAGES.indexOf(skin.screen) : 0;
    return index === 0 && dx === 0 ? '' : `translateX(calc(${index * 100}% + ${dx}px))`;
  }

  /** Rests the strip, in the same task as the move, so no frame draws the new page displaced. */
  function settle(to: Page | null) {
    if (to) skin.go(to);
    settling = false;
    incoming = null;
    dx = 0;
  }

  /** A page's dot: the page slides in as at the end of a swipe, across home if it lies beyond. */
  function slideTo(to: Page) {
    const from = skin.screen;
    if (settling || swipe?.page || !isPage(from) || to === from) return;
    if (still()) return skin.go(to);
    settling = true;
    incoming = to;
    // The pages coming in are drawn in place first, then the strip moves.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        dx = (PAGES.indexOf(from) - PAGES.indexOf(to)) * main.clientWidth;
        setTimeout(() => settle(to), SLIDE_MS);
      }),
    );
  }

  function onpointerdown(event: PointerEvent) {
    skin.touched();
    swipe = null;
    if (settling || !swipes(skin.screen) || skin.historyOpen || held) return;
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
    if (!swipe || event.pointerId !== swipe.id || !swipes(skin.screen)) return;
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
    incoming = isPage(skin.screen) ? neighbour(skin.screen, swipe.dx) : null;
    dx = still() ? 0 : offset(skin.screen, swipe.dx);
  }

  function endSwipe(event: PointerEvent) {
    if (!swipe || event.pointerId !== swipe.id) return;
    const { page, dx: moved, velocity } = swipe;
    swipe = null;
    const screen = skin.screen;
    if (!page || !swipes(screen)) return;
    const target = event.type === 'pointerup' && commits(moved, velocity, innerWidth) ? destination(screen, moved) : null;
    if (still()) {
      incoming = null;
      if (target && screen === 'editor') void skin.leave(target);
      else if (target) skin.go(target);
      return;
    }
    // The editor is left as by its back arrow: its changed values are loaded first; if that
    // fails it stays, saying so, and springs back.
    const leave = async (to: Page) => {
      if (await skin.mayLeave()) return settle(to);
      dx = 0;
      setTimeout(() => settle(null), SLIDE_MS);
    };
    settling = true;
    dx = target ? Math.sign(moved) * main.clientWidth : 0;
    setTimeout(() => (target && screen === 'editor' ? void leave(target) : settle(target)), SLIDE_MS);
  }
</script>

{#snippet frame(screen: Screen)}
  {#if screen === 'home'}
    <!-- Home has no edge tabs (spec 3.11): the history's handle at the left edge shows the swipe from there. -->
    <button
      class="handle"
      data-testid="history-handle"
      aria-label="shot history"
      disabled={held}
      onclick={() => (skin.historyOpen = true)}
    >
      <span></span>
    </button>
  {:else}
    <!-- The left edge: only the way back; the page's state line says the machine's state (spec 3.9). -->
    <nav>
      <button class="back" data-testid="nav-home" aria-label="back to home" onclick={() => skin.leave('home')}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 4l-8 8 8 8" /></svg>
      </button>
    </nav>
  {/if}

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

  <!-- The row of pages, the current one bright; a tap on a dot slides to its page (spec 3.11). -->
  {#if isPage(screen)}
    <div class="dots" role="group" aria-label="pages">
      {#each PAGES as page (page)}
        <button
          data-testid="page-dot-{page}"
          aria-label={PAGE_NAMES[page]}
          aria-current={page === screen ? 'page' : undefined}
          disabled={held}
          onclick={() => slideTo(page)}><span></span></button
        >
      {/each}
    </div>
  {/if}
{/snippet}

<main
  bind:this={main}
  class:pages={swipes(skin.screen)}
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
      class:paged={isPage(screen)}
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

  <!-- Over the pages, the history and the dialogs, under the stream's banner and the sleep screen. -->
  {#if smallRing}
    <SmallRing {skin} run={smallRing} />
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

<!-- The machine sleeps, and not by the menu's 'Machine sleep': the skin is dark, and a touch anywhere wakes the machine (spec 3.1, 3.10). -->
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

  /* A finger that moves sideways on the pages or the editor is the strip's swipe, not the browser's pan. */
  main.pages {
    touch-action: pan-y;
  }

  /* A page of the strip fills the screen; the neighbour coming in lies beside it. */
  .page {
    position: absolute;
    inset: 0;
    /* the way back's column; home's header starts this far in, so the state line does not move between pages */
    --back: 4rem;
    display: grid;
    grid-template-columns: var(--back) minmax(0, 1fr);
    background: var(--bg);
  }

  .page.settling {
    transition: transform 220ms ease-out;
  }

  /* Home has no edge: it uses the full width. */
  .page.home {
    grid-template-columns: minmax(0, 1fr);
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

  .screen {
    min-width: 0;
    min-height: 0;
    height: 100%;
  }

  /* The pages leave room at the bottom for the dots, under their own padding. */
  .paged .screen {
    box-sizing: border-box;
    padding-bottom: 1.6rem;
  }

  .handle,
  .dots button {
    padding: 0;
    font: inherit;
    background: none;
    border: 0;
    touch-action: manipulation;
  }

  /* A thin bar at home's left edge, vertically centred, in a finger's target over home's padding. */
  .handle {
    position: absolute;
    left: 0;
    top: 50%;
    z-index: 1;
    width: 2.6rem;
    height: 8rem;
    transform: translateY(-50%);
  }

  .handle span {
    position: absolute;
    left: 0.35rem;
    top: 1.5rem;
    bottom: 1.5rem;
    width: 0.35rem;
    border-radius: 0.2rem;
    background: var(--dim);
  }

  .handle:disabled span {
    opacity: 0.35;
  }

  /* In the bottom padding, centred: each dot a target of 56 by 42 CSS pixels. */
  .dots {
    position: absolute;
    left: 50%;
    bottom: 0;
    z-index: 1;
    display: flex;
    transform: translateX(-50%);
  }

  .dots button {
    width: 3.5rem;
    height: 2.6rem;
    display: grid;
    place-items: center;
  }

  .dots span {
    width: 0.6rem;
    height: 0.6rem;
    border-radius: 50%;
    background: var(--line);
  }

  .dots button[aria-current='page'] span {
    background: var(--fg);
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
