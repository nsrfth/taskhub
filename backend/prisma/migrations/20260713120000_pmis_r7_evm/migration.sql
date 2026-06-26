-- v2.3 (PMIS R7 — EVM): EvmSnapshot table for earned-value metric trending.
-- On-demand computation lives in EvmService; rows here are save-points for
-- S-curve charts. EacMethod enum drives the Estimate-At-Completion formula.

CREATE TYPE "EacMethod" AS ENUM ('CPI_BASED', 'SPI_BASED', 'TCPI_BASED');

CREATE TABLE "EvmSnapshot" (
    "id"           TEXT NOT NULL,
    "teamId"       TEXT NOT NULL,
    "projectId"    TEXT NOT NULL,
    "snapshotDate" DATE NOT NULL,
    "bac"          BIGINT NOT NULL,
    "pv"           BIGINT NOT NULL,
    "ev"           BIGINT NOT NULL,
    "ac"           BIGINT NOT NULL,
    "cv"           BIGINT NOT NULL,
    "sv"           BIGINT NOT NULL,
    "cpi"          DECIMAL(6,4) NOT NULL,
    "spi"          DECIMAL(6,4) NOT NULL,
    "eac"          BIGINT NOT NULL,
    "eacMethod"    "EacMethod" NOT NULL DEFAULT 'CPI_BASED',
    "vac"          BIGINT NOT NULL,
    "tcpi"         DECIMAL(6,4) NOT NULL,
    "currency"     "Currency" NOT NULL,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EvmSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EvmSnapshot_projectId_snapshotDate_idx" ON "EvmSnapshot"("projectId", "snapshotDate");
CREATE INDEX "EvmSnapshot_teamId_idx" ON "EvmSnapshot"("teamId");

ALTER TABLE "EvmSnapshot"
    ADD CONSTRAINT "EvmSnapshot_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "EvmSnapshot_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
