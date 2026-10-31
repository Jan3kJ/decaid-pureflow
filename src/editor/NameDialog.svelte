<script lang="ts">
  // Asks for the name of 'save as'. What happens with the name is the caller's (onconfirm).
  interface Props {
    /** names that exist already, compared without case */
    taken: readonly string[];
    onconfirm: (name: string) => void;
    oncancel: () => void;
  }

  let { taken, onconfirm, oncancel }: Props = $props();

  const MAX_LENGTH = 30;
  let text = $state('');
  let input: HTMLInputElement | undefined = $state();

  const name = $derived(text.trim());
  const exists = $derived(taken.some((t) => t.toLowerCase() === name.toLowerCase()));
  const valid = $derived(name !== '' && !exists);

  $effect(() => input?.focus());

  function submit(event: SubmitEvent) {
    event.preventDefault();
    if (valid) onconfirm(name);
  }
</script>

<svelte:window onkeydown={(e: KeyboardEvent) => e.key === 'Escape' && oncancel()} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="backdrop" data-no-swipe onclick={(e) => e.target === e.currentTarget && oncancel()}>
  <div class="dialog" role="dialog" aria-modal="true" aria-label="save as" data-testid="save-dialog">
    <form onsubmit={submit}>
      <label for="save-name">save the profile as</label>
      <input
        id="save-name"
        bind:this={input}
        bind:value={text}
        maxlength={MAX_LENGTH}
        placeholder="name"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        enterkeyhint="done"
        data-testid="save-name"
      />
      <p class="hint" data-testid="save-hint">{exists ? 'This name is in use.' : ' '}</p>
      <div class="actions">
        <button type="button" data-testid="save-cancel" onclick={oncancel}>cancel</button>
        <button type="submit" class="confirm" data-testid="save-confirm" disabled={!valid}>save</button>
      </div>
    </form>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: var(--layer-dialog);
    display: flex;
    /* Near the top: the system keyboard covers the lower half of a tablet. */
    align-items: flex-start;
    justify-content: center;
    padding-top: 5rem;
    background: var(--scrim);
  }

  .dialog {
    width: 26rem;
    box-sizing: border-box;
    padding: var(--space-3);
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: var(--radius-dialog);
    box-shadow: var(--shadow-dialog);
  }

  form {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  label {
    font-size: var(--text-body);
    color: var(--dim);
  }

  input {
    min-height: var(--control-big);
    box-sizing: border-box;
    padding: 0 0.9rem;
    font: inherit;
    font-size: var(--text-value);
    color: var(--fg);
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    outline: none;
  }

  input:focus {
    border-color: var(--fg);
  }

  .hint {
    margin: 0;
    min-height: 1.2rem;
    font-size: var(--text-label);
    color: var(--temperature);
    white-space: pre;
  }

  .actions {
    display: flex;
    gap: var(--space-2);
  }

  button {
    flex: 1;
    min-height: var(--control-big);
    font: inherit;
    font-size: var(--text-body);
    color: var(--fg);
    background: var(--raised);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    touch-action: manipulation;
  }

  button:disabled {
    opacity: 0.35;
  }

  .confirm {
    background: var(--fg);
    border-color: var(--fg);
    color: var(--bg);
    font-weight: 600;
  }
</style>
