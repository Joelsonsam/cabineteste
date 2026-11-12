<script lang="ts">
  import { fly, fade } from 'svelte/transition';
  import { FILTERS, type FilterId } from '../core/compose';
  import type { BoothEvent } from '../core/db';
  import { FORMATS } from '../core/formats';
  import Icon from '../ui/Icon.svelte';
  import UnitPreview from '../ui/UnitPreview.svelte';

  let {
    ev,
    photos,
    filter = $bindable(),
    busy,
    onretakeAll,
    onretakeOne,
    onapprove,
  }: {
    ev: BoothEvent;
    photos: (ImageBitmap | null)[];
    filter: FilterId;
    busy: boolean;
    onretakeAll: () => void;
    onretakeOne: (i: number) => void;
    onapprove: () => void;
  } = $props();

  const spec = $derived(FORMATS[ev.format]);
  let areaW = $state(0);
  let areaH = $state(0);
  const fit = $derived.by(() => {
    const [w, h] = spec.unitPx;
    const k = areaW && areaH ? Math.min(areaW / w, areaH / h) : 0;
    return { w: w * k, h: h * k };
  });
  let thumbs: string[] = $state([]);

  $effect(() => {
    const urls: string[] = [];
    let alive = true;
    Promise.all(
      photos.map(async (p) => {
        if (!p) return '';
        const c = document.createElement('canvas');
        const k = 160 / Math.max(p.width, p.height);
        c.width = Math.round(p.width * k);
        c.height = Math.round(p.height * k);
        c.getContext('2d')!.drawImage(p, 0, 0, c.width, c.height);
        const b: Blob = await new Promise((r) => c.toBlob((x) => r(x!), 'image/jpeg', 0.7));
        const u = URL.createObjectURL(b);
        urls.push(u);
        return u;
      })
    ).then((list) => {
      if (alive) thumbs = list;
    });
    return () => {
      alive = false;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  });
</script>

<div class="review" in:fade={{ duration: 200 }}>
  <div class="proof-area" bind:clientWidth={areaW} bind:clientHeight={areaH}>
    <div class="proof paper" style="width:{fit.w}px;height:{fit.h}px" in:fly={{ y: 60, duration: 520, opacity: 0, easing: (t) => 1 - Math.pow(1 - t, 4) }}>
      <UnitPreview class="proof-canvas" format={ev.format} windows={ev.windows} frame={ev.frame} {photos} {filter} eventName={ev.name} accent={ev.accent} resolution={0.55} numbers={false} />
    </div>
  </div>

  <div class="sheet-panel" in:fly={{ y: 80, duration: 380, delay: 80 }}>
    <div class="poses" aria-label="Refazer uma pose">
      {#each photos as _, i (i)}
        <button class="pose" onclick={() => onretakeOne(i)} aria-label="Refazer pose {i + 1}">
          {#if thumbs[i]}<img src={thumbs[i]} alt="" />{/if}
          <span class="pose-n">{i + 1}</span>
          <span class="pose-retake"><Icon name="retake" size={16} stroke={2.2} /></span>
        </button>
      {/each}
      <span class="poses-hint muted small">Toque numa pose para refazer só ela</span>
    </div>

    <div class="filters" role="radiogroup" aria-label="Filtro">
      {#each FILTERS as f (f.id)}
        <button role="radio" aria-checked={filter === f.id} class:on={filter === f.id} onclick={() => (filter = f.id)}>
          <span class="chip-swatch {f.id}"></span>{f.name}
        </button>
      {/each}
    </div>

    <div class="actions">
      <button class="btn btn-ghost" onclick={onretakeAll} disabled={busy}><Icon name="retake" size={20} />Refazer</button>
      <button class="btn btn-accent approve" onclick={onapprove} disabled={busy}>
        {#if busy}<span class="spinner"></span>Montando a folha{:else}<Icon name="check" stroke={2.4} />Aprovar{/if}
      </button>
    </div>
  </div>
</div>

<style>
  .review {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    background:
      radial-gradient(120% 70% at 50% 30%, rgba(var(--accent-rgb), 0.12), transparent 60%),
      var(--graphite);
    padding-top: calc(var(--safe-top) + 64px);
    z-index: 5;
  }
  .proof-area {
    flex: 1;
    min-height: 0;
    margin: 12px 32px 24px;
    display: grid;
    place-items: center;
  }
  .proof {
    transform: rotate(-1.2deg);
  }
  .proof :global(.proof-canvas) {
    width: 100%;
    height: 100%;
  }
  .sheet-panel {
    display: grid;
    gap: 16px;
    padding: 16px 16px calc(var(--safe-bottom) + 16px);
    background: var(--panel-solid);
    border-radius: var(--r-lg) var(--r-lg) 0 0;
    box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.4);
  }
  .poses {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .pose {
    position: relative;
    width: 56px;
    height: 56px;
    border-radius: 12px;
    overflow: hidden;
    background: var(--raised);
    flex: none;
  }
  .pose img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .pose-n {
    position: absolute;
    left: 4px;
    top: 2px;
    font-weight: 760;
    font-size: 13px;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
  }
  .pose-retake {
    position: absolute;
    right: 4px;
    bottom: 4px;
    width: 24px;
    height: 24px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: rgba(23, 24, 28, 0.78);
  }
  .poses-hint {
    margin-left: 4px;
    line-height: 1.2;
  }
  .filters {
    display: flex;
    gap: 8px;
  }
  .filters button {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 48px;
    border-radius: 999px;
    font-weight: 600;
    font-size: 15px;
    color: var(--muted);
    box-shadow: inset 0 0 0 1px var(--line-strong);
    transition: background 0.2s, color 0.2s;
  }
  .filters button.on {
    background: var(--text);
    color: var(--graphite);
    box-shadow: none;
  }
  .chip-swatch {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: linear-gradient(135deg, #e86a4f, #3d8fd9);
  }
  .chip-swatch.pb {
    background: linear-gradient(135deg, #eee, #333);
  }
  .chip-swatch.quente {
    background: linear-gradient(135deg, #ffc56b, #c9562a);
  }
  .actions {
    display: flex;
    gap: 8px;
  }
  .approve {
    flex: 1;
    min-height: 64px;
    font-size: 18px;
    font-weight: 700;
  }
  .spinner {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 2.5px solid currentColor;
    border-right-color: transparent;
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
