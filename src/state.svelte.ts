import { db, getSetting, setSetting, uid, type BoothEvent } from './core/db';
import { DEFAULT_FORMAT, defaultWindows } from './core/formats';
import { setSound } from './core/sound';
import { loadTotemPrefs, saveTotemPrefs, TOTEM_DEFAULTS, type TotemPrefs } from './core/totem';

export type Route =
  | { name: 'events' }
  | { name: 'setup'; id: string | null }
  | { name: 'booth' }
  | { name: 'gallery' }
  | { name: 'settings' }
  | { name: 'diagnostics' };

export type ThemePref = 'auto' | 'light' | 'dark';

type Toast = { id: number; text: string; tone: 'ok' | 'error' | 'info' };

export const app = $state({
  route: { name: 'events' } as Route,
  history: [] as Route[],
  events: [] as BoothEvent[],
  activeId: null as string | null,
  sound: true,
  theme: 'auto' as ThemePref,
  totem: { ...TOTEM_DEFAULTS } as TotemPrefs,
  ready: false,
  toasts: [] as Toast[],
});

export const activeEvent = () => app.events.find((e) => e.id === app.activeId) ?? null;

let routedAt = 0;

export function go(route: Route, replace = false) {
  if (!replace) app.history.push(app.route);
  app.route = route;
  routedAt = Date.now();
}

export function back(): boolean {
  if (Date.now() - routedAt < 600) return true;
  const prev = app.history.pop();
  if (!prev) return false;
  app.route = prev;
  routedAt = Date.now();
  return true;
}

export function home() {
  app.history = [];
  app.route = { name: 'events' };
  routedAt = Date.now();
}

let toastSeq = 0;
export function toast(text: string, tone: Toast['tone'] = 'ok', ms = 2600) {
  const id = ++toastSeq;
  app.toasts.push({ id, text, tone });
  setTimeout(() => {
    app.toasts = app.toasts.filter((t) => t.id !== id);
  }, ms);
}

export async function loadAll() {
  app.events = await db.events.orderBy('updatedAt').reverse().toArray();
  app.activeId = await getSetting<string | null>('activeEvent', null);
  if (app.activeId && !app.events.some((e) => e.id === app.activeId)) app.activeId = null;
  app.sound = await getSetting('sound', true);
  app.theme = await getSetting<ThemePref>('theme', 'auto');
  app.totem = await loadTotemPrefs();
  setSound(app.sound);
  app.ready = true;
}

export async function setActive(id: string | null) {
  app.activeId = id;
  await setSetting('activeEvent', id);
}

export async function setSoundPref(on: boolean) {
  app.sound = on;
  setSound(on);
  await setSetting('sound', on);
}

export async function setThemePref(t: ThemePref) {
  app.theme = t;
  await setSetting('theme', t);
}

export function newEventDraft(): BoothEvent {
  const now = Date.now();
  return {
    id: uid(),
    name: '',
    accent: '#FF5E1F',
    format: DEFAULT_FORMAT,
    frame: null,
    frameName: null,
    windows: defaultWindows(DEFAULT_FORMAT, DEFAULT_FORMAT === 'tirinha' ? 3 : 1),
    filter: 'original',
    countdown: 3,
    groupTimer: 10,
    flash: false,
    autoSave: true,
    camera: 'environment',
    mirrorPreview: true,
    createdAt: now,
    updatedAt: now,
  };
}

export async function saveEvent(ev: BoothEvent) {
  const row = { ...$state.snapshot(ev), updatedAt: Date.now() } as BoothEvent;
  row.frame = ev.frame;
  await db.events.put(row);
  app.events = await db.events.orderBy('updatedAt').reverse().toArray();
}

export async function setTotemPrefs(p: Partial<TotemPrefs>) {
  app.totem = { ...app.totem, ...p };
  await saveTotemPrefs($state.snapshot(app.totem) as TotemPrefs);
}
