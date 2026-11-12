<script lang="ts">
  import { onDestroy, onMount, tick as svelteTick } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  import { activeEvent, app, go, home, toast } from '../state.svelte';
  import { Camera } from '../core/camera';
  import { coverRect, exportSheet, renderUnit, thumbnail, type FilterId } from '../core/compose';
  import { db, sessionsFor, uid, type BoothSession, type CameraFacing } from '../core/db';
  import { FORMATS } from '../core/formats';
  import { shutter, tick } from '../core/sound';
  import { fileStamp, slug, vibrate } from '../core/util';
  import { onHardwareShutter, printSheet, saveToGallery, shareFile } from '../platform';
  import Icon from '../ui/Icon.svelte';
  import UnitPreview from '../ui/UnitPreview.svelte';
  import Review from './Review.svelte';
  import Delivery from './Delivery.svelte';

  const ev = activeEvent()!;
  const spec = FORMATS[ev.format];

  type Phase = 'live' | 'countdown' | 'review' | 'delivery';
  let phase: Phase = $state('live');
  let photos: (ImageBitmap | null)[] = $state(ev.windows.map(() => null));
  let current = $state(0);
  let count = $state(0);
  let groupMode = $state(false);
  let flashOn = $state(ev.flash);
  let facing: CameraFacing = $state(ev.camera);
  let cameraError: string | null = $state(null);
  let cameraReady = $state(false);
  let canFlash = $state(false);
  let flashPulse = $state(0);
  let frozen: string | null = $state(null);
  let filter: FilterId = $state(ev.filter);
  let busy = $state(false);
  let session: BoothSession | null = $state(null);
  let saveState: 'idle' | 'saving' | 'saved' | 'error' = $state('idle');
  let lastThumb: string | null = $state(null);
  let sessionCount = $state(0);
  let returnToReview = false;

  let video: HTMLVideoElement;
  const camera = new Camera();
  let frameBmp: ImageBitmap | null = null;
  let cancelToken = { cancelled: false };
  let wakeLock: { release(): Promise<void> } | null = null;

  let areaW = $state(0);
  let areaH = $state(0);
  const win = $derived(ev.windows[current] ?? ev.windows[0]);
  const stage = $derived.by(() => {
    if (!areaW || !areaH || !win) return { w: 0, h: 0 };
    const ratio = win.w / win.h;
    const maxW = areaW;
    const maxH = areaH;
    return maxW / maxH > ratio ? { w: maxH * ratio, h: maxH } : { w: maxW, h: maxW / ratio };
  });
  const mirrored = $derived(facing === 'user' && ev.mirrorPreview);
  const filled = $derived(photos.filter(Boolean).length);

  async function startCamera() {
    cameraReady = false;
    cameraError = null;
    try {
      await camera.start(facing, video);
      canFlash = camera.canFlash;
      cameraReady = true;
    } catch (e) {
      cameraError = (e as Error).message;
    }
  }

  async function refreshLast() {
    const list = await sessionsFor(ev.id);
    sessionCount = list.length;
    if (lastThumb) URL.revokeObjectURL(lastThumb);
    lastThumb = list[0] ? URL.createObjectURL(list[0].thumb) : null;
  }

  onMount(() => {
    startCamera();
    refreshLast();
    if (ev.frame) createImageBitmap(ev.frame).then((b) => (frameBmp = b));
    const off = onHardwareShutter(() => {
      if (phase === 'live') start();
    });
    const vis = () => {
      if (document.hidden) {
        cancelSequence();
        camera.stop();
        cameraReady = false;
      } else if (phase === 'live' || phase === 'countdown') {
        startCamera();
      }
    };
    document.addEventListener('visibilitychange', vis);
    const onBack = (e: Event) => {
      if (phase === 'countdown') {
        e.preventDefault();
        cancelSequence();
      } else if (phase === 'review') {
        e.preventDefault();
        retakeAll();
      } else if (phase === 'delivery') {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener('cabine:back', onBack);
    (navigator as Navigator & { wakeLock?: { request(t: string): Promise<{ release(): Promise<void> }> } }).wakeLock
      ?.request('screen')
      .then((l) => (wakeLock = l))
      .catch(() => undefined);
    return () => {
      off();
      document.removeEventListener('visibilitychange', vis);
      window.removeEventListener('cabine:back', onBack);
    };
  });

  onDestroy(() => {
    cancelToken.cancelled = true;
    camera.stop();
    photos.forEach((p) => p?.close());
    frameBmp?.close();
    if (lastThumb) URL.revokeObjectURL(lastThumb);
    if (frozen) URL.revokeObjectURL(frozen);
    wakeLock?.release().catch(() => undefined);
  });

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  async function countdown(seconds: number, token: { cancelled: boolean }) {
    for (let s = seconds; s > 0; s--) {
      if (token.cancelled) return;
      count = s;
      tick(false);
      if (s <= 3) vibrate(18);
      await sleep(1000);
    }
    count = 0;
  }

  async function cropToWindow(bmp: ImageBitmap, index: number): Promise<ImageBitmap> {
    const w = ev.windows[index];
    const c = document.createElement('canvas');
    c.width = w.w;
    c.height = w.h;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    const src = coverRect(bmp.width, bmp.height, w.w, w.h);
    ctx.drawImage(bmp, src.x, src.y, src.w, src.h, 0, 0, w.w, w.h);
    bmp.close();
    if (frozen) URL.revokeObjectURL(frozen);
    frozen = await new Promise<string>((r) => c.toBlob((b) => r(URL.createObjectURL(b!)), 'image/jpeg', 0.8));
    return createImageBitmap(c);
  }

  async function runSequence(indices: number[]) {
    const token = { cancelled: false };
    cancelToken = token;
    phase = 'countdown';
    for (let n = 0; n < indices.length; n++) {
      const i = indices[n];
      current = i;
      await countdown(n === 0 && groupMode ? ev.groupTimer : ev.countdown, token);
      if (token.cancelled) return;
      flashPulse++;
      shutter();
      tick(true);
      vibrate(40);
      try {
        const raw = await camera.shoot(video, flashOn);
        const cropped = await cropToWindow(raw, i);
        photos[i]?.close();
        photos[i] = cropped;
      } catch {
        toast('A câmera não respondeu. Tente de novo.', 'error');
        cancelSequence();
        return;
      }
      await sleep(n < indices.length - 1 ? 900 : 650);
      if (token.cancelled) return;
      if (frozen) {
        URL.revokeObjectURL(frozen);
        frozen = null;
      }
    }
    groupMode = false;
    phase = 'review';
  }

  function start() {
    if (!cameraReady || phase !== 'live') return;
    const missing = photos.map((p, i) => (p ? -1 : i)).filter((i) => i >= 0);
    runSequence(missing.length ? missing : photos.map((_, i) => i));
  }

  function cancelSequence() {
    cancelToken.cancelled = true;
    count = 0;
    if (frozen) {
      URL.revokeObjectURL(frozen);
      frozen = null;
    }
    if (phase === 'countdown') {
      phase = returnToReview && photos.every(Boolean) ? 'review' : 'live';
      returnToReview = false;
    }
  }

  function resetPhotos() {
    photos.forEach((p) => p?.close());
    photos = ev.windows.map(() => null);
    current = 0;
  }

  async function retakeAll() {
    resetPhotos();
    returnToReview = false;
    phase = 'live';
    if (!cameraReady) await startCamera();
  }

  async function retakeOne(i: number) {
    returnToReview = true;
    phase = 'live';
    if (!cameraReady) await startCamera();
    await svelteTick();
    current = i;
    runSequence([i]).then(() => (returnToReview = false));
  }

  async function approve() {
    busy = true;
    try {
      await document.fonts.ready;
      const unit = renderUnit({
        format: ev.format,
        windows: ev.windows,
        photos,
        frame: frameBmp,
        filter,
        eventName: ev.name,
        accent: ev.accent,
      });
      const sheet = await exportSheet(unit, ev.format);
      const thumb = await thumbnail(unit);
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
      saveState = 'idle';
      phase = 'delivery';
      refreshLast();
      if (ev.autoSave) save();
    } catch {
      toast('Não foi possível montar a folha. Tente aprovar de novo.', 'error', 3400);
    } finally {
      busy = false;
    }
  }

  const fileName = () => `${slug(ev.name)}-${fileStamp(new Date(session?.createdAt ?? Date.now()))}.jpg`;

  async function save() {
    if (!session) return;
    saveState = 'saving';
    try {
      await saveToGallery(session.sheet, fileName());
      saveState = 'saved';
      session.savedToGallery = true;
      await db.sessions.update(session.id, { savedToGallery: true });
    } catch {
      saveState = 'error';
      toast('Não foi possível salvar na galeria. Verifique o espaço do aparelho.', 'error', 3400);
    }
  }

  async function print() {
    if (!session) return;
    try {
      await printSheet(session.sheet, { widthCm: spec.sheetCm[0], heightCm: spec.sheetCm[1], jobName: fileName() });
      session.prints += 1;
      await db.sessions.update(session.id, { prints: session.prints });
    } catch {
      toast('A impressão não abriu. Confira se a impressora está ligada e pareada.', 'error', 3600);
    }
  }

  async function share() {
    if (!session) return;
    try {
      await shareFile(session.sheet, fileName(), ev.name);
    } catch {
      /* compartilhamento cancelado */
    }
  }

  async function next() {
    resetPhotos();
    session = null;
    saveState = 'idle';
    filter = ev.filter;
    phase = 'live';
    if (!cameraReady) await startCamera();
  }

  async function flip() {
    facing = facing === 'environment' ? 'user' : 'environment';
    await startCamera();
  }
</script>

<section class="booth" class:landscape={areaW > areaH}>
  <header class="top">
    <button class="pill" onclick={() => home()} aria-label="Trocar de evento">
      <Icon name="back" size={20} />
      <span class="pill-name">{ev.name}</span>
    </button>
    <div class="top-right">
      {#if facing === 'environment' && canFlash}
        <button class="icon-btn" class:lit={flashOn} aria-pressed={flashOn} aria-label="Flash" onclick={() => (flashOn = !flashOn)}>
          <Icon name={flashOn ? 'flash' : 'flashOff'} size={24} />
        </button>
      {/if}
      <button class="icon-btn" aria-label="Trocar câmera" onclick={flip} disabled={phase !== 'live'}>
        <Icon name="flip" size={24} />
      </button>
    </div>
  </header>

  <div class="area" bind:clientWidth={areaW} bind:clientHeight={areaH}>
    <div class="stage" style="width:{stage.w}px;height:{stage.h}px" class:counting={phase === 'countdown'}>
      <!-- svelte-ignore a11y_media_has_caption -->
      <video bind:this={video} class:mirrored playsinline muted autoplay></video>
      {#if cameraError}
        <div class="cam-error">
          <Icon name="alert" size={32} />
          <p>{cameraError}</p>
          <button class="btn btn-ghost" onclick={startCamera}>Tentar de novo</button>
        </div>
      {:else if !cameraReady}
        <div class="cam-loading"><span></span></div>
      {/if}

      {#if frozen}
        <img class="frozen" src={frozen} alt="" in:fade={{ duration: 120 }} out:scale={{ start: 0.85, duration: 260, opacity: 0 }} />
      {/if}

      {#if phase === 'countdown' && count > 0}
        {#key count}
          <div class="count" in:scale={{ start: 1.5, duration: 420, opacity: 0, easing: (t) => 1 - Math.pow(1 - t, 3) }}>
            {count}
          </div>
        {/key}
      {/if}

      {#key flashPulse}
        {#if flashPulse > 0}<div class="flash"></div>{/if}
      {/key}

      <span class="corner tl"></span><span class="corner tr"></span><span class="corner bl"></span><span class="corner br"></span>
    </div>
  </div>

  <div class="status">
    {#if phase === 'countdown'}
      <span>Pose {current + 1} de {ev.windows.length}</span>
    {:else if cameraReady}
      <span class="muted">{filled ? `Pose ${current + 1} de ${ev.windows.length}` : `${ev.windows.length} ${ev.windows.length === 1 ? 'pose' : 'poses'}${groupMode ? `, timer de ${ev.groupTimer} s` : ''}`}</span>
    {/if}
  </div>

  <footer class="dock">
    <button class="side gallery" aria-label="Galeria do evento" onclick={() => go({ name: 'gallery' })} disabled={phase === 'countdown'}>
      {#if lastThumb}
        <img src={lastThumb} alt="" />
      {:else}
        <Icon name="gallery" />
      {/if}
      {#if sessionCount}<em>{sessionCount}</em>{/if}
    </button>

    {#if phase === 'countdown'}
      <button class="shutter cancel" onclick={cancelSequence} aria-label="Cancelar contagem">
        <span class="ring"><Icon name="close" size={32} stroke={2.4} /></span>
      </button>
    {:else}
      <button class="shutter" onclick={start} disabled={!cameraReady} aria-label="Fotografar">
        <span class="ring"><span class="core"></span></span>
      </button>
    {/if}

    <div class="side map-wrap">
      <button class="timer" class:on={groupMode} aria-pressed={groupMode} onclick={() => (groupMode = !groupMode)} disabled={phase === 'countdown'} aria-label="Timer de grupo de {ev.groupTimer} segundos">
        <Icon name="timer" size={24} />
        <span>{ev.groupTimer}s</span>
      </button>
    </div>
  </footer>

  <div class="map" class:wide={spec.landscape} aria-hidden="true">
    <UnitPreview format={ev.format} windows={ev.windows} frame={ev.frame} {photos} eventName={ev.name} accent={ev.accent} highlight={phase === 'review' || phase === 'delivery' ? -1 : current} resolution={0.08} />
  </div>

  {#if phase === 'review'}
    <Review {ev} {photos} bind:filter {busy} onretakeAll={retakeAll} onretakeOne={retakeOne} onapprove={approve} />
  {/if}

  {#if phase === 'delivery' && session}
    <Delivery {ev} {session} {saveState} onprint={print} onsave={save} onshare={share} onnext={next} />
  {/if}

  {#if phase === 'review' || phase === 'delivery'}
    <header class="top overlay-top" in:fade={{ duration: 150 }}>
      <button class="pill" onclick={phase === 'review' ? retakeAll : next}>
        <Icon name={phase === 'review' ? 'back' : 'camera'} size={20} />
        <span class="pill-name">{phase === 'review' ? 'Voltar à câmera' : 'Câmera'}</span>
      </button>
      <span class="step">{phase === 'review' ? 'Revisão' : 'Pronta'}</span>
    </header>
  {/if}
</section>

<style>
  .booth {
    position: absolute;
    inset: 0;
    display: grid;
    grid-template-rows: auto 1fr auto auto;
    background: #0f1013;
    overflow: hidden;
  }
  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: calc(var(--safe-top) + 12px) 16px 8px;
    z-index: 3;
  }
  .overlay-top {
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    z-index: 8;
  }
  .step {
    font-weight: 700;
    font-stretch: 85%;
    font-size: 18px;
    padding-right: 6px;
  }
  .top-right {
    display: flex;
    gap: 8px;
  }
  .pill {
    display: flex;
    align-items: center;
    gap: 4px;
    min-height: 48px;
    max-width: 62vw;
    padding: 0 16px 0 12px;
    border-radius: 999px;
    background: var(--panel);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    font-weight: 640;
  }
  .pill-name {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .icon-btn.lit {
    background: #ffc531;
    color: #17181c;
  }
  .icon-btn:disabled {
    opacity: 0.35;
  }
  .area {
    position: relative;
    min-height: 0;
    margin: 4px 12px 0;
    display: grid;
    place-items: center;
  }
  .stage {
    position: relative;
    overflow: hidden;
    border-radius: 24px;
    background: #000;
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.06), 0 30px 60px -20px rgba(0, 0, 0, 0.8);
    transition: width 0.35s var(--ease-out), height 0.35s var(--ease-out), box-shadow 0.3s;
  }
  .stage.counting {
    box-shadow: 0 0 0 3px var(--accent), 0 30px 60px -20px rgba(0, 0, 0, 0.8);
  }
  video {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  video.mirrored {
    transform: scaleX(-1);
  }
  .frozen {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    z-index: 2;
  }
  .count {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    font-size: min(78vw, 64vh);
    line-height: 1;
    font-weight: 800;
    font-stretch: 75%;
    letter-spacing: -0.06em;
    color: var(--accent);
    text-shadow: 0 10px 60px rgba(0, 0, 0, 0.45);
    mix-blend-mode: normal;
    z-index: 3;
    pointer-events: none;
  }
  .flash {
    position: absolute;
    inset: 0;
    background: #fff;
    z-index: 4;
    pointer-events: none;
    animation: flash 0.45s ease-out forwards;
  }
  @keyframes flash {
    from { opacity: 0.95; }
    to { opacity: 0; }
  }
  .corner {
    position: absolute;
    width: 24px;
    height: 24px;
    border-color: rgba(255, 255, 255, 0.75);
    border-style: solid;
    border-width: 0;
    z-index: 2;
    pointer-events: none;
  }
  .tl { top: 12px; left: 12px; border-top-width: 2.5px; border-left-width: 2.5px; border-top-left-radius: 8px; }
  .tr { top: 12px; right: 12px; border-top-width: 2.5px; border-right-width: 2.5px; border-top-right-radius: 8px; }
  .bl { bottom: 12px; left: 12px; border-bottom-width: 2.5px; border-left-width: 2.5px; border-bottom-left-radius: 8px; }
  .br { bottom: 12px; right: 12px; border-bottom-width: 2.5px; border-right-width: 2.5px; border-bottom-right-radius: 8px; }
  .cam-error,
  .cam-loading {
    position: absolute;
    inset: 0;
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 16px;
    padding: 24px;
    text-align: center;
    color: var(--muted);
    z-index: 2;
  }
  .cam-error p {
    max-width: 28ch;
    color: var(--text);
  }
  .cam-loading span {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: 3px solid rgba(255, 255, 255, 0.2);
    border-top-color: var(--accent);
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  .status {
    text-align: center;
    min-height: 32px;
    padding-top: 10px;
    font-weight: 600;
    font-size: 15px;
  }
  .dock {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    padding: 4px 24px calc(var(--safe-bottom) + 24px);
  }
  .side {
    justify-self: start;
  }
  .map-wrap {
    justify-self: end;
  }
  .gallery {
    position: relative;
    width: 56px;
    height: 56px;
    border-radius: 16px;
    display: grid;
    place-items: center;
    background: var(--panel-solid);
    overflow: visible;
  }
  .gallery img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 16px;
    box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.85);
  }
  .gallery em {
    position: absolute;
    top: -8px;
    right: -8px;
    min-width: 24px;
    height: 24px;
    padding: 0 4px;
    border-radius: 999px;
    display: grid;
    place-items: center;
    background: var(--text);
    color: var(--graphite);
    font-style: normal;
    font-weight: 740;
    font-size: 12.5px;
  }
  .gallery:disabled,
  .timer:disabled {
    opacity: 0.35;
  }
  .shutter {
    width: 96px;
    height: 96px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    transition: transform 0.2s var(--ease-spring);
  }
  .shutter:active {
    transform: scale(0.9);
  }
  .shutter:disabled {
    opacity: 0.4;
  }
  .ring {
    width: 96px;
    height: 96px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    border: 4px solid var(--text);
  }
  .core {
    width: 72px;
    height: 72px;
    border-radius: 50%;
    background: var(--accent);
    transition: transform 0.25s var(--ease-spring);
  }
  .shutter:active .core {
    transform: scale(0.86);
  }
  .shutter.cancel .ring {
    border-color: var(--accent);
    background: rgba(var(--accent-rgb), 0.15);
    color: var(--accent);
  }
  .timer {
    display: flex;
    align-items: center;
    gap: 4px;
    min-height: 48px;
    padding: 0 16px;
    border-radius: 999px;
    background: var(--panel-solid);
    font-weight: 680;
    font-size: 15px;
    transition: background 0.2s, color 0.2s;
  }
  .timer.on {
    background: var(--accent);
    color: var(--on-accent);
  }
  .map {
    position: absolute;
    right: 16px;
    top: calc(var(--safe-top) + 72px);
    width: 48px;
    z-index: 3;
    pointer-events: none;
    filter: drop-shadow(0 6px 12px rgba(0, 0, 0, 0.6));
  }
  .map.wide {
    width: 64px;
  }
  .map :global(canvas) {
    width: 100%;
    height: auto;
  }

  @media (orientation: landscape) {
    .booth {
      grid-template-rows: auto 1fr;
      grid-template-columns: 1fr auto;
    }
    .top {
      grid-column: 1 / -1;
    }
    .area {
      grid-row: 2;
      margin: 0 0 calc(var(--safe-bottom) + 12px) 16px;
    }
    .status {
      display: none;
    }
    .dock {
      grid-row: 2;
      grid-column: 2;
      grid-template-columns: auto;
      grid-template-rows: 1fr auto 1fr;
      justify-items: center;
      padding: 0 24px 16px;
    }
    .side,
    .map-wrap {
      justify-self: center;
    }
    .side.gallery {
      align-self: start;
    }
    .map-wrap {
      align-self: end;
    }
    .map {
      top: auto;
      bottom: 16px;
      right: auto;
      left: 32px;
    }
  }
</style>
