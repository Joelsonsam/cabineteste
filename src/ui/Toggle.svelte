<script lang="ts">
  let { checked = $bindable(), label, hint = '' }: { checked: boolean; label: string; hint?: string } = $props();
</script>

<button class="row" role="switch" aria-checked={checked} onclick={() => (checked = !checked)}>
  <span class="text">
    <span class="label">{label}</span>
    {#if hint}<span class="hint">{hint}</span>{/if}
  </span>
  <span class="track" class:on={checked}><span class="knob"></span></span>
</button>

<style>
  .row {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 16px;
    min-height: 56px;
    text-align: left;
  }
  .text {
    flex: 1;
    display: grid;
    gap: 2px;
  }
  .label {
    font-weight: 600;
    font-size: 16px;
  }
  .hint {
    font-size: 13.5px;
    color: var(--muted);
  }
  .track {
    flex: none;
    width: 48px;
    height: 32px;
    border-radius: 999px;
    background: var(--raised);
    box-shadow: inset 0 0 0 1px var(--line-strong);
    position: relative;
    transition: background 0.25s var(--ease-out);
  }
  .track.on {
    background: var(--accent);
    box-shadow: none;
  }
  .knob {
    position: absolute;
    top: 4px;
    left: 4px;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: var(--text);
    transition: transform 0.28s var(--ease-spring);
  }
  .track.on .knob {
    transform: translateX(16px);
    background: var(--on-accent);
  }
</style>
