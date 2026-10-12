<script lang="ts">
  import Editor from './editor/Editor.svelte';
</script>

<main>
  <Editor />
</main>

<style>
  main {
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
