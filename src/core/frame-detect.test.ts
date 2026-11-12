import { describe, expect, it } from 'vitest';
import { detectWindows } from './frame-detect';
import { defaultWindows, FORMATS } from './formats';

function frame(w: number, h: number, holes: { x: number; y: number; w: number; h: number; r?: number }[], outerClear = 0) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data[i * 4 + 3] = 255;
  for (const hole of holes) {
    for (let y = hole.y; y < hole.y + hole.h; y++) {
      for (let x = hole.x; x < hole.x + hole.w; x++) {
        const r = hole.r ?? 0;
        if (r) {
          const cx = Math.min(Math.max(x, hole.x + r), hole.x + hole.w - r - 1);
          const cy = Math.min(Math.max(y, hole.y + r), hole.y + hole.h - r - 1);
          if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
        }
        data[(y * w + x) * 4 + 3] = 0;
      }
    }
  }
  if (outerClear) {
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        if (x < outerClear || y < outerClear || x >= w - outerClear || y >= h - outerClear) data[(y * w + x) * 4 + 3] = 0;
  }
  return { data, width: w, height: h };
}

describe('detectWindows', () => {
  it('encontra três janelas de uma tirinha na ordem de leitura', () => {
    const [W, H] = FORMATS.tirinha.unitPx;
    const holes = defaultWindows('tirinha', 3);
    const res = detectWindows(frame(W, H, [...holes].reverse()));
    expect(res.windows).toHaveLength(3);
    res.windows.forEach((win, i) => {
      expect(Math.abs(win.x - holes[i].x)).toBeLessThanOrEqual(1);
      expect(Math.abs(win.y - holes[i].y)).toBeLessThanOrEqual(1);
      expect(Math.abs(win.w - holes[i].w)).toBeLessThanOrEqual(1);
      expect(Math.abs(win.h - holes[i].h)).toBeLessThanOrEqual(1);
    });
  });

  it('ordena grade 2x2 linha a linha', () => {
    const [W, H] = FORMATS['lembranca-paisagem'].unitPx;
    const holes = [
      { x: 60, y: 60, w: 800, h: 440 },
      { x: 910, y: 60, w: 800, h: 440 },
      { x: 60, y: 540, w: 800, h: 440 },
      { x: 910, y: 540, w: 800, h: 440 },
    ];
    const res = detectWindows(frame(W, H, [holes[3], holes[0], holes[2], holes[1]]));
    expect(res.windows.map((w) => [Math.round(w.x / 100), Math.round(w.y / 100)])).toEqual(
      holes.map((w) => [Math.round(w.x / 100), Math.round(w.y / 100)])
    );
  });

  it('ignora fundo externo transparente e ruído pequeno', () => {
    const [W, H] = FORMATS.polaroid.unitPx;
    const res = detectWindows(frame(W, H, [{ x: 80, y: 80, w: 720, h: 720, r: 40 }, { x: 400, y: 1000, w: 6, h: 6 }], 20));
    expect(res.windows).toHaveLength(1);
    expect(res.outerTransparent).toBe(true);
    expect(res.windows[0]).toMatchObject({ x: 80, y: 80, w: 720, h: 720 });
  });

  it('aceita janela sangrada encostando na borda', () => {
    const res = detectWindows(frame(1181, 1772, [{ x: 0, y: 0, w: 1181, h: 1300 }]));
    expect(res.windows).toHaveLength(1);
    expect(res.windows[0]).toMatchObject({ x: 0, y: 0, w: 1181, h: 1300 });
  });

  it('retorna vazio para moldura sem janelas', () => {
    expect(detectWindows(frame(400, 600, [])).windows).toHaveLength(0);
  });
});

describe('polaroid', () => {
  it('detecta a janela única da polaroid 7,5 x 10', () => {
    const [W, H] = FORMATS.polaroid.unitPx;
    const holes = defaultWindows('polaroid', 1);
    const res = detectWindows(frame(W, H, holes), { maxWindows: FORMATS.polaroid.maxPoses });
    expect(res.windows).toHaveLength(1);
    expect(FORMATS.polaroid.copies).toBe(2);
    expect(FORMATS.polaroid.placements[1].x).toBe(FORMATS.polaroid.sheetPx[0] - FORMATS.polaroid.unitPx[0]);
  });
});

describe('formatos', () => {
  it('mede em pixels a 300 dpi', () => {
    expect(FORMATS['lembranca-retrato'].unitPx).toEqual([1181, 1772]);
    expect(FORMATS.tirinha.unitPx).toEqual([591, 1772]);
    expect(FORMATS.tirinha.sheetPx).toEqual([1181, 1772]);
    expect(FORMATS.polaroid.unitPx).toEqual([886, 1181]);
    expect(FORMATS.polaroid.sheetPx).toEqual([1772, 1181]);
  });

  it('gera janelas padrão dentro da unidade', () => {
    for (const f of Object.values(FORMATS))
      for (let n = 1; n <= f.maxPoses; n++)
        for (const r of defaultWindows(f.id, n)) {
          expect(r.x).toBeGreaterThanOrEqual(0);
          expect(r.y).toBeGreaterThanOrEqual(0);
          expect(r.x + r.w).toBeLessThanOrEqual(f.unitPx[0]);
          expect(r.y + r.h).toBeLessThanOrEqual(f.unitPx[1]);
        }
  });
});

describe('filtros sem suporte de canvas', () => {
  it('converte em P&B e aquece mantendo o alfa', async () => {
    const { applyFilterPixels } = await import('./compose');
    const px = new Uint8ClampedArray([200, 100, 50, 255, 200, 100, 50, 255]);
    applyFilterPixels(px.subarray(0, 4), 'pb');
    expect(px[0]).toBe(px[1]);
    expect(px[1]).toBe(px[2]);
    expect(px[3]).toBe(255);
    applyFilterPixels(px.subarray(4, 8), 'quente');
    expect(px[4]).toBeGreaterThan(200);
    expect(px[6]).toBeLessThan(50);
  });
});
