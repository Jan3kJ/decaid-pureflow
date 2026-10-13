<script lang="ts">
  // The place of a screen a later milestone builds.
  interface Props {
    title: string;
    text: string;
  }

  let { title, text }: Props = $props();
</script>

<section data-testid="placeholder">
  <h1>{title}</h1>
  <p>{text}</p>
</section>

<style>
  section {
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.6rem;
    padding: 2rem;
    box-sizing: border-box;
    text-align: center;
  }

  h1 {
    margin: 0;
    font-size: 2.2rem;
    font-weight: 600;
  }

  p {
    margin: 0;
    max-width: 32rem;
    color: var(--dim);
    font-size: 1.1rem;
  }
</style>
