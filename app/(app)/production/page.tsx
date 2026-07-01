import { ModuleShellView } from "@/components/modules/ModuleShellView";
import { MODULE_SHELLS } from "@/lib/modules/registry";

export default function ProductionPage() {
  return <ModuleShellView shell={MODULE_SHELLS.production} />;
}
