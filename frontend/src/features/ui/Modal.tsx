import { useEffect, useId, useRef, type ReactNode } from 'react';

export interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

// Centered overlay dialog matching RevealModal / ScimPanel patterns
// (`fixed inset-0 bg-black/40 … z-50`). Adds Escape-to-close, a title bar
// with an explicit close control, and basic focus management for keyboard
// users. Backdrop clicks do not dismiss — consistent with other modals in
// this codebase (token-reveal flows require an explicit action).
export default function Modal({ title, onClose, children }: ModalProps): JSX.Element {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const panel = panelRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusable = panel?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    focusable?.focus();

    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previouslyFocused?.focus();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 dark:bg-black/60">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="bg-white dark:bg-slate-800 rounded-lg shadow-lg w-full max-w-lg max-h-[min(90vh,48rem)] flex flex-col"
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-200 dark:border-slate-700 shrink-0">
          <h2 id={titleId} className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded p-1 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700"
            aria-label="Close"
          >
            <span aria-hidden className="text-xl leading-none">
              ×
            </span>
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
