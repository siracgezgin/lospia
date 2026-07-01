import { redirect } from "next/navigation";
import { requireModuleAdmin } from "@/lib/modules/context";
import { AccessDenied } from "@/components/modules/AccessDenied";
import { CollectionViewer } from "@/components/collection/CollectionViewer";

export const dynamic = "force-dynamic";

export default async function CollectionPage() {
  const { gate } = await requireModuleAdmin();
  if (gate === "login") redirect("/login");
  if (gate !== "ok") return <AccessDenied />;

  // Route is admin-only; the viewer stays read-only and never writes to the DB.
  return <CollectionViewer isAdmin />;
}
