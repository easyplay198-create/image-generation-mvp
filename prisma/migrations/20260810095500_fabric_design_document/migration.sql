-- Align the T-01 scaffold with the versioned T-05 design document contract.
ALTER TABLE "DesignVersion"
  RENAME COLUMN "designJson" TO "documentJson";

ALTER TABLE "DesignVersion"
  ADD COLUMN "canvasWidth" INTEGER NOT NULL DEFAULT 1080,
  ADD COLUMN "canvasHeight" INTEGER NOT NULL DEFAULT 1080;

ALTER TABLE "DesignVersion"
  ALTER COLUMN "canvasWidth" DROP DEFAULT,
  ALTER COLUMN "canvasHeight" DROP DEFAULT;
