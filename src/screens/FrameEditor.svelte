<script lang="ts">
  import { onMount } from 'svelte';
  import { fly } from 'svelte/transition';
  import { FORMATS, defaultWindows, type FormatId, type Rect } from '../core/formats';
  import { sortReadingOrder } from '../core/frame-detect';
  import { analyzeFrame } from '../core/util';
  import Icon from '../ui/Icon.svelte';
  import UnitPreview from '../ui/UnitPreview.svelte';

  let {
    format,
    frame,
    windows,
    accent,
    eventName,
    ondone,
    oncancel,
  }: {
    format: FormatId;
    frame: Blob | null;
    windows: Rect[];
    accent: string;
    eventName: string;
    ondone: (w: Rect[]) => void;
    oncancel: () => void;
  } = $props();

  const spec = $derived(FORMATS[format]);
  let draft: Rect[] = $state(windows.map((w) => ({ ...w })));
  let selected = $state(0);
  let wrapW = $state(0);
  let wrapH = $state(0);
  const fitK = $derived(wrapW && wrapH ? Math.min(wrapW / spec.unitPx[0], wrapH / spec.unitPx[1]) : 0);
  const k = $derived(fitK);
  const MIN = 60;

  onMount(() => {
    const onBack = (e: Event) => {
      e.preventDefault();
      oncancel();
    };
    window.addEventListener('cabine:back', onBack);
    return () => window.removeEventListener('cabine:back', onBack);
  });

  type Mode = 'move' | 'nw' | 'ne' | 'sw' | 'se';
  let drag: { i: number; mode: Mode; x: number; y: number; orig: Rect } | null = null;

  function down(e: PointerEvent, i: number, mode: Mode) {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    selected = i;
    drag = { i, mode, x: e.clientX, y: e.clientY, orig: { ...draft[i] } };
  }

  function move(e: PointerEvent) {
    if (!drag || !k) return;
    const dx = (e.clientX - drag.x) / k;
    const dy = (e.clientY - drag.y) / k;
    const [W, H] = spec.unitPx;
    const o = drag.orig;
    let { x, y, w, h } = o;
    if (drag.mode === 'move') {
      x = Math.min(Math.max(0, o.x + dx), W - o.w);
      y = Math.min(Math.max(0, o.y + dy), H - o.h);
    } else {
      if (drag.mode.includes('w')) {
        x = Math.min(Math.max(0, o.x + dx), o.x + o.w - MIN);
        w = o.w + (o.x - x);
      }
      if (drag.mode.includes('e')) w = Math.min(Math.max(MIN, o.w + dx), W - o.x);
      if (drag.mode.includes('n')) {
        y = Math.min(Math.max(0, o.y + dy), o.y + o.h - MIN);
        h = o.h + (o.y - y);
      }
      if (drag.mode.includes('s')) h = Math.min(Math.max(MIN, o.h + dy), H - o.y);
    }
    draft[drag.i] = { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
  }

  function up() {
    drag = null;
  }

  function nudge(dx: number, dy: number) {
    const r = draft[selected];
    if (!r) return;
    const [W, H] = spec.unitPx;
    draft[selected] = { ...r, x: Math.min(Math.max(0, r.x + dx), W - r.w), y: Math.min(Math.max(0, r.y + dy), H - r.h) };
  }

  function add() {
    if (draft.length >= 6) return;
    const [W, H] = spec.unitPx;
    const w = Math.round(W * 0.4);
    const h = Math.round(H * 0.25);
    draft.push({ x: Math.round((W - w) / 2), y: Math.round((H - h) / 2), w, h });
    selected = draft.length - 1;
  }

  function remove() {
    if (draft.length <= 1) return;
    draft.splice(selected, 1);
    selected = Math.max(0, selected - 1);
  }

  function shift(dir: -1 | 1) {
    const j = selected + dir;
    if (j < 0 || j >= draft.length) return;
    [draft[selected], draft[j]] = [draft[j], draft[selected]];
    selected = j;
  }

  let busy = $state(false);
  async function redetect() {
    if (!frame) {
      draft = defaultWindows(format, draft.length);
      return;
    }
    busy = true;
    const res = await analyzeFrame(frame, spec.unitPx);
    busy = false;
    if (res.windows.length) {
      draft = res.windows;
      selected = 0;
    }
  }

  const cm = (px: number) => ((px / 300) * 2.54).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  const sel = $derived(draft[selected]);
</script>

<div class="editor" transition:fly={{ y: 40, duration: 280 }}>
  <header class="topbar">
    <button class="icon-btn" aria-label="Cancelar" onclick={oncancel}><Icon name="close" /></button>
    <h1 class="title-md">Ajustar janelas</h1>
    <button class="btn btn-accent done" onclick={() => ondone(draft.map((r) => ({ ...r })))}>Aplicar</button>
  </header>

  <div class="stage-wrap" bind:clientWidth={wrapW} bind:clientHeight={wrapH}>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="stage paper"
      style="width:{spec.unitPx[0] * k}px;height:{spec.unitPx[1] * k}px" 
      onpointermove={move}
      onpointerup={up}
      onpointercancel={up}
    >
      <UnitPreview class="base" {format} windows={draft} {frame} {eventName} {accent} numbers={false} resolution={0.4} />
      {#each draft as r, i (i)}
        <div
          class="win"
          class:sel={i === selected}
          style="left:{r.x * k}px;top:{r.y * k}px;width:{r.w * k}px;height:{r.h * k}px"
          onpointerdown={(e) => down(e, i, 'move')}
        >
          <span class="num">{i + 1}</span>
          {#if i === selected}
            {#each ['nw', 'ne', 'sw', 'se'] as const as c (c)}
              <span class="handle {c}" onpointerdown={(e) => down(e, i, c)}></span>
            {/each}
          {/if}
        </div>
      {/each}
    </div>
  </div>

  <div class="panel">
    {#if sel}
      <p class="readout">
        <strong>Pose {selected + 1}</strong>
        <span>{sel.w} × {sel.h} px</span>
        <span class="muted">{cm(sel.w)} × {cm(sel.h)} cm</span>
      </p>
    {/if}
    <div class="tools">
      <button class="tool" onclick={() => shift(-1)} disabled={selected === 0} aria-label="Trocar com a pose anterior">
        <span class="rot"><Icon name="back" /></span>Antes
      </button>
      <button class="tool" onclick={() => shift(1)} disabled={selected === draft.length - 1} aria-label="Trocar com a próxima pose">
        <span class="rot flip"><Icon name="back" /></span>Depois
      </button>
      <button class="tool" onclick={add} disabled={draft.length >= 6}><Icon name="plus" />Janela</button>
      <button class="tool" onclick={remove} disabled={draft.length <= 1}><Icon name="trash" />Remover</button>
      <button class="tool" onclick={redetect} disabled={busy}><Icon name="wand" />{frame ? 'Detectar' : 'Padrão'}</button>
    </div>
    <div class="nudge" aria-label="Ajuste fino">
      <button onclick={() => nudge(0, -2)} aria-label="Para cima"><span style="transform:rotate(90deg)"><Icon name="back" size={20} /></span></button>
      <button onclick={() => nudge(-2, 0)} aria-label="Para a esquerda"><Icon name="back" size={20} /></button>
      <button onclick={() => nudge(2, 0)} aria-label="Para a direita"><span style="transform:rotate(180deg)"><Icon name="back" size={20} /></span></button>
      <button onclick={() => nudge(0, 2)} aria-label="Para baixo"><span style="transform:rotate(-90deg)"><Icon name="back" size={20} /></span></button>
      <button class="sort" onclick={() => (draft = sortReadingOrder(draft))}>Ordenar leitura</button>
    </div>
  </div>
</div>

<style>
  .editor {
    position: fixed;
    inset: 0;
    z-index: 40;
    display: flex;
    flex-direction: column;
    background: var(--graphite);
  }
  .done {
    min-height: 48px;
  }
  .stage-wrap {
    flex: 1;
    min-height: 0;
    margin: 12px 24px;
    display: grid;
    place-items: center;
  }
  .stage {
    position: relative;
    touch-action: none;
  }
  .stage :global(.base) {
    width: 100%;
    height: 100%;
  }
  .win {
    position: absolute;
    border: 2px dashed rgba(28, 27, 25, 0.55);
    background: rgba(28, 27, 25, 0.08);
    touch-action: none;
  }
  .win.sel {
    border: 2px solid var(--accent);
    background: rgba(var(--accent-rgb), 0.14);
    z-index: 2;
  }
  .num {
    position: absolute;
    left: 4px;
    top: 4px;
    font-weight: 760;
    font-size: 15px;
    color: var(--ink);
    background: rgba(244, 242, 236, 0.85);
    border-radius: 4px;
    padding: 0 4px;
  }
  .sel .num {
    background: var(--accent);
    color: var(--on-accent);
  }
  .handle {
    position: absolute;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: var(--accent);
    border: 3px solid var(--paper);
    touch-action: none;
  }
  .nw { left: -16px; top: -16px; }
  .ne { right: -16px; top: -16px; }
  .sw { left: -16px; bottom: -16px; }
  .se { right: -16px; bottom: -16px; }
  .panel {
    padding: 12px 16px calc(var(--safe-bottom) + 16px);
    display: grid;
    gap: 12px;
    background: var(--panel-solid);
    border-radius: var(--r-lg) var(--r-lg) 0 0;
  }
  .readout {
    display: flex;
    gap: 12px;
    align-items: baseline;
    font-size: 15px;
  }
  .tools {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 4px;
  }
  .tool {
    display: grid;
    justify-items: center;
    gap: 4px;
    padding: 8px 2px;
    border-radius: var(--r-sm);
    font-size: 12.5px;
    font-weight: 560;
    color: var(--muted);
    background: rgba(0, 0, 0, 0.2);
  }
  .tool:disabled {
    opacity: 0.35;
  }
  .rot {
    display: inline-flex;
    transform: rotate(90deg);
  }
  .rot.flip {
    transform: rotate(-90deg);
  }
  .nudge {
    display: flex;
    gap: 4px;
  }
  .nudge button {
    width: 48px;
    height: 48px;
    border-radius: 12px;
    display: grid;
    place-items: center;
    background: rgba(0, 0, 0, 0.2);
  }
  .nudge button span {
    display: inline-flex;
  }
  .nudge .sort {
    flex: 1;
    width: auto;
    font-size: 14px;
    font-weight: 580;
  }
</style>
