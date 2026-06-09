import type { BoardGroupBy } from './grouping';

const GROUP_BY_KEY = 'planner.boardGroupBy';
const GRID_COLUMNS_KEY = 'planner.gridColumns';
const GRID_PAGE_SIZE_KEY = 'planner.gridPageSize';

export function loadBoardGroupBy(): BoardGroupBy {
  if (typeof window === 'undefined') return 'status';
  const v = window.localStorage.getItem(GROUP_BY_KEY);
  if (v === 'status' || v === 'assignee' || v === 'progress' || v === 'dueDate' || v === 'label') {
    return v;
  }
  return 'status';
}

export function saveBoardGroupBy(v: BoardGroupBy): void {
  if (typeof window !== 'undefined') window.localStorage.setItem(GROUP_BY_KEY, v);
}

export const DEFAULT_GRID_COLUMNS = [
  'title',
  'project',
  'assignee',
  'status',
  'priority',
  'progress',
  'dueDate',
  'labels',
  'createdAt',
] as const;

export type GridColumnId = (typeof DEFAULT_GRID_COLUMNS)[number] | 'startDate' | 'budget';

export function loadGridColumns(): GridColumnId[] {
  if (typeof window === 'undefined') return [...DEFAULT_GRID_COLUMNS];
  try {
    const raw = window.localStorage.getItem(GRID_COLUMNS_KEY);
    if (!raw) return [...DEFAULT_GRID_COLUMNS];
    const parsed = JSON.parse(raw) as GridColumnId[];
    return parsed.length > 0 ? parsed : [...DEFAULT_GRID_COLUMNS];
  } catch {
    return [...DEFAULT_GRID_COLUMNS];
  }
}

export function saveGridColumns(cols: GridColumnId[]): void {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(GRID_COLUMNS_KEY, JSON.stringify(cols));
  }
}

export function loadGridPageSize(): number {
  if (typeof window === 'undefined') return 25;
  const n = Number(window.localStorage.getItem(GRID_PAGE_SIZE_KEY));
  return n >= 10 && n <= 100 ? n : 25;
}

export function saveGridPageSize(n: number): void {
  if (typeof window !== 'undefined') window.localStorage.setItem(GRID_PAGE_SIZE_KEY, String(n));
}
