<script lang="ts">
  import { onDestroy, onMount, tick as svelteTick } from 'svelte';
  import { fade, fly, scale } from 'svelte/transition';
  import { activeEvent, app, go, home, toast } from '../state.svelte';
  import { Camera } from '../core/camera';
  import { coverRect, exportSheet, renderUnit, thumbnail, type FilterId } from '../core/compose';
  import { printOut, usesStation } from '../core/printing';
  import { db, sessionsFor, uid, type BoothSession, type CameraFacing, type Lead } from '../core/db';
  import { activeLeadConfig, cleanLead, emptyLead, formatPhone, isBlank, validateLead, type LeadErrors } from '../core/lead';
  import { FORMATS } from '../core/formats';
  import { shutter, tick } from '../core/sound';
  import { fileStamp, slug, vibrate } from '../core/util';
  import { autoSaveSupported, onHardwareShutter, saveToGallery, shareFile } from '../platform';
  import Icon from '../ui/Icon.svelte';
  import UnitPreview from '../ui/UnitPreview.svelte';
  import Review from './Review.svelte';
  import Delivery from './Delivery.svelte';

  const ev = activeEvent()!;
  const spec = FORMATS[ev.format];

  type Phase = 'lead' | 'live' | 'countdown' | 'review' | 'delivery';
  const leadCfg = activeLeadConfig(ev.lead);
  let phase: Phase = $state(leadCfg ? 'lead' : 'live');
  let lead: Lead = $state(emptyLead());
  let leadErrors: LeadErrors = $state({});
  let guest: Lead | null = $state(null);
  const maxCopies = Math.max(1, ev.maxCopies ?? 1);
  let copiesOpen = $state(false);
  let copies = $state(1);
  const overlay = !!(ev.liveFrame !== false && ev.frame && ev.windows.length === 1);
  const frameUrl = overlay && ev.frame ? URL.createObjectURL(ev.frame) : null;
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
    const ratio = overlay ? spec.unitPx[0] / spec.unitPx[1] : win.w / win.h;
    const maxW = areaW;
    const maxH = areaH;
    return maxW / maxH > ratio ? { w: maxH * ratio, h: maxH } : { w: maxW, h: maxW / ratio };
  });
  const mirrored = $derived(facing === 'user' && ev.mirrorPreview);
  const winBox = $derived(
    overlay && win
      ? `left:${(win.x / spec.unitPx[0]) * 100}%;top:${(win.y / spec.unitPx[1]) * 100}%;width:${(win.w / spec.unitPx[0]) * 100}%;height:${(win.h / spec.unitPx[1]) * 100}%`
      : 'left:0;top:0;width:100%;height:100%'
  );
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
      if (copiesOpen) {
        e.preventDefault();
        copiesOpen = false;
      } else if (phase === 'countdown') {
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
    if (frameUrl) URL.revokeObjectURL(frameUrl);
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
        ...(guest ? { lead: { ...guest } } : {}),
      };
      await db.sessions.add(s);
      session = s;
      saveState = 'idle';
      phase = 'delivery';
      refreshLast();
      if (ev.autoSave && autoSaveSupported) save();
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
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') {
        saveState = 'idle';
        return;
      }
      saveState = 'error';
      toast('Não foi possível salvar na galeria. Verifique o espaço do aparelho.', 'error', 3400);
    }
  }

  function print() {
    if (!session) return;
    if (maxCopies > 1) {
      copies = 1;
      copiesOpen = true;
      return;
    }
    printCopies(1);
  }

  async function printCopies(n: number) {
    if (!session) return;
    copiesOpen = false;
    try {
      if (usesStation()) toast(n > 1 ? `Enviando ${n} cópias para a estação` : 'Enviando para a estação', 'info');
      for (let i = 0; i < n; i++) await printOut(session.sheet, ev.format, n > 1 ? fileName().replace('.jpg', `-${i + 1}.jpg`) : fileName());
      session.prints += n;
      await db.sessions.update(session.id, { prints: session.prints });
      if (usesStation()) toast('Impressão enviada');
    } catch (e) {
      toast(usesStation() ? `Estação: ${(e as Error).message}` : 'A impressão não abriu. Confira se a impressora está ligada e pareada.', 'error', 3600);
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

  function submitLead(skip = false) {
    if (!leadCfg) return;
    if (skip || (leadCfg.mode === 'optional' && isBlank(lead))) {
      guest = null;
      phase = 'live';
      return;
    }
    const errs = validateLead(leadCfg, lead);
    leadErrors = errs;
    if (Object.keys(errs).length) return;
    guest = cleanLead(lead);
    (document.activeElement as HTMLElement | null)?.blur();
    phase = 'live';
  }

  async function next() {
    resetPhotos();
    session = null;
    saveState = 'idle';
    filter = ev.filter;
    lead = emptyLead();
    leadErrors = {};
    guest = null;
    copiesOpen = false;
    phase = leadCfg ? 'lead' : 'live';
    if (!cameraReady) await startCamera();
  }

  async function flip() {
    facing = facing === 'environment' ? 'user' : 'environment';
    await startCamera();
  }
</script>

<section class="booth force-dark" class:landscape={areaW > areaH}>
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
    <div class="stage" style="width:{stage.w}px;height:{stage.h}px" class:counting={phase === 'countdown'} class:overlay>
      <div class="win" style={winBox}>
        <!-- svelte-ignore a11y_media_has_caption -->
        <video bind:this={video} class:mirrored playsinline muted autoplay></video>
        {#if frozen}
          <img class="frozen" src={frozen} alt="" in:fade={{ duration: 120 }} out:scale={{ start: 0.85, duration: 260, opacity: 0 }} />
        {/if}
      </div>
      {#if frameUrl}<img class="live-frame" src={frameUrl} alt="" />{/if}
      {#if cameraError}
        <div class="cam-error">
          <Icon name="alert" size={32} />
          <p>{cameraError}</p>
          <button class="btn btn-ghost" onclick={startCamera}>Tentar de novo</button>
        </div>
      {:else if !cameraReady}
        <div class="cam-loading"><span></span></div>
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

      {#if !overlay}<span class="corner tl"></span><span class="corner tr"></span><span class="corner bl"></span><span class="corner br"></span>{/if}
    </div>
  </div>

  <div class="status">
    <div class="pose-bar" aria-hidden="true">
      {#each ev.windows as _, i (i)}
        <i class:done={!!photos[i]} class:now={phase === 'countdown' && i === current}></i>
      {/each}
    </div>
    <span class="mono" class:muted={phase !== 'countdown'}>
      {#if phase === 'countdown'}Pose {current + 1}/{ev.windows.length}{:else if groupMode}Timer de grupo {ev.groupTimer} s{:else}{ev.windows.length} {ev.windows.length === 1 ? 'pose' : 'poses'} / {FORMATS[ev.format].name.toLowerCase()}{/if}
    </span>
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
    <Delivery {ev} {session} {saveState} guestName={guest?.name ?? ''} onprint={print} onsave={save} onshare={share} onnext={next} />
  {/if}

  {#if phase === 'lead' && leadCfg}
    <div class="lead-scrim" in:fade={{ duration: 150 }}>
      <form class="lead bottom-sheet" in:fly={{ y: 80, duration: 320 }} onsubmit={(e) => { e.preventDefault(); submitLead(); }} novalidate>
        <div class="lead-head">
          <h2>Cadastro do convidado</h2>
          <p class="muted small">{leadCfg.mode === 'required' ? 'Preencha para liberar a câmera.' : 'Opcional. Dá para pular.'}</p>
        </div>
        {#if leadCfg.name}
          <label class="lf"><span>Nome</span><input class="input" class:bad={leadErrors.name} bind:value={lead.name} autocomplete="name" autocapitalize="words" enterkeyhint="next" />{#if leadErrors.name}<em>{leadErrors.name}</em>{/if}</label>
        {/if}
        {#if leadCfg.phone}
          <label class="lf"><span>Telefone (WhatsApp)</span><input class="input" class:bad={leadErrors.phone} value={lead.phone} oninput={(e) => { lead.phone = formatPhone(e.currentTarget.value); e.currentTarget.value = lead.phone; }} type="tel" inputmode="tel" autocomplete="tel" enterkeyhint="next" />{#if leadErrors.phone}<em>{leadErrors.phone}</em>{/if}</label>
        {/if}
        {#if leadCfg.email}
          <label class="lf"><span>E-mail</span><input class="input" class:bad={leadErrors.email} bind:value={lead.email} type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false" enterkeyhint="next" />{#if leadErrors.email}<em>{leadErrors.email}</em>{/if}</label>
        {/if}
        {#if leadCfg.company}
          <label class="lf"><span>Empresa</span><input class="input" class:bad={leadErrors.company} bind:value={lead.company} autocomplete="organization" enterkeyhint="done" />{#if leadErrors.company}<em>{leadErrors.company}</em>{/if}</label>
        {/if}
        <label class="consent">
          <input type="checkbox" bind:checked={lead.consent} />
          <span class="box" class:bad={leadErrors.consent}><Icon name="check" size={18} stroke={3} /></span>
          <span>{leadCfg.consent}{#if leadErrors.consent}<em>{leadErrors.consent}</em>{/if}</span>
        </label>
        <div class="lead-actions">
          {#if leadCfg.mode === 'optional'}
            <button type="button" class="btn btn-ghost" onclick={() => submitLead(true)}>Pular</button>
          {:else}
            <button type="button" class="btn btn-ghost" onclick={() => home()}>Sair</button>
          {/if}
          <button type="submit" class="btn btn-accent grow"><Icon name="camera" />Ir para a câmera</button>
        </div>
      </form>
    </div>
  {/if}

  {#if copiesOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="lead-scrim" transition:fade={{ duration: 150 }} onclick={(e) => e.target === e.currentTarget && (copiesOpen = false)}>
      <div class="copies bottom-sheet" in:fly={{ y: 60, duration: 280 }}>
        <h2>Quantas cópias?</h2>
        <div class="stepper">
          <button class="icon-btn" onclick={() => (copies = Math.max(1, copies - 1))} disabled={copies <= 1} aria-label="Menos uma"><Icon name="minus" size={24} /></button>
          <span class="num">{copies}</span>
          <button class="icon-btn" onclick={() => (copies = Math.min(maxCopies, copies + 1))} disabled={copies >= maxCopies} aria-label="Mais uma"><Icon name="plus" size={24} /></button>
        </div>
        <button class="btn btn-accent wide" onclick={() => printCopies(copies)}><Icon name="print" />Imprimir {copies} {copies === 1 ? 'cópia' : 'cópias'}</button>
      </div>
    </div>
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
    background: #121212;
    overflow: hidden;
  }
  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: calc(var(--safe-top) + 16px) 16px 8px;
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
    font-weight: 500;
    font-size: 18px;
    letter-spacing: -0.025em;
    padding-right: 8px;
  }
  .top-right {
    display: flex;
    gap: 8px;
  }
  .pill {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 48px;
    max-width: 64vw;
    padding: 0 20px 0 12px;
    border-radius: 9999px;
    background: var(--panel);
    box-shadow: inset 0 0 0 1px var(--line);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    font-weight: 500;
    letter-spacing: -0.01em;
  }
  .pill-name {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .icon-btn.lit {
    background: #ffc531;
    color: #262626;
    box-shadow: inset 1px 6px 6px rgba(255, 255, 255, 0.35);
  }
  .icon-btn:disabled {
    opacity: 0.32;
  }
  .area {
    position: relative;
    min-height: 0;
    margin: 8px 16px 0;
    display: grid;
    place-items: center;
  }
  .stage {
    position: relative;
    overflow: hidden;
    border-radius: var(--r-md);
    background: #000;
    box-shadow: 0 0 0 1px var(--line-strong), 0 32px 64px -24px rgba(0, 0, 0, 0.9);
    transition:
      width 0.4s var(--ease-out),
      height 0.4s var(--ease-out),
      box-shadow 0.4s var(--ease-out);
  }
  .stage.counting {
    box-shadow: 0 0 0 2px var(--accent), 0 4px 120px rgba(var(--accent-rgb), 0.45);
  }
  .stage.overlay {
    background: transparent;
    border-radius: var(--r-sm);
  }
  .win {
    position: absolute;
    overflow: hidden;
    background: #000;
  }
  .live-frame {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    z-index: 2;
    pointer-events: none;
  }
  .lead-scrim {
    position: absolute;
    inset: 0;
    z-index: 12;
    display: flex;
    align-items: flex-end;
    background: rgba(0, 0, 0, 0.55);
  }
  .lead,
  .copies {
    width: 100%;
    max-height: 100%;
    overflow-y: auto;
    display: grid;
    gap: 16px;
    padding: 24px 16px calc(var(--safe-bottom) + 16px);
  }
  .lead h2,
  .copies h2 {
    font-size: 24px;
    font-weight: 500;
    letter-spacing: -0.03em;
  }
  .lead-head {
    display: grid;
    gap: 4px;
  }
  .lf {
    display: grid;
    gap: 8px;
  }
  .lf span {
    font-size: 14px;
    color: var(--muted);
  }
  .lf em,
  .consent em {
    display: block;
    color: var(--danger);
    font-style: normal;
    font-size: 13px;
  }
  .input.bad {
    border-color: var(--danger);
  }
  .consent {
    position: relative;
    display: flex;
    align-items: flex-start;
    gap: 12px;
    font-size: 14px;
    line-height: 1.45;
    color: var(--muted);
  }
  .consent input {
    position: absolute;
    opacity: 0;
    width: 1px;
    height: 1px;
  }
  .consent .box {
    flex: none;
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    border: 2px solid var(--line-strong);
    color: transparent;
  }
  .consent .box.bad {
    border-color: var(--danger);
  }
  .consent input:checked + .box {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--on-accent);
  }
  .consent input:focus-visible + .box {
    outline: 2px solid var(--text);
    outline-offset: 2px;
  }
  .lead-actions {
    display: flex;
    gap: 8px;
  }
  .lead-actions .grow {
    flex: 1;
  }
  .copies {
    justify-items: center;
  }
  .stepper {
    display: flex;
    align-items: center;
    gap: 24px;
  }
  .num {
    min-width: 2ch;
    text-align: center;
    font-size: 56px;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
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
    font-size: min(80vw, 64vh);
    line-height: 1;
    font-weight: 500;
    letter-spacing: -0.07em;
    color: var(--accent);
    text-shadow: 0 8px 80px rgba(var(--accent-rgb), 0.55);
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
    border: 0 solid rgba(255, 255, 255, 0.9);
    z-index: 2;
    pointer-events: none;
    transition: border-color 0.3s var(--ease-out), transform 0.4s var(--ease-out);
  }
  .counting .corner {
    border-color: var(--accent);
  }
  .tl { top: 16px; left: 16px; border-top-width: 2px; border-left-width: 2px; }
  .tr { top: 16px; right: 16px; border-top-width: 2px; border-right-width: 2px; }
  .bl { bottom: 16px; left: 16px; border-bottom-width: 2px; border-left-width: 2px; }
  .br { bottom: 16px; right: 16px; border-bottom-width: 2px; border-right-width: 2px; }
  .counting .tl { transform: translate(-8px, -8px); }
  .counting .tr { transform: translate(8px, -8px); }
  .counting .bl { transform: translate(-8px, 8px); }
  .counting .br { transform: translate(8px, 8px); }
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
    line-height: 1.4;
  }
  .cam-loading span {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: 2px solid rgba(255, 255, 255, 0.16);
    border-top-color: var(--accent);
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  .status {
    display: grid;
    justify-items: center;
    gap: 8px;
    padding-top: 16px;
  }
  .pose-bar {
    display: flex;
    gap: 4px;
  }
  .pose-bar i {
    width: 24px;
    height: 4px;
    border-radius: 2px;
    background: var(--line-strong);
    transition: background 0.3s var(--ease-out), width 0.4s var(--ease-out);
  }
  .pose-bar i.done {
    background: var(--text);
  }
  .pose-bar i.now {
    width: 40px;
    background: var(--accent);
  }
  .dock {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    padding: 16px 24px calc(var(--safe-bottom) + 24px);
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
    border-radius: var(--r-xs);
    display: grid;
    place-items: center;
    box-shadow: inset 0 0 0 1px var(--line-strong);
    color: var(--muted);
  }
  .gallery img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: var(--r-xs);
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.6);
  }
  .gallery em {
    position: absolute;
    top: -8px;
    right: -8px;
    min-width: 24px;
    height: 24px;
    padding: 0 8px;
    border-radius: 9999px;
    display: grid;
    place-items: center;
    background: var(--text);
    color: #262626;
    font-style: normal;
    font-family: var(--mono);
    font-size: 12px;
  }
  .gallery:disabled,
  .timer:disabled {
    opacity: 0.32;
  }
  .shutter {
    width: 96px;
    height: 96px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    transition: transform 0.3s var(--ease-spring);
  }
  .shutter:active {
    transform: scale(0.92);
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
    box-shadow: inset 0 0 0 2px var(--text), 0 0 0 8px rgba(255, 255, 255, 0.04);
  }
  .core {
    width: 72px;
    height: 72px;
    border-radius: 50%;
    background: var(--accent);
    box-shadow: var(--glass), 0 0 40px rgba(var(--accent-rgb), 0.45);
    transition: transform 0.3s var(--ease-spring);
  }
  .shutter:active .core {
    transform: scale(0.86);
  }
  .shutter.cancel .ring {
    box-shadow: inset 0 0 0 2px var(--accent), 0 0 48px rgba(var(--accent-rgb), 0.35);
    color: var(--accent);
  }
  .timer {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 48px;
    padding: 0 16px;
    border-radius: 9999px;
    box-shadow: inset 0 0 0 1px var(--line-strong);
    font-weight: 500;
    font-size: 15px;
    transition: background 0.2s var(--ease-out), color 0.2s var(--ease-out), box-shadow 0.2s var(--ease-out);
  }
  .timer.on {
    background: var(--accent);
    color: var(--on-accent);
    box-shadow: var(--glass);
  }
  .map {
    position: absolute;
    right: 24px;
    top: calc(var(--safe-top) + 88px);
    width: 40px;
    z-index: 3;
    pointer-events: none;
    filter: drop-shadow(0 8px 16px rgba(0, 0, 0, 0.6));
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
      margin: 0 0 calc(var(--safe-bottom) + 16px) 16px;
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
      bottom: 24px;
      right: auto;
      left: 32px;
    }
  }
</style>
