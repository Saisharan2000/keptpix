/**
 * src/state/ui.slice.ts — docs/05-data-models.md §4 (AppState.ui).
 */
export type ToolView = 'idle' | 'configuring' | 'processing' | 'results';

/** Mobile is a three-step flow, never the desktop layout squeezed (docs/08 §4.3). */
export type MobileStep = 'choose' | 'configure' | 'results';

export interface UiState {
  view: ToolView;
  selectedSourceId: string | null;
  compareMode: boolean;
  diagnosticsOpen: boolean;
  metadataOpen: boolean;
  mobileStep: MobileStep;
}

export interface UiSlice {
  ui: UiState;
  setView(view: ToolView): void;
  selectSource(sourceId: string | null): void;
  setMobileStep(step: MobileStep): void;
  toggleDiagnostics(): void;
  toggleMetadata(open?: boolean): void;
  setCompareMode(open: boolean): void;
}

export const INITIAL_UI: UiState = {
  view: 'idle',
  selectedSourceId: null,
  compareMode: false,
  diagnosticsOpen: false,
  metadataOpen: false,
  mobileStep: 'choose',
};
