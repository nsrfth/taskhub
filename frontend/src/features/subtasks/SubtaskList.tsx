import { useEffect, useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import axios from 'axios';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import * as subtasksApi from './api';

// v1.35: subtask list with full-permutation drag-and-drop reorder.
// `subtasks` comes from the parent task query (server-supplied position
// asc). Local order is mirrored from props until the user drags; on
// drop, we apply the move locally + fire one reorderSubtasks PATCH with
// the full permutation. The server rejects partial / duplicate / foreign
// id lists with 400; on error we invalidate via onChange() to roll the
// list back to the server's view.

export interface SubtaskItem {
  id: string;
  taskId: string;
  title: string;
  done: boolean;
  position: number;
}

interface SubtaskListProps {
  teamId: string;
  projectId: string;
  taskId: string;
  subtasks: SubtaskItem[];
  // Caller decides what to refresh on every mutation (typically the task
  // detail query + the kanban list so the progress chip stays in sync).
  onChange: () => Promise<void> | void;
}

function errorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const msg = err.response?.data?.error?.message;
    if (typeof msg === 'string' && msg.length) return msg;
  }
  return fallback;
}

export function SubtaskList({
  teamId,
  projectId,
  taskId,
  subtasks,
  onChange,
}: SubtaskListProps): JSX.Element {
  const [title, setTitle] = useState('');

  // Local order — mirrors `subtasks` until a drag fires. The effect below
  // keeps it in lockstep with server updates between drags so a parent
  // refetch reflects without stomping a mid-drag local order.
  const [localOrder, setLocalOrder] = useState<SubtaskItem[]>(subtasks);
  useEffect(() => {
    setLocalOrder(subtasks);
  }, [subtasks]);

  const createMut = useMutation({
    mutationFn: () => subtasksApi.createSubtask(teamId, projectId, taskId, { title }),
    onSuccess: async () => {
      setTitle('');
      await onChange();
    },
  });

  const updateMut = useMutation({
    mutationFn: (input: { id: string; done: boolean }) =>
      subtasksApi.updateSubtask(teamId, projectId, taskId, input.id, { done: input.done }),
    onSuccess: async () => {
      await onChange();
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => subtasksApi.deleteSubtask(teamId, projectId, taskId, id),
    onSuccess: async () => {
      await onChange();
    },
  });

  const reorderMut = useMutation({
    mutationFn: (ids: string[]) =>
      subtasksApi.reorderSubtasks(teamId, projectId, taskId, ids),
    onSuccess: async () => {
      await onChange();
    },
    onError: async (err) => {
      window.alert(errorMessage(err, 'Could not reorder subtasks'));
      // Roll local order back to whatever the server now says.
      await onChange();
    },
  });

  function onAdd(e: FormEvent): void {
    e.preventDefault();
    if (!title.trim()) return;
    createMut.mutate();
  }

  // Activation distance prevents a checkbox click from being misread as
  // the start of a drag. Same value the kanban uses.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  function onDragEnd(event: DragEndEvent): void {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = localOrder.map((s) => s.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    const nextIds = arrayMove(ids, from, to);
    const byId = new Map(localOrder.map((s) => [s.id, s]));
    const nextOrder = nextIds.map((id) => byId.get(id)!).filter(Boolean);
    setLocalOrder(nextOrder);
    reorderMut.mutate(nextIds);
  }

  const done = localOrder.filter((s) => s.done).length;
  const total = localOrder.length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium text-slate-600 dark:text-slate-400">Subtasks</h3>
        {total > 0 && (
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {done} / {total} done
          </span>
        )}
      </div>

      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <SortableContext items={localOrder.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <ul className="space-y-1">
            {localOrder.map((s) => (
              <SortableRow
                key={s.id}
                subtask={s}
                onToggle={(done) => updateMut.mutate({ id: s.id, done })}
                onDelete={() => deleteMut.mutate(s.id)}
              />
            ))}
            {total === 0 && <li className="text-xs text-slate-400 italic">No subtasks.</li>}
          </ul>
        </SortableContext>
      </DndContext>

      <form onSubmit={onAdd} className="flex items-center gap-2">
        <input
          type="text"
          placeholder="Add a subtask…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="flex-1 rounded border-slate-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 px-2 py-1 border text-sm"
        />
        <button
          type="submit"
          disabled={createMut.isPending || !title.trim()}
          className="bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded px-2 py-1 text-xs font-medium disabled:opacity-50"
        >
          Add
        </button>
      </form>
    </div>
  );
}

function SortableRow({
  subtask,
  onToggle,
  onDelete,
}: {
  subtask: SubtaskItem;
  onToggle: (done: boolean) => void;
  onDelete: () => void;
}): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: subtask.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  return (
    <li ref={setNodeRef} style={style} className="flex items-center gap-2 text-sm" {...attributes}>
      <span
        {...listeners}
        className="cursor-grab text-slate-400 text-xs select-none"
        aria-label="Drag handle"
        title="Drag to reorder"
      >
        ⋮⋮
      </span>
      <input
        type="checkbox"
        checked={subtask.done}
        onChange={(e) => onToggle(e.target.checked)}
        className="cursor-pointer"
        aria-label={`Mark "${subtask.title}" ${subtask.done ? 'incomplete' : 'done'}`}
      />
      <span
        className={
          subtask.done
            ? 'line-through text-slate-400 dark:text-slate-500 flex-1'
            : 'flex-1 text-slate-800 dark:text-slate-100'
        }
      >
        {subtask.title}
      </span>
      <button
        type="button"
        onClick={onDelete}
        className="text-xs text-red-600 hover:underline opacity-60 hover:opacity-100"
        aria-label={`Delete subtask ${subtask.title}`}
      >
        ×
      </button>
    </li>
  );
}
