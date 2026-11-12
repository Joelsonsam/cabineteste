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
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.25);
    box-shadow: inset 0 0 0 1px var(--line);
  }
  button {
    flex: 1;
    min-height: 48px;
    border-radius: 999px;
    font-weight: 600;
    font-size: 15px;
    color: var(--muted);
    transition: background 0.22s var(--ease-out), color 0.2s;
  }
  button.on {
    background: var(--text);
    color: var(--graphite);
  }
</style>
