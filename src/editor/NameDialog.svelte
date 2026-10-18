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

<svelte:window onkeydown={(e) => e.key === 'Escape' && oncancel()} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="backdrop" onclick={(e) => e.target === e.currentTarget && oncancel()}>
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
        <button type="submit" class="confirm" data-testid="save-confirm" disabled={!valid}
          >save</button
        >
      </div>
    </form>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 10;
    display: flex;
    /* Near the top: the system keyboard covers the lower half of a tablet. */
    align-items: flex-start;
    justify-content: center;
    padding-top: 5rem;
    background: rgb(0 0 0 / 55%);
  }

  .dialog {
    width: 26rem;
    box-sizing: border-box;
    padding: 1.2rem;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 1.2rem;
    box-shadow: 0 0.6rem 2.4rem rgb(0 0 0 / 70%);
  }

  form {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  label {
    font-size: 1.05rem;
    color: var(--dim);
  }

  input {
    min-height: 3.5rem;
    box-sizing: border-box;
    padding: 0 0.9rem;
    font: inherit;
    font-size: 1.4rem;
    color: var(--fg);
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: 0.9rem;
    outline: none;
  }

  input:focus {
    border-color: var(--fg);
  }

  .hint {
    margin: 0;
    min-height: 1.2rem;
    font-size: 0.9rem;
    color: var(--temperature);
    white-space: pre;
  }

  .actions {
    display: flex;
    gap: 0.6rem;
  }

  button {
    flex: 1;
    min-height: 3.5rem;
    font: inherit;
    font-size: 1.15rem;
    color: var(--fg);
    background: var(--raised);
    border: 1px solid var(--line);
    border-radius: 0.9rem;
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
