<!--
  Ported from Streamline.js (https://github.com/decentespresso/streamline-js), v0.2.14,
  src/settings/categories/maintenance.js (its confirm dialogs), by way of SettingsPage.svelte.
  Streamline.js - A browser-native skin for Decent Espresso machines
  Copyright (C) 2025-2026 Decent Espresso
  Licensed under the GNU General Public License v3.0 or later; used here under GPL-3.0.
-->
<script lang="ts">
  // The question before a write or a procedure that can do harm: what it
  // does, Cancel and the action. The settings page, its device lists and maintenance use it;
  // with a `value` it holds a text field (the picker's rename), Enter is the action, and
  // `error` says under it why the action was refused. A `danger` action (a delete) is the
  // warning outline, not the filled button. Escape cancels.
  import Dialog from '../ui/Dialog.svelte';

  interface Props {
    title: string;
    text?: string;
    /** the action's button */
    ok?: string;
    /** the text field's content; without it there is no field */
    value?: string;
    /** the text field's name for a screen reader */
    label?: string;
    error?: string | null;
    /** the action deletes or discards */
    danger?: boolean;
    onok: () => void;
    oncancel: () => void;
  }

  let {
    title,
    text = '',
    ok = 'set',
    value = $bindable(),
    label = title,
    error = null,
    danger = false,
    onok,
    oncancel,
  }: Props = $props();

  /** The field takes the focus at once, so the tablet's keyboard opens on it, the cursor at its end. */
  function focus(node: HTMLInputElement) {
    node.focus();
    node.setSelectionRange(node.value.length, node.value.length);
  }
</script>

<Dialog label={title} width="30rem" testid="settings-confirm" {oncancel}>
  <div class="content">
    <h2>{title}</h2>
    {#if text}<p>{text}</p>{/if}
    {#if value !== undefined}
      <input
        class="field"
        type="text"
        aria-label={label}
        autocomplete="off"
        spellcheck="false"
        enterkeyhint="done"
        data-testid="settings-confirm-field"
        bind:value
        use:focus
        onkeydown={(event) => event.key === 'Enter' && onok()}
      />
      <p class="error" data-testid="settings-confirm-error">{error ?? ''}</p>
    {/if}
    <div class="actions">
      <button class="action" data-testid="settings-confirm-cancel" onclick={oncancel}>cancel</button>
      <button class="action" class:primary={!danger} class:danger data-testid="settings-confirm-ok" onclick={onok}>{ok}</button>
    </div>
  </div>
</Dialog>

<style>
  .content {
    padding: var(--space-1) var(--space-3) var(--space-3);
  }

  h2 {
    margin: var(--space-2) 0 var(--space-1);
    font-size: var(--text-title);
    font-weight: 600;
  }

  p {
    margin: 0;
    color: var(--dim);
  }

  .field {
    width: 100%;
    box-sizing: border-box;
    min-height: var(--control);
    margin-top: var(--space-1);
    padding: 0 1rem;
    font: inherit;
    font-size: var(--text-body);
    color: var(--fg);
    background: var(--raised);
    border: 1px solid var(--line);
    border-radius: var(--radius);
  }

  /* The reason's line holds its place, so the buttons do not move when it appears. */
  .error {
    min-height: 1lh;
    margin-top: var(--space-1);
    color: var(--warn);
    font-size: var(--text-label);
  }

  .actions {
    margin-top: 1rem;
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
  }
</style>
