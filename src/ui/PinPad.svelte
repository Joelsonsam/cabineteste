<script lang="ts">
  import { vibrate } from '../core/util';

  let { pin, onsuccess, oncancel }: { pin: string; onsuccess: () => void; oncancel: () => void } = $props();

  let typed = $state('');
  let wrong = $state(false);

  function press(d: string) {
    if (typed.length >= pin.length) return;
    wrong = false;
    typed += d;
    if (typed.length === pin.length) {
      if (typed === pin) {
        vibrate(20);
        onsuccess();
      } else {
        wrong = true;
        vibrate([40, 60, 40]);
        setTimeout(() => (typed = ''), 450);
      }
    }
  }

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];
</script>

<div class="scrim" role="dialog" aria-modal="true" aria-label="PIN do operador">
  <div class="pad">
    <p class="title">Área do operador</p>
    <div class="dots" class:wrong>
      {#each Array.from({ length: pin.length }) as _, i (i)}
        <i class:on={i < typed.length}></i>
      {/each}
    </div>
    <div class="keys">
      {#each keys as k, i (i)}
        {#if k === ''}
          <span></span>
        {:else if k === '⌫'}
          <button class="key ghost" aria-label="Apagar" onclick={() => (typed = typed.slice(0, -1))}>⌫</button>
        {:else}
          <button class="key" onclick={() => press(k)}>{k}</button>
        {/if}
      {/each}
    </div>
    <button class="cancel" onclick={oncancel}>Cancelar</button>
  </div>
</div>

<style>
  .scrim {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    z-index: 50;
    display: grid;
    place-items: center;
    background: rgba(10, 10, 10, 0.9);
  }
  .pad {
    display: grid;
    justify-items: center;
    grid-gap: 1.5em;
    gap: 1.5em;
  }
  .title {
    font-size: 1.5em;
    font-weight: 500;
  }
  .dots {
    display: grid;
    grid-auto-flow: column;
    grid-gap: 1em;
    gap: 1em;
  }
  .dots i {
    width: 1em;
    height: 1em;
    border-radius: 50%;
    box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.5);
  }
  .dots i.on {
    background: #f2f2f0;
  }
  .dots.wrong i {
    box-shadow: inset 0 0 0 2px #ff5c6c;
    background: #ff5c6c;
  }
  .keys {
    display: grid;
    grid-template-columns: repeat(3, 4.5em);
    grid-gap: 1em;
    gap: 1em;
  }
  .key {
    width: 3em;
    height: 3em;
    border-radius: 50%;
    font-size: 1.5em;
    font-weight: 500;
    box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.16);
  }
  .key:active {
    background: rgba(255, 255, 255, 0.12);
  }
  .ghost {
    box-shadow: none;
    color: #9a9a9a;
  }
  .cancel {
    min-height: 3em;
    padding: 0 2em;
    color: #9a9a9a;
  }
</style>
