<script lang="ts">
  import { onMount } from 'svelte';
  import Editor from './editor/Editor.svelte';
  import Espresso from './shell/Espresso.svelte';
  import Home from './shell/Home.svelte';
  import Placeholder from './shell/Placeholder.svelte';
  import Profiles from './shell/Profiles.svelte';
  import { PLACEHOLDERS } from './shell/nav';
  import { Skin } from './shell/skin.svelte';

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
      <!-- The prototype on fixture data; D7 wires it to the machine. -->
      <Editor />
    {:else if placeholder}
      <Placeholder title={placeholder.title} text={placeholder.text} />
    {/if}
  </div>
</main>

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
