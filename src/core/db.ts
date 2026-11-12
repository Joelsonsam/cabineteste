import Dexie, { type EntityTable } from 'dexie';
import type { FilterId } from './compose';
import type { FormatId, Rect } from './formats';

export type CameraFacing = 'environment' | 'user';

export interface BoothEvent {
  id: string;
  name: string;
  accent: string;
  format: FormatId;
  frame: Blob | null;
  frameName: string | null;
  windows: Rect[];
  filter: FilterId;
  countdown: number;
  groupTimer: number;
  flash: boolean;
  autoSave: boolean;
  camera: CameraFacing;
  mirrorPreview: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface BoothSession {
  id: string;
  eventId: string;
  createdAt: number;
  filter: FilterId;
  sheet: Blob;
  thumb: Blob;
  prints: number;
  savedToGallery: boolean;
}

export interface Setting {
  key: string;
  value: unknown;
}

export const db = new Dexie('cabine-mude') as Dexie & {
  events: EntityTable<BoothEvent, 'id'>;
  sessions: EntityTable<BoothSession, 'id'>;
  settings: EntityTable<Setting, 'key'>;
};

db.version(1).stores({
  events: 'id, updatedAt',
  sessions: 'id, eventId, createdAt, [eventId+createdAt]',
  settings: 'key',
});

export const uid = () =>
  (crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`).slice(0, 18);

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key);
  return (row?.value as T) ?? fallback;
}

export async function setSetting(key: string, value: unknown) {
  await db.settings.put({ key, value });
}

export async function sessionsFor(eventId: string) {
  return db.sessions.where('[eventId+createdAt]').between([eventId, Dexie.minKey], [eventId, Dexie.maxKey]).reverse().toArray();
}

export async function countSessions(eventId: string) {
  return db.sessions.where('eventId').equals(eventId).count();
}

export async function deleteEvent(eventId: string) {
  await db.transaction('rw', db.events, db.sessions, async () => {
    await db.sessions.where('eventId').equals(eventId).delete();
    await db.events.delete(eventId);
  });
}

export async function clearSessions(eventId: string) {
  await db.sessions.where('eventId').equals(eventId).delete();
}
