-- v1.79: grant the new `project.write_all` permission to every existing
-- system Manager role so managers regain team-wide task/comment write.
-- Background: v1.39 made project access owner-scoped, which silently stopped
-- a team MANAGER (who is not the owner and has no FULL group grant) from
-- adding tasks to a project — the nested write resolved to NONE and surfaced
-- as the 404 "Project not found". `project.write_all` restores that ability
-- as an explicit, permission-gated grant (distinct from `project.edit`).
--
-- Mirrors the v1.30.8 `team.edit_details` backfill: a new permission constant
-- needs BOTH the lib/permissions.ts entry AND this backfill, otherwise existing
-- teams' Manager roles would never pick it up (new teams get it automatically
-- via ensureSystemRoles → DEFAULT_MANAGER_PERMISSIONS).
--
-- Idempotent: RolePermission PK is (roleId, permission), so ON CONFLICT
-- DO NOTHING makes re-runs and already-granted roles no-ops. Only the system
-- "Manager" role is targeted — custom roles and the "Member" role are left
-- untouched, so this never widens any other role.

INSERT INTO "RolePermission" ("roleId", "permission")
SELECT r."id", 'project.write_all'
FROM "Role" r
WHERE r."name" = 'Manager' AND r."isSystem" = true
ON CONFLICT DO NOTHING;
