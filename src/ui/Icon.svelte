<script lang="ts" module>
  const PATHS: Record<string, string> = {
    back: 'M15 5l-7 7 7 7',
    close: 'M6 6l12 12M18 6L6 18',
    plus: 'M12 5v14M5 12h14',
    check: 'M5 12.5l4.5 4.5L19 7.5',
    camera: 'M4 8.5A1.5 1.5 0 0 1 5.5 7h2.2l1.5-2h5.6l1.5 2h2.2A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5zM12 16a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z',
    gallery: 'M4 6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5zM4 15l4.5-4.5 4 4 2.5-2.5L20 17M15.5 9.5h.01',
    settings: 'M5 7h9M18 7h1M5 17h3M12 17h7M16 5v4M10 15v4',
    timer: 'M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 9v4l2.5 1.5M9.5 2.5h5',
    flash: 'M13 3L5 13.5h6L10 21l8-10.5h-6z',
    flashOff: 'M13 3l-3.2 4.2M7.8 10L5 13.5h6L10 21l3.6-4.7M16.4 12.5L18 10.5h-6M4 4l16 16',
    print: 'M7 9V4h10v5M7 17H5a1 1 0 0 1-1-1v-5.5A1.5 1.5 0 0 1 5.5 9h13a1.5 1.5 0 0 1 1.5 1.5V16a1 1 0 0 1-1 1h-2M7 14h10v6H7z',
    save: 'M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19h14',
    share: 'M12 15V4M8 7.5L12 3.5l4 4M6 11v7.5A1.5 1.5 0 0 0 7.5 20h9a1.5 1.5 0 0 0 1.5-1.5V11',
    trash: 'M5 7h14M10 7V4.5h4V7M7 7l1 12.5h8L17 7M10.5 11v5M13.5 11v5',
    retake: 'M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4 4v4h4',
    flip: 'M4 9.5A1.5 1.5 0 0 1 5.5 8H8l1.5-2h5L16 8h2.5A1.5 1.5 0 0 1 20 9.5v8a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5zM9.3 14.8a3 3 0 0 0 5.2-.8M14.7 12.2a3 3 0 0 0-5.2.8M14.8 11v1.3h-1.3M9.2 16v-1.3h1.3',
    frame: 'M4 4h16v16H4zM8 8h8v5H8zM8 16h4',
    edit: 'M14.5 5.5l4 4M4 20l1-4.5L15.5 5a1.4 1.4 0 0 1 2 0l1.5 1.5a1.4 1.4 0 0 1 0 2L8.5 19z',
    archive: 'M4 5h16v4H4zM5.5 9v10h13V9M10 13h4',
    more: 'M12 6.5h.01M12 12h.01M12 17.5h.01',
    upload: 'M12 16V5M7.5 9.5L12 5l4.5 4.5M5 19h14',
    wand: 'M5 19L15 9M14 4v3M19 9h-3M18 5l-2 2M9 4v1.5M4 9h1.5',
    sound: 'M5 9.5h3l4-3.5v12l-4-3.5H5zM15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11',
    mute: 'M5 9.5h3l4-3.5v12l-4-3.5H5zM16 9.5l5 5M21 9.5l-5 5',
    layers: 'M12 4l8 4.5-8 4.5-8-4.5zM4 13l8 4.5 8-4.5',
    grid: 'M5 5h6v6H5zM13 5h6v6h-6zM5 13h6v6H5zM13 13h6v6h-6z',
    alert: 'M12 4l9 16H3zM12 10v4.5M12 17.2h.01',
  };
</script>

<script lang="ts">
  let { name, size = 24, stroke = 1.8 }: { name: keyof typeof PATHS | string; size?: number; stroke?: number } = $props();
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width={stroke}
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  <path d={PATHS[name] ?? ''} />
</svg>
