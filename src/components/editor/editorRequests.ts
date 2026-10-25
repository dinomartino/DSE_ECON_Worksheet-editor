import { create } from 'zustand';
import type { ExportFormat, ExportWhat } from './exportSession';

/**
 * The editor's dialogs asked for from elsewhere (⌘K, k-0201): Setup at a tab (and the setting
 * to show), Export at a format, What's new and Send feedback. Their owners (`EditorApp`,
 * `Toolbar`) subscribe and open them; the counters make a second ask open again.
 */
export type SetupTab = 'document' | 'page' | 'furniture' | 'cover';

interface EditorRequests {
  setup?: { tab: SetupTab; field?: string; n: number };
  export?: { format: ExportFormat; what?: ExportWhat; n: number };
  whatsNew: number;
  feedback: number;
}

export const useEditorRequests = create<EditorRequests>(() => ({ whatsNew: 0, feedback: 0 }));

let counter = 0;

export function requestSetup(tab: SetupTab, field?: string): void {
  counter += 1;
  useEditorRequests.setState({ setup: { tab, field, n: counter } });
}

export function requestExport(format: ExportFormat, what?: ExportWhat): void {
  counter += 1;
  useEditorRequests.setState({ export: { format, what, n: counter } });
}

export function requestWhatsNew(): void {
  useEditorRequests.setState((state) => ({ whatsNew: state.whatsNew + 1 }));
}

export function requestFeedback(): void {
  useEditorRequests.setState((state) => ({ feedback: state.feedback + 1 }));
}
