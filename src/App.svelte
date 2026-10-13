<script lang="ts">
  import { onMount } from 'svelte';
  import Editor from './editor/Editor.svelte';
  import Espresso from './shell/Espresso.svelte';
  import Home from './shell/Home.svelte';
  import Placeholder from './shell/Placeholder.svelte';
  import Profiles from './shell/Profiles.svelte';
  import Scale from './shell/Scale.svelte';
  import Settings from './shell/Settings.svelte';
  import { PLACEHOLDERS } from './shell/nav';
  import { Skin } from './shell/skin.svelte';
  import Steam from './steam/Steam.svelte';

  const skin = new Skin();
  onMount(() => skin.connect());

  const placeholder = $derived(PLACEHOLDERS[skin.screen]);
</script>

<main>
  <!-- The left edge: the way back to home, and on home the tab of the shot history (spec 3.1). -->
  <nav>
    {#if skin.screen === 'home'}
      <button class="tab" data-testid="nav-history" onclick={() => skin.go('history')}>
        <span>history</span>
      </button>
    {:else}
      <button data-testid="nav-home" aria-label="back to home" onclick={() => skin.go('home')}>‹</button>
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
    {:else if placeholder}
      <Placeholder title={placeholder.title} text={placeholder.text} />
    {/if}
  </div>
</main>

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
    height: 100%;
    display: grid;
    grid-template-columns: 3.4rem minmax(0, 1fr);
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
    min-height: 3.4rem;
    font: inherit;
    font-size: 2rem;
    line-height: 1;
    color: var(--fg);
    background: none;
    border: none;
    touch-action: manipulation;
  }

  /* The history's tab runs down the edge. */
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
