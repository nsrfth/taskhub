import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import * as bucketsApi from '@/features/buckets/api';
import { useT } from '@/lib/i18n';

// v1.34.2: a compact bucket-management strip rendered under each project
// row on the Projects page. Purpose: let users add / rename / delete the
// project's buckets without leaving the list. Reorder is intentionally
// NOT here — the BucketBoard (TasksPage view-mode "Buckets") is the
// authoritative drag-and-drop surface for ordering.
//
// Permission gating is inline-403: the affordances render unconditionally
// and a 403 from the server surfaces as a window.alert. Same pattern as
// every other gated affordance in the app today.

function errorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const msg = err.response?.data?.error?.message;
    if (typeof msg === 'string' && msg.length) return msg;
  }
  return fallback;
}

interface Props {
  teamId: string;
  projectId: string;
}

export default function ProjectBucketStrip({ teamId, projectId }: Props): JSX.Element {
  const t = useT();
  const qc = useQueryClient();

  const { data: buckets = [], isLoading } = useQuery({
    queryKey: ['buckets', teamId, projectId],
    queryFn: () => bucketsApi.listBuckets(teamId, projectId),
    // The Projects page may render dozens of these — cache for a minute so
    // re-renders don't all hammer the API.
    staleTime: 60_000,
  });

  const renameMut = useMutation({
    mutationFn: (input: { bucketId: string; name: string }) =>
      bucketsApi.renameBucket(teamId, input.bucketId, { name: input.name }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['buckets', teamId, projectId] }),
    onError: (err) => window.alert(errorMessage(err, 'Could not rename bucket')),
  });

  const deleteMut = useMutation({
    mutationFn: (bucketId: string) => bucketsApi.deleteBucket(teamId, bucketId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['buckets', teamId, projectId] });
      // Task list may now have unbucketed entries; invalidate so any open
      // BucketBoard for this project picks up the change.
      qc.invalidateQueries({ queryKey: ['tasks', teamId, projectId] });
    },
    onError: (err) => window.alert(errorMessage(err, 'Could not delete bucket')),
  });

  const createMut = useMutation({
    mutationFn: (name: string) => bucketsApi.createBucket(teamId, projectId, { name }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['buckets', teamId, projectId] }),
    onError: (err) => window.alert(errorMessage(err, 'Could not add bucket')),
  });

  return (
    <div className="mt-2 flex items-center gap-2 flex-wrap text-xs">
      <span className="text-slate-500 dark:text-slate-400">
        {/* Reusing the existing "buckets.empty" key feels off here — we
            want a label, not an empty-state. A tiny inline label is
            adequate. */}
        Buckets:
      </span>

      {isLoading && (
        <span className="text-slate-400 italic">…</span>
      )}

      {!isLoading &&
        buckets.map((b) => (
          <BucketChip
            key={b.id}
            name={b.name}
            onRename={(name) => renameMut.mutate({ bucketId: b.id, name })}
            onDelete={() => {
              if (
                window.confirm(t('buckets.deleteConfirm').replace('{name}', b.name))
              ) {
                deleteMut.mutate(b.id);
              }
            }}
          />
        ))}

      {!isLoading && <AddBucketForm onAdd={(name) => createMut.mutate(name)} t={t} />}

      <Link
        to={`/projects/${projectId}/tasks?view=buckets`}
        className="ms-auto text-indigo-600 dark:text-indigo-400 hover:underline"
      >
        {t('buckets.manage')} →
      </Link>
    </div>
  );
}

// ── Chip with inline rename + delete ────────────────────────────────────

function BucketChip({
  name,
  onRename,
  onDelete,
}: {
  name: string;
  onRename: (next: string) => void;
  onDelete: () => void;
}): JSX.Element {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);

  function commit(): void {
    const trimmed = value.trim();
    setEditing(false);
    if (trimmed && trimmed !== name) onRename(trimmed);
    else setValue(name);
  }
  function onKey(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setValue(name);
      setEditing(false);
    }
  }

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-700 px-2 py-0.5">
        <input
          autoFocus
          type="text"
          value={value}
          maxLength={80}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={onKey}
          className="bg-transparent border-0 outline-none text-xs w-28"
        />
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 px-2 py-0.5">
      <button
        type="button"
        onClick={() => {
          setValue(name);
          setEditing(true);
        }}
        className="hover:underline"
        title="Rename"
      >
        {name}
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="text-slate-400 hover:text-red-600 leading-none"
        aria-label="Delete bucket"
        title="Delete bucket"
      >
        ×
      </button>
    </span>
  );
}

// ── Inline add form ─────────────────────────────────────────────────────

function AddBucketForm({
  onAdd,
  t,
}: {
  onAdd: (name: string) => void;
  t: (k: string) => string;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');

  function submit(e: FormEvent): void {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setValue('');
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full border border-dashed border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 px-2 py-0.5 hover:bg-slate-50 dark:hover:bg-slate-700/40"
      >
        + {t('buckets.add')}
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="inline-flex items-center gap-1">
      <input
        autoFocus
        type="text"
        value={value}
        maxLength={80}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => {
          if (!value.trim()) setOpen(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
        }}
        placeholder={t('buckets.newPlaceholder')}
        className="rounded-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-slate-100 px-2 py-0.5 text-xs w-28"
      />
      <button
        type="submit"
        disabled={!value.trim()}
        className="rounded-full bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 px-2 py-0.5 disabled:opacity-50"
      >
        Add
      </button>
    </form>
  );
}
