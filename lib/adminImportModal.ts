export interface ImportModalState {
  open: boolean;
  message: string | null;
  draft?: string;
}

export type ImportModalAction = 'open' | 'close';

export function nextImportModalState(state: ImportModalState, action: ImportModalAction): ImportModalState {
  if (action === 'open') {
    return { ...state, open: true, message: null };
  }

  return { open: false, message: null, draft: '' };
}
