import { Fragment } from 'react';
import type { MentionCandidate } from './MentionInput';

// v1.84: render a comment body with `@local-part` tokens that resolve to an
// eligible candidate shown as a distinct chip (the person's name), not raw
// text. Tokens that don't match anyone are left as plain text, so hand-typed
// or stale handles degrade gracefully. Whitespace is preserved by the caller's
// `whitespace-pre-wrap` container.

const MENTION_RE = /@([a-zA-Z0-9._-]+)/g;
const localPart = (email: string) => (email.split('@')[0] ?? '').toLowerCase();

interface Props {
  body: string;
  candidates: MentionCandidate[];
}

export function MentionText({ body, candidates }: Props) {
  const byLocal = new Map<string, MentionCandidate>();
  for (const c of candidates) {
    const lp = localPart(c.email);
    if (lp && !byLocal.has(lp)) byLocal.set(lp, c);
  }

  const parts: Array<{ key: string; node: React.ReactNode }> = [];
  let last = 0;
  let i = 0;
  for (const m of body.matchAll(MENTION_RE)) {
    const start = m.index ?? 0;
    const handle = (m[1] ?? '').toLowerCase();
    const hit = byLocal.get(handle);
    if (!hit) continue; // not a real mention — leave it in the plain run
    if (start > last) {
      parts.push({ key: `t${i}`, node: body.slice(last, start) });
    }
    parts.push({
      key: `m${i}`,
      node: (
        <span
          className="rounded bg-sky-100 px-1 font-medium text-sky-800"
          title={hit.email}
          dir="auto"
        >
          @{hit.name}
        </span>
      ),
    });
    last = start + m[0].length;
    i += 1;
  }
  if (last < body.length) parts.push({ key: `t${i}`, node: body.slice(last) });

  return (
    <>
      {parts.map((p) => (
        <Fragment key={p.key}>{p.node}</Fragment>
      ))}
    </>
  );
}

export default MentionText;
