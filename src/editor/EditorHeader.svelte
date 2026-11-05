<script lang="ts">
  import { sideways } from '../shell/sideways';
  import type { Entry } from './entries';
  import ProfileName from './ProfileName.svelte';

  // The A-Flow editor's header, on one row at 1280 px: the profile's name, the start row,
  // save and save as, the mode.
  interface Props {
    origin: Entry;
    /** the profiles to start from, chosen in the settings */
    row: Entry[];
    busy: boolean;
    canSave: boolean;
    mode: 'simple' | 'detail';
    /** the name was tapped: the profile picker opens */
    onprofile: () => void;
    onpick: (key: string) => void;
    onsave: () => void;
    onsaveas: () => void;
    onmode: (mode: 'simple' | 'detail') => void;
  }

  let { origin, row, busy, canSave, mode, onprofile, onpick, onsave, onsaveas, onmode }: Props = $props();
</script>

<header>
  <!-- The shortcut to the profile picker: a profile chosen there is loaded. -->
  <ProfileName name={origin.name} disabled={busy} width="16rem" onclick={onprofile} />
  <!-- The profiles to start from, chosen in the settings; 'save as' does not add to them. -->
  <div class="group start" role="group" aria-label="start from" data-testid="start-row" use:sideways>
    {#each row as entry (entry.key)}
      <button
        class="seg select-outline truncate"
        aria-pressed={entry.key === origin.key}
        data-testid="start-{entry.name}"
        disabled={busy}
        onclick={() => onpick(entry.key)}
      >
        {entry.name}
      </button>
    {/each}
  </div>
  <div class="group">
    <div class="group" role="group" aria-label="profile actions">
      <button class="seg save" data-testid="save" disabled={busy || !canSave} onclick={onsave}>save</button>
      <button class="seg save" data-testid="save-as" disabled={busy} onclick={onsaveas}> save as </button>
    </div>
    <div class="group" role="group" aria-label="editor mode">
      <button class="seg select-outline" aria-pressed={mode === 'simple'} data-testid="mode-simple" onclick={() => onmode('simple')}
        >simple</button
      >
      <button class="seg select-outline" aria-pressed={mode === 'detail'} data-testid="mode-detail" onclick={() => onmode('detail')}
        >detail</button
      >
    </div>
  </div>
</header>

<style>
  header {
    grid-area: header;
    display: flex;
    justify-content: space-between;
    gap: var(--space-4);
  }

  .group {
    flex: none;
    display: flex;
    gap: var(--space-2);
  }

  header > .group:last-child {
    gap: var(--space-4);
  }

  /* The row takes the room between the name and the actions and scrolls when it has no more. */
  .start {
    flex: 1;
    min-width: 0;
    overflow-x: auto;
    scrollbar-width: none;
  }

  /* Its own pan along only while it overflows (src/shell/sideways.ts). */
  .start:global([data-sideways]) {
    touch-action: pan-x pan-y;
  }

  .start .seg {
    flex: none;
    min-width: 4.5rem;
    max-width: 11rem;
    padding: 0 0.9rem;
  }
</style>
