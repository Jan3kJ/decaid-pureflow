<script lang="ts">
  import { PRODUCT_NAME } from './product';
</script>

<main>
  <h1>{PRODUCT_NAME}</h1>
</main>

<style>
  main {
    height: 100%;
    display: grid;
    place-items: center;
  }

  h1 {
    margin: 0;
    font-size: 8vh;
    font-weight: 300;
    letter-spacing: 0.05em;
  }

  /* v1 is landscape only: a tablet held upright still gets the landscape layout. */
  @media (orientation: portrait) {
    main {
      width: 100vh;
      height: 100vw;
      transform: rotate(90deg) translateY(-100%);
      transform-origin: top left;
    }

    h1 {
      font-size: 8vw;
    }
  }
</style>
