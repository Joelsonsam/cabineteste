<script lang="ts" generics="T extends string | number">
  let {
    options,
    value = $bindable(),
    label,
  }: { options: { value: T; label: string }[]; value: T; label: string } = $props();
</script>

<div class="seg" role="radiogroup" aria-label={label}>
  {#each options as o (o.value)}
    <button role="radio" aria-checked={value === o.value} class:on={value === o.value} onclick={() => (value = o.value)}>
      {o.label}
    </button>
  {/each}
</div>

<style>
  .seg {
    display: flex;
    padding: 4px;
    border-radius: 9999px;
    box-shadow: inset 0 0 0 1px var(--line-strong);
  }
  button {
    flex: 1;
    min-height: 48px;
    border-radius: 9999px;
    font-weight: 500;
    font-size: 16px;
    letter-spacing: -0.01em;
    color: var(--muted);
    transition: background 0.2s var(--ease-out), color 0.2s var(--ease-out), box-shadow 0.2s var(--ease-out);
  }
  button.on {
    background: var(--accent);
    color: var(--on-accent);
    box-shadow: var(--glass);
  }
</style>
