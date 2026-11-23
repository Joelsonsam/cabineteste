<script lang="ts">
  import { onMount } from 'svelte';
  import { scale } from 'svelte/transition';
  import { app, back, go, setSoundPref, setThemePref, setTotemPrefs, type ThemePref } from '../state.svelte';
  import { TOTEM } from '../target';
  import { listCameras, type CameraInfo } from '../core/camera';
  import type { Rotation, TotemPrefs } from '../core/totem';
  import Segmented from '../ui/Segmented.svelte';
  import { FORMATS, FORMAT_ORDER, formatSize, formatPx } from '../core/formats';
  import { formatBytes, vibrate } from '../core/util';
  import { clearShareCache, isNative, storageEstimate } from '../platform';
  import Icon from '../ui/Icon.svelte';
  import Toggle from '../ui/Toggle.svelte';

  let sound = $state(app.sound);
  $effect(() => {
    if (sound !== app.sound) setSoundPref(sound);
  });

  let theme: ThemePref = $state(app.theme);
  $effect(() => {
    if (theme !== app.theme) setThemePref(theme);
  });

  let usage: { used: number; quota: number } | null = $state(null);
  let cams: CameraInfo[] = $state([]);
  onMount(async () => {
    usage = await storageEstimate();
    clearShareCache();
    if (TOTEM) {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        s.getTracks().forEach((t) => t.stop());
      } catch {
        /* sem câmera */
      }
      cams = await listCameras();
    }
  });

  let cameraId = $state(app.totem.cameraId ?? '');
  let resolution: TotemPrefs['resolution'] = $state(app.totem.resolution);
  let rotation: Rotation = $state(app.totem.rotation);
  let mirror = $state(app.totem.mirror);
  let guestPrint = $state(app.totem.guestPrint);
  let idleSeconds = $state(app.totem.idleSeconds);
  let maxRetakes = $state(app.totem.maxRetakes);
  let pin = $state(app.totem.pin);
  $effect(() => {
    if (!TOTEM) return;
    const next = { cameraId: cameraId || null, resolution, rotation, mirror, guestPrint, idleSeconds, maxRetakes };
    const cur = app.totem;
    if (Object.entries(next).some(([k, v]) => cur[k as keyof TotemPrefs] !== v)) setTotemPrefs(next);
  });
  function savePin() {
    if (!/^\d{4,6}$/.test(pin)) {
      pin = app.totem.pin;
      return;
    }
    if (pin !== app.totem.pin) setTotemPrefs({ pin });
  }

  let taps = $state(0);
  let credit = $state(false);
  function tapVersion() {
    taps++;
    if (taps >= 7 && !credit) {
      credit = true;
      vibrate([20, 40, 20]);
    }
  }
  const who = String.fromCharCode(74, 111, 101, 108, 115, 111, 110, 32, 83, 97, 109, 112, 97, 105, 111);
  const mail = String.fromCharCode(106, 111, 101, 108, 115, 111, 110, 115, 97, 109, 64, 103, 109, 97, 105, 108, 46, 99, 111, 109);
</script>

<section class="screen">
  <header class="topbar">
    <button class="icon-btn" aria-label="Voltar" onclick={() => back()}><Icon name="back" /></button>
    <h1 class="title-md">Ajustes</h1>
  </header>

  <div class="scroll">
    <div class="body">
      {#if TOTEM}
        <div class="block">
          <h2 class="h">Totem</h2>
          <label class="field">
            <span>Câmera</span>
            <select class="input" bind:value={cameraId}>
              <option value="">Automática (prefere a Logitech)</option>
              {#each cams as c (c.deviceId)}<option value={c.deviceId}>{c.label}</option>{/each}
            </select>
          </label>
          <div class="field">
            <span>Resolução da câmera</span>
            <Segmented label="Resolução" bind:value={resolution} options={[{ value: 720, label: '720p' }, { value: 1080, label: '1080p' }, { value: 2160, label: '4K' }]} />
          </div>
          <div class="field">
            <span>Girar a imagem</span>
            <Segmented label="Girar" bind:value={rotation} options={[{ value: 0, label: '0°' }, { value: 90, label: '90°' }, { value: 180, label: '180°' }, { value: 270, label: '270°' }]} />
          </div>
          <Toggle bind:checked={mirror} label="Espelhar a prévia" hint="O convidado se vê como num espelho; a foto sai sem espelho" />
          <Toggle bind:checked={guestPrint} label="Botão Imprimir para o convidado" />
          <div class="field">
            <span>Voltar à tela inicial após</span>
            <Segmented label="Inatividade" bind:value={idleSeconds} options={[{ value: 20, label: '20 s' }, { value: 40, label: '40 s' }, { value: 60, label: '60 s' }]} />
          </div>
          <div class="field">
            <span>Novas tentativas por convidado</span>
            <Segmented label="Tentativas" bind:value={maxRetakes} options={[{ value: 0, label: '0' }, { value: 1, label: '1' }, { value: 2, label: '2' }, { value: 3, label: '3' }]} />
          </div>
          <label class="field">
            <span>PIN do operador (4 a 6 números)</span>
            <input class="input" inputmode="numeric" maxlength="6" bind:value={pin} onblur={savePin} />
          </label>
          <p class="muted small">Na tela do convidado, segure o canto superior esquerdo por 2 segundos para abrir a área do operador.</p>
        </div>
      {/if}

      <button class="block link-row" onclick={() => go({ name: 'diagnostics' })}>
        <span><strong>Diagnóstico</strong><span class="muted small">Testa o aparelho, a câmera e a velocidade de montagem</span></span>
        <span class="chev"><Icon name="back" size={20} /></span>
      </button>

      <div class="block">
        <div class="field">
          <span>Aparência</span>
          <Segmented label="Aparência" bind:value={theme} options={[{ value: 'auto', label: 'Automático' }, { value: 'light', label: 'Claro' }, { value: 'dark', label: 'Escuro' }]} />
          <p class="muted small">A câmera, a revisão e a entrega ficam sempre no escuro para a foto se destacar.</p>
        </div>
      </div>

      <div class="block">
        <Toggle bind:checked={sound} label="Sons da contagem e do disparo" />
      </div>

      <div class="block">
        <h2 class="h">Armazenamento</h2>
        {#if usage}
          <div class="meter"><span style="transform:scaleX({usage.quota ? Math.min(1, usage.used / usage.quota) : 0})"></span></div>
          <p class="muted small">{formatBytes(usage.used)} usados de {formatBytes(usage.quota)} disponíveis para o app.</p>
        {:else}
          <p class="muted small">O aparelho não informa o uso de espaço.</p>
        {/if}
        <p class="muted small">Para liberar espaço, exporte o ZIP e limpe a galeria de eventos antigos.</p>
      </div>

      <div class="block">
        <h2 class="h">Medidas para o design</h2>
        <p class="muted small">PNG RGB com transparência nas janelas, no tamanho exato abaixo. Margem de segurança de 3 mm das bordas e do corte.</p>
        <table>
          <thead><tr><th>Formato</th><th>Moldura</th><th>Pixels</th></tr></thead>
          <tbody>
            {#each FORMAT_ORDER as id (id)}
              {@const f = FORMATS[id]}
              <tr>
                <td>{f.name}{id.startsWith('lembranca') ? (f.landscape ? ' paisagem' : ' retrato') : ''}</td>
                <td class="mono">{formatSize(f)}</td>
                <td class="mono">{formatPx(f.unitPx)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <div class="block about">
        <button class="version mono" onclick={tapVersion}>
          Cabine Mude! versão 0.1 {isNative ? 'Android' : 'web'}
        </button>
        {#if credit}
          <p class="credit" in:scale={{ start: 0.8, duration: 380 }}>
            Desenhada e construída por {who}<br /><span>{mail}</span>
          </p>
        {/if}
      </div>
    </div>
  </div>
</section>

<style>
  .body {
    display: grid;
    gap: 16px;
    padding: 4px 16px calc(var(--safe-bottom) + 32px);
  }
  .block {
    display: grid;
    gap: 8px;
    padding: 16px;
    border-radius: var(--r-xs);
    background: var(--panel-solid);
    box-shadow: inset 0 0 0 1px var(--line);
  }
  .h {
    font-size: 18px;
    font-weight: 500;
  }
  .meter {
    height: 8px;
    border-radius: 999px;
    background: var(--raised);
    overflow: hidden;
  }
  .meter span {
    display: block;
    height: 100%;
    background: var(--accent);
    transform-origin: left;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 14.5px;
  }
  th {
    text-align: left;
    font-weight: 500;
    color: var(--muted);
    padding: 4px 0;
  }
  td {
    padding: 8px 0;
    border-top: 1px solid var(--line);
  }
  td:not(:first-child),
  th:not(:first-child) {
    text-align: right;
    white-space: nowrap;
    padding-left: 8px;
  }
  .link-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    text-align: left;
  }
  .link-row > span:first-child {
    display: grid;
    grid-gap: 4px;
    gap: 4px;
  }
  .chev {
    display: inline-flex;
    transform: rotate(180deg);
    color: var(--muted);
  }
  select.input {
    appearance: none;
    -webkit-appearance: none;
  }
  .about {
    background: transparent;
    box-shadow: none;
    justify-items: center;
    text-align: center;
  }
  .version {
    color: var(--faint);
    font-size: 13.5px;
    min-height: 48px;
  }
  .credit {
    font-size: 14px;
    color: var(--muted);
  }
  .credit span {
    color: var(--accent);
  }
</style>
