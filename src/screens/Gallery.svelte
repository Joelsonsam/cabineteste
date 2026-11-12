<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { Zip, ZipPassThrough } from 'fflate';
  import { activeEvent, back, toast } from '../state.svelte';
  import { clearSessions, db, sessionsFor, type BoothSession } from '../core/db';
  import { FORMATS } from '../core/formats';
  import { fileStamp, formatBytes, slug } from '../core/util';
  import { printSheet, saveToGallery, shareFile } from '../platform';
  import Icon from '../ui/Icon.svelte';
  import HoldButton from '../ui/HoldButton.svelte';

  const ev = activeEvent()!;
  const spec = FORMATS[ev.format];

  type Item = BoothSession & { url: string };
  let items: Item[] = $state([]);
  let loaded = $state(false);
  let open: Item | null = $state(null);
  let openUrl: string | null = $state(null);
  let menu = $state(false);
  let exporting = $state(0);

  const total = $derived(items.reduce((n, s) => n + s.sheet.size, 0));
  const prints = $derived(items.reduce((n, s) => n + s.prints, 0));

  onMount(() => {
    load();
    const onBack = (e: Event) => {
      if (open) {
        e.preventDefault();
        close();
      } else if (menu) {
        e.preventDefault();
        menu = false;
      }
    };
    window.addEventListener('cabine:back', onBack);
    return () => window.removeEventListener('cabine:back', onBack);
  });

  onDestroy(() => {
    items.forEach((i) => URL.revokeObjectURL(i.url));
    if (openUrl) URL.revokeObjectURL(openUrl);
  });

  async function load() {
    items.forEach((i) => URL.revokeObjectURL(i.url));
    const list = await sessionsFor(ev.id);
    items = list.map((s) => ({ ...s, url: URL.createObjectURL(s.thumb) }));
    loaded = true;
  }

  function show(item: Item) {
    open = item;
    if (openUrl) URL.revokeObjectURL(openUrl);
    openUrl = URL.createObjectURL(item.sheet);
  }

  function close() {
    open = null;
  }

  const name = (s: BoothSession) => `${slug(ev.name)}-${fileStamp(new Date(s.createdAt))}.jpg`;
  const time = (t: number) => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const day = (t: number) => new Date(t).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });

  async function reprint(s: Item) {
    try {
      await printSheet(s.sheet, { widthCm: spec.sheetCm[0], heightCm: spec.sheetCm[1], jobName: name(s) });
      s.prints += 1;
      await db.sessions.update(s.id, { prints: s.prints });
    } catch {
      toast('A impressão não abriu. Confira a impressora.', 'error');
    }
  }

  async function save(s: Item) {
    try {
      await saveToGallery(s.sheet, name(s));
      s.savedToGallery = true;
      await db.sessions.update(s.id, { savedToGallery: true });
      toast('Salva na galeria');
    } catch {
      toast('Não foi possível salvar na galeria.', 'error');
    }
  }

  async function share(s: Item) {
    try {
      await shareFile(s.sheet, name(s), ev.name);
    } catch {
      /* cancelado */
    }
  }

  async function remove(s: Item) {
    await db.sessions.delete(s.id);
    URL.revokeObjectURL(s.url);
    items = items.filter((i) => i.id !== s.id);
    close();
    toast('Sessão apagada');
  }

  async function exportZip() {
    menu = false;
    if (!items.length) return;
    exporting = 0.01;
    try {
      const chunks: Uint8Array[] = [];
      const zip = new Zip((err, chunk) => {
        if (err) throw err;
        chunks.push(chunk);
      });
      for (let i = 0; i < items.length; i++) {
        const s = items[items.length - 1 - i];
        const entry = new ZipPassThrough(name(s));
        zip.add(entry);
        entry.push(new Uint8Array(await s.sheet.arrayBuffer()), true);
        exporting = (i + 1) / items.length;
      }
      zip.end();
      const blob = new Blob(chunks as BlobPart[], { type: 'application/zip' });
      await shareFile(blob, `${slug(ev.name)}-${fileStamp()}.zip`, `${ev.name}: ${items.length} fotos`);
    } catch {
      toast('A exportação foi interrompida.', 'error');
    } finally {
      exporting = 0;
    }
  }

  async function clearAll() {
    menu = false;
    await clearSessions(ev.id);
    items.forEach((i) => URL.revokeObjectURL(i.url));
    items = [];
    toast('Galeria do evento limpa');
  }
</script>

<section class="screen">
  <header class="topbar">
    <button class="icon-btn" aria-label="Voltar" onclick={() => back()}><Icon name="back" /></button>
    <h1 class="title-md">Galeria</h1>
    <button class="icon-btn" aria-label="Mais opções" onclick={() => (menu = true)} disabled={!items.length}><Icon name="more" /></button>
  </header>

  <div class="summary">
    <strong>{ev.name}</strong>
    <span class="mono muted">
      {items.length} {items.length === 1 ? 'sessão' : 'sessões'}, {prints} {prints === 1 ? 'impressão' : 'impressões'}{items.length ? `, ${formatBytes(total)}` : ''}
    </span>
  </div>

  <div class="scroll">
    {#if loaded && !items.length}
      <div class="empty">
        <Icon name="gallery" size={32} />
        <p>As sessões aprovadas aparecem aqui para reimprimir ou compartilhar.</p>
        <button class="btn btn-accent" onclick={() => back()}><Icon name="camera" />Voltar à câmera</button>
      </div>
    {:else}
      <ul class="grid" class:wide={spec.landscape}>
        {#each items as s, i (s.id)}
          <li in:fade={{ duration: 200, delay: Math.min(i, 12) * 25 }}>
            <button class="cell" onclick={() => show(s)}>
              <img src={s.url} alt="Sessão das {time(s.createdAt)}" loading="lazy" />
              <span class="meta mono">
                {time(s.createdAt)}
                {#if s.prints}<i><Icon name="print" size={16} stroke={2.2} />{s.prints}</i>{/if}
              </span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>

  {#if exporting}
    <div class="exporting" transition:fade>
      <div class="bar"><span style="transform:scaleX({exporting})"></span></div>
      <p>Preparando o arquivo ZIP</p>
    </div>
  {/if}

  {#if open}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="backdrop" transition:fade={{ duration: 180 }} onclick={close}></div>
    <div class="detail bottom-sheet" transition:fly={{ y: 60, duration: 300 }}>
      <div class="detail-head">
        <span><strong>{time(open.createdAt)}</strong> <span class="muted">{day(open.createdAt)}</span></span>
        <button class="icon-btn" aria-label="Fechar" onclick={close}><Icon name="close" /></button>
      </div>
      <div class="detail-img">
        {#if openUrl}<img class="paper" src={openUrl} alt="Folha da sessão" />{/if}
      </div>
      <div class="detail-actions">
        <button class="btn btn-accent" onclick={() => reprint(open!)}><Icon name="print" size={20} />Reimprimir</button>
        <button class="btn" onclick={() => save(open!)}><Icon name={open.savedToGallery ? 'check' : 'save'} size={20} />Salvar</button>
        <button class="btn" onclick={() => share(open!)}><Icon name="share" size={20} />Enviar</button>
      </div>
      <HoldButton onconfirm={() => remove(open!)} hint="Segure para apagar"><Icon name="trash" size={20} />Apagar sessão</HoldButton>
    </div>
  {/if}

  {#if menu}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="backdrop" transition:fade={{ duration: 180 }} onclick={() => (menu = false)}></div>
    <div class="detail menu bottom-sheet" transition:fly={{ y: 60, duration: 300 }}>
      <button class="btn wide" onclick={exportZip}><Icon name="archive" size={20} />Exportar tudo em ZIP</button>
      <p class="muted small">Gera um arquivo com as {items.length} folhas em 300 dpi para enviar ao Drive, WhatsApp ou e-mail.</p>
      <HoldButton onconfirm={clearAll} hint="Segure para limpar"><Icon name="trash" size={20} />Limpar galeria do evento</HoldButton>
    </div>
  {/if}
</section>

<style>
  .summary {
    display: grid;
    gap: 2px;
    padding: 0 16px 12px;
  }
  .summary strong {
    font-size: 24px;
    font-weight: 500;
    letter-spacing: -0.025em;
  }
  .grid {
    list-style: none;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    padding: 4px 16px calc(var(--safe-bottom) + 24px);
  }
  .grid.wide {
    grid-template-columns: repeat(2, 1fr);
  }
  .cell {
    width: 100%;
    display: grid;
    gap: 4px;
    text-align: left;
  }
  .cell img {
    width: 100%;
    aspect-ratio: var(--ar, auto);
    border-radius: 2px;
    background: var(--paper);
    box-shadow: var(--drop-sm);
    transition: transform 0.2s var(--ease-out);
  }
  .cell:active img {
    transform: scale(0.96);
  }
  .meta {
    display: flex;
    justify-content: space-between;
    font-size: 13px;
    color: var(--muted);
  }
  .meta i {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-style: normal;
    color: var(--text);
  }
  .empty {
    display: grid;
    justify-items: center;
    gap: 16px;
    text-align: center;
    padding: 14vh 32px;
    color: var(--muted);
  }
  .empty p {
    max-width: 28ch;
  }
  .backdrop {
    position: fixed;
    inset: 0;
    background: var(--scrim);
    z-index: 20;
  }
  .detail {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    max-height: 92%;
    display: grid;
    gap: 16px;
    padding: 16px 16px calc(var(--safe-bottom) + 16px);
    background: var(--panel-solid);
    border-radius: var(--r-md) var(--r-md) 0 0;
    z-index: 21;
  }
  .detail-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .detail-img {
    min-height: 0;
    display: grid;
    place-items: center;
    padding: 4px 12px 8px;
  }
  .detail-img img {
    max-width: 100%;
    max-height: 52vh;
    border-radius: 2px;
  }
  .detail-actions {
    display: grid;
    grid-template-columns: 1.3fr 1fr 1fr;
    gap: 8px;
  }
  .detail-actions .btn {
    padding: 0 8px;
    font-size: 15px;
  }
  .menu {
    padding-top: 22px;
  }
  .wide {
    width: 100%;
  }
  .exporting {
    position: fixed;
    inset: 0;
    z-index: 30;
    display: grid;
    place-content: center;
    gap: 16px;
    background: rgba(15, 16, 19, 0.88);
    text-align: center;
  }
  .bar {
    width: 224px;
    height: 4px;
    border-radius: 999px;
    background: var(--raised);
    overflow: hidden;
  }
  .bar span {
    display: block;
    height: 100%;
    background: var(--accent);
    transform-origin: left;
    transition: transform 0.2s;
  }
</style>
