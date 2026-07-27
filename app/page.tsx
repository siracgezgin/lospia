import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isMarketingHost } from "@/lib/marketing/host";
import { MarketingHome } from "@/components/marketing/MarketingHome";
import { LOSPIA_HOME_METADATA } from "@/components/marketing/seo";

// Root "/" is host-aware:
//  * operasyon.aslifilinta.com → /home (Ana Sayfa: bana atananlar + bugünün
//    planı + kısayollar) — rolden bağımsız tek giriş noktası. Oturum yoksa
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
    redirect("/home");
  }
  return <MarketingHome />;
}
