import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/modules/context";
import { CollectionViewer } from "@/components/collection/CollectionViewer";

export const dynamic = "force-dynamic";

export default async function CollectionPage() {
  const { user, workspaceId, isAdmin } = await getWorkspaceContext();
  if (!user) redirect("/login");
  if (!workspaceId) {
    return <div className="p-8 text-muted">Çalışma alanı bulunamadı.</div>;
  }

  return <CollectionViewer isAdmin={isAdmin} />;
}
