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
    min-height: 64px;
    text-align: left;
  }
  .text {
    flex: 1;
    display: grid;
    gap: 4px;
  }
  .label {
    font-weight: 500;
    font-size: 16px;
    letter-spacing: -0.01em;
  }
  .hint {
    font-size: 14px;
    color: var(--muted);
    letter-spacing: -0.01em;
  }
  .track {
    flex: none;
    width: 48px;
    height: 32px;
    border-radius: 9999px;
    background: transparent;
    box-shadow: inset 0 0 0 1px var(--line-strong);
    position: relative;
    transition: background 0.2s var(--ease-out), box-shadow 0.2s var(--ease-out);
  }
  .track.on {
    background: var(--accent);
    box-shadow: var(--glass);
  }
  .knob {
    position: absolute;
    top: 4px;
    left: 4px;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: var(--knob);
    transition: transform 0.3s var(--ease-spring), background 0.2s;
  }
  .track.on .knob {
    transform: translateX(16px);
    background: var(--on-accent);
  }
</style>
