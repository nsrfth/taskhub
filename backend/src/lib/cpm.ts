// v2.1 (PMIS R5 — scheduling engine): on-demand Critical Path Method (CPM)
// over WBS-leaf tasks + dependency edges. Pure logic + in-memory cache keyed by
// (projectId, scheduleVersion). Cycles → DEPENDENCY_CYCLE 409.

import type { CalendarMode, DependencyType, LagUnit } from '@prisma/client';
import { AppError } from './errors.js';
import { addCalendarDays, type WorkingDayCalendar } from './workingDays.js';

export interface CpmTaskInput {
  id: string;
  startDate: Date | null;
  dueDate: Date | null;
  isMilestone: boolean;
  isSummary: boolean;
}

export interface CpmEdgeInput {
  id: string;
  taskId: string;
  dependsOnId: string;
  type: DependencyType;
  lag: number;
  lagUnit: LagUnit;
  calendarMode: CalendarMode;
}

export interface CpmTaskResult {
  taskId: string;
  earlyStart: string | null;
  earlyFinish: string | null;
  lateStart: string | null;
  lateFinish: string | null;
  totalFloatDays: number;
  isCritical: boolean;
}

export interface CpmResult {
  scheduleVersion: number;
  taskCount: number;
  criticalChain: string[];
  tasks: CpmTaskResult[];
  criticalEdgeIds: string[];
}

const cache = new Map<string, CpmResult>();
const FLOAT_EPS = 0.01;

function utcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function iso(d: Date): string {
  return d.toISOString();
}

function addLag(
  cal: WorkingDayCalendar | null,
  from: Date,
  lag: number,
  lagUnit: LagUnit,
  mode: CalendarMode,
): Date {
  if (lag === 0) return utcDay(from);
  if (lagUnit === 'HOUR') return new Date(from.getTime() + lag * 3_600_000);
  if (mode === 'WORKING' && cal) return utcDay(cal.addWorkingDays(from, lag));
  return utcDay(addCalendarDays(from, lag));
}

function durationDays(
  cal: WorkingDayCalendar | null,
  start: Date,
  end: Date,
  isMilestone: boolean,
): number {
  if (isMilestone) return 0;
  const s = utcDay(start);
  const e = utcDay(end);
  if (cal) return Math.max(1, cal.countWorkingDaysInclusive(s, e));
  return Math.max(1, Math.round((e.getTime() - s.getTime()) / 86_400_000) + 1);
}

function finishFromStart(
  cal: WorkingDayCalendar | null,
  start: Date,
  dur: number,
  isMilestone: boolean,
): Date {
  if (isMilestone || dur <= 0) return utcDay(start);
  if (cal) return utcDay(cal.addWorkingDays(start, dur - 1));
  return utcDay(addCalendarDays(start, dur - 1));
}

function startFromFinish(
  cal: WorkingDayCalendar | null,
  finish: Date,
  dur: number,
  isMilestone: boolean,
): Date {
  if (isMilestone || dur <= 0) return utcDay(finish);
  if (cal) return utcDay(cal.addWorkingDays(finish, -(dur - 1)));
  return utcDay(addCalendarDays(finish, -(dur - 1)));
}

function topoSort(ids: string[], edges: CpmEdgeInput[]): string[] {
  const sched = edges.filter((e) => e.type !== 'RELATES_TO');
  const indeg = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const id of ids) {
    indeg.set(id, 0);
    adj.set(id, []);
  }
  for (const e of sched) {
    if (!indeg.has(e.taskId) || !indeg.has(e.dependsOnId)) continue;
    indeg.set(e.taskId, (indeg.get(e.taskId) ?? 0) + 1);
    adj.get(e.dependsOnId)!.push(e.taskId);
  }
  const q = ids.filter((id) => (indeg.get(id) ?? 0) === 0);
  const out: string[] = [];
  while (q.length) {
    const n = q.shift()!;
    out.push(n);
    for (const m of adj.get(n) ?? []) {
      const d = (indeg.get(m) ?? 1) - 1;
      indeg.set(m, d);
      if (d === 0) q.push(m);
    }
  }
  if (out.length !== ids.length) {
    const bad = sched.find((e) => (indeg.get(e.taskId) ?? 0) > 0);
    throw new AppError(409, 'DEPENDENCY_CYCLE', 'Schedule network contains a cycle', {
      edgeId: bad?.id,
      taskId: bad?.taskId,
      dependsOnId: bad?.dependsOnId,
    });
  }
  return out;
}

export function computeCpm(
  tasks: CpmTaskInput[],
  edges: CpmEdgeInput[],
  cal: WorkingDayCalendar | null,
  scheduleVersion: number,
): CpmResult {
  const leaves = tasks.filter((t) => !t.isSummary);
  const meta = new Map<string, { dur: number; isMilestone: boolean; start: Date | null; due: Date | null }>();
  for (const t of leaves) {
    const start = t.startDate ?? t.dueDate;
    const end = t.dueDate ?? t.startDate;
    if (!start || !end) continue;
    meta.set(t.id, {
      dur: durationDays(cal, start, end, t.isMilestone),
      isMilestone: t.isMilestone,
      start: t.startDate,
      due: t.dueDate,
    });
  }
  const ids = [...meta.keys()];
  if (ids.length === 0) {
    return { scheduleVersion, taskCount: 0, criticalChain: [], tasks: [], criticalEdgeIds: [] };
  }

  const order = topoSort(ids, edges);
  const sched = edges.filter(
    (e) => e.type !== 'RELATES_TO' && meta.has(e.taskId) && meta.has(e.dependsOnId),
  );

  const es = new Map<string, Date>();
  const ef = new Map<string, Date>();

  for (const id of order) {
    const { dur, isMilestone, start, due } = meta.get(id)!;
    let earlyStart = utcDay(start ?? due!);
    for (const e of sched.filter((x) => x.taskId === id)) {
      const predEs = es.get(e.dependsOnId);
      const predEf = ef.get(e.dependsOnId);
      if (!predEs || !predEf) continue;
      let bound: Date;
      switch (e.type) {
        case 'START_TO_START':
          bound = addLag(cal, predEs, e.lag, e.lagUnit, e.calendarMode);
          break;
        case 'FINISH_TO_FINISH':
          bound = startFromFinish(
            cal,
            addLag(cal, predEf, e.lag, e.lagUnit, e.calendarMode),
            dur,
            isMilestone,
          );
          break;
        case 'FINISH_TO_START':
        default:
          bound = addLag(cal, predEf, e.lag, e.lagUnit, e.calendarMode);
          break;
      }
      if (bound.getTime() > earlyStart.getTime()) earlyStart = bound;
    }
    es.set(id, earlyStart);
    ef.set(id, finishFromStart(cal, earlyStart, dur, isMilestone));
  }

  const lastId = order.at(-1);
  if (!lastId) {
    return { scheduleVersion, taskCount: 0, criticalChain: [], tasks: [], criticalEdgeIds: [] };
  }
  let projectEnd = ef.get(lastId)!;
  for (const id of order) {
    const f = ef.get(id)!;
    if (f.getTime() > projectEnd.getTime()) projectEnd = f;
  }

  const ls = new Map<string, Date>();
  const lf = new Map<string, Date>();
  for (const id of [...order].reverse()) {
    const { dur, isMilestone } = meta.get(id)!;
    let lateFinish = projectEnd;
    for (const e of sched.filter((x) => x.dependsOnId === id)) {
      const succLs = ls.get(e.taskId);
      const succLf = lf.get(e.taskId);
      if (!succLs || !succLf) continue;
      let bound: Date;
      switch (e.type) {
        case 'START_TO_START':
          bound = finishFromStart(
            cal,
            addLag(cal, succLs, -e.lag, e.lagUnit, e.calendarMode),
            dur,
            isMilestone,
          );
          break;
        case 'FINISH_TO_FINISH':
          bound = addLag(cal, succLf, -e.lag, e.lagUnit, e.calendarMode);
          break;
        case 'FINISH_TO_START':
        default:
          bound = addLag(cal, succLs, -e.lag, e.lagUnit, e.calendarMode);
          bound = utcDay(addCalendarDays(bound, -1));
          break;
      }
      if (bound.getTime() < lateFinish.getTime()) lateFinish = bound;
    }
    lf.set(id, lateFinish);
    ls.set(id, startFromFinish(cal, lateFinish, dur, isMilestone));
  }

  const results: CpmTaskResult[] = [];
  const critical: string[] = [];
  for (const id of ids) {
    const eS = es.get(id)!;
    const lS = ls.get(id)!;
    const float = (lS.getTime() - eS.getTime()) / 86_400_000;
    const isCritical = float <= FLOAT_EPS;
    if (isCritical) critical.push(id);
    results.push({
      taskId: id,
      earlyStart: iso(eS),
      earlyFinish: iso(ef.get(id)!),
      lateStart: iso(lS),
      lateFinish: iso(lf.get(id)!),
      totalFloatDays: float,
      isCritical,
    });
  }

  return {
    scheduleVersion,
    taskCount: results.length,
    criticalChain: critical,
    tasks: results,
    criticalEdgeIds: sched
      .filter((e) => critical.includes(e.taskId) && critical.includes(e.dependsOnId))
      .map((e) => e.id),
  };
}

function finishFromFinish(
  cal: WorkingDayCalendar | null,
  startBound: Date,
  dur: number,
  isMilestone: boolean,
): Date {
  return finishFromStart(cal, startBound, dur, isMilestone);
}

export function getCachedCpm(projectId: string, scheduleVersion: number): CpmResult | undefined {
  return cache.get(`${projectId}:${scheduleVersion}`);
}

export function setCachedCpm(projectId: string, result: CpmResult): void {
  cache.set(`${projectId}:${result.scheduleVersion}`, result);
}

export function invalidateCpmCache(projectId: string): void {
  for (const k of cache.keys()) {
    if (k.startsWith(`${projectId}:`)) cache.delete(k);
  }
}
