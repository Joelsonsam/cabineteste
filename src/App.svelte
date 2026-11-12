<script lang="ts">
  import { onMount } from 'svelte';
  import { App as CapApp } from '@capacitor/app';
  import { app, back, loadAll, activeEvent } from './state.svelte';
  import { accentVars } from './core/util';
  import { isNative, requestPersistence } from './platform';
  import Events from './screens/Events.svelte';
  import EventSetup from './screens/EventSetup.svelte';
  import Booth from './screens/Booth.svelte';
  import Gallery from './screens/Gallery.svelte';
  import Settings from './screens/Settings.svelte';
  import Toasts from './ui/Toasts.svelte';

  const accent = $derived(activeEvent()?.accent ?? '#FF5E1F');
  const media = window.matchMedia('(prefers-color-scheme: light)');
  let systemLight = $state(media.matches);
  media.addEventListener('change', (e) => (systemLight = e.matches));
  const light = $derived(app.theme === 'light' || (app.theme === 'auto' && systemLight));
  $effect(() => {
    document.documentElement.style.background = light ? '#ffffff' : '#181818';
  });

  onMount(() => {
    loadAll();
    requestPersistence();
    const sig = [74, 111, 101, 108, 115, 111, 110, 32, 83, 97, 109, 112, 97, 105, 111];
    const mail = [106, 111, 101, 108, 115, 111, 110, 115, 97, 109, 64, 103, 109, 97, 105, 108, 46, 99, 111, 109];
    console.log(
      `%c◉ Cabine Mude! %c feito com carinho por ${String.fromCharCode(...sig)} · ${String.fromCharCode(...mail)}`,
      'font:700 14px sans-serif;color:#ff5a36',
      'font:12px sans-serif;color:#999'
    );
    if (!isNative) return;
    const sub = CapApp.addListener('backButton', () => {
      if (window.dispatchEvent(new CustomEvent('cabine:back', { cancelable: true })) && !back()) CapApp.minimizeApp();
    });
    return () => {
      sub.then((s) => s.remove());
    };
  });
</script>

<div class="root" class:theme-light={light} style={accentVars(accent)}>
  {#if app.ready}
    {#if app.route.name === 'events'}
      <Events />
    {:else if app.route.name === 'setup'}
      {#key app.route.id}
        <EventSetup id={app.route.id} />
      {/key}
    {:else if app.route.name === 'booth'}
      <Booth />
    {:else if app.route.name === 'gallery'}
      <Gallery />
    {:else if app.route.name === 'settings'}
      <Settings />
    {/if}
  {/if}
  <Toasts />
</div>

<style>
  .root {
    position: fixed;
    inset: 0;
    background: var(--graphite);
  }
</style>
