-- Persist normalized provider observability and cost metadata for T-04 results.
ALTER TABLE "GenerationResult"
  ADD COLUMN "providerName" TEXT,
  ADD COLUMN "providerRequestId" TEXT,
  ADD COLUMN "requestId" TEXT,
  ADD COLUMN "durationMs" INTEGER,
  ADD COLUMN "usageJson" JSONB,
  ADD COLUMN "costMetadataJson" JSONB;

UPDATE "GenerationResult"
SET
  "providerName" = 'legacy-unknown',
  "providerRequestId" = 'legacy-' || "id",
  "requestId" = 'legacy-' || "id",
  "durationMs" = 0,
  "usageJson" = '{"generatedImages":1,"inputUnits":null,"outputPixels":1}',
  "costMetadataJson" = '{"amount":"0","currency":"USD","estimated":true}';

ALTER TABLE "GenerationResult"
  ALTER COLUMN "providerName" SET NOT NULL,
  ALTER COLUMN "providerRequestId" SET NOT NULL,
  ALTER COLUMN "requestId" SET NOT NULL,
  ALTER COLUMN "durationMs" SET NOT NULL,
  ALTER COLUMN "usageJson" SET NOT NULL,
  ALTER COLUMN "costMetadataJson" SET NOT NULL;
