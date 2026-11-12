<script lang="ts">
  import { slide } from 'svelte/transition';
  import { app, back, go, newEventDraft, saveEvent, setActive, toast, home } from '../state.svelte';
  import { deleteEvent, type BoothEvent } from '../core/db';
  import { FILTERS } from '../core/compose';
  import { FORMATS, FORMAT_ORDER, defaultWindows, formatCm, formatPx, type FormatId } from '../core/formats';
  import { ACCENTS, accentVars, analyzeFrame, cropLeftHalf } from '../core/util';
  import Icon from '../ui/Icon.svelte';
  import Segmented from '../ui/Segmented.svelte';
  import Toggle from '../ui/Toggle.svelte';
  import HoldButton from '../ui/HoldButton.svelte';
  import UnitPreview from '../ui/UnitPreview.svelte';
  import FrameEditor from './FrameEditor.svelte';

  let { id }: { id: string | null } = $props();

  const existing = app.events.find((e) => e.id === id);
  let ev: BoothEvent = $state(existing ? { ...existing, windows: existing.windows.map((w) => ({ ...w })) } : newEventDraft());
  const isNew = !existing;

  const spec = $derived(FORMATS[ev.format]);
  let report: Awaited<ReturnType<typeof analyzeFrame>> | null = $state(null);
  let analyzing = $state(false);
  let editing = $state(false);
  let fileInput: HTMLInputElement;
  let poses = $state(existing ? existing.windows.length : 3);

  async function analyze(blob: Blob) {
    analyzing = true;
    try {
      report = await analyzeFrame(blob, spec.unitPx, spec.maxPoses);
      if (report.windows.length) {
        ev.windows = report.windows;
      } else {
        ev.windows = defaultWindows(ev.format, Math.min(poses, spec.maxPoses));
      }
    } catch {
      toast('Não foi possível ler este arquivo. Envie um PNG com transparência.', 'error', 3600);
      ev.frame = null;
      ev.frameName = null;
      report = null;
    } finally {
      analyzing = false;
    }
  }

  async function pickFrame(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    (e.currentTarget as HTMLInputElement).value = '';
    if (!file) return;
    if (file.type && file.type !== 'image/png') {
      toast('A moldura precisa ser PNG com transparência.', 'error', 3400);
      return;
    }
    let frame: Blob = file;
    try {
      const probe = await createImageBitmap(file);
      const ratio = probe.width / probe.height;
      probe.close();
      const near = (a: number, b: number) => Math.abs(a - b) / b <= 0.02;
      const cur = FORMATS[ev.format];
      const unitRatio = (id: FormatId) => FORMATS[id].unitPx[0] / FORMATS[id].unitPx[1];
      if (cur.copies === 2 && near(ratio, cur.sheetPx[0] / cur.sheetPx[1]) && !near(ratio, unitRatio(ev.format))) {
        frame = await cropLeftHalf(file, cur.unitPx);
        toast(`Arte com duas cópias detectada. Usando só uma ${cur.name.toLowerCase()}; o app duplica na impressão.`, 'info', 4200);
      } else if (!near(ratio, unitRatio(ev.format))) {
        const best = FORMAT_ORDER.reduce((a, b) => (Math.abs(ratio - unitRatio(b)) < Math.abs(ratio - unitRatio(a)) ? b : a));
        if (near(ratio, unitRatio(best))) {
          ev.format = best;
          poses = Math.min(poses, FORMATS[best].maxPoses);
          toast(`Formato ajustado para ${FORMATS[best].name} ${formatCm(FORMATS[best].unitCm)} pelo tamanho do PNG`, 'info', 3400);
        }
      }
    } catch {
      /* segue para a análise */
    }
    ev.frame = frame;
    ev.frameName = file.name;
    await analyze(frame);
  }

  function removeFrame() {
    ev.frame = null;
    ev.frameName = null;
    report = null;
    ev.windows = defaultWindows(ev.format, Math.min(poses, spec.maxPoses));
  }

  function setFormat(f: FormatId) {
    if (f === ev.format) return;
    ev.format = f;
    const max = FORMATS[f].maxPoses;
    poses = max === 1 ? 1 : poses < 2 ? 3 : Math.min(poses, max);
    if (ev.frame) analyze(ev.frame);
    else ev.windows = defaultWindows(f, poses);
  }

  function setPoses(n: number) {
    poses = n;
    ev.windows = defaultWindows(ev.format, n);
  }

  let saving = $state(false);
  async function save(openBooth: boolean) {
    if (!ev.name.trim()) {
      toast('Dê um nome ao evento para salvar.', 'error');
      nameInput?.focus();
      return;
    }
    saving = true;
    ev.name = ev.name.trim();
    await saveEvent(ev);
    saving = false;
    if (openBooth) {
      await setActive(ev.id);
      home();
      go({ name: 'booth' });
    } else {
      toast('Evento salvo');
      back();
    }
  }

  async function remove() {
    await deleteEvent(ev.id);
    if (app.activeId === ev.id) await setActive(null);
    app.events = app.events.filter((e) => e.id !== ev.id);
    toast('Evento excluído');
    home();
  }

  let nameInput: HTMLInputElement | undefined = $state();
  const reportLine = $derived.by(() => {
    if (!report) return null;
    const n = report.windows.length;
    if (!n) return { tone: 'warn', text: 'Nenhuma janela transparente encontrada. Usando o layout padrão até você ajustar.' };
    return { tone: 'ok', text: `${n} ${n === 1 ? 'janela encontrada' : 'janelas encontradas'}, ${n} ${n === 1 ? 'pose' : 'poses'} por sessão.` };
  });
</script>

<section class="screen" style={accentVars(ev.accent)}>
  <header class="topbar">
    <button class="icon-btn" aria-label="Voltar" onclick={() => back()}><Icon name="back" /></button>
    <h1 class="title-md">{isNew ? 'Novo evento' : 'Editar evento'}</h1>
  </header>

  <div class="scroll">
    <div class="form">
      <label class="field">
        <span>Nome do evento</span>
        <input class="input big" bind:this={nameInput} bind:value={ev.name} placeholder="Ex.: Festa de fim de ano Aço Cearense" maxlength="60" enterkeyhint="done" />
      </label>

      <div class="field">
        <span>Cor de destaque</span>
        <div class="swatches">
          {#each ACCENTS as c (c)}
            <button
              class="sw"
              class:on={ev.accent.toLowerCase() === c.toLowerCase()}
              style="background:{c}"
              aria-label="Cor {c}"
              onclick={() => (ev.accent = c)}
            ></button>
          {/each}
          <label class="sw custom" class:on={!ACCENTS.some((c) => c.toLowerCase() === ev.accent.toLowerCase())} aria-label="Outra cor">
            <input type="color" bind:value={ev.accent} />
            <Icon name="plus" size={20} />
          </label>
        </div>
      </div>

      <div class="field">
        <span>Formato</span>
        <div class="formats" role="radiogroup" aria-label="Formato">
          {#each FORMAT_ORDER as fid (fid)}
            {@const f = FORMATS[fid]}
            <button class="fmt" class:on={ev.format === fid} role="radio" aria-checked={ev.format === fid} onclick={() => setFormat(fid)}>
              <span class="sheet" style="aspect-ratio:{f.sheetCm[0]}/{f.sheetCm[1]}">
                {#each f.placements as _, i (i)}<i style="flex:1"></i>{/each}
              </span>
              <span class="fmt-name">{f.name}</span>
              <span class="fmt-cm mono">{formatCm(f.unitCm)}</span>
              <span class="fmt-hint">{f.hint}</span>
            </button>
          {/each}
        </div>
      </div>

      <div class="field">
        <span>Moldura</span>
        <div class="frame-box">
          <span class="c tl"></span><span class="c tr"></span><span class="c bl"></span><span class="c br"></span>
          <div class="frame-preview" class:wide={spec.landscape}>
            <UnitPreview class="fp" format={ev.format} windows={ev.windows} frame={ev.frame} eventName={ev.name} accent={ev.accent} resolution={0.3} />
            {#if analyzing}<div class="scanning"><span></span></div>{/if}
          </div>
          <div class="frame-side">
            <p class="spec">
              <span class="muted small">Arquivo da moldura</span>
              <strong>{formatPx(spec.unitPx)}</strong>
              <span class="mono muted">{formatCm(spec.unitCm)} / 300 dpi / PNG RGB</span>
            </p>
            <input bind:this={fileInput} type="file" accept="image/png" hidden onchange={pickFrame} />
            <button class="btn btn-ghost" onclick={() => fileInput.click()}>
              <Icon name="upload" size={20} />{ev.frame ? 'Trocar PNG' : 'Enviar PNG'}
            </button>
            {#if ev.frame}
              <button class="link" onclick={removeFrame}>Usar sem moldura</button>
            {/if}
          </div>
        </div>

        {#if ev.frame && reportLine}
          <div class="report {reportLine.tone}" transition:slide>
            <Icon name={reportLine.tone === 'ok' ? 'check' : 'alert'} size={20} stroke={2.2} />
            <div>
              <p>{reportLine.text}</p>
              {#if report?.ratioOff}<p class="muted small">A proporção do PNG ({report.dims[0]} × {report.dims[1]} px) não bate com o formato. A arte vai ser esticada; confira o formato escolhido.</p>
              {:else if report?.lowRes}<p class="muted small">O PNG tem {report.dims[0]} × {report.dims[1]} px, abaixo de 300 dpi. A impressão pode perder nitidez.</p>{/if}
              {#if report?.outerTransparent}<p class="muted small">O fundo externo transparente foi ignorado. Na impressão ele sai branco.</p>{/if}
            </div>
          </div>
        {/if}

        {#if !ev.frame && spec.maxPoses > 1}
          <div class="poses">
            <span class="muted">Poses por sessão</span>
            <div class="stepper">
              {#each Array.from({ length: spec.maxPoses }, (_, i) => i + 1) as n (n)}
                <button class:on={poses === n} onclick={() => setPoses(n)}>{n}</button>
              {/each}
            </div>
          </div>
        {/if}

        <button class="btn btn-ghost wide" onclick={() => (editing = true)}>
          <Icon name="frame" size={20} />Ajustar janelas
        </button>
      </div>

      <div class="group">
        <h2 class="title-lg">Captura</h2>
        <div class="field">
          <span>Contagem antes de cada foto</span>
          <Segmented label="Contagem" bind:value={ev.countdown} options={[{ value: 0, label: 'Sem' }, { value: 3, label: '3 s' }, { value: 5, label: '5 s' }, { value: 7, label: '7 s' }]} />
        </div>
        <div class="field">
          <span>Timer de grupo</span>
          <Segmented label="Timer de grupo" bind:value={ev.groupTimer} options={[{ value: 10, label: '10 s' }, { value: 15, label: '15 s' }, { value: 20, label: '20 s' }]} />
        </div>
        <div class="field">
          <span>Câmera</span>
          <Segmented label="Câmera" bind:value={ev.camera} options={[{ value: 'environment', label: 'Traseira' }, { value: 'user', label: 'Frontal' }]} />
        </div>
        <div class="toggles">
          <Toggle bind:checked={ev.flash} label="Flash" hint="Só na câmera traseira, quando o aparelho tem flash" />
          {#if ev.camera === 'user'}
            <Toggle bind:checked={ev.mirrorPreview} label="Espelhar a prévia" hint="A foto impressa sai sempre sem espelho" />
          {/if}
        </div>
      </div>

      <div class="group">
        <h2 class="title-lg">Entrega</h2>
        <div class="field">
          <span>Filtro inicial</span>
          <Segmented label="Filtro inicial" bind:value={ev.filter} options={FILTERS.map((f) => ({ value: f.id, label: f.name }))} />
        </div>
        <div class="toggles">
          <Toggle bind:checked={ev.autoSave} label="Salvar na galeria ao aprovar" hint="Cada folha aprovada vai para o álbum Cabine Mude" />
        </div>
      </div>

      {#if !isNew}
        <div class="danger">
          <HoldButton onconfirm={remove}><Icon name="trash" size={20} />Excluir evento e fotos</HoldButton>
        </div>
      {/if}
    </div>
  </div>

  <footer class="dock">
    {#if isNew}
      <button class="btn btn-accent grow" disabled={saving} onclick={() => save(true)}>Criar e abrir câmera</button>
    {:else}
      <button class="btn btn-ghost" disabled={saving} onclick={() => save(false)}>Salvar</button>
      <button class="btn btn-accent grow" disabled={saving} onclick={() => save(true)}>Salvar e abrir câmera</button>
    {/if}
  </footer>

  {#if editing}
    <FrameEditor
      format={ev.format}
      frame={ev.frame}
      windows={ev.windows}
      accent={ev.accent}
      eventName={ev.name}
      oncancel={() => (editing = false)}
      ondone={(w) => {
        ev.windows = w;
        if (!ev.frame) poses = w.length;
        editing = false;
      }}
    />
  {/if}
</section>

<style>
  .form {
    display: grid;
    gap: 32px;
    padding: 8px 16px 40px;
  }
  .big {
    font-size: 20px;
    min-height: 64px;
  }
  .swatches {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
  }
  .sw {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    box-shadow: inset 0 0 0 1px var(--line-strong);
    transition: transform 0.3s var(--ease-spring), box-shadow 0.2s var(--ease-out);
    position: relative;
  }
  .sw.on {
    transform: scale(1.1);
    box-shadow: 0 0 0 4px var(--graphite), 0 0 0 5px var(--text), 0 0 24px rgba(var(--accent-rgb), 0.5);
  }
  .custom {
    display: grid;
    place-items: center;
    background: conic-gradient(#ff5e1f, #ffc531, #3ddc97, #33b6ff, #7a6cff, #ff4fa3, #ff5e1f);
    color: #fff;
    cursor: pointer;
  }
  .custom input {
    position: absolute;
    inset: 0;
    opacity: 0;
    width: 100%;
    height: 100%;
  }
  .formats {
    display: grid;
    grid-template-columns: 1fr 1fr;
    border-radius: var(--r-xs);
    box-shadow: inset 0 0 0 1px var(--line-strong);
    overflow: hidden;
    background: var(--veil);
  }
  .fmt {
    position: relative;
    display: grid;
    grid-template-rows: 64px auto auto auto;
    justify-items: start;
    align-content: start;
    gap: 4px;
    padding: 16px;
    text-align: left;
    transition: background 0.2s var(--ease-out);
  }
  .fmt:nth-child(even) {
    border-left: 1px solid var(--line-strong);
  }
  .fmt:nth-child(n + 3) {
    border-top: 1px solid var(--line-strong);
  }
  .fmt::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 2px;
    background: var(--accent);
    transform: scaleX(0);
    transition: transform 0.3s var(--ease-out);
  }
  .fmt.on {
    background: rgba(var(--accent-rgb), 0.12);
  }
  .fmt.on::after {
    transform: scaleX(1);
  }
  .sheet {
    align-self: center;
    height: 48px;
    display: flex;
    gap: 2px;
    padding: 2px;
    background: #fff;
    margin-bottom: 8px;
    box-shadow: var(--drop-sm);
  }
  .sheet i {
    background: #e4e4e2;
    transition: background 0.2s var(--ease-out);
  }
  .fmt.on .sheet i {
    background: var(--accent);
  }
  .fmt-name {
    font-weight: 500;
    font-size: 18px;
    letter-spacing: -0.025em;
  }
  .fmt-cm {
    color: var(--text);
  }
  .fmt-hint {
    font-size: 13px;
    color: var(--muted);
    line-height: 1.2;
  }
  .frame-box {
    position: relative;
    display: flex;
    gap: 16px;
    align-items: center;
    padding: 24px;
    border: 1px dashed rgba(var(--accent-rgb), 0.6);
    background: rgba(var(--accent-rgb), 0.03);
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
  .frame-preview {
    position: relative;
    flex: none;
    width: 40%;
    max-width: 176px;
    display: grid;
    place-items: center;
  }
  .frame-preview.wide {
    width: 48%;
    max-width: 232px;
  }
  .frame-preview :global(.fp) {
    width: 100%;
    height: auto;
    box-shadow: 0 4px 100px rgba(var(--accent-rgb), 0.22), 0 2px 12px rgba(0, 0, 0, 0.3), var(--drop-lg);
  }
  .scanning {
    position: absolute;
    inset: 0;
    overflow: hidden;
  }
  .scanning span {
    position: absolute;
    left: 0;
    right: 0;
    height: 32%;
    background: linear-gradient(transparent, rgba(var(--accent-rgb), 0.5), transparent);
    animation: scan 0.9s var(--ease-out) infinite;
  }
  @keyframes scan {
    from { transform: translateY(-100%); }
    to { transform: translateY(320%); }
  }
  .frame-side {
    flex: 1;
    display: grid;
    gap: 16px;
    justify-items: start;
  }
  .spec {
    display: grid;
    gap: 4px;
  }
  .spec strong {
    font-size: 24px;
    letter-spacing: -0.03em;
  }
  .frame-side .btn {
    min-height: 48px;
    padding: 0 16px;
  }
  .link {
    color: var(--muted);
    text-decoration: underline;
    text-decoration-color: var(--line-strong);
    text-underline-offset: 4px;
    font-size: 14px;
    min-height: 48px;
  }
  .report {
    display: flex;
    gap: 12px;
    padding: 16px;
    border-radius: var(--r-xs);
    box-shadow: inset 0 0 0 1px rgba(63, 214, 143, 0.3);
    background: rgba(63, 214, 143, 0.06);
    font-size: 15px;
    line-height: 1.4;
  }
  .report :global(svg) {
    flex: none;
    color: var(--ok);
  }
  .report.warn {
    box-shadow: inset 0 0 0 1px rgba(255, 197, 49, 0.3);
    background: rgba(255, 197, 49, 0.06);
  }
  .report.warn :global(svg) {
    color: #ffc531;
  }
  .report div {
    display: grid;
    gap: 4px;
  }
  .poses {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }
  .stepper {
    display: flex;
    gap: 8px;
  }
  .stepper button {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    font-weight: 500;
    font-size: 18px;
    box-shadow: inset 0 0 0 1px var(--line-strong);
    transition: background 0.2s var(--ease-out), color 0.2s;
  }
  .stepper button.on {
    background: var(--accent);
    color: var(--on-accent);
    box-shadow: var(--glass);
  }
  .wide {
    width: 100%;
  }
  .group {
    display: grid;
    gap: 24px;
    padding-top: 32px;
    border-top: 1px dashed var(--line-strong);
  }
  .toggles {
    display: grid;
  }
  .toggles > :global(* + *) {
    border-top: 1px solid var(--line);
  }
  .danger {
    padding-top: 16px;
  }
  .dock {
    display: flex;
    gap: 8px;
    padding: 16px 16px calc(var(--safe-bottom) + 16px);
    background: var(--veil-strong);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border-top: 1px solid var(--line);
  }
  .grow {
    flex: 1;
  }
</style>
