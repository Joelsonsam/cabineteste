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
</script>

<section class="screen">
  <header class="topbar">
    <h1 class="title-xl">Eventos</h1>
    <button class="icon-btn" aria-label="Ajustes" onclick={() => go({ name: 'settings' })}>
      <Icon name="settings" />
    </button>
  </header>

  <div class="scroll">
    {#if sorted.length === 0}
      <div class="empty">
        <div class="empty-art paper">
          <span></span><span></span><span></span>
        </div>
        <h2 class="title-md">Nenhum evento ainda</h2>
        <p class="muted">Cada evento guarda a moldura, o formato e a cor da ativação. Depois é só tocar no evento para abrir a câmera.</p>
      </div>
    {:else}
      <ul class="list">
        {#each sorted as ev (ev.id)}
          {@const f = FORMATS[ev.format]}
          <li class="card" class:active={ev.id === app.activeId} style={accentVars(ev.accent)}>
            <button class="card-main" onclick={() => open(ev.id)}>
              <div class="thumb" class:wide={f.landscape}>
                <UnitPreview
                  class="thumb-canvas"
                  format={ev.format}
                  windows={ev.windows}
                  frame={ev.frame}
                  eventName={ev.name}
                  accent={ev.accent}
                  resolution={0.12}
                />
              </div>
              <div class="info">
                <strong>{ev.name || 'Evento sem nome'}</strong>
                <span class="muted small">{f.name} {formatCm(f.unitCm)}, {ev.windows.length} {ev.windows.length === 1 ? 'pose' : 'poses'}</span>
                <span class="meta small">
                  <i class="dot"></i>
                  {counts[ev.id] ?? 0}
                  {(counts[ev.id] ?? 0) === 1 ? 'sessão' : 'sessões'}
                  {#if ev.id === app.activeId}<em class="live">Em uso</em>{/if}
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
      <Icon name="plus" stroke={2.2} />
      Novo evento
    </button>
  </footer>
</section>

<style>
  .list {
    list-style: none;
    display: grid;
    gap: 12px;
    padding: 4px 16px 24px;
  }
  .card {
    position: relative;
    display: flex;
    align-items: stretch;
    border-radius: var(--r-lg);
    background: var(--panel-solid);
    box-shadow: inset 0 0 0 1px var(--line);
    overflow: hidden;
  }
  .card.active {
    box-shadow: inset 0 0 0 2px var(--accent);
  }
  .card-main {
    flex: 1;
    min-width: 0;
    display: flex;
    gap: 16px;
    padding: 12px;
    text-align: left;
    transition: transform 0.2s var(--ease-out);
  }
  .card-main:active {
    transform: scale(0.98);
  }
  .thumb {
    flex: none;
    width: 72px;
    height: 96px;
    display: grid;
    place-items: center;
    border-radius: 8px;
    background: #1d1e22;
    padding: 4px;
  }
  .thumb.wide {
    width: 96px;
  }
  .thumb :global(.thumb-canvas) {
    height: 80px;
    width: auto;
    box-shadow: 0 6px 14px rgba(0, 0, 0, 0.5);
  }
  .thumb.wide :global(.thumb-canvas) {
    width: 80px;
    height: auto;
  }
  .info {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 4px;
    min-width: 0;
  }
  .info strong {
    font-size: 19px;
    font-weight: 680;
    font-stretch: 90%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .meta {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 6px;
    color: var(--muted);
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--accent);
  }
  .live {
    font-style: normal;
    font-weight: 640;
    font-size: 12.5px;
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--accent);
    color: var(--on-accent);
    margin-left: 4px;
  }
  .edit {
    width: 56px;
    display: grid;
    place-items: center;
    color: var(--muted);
    border-left: 1px solid var(--line);
  }
  .empty {
    display: grid;
    justify-items: center;
    text-align: center;
    gap: 12px;
    padding: 12vh 32px 32px;
  }
  .empty p {
    max-width: 30ch;
  }
  .empty-art {
    width: 72px;
    padding: 4px 4px 16px;
    display: grid;
    gap: 4px;
    transform: rotate(-6deg);
    margin-bottom: 18px;
  }
  .empty-art span {
    height: 48px;
    background: #d9d5cc;
  }
  .dock {
    padding: 12px 16px calc(var(--safe-bottom) + 16px);
    background: linear-gradient(transparent, var(--graphite) 30%);
  }
  .new {
    width: 100%;
    min-height: 56px;
    font-size: 17px;
  }
</style>
