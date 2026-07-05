import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isMarketingHost } from "@/lib/marketing/host";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import {
  LOSPIA_HOME_DESCRIPTION,
  LOSPIA_SITE_NAME,
} from "@/components/marketing/seo";

// Public Lospia marketing pages (/request-access, /legal/*).
// The AF Operasyon pilot host never serves these: middleware already sends
// unauthenticated visitors to /login, and this guard sends authenticated AF
// users back to the app.
export const metadata: Metadata = {
  title: {
    default: LOSPIA_SITE_NAME,
    template: `%s · ${LOSPIA_SITE_NAME}`,
  },
  description: LOSPIA_HOME_DESCRIPTION,
  applicationName: LOSPIA_SITE_NAME,
  robots: { index: true, follow: true },
};

export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const host = (await headers()).get("host");
  if (!isMarketingHost(host)) {
    redirect("/board");
  }
  return <MarketingShell>{children}</MarketingShell>;
}
