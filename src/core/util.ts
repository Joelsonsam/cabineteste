import { detectWindows, type DetectResult } from './frame-detect';

export const ACCENTS = ['#FF5A36', '#FFC531', '#3DDC97', '#33B6FF', '#7A6CFF', '#FF4FA3', '#F4F2EC', '#E2341D'];

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.padEnd(6, '0');
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}

function luminance([r, g, b]: [number, number, number]) {
  const ch = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

export function onAccent(hex: string) {
  return luminance(hexToRgb(hex)) > 0.36 ? '#17181C' : '#FFFFFF';
}

export function accentVars(hex: string) {
  const [r, g, b] = hexToRgb(hex);
  return `--accent:${hex};--accent-rgb:${r},${g},${b};--on-accent:${onAccent(hex)};`;
}

export async function blobToBitmap(blob: Blob): Promise<ImageBitmap> {
  return createImageBitmap(blob);
}

export async function analyzeFrame(blob: Blob, unitPx: [number, number]) {
  const bmp = await createImageBitmap(blob);
  const c = document.createElement('canvas');
  c.width = unitPx[0];
  c.height = unitPx[1];
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0, unitPx[0], unitPx[1]);
  const data = ctx.getImageData(0, 0, unitPx[0], unitPx[1]);
  const result: DetectResult = detectWindows({ data: data.data, width: data.width, height: data.height });
  const srcRatio = bmp.width / bmp.height;
  const dstRatio = unitPx[0] / unitPx[1];
  const sizeMatches = bmp.width === unitPx[0] && bmp.height === unitPx[1];
  const ratioOff = Math.abs(srcRatio - dstRatio) / dstRatio > 0.02;
  const lowRes = bmp.width < unitPx[0] * 0.9;
  const dims: [number, number] = [bmp.width, bmp.height];
  bmp.close();
  return { ...result, sizeMatches, ratioOff, lowRes, dims };
}

export function formatBytes(n: number) {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`;
  return `${(n / 1024 ** 3).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} GB`;
}

export function fileStamp(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export function slug(s: string) {
  return (
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'evento'
  );
}

export const vibrate = (ms: number | number[]) => {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* sem vibração */
  }
};
