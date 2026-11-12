<script lang="ts">
  import { onMount } from 'svelte';
  import { app, go, setActive } from '../state.svelte';
  import { countSessions } from '../core/db';
  import { FORMATS, formatCm } from '../core/formats';
  import { accentVars } from '../core/util';
  import Icon from '../ui/Icon.svelte';
  import UnitPreview from '../ui/UnitPreview.svelte';

  let counts: Record<string, number> = $state({});

  onMount(async () => {
    const out: Record<string, number> = {};
    for (const e of app.events) out[e.id] = await countSessions(e.id);
    counts = out;
  });

  async function open(id: string) {
    await setActive(id);
    go({ name: 'booth' });
  }

  const sorted = $derived(
    [...app.events].sort((a, b) => (a.id === app.activeId ? -1 : b.id === app.activeId ? 1 : b.updatedAt - a.updatedAt))
  );
  const total = $derived(Object.values(counts).reduce((a, b) => a + b, 0));
</script>

<section class="screen">
  <header class="topbar">
    <div class="heading">
      <h1 class="title-xl">Eventos</h1>
      {#if sorted.length}
        <p class="mono muted">{sorted.length} {sorted.length === 1 ? 'evento' : 'eventos'} / {total} {total === 1 ? 'sessão' : 'sessões'}</p>
      {/if}
    </div>
    <button class="icon-btn" aria-label="Ajustes" onclick={() => go({ name: 'settings' })}>
      <Icon name="settings" />
    </button>
  </header>

  <div class="scroll">
    {#if sorted.length === 0}
      <div class="empty">
        <div class="bracket">
          <span class="c tl"></span><span class="c tr"></span><span class="c bl"></span><span class="c br"></span>
          <div class="empty-art paper"><i></i><i></i><i></i></div>
        </div>
        <h2 class="title-lg">Nenhum evento ainda</h2>
        <p class="muted">Cada evento guarda a moldura, o formato e a cor da ativação. Depois é só tocar nele para abrir a câmera.</p>
      </div>
    {:else}
      <ul class="list">
        {#each sorted as ev (ev.id)}
          {@const f = FORMATS[ev.format]}
          {@const n = counts[ev.id] ?? 0}
          <li class="row" class:active={ev.id === app.activeId} style={accentVars(ev.accent)}>
            <button class="row-main" onclick={() => open(ev.id)}>
              <div class="thumb">
                <UnitPreview
                  class={f.landscape ? 'thumb-canvas wide' : 'thumb-canvas'}
                  format={ev.format}
                  windows={ev.windows}
                  frame={ev.frame}
                  eventName={ev.name}
                  accent={ev.accent}
                  resolution={0.12}
                />
              </div>
              <div class="info">
                <div class="name-line">
                  <i class="swatch"></i>
                  <strong>{ev.name || 'Evento sem nome'}</strong>
                </div>
                <span class="muted">{f.name}{ev.format.startsWith('lembranca') ? (f.landscape ? ' paisagem' : ' retrato') : ''}</span>
                <span class="mono muted">{formatCm(f.unitCm)} / {ev.windows.length} {ev.windows.length === 1 ? 'pose' : 'poses'}</span>
                <span class="foot">
                  {#if ev.id === app.activeId}<span class="chip">Em uso</span>{/if}
                  <span class="mono muted">{n} {n === 1 ? 'sessão' : 'sessões'}</span>
                </span>
              </div>
            </button>
            <button class="edit" aria-label="Editar {ev.name}" onclick={() => go({ name: 'setup', id: ev.id })}>
              <Icon name="edit" size={20} />
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>

  <footer class="dock">
    <button class="btn btn-accent new" onclick={() => go({ name: 'setup', id: null })}>
      <Icon name="plus" stroke={2} />
      Novo evento
    </button>
  </footer>
</section>

<style>
  .heading {
    flex: 1;
    display: grid;
    gap: 8px;
  }
  .list {
    list-style: none;
    margin: 8px 16px 24px;
    border-radius: var(--r-xs);
    box-shadow: inset 0 0 0 1px var(--line-strong);
    background: var(--veil);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  }
  .row {
    position: relative;
    display: flex;
    align-items: stretch;
  }
  .row + .row {
    border-top: 1px dashed var(--line-strong);
  }
  .row.active::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 2px;
    background: var(--accent);
    box-shadow: 0 0 24px rgba(var(--accent-rgb), 0.6);
  }
  .row-main {
    flex: 1;
    min-width: 0;
    display: flex;
    gap: 16px;
    padding: 16px;
    text-align: left;
    transition: background 0.2s var(--ease-out);
  }
  .row-main:active {
    background: var(--tint);
  }
  .thumb {
    flex: none;
    width: 88px;
    height: 104px;
    display: grid;
    place-items: center;
    border-radius: var(--r-xs);
    background: var(--tint);
    box-shadow: inset 0 0 0 1px var(--line);
  }
  .thumb :global(.thumb-canvas) {
    height: 80px;
    width: auto;
    box-shadow: var(--drop-sm);
  }
  .thumb :global(.thumb-canvas.wide) {
    width: 72px;
    height: auto;
  }
  .info {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: flex-start;
    gap: 4px;
    min-width: 0;
  }
  .name-line {
    display: flex;
    align-items: center;
    gap: 8px;
    max-width: 100%;
  }
  .swatch {
    flex: none;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--accent);
  }
  .info strong {
    font-size: 18px;
    letter-spacing: -0.025em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .foot {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 4px;
    min-height: 24px;
  }
  .edit {
    width: 56px;
    display: grid;
    place-items: center;
    color: var(--muted);
    border-left: 1px dashed var(--line-strong);
  }
  .empty {
    display: grid;
    justify-items: center;
    text-align: center;
    gap: 16px;
    padding: 12vh 32px 32px;
  }
  .empty p {
    max-width: 32ch;
    font-size: 16px;
    line-height: 1.5;
  }
  .bracket {
    position: relative;
    width: 160px;
    height: 160px;
    display: grid;
    place-items: center;
    border: 1px dashed rgba(var(--accent-rgb), 0.7);
    background: rgba(var(--accent-rgb), 0.04);
    margin-bottom: 16px;
    box-shadow: 0 4px 100px rgba(var(--accent-rgb), 0.22), 0 2px 12px rgba(0, 0, 0, 0.3);
  }
  .c {
    position: absolute;
    width: 16px;
    height: 16px;
    border: 0 solid var(--accent);
  }
  .tl { top: -1px; left: -1px; border-top-width: 2px; border-left-width: 2px; }
  .tr { top: -1px; right: -1px; border-top-width: 2px; border-right-width: 2px; }
  .bl { bottom: -1px; left: -1px; border-bottom-width: 2px; border-left-width: 2px; }
  .br { bottom: -1px; right: -1px; border-bottom-width: 2px; border-right-width: 2px; }
  .empty-art {
    width: 56px;
    padding: 4px 4px 16px;
    display: grid;
    gap: 4px;
    transform: rotate(-6deg);
  }
  .empty-art i {
    height: 32px;
    background: #e4e4e2;
  }
  .dock {
    padding: 16px 16px calc(var(--safe-bottom) + 16px);
    background: linear-gradient(transparent, var(--graphite) 32%);
  }
  .new {
    width: 100%;
    min-height: 56px;
  }
</style>
