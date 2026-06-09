const COLLAPSED_KEY = 'projects.buckets.collapsed';
const VIEW_KEY = 'projects.viewMode';

export type ProjectsViewMode = 'all' | 'buckets';

export function loadProjectsViewMode(): ProjectsViewMode {
  if (typeof window === 'undefined') return 'all';
  const v = window.localStorage.getItem(VIEW_KEY);
  return v === 'buckets' ? 'buckets' : 'all';
}

export function saveProjectsViewMode(mode: ProjectsViewMode): void {
  if (typeof window !== 'undefined') window.localStorage.setItem(VIEW_KEY, mode);
}

export function loadCollapsedBuckets(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(COLLAPSED_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

export function saveCollapsedBuckets(ids: Set<string>): void {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...ids]));
  }
}

export const BUCKET_COLORS = [
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
  '#f59e0b',
  '#10b981',
  '#06b6d4',
  '#64748b',
  '#ef4444',
] as const;
