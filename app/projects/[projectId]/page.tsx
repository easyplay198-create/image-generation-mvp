import { connection } from "next/server";

import { resolveBenchmarkRuntimeCapability } from "@/src/vision/runtime-capability";

import ProjectWorkspace from "./project-workspace";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  await connection();
  const benchmarkRuntimeCapability = resolveBenchmarkRuntimeCapability(
    process.env,
  );

  return (
    <ProjectWorkspace
      projectId={projectId}
      benchmarkRuntimeCapability={benchmarkRuntimeCapability}
    />
  );
}
