-- T-02 validates and persists decoded dimensions for every uploaded asset.
ALTER TABLE "Asset"
  ALTER COLUMN "width" SET NOT NULL,
  ALTER COLUMN "height" SET NOT NULL;
