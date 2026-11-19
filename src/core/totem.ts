import { getSetting, setSetting } from './db';

export type Rotation = 0 | 90 | 180 | 270;

export interface TotemPrefs {
  cameraId: string | null;
  resolution: 720 | 1080 | 2160;
  rotation: Rotation;
  mirror: boolean;
  pin: string;
  idleSeconds: number;
  guestPrint: boolean;
  maxRetakes: number;
}

export const TOTEM_DEFAULTS: TotemPrefs = {
  cameraId: null,
  resolution: 1080,
  rotation: 0,
  mirror: true,
  pin: '1234',
  idleSeconds: 40,
  guestPrint: true,
  maxRetakes: 2,
};

export async function loadTotemPrefs(): Promise<TotemPrefs> {
  const saved = await getSetting<Partial<TotemPrefs>>('totem', {});
  return { ...TOTEM_DEFAULTS, ...saved };
}

export async function saveTotemPrefs(p: TotemPrefs) {
  await setSetting('totem', { ...p });
}

export const resolutionSize = (r: TotemPrefs['resolution']) =>
  r === 720 ? { width: 1280, height: 720 } : r === 1080 ? { width: 1920, height: 1080 } : { width: 3840, height: 2160 };

export async function rotateBitmap(bmp: ImageBitmap, rotation: Rotation): Promise<ImageBitmap> {
  if (rotation === 0) return bmp;
  const swap = rotation === 90 || rotation === 270;
  const c = document.createElement('canvas');
  c.width = swap ? bmp.height : bmp.width;
  c.height = swap ? bmp.width : bmp.height;
  const ctx = c.getContext('2d')!;
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.drawImage(bmp, -bmp.width / 2, -bmp.height / 2);
  bmp.close();
  return createImageBitmap(c);
}
