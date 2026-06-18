import { useState } from 'react';
import Modal from '@/features/ui/Modal';
import { BUCKET_COLORS } from './storage';

export interface BucketFormValues {
  name: string;
  description: string;
  color: string;
}

interface Props {
  title: string;
  initial?: BucketFormValues;
  onSubmit: (values: BucketFormValues) => void;
  onClose: () => void;
  pending?: boolean;
}

export default function BucketFormModal({
  title,
  initial,
  onSubmit,
  onClose,
  pending,
}: Props): JSX.Element {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [color, setColor] = useState(initial?.color ?? BUCKET_COLORS[0]);

  return (
    <Modal title={title} onClose={onClose}>
      <form
        className="space-y-3 text-sm"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          onSubmit({ name: name.trim(), description: description.trim(), color });
        }}
      >
        <label className="block">
          <span className="text-slate-500">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            required
            className="mt-1 w-full rounded border px-2 py-1 bg-surface"
          />
        </label>
        <label className="block">
          <span className="text-slate-500">Description (optional)</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
            rows={2}
            className="mt-1 w-full rounded border px-2 py-1 bg-surface"
          />
        </label>
        <div>
          <span className="text-slate-500 block mb-1">Color</span>
          <div className="flex flex-wrap gap-2">
            {BUCKET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`w-7 h-7 rounded-full border-2 ${color === c ? 'border-border' : 'border-transparent'}`}
                style={{ backgroundColor: c }}
                aria-label={c}
              />
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-3 py-1 rounded border">
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending || !name.trim()}
            className="px-3 py-1 rounded bg-primary text-primary-contrast disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </form>
    </Modal>
  );
}
