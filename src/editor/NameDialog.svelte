<script lang="ts">
  // Asks for the name of 'save as'. What happens with the name is the caller's (onconfirm).
  import Dialog from '../ui/Dialog.svelte';

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

<Dialog label="save as" width="26rem" top testid="save-dialog" {oncancel}>
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
      <button type="submit" class="confirm primary" data-testid="save-confirm" disabled={!valid}>save</button>
    </div>
  </form>
</Dialog>

<style>
  form {
    padding: var(--space-3);
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
    min-height: 1.2rem;
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
    font-size: var(--text-body);
    background: none;
    border: 1px solid var(--edge);
    border-radius: var(--radius);
  }

  button:disabled {
    opacity: 0.35;
  }
</style>
