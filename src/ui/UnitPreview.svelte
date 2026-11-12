<script lang="ts">
  import { FORMATS, type FormatId, type Rect } from '../core/formats';
  import { renderUnit, type Drawable, type FilterId } from '../core/compose';

  let {
    format,
    windows,
    frame = null,
    photos = [],
    filter = 'original',
    eventName = '',
    accent = '#FF5A36',
    numbers = true,
    highlight = -1,
    resolution = 0.32,
    class: cls = '',
  }: {
    format: FormatId;
    windows: Rect[];
    frame?: Blob | null;
    photos?: (Drawable | null)[];
    filter?: FilterId;
    eventName?: string;
    accent?: string;
    numbers?: boolean;
    highlight?: number;
    resolution?: number;
    class?: string;
  } = $props();

  let canvas: HTMLCanvasElement;
  let frameBmp: ImageBitmap | null = $state(null);
  let frameKey: Blob | null = null;

  $effect(() => {
    const f = frame;
    if (f === frameKey) return;
    frameKey = f;
    if (!f) {
      frameBmp = null;
      return;
    }
    let alive = true;
    createImageBitmap(f).then((b) => {
      if (alive) frameBmp = b;
      else b.close();
    });
    return () => {
      alive = false;
    };
  });

  $effect(() => {
    const spec = FORMATS[format];
    const s = resolution;
    const out = renderUnit({
      format,
      windows,
      photos,
      frame: frame ? frameBmp : null,
      filter,
      eventName,
      accent,
      scale: s,
    });
    if (!canvas) return;
    canvas.width = out.width;
    canvas.height = out.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(out, 0, 0);
    if (numbers) {
      windows.forEach((w, i) => {
        if (photos[i]) return;
        const cx = (w.x + w.w / 2) * s;
        const cy = (w.y + w.h / 2) * s;
        const size = Math.min(w.w, w.h) * s * 0.42;
        ctx.font = `500 ${size}px "Host Grotesk Variable", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = i === highlight ? accent : 'rgba(28,27,25,0.28)';
        ctx.fillText(String(i + 1), cx, cy + size * 0.04);
      });
    }
    if (highlight >= 0 && windows[highlight]) {
      const w = windows[highlight];
      ctx.strokeStyle = accent;
      ctx.lineWidth = Math.max(3, 10 * s);
      ctx.strokeRect(w.x * s, w.y * s, w.w * s, w.h * s);
    }
    void spec;
  });
</script>

<canvas bind:this={canvas} class={cls} style="aspect-ratio:{FORMATS[format].unitPx[0]}/{FORMATS[format].unitPx[1]}"></canvas>

<style>
  canvas {
    display: block;
    max-width: 100%;
    max-height: 100%;
  }
</style>
