import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/**
 * Hukuki metinlerin ORTAK kabuğu — Gizlilik Politikası ve Kullanım Koşulları
 * aynı yerleşimi kullanır.
 *
 * İki kusur vardı ve ikisi de her iki sayfada birebir tekrarlanıyordu:
 *   • Kart, yatay dolgusu olmayan bir kapta duruyordu. 375px'lik ekranda
 *     yuvarlatılmış köşeler ekranın iki kenarına yapışıyor, metin kenara
 *     dayanıyordu.
 *   • Sayfadan çıkış yolu yalnız en alttaki footer'daydı; uzun metnin
 *     başında geri dönecek bir bağlantı yoktu.
 *
 * Metnin kendisi `children` olarak gelir; tipografi kuralları (h2, ul) tek
 * yerde tanımlıdır ki iki belge birbirinden ayrışmasın.
 */
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  /** "5 Temmuz 2026" gibi — başlığın altındaki tek satır. */
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <div className="px-4 py-12 sm:px-6 sm:py-16">
      <div className="mx-auto max-w-2xl">
        <Link
          href="/"
          className="inline-flex min-h-[44px] items-center gap-2 rounded-lg px-1 text-sm font-medium text-slate-500 transition-colors duration-150 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 focus-visible:ring-offset-2"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Ana sayfaya dön
        </Link>

        <article className="mt-3 rounded-2xl border border-slate-200 bg-white px-5 py-10 shadow-sm sm:px-10 sm:py-14">
          <h1 className="font-serif text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            {title}
          </h1>
          <p className="mt-3 text-sm text-subtle">
            Son güncelleme: {updated} · Erken aşama bilgilendirme taslağı
          </p>

          <div className="mt-8 space-y-8 text-base leading-relaxed text-muted [&_h2]:font-serif [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-ink [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
            {children}
          </div>
        </article>

        <p className="mt-6 text-center text-xs text-slate-400">
          <Link
            href="/request-access"
            className="rounded-sm underline underline-offset-4 transition-colors duration-150 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
          >
            Sorularınız için kurulum görüşmesi talep edebilirsiniz.
          </Link>
        </p>
      </div>
    </div>
  );
}
