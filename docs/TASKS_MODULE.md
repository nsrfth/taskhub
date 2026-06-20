# TaskHub — Tasks module reference (Mizito spec)

> **Status / how to read this.** This document is the **functional spec** derived from the
> 19 Mizito (میزیتو) tasks help articles. The original drop was authored *greenfield against an
> assumed stack* (NestJS + Prisma, `ProjectMember`/`UserGroupMember` access, class-validator
> DTOs). **TaskHub does not use that stack** — it is **Fastify + Zod + Prisma** with a
> team-based access model (`resolveProjectAccess` over owner / `project.write_all` /
> `ProjectEditDelegate` / group grants). So this file is kept as a **reference for the intended
> behaviour**, not as code to merge. The NestJS service/controller/DTO/permission files from the
> original drop are intentionally **not** added; their behaviour is realized in the existing
> Fastify tasks module (`backend/src/{routes,controllers,services}/tasks*`, `subtasks*`,
> `schemas/tasks.ts`, `lib/projectAccess.ts`).

## Where each behaviour lives in TaskHub

~14 of the 19 behaviours already shipped before this spec arrived. The table maps the spec to
the real implementation.

| # | Behaviour | In TaskHub |
|---|---|---|
| 1 | No-assignee task | `Task.assigneeId` nullable |
| 2 | Multi-assignee (one task, N people) | **Not yet** — single `assigneeId` + `responsibleId` (RACI). Deferred. |
| 3 | Task template | `TaskTemplate` (+ recurrence spawn) |
| 4/5 | Copy / copy-for-several | **Deferred** |
| 6 | Recurring tasks | recurrence module (`routes/recurrence.ts`, scheduler) |
| 7 | Checklist | **`Subtask`** (with its own 5-state status) |
| 8 | Due date + reminder | `Task.dueDate` + the due-date scheduler |
| 9 | Reopen completed | status PATCH back from DONE |
| 10 | Calendar / timeline window | Planner calendar + Gantt |
| 11 | Task weight | **Deferred** |
| 12 | Activity log | **`Activity`** via `logActivity()` |
| 13 | Complete (assignee) | status PATCH → DONE |
| 14 | Edit / delete / restore | update + soft-delete trash |
| 15 | Task sections | title/desc/subtasks/labels/attachments/dates/responsible |
| 16 | Create task | `POST …/tasks` |
| 17 | Monitoring views | Planner (my-tasks/board/grid/calendar) + `/me/tasks` |
| 18 | Mentions in reports | comment @-mentions (v1.84) |
| 19 | **Approval workflow** | **v1.87 — implemented (below)** |

## Approval workflow (v1.87)

The first spec behaviour that wasn't already present, adapted onto the existing module.

- **Schema:** `TaskStatus.PENDING_APPROVAL` + `Task.requiresApproval` + `Task.approverId`
  (migration `20260627120000_task_approval`). Decisions are recorded on the `Activity` log
  (`task.approval_requested` / `task.approval_approved` / `task.approval_rejected`) — no separate
  approval table (matches TaskHub's "use the activity/notification log, not per-feature tables").
- **State machine:**

  ```
  TODO ──▶ IN_PROGRESS ──▶ DONE
                       └─▶ PENDING_APPROVAL ──▶ DONE         (approve)
                                            └─▶ IN_PROGRESS  (reject + reason)
  ```

  Completion is a status→DONE PATCH. In `tasksService.update`, a DONE transition on a
  require-approval task is **rerouted to `PENDING_APPROVAL`** unless the actor is a **finalizer**:
  the designated approver, a team `MANAGER`, a global `ADMIN`, or a per-project full-edit delegate
  (they complete directly). The v1.29 dependency status-guard runs first on the *requested* status,
  so a blocked task can't enter approval.
- **API:**
  - `POST /api/teams/:teamId/projects/:projectId/tasks/:taskId/approve` → DONE (+ `completedAt`).
  - `POST …/tasks/:taskId/reject` body `{ reason }` (required) → IN_PROGRESS.
  - Both rely on the global `requireProjectAccess` hook (not `requireProjectWriteAccess`, so a
    designated approver holding only READ can still decide) and re-check the finalizer set in the
    service.
- **UI:** task detail page — managers/admins/delegates toggle *Require approval* + pick an approver;
  when pending, the approver (or a finalizer) gets Approve / Reject-with-reason. `PENDING_APPROVAL`
  renders on the board (purple) but is not offered in the manual status picker.

## Deferred (out of scope for v1.87)

Copy / copy-for-several, task weight, multi-assignee, plus the spec's recurrence-worker /
template-CRUD / attachment-pipeline / notification-fan-out items. Recurrence, templates, and
attachments already exist in TaskHub in their own forms.
