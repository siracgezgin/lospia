import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isMarketingHost } from "@/lib/marketing/host";
import { createClient } from "@/lib/supabase/server";
import { MarketingHome } from "@/components/marketing/MarketingHome";
import { LOSPIA_HOME_METADATA } from "@/components/marketing/seo";

// Root "/" is host-aware:
//  * operasyon.aslifilinta.com → yönetici için /planning (haftalık takvim —
//    "ilk panon buna dönecek"), üyeler için /board. Oturum yoksa /board;
//    middleware login'e yönlendirir.
//  * localhost / future Lospia domains → public Lospia marketing homepage.
export async function generateMetadata(): Promise<Metadata> {
  const host = (await headers()).get("host");
  // AF host keeps the AF metadata inherited from the root layout.
  if (!isMarketingHost(host)) return {};
  return LOSPIA_HOME_METADATA;
}

export default async function Home() {
  const host = (await headers()).get("host");
  if (!isMarketingHost(host)) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: member } = await supabase
        .from("workspace_members")
        .select("role")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();
      if (member?.role === "owner" || member?.role === "admin") redirect("/planning");
    }
    redirect("/board");
  }
  return <MarketingHome />;
}
