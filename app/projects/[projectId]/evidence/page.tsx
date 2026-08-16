import VisionWorkspace from "../_components/v4/vision-workspace";

export default async function EvidenceArchivePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <VisionWorkspace projectId={projectId} page="evidence" />;
}
