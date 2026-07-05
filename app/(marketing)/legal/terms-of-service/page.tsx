import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Kullanım Koşulları",
  description: "Lospia kullanım koşulları — erken aşama bilgilendirme taslağı.",
};

// TODO: hello@lospia.com henüz doğrulanmış bir adres değil — Lospia domaini ve
// resmi e-posta kesinleştiğinde güncellenmeli (bkz. docs/rota.md).
const CONTACT_EMAIL = "hello@lospia.com";

export default function TermsOfServicePage() {
  return (
    <article className="mx-auto max-w-2xl px-4 py-16 sm:px-6 sm:py-20">
      <h1 className="font-serif text-3xl font-semibold tracking-tight text-ink">
        Kullanım Koşulları
      </h1>
      <p className="mt-3 text-sm text-subtle">
        Son güncelleme: 5 Temmuz 2026 · Erken aşama bilgilendirme taslağı
      </p>

      <div className="mt-8 space-y-8 text-base leading-relaxed text-muted [&_h2]:font-serif [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-ink [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
        <p className="rounded-card border border-line bg-surface p-4 text-sm">
          Bu sayfa, Lospia&apos;nın erken (pilot) aşamasında hazırlanmış
          bilgilendirme amaçlı bir taslaktır; nihai bir hukuki metin veya hukuki
          danışmanlık değildir. Ücretli müşteri ilişkileri, ayrıca imzalanan
          hizmet sözleşmesi ve kapsam dokümanı (Scope of Work) ile yürütülür.
          Bu koşullar daha geniş ticari lansman öncesinde güncellenebilir.
        </p>

        <section className="space-y-3">
          <h2>Hizmetin tanımı</h2>
          <p>
            Lospia; marka, e-ticaret ve yaratıcı ekipler için görev, sorumlu,
            onay ve haftalık görünürlük yönetimi sağlayan bir operasyon
            panelidir. Hizmet, kurulum destekli pilot süreci ve aylık çalışma
            alanı aboneliği modeliyle sunulur; self-service bir ürün değildir.
          </p>
        </section>

        <section className="space-y-3">
          <h2>Hesaplar ve sorumluluklar</h2>
          <ul>
            <li>Hesap bilgilerinizin gizliliğinden siz sorumlusunuz.</li>
            <li>
              Çalışma alanınıza yüklediğiniz içeriklerin hukuka uygunluğundan
              içerik sahibi olarak siz sorumlusunuz.
            </li>
            <li>
              Hizmeti kötüye kullanım (yetkisiz erişim denemesi, zararlı içerik,
              sistemin kararlılığını bozacak kullanım) hesabın askıya
              alınmasına neden olabilir.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2>Kapsam</h2>
          <p>
            Standart kurulum ve abonelik; özel API entegrasyonları, ERP/PLM/WMS
            entegrasyonları, sınırsız veri taşıma veya özel yazılım geliştirme
            içermez. Kapsam, her müşteri için ayrıca yazılı olarak
            netleştirilir.
          </p>
        </section>

        <section className="space-y-3">
          <h2>Garanti reddi</h2>
          <p>
            Hizmet, erken aşama bir ürün olarak &quot;olduğu gibi&quot; sunulur.
            Kesintisiz veya hatasız çalışma garantisi verilmez; makul çaba
            esasıyla işletilir ve geliştirilir.
          </p>
        </section>

        <section className="space-y-3">
          <h2>Değişiklikler</h2>
          <p>
            Bu koşullar zaman zaman güncellenebilir. Önemli değişiklikler,
            aktif müşterilere makul bir süre önce bildirilir.
          </p>
        </section>

        <section className="space-y-3">
          <h2>İletişim</h2>
          <p>
            Sorularınız için:{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand underline">
              {CONTACT_EMAIL}
            </a>
          </p>
        </section>
      </div>
    </article>
  );
}
