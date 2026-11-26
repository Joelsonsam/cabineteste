import { printJob } from './compose';
import type { FormatId } from './formats';
import { stationPrint, type StationJobState } from './station';
import { printSheet } from '../platform';
import { app } from '../state.svelte';

export function usesStation() {
  return !!app.station;
}

export async function printOut(sheet: Blob, format: FormatId, jobName: string, onState?: (s: StationJobState, position?: number) => void) {
  const job = await printJob(sheet, format);
  if (app.station) {
    await stationPrint(app.station, job.blob, format === 'tirinha' ? 'tirinha' : 'foto', jobName, onState);
    return;
  }
  await printSheet(job.blob, { widthCm: job.widthCm, heightCm: job.heightCm, jobName });
}
