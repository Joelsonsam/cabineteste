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
    <p class="caption muted small">
      Folha {spec.sheetCm[0]} × {spec.sheetCm[1]} cm{spec.copies === 2 ? ', corte no meio' : ''}
    </p>
  </div>

  <div class="panel" in:fly={{ y: 80, duration: 360, delay: 120 }}>
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
    background: var(--graphite);
    padding-top: calc(var(--safe-top) + 64px);
    z-index: 6;
  }
  .sheet-area {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px 32px 16px;
  }
  .sheet-fit {
    flex: 1;
    min-height: 0;
    display: grid;
    place-items: center;
  }
  .sheet {
    position: relative;
  }
  .sheet img {
    display: block;
    width: 100%;
    height: 100%;
  }
  .cut {
    position: absolute;
    top: -8px;
    bottom: -8px;
    left: 50%;
    border-left: 1.5px dashed rgba(var(--accent-rgb), 0.9);
  }
  .caption {
    text-align: center;
  }
  .panel {
    display: grid;
    gap: 16px;
    padding: 16px 16px calc(var(--safe-bottom) + 16px);
    background: var(--panel-solid);
    border-radius: var(--r-lg) var(--r-lg) 0 0;
  }
  .actions {
    display: grid;
    grid-template-columns: 1.3fr 1fr 1fr;
    gap: 8px;
  }
  .act {
    position: relative;
    display: grid;
    justify-items: center;
    gap: 8px;
    padding: 16px 4px 12px;
    border-radius: var(--r-md);
    background: rgba(0, 0, 0, 0.22);
    font-weight: 600;
    font-size: 14.5px;
    transition: transform 0.18s var(--ease-out);
  }
  .act:active {
    transform: scale(0.95);
  }
  .act:disabled {
    opacity: 1;
    color: var(--muted);
  }
  .act.primary {
    background: rgba(var(--accent-rgb), 0.16);
    box-shadow: inset 0 0 0 1.5px rgba(var(--accent-rgb), 0.6);
  }
  .act em {
    position: absolute;
    top: 8px;
    right: 8px;
    font-style: normal;
    font-size: 12.5px;
    font-weight: 700;
    color: var(--accent);
  }
  .act-icon {
    display: grid;
    place-items: center;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: var(--raised);
  }
  .primary .act-icon {
    background: var(--accent);
    color: var(--on-accent);
  }
  .act-icon.done {
    background: rgba(79, 209, 139, 0.2);
    color: var(--ok);
  }
  .next {
    min-height: 64px;
    font-size: 18px;
    font-weight: 700;
  }
</style>
