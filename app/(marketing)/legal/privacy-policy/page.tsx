import type { Metadata } from "next";
import { LegalPage } from "../LegalPage";

export const metadata: Metadata = {
  title: "Gizlilik Politikası",
  description: "Lospia gizlilik politikası — erken aşama bilgilendirme taslağı.",
};

// Public contact channel is intentionally neutral until the official Lospia
// domain + mailbox are finalized (bkz. docs/rota.md); no unverified email is
// exposed to visitors.
const CONTACT_NOTE =
  "İletişim bilgileri resmi Lospia alan adı kesinleştiğinde güncellenecektir.";

export default function PrivacyPolicyPage() {
  return (
    <LegalPage title="Gizlilik Politikası" updated="5 Temmuz 2026">
      <p className="rounded-card border border-line bg-surface p-4 text-sm">
        Bu sayfa, Lospia&apos;nın erken (pilot) aşamasında hazırlanmış
        bilgilendirme amaçlı bir taslaktır; nihai bir hukuki metin veya hukuki
        danışmanlık değildir. Ticari lansman öncesinde hukuki ve uyumluluk
        dokümanları güncellenebilir ve genişletilebilir.
      </p>

      <section className="space-y-3">
        <h2>Hangi verileri topluyoruz?</h2>
        <ul>
          <li>
            <strong className="text-ink">Talep formu verileri:</strong> Kurulum
            görüşmesi formunu doldurduğunuzda isim, iş e-postası, şirket/marka
            adı, ekip büyüklüğü, kullandığınız araçlar ve paylaştığınız
            operasyonel notlar.
          </li>
          <li>
            <strong className="text-ink">Çalışma alanı ve kullanıcı verileri:</strong>{" "}
            Lospia çalışma alanı kullanıcısıysanız hesap bilgileri (ad,
            e-posta, rol) ile çalışma alanınızda oluşturulan görevler, notlar
            ve operasyonel kayıtlar.
          </li>
          <li>
            <strong className="text-ink">Kullanım verileri:</strong> Hizmetin
            çalışması ve iyileştirilmesi için gerekli temel teknik kayıtlar
            (ör. oturum ve hata kayıtları).
          </li>
          <li>
            <strong className="text-ink">İletişim verileri:</strong> Bizimle
            e-posta veya görüşmeler üzerinden paylaştığınız bilgiler.
          </li>
        </ul>
      </section>

      <section className="space-y-3">
        <h2>Verileri nasıl kullanıyoruz?</h2>
        <ul>
          <li>Kurulum görüşmesi taleplerini değerlendirmek ve size dönüş yapmak,</li>
          <li>Lospia hizmetini sağlamak, işletmek ve geliştirmek,</li>
          <li>Destek taleplerinizi yanıtlamak.</li>
        </ul>
        <p>
          Verilerinizi üçüncü taraflara satmıyoruz. Çalışma alanı verileri,
          çalışma alanı bazında izole edilir ve yalnızca yetkilendirilmiş
          çalışma alanı üyeleri tarafından erişilebilir.
        </p>
      </section>

      <section className="space-y-3">
        <h2>Veri saklama ve silme</h2>
        <p>
          Verileriniz, hizmetin sağlanması için gerekli olduğu sürece saklanır.
          Verilerinizin silinmesini veya düzeltilmesini talep etmek için
          kurulum görüşmesi kanalınız üzerinden bizimle iletişime
          geçebilirsiniz. {CONTACT_NOTE}
        </p>
      </section>

      <section className="space-y-3">
        <h2>Uyumluluk hakkında dürüst not</h2>
        <p>
          Lospia erken aşama bir üründür. SOC 2 veya ISO 27001 gibi
          sertifikasyonlara sahip olduğumuzu iddia etmiyoruz. KVKK ve GDPR
          kapsamındaki yükümlülüklere uyum çalışmalarımız devam etmektedir ve
          ilgili hukuki dokümanlar daha geniş ticari lansman öncesinde
          güncellenecektir.
        </p>
      </section>

      <section className="space-y-3">
        <h2>İletişim</h2>
        <p>
          Gizlilikle ilgili sorularınız için kurulum görüşmesi kanalınız
          üzerinden bize ulaşabilirsiniz. {CONTACT_NOTE}
        </p>
      </section>
    </LegalPage>
  );
}
