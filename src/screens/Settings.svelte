<script lang="ts">
  import { onMount } from 'svelte';
  import { scale } from 'svelte/transition';
  import { app, back, setSoundPref } from '../state.svelte';
  import { FORMATS, FORMAT_ORDER, formatCm, formatPx } from '../core/formats';
  import { formatBytes, vibrate } from '../core/util';
  import { clearShareCache, isNative, storageEstimate } from '../platform';
  import Icon from '../ui/Icon.svelte';
  import Toggle from '../ui/Toggle.svelte';

  let sound = $state(app.sound);
  $effect(() => {
    if (sound !== app.sound) setSoundPref(sound);
  });

  let usage: { used: number; quota: number } | null = $state(null);
  onMount(async () => {
    usage = await storageEstimate();
    clearShareCache();
  });

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
                <td>{formatCm(f.unitCm)}</td>
                <td>{formatPx(f.unitPx)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <div class="block about">
        <button class="version" onclick={tapVersion}>
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
    border-radius: var(--r-lg);
    background: var(--panel-solid);
    box-shadow: inset 0 0 0 1px var(--line);
  }
  .h {
    font-size: 18px;
    font-weight: 680;
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
    font-weight: 560;
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
