<script lang="ts">
  import { onDestroy } from 'svelte';
  import { back, toast } from '../state.svelte';
  import { listCameras, preferExternal, type CameraInfo } from '../core/camera';
  import { exportSheet, makeCanvas, renderUnit } from '../core/compose';
  import { FORMATS, FORMAT_ORDER, defaultWindows } from '../core/formats';
  import { formatBytes } from '../core/util';
  import { shareFile, storageEstimate } from '../platform';
  import { TOTEM } from '../target';
  import Icon from '../ui/Icon.svelte';

  type Row = { label: string; value: string; tone?: 'ok' | 'warn' | 'bad' };
  type Section = { title: string; rows: Row[] };

  let sections: Section[] = $state([]);
  let running = $state(false);
  let step = $state('');
  let video: HTMLVideoElement;
  let stream: MediaStream | null = null;

  const RESOLUTIONS = [
    [640, 480],
    [1280, 720],
    [1920, 1080],
    [2560, 1440],
    [3840, 2160],
  ];

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  function stopStream() {
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
  }

  onDestroy(stopStream);

  function device(): Section {
    const ua = navigator.userAgent;
    const android = ua.match(/Android ([\d.]+)/)?.[1];
    const chrome = ua.match(/Chrome\/([\d.]+)/)?.[1];
    const major = chrome ? parseInt(chrome, 10) : 0;
    const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    const model = ua.match(/Android [\d.]+; ([^)]+)\)/)?.[1]?.replace(/ Build\/.*/, '');
    return {
      title: 'Aparelho',
      rows: [
        { label: 'Versão', value: TOTEM ? 'Cabine Totem' : 'Cabine celular' },
        { label: 'Android', value: android ?? 'não informado' },
        { label: 'Modelo', value: model ?? 'não informado' },
        {
          label: 'Navegador interno',
          value: chrome ? `Chrome ${chrome}` : 'não informado',
          tone: major >= 90 ? 'ok' : major >= 70 ? 'warn' : 'bad',
        },
        { label: 'Memória', value: mem ? `${mem} GB ou mais` : 'não informada', tone: mem ? (mem >= 4 ? 'ok' : mem >= 2 ? 'warn' : 'bad') : undefined },
        { label: 'Núcleos', value: String(navigator.hardwareConcurrency ?? '?') },
        { label: 'Tela', value: `${screen.width} × ${screen.height} px, densidade ${window.devicePixelRatio}` },
        { label: 'Área do app', value: `${window.innerWidth} × ${window.innerHeight} px` },
      ],
    };
  }

  async function measureFps(v: HTMLVideoElement, ms = 2000): Promise<number> {
    const rvfc = (v as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number }).requestVideoFrameCallback;
    let frames = 0;
    const start = performance.now();
    if (rvfc) {
      await new Promise<void>((done) => {
        const cb = () => {
          frames++;
          if (performance.now() - start < ms) rvfc.call(v, cb);
          else done();
        };
        rvfc.call(v, cb);
      });
    } else {
      let last = -1;
      await new Promise<void>((done) => {
        const loop = () => {
          if (v.currentTime !== last) {
            frames++;
            last = v.currentTime;
          }
          if (performance.now() - start < ms) requestAnimationFrame(loop);
          else done();
        };
        requestAnimationFrame(loop);
      });
    }
    return (frames * 1000) / (performance.now() - start);
  }

  async function cameras(): Promise<Section[]> {
    const out: Section[] = [];
    if (!navigator.mediaDevices?.getUserMedia) {
      return [{ title: 'Câmera', rows: [{ label: 'Acesso à câmera', value: 'indisponível neste navegador', tone: 'bad' }] }];
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      s.getTracks().forEach((t) => t.stop());
    } catch (e) {
      return [{ title: 'Câmera', rows: [{ label: 'Permissão', value: `negada ou sem câmera (${(e as DOMException).name})`, tone: 'bad' }] }];
    }
    const list: CameraInfo[] = await listCameras();
    const pick = preferExternal(list);
    out.push({
      title: 'Câmeras encontradas',
      rows: list.length
        ? list.map((c) => ({ label: c.label, value: c === pick ? 'testada' : '', tone: /brio|logitech/i.test(c.label) ? ('ok' as const) : undefined }))
        : [{ label: 'Nenhuma câmera', value: 'confira o cabo USB', tone: 'bad' as const }],
    });
    if (!pick) return out;

    const rows: Row[] = [];
    for (const [w, h] of RESOLUTIONS) {
      step = `Testando ${w} × ${h}`;
      stopStream();
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { deviceId: { exact: pick.deviceId }, width: { ideal: w }, height: { ideal: h }, frameRate: { ideal: 30 } },
        });
        video.srcObject = stream;
        await video.play().catch(() => undefined);
        await sleep(700);
        const set = stream.getVideoTracks()[0].getSettings();
        const fps = await measureFps(video);
        const got = `${set.width ?? video.videoWidth} × ${set.height ?? video.videoHeight}`;
        rows.push({
          label: `Pedido ${w} × ${h}`,
          value: `entregou ${got}, ${fps.toFixed(0)} qps`,
          tone: fps >= 24 ? 'ok' : fps >= 15 ? 'warn' : 'bad',
        });
      } catch (e) {
        rows.push({ label: `Pedido ${w} × ${h}`, value: `falhou (${(e as DOMException).name})`, tone: 'bad' });
      }
    }
    out.push({ title: `Resoluções de ${pick.label}`, rows });

    const IC = (window as Window & { ImageCapture?: new (t: MediaStreamTrack) => { takePhoto(): Promise<Blob> } }).ImageCapture;
    if (IC && stream) {
      step = 'Testando foto em resolução máxima';
      try {
        const t0 = performance.now();
        const blob = await new IC(stream.getVideoTracks()[0]).takePhoto();
        const bmp = await createImageBitmap(blob);
        out.push({ title: 'Foto direta da câmera', rows: [{ label: 'Resolução', value: `${bmp.width} × ${bmp.height} em ${Math.round(performance.now() - t0)} ms`, tone: 'ok' }] });
        bmp.close();
      } catch {
        out.push({ title: 'Foto direta da câmera', rows: [{ label: 'Resolução', value: 'não suportada; usa o quadro do vídeo', tone: 'warn' }] });
      }
    }
    stopStream();
    return out;
  }

  async function compose(): Promise<Section> {
    const rows: Row[] = [];
    const src = makeCanvas(1920, 1080);
    const ctx = src.getContext('2d') as CanvasRenderingContext2D;
    const g = ctx.createLinearGradient(0, 0, 1920, 1080);
    g.addColorStop(0, '#ff5e1f');
    g.addColorStop(1, '#33b6ff');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 1920, 1080);
    const photo = await createImageBitmap(src as HTMLCanvasElement);
    for (const id of FORMAT_ORDER) {
      step = `Montando folha ${FORMATS[id].name}`;
      await sleep(50);
      const f = FORMATS[id];
      const windows = defaultWindows(id, f.maxPoses > 1 ? 3 : 1);
      const t0 = performance.now();
      const unit = renderUnit({ format: id, windows, photos: windows.map(() => photo), frame: null, filter: 'quente', eventName: 'Teste', accent: '#ff5e1f' });
      const blob = await exportSheet(unit, id);
      const ms = performance.now() - t0;
      rows.push({
        label: id.startsWith('lembranca') ? `${f.name} ${f.landscape ? 'horizontal' : 'vertical'}` : f.name,
        value: `${(ms / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} s, ${formatBytes(blob.size)}`,
        tone: ms < 2500 ? 'ok' : ms < 6000 ? 'warn' : 'bad',
      });
    }
    photo.close();
    return { title: 'Montagem da folha em 300 dpi', rows };
  }

  async function run() {
    running = true;
    sections = [device()];
    try {
      const est = await storageEstimate();
      if (est) sections[0].rows.push({ label: 'Espaço do app', value: `${formatBytes(est.used)} usados de ${formatBytes(est.quota)}` });
      step = 'Abrindo câmera';
      sections = [...sections, ...(await cameras())];
      sections = [...sections, await compose()];
    } catch (e) {
      toast(`O diagnóstico parou: ${(e as Error).message}`, 'error', 4000);
    } finally {
      stopStream();
      running = false;
      step = '';
    }
  }

  function report() {
    const lines = [`Diagnóstico Cabine Mude! ${new Date().toLocaleString('pt-BR')}`, ''];
    for (const s of sections) {
      lines.push(s.title.toUpperCase());
      for (const r of s.rows) lines.push(`- ${r.label}${r.value ? `: ${r.value}` : ''}`);
      lines.push('');
    }
    return lines.join('\n');
  }

  async function share() {
    try {
      await shareFile(new Blob([report()], { type: 'text/plain' }), 'diagnostico-cabine.txt', 'Diagnóstico da cabine');
    } catch {
      /* cancelado */
    }
  }
</script>

<section class="screen">
  <header class="topbar">
    <button class="icon-btn" aria-label="Voltar" onclick={() => back()} disabled={running}><Icon name="back" /></button>
    <h1 class="title-md">Diagnóstico</h1>
  </header>

  <div class="scroll">
    <div class="body">
      <p class="muted intro">Testa este aparelho e a câmera conectada: resoluções, fluidez da imagem e o tempo para montar cada folha. Leva cerca de 30 segundos.</p>

      <!-- svelte-ignore a11y_media_has_caption -->
      <video bind:this={video} class="probe" class:on={running} playsinline muted></video>

      {#if running}
        <p class="step"><span class="spinner"></span>{step}</p>
      {/if}

      {#each sections as s (s.title)}
        <div class="block">
          <h2>{s.title}</h2>
          {#each s.rows as r (r.label)}
            <div class="row">
              <span>{r.label}</span>
              <span class="val {r.tone ?? ''}">{r.value}</span>
            </div>
          {/each}
        </div>
      {/each}
    </div>
  </div>

  <footer class="dock">
    {#if sections.length && !running}
      <button class="btn" onclick={share}><Icon name="share" size={20} />Enviar relatório</button>
    {/if}
    <button class="btn btn-accent grow" onclick={run} disabled={running}>{running ? 'Testando' : sections.length ? 'Rodar de novo' : 'Rodar diagnóstico'}</button>
  </footer>
</section>

<style>
  .body {
    display: grid;
    grid-gap: 16px;
    gap: 16px;
    padding: 0 16px 32px;
  }
  .intro {
    line-height: 1.5;
  }
  .probe {
    display: none;
    width: 100%;
    max-height: 240px;
    border-radius: var(--r-sm);
    background: #000;
    object-fit: contain;
  }
  .probe.on {
    display: block;
  }
  .step {
    display: flex;
    align-items: center;
    font-weight: 500;
  }
  .spinner {
    width: 16px;
    height: 16px;
    margin-right: 8px;
    border-radius: 50%;
    border: 2px solid var(--line-strong);
    border-top-color: var(--accent);
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  .block {
    display: grid;
    padding: 16px;
    border-radius: var(--r-xs);
    background: var(--panel-solid);
    box-shadow: inset 0 0 0 1px var(--line);
  }
  h2 {
    font-size: 18px;
    margin-bottom: 8px;
  }
  .row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding: 8px 0;
    border-top: 1px solid var(--line);
    font-size: 15px;
  }
  .row span:first-child {
    margin-right: 16px;
  }
  .val {
    text-align: right;
    font-family: var(--mono);
    font-size: 13px;
    color: var(--muted);
  }
  .val.ok {
    color: var(--ok);
  }
  .val.warn {
    color: #e0a800;
  }
  .val.bad {
    color: var(--danger);
  }
  .dock {
    display: flex;
    padding: 16px 16px calc(var(--safe-bottom) + 16px);
    border-top: 1px solid var(--line);
  }
  .dock .btn + .btn {
    margin-left: 8px;
  }
  .grow {
    flex: 1;
  }
</style>
