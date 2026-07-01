import { redirect } from "next/navigation";
import { ModuleShellView } from "@/components/modules/ModuleShellView";
import { AccessDenied } from "@/components/modules/AccessDenied";
import { MODULE_SHELLS } from "@/lib/modules/registry";
import { requireModuleAdmin } from "@/lib/modules/context";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const { gate } = await requireModuleAdmin();
  if (gate === "login") redirect("/login");
  if (gate !== "ok") return <AccessDenied />;
  return <ModuleShellView shell={MODULE_SHELLS.reports} />;
}
