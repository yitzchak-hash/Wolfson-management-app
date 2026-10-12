import { useStore } from './store';
import type { TimeOff } from './timeOff';

const EMPTY: TimeOff[] = [];

/** Everybody's time off, live — the one shared list (the `__tv` bag). */
export function useTimeOff(): TimeOff[] {
  return useStore(st => st.boardSettings.__tv?.timeOff ?? EMPTY);
}

/** Write the whole list back (persist + the settings doc, like every `__tv` key). */
export function saveTimeOff(list: TimeOff[]): void {
  useStore.getState().setTvSetting('timeOff', list);
}

/** The list as it stands right now, outside React. */
export function timeOffNow(): TimeOff[] {
  return useStore.getState().boardSettings.__tv?.timeOff ?? EMPTY;
}
