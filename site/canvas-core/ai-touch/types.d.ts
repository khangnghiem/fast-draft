export type AiTouchState = 'idle' | 'thinking' | 'previewing';

export type AiTouchSessionOptions = {
  getCanvas: () => unknown;
  getEditorText: () => string;
  setEditorText: (text: string) => void;
  renderCanvas?: () => void;
  fitToContent?: (canvas: unknown) => void;
  measureAllTextNodes?: (canvas: unknown, element: HTMLElement | null) => void;
  refreshLayersPanel?: () => void;
  updatePropertiesPanel?: () => void;
  showToast?: (message: string, timeout?: number) => void;
  updateRateLimitUI?: (remaining?: number, limit?: number) => void;
  buildPrompt?: (fdText: string, selectedIds: string[]) => string;
  endpoint?: string;
  fetchImpl?: typeof fetch;
};

export type AiTouchPreviewOptions = {
  fdCode: string;
  mode?: 'replace' | 'merge';
  actionDiv?: HTMLElement | null;
  candidateText?: string | null;
  mergeStrategy?: ((currentText: string, fdCode: string) => string) | null;
};

export class AiTouchSession {
  state: AiTouchState;
  constructor(options: AiTouchSessionOptions);
  isBusy(): boolean;
  start(options?: { userFocus?: string; modelHint?: string }): Promise<boolean>;
  previewCandidate(candidateText: string, options?: { source?: string; actionDiv?: HTMLElement | null }): boolean;
  previewFdCode(options: AiTouchPreviewOptions): boolean;
  accept(): boolean;
  reject(): boolean;
  cancel(): boolean;
}

export function stripMarkdownFences(text: string): string;
