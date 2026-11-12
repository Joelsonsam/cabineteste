import type { Rect } from './formats';

export interface AlphaSource {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface DetectOptions {
  alphaThreshold?: number;
  minAreaRatio?: number;
  maxWindows?: number;
  workSize?: number;
}

export interface DetectResult {
  windows: Rect[];
  ignored: number;
  outerTransparent: boolean;
}

function downsampleAlpha(src: AlphaSource, scale: number, threshold: number) {
  const w = Math.max(1, Math.round(src.width / scale));
  const h = Math.max(1, Math.round(src.height / scale));
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const sy0 = Math.floor(y * scale);
    const sy1 = Math.min(src.height, Math.floor((y + 1) * scale));
    for (let x = 0; x < w; x++) {
      const sx0 = Math.floor(x * scale);
      const sx1 = Math.min(src.width, Math.floor((x + 1) * scale));
      let clear = 0;
      let total = 0;
      for (let sy = sy0; sy < Math.max(sy1, sy0 + 1); sy++) {
        for (let sx = sx0; sx < Math.max(sx1, sx0 + 1); sx++) {
          total++;
          if (src.data[(sy * src.width + sx) * 4 + 3] < threshold) clear++;
        }
      }
      mask[y * w + x] = clear * 2 >= total ? 1 : 0;
    }
  }
  return { mask, w, h };
}

interface Component {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  area: number;
  edges: number;
}

function label(mask: Uint8Array, w: number, h: number): Component[] {
  const seen = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  const out: Component[] = [];
  for (let start = 0; start < w * h; start++) {
    if (!mask[start] || seen[start]) continue;
    let top = 0;
    stack[top++] = start;
    seen[start] = 1;
    const c: Component = { minX: w, minY: h, maxX: 0, maxY: 0, area: 0, edges: 0 };
    while (top > 0) {
      const i = stack[--top];
      const x = i % w;
      const y = (i - x) / w;
      c.area++;
      if (x < c.minX) c.minX = x;
      if (x > c.maxX) c.maxX = x;
      if (y < c.minY) c.minY = y;
      if (y > c.maxY) c.maxY = y;
      if (x > 0 && mask[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; stack[top++] = i - 1; }
      if (x < w - 1 && mask[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; stack[top++] = i + 1; }
      if (y > 0 && mask[i - w] && !seen[i - w]) { seen[i - w] = 1; stack[top++] = i - w; }
      if (y < h - 1 && mask[i + w] && !seen[i + w]) { seen[i + w] = 1; stack[top++] = i + w; }
    }
    c.edges = (c.minX === 0 ? 1 : 0) + (c.minY === 0 ? 1 : 0) + (c.maxX === w - 1 ? 1 : 0) + (c.maxY === h - 1 ? 1 : 0);
    out.push(c);
  }
  return out;
}

function refine(src: AlphaSource, coarse: Rect, pad: number, threshold: number): Rect {
  const x0 = Math.max(0, Math.floor(coarse.x - pad));
  const y0 = Math.max(0, Math.floor(coarse.y - pad));
  const x1 = Math.min(src.width - 1, Math.ceil(coarse.x + coarse.w + pad));
  const y1 = Math.min(src.height - 1, Math.ceil(coarse.y + coarse.h + pad));
  let minX = x1, minY = y1, maxX = x0, maxY = y0;
  let found = false;
  for (let y = y0; y <= y1; y++) {
    const row = y * src.width;
    for (let x = x0; x <= x1; x++) {
      if (src.data[(row + x) * 4 + 3] < threshold) {
        found = true;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (!found) return coarse;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

export function sortReadingOrder(rects: Rect[]): Rect[] {
  const items = [...rects].sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2));
  const rows: Rect[][] = [];
  for (const r of items) {
    const cy = r.y + r.h / 2;
    const row = rows.find((row) => {
      const ref = row[0];
      return Math.abs(ref.y + ref.h / 2 - cy) < Math.min(ref.h, r.h) * 0.35;
    });
    if (row) row.push(r);
    else rows.push([r]);
  }
  return rows.flatMap((row) => row.sort((a, b) => a.x - b.x));
}

export function detectWindows(src: AlphaSource, opts: DetectOptions = {}): DetectResult {
  const threshold = opts.alphaThreshold ?? 26;
  const minAreaRatio = opts.minAreaRatio ?? 0.004;
  const maxWindows = opts.maxWindows ?? 6;
  const workSize = opts.workSize ?? 420;

  const scale = Math.max(1, Math.max(src.width, src.height) / workSize);
  const { mask, w, h } = downsampleAlpha(src, scale, threshold);
  const comps = label(mask, w, h);
  const total = w * h;

  let ignored = 0;
  let outerTransparent = false;
  const kept: Component[] = [];
  for (const c of comps) {
    if (c.area < total * minAreaRatio) {
      ignored++;
      continue;
    }
    const fill = c.area / ((c.maxX - c.minX + 1) * (c.maxY - c.minY + 1));
    if (c.edges >= 3 && fill < 0.55) {
      outerTransparent = true;
      ignored++;
      continue;
    }
    kept.push(c);
  }

  kept.sort((a, b) => b.area - a.area);
  const chosen = kept.slice(0, maxWindows);
  ignored += kept.length - chosen.length;

  const windows = chosen.map((c) =>
    refine(
      src,
      { x: c.minX * scale, y: c.minY * scale, w: (c.maxX - c.minX + 1) * scale, h: (c.maxY - c.minY + 1) * scale },
      scale * 1.5,
      threshold
    )
  );

  return { windows: sortReadingOrder(windows), ignored, outerTransparent };
}
