<script lang="ts">
  import { onDestroy } from 'svelte';
  import { fly, fade } from 'svelte/transition';
  import type { BoothEvent, BoothSession } from '../core/db';
  import { FORMATS } from '../core/formats';
  import Icon from '../ui/Icon.svelte';

  let {
    ev,
    session,
    saveState,
    onprint,
    onsave,
    onshare,
    onnext,
  }: {
    ev: BoothEvent;
    session: BoothSession;
    saveState: 'idle' | 'saving' | 'saved' | 'error';
    onprint: () => void;
    onsave: () => void;
    onshare: () => void;
    onnext: () => void;
  } = $props();

  const spec = $derived(FORMATS[ev.format]);
  let areaW = $state(0);
  let areaH = $state(0);
  const fit = $derived.by(() => {
    const [w, h] = spec.sheetPx;
    const k = areaW && areaH ? Math.min(areaW / w, areaH / h) : 0;
    return { w: w * k, h: h * k };
  });
  const url = $derived(URL.createObjectURL(session.sheet));
  let last = '';
  $effect(() => {
    if (last && last !== url) URL.revokeObjectURL(last);
    last = url;
  });
  onDestroy(() => last && URL.revokeObjectURL(last));
</script>

<div class="delivery" in:fade={{ duration: 220 }}>
  <div class="sheet-area">
    <div class="sheet-fit" bind:clientWidth={areaW} bind:clientHeight={areaH}>
    <figure class="sheet paper" style="width:{fit.w}px;height:{fit.h}px" in:fly={{ y: -40, duration: 600, opacity: 0, easing: (t) => 1 - Math.pow(1 - t, 5) }}>
      <img src={url} alt="Folha pronta para impressão" />
      {#if spec.copies === 2}
        <span class="cut" aria-hidden="true"></span>
      {/if}
    </figure>
    </div>
    <p class="caption mono muted">
      Folha {spec.sheetCm[0]} × {spec.sheetCm[1]} cm{spec.copies === 2 ? ', corte no meio' : ''}
    </p>
  </div>

  <div class="panel bottom-sheet" in:fly={{ y: 80, duration: 360, delay: 120 }}>
    <div class="actions">
      <button class="act primary" onclick={onprint}>
        <span class="act-icon"><Icon name="print" size={24} /></span>
        <span>Imprimir{session.prints ? ` de novo` : ''}</span>
        {#if session.prints}<em>{session.prints}×</em>{/if}
      </button>
      <button class="act" onclick={onsave} disabled={saveState === 'saving' || saveState === 'saved'}>
        <span class="act-icon" class:done={saveState === 'saved'}>
          <Icon name={saveState === 'saved' ? 'check' : 'save'} size={24} stroke={saveState === 'saved' ? 2.4 : 1.8} />
        </span>
        <span>{saveState === 'saved' ? 'Na galeria' : saveState === 'saving' ? 'Salvando' : 'Salvar'}</span>
      </button>
      <button class="act" onclick={onshare}>
        <span class="act-icon"><Icon name="share" size={24} /></span>
        <span>Compartilhar</span>
      </button>
    </div>
    <button class="btn btn-accent next" onclick={onnext}>
      <Icon name="camera" />Próxima sessão
    </button>
  </div>
</div>

<style>
  .delivery {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    background:
      radial-gradient(90% 60% at 50% 36%, rgba(var(--accent-rgb), 0.12), transparent 70%),
      #121212;
    padding-top: calc(var(--safe-top) + 64px);
    z-index: 6;
  }
  .sheet-area {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 16px 32px;
  }
  .sheet-fit {
    flex: 1;
    min-height: 0;
    display: grid;
    place-items: center;
  }
  .sheet {
    position: relative;
    box-shadow:
      0 0 0 1px rgba(0, 0, 0, 0.04),
      0 4px 100px rgba(var(--accent-rgb), 0.2),
      0 24px 48px -16px rgba(0, 0, 0, 0.8);
  }
  .sheet img {
    display: block;
    width: 100%;
    height: 100%;
  }
  .cut {
    position: absolute;
    top: -16px;
    bottom: -16px;
    left: 50%;
    border-left: 1px dashed var(--accent);
  }
  .cut::before,
  .cut::after {
    content: '';
    position: absolute;
    left: -4px;
    width: 8px;
    height: 1px;
    background: var(--accent);
  }
  .cut::before {
    top: 0;
  }
  .cut::after {
    bottom: 0;
  }
  .caption {
    text-align: center;
  }
  .panel {
    display: grid;
    gap: 16px;
    padding: 16px 16px calc(var(--safe-bottom) + 16px);
  }
  .actions {
    display: grid;
    grid-template-columns: 1.25fr 1fr 1fr;
    border-radius: var(--r-xs);
    box-shadow: inset 0 0 0 1px var(--line-strong);
    overflow: hidden;
  }
  .act {
    position: relative;
    display: grid;
    justify-items: center;
    gap: 8px;
    padding: 16px 8px;
    font-weight: 500;
    font-size: 15px;
    letter-spacing: -0.01em;
    transition: background 0.2s var(--ease-out);
  }
  .act + .act {
    border-left: 1px solid var(--line-strong);
  }
  .act:active {
    background: rgba(255, 255, 255, 0.04);
  }
  .act:disabled {
    color: var(--muted);
  }
  .act.primary {
    background: rgba(var(--accent-rgb), 0.12);
  }
  .act.primary::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 2px;
    background: var(--accent);
  }
  .act em {
    position: absolute;
    top: 8px;
    right: 8px;
    font-style: normal;
    font-family: var(--mono);
    font-size: 12px;
    color: var(--accent);
  }
  .act-icon {
    display: grid;
    place-items: center;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    box-shadow: inset 0 0 0 1px var(--line-strong);
  }
  .primary .act-icon {
    background: var(--accent);
    color: var(--on-accent);
    box-shadow: var(--glass), 0 0 32px rgba(var(--accent-rgb), 0.4);
  }
  .act-icon.done {
    color: var(--ok);
    box-shadow: inset 0 0 0 1px rgba(63, 214, 143, 0.4);
    background: rgba(63, 214, 143, 0.08);
  }
  .next {
    min-height: 64px;
    font-size: 18px;
  }
</style>
