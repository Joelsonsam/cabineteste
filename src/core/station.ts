export type StationProfile = 'foto' | 'tirinha';

export interface StationStatus {
  ok: boolean;
  nome: string;
  pausada: boolean;
  fila: number;
  folhas: number;
  foto: string;
  tirinha: string;
  online: boolean;
}

export type StationJobState = 'enviando' | 'fila' | 'imprimindo' | 'pronta' | 'erro';

export function stationBase(address: string): string {
  let a = address.trim().replace(/\/+$/, '');
  if (!a) return '';
  if (!/^https?:\/\//i.test(a)) a = 'http://' + a;
  const url = new URL(a);
  if (!url.port) url.port = '8787';
  return url.origin;
}

async function call<T>(url: string, init: RequestInit = {}, timeoutMs = 4000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal, cache: 'no-store' });
    const json = (await res.json()) as T & { ok?: boolean; erro?: string };
    if (!res.ok || json.ok === false) throw new Error(json.erro || `A estação respondeu ${res.status}`);
    return json;
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new Error('A estação não respondeu a tempo');
    if (e instanceof TypeError) throw new Error('Não encontrei a estação nesse endereço');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export function stationStatus(address: string): Promise<StationStatus> {
  return call<StationStatus>(`${stationBase(address)}/status`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function stationPrint(
  address: string,
  blob: Blob,
  profile: StationProfile,
  name: string,
  onState?: (s: StationJobState, position?: number) => void
): Promise<void> {
  const base = stationBase(address);
  onState?.('enviando');
  const sent = await call<{ id: string; posicao: number }>(
    `${base}/print?perfil=${profile}&nome=${encodeURIComponent(name)}`,
    { method: 'POST', body: blob, headers: { 'Content-Type': blob.type || 'image/jpeg' } },
    30000
  );
  onState?.('fila', sent.posicao);
  const until = Date.now() + 180000;
  while (Date.now() < until) {
    await sleep(1200);
    let job: { estado: StationJobState; mensagem: string; posicao: number };
    try {
      job = await call(`${base}/job?id=${encodeURIComponent(sent.id)}`);
    } catch {
      continue;
    }
    if (job.estado === 'pronta') {
      onState?.('pronta');
      return;
    }
    if (job.estado === 'erro') throw new Error(job.mensagem || 'A impressora recusou a foto');
    onState?.(job.estado, job.posicao);
  }
  throw new Error('A impressão demorou demais');
}
