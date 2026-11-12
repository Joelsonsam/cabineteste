<script lang="ts">
  import type { Snippet } from 'svelte';
  import { vibrate } from '../core/util';

  let { onconfirm, duration = 1100, children, hint = 'Segure para confirmar' }: {
    onconfirm: () => void;
    duration?: number;
    children: Snippet;
    hint?: string;
  } = $props();

  let progress = $state(0);
  let holding = $state(false);
  let raf = 0;
  let start = 0;

  function begin(e: PointerEvent) {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    holding = true;
    start = performance.now();
    const step = (t: number) => {
      progress = Math.min(1, (t - start) / duration);
      if (progress >= 1) {
        holding = false;
        progress = 0;
        vibrate(30);
        onconfirm();
        return;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  function cancel() {
    cancelAnimationFrame(raf);
    holding = false;
    progress = 0;
  }
</script>

<button
  class="btn btn-danger hold"
  onpointerdown={begin}
  onpointerup={cancel}
  onpointercancel={cancel}
  onpointerleave={cancel}
  oncontextmenu={(e) => e.preventDefault()}
  aria-label={hint}
>
  <span class="fill" style="transform:scaleX({progress})"></span>
  <span class="content">{#if holding}{hint}{:else}{@render children()}{/if}</span>
</button>

<style>
  .hold {
    position: relative;
    overflow: hidden;
    width: 100%;
  }
  .fill {
    position: absolute;
    inset: 0;
    background: rgba(255, 107, 90, 0.3);
    transform-origin: left;
  }
  .content {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
</style>
