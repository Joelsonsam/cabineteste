import { db, getSetting, setSetting, uid, type BoothEvent } from './core/db';
import { defaultWindows } from './core/formats';
import { setSound } from './core/sound';

export type Route =
  | { name: 'events' }
  | { name: 'setup'; id: string | null }
  | { name: 'booth' }
  | { name: 'gallery' }
  | { name: 'settings' };

export type ThemePref = 'auto' | 'light' | 'dark';

type Toast = { id: number; text: string; tone: 'ok' | 'error' | 'info' };

export const app = $state({
  route: { name: 'events' } as Route,
  history: [] as Route[],
  events: [] as BoothEvent[],
  activeId: null as string | null,
  sound: true,
  theme: 'auto' as ThemePref,
  ready: false,
  toasts: [] as Toast[],
});

export const activeEvent = () => app.events.find((e) => e.id === app.activeId) ?? null;

export function go(route: Route, replace = false) {
  if (!replace) app.history.push(app.route);
  app.route = route;
}

export function back(): boolean {
  const prev = app.history.pop();
  if (!prev) return false;
  app.route = prev;
  return true;
}

export function home() {
  app.history = [];
  app.route = { name: 'events' };
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
    format: 'tirinha',
    frame: null,
    frameName: null,
    windows: defaultWindows('tirinha', 3),
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
