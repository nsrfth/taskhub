-- v1.41: Subtask scheduling fields + Project budget fields.
--
-- All four columns are nullable + additive. Existing rows get NULL — no
-- data migration required, no behavior change for callers that ignore
-- the new fields.
--
-- Subtask.startDate / endDate are anchored to UTC midnight (same TIMESTAMP(3)
-- convention as Task.startDate / dueDate / plannedDate). Cross-field rule
-- "endDate >= startDate when both set" is enforced in the service layer
-- to produce a friendly 400 message; the CHECK below is the defence-in-
-- depth backstop so a direct DB write can't violate it either.
--
-- Project.plannedBudget / actualSpent use DECIMAL(18, 2):
--   - 16 digits before decimal point: room for >10^15 in any currency unit
--   - 2 digits after: standard currency precision (cents/rials/etc.)
--   - non-negative CHECK matches the service-layer rule

ALTER TABLE "Subtask"
  ADD COLUMN "startDate" TIMESTAMP(3),
  ADD COLUMN "endDate"   TIMESTAMP(3);

ALTER TABLE "Subtask"
  ADD CONSTRAINT "Subtask_endDate_gte_startDate_chk"
  CHECK ("startDate" IS NULL OR "endDate" IS NULL OR "endDate" >= "startDate");

ALTER TABLE "Project"
  ADD COLUMN "plannedBudget" DECIMAL(18, 2),
  ADD COLUMN "actualSpent"   DECIMAL(18, 2);

ALTER TABLE "Project"
  ADD CONSTRAINT "Project_plannedBudget_nonneg_chk"
  CHECK ("plannedBudget" IS NULL OR "plannedBudget" >= 0);

ALTER TABLE "Project"
  ADD CONSTRAINT "Project_actualSpent_nonneg_chk"
  CHECK ("actualSpent" IS NULL OR "actualSpent" >= 0);
