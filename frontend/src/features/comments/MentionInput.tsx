import { useRef, useState } from 'react';
import { useT } from '@/lib/i18n';

// v1.84: @-mention autocomplete for the comment composer. Wraps a controlled
// <textarea>; typing `@` (at line start or after whitespace) opens a dropdown
// of eligible candidates, filterable as you type. Selecting one inserts
// `@<email-local-part> ` and reports the chosen userId so the create call can
// send an EXACT mention target (backend resolves it unambiguously).
//
// The dropdown is anchored to the bottom of the textarea (not the caret x/y),
// which keeps it correct under both LTR and Persian RTL without caret-geometry
// math. Keyboard-navigable (↑/↓/Enter/Escape).

export interface MentionCandidate {
  userId: string;
  name: string;
  email: string;
}

interface Props {
  value: string;
  onChange: (next: string) => void;
  candidates: MentionCandidate[];
  // Called when a candidate is picked from the dropdown so the parent can
  // accumulate exact mention targets.
  onMention: (userId: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
}

const localPart = (email: string) => (email.split('@')[0] ?? '').toLowerCase();

// An active mention = an `@token` that ends exactly at the caret and is
// preceded by start-of-text or whitespace. Returns the token text + the index
// of its leading `@`, or null when the caret isn't inside a mention.
function activeMention(text: string, caret: number): { query: string; at: number } | null {
  const before = text.slice(0, caret);
  const m = before.match(/(^|\s)@([a-zA-Z0-9._-]*)$/);
  if (!m) return null;
  const query = m[2] ?? '';
  const at = caret - query.length - 1; // position of the '@'
  return { query, at };
}

export function MentionInput({
  value,
  onChange,
  candidates,
  onMention,
  placeholder,
  rows = 2,
  className,
}: Props) {
  const t = useT();
  const ref = useRef<HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [at, setAt] = useState(0);
  const [active, setActive] = useState(0);

  const q = query.toLowerCase();
  const matches = !open
    ? []
    : candidates
        .filter(
          (c) =>
            q === '' ||
            c.name.toLowerCase().includes(q) ||
            localPart(c.email).includes(q),
        )
        .slice(0, 8);

  function sync() {
    const el = ref.current;
    if (!el) return;
    const hit = activeMention(el.value, el.selectionStart ?? el.value.length);
    if (hit) {
      setOpen(true);
      setQuery(hit.query);
      setAt(hit.at);
      setActive(0);
    } else {
      setOpen(false);
    }
  }

  function pick(c: MentionCandidate) {
    const el = ref.current;
    if (!el) return;
    const caret = el.selectionStart ?? value.length;
    const token = `@${localPart(c.email)} `;
    const next = value.slice(0, at) + token + value.slice(caret);
    onChange(next);
    onMention(c.userId);
    setOpen(false);
    // Restore caret just after the inserted token on the next tick.
    const pos = at + token.length;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!open || matches.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % matches.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i - 1 + matches.length) % matches.length);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      const chosen = matches[Math.min(active, matches.length - 1)];
      if (chosen) pick(chosen);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <textarea
        ref={ref}
        value={value}
        placeholder={placeholder}
        rows={rows}
        className={className}
        onChange={(e) => {
          onChange(e.target.value);
          // Re-derive on the freshest value (the ref holds it post-change).
          requestAnimationFrame(sync);
        }}
        onKeyUp={sync}
        onClick={sync}
        onKeyDown={onKeyDown}
        onBlur={() => {
          // Delay so a mousedown on a candidate row registers first.
          window.setTimeout(() => setOpen(false), 150);
        }}
      />
      {open && (
        <div
          className="absolute start-0 end-0 top-full z-20 mt-1 max-h-56 overflow-auto rounded border border-slate-200 bg-white shadow-lg"
          role="listbox"
        >
          <div className="px-2 py-1 text-[11px] uppercase tracking-wide text-slate-400">
            {t('mention.pick')}
          </div>
          {matches.length === 0 && (
            <div className="px-3 py-2 text-sm text-slate-400 italic">
              {t('mention.noMatches')}
            </div>
          )}
          {matches.map((c, i) => (
            <button
              key={c.userId}
              type="button"
              role="option"
              aria-selected={i === active}
              // mousedown (not click) so it fires before the textarea blur.
              onMouseDown={(e) => {
                e.preventDefault();
                pick(c);
              }}
              onMouseEnter={() => setActive(i)}
              className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-start text-sm ${
                i === active ? 'bg-slate-100' : 'hover:bg-slate-50'
              }`}
            >
              <span className="font-medium text-slate-800">{c.name}</span>
              <span className="text-xs text-slate-400" dir="ltr">
                @{localPart(c.email)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default MentionInput;
