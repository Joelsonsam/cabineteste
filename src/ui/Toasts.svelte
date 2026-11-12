<script lang="ts">
  import { fly } from 'svelte/transition';
  import { app } from '../state.svelte';
  import Icon from './Icon.svelte';
</script>

<div class="toasts" aria-live="polite">
  {#each app.toasts as t (t.id)}
    <div class="toast {t.tone}" in:fly={{ y: -16, duration: 260 }} out:fly={{ y: -10, duration: 180 }}>
      <Icon name={t.tone === 'error' ? 'alert' : 'check'} size={20} stroke={2.2} />
      <span>{t.text}</span>
    </div>
  {/each}
</div>

<style>
  .toasts {
    position: fixed;
    top: calc(var(--safe-top) + 12px);
    left: 0;
    right: 0;
    display: grid;
    justify-items: center;
    gap: 8px;
    pointer-events: none;
    z-index: 100;
  }
  .toast {
    display: flex;
    align-items: center;
    gap: 8px;
    max-width: calc(100% - 32px);
    padding: 12px 16px 12px 16px;
    border-radius: 999px;
    background: var(--panel-solid);
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.45), inset 0 0 0 1px var(--line);
    font-weight: 580;
    font-size: 15px;
  }
  .toast.ok :global(svg) {
    color: var(--ok);
  }
  .toast.error :global(svg) {
    color: var(--danger);
  }
  .toast.info :global(svg) {
    color: var(--accent);
  }
</style>
