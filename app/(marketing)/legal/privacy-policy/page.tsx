import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Gizlilik Politikası",
  description: "Lospia gizlilik politikası — erken aşama bilgilendirme taslağı.",
};

// TODO: hello@lospia.com henüz doğrulanmış bir adres değil — Lospia domaini ve
// resmi e-posta kesinleştiğinde güncellenmeli (bkz. docs/rota.md).
const CONTACT_EMAIL = "hello@lospia.com";

export default function PrivacyPolicyPage() {
  return (
    <article className="mx-auto max-w-2xl px-4 py-16 sm:px-6 sm:py-20">
      <h1 className="font-serif text-3xl font-semibold tracking-tight text-ink">
        Gizlilik Politikası
      </h1>
      <p className="mt-3 text-sm text-subtle">
        Son güncelleme: 5 Temmuz 2026 · Erken aşama bilgilendirme taslağı
      </p>

      <div className="mt-8 space-y-8 text-base leading-relaxed text-muted [&_h2]:font-serif [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-ink [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
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
            Verilerinizin silinmesini veya düzeltilmesini talep etmek için{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand underline">
              {CONTACT_EMAIL}
            </a>{" "}
            adresine yazabilirsiniz.
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
            Gizlilikle ilgili her türlü soru için:{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand underline">
              {CONTACT_EMAIL}
            </a>
          </p>
        </section>
      </div>
    </article>
  );
}
