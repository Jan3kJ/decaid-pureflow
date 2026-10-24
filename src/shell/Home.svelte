<script lang="ts">
  import PageHeader from './PageHeader.svelte';
  import type { Skin } from './skin.svelte';
  import ShotView from './ShotView.svelte';
  import Water from './Water.svelte';
  import { shownRun } from './water';

  interface Props {
    skin: Skin;
  }

  let { skin }: Props = $props();

  // Hot water or flush runs: home shows it in place of the graph, with stop in its ring (spec 3.6).
  const water = $derived(shownRun(skin.waterRun, skin.canStop));
</script>

<!-- The menu and the state line only: the profile and bean are in the right column (spec 3.11, 3.14). -->
{#snippet header()}
  <PageHeader {skin} heat="group" />
{/snippet}

<div class="home">
  {#if water}
    {@render header()}
    <Water {skin} run={water} />
    {#if skin.notice}
      <p class="notice" data-testid="notice">{skin.notice}</p>
    {:else if skin.info}
      <p class="notice info" data-testid="tare-notice">{skin.info}</p>
    {/if}
  {:else}
    <!-- Home is the shot screen: the graph and the right column, live while a shot runs (spec 3.11);
         the column starts at the page's top, beside the header (spec 3.14). -->
    <ShotView {skin} top={header} />
  {/if}
</div>

<style>
  .home {
    height: 100%;
    box-sizing: border-box;
    padding: 0.8rem 1.2rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .notice {
    margin: 0;
    color: var(--warn);
    font-size: var(--text-label);
  }

  .info {
    color: var(--fg);
  }
</style>
