<script lang="ts">
  import type { Snippet } from 'svelte';

  // The frame of the bean's and the grinder's form: the title, the archived line, the fields and
  // the row of buttons. Its buttons take the shared `.form-button` (app.css).
  interface Props {
    /** the test ids' first word: `<kind>-form`, `<kind>-archived` */
    kind: 'bean' | 'grinder';
    title: string;
    archived: boolean;
    onsubmit: (event: SubmitEvent) => void;
    children: Snippet;
    actions: Snippet;
    /** under the buttons */
    after?: Snippet;
  }

  let { kind, title, archived, onsubmit, children, actions, after }: Props = $props();
</script>

<form class="form" {onsubmit} data-testid="{kind}-form">
  <h2 class="truncate">{title}</h2>
  {#if archived}
    <p class="archived" data-testid="{kind}-archived">Archived: not offered for the next shot; its shots stay in the history.</p>
  {/if}
  {@render children()}

  <div class="actions">
    {@render actions()}
  </div>
  {@render after?.()}
</form>

<style>
  .form {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  h2 {
    margin: 0;
    font-size: var(--text-title);
    font-weight: 600;
  }

  .archived {
    margin: 0;
    color: var(--warn);
    font-size: var(--text-label);
  }

  .actions {
    display: flex;
    gap: var(--space-2);
  }
</style>
