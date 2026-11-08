<script lang="ts">
  import type { Snippet } from 'svelte';

  // A text field of the bean's and the grinder's form: the caption over the field.
  interface Props {
    label: string;
    value: string;
    /** a required field that is empty: the field's border in the warning red */
    missing?: boolean;
    testid: string;
    /** false for a name, where the keyboard's corrections get in the way */
    spellcheck?: boolean;
    enterkeyhint: 'next' | 'done';
    /** the id of a datalist of suggestions */
    list?: string;
    /** after the field: its datalist */
    children?: Snippet;
  }

  let { label, value = $bindable(), missing = false, testid, spellcheck, enterkeyhint, list, children }: Props = $props();
</script>

<label class:missing>
  <span>{label}</span>
  <input class="line-field" bind:value {list} autocomplete="off" {spellcheck} {enterkeyhint} data-testid={testid} />
  {@render children?.()}
</label>

<style>
  label {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    color: var(--dim);
    font-size: var(--text-label);
  }

  input {
    min-height: var(--control-tall);
    box-sizing: border-box;
    padding: 0 0.9rem;
    font: inherit;
    font-size: var(--text-value);
    color: var(--fg);
    color-scheme: dark;
  }

  .missing input {
    border-bottom-color: var(--temperature);
  }
</style>
