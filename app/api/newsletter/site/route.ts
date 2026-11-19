import { NextResponse } from "next/server";
import { listSiteCategories, listSiteStories, searchStoreProducts } from "@/lib/actions/newsletter";

/**
 * BÜLTEN — siteden OKUMA (story listesi, kategoriler, ürün arama).
 *
 * Bunlar eskiden doğrudan Server Action olarak çağrılıyordu. Next, Server
 * Action'ları tarayıcıda SIRAYLA işler: hafta açılınca sitenin story listesi
 * (2–10 sn) dönene kadar ilk KAYIT kuyrukta bekliyor, ekranda "Kaydediliyor"
 * asılı kalıyordu. Okumalar bu uçtan `fetch` ile gelir; kayıt kuyruğu yalnız
 * kayda kalır. Yetki aynı işlevlerin içinde (oturum + çalışma alanı üyeliği).
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q");
  if (q !== null) {
    const res = await searchStoreProducts(q);
    return NextResponse.json(res, { status: "error" in res ? 502 : 200 });
  }
  const [stories, categories] = await Promise.all([listSiteStories(), listSiteCategories()]);
  return NextResponse.json({
    stories: "error" in stories ? [] : stories.stories,
    categories: "error" in categories ? [] : categories.categories,
  });
}
