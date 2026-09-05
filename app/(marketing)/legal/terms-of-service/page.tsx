import type { Metadata } from "next";
import { LegalPage } from "../LegalPage";

export const metadata: Metadata = {
  title: "Kullanım Koşulları",
  description: "Lospia kullanım koşulları — erken aşama bilgilendirme taslağı.",
};

// Public contact channel is intentionally neutral until the official Lospia
// domain + mailbox are finalized (bkz. docs/rota.md); no unverified email is
// exposed to visitors.
const CONTACT_NOTE =
  "İletişim bilgileri resmi Lospia alan adı kesinleştiğinde güncellenecektir.";

export default function TermsOfServicePage() {
  return (
    <LegalPage title="Kullanım Koşulları" updated="5 Temmuz 2026">
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
          Sorularınız için kurulum görüşmesi kanalınız üzerinden bize
          ulaşabilirsiniz. {CONTACT_NOTE}
        </p>
      </section>
    </LegalPage>
  );
}
