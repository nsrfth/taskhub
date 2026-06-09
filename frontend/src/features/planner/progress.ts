import type { Task } from '@/features/tasks/api';

/** Derive 0–100 progress from subtasks, falling back to status when none exist. */
export function taskProgressPercent(task: {
  status: Task['status'];
  subtasks: { done: boolean }[];
}): number {
  if (task.subtasks.length > 0) {
    const done = task.subtasks.filter((s) => s.done).length;
    return Math.round((done / task.subtasks.length) * 100);
  }
  switch (task.status) {
    case 'DONE':
      return 100;
    case 'REVIEW':
      return 75;
    case 'IN_PROGRESS':
      return 50;
    default:
      return 0;
  }
}

export type ProgressBucket =
  | '0'
  | '1-25'
  | '26-50'
  | '51-75'
  | '76-99'
  | '100';

export const PROGRESS_BUCKET_ORDER: ProgressBucket[] = [
  '0',
  '1-25',
  '26-50',
  '51-75',
  '76-99',
  '100',
];

export const PROGRESS_BUCKET_LABEL: Record<ProgressBucket, string> = {
  '0': '0%',
  '1-25': '1–25%',
  '26-50': '26–50%',
  '51-75': '51–75%',
  '76-99': '76–99%',
  '100': '100%',
};

export function progressBucket(task: {
  status: Task['status'];
  subtasks: { done: boolean }[];
}): ProgressBucket {
  const p = taskProgressPercent(task);
  if (p === 0) return '0';
  if (p <= 25) return '1-25';
  if (p <= 50) return '26-50';
  if (p <= 75) return '51-75';
  if (p < 100) return '76-99';
  return '100';
}
