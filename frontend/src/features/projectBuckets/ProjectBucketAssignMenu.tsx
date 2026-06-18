import { useState } from 'react';
import type { ProjectBucket } from './api';

interface Props {
  buckets: ProjectBucket[];
  assignedIds: Set<string>;
  onToggle: (bucketId: string, add: boolean) => void;
  onClose: () => void;
}

export default function ProjectBucketAssignMenu({
  buckets,
  assignedIds,
  onToggle,
  onClose,
}: Props): JSX.Element {
  const [open, setOpen] = useState(true);
  if (!open) return <></>;

  return (
    // Menu container only stops the click from bubbling to the row; it's
    // presentational, not an interactive control.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
    <div
      className="absolute end-0 top-full z-20 mt-1 w-52 rounded border border-border bg-surface shadow-lg p-2 text-sm"
      onClick={(e) => e.stopPropagation()}
    >
      <p className="text-xs text-slate-500 mb-2 px-1">Personal buckets</p>
      {buckets.length === 0 ? (
        <p className="text-xs text-slate-400 italic px-1">No buckets yet</p>
      ) : (
        <ul className="max-h-48 overflow-y-auto">
          {buckets.map((b) => (
            <li key={b.id}>
              <label className="flex items-center gap-2 px-1 py-1 hover:bg-bg rounded cursor-pointer">
                <input
                  type="checkbox"
                  checked={assignedIds.has(b.id)}
                  onChange={(e) => onToggle(b.id, e.target.checked)}
                />
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: b.color ?? '#94a3b8' }}
                />
                <span className="truncate">{b.name}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        className="mt-2 w-full text-xs text-slate-500 hover:underline"
        onClick={() => {
          setOpen(false);
          onClose();
        }}
      >
        Close
      </button>
    </div>
  );
}
