/**
 * THE BOARD'S WINDOW ONTO THE DATA — without the database.
 *
 * The board (BuildingDiagram) and the stage legend read a handful of things — the words, the workspace, the stages,
 * the board settings, the buildings, the site photos — and used to read them straight from the store. The store
 * brings the whole cloud connection with it, and the outside SHARED VIEW (/s/<token>, owner 2026-11-18) must never
 * load that: it gets everything from the server's allowlisted projection instead.
 *
 * So the board reads through this bridge. The office app plugs the store in (store.ts, at its end); the shared view
 * plugs in its own little read-only store. Nothing here imports the store or Firebase — the import graph is what
 * keeps the shared page clean, and `npm run build` is where that is checked (the shared chunk has no Firebase).
 *
 * `setBoardSetting` is ABSENT in the shared view: every write the board can make must check for it.
 */
import type { MainUiStrings, Stage, BoardSetting, BoardSettingKey, Building, ContractorPhoto } from '../types';

export interface ViewState {
  mainUiStrings: MainUiStrings;
  currentProjectId: string;
  stages: Stage[];
  boardSettings: Record<string, BoardSetting>;
  uiLang: 'en' | 'he';
  buildings: Building[];
  contractorPhotos: ContractorPhoto[];
  /** Absent = read-only (the shared view). */
  setBoardSetting?: <K extends BoardSettingKey>(key: K, value: BoardSetting[K]) => void;
  /**
   * The shared view only: its site photos arrive per apartment (the server reads one apartment's, not the whole
   * project's), so a board popup asks for them. The office holds every photo already and has none.
   */
  loadPhotosFor?: (apartmentId: string) => void;
}

type Hook = <T>(selector: (s: ViewState) => T) => T;
let impl: Hook | null = null;

/** Plug the data in — once, before anything that draws the board renders. */
export function provideViewState(hook: Hook): void { impl = hook; }

/** Read one thing (a selector, the zustand way). */
export function useViewState<T>(selector: (s: ViewState) => T): T {
  if (!impl) throw new Error('viewState: no data plugged in');
  return impl(selector);
}
