import type { CameraFacing } from './db';

type ImageCaptureLike = {
  takePhoto(settings?: Record<string, unknown>): Promise<Blob>;
  getPhotoCapabilities(): Promise<{ fillLightMode?: string[] }>;
};

declare global {
  interface Window {
    ImageCapture?: new (track: MediaStreamTrack) => ImageCaptureLike;
  }
}

export interface CameraState {
  stream: MediaStream | null;
  track: MediaStreamTrack | null;
  facing: CameraFacing;
  canFlash: boolean;
  canTorch: boolean;
  error: string | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface CameraOptions {
  deviceId?: string | null;
  width?: number;
  height?: number;
}

export interface CameraInfo {
  deviceId: string;
  label: string;
}

export async function listCameras(): Promise<CameraInfo[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const all = await navigator.mediaDevices.enumerateDevices();
  return all
    .filter((d) => d.kind === 'videoinput')
    .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Câmera ${i + 1}` }));
}

export function preferExternal(list: CameraInfo[]): CameraInfo | null {
  return (
    list.find((c) => /brio|logitech|logi\b/i.test(c.label)) ??
    list.find((c) => /usb|uvc|external|externa/i.test(c.label)) ??
    list[0] ??
    null
  );
}

export class Camera {
  stream: MediaStream | null = null;
  track: MediaStreamTrack | null = null;
  facing: CameraFacing = 'environment';
  private capture: ImageCaptureLike | null = null;
  private flashMode = false;
  canTorch = false;

  async start(facing: CameraFacing, video: HTMLVideoElement, opts: CameraOptions = {}): Promise<void> {
    this.stop();
    this.facing = facing;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Este aparelho não oferece acesso à câmera.');
    const size = { width: { ideal: opts.width ?? 3840 }, height: { ideal: opts.height ?? 2160 }, frameRate: { ideal: 30 } };
    try {
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: opts.deviceId ? { deviceId: { exact: opts.deviceId }, ...size } : { facingMode: { ideal: facing }, ...size },
        });
      } catch (e) {
        if (!opts.deviceId || (e as DOMException)?.name === 'NotAllowedError') throw e;
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: size });
      }
    } catch (e) {
      const name = (e as DOMException)?.name;
      if (name === 'NotAllowedError') throw new Error('A câmera foi bloqueada. Libere a permissão de câmera do app nas configurações do Android.');
      if (name === 'NotFoundError' || name === 'OverconstrainedError') throw new Error('Nenhuma câmera disponível neste aparelho.');
      throw new Error('Não foi possível abrir a câmera. Feche outros apps que estejam usando a câmera e tente de novo.');
    }
    this.track = this.stream.getVideoTracks()[0] ?? null;
    video.srcObject = this.stream;
    video.muted = true;
    video.playsInline = true;
    await video.play().catch(() => undefined);
    await this.waitForSize(video);

    this.capture = null;
    this.flashMode = false;
    this.canTorch = false;
    if (this.track) {
      const caps = (this.track.getCapabilities?.() ?? {}) as { torch?: boolean };
      this.canTorch = !!caps.torch;
      if (window.ImageCapture) {
        try {
          this.capture = new window.ImageCapture(this.track);
          const pc = await this.capture.getPhotoCapabilities();
          this.flashMode = !!pc.fillLightMode?.includes('flash');
        } catch {
          this.capture = null;
        }
      }
    }
  }

  get canFlash() {
    return this.flashMode || this.canTorch;
  }

  private async waitForSize(video: HTMLVideoElement) {
    for (let i = 0; i < 40 && (!video.videoWidth || !video.videoHeight); i++) await sleep(50);
  }

  stop() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.track = null;
    this.capture = null;
  }

  private async setTorch(on: boolean) {
    if (!this.track || !this.canTorch) return;
    try {
      await this.track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] });
    } catch {
      /* torch indisponível */
    }
  }

  private async frameFromVideo(video: HTMLVideoElement): Promise<ImageBitmap> {
    const w = video.videoWidth;
    const h = video.videoHeight;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.getContext('2d')!.drawImage(video, 0, 0, w, h);
    return createImageBitmap(c);
  }

  async shoot(video: HTMLVideoElement, flash: boolean): Promise<ImageBitmap> {
    const portraitPreview = video.videoHeight > video.videoWidth;
    const useFlash = flash && this.facing === 'environment';

    if (this.capture) {
      try {
        const settings = useFlash && this.flashMode ? { fillLightMode: 'flash' } : {};
        if (useFlash && !this.flashMode) {
          await this.setTorch(true);
          await sleep(220);
        }
        const blob = await this.capture.takePhoto(settings);
        if (useFlash && !this.flashMode) this.setTorch(false);
        const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' } as ImageBitmapOptions);
        const portraitPhoto = bmp.height > bmp.width;
        if (portraitPhoto === portraitPreview && Math.max(bmp.width, bmp.height) >= Math.max(video.videoWidth, video.videoHeight)) {
          return bmp;
        }
        bmp.close();
      } catch {
        if (useFlash) this.setTorch(false);
      }
    }

    if (useFlash) {
      await this.setTorch(true);
      await sleep(220);
    }
    const frame = await this.frameFromVideo(video);
    if (useFlash) this.setTorch(false);
    return frame;
  }
}
