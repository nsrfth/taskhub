# Correspondence Module (دبیرخانه)

> Optional module. A **global admin** turns it on **per project** in
> **Settings → Correspondence module**. When off for a project, none of its
> correspondence routes or UI are reachable; when on, the project gains a
> per-project letters register.

## Purpose

A per-project register of **formal letters** a project exchanges — incoming /
outgoing / internal correspondence with reference numbers, parties, dates,
attachments, and routing. TaskHub manages tasks; this adds the دبیرخانه that
FA-primary organizations need: log every letter, auto-assign a reference number,
attach scans, and **refer (ارجاع)** a letter to colleagues for action/info.

## Enablement (per-project, admin-controlled)

- `Project.correspondenceEnabled Boolean @default(false)`.
- **Settings → Correspondence module** (global-admin only): lists every project
  (across teams) with an enable/disable toggle.
- Admin endpoints (global ADMIN only): `GET /api/admin/correspondence/projects`
  (list with enabled flag), `PATCH /api/admin/correspondence/projects/:projectId`
  `{ enabled }`.
- All correspondence routes first assert the project's flag is on (else 404 — the
  module appears not to exist for that project). The nav entry only renders when
  `project.correspondenceEnabled` is true (the flag is added to the project
  response so the SPA can gate).

## Scope

- Letters: direction INCOMING/OUTGOING/INTERNAL, subject, body, letter date
  (Jalali), reference number (auto), status DRAFT/SENT/RECEIVED/ARCHIVED, sender +
  recipient, file attachments, soft-delete.
- **Auto-numbering**: sequential per project per Jalali year, `"{jy}-{NNN}"`
  (e.g. `1404-001`), resets each Jalali year.
- **Contacts**: a reusable team-level directory (name, organization, email, phone,
  type) that letters reference for sender/recipient.
- **Referral (ارجاع)**: refer a letter to team members with kind ACTION/INFO +
  note; referred users get a notification and can mark their referral handled.

## Data model (Prisma)

New enums: `CorrespondenceDirection`, `CorrespondenceStatus`, `ContactType
{PERSON,ORG}`, `ReferralKind {ACTION,INFO}`, `ReferralStatus {PENDING,HANDLED}`;
+ `NotifyType.CORRESPONDENCE_REFERRAL`.

- **Contact** (team-level): `id, teamId, name, organization?, email?, phone?, type,
  createdById?, timestamps, deletedAt?`.
- **Correspondence** (per-project): `id, teamId (denormalized), projectId,
  direction, subject, body?, letterDate, jalaliYear, sequence, referenceNumber,
  status, senderId?, recipientId?, createdById?, timestamps, deletedAt?,
  deletedById?`. `@@unique([projectId, jalaliYear, sequence])`,
  `@@unique([projectId, referenceNumber])`.
- **CorrespondenceReferral**: `id, correspondenceId, teamId, userId, kind, note?,
  status, referredById?, createdAt, handledAt?`. `@@unique([correspondenceId, userId])`.
- **CorrespondenceCounter** (numbering): `id, projectId, jalaliYear,
  currentValue`, `@@unique([projectId, jalaliYear])`.
- **Attachment** made polymorphic: `taskId` nullable + new nullable
  `correspondenceId`, DB CHECK exactly one parent set. Reuses `AttachmentsService`.

### Concurrency-safe numbering

Inside the create transaction, derive the Jalali year via
`utcMidnightToJalali(letterDate)` then `upsert` the `(projectId, jalaliYear)`
counter row with `update: { currentValue: { increment: 1 } }`. The unique counter
row serializes concurrent creates; the unique `(projectId, referenceNumber)` and
`(projectId, jalaliYear, sequence)` indexes make duplicates impossible. The number
is **permanent** (editing `letterDate` to another year does not renumber).

## Backend layout

- New: `services/{correspondenceService,contactsService}.ts`,
  `controllers/{correspondenceController,contactsController}.ts`,
  `routes/{correspondence,contacts,correspondenceAdmin}.ts`,
  `schemas/{correspondence,contacts}.ts`, migration dir.
- Edit: `prisma/schema.prisma`, `services/attachmentsService.ts` (correspondence
  methods), `services/notificationsService.ts` (`onCorrespondenceReferral`),
  `lib/permissions.ts` (`correspondence.read`, `correspondence.manage`,
  `contacts.manage`), `schemas/apiTokens.ts` (scopes), `app.ts` (register routers).

Correspondence routes mount at
`/teams/:teamId/projects/:projectId/correspondence`, hooks
`requireAuth → requireTeamRoleOrGrantedProject → requireProjectAccess →
assert module enabled`; mutations add `requireProjectWriteAccess`. Contacts mount
at `/teams/:teamId/contacts` (reads open to members; writes need
`contacts.manage`). Referral-handled is gated by referral ownership, not project
write. Admin enablement mounts at `/api/admin/correspondence` (global ADMIN only).

## Frontend layout

- New: `pages/CorrespondencePage.tsx` (route `/projects/:projectId/correspondence`),
  `features/correspondence/*` (api, register, letter editor with `ShamsiDatePicker`
  + contact picker + attachments fork + referral panel), `features/contacts/*`
  (api, panel, picker), `pages/settings/CorrespondenceModulePage.tsx` (admin
  per-project toggles).
- Edit: `app/router.tsx` (+ settings route), `features/settings/SettingsLayout`
  (admin nav entry), `features/projects/ProjectListRow.tsx` + `pages/TasksPage.tsx`
  (nav entry, shown only when `project.correspondenceEnabled`),
  `features/notifications/{api.ts,NotificationBell.tsx}` (referral notification),
  `i18n/{en,fa}.json` (دبیرخانه / مخاطبین / ارجاع …, FA fully translated).

## Verification

`prisma migrate` applies cleanly; `npm test` (new correspondence + contacts +
enablement-gate tests, full suite green incl. unchanged task-attachment tests).
Manual: admin enables it for a project → letters register appears → create a
contact + letters (`1404-001`, `1404-002`) → attach a PDF → refer to a member who
gets a bell notification and marks it handled. Disabled project → routes 404, no
nav entry. Cross-team user → 404.
