<script lang="ts">
  import { onDestroy, onMount, tick as nextTick } from 'svelte';
  import { fade } from 'svelte/transition';
  import { activeEvent, app, go, home, toast } from '../state.svelte';
  import { Camera, listCameras, preferExternal } from '../core/camera';
  import { coverRect, exportSheet, printJob, renderUnit, thumbnail, FILTERS, type FilterId } from '../core/compose';
  import { db, uid, type BoothSession } from '../core/db';
  import { FORMATS } from '../core/formats';
  import { resolutionSize, rotateBitmap } from '../core/totem';
  import { shutter, tick } from '../core/sound';
  import { fileStamp, slug, vibrate } from '../core/util';
  import { isNative, printSheet, saveToGallery } from '../platform';
  import UnitPreview from '../ui/UnitPreview.svelte';
  import PinPad from '../ui/PinPad.svelte';
  import Icon from '../ui/Icon.svelte';

  const ev = activeEvent()!;
  const spec = FORMATS[ev.format];
  const prefs = app.totem;

  type Phase = 'attract' | 'live' | 'countdown' | 'review' | 'building' | 'done';
  let phase: Phase = $state('attract');
  let photos: (ImageBitmap | null)[] = $state(ev.windows.map(() => null));
  let current = $state(0);
  let count = $state(0);
  let flashPulse = $state(0);
  let filter: FilterId = $state(ev.filter);
  let retakes = $state(0);
  let cameraReady = $state(false);
  let cameraError: string | null = $state(null);
  let session: BoothSession | null = $state(null);
  let doneUrl: string | null = $state(null);
  let printed = $state(false);
  let pinOpen = $state(false);
  let menuOpen = $state(false);

  let video: HTMLVideoElement;
  const camera = new Camera();
  let frameBmp: ImageBitmap | null = null;
  let token = { cancelled: false };
  let lastTouch = Date.now();
  let phaseAt = Date.now();
  $effect(() => {
    phase;
    phaseAt = Date.now();
  });
  const settled = () => Date.now() - phaseAt > 800;
  let idleTimer = 0;

  let areaW = $state(0);
  let areaH = $state(0);
  const win = $derived(ev.windows[current] ?? ev.windows[0]);
  const stage = $derived.by(() => {
    if (!areaW || !areaH || !win) return { w: 0, h: 0 };
    const ratio = win.w / win.h;
    return areaW / areaH > ratio ? { w: areaH * ratio, h: areaH } : { w: areaW, h: areaW / ratio };
  });
  const swap = prefs.rotation === 90 || prefs.rotation === 270;
  const videoStyle = $derived.by(() => {
    const w = swap ? stage.h : stage.w;
    const h = swap ? stage.w : stage.h;
    return `width:${w}px;height:${h}px;left:${(stage.w - w) / 2}px;top:${(stage.h - h) / 2}px;transform:${prefs.mirror ? 'scaleX(-1) ' : ''}rotate(${prefs.rotation}deg)`;
  });
  let proofW = $state(0);
  let proofH = $state(0);
  const proofFit = $derived.by(() => {
    const [w, h] = spec.unitPx;
    const k = proofW && proofH ? Math.min(proofW / w, proofH / h) : 0;
    return `width:${w * k}px;height:${h * k}px`;
  });
  const canPrint = prefs.guestPrint;
  const countdownSeconds = Math.max(3, ev.countdown || 3);

  async function startCamera() {
    cameraReady = false;
    cameraError = null;
    try {
      let deviceId = prefs.cameraId;
      if (!deviceId) {
        const pick = preferExternal(await listCameras());
        deviceId = pick?.deviceId || null;
      }
      await camera.start('user', video, { deviceId, ...resolutionSize(prefs.resolution) });
      cameraReady = true;
    } catch (e) {
      cameraError = (e as Error).message;
    }
  }

  function touch() {
    lastTouch = Date.now();
  }

  function checkIdle() {
    const idle = (Date.now() - lastTouch) / 1000;
    if (pinOpen || menuOpen) return;
    if ((phase === 'live' || phase === 'review') && idle > prefs.idleSeconds) toAttract();
    if (phase === 'live' && cameraError && idle > 15) toAttract();
    if (phase === 'done' && idle > Math.min(25, prefs.idleSeconds)) toAttract();
  }

  onMount(() => {
    if (ev.frame) createImageBitmap(ev.frame).then((b) => (frameBmp = b));
    window.addEventListener('pointerdown', touch, true);
    idleTimer = window.setInterval(checkIdle, 1000);
    const onBack = (e: Event) => e.preventDefault();
    window.addEventListener('cabine:back', onBack);
    const vis = () => {
      if (document.hidden) {
        token.cancelled = true;
        camera.stop();
        cameraReady = false;
        if (phase !== 'done' && phase !== 'building') toAttract();
      }
    };
    document.addEventListener('visibilitychange', vis);
    return () => {
      window.removeEventListener('pointerdown', touch, true);
      window.removeEventListener('cabine:back', onBack);
      document.removeEventListener('visibilitychange', vis);
      clearInterval(idleTimer);
    };
  });

  onDestroy(() => {
    token.cancelled = true;
    camera.stop();
    photos.forEach((p) => p?.close());
    frameBmp?.close();
    if (doneUrl) URL.revokeObjectURL(doneUrl);
  });

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  function resetPhotos() {
    photos.forEach((p) => p?.close());
    photos = ev.windows.map(() => null);
    current = 0;
  }

  function leave() {
    if (settled()) toAttract();
  }

  function toAttract() {
    token.cancelled = true;
    count = 0;
    camera.stop();
    cameraReady = false;
    resetPhotos();
    retakes = 0;
    filter = ev.filter;
    session = null;
    printed = false;
    if (doneUrl) URL.revokeObjectURL(doneUrl);
    doneUrl = null;
    phase = 'attract';
  }

  async function begin() {
    if (!settled()) return;
    touch();
    phase = 'live';
    await nextTick();
    await startCamera();
  }

  async function crop(bmp: ImageBitmap, index: number): Promise<ImageBitmap> {
    const w = ev.windows[index];
    const c = document.createElement('canvas');
    c.width = w.w;
    c.height = w.h;
    const ctx = c.getContext('2d')!;
    const src = coverRect(bmp.width, bmp.height, w.w, w.h);
    ctx.drawImage(bmp, src.x, src.y, src.w, src.h, 0, 0, w.w, w.h);
    bmp.close();
    return createImageBitmap(c);
  }

  async function shoot() {
    if (!cameraReady || phase !== 'live' || !settled()) return;
    const t = { cancelled: false };
    token = t;
    phase = 'countdown';
    const todo = photos.map((p, i) => (p ? -1 : i)).filter((i) => i >= 0);
    for (let n = 0; n < todo.length; n++) {
      current = todo[n];
      for (let s = countdownSeconds; s > 0; s--) {
        if (t.cancelled) return;
        count = s;
        touch();
        tick(false);
        await sleep(1000);
      }
      if (t.cancelled) return;
      count = 0;
      flashPulse++;
      shutter();
      vibrate(30);
      try {
        const raw = await rotateBitmap(await camera.shoot(video, false, true), prefs.rotation);
        photos[current] = await crop(raw, current);
      } catch {
        toast('A câmera não respondeu. Tente de novo.', 'error');
        phase = 'live';
        return;
      }
      if (n < todo.length - 1) await sleep(700);
    }
    if (t.cancelled) return;
    camera.stop();
    cameraReady = false;
    phase = 'review';
  }

  async function retake() {
    if (!settled()) return;
    retakes++;
    resetPhotos();
    phase = 'live';
    await nextTick();
    await startCamera();
  }

  const name = () => `${slug(ev.name)}-${fileStamp(new Date(session?.createdAt ?? Date.now()))}.jpg`;

  async function approve() {
    if (!settled()) return;
    phase = 'building';
    await sleep(60);
    try {
      const unit = renderUnit({ format: ev.format, windows: ev.windows, photos, frame: frameBmp, filter, eventName: ev.name, accent: ev.accent });
      const sheet = await exportSheet(unit, ev.format);
      const thumb = await thumbnail(unit, 900);
      const s: BoothSession = {
        id: uid(),
        eventId: ev.id,
        createdAt: Date.now(),
        filter,
        sheet,
        thumb,
        prints: 0,
        savedToGallery: false,
      };
      await db.sessions.add(s);
      session = s;
      doneUrl = URL.createObjectURL(thumb);
      resetPhotos();
      phase = 'done';
      touch();
      if (isNative && ev.autoSave) {
        saveToGallery(sheet, name())
          .then(() => db.sessions.update(s.id, { savedToGallery: true }))
          .catch(() => undefined);
      }
    } catch {
      toast('Não foi possível montar a foto. Toque em Ficou ótima de novo.', 'error', 3600);
      phase = 'review';
    }
  }

  async function print() {
    if (!session || printed || !settled()) return;
    printed = true;
    try {
      const job = await printJob(session.sheet, ev.format);
      await printSheet(job.blob, { widthCm: job.widthCm, heightCm: job.heightCm, jobName: name() });
      session.prints += 1;
      await db.sessions.update(session.id, { prints: session.prints });
    } catch {
      printed = false;
      toast('A impressão não abriu. Chame a equipe.', 'error', 3600);
    }
  }

  let holdTimer = 0;
  function cornerDown() {
    holdTimer = window.setTimeout(() => {
      vibrate(20);
      pinOpen = true;
    }, 2000);
  }
  function cornerUp() {
    clearTimeout(holdTimer);
  }

  function operator(to: 'gallery' | 'settings' | 'events') {
    menuOpen = false;
    toAttract();
    if (to === 'events') home();
    else go({ name: to });
  }
</script>

<section class="totem force-dark" style="--frame-ratio:{spec.unitPx[0] / spec.unitPx[1]}">
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="corner" onpointerdown={cornerDown} onpointerup={cornerUp} onpointerleave={cornerUp} onpointercancel={cornerUp}></div>

  {#if phase === 'attract'}
    <button class="attract" onclick={begin} in:fade={{ duration: 200 }}>
      <span class="event-name">{ev.name}</span>
      <span class="sample">
        <UnitPreview class="sample-canvas" format={ev.format} windows={ev.windows} frame={ev.frame} eventName={ev.name} accent={ev.accent} resolution={0.3} />
      </span>
      <span class="cta"><span class="dot"></span>Toque para tirar sua foto</span>
      <span class="hint">{ev.windows.length === 1 ? 'Uma foto' : `${ev.windows.length} poses`}, {spec.name.toLowerCase()}</span>
    </button>
  {:else if phase === 'live' || phase === 'countdown'}
    <div class="capture">
      <div class="head">
        {#if ev.windows.length > 1}
          <div class="bars">
            {#each ev.windows as _, i (i)}<i class:done={!!photos[i]} class:now={phase === 'countdown' && i === current}></i>{/each}
          </div>
          <p>Pose {current + 1} de {ev.windows.length}</p>
        {:else}
          <p>Ajuste-se no quadro</p>
        {/if}
      </div>
      <div class="area" bind:clientWidth={areaW} bind:clientHeight={areaH}>
        <div class="stage" class:counting={phase === 'countdown'} style="width:{stage.w}px;height:{stage.h}px">
          <!-- svelte-ignore a11y_media_has_caption -->
          <video bind:this={video} style={videoStyle} playsinline muted autoplay></video>
          {#if cameraError}
            <div class="msg"><Icon name="alert" size={48} /><p>A câmera não respondeu. Chame a equipe.</p><p class="detail">{cameraError}</p><button class="big ghost" onclick={startCamera}>Tentar de novo</button></div>
          {:else if !cameraReady}
            <div class="msg"><span class="spinner"></span></div>
          {/if}
          {#if phase === 'countdown' && count > 0}
            {#key count}<div class="count">{count}</div>{/key}
          {/if}
          {#key flashPulse}{#if flashPulse > 0}<div class="flash"></div>{/if}{/key}
        </div>
      </div>
      <div class="actions">
        {#if phase === 'live'}
          <button class="big ghost" onclick={leave}><Icon name="back" size={36} />Voltar</button>
          <button class="big accent grow" onclick={shoot} disabled={!cameraReady}>
            <Icon name="camera" size={40} />{ev.windows.length > 1 ? 'Começar' : 'Tirar foto'}
          </button>
        {:else}
          <p class="smile">Sorria!</p>
        {/if}
      </div>
    </div>
  {:else if phase === 'review' || phase === 'building'}
    <div class="review" in:fade={{ duration: 150 }}>
      <p class="title">Ficou boa?</p>
      <div class="proof-wrap" bind:clientWidth={proofW} bind:clientHeight={proofH}>
        <div class="proof" style={proofFit}>
          <UnitPreview class="proof-canvas" format={ev.format} windows={ev.windows} frame={ev.frame} {photos} {filter} eventName={ev.name} accent={ev.accent} resolution={0.5} numbers={false} />
        </div>
      </div>
      <div class="filters">
        {#each FILTERS as f (f.id)}
          <button class:on={filter === f.id} onclick={() => (filter = f.id)} disabled={phase === 'building'}>{f.name}</button>
        {/each}
      </div>
      <div class="actions">
        {#if retakes < prefs.maxRetakes}
          <button class="big ghost" onclick={retake} disabled={phase === 'building'}><Icon name="retake" size={40} />Tirar de novo</button>
        {/if}
        <button class="big accent grow" onclick={approve} disabled={phase === 'building'}>
          {#if phase === 'building'}<span class="spinner small"></span>Preparando{:else}<Icon name="check" size={40} stroke={2.4} />Ficou ótima{/if}
        </button>
      </div>
    </div>
  {:else if phase === 'done'}
    <div class="done" in:fade={{ duration: 200 }}>
      <p class="title">{printed ? 'Retire sua foto na impressora' : 'Sua foto está pronta'}</p>
      <div class="proof-wrap" bind:clientWidth={proofW} bind:clientHeight={proofH}>
        {#if doneUrl}<img class="final" src={doneUrl} alt="Sua foto" style={proofFit} />{/if}
      </div>
      <div class="actions">
        {#if canPrint}
          <button class="big accent grow" onclick={print} disabled={printed}><Icon name={printed ? 'check' : 'print'} size={40} />{printed ? 'Enviada' : 'Imprimir'}</button>
        {/if}
        <button class="big ghost" class:grow={!canPrint} onclick={leave}>Concluir</button>
      </div>
    </div>
  {/if}

  {#if phase !== 'attract'}<p class="foot">{ev.name}</p>{/if}

  {#if pinOpen}
    <PinPad pin={prefs.pin} oncancel={() => (pinOpen = false)} onsuccess={() => { pinOpen = false; menuOpen = true; }} />
  {/if}

  {#if menuOpen}
    <div class="menu-scrim">
      <div class="menu">
        <p class="title">Operador</p>
        <button class="big ghost" onclick={() => operator('gallery')}><Icon name="gallery" size={32} />Galeria do evento</button>
        <button class="big ghost" onclick={() => operator('events')}><Icon name="layers" size={32} />Trocar de evento</button>
        <button class="big ghost" onclick={() => operator('settings')}><Icon name="settings" size={32} />Ajustes e diagnóstico</button>
        <button class="big accent" onclick={() => (menuOpen = false)}>Voltar ao totem</button>
      </div>
    </div>
  {/if}
</section>

<style>
  .totem {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    overflow: hidden;
    background: #121212;
    color: #f2f2f0;
    font-size: 16px;
    font-size: calc(10px + 1.4vw);
  }
  .corner {
    position: absolute;
    top: 0;
    left: 0;
    width: 120px;
    height: 120px;
    z-index: 40;
  }
  .attract {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    width: 100%;
    display: grid;
    grid-template-rows: auto 52vh auto auto 1fr;
    justify-items: center;
    align-items: center;
    padding: 4vh 2em 0;
    text-align: center;
    background: radial-gradient(ellipse at 50% 45%, rgba(var(--accent-rgb), 0.28), transparent 65%), #121212;
  }
  .event-name {
    font-size: 2em;
    font-weight: 500;
    letter-spacing: -0.02em;
    line-height: 1.1;
  }
  .sample {
    display: block;
    height: 100%;
    padding: 2.5vh 0;
  }
  .sample :global(.sample-canvas) {
    height: 100%;
    width: auto;
    max-width: 80vw;
    transform: rotate(-3deg);
    box-shadow: 0 1.5em 3em rgba(0, 0, 0, 0.6);
  }
  .cta {
    display: inline-flex;
    align-items: center;
    min-height: 3.5em;
    padding: 0 2em;
    border-radius: 9999px;
    background: var(--accent);
    color: var(--on-accent);
    font-size: 1.5em;
    font-weight: 500;
    animation: pulse 2.4s ease-in-out infinite;
  }
  .dot {
    width: 0.6em;
    height: 0.6em;
    margin-right: 0.6em;
    border-radius: 50%;
    background: currentColor;
  }
  @keyframes pulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.05); }
  }
  .hint {
    margin-top: 1em;
    color: #9a9a9a;
  }
  .capture,
  .review,
  .done {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    display: flex;
    flex-direction: column;
    padding: 3vh 1.5em 0;
  }
  .foot {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 5vh;
    text-align: center;
    color: #6f6f6f;
    font-size: 1.1em;
    pointer-events: none;
  }
  .detail {
    font-family: 'Geist Mono Variable', monospace;
    font-size: 0.7em;
    color: #8a8a8a;
  }
  .head {
    display: grid;
    justify-items: center;
    grid-gap: 0.75em;
    gap: 0.75em;
    min-height: 3.5em;
    font-size: 1.25em;
  }
  .bars {
    display: grid;
    grid-auto-flow: column;
    grid-gap: 0.4em;
    gap: 0.4em;
  }
  .bars i {
    width: 2.5em;
    height: 0.35em;
    border-radius: 0.2em;
    background: rgba(255, 255, 255, 0.2);
  }
  .bars i.done {
    background: #f2f2f0;
  }
  .bars i.now {
    background: var(--accent);
  }
  .area {
    flex: none;
    height: 54vh;
    margin: 1.5vh 0 2.5vh;
    display: grid;
    place-items: center;
  }
  .stage {
    position: relative;
    overflow: hidden;
    border-radius: 1em;
    background: #000;
  }
  .stage.counting {
    box-shadow: 0 0 0 0.3em var(--accent);
  }
  video {
    position: absolute;
    object-fit: cover;
  }
  .msg {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    display: grid;
    place-content: center;
    justify-items: center;
    grid-gap: 1em;
    gap: 1em;
    padding: 2em;
    text-align: center;
  }
  .count {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    display: grid;
    place-items: center;
    font-size: 16em;
    line-height: 1;
    font-weight: 500;
    color: var(--accent);
    text-shadow: 0 0.05em 0.2em rgba(0, 0, 0, 0.5);
    animation: pop 0.45s ease-out;
  }
  @keyframes pop {
    from { transform: scale(1.4); opacity: 0; }
    to { transform: scale(1); opacity: 1; }
  }
  .flash {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    background: #fff;
    animation: flash 0.4s ease-out forwards;
  }
  @keyframes flash {
    from { opacity: 0.95; }
    to { opacity: 0; }
  }
  .actions {
    display: flex;
    align-items: center;
    min-height: 5em;
  }
  .actions > :global(* + *) {
    margin-left: 1em;
  }
  .big {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 4em;
    padding: 0 1.2em;
    border-radius: 9999px;
    white-space: nowrap;
    font-size: 1.4em;
    font-weight: 500;
  }
  .big :global(svg) {
    width: 1.3em;
    height: 1.3em;
    margin-right: 0.5em;
  }
  .big:disabled {
    opacity: 0.45;
  }
  .accent {
    background: var(--accent);
    color: var(--on-accent);
  }
  .ghost {
    box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.25);
  }
  .big:active {
    transform: scale(0.97);
  }
  .grow {
    flex: 1;
  }
  .smile {
    width: 100%;
    text-align: center;
    font-size: 2em;
    font-weight: 500;
  }
  .title {
    text-align: center;
    font-size: 2em;
    font-weight: 500;
    letter-spacing: -0.02em;
  }
  .proof-wrap {
    flex: none;
    height: 50vh;
    margin: 2vh 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .proof {
    box-shadow: 0 1em 2.5em rgba(0, 0, 0, 0.6);
  }
  .proof :global(.proof-canvas) {
    width: 100%;
    height: 100%;
  }
  .final {
    display: block;
    box-shadow: 0 1em 2.5em rgba(0, 0, 0, 0.6);
  }
  .done .proof-wrap {
    height: 54vh;
  }
  .filters {
    display: flex;
    justify-content: center;
    margin-bottom: 2.5vh;
  }
  .filters button {
    min-height: 3em;
    padding: 0 1.5em;
    margin: 0 0.4em;
    border-radius: 9999px;
    font-size: 1.1em;
    box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.2);
    color: #c9c9c9;
  }
  .filters button.on {
    background: #f2f2f0;
    color: #262626;
    box-shadow: none;
  }
  .spinner {
    display: inline-block;
    width: 3em;
    height: 3em;
    border-radius: 50%;
    border: 0.25em solid rgba(255, 255, 255, 0.2);
    border-top-color: var(--accent);
    animation: spin 0.9s linear infinite;
  }
  .spinner.small {
    width: 1em;
    height: 1em;
    margin-right: 0.5em;
    border-color: currentColor;
    border-right-color: transparent;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  .menu-scrim {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    left: 0;
    z-index: 45;
    display: grid;
    place-items: center;
    background: rgba(10, 10, 10, 0.92);
  }
  .menu {
    display: grid;
    grid-gap: 1em;
    gap: 1em;
    width: 90vw;
    max-width: 26em;
  }
  .menu .title {
    margin-bottom: 0.5em;
  }
</style>
