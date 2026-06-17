-- v1.83: add START_TO_START (SS) and FINISH_TO_FINISH (FF) dependency types.
-- Additive enum values — existing FINISH_TO_START / RELATES_TO rows are
-- unaffected and no backfill is needed. Enforced via status rules, not dates.

ALTER TYPE "DependencyType" ADD VALUE 'START_TO_START';
ALTER TYPE "DependencyType" ADD VALUE 'FINISH_TO_FINISH';
