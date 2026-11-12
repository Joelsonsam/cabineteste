export const DPI = 300;

export const cmToPx = (cm: number) => Math.round((cm * DPI) / 2.54);

export type FormatId = 'lembranca-retrato' | 'lembranca-paisagem' | 'tirinha' | 'polaroid';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FormatSpec {
  id: FormatId;
  name: string;
  hint: string;
  unitCm: [number, number];
  sheetCm: [number, number];
  unitPx: [number, number];
  sheetPx: [number, number];
  copies: number;
  placements: { x: number; y: number }[];
  landscape: boolean;
  maxPoses: number;
}

function spec(
  id: FormatId,
  name: string,
  hint: string,
  unitCm: [number, number],
  sheetCm: [number, number],
  copies: number,
  maxPoses: number
): FormatSpec {
  const unitPx: [number, number] = [cmToPx(unitCm[0]), cmToPx(unitCm[1])];
  const sheetPx: [number, number] = [cmToPx(sheetCm[0]), cmToPx(sheetCm[1])];
  const placements =
    copies === 1
      ? [{ x: 0, y: 0 }]
      : [
          { x: 0, y: 0 },
          { x: sheetPx[0] - unitPx[0], y: 0 },
        ];
  return {
    id,
    name,
    hint,
    unitCm,
    sheetCm,
    unitPx,
    sheetPx,
    copies,
    placements,
    landscape: sheetCm[0] > sheetCm[1],
    maxPoses,
  };
}

export const FORMATS: Record<FormatId, FormatSpec> = {
  'lembranca-retrato': spec('lembranca-retrato', 'Foto lembrança', 'Vertical, foto única', [10, 15], [10, 15], 1, 1),
  'lembranca-paisagem': spec('lembranca-paisagem', 'Foto lembrança', 'Horizontal, foto única', [15, 10], [15, 10], 1, 1),
  tirinha: spec('tirinha', 'Tirinha', 'Duas tiras por folha 10 × 15', [5, 15], [10, 15], 2, 4),
  polaroid: spec('polaroid', 'Polaroid', 'Foto única, duas por folha 15 × 10', [7.5, 10], [15, 10], 2, 1),
};

export const FORMAT_ORDER: FormatId[] = ['lembranca-retrato', 'lembranca-paisagem', 'tirinha', 'polaroid'];

export function formatCm(c: [number, number]) {
  const f = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  return `${f(c[0])} × ${f(c[1])} cm`;
}

export function formatPx(p: [number, number]) {
  return `${p[0]} × ${p[1]} px`;
}

export const SAFE_MARGIN_PX = cmToPx(0.3);

export function defaultWindows(format: FormatId, poses: number): Rect[] {
  const f = FORMATS[format];
  const [W, H] = f.unitPx;
  const m = Math.round(Math.min(W, H) * 0.06);
  const gap = Math.round(m * 0.6);
  const n = Math.max(1, Math.min(poses, f.maxPoses));

  if (format === 'polaroid') {
    const side = W - m * 2;
    if (n === 1) return [{ x: m, y: m, w: side, h: side }];
    const h = Math.round((H * 0.78 - m - gap) / 2);
    return [
      { x: m, y: m, w: side, h },
      { x: m, y: m + h + gap, w: side, h },
    ];
  }

  const footer = Math.round(H * (format === 'tirinha' ? 0.13 : f.landscape ? 0.16 : 0.12));
  const areaW = W - m * 2;
  const areaH = H - m - footer;

  if (n === 1) return [{ x: m, y: m, w: areaW, h: areaH }];

  if (format === 'tirinha' || (!f.landscape && n <= 3)) {
    const h = Math.round((areaH - gap * (n - 1)) / n);
    return Array.from({ length: n }, (_, i) => ({ x: m, y: m + i * (h + gap), w: areaW, h }));
  }

  if (f.landscape && n <= 3) {
    const w = Math.round((areaW - gap * (n - 1)) / n);
    return Array.from({ length: n }, (_, i) => ({ x: m + i * (w + gap), y: m, w, h: areaH }));
  }

  const w = Math.round((areaW - gap) / 2);
  const h = Math.round((areaH - gap) / 2);
  return Array.from({ length: 4 }, (_, i) => ({
    x: m + (i % 2) * (w + gap),
    y: m + Math.floor(i / 2) * (h + gap),
    w,
    h,
  }));
}
