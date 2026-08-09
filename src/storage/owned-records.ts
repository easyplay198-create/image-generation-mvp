import type {
  Asset,
  DesignVersion,
  Export,
  GenerationResult,
  Job,
  Project,
  StyleSpecRevision,
} from "@/src/generated/prisma/client";

type OwnedLookup = {
  id: string;
  ownerId: string;
};

type OwnedDelegate<RecordType> = {
  findFirst(args: { where: OwnedLookup }): Promise<RecordType | null>;
};

export type OwnedRecordDatabase = {
  project: OwnedDelegate<Project>;
  asset: OwnedDelegate<Asset>;
  styleSpecRevision: OwnedDelegate<StyleSpecRevision>;
  job: OwnedDelegate<Job>;
  generationResult: OwnedDelegate<GenerationResult>;
  designVersion: OwnedDelegate<DesignVersion>;
  export: OwnedDelegate<Export>;
};

export class OwnedRecords {
  constructor(private readonly database: OwnedRecordDatabase) {}

  findProject(lookup: OwnedLookup) {
    return this.database.project.findFirst({ where: lookup });
  }

  findAsset(lookup: OwnedLookup) {
    return this.database.asset.findFirst({ where: lookup });
  }

  findStyleSpecRevision(lookup: OwnedLookup) {
    return this.database.styleSpecRevision.findFirst({ where: lookup });
  }

  findJob(lookup: OwnedLookup) {
    return this.database.job.findFirst({ where: lookup });
  }

  findGenerationResult(lookup: OwnedLookup) {
    return this.database.generationResult.findFirst({ where: lookup });
  }

  findDesignVersion(lookup: OwnedLookup) {
    return this.database.designVersion.findFirst({ where: lookup });
  }

  findExport(lookup: OwnedLookup) {
    return this.database.export.findFirst({ where: lookup });
  }
}
