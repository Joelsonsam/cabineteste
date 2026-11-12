import { FORMATS, type FormatId, type Rect } from './formats';

export type FilterId = 'original' | 'pb' | 'quente';

export const FILTERS: { id: FilterId; name: string; css: string }[] = [
  { id: 'original', name: 'Original', css: 'none' },
  { id: 'pb', name: 'P&B', css: 'grayscale(1) contrast(1.12) brightness(1.02)' },
  { id: 'quente', name: 'Quente', css: 'sepia(0.22) saturate(1.22) brightness(1.03) hue-rotate(-6deg)' },
];

export const filterCss = (id: FilterId) => FILTERS.find((f) => f.id === id)?.css ?? 'none';

export type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;
type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
export type Drawable = CanvasImageSource & { width: number; height: number };

export function makeCanvas(w: number, h: number): AnyCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function coverRect(srcW: number, srcH: number, dstW: number, dstH: number): Rect {
  const sr = srcW / srcH;
  const dr = dstW / dstH;
  if (sr > dr) {
    const w = srcH * dr;
    return { x: (srcW - w) / 2, y: 0, w, h: srcH };
  }
  const h = srcW / dr;
  return { x: 0, y: (srcH - h) / 2, w: srcW, h };
}

export interface UnitInput {
  format: FormatId;
  windows: Rect[];
  photos: (Drawable | null)[];
  frame: Drawable | null;
  filter: FilterId;
  eventName: string;
  accent: string;
  date?: Date;
  scale?: number;
}

const PAPER = '#F4F2EC';
const INK = '#1C1B19';
const EMPTY = '#D9D5CC';

export function renderUnit(input: UnitInput): AnyCanvas {
  const f = FORMATS[input.format];
  const s = input.scale ?? 1;
  const W = Math.round(f.unitPx[0] * s);
  const H = Math.round(f.unitPx[1] * s);
  const canvas = makeCanvas(W, H);
  const ctx = canvas.getContext('2d') as Ctx;
  ctx.imageSmoothingQuality = 'high';

  ctx.fillStyle = input.frame ? '#FFFFFF' : PAPER;
  ctx.fillRect(0, 0, W, H);

  input.windows.forEach((win, i) => {
    const r = { x: win.x * s, y: win.y * s, w: win.w * s, h: win.h * s };
    const photo = input.photos[i];
    if (!photo) {
      ctx.fillStyle = EMPTY;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      return;
    }
    const src = coverRect(photo.width, photo.height, r.w, r.h);
    ctx.save();
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.w, r.h);
    ctx.clip();
    ctx.filter = filterCss(input.filter);
    ctx.drawImage(photo, src.x, src.y, src.w, src.h, r.x, r.y, r.w, r.h);
    ctx.restore();
  });

  if (input.frame) {
    ctx.drawImage(input.frame, 0, 0, W, H);
  } else {
    drawDefaultFooter(ctx, input, W, H, s);
  }
  return canvas;
}

function drawDefaultFooter(ctx: Ctx, input: UnitInput, W: number, H: number, s: number) {
  const last = input.windows.reduce((m, r) => Math.max(m, r.y + r.h), 0) * s;
  const first = input.windows[0];
  const left = (first?.x ?? 40) * s;
  const right = W - left;
  const band = H - last;
  if (band < 30 * s) return;
  const size = Math.min(band * 0.34, W * 0.075);
  const mid = last + band / 2;

  ctx.fillStyle = input.accent;
  ctx.fillRect(left, last + band * 0.18, Math.max(4 * s, size * 0.12), band * 0.64);

  ctx.fillStyle = INK;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = `500 ${size}px "Host Grotesk Variable", system-ui, sans-serif`;
  const textX = left + size * 0.45;
  const date = (input.date ?? new Date()).toLocaleDateString('pt-BR');
  const dateSize = size * 0.5;
  const maxName = right - textX - (W > H * 0.6 ? dateSize * 6 : 0);
  ctx.fillText(fit(ctx, input.eventName || 'Mude!', maxName), textX, mid - (W > H * 0.6 ? 0 : size * 0.32));

  ctx.font = `500 ${dateSize}px "Host Grotesk Variable", system-ui, sans-serif`;
  ctx.fillStyle = '#6B6760';
  if (W > H * 0.6) {
    ctx.textAlign = 'right';
    ctx.fillText(date, right, mid);
  } else {
    ctx.fillText(date, textX, mid + size * 0.5);
  }
}

function fit(ctx: Ctx, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > max) t = t.slice(0, -1);
  return t + '…';
}

export function renderSheet(unit: AnyCanvas, format: FormatId): AnyCanvas {
  const f = FORMATS[format];
  if (f.copies === 1 && unit.width === f.sheetPx[0] && unit.height === f.sheetPx[1]) return unit;
  const sheet = makeCanvas(f.sheetPx[0], f.sheetPx[1]);
  const ctx = sheet.getContext('2d') as Ctx;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, sheet.width, sheet.height);
  for (const p of f.placements) ctx.drawImage(unit, p.x, p.y, f.unitPx[0], f.unitPx[1]);
  return sheet;
}

export async function canvasToBlob(canvas: AnyCanvas, type = 'image/jpeg', quality = 0.94): Promise<Blob> {
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type, quality });
  return new Promise((resolve, reject) =>
    (canvas as HTMLCanvasElement).toBlob((b) => (b ? resolve(b) : reject(new Error('Falha ao gerar imagem'))), type, quality)
  );
}

export async function withJpegDpi(blob: Blob, dpi = 300): Promise<Blob> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  const isJfif =
    buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff && buf[3] === 0xe0 &&
    buf[6] === 0x4a && buf[7] === 0x46 && buf[8] === 0x49 && buf[9] === 0x46 && buf[10] === 0x00;
  if (!isJfif) return blob;
  buf[13] = 1;
  buf[14] = dpi >> 8;
  buf[15] = dpi & 0xff;
  buf[16] = dpi >> 8;
  buf[17] = dpi & 0xff;
  return new Blob([buf], { type: 'image/jpeg' });
}

export async function exportSheet(unit: AnyCanvas, format: FormatId): Promise<Blob> {
  const sheet = renderSheet(unit, format);
  return withJpegDpi(await canvasToBlob(sheet, 'image/jpeg', 0.95));
}

export async function thumbnail(source: AnyCanvas, maxSide = 520): Promise<Blob> {
  const k = Math.min(1, maxSide / Math.max(source.width, source.height));
  const c = makeCanvas(Math.round(source.width * k), Math.round(source.height * k));
  const ctx = c.getContext('2d') as Ctx;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, c.width, c.height);
  return canvasToBlob(c, 'image/jpeg', 0.82);
}
