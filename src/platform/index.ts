import { Capacitor, registerPlugin } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

interface CabineNative {
  print(opts: { data: string; landscape: boolean; jobName: string }): Promise<{ started: boolean }>;
  saveImage(opts: { data: string; fileName: string; album: string }): Promise<{ uri: string }>;
}

const Native = registerPlugin<CabineNative>('Cabine');

export const isNative = Capacitor.isNativePlatform();

export async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let out = '';
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) out += String.fromCharCode(...buf.subarray(i, i + chunk));
  return btoa(out);
}

function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function printSheet(blob: Blob, opts: { widthCm: number; heightCm: number; jobName: string }) {
  const landscape = opts.widthCm > opts.heightCm;
  if (isNative) {
    await Native.print({ data: await blobToBase64(blob), landscape, jobName: opts.jobName });
    return;
  }
  const url = URL.createObjectURL(blob);
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0;opacity:0';
  document.body.appendChild(frame);
  const doc = frame.contentDocument!;
  doc.open();
  doc.write(`<!doctype html><html><head><style>
    @page { size: ${opts.widthCm}cm ${opts.heightCm}cm; margin: 0 }
    html,body { margin:0; padding:0 }
    img { display:block; width:${opts.widthCm}cm; height:${opts.heightCm}cm }
  </style></head><body><img src="${url}"></body></html>`);
  doc.close();
  const img = doc.querySelector('img')!;
  await new Promise((r) => (img.complete ? r(null) : (img.onload = () => r(null))));
  frame.contentWindow!.focus();
  frame.contentWindow!.print();
  setTimeout(() => {
    frame.remove();
    URL.revokeObjectURL(url);
  }, 60000);
}

export async function saveToGallery(blob: Blob, fileName: string) {
  if (isNative) {
    await Native.saveImage({ data: await blobToBase64(blob), fileName, album: 'Cabine Mude' });
    return;
  }
  download(blob, fileName);
}

async function writeCacheFile(blob: Blob, fileName: string): Promise<string> {
  const path = `compartilhar/${fileName}`;
  const step = 3 * 1024 * 1024;
  for (let offset = 0; offset < blob.size; offset += step) {
    const data = await blobToBase64(blob.slice(offset, offset + step));
    if (offset === 0) await Filesystem.writeFile({ path, data, directory: Directory.Cache, recursive: true });
    else await Filesystem.appendFile({ path, data, directory: Directory.Cache });
  }
  const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache });
  return uri;
}

export async function shareFile(blob: Blob, fileName: string, title: string) {
  if (isNative) {
    const uri = await writeCacheFile(blob, fileName);
    await Share.share({ title, files: [uri], dialogTitle: title });
    return;
  }
  const file = new File([blob], fileName, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title });
    return;
  }
  download(blob, fileName);
}

export async function clearShareCache() {
  if (!isNative) return;
  await Filesystem.rmdir({ path: 'compartilhar', directory: Directory.Cache, recursive: true }).catch(() => undefined);
}

export function onHardwareShutter(handler: () => void): () => void {
  const fire = () => handler();
  window.addEventListener('cabine:shutter', fire);
  const key = (e: KeyboardEvent) => {
    if (e.code === 'Space' || e.key === 'Enter' || e.key === 'AudioVolumeUp' || e.key === 'AudioVolumeDown') {
      const t = e.target as HTMLElement;
      if (t?.closest('input, textarea, select, button')) return;
      e.preventDefault();
      handler();
    }
  };
  window.addEventListener('keydown', key);
  return () => {
    window.removeEventListener('cabine:shutter', fire);
    window.removeEventListener('keydown', key);
  };
}

export async function storageEstimate(): Promise<{ used: number; quota: number } | null> {
  if (!navigator.storage?.estimate) return null;
  const e = await navigator.storage.estimate();
  return { used: e.usage ?? 0, quota: e.quota ?? 0 };
}

export async function requestPersistence() {
  try {
    await navigator.storage?.persist?.();
  } catch {
    /* sem suporte */
  }
}
