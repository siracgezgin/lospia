import Link from "next/link";
import {
  CalendarCheck,
  CheckCircle2,
  ClipboardList,
  Eye,
  LayoutGrid,
  ListChecks,
  ShieldCheck,
  Users,
  XCircle,
} from "lucide-react";
import { MarketingShell } from "./MarketingShell";

// Lospia public homepage — copy follows docs/LOSPIA_MARKETING_STRATEGY.md.
// Deliberately no self-serve CTAs ("Ücretsiz Başla" vb.): the current model is
// productized setup + monthly subscription, so every CTA leads to a setup call.

const PROBLEMS = [
  {
    title: "WhatsApp'ta kaybolan işler",
    body: "Önemli kararlar ve görevler mesaj geçmişlerinde unutulur; kimse geri dönüp bulamaz.",
  },
  {
    title: "Excel'de unutulan takipler",
    body: "Tablolar güncellenmez, satırlar eskir; teslim tarihleri sessizce geçer.",
  },
  {
    title: "Belirsiz sorumluluk",
    body: "Kimin hangi işi ne zamana kadar tamamlaması gerektiği kimse için net değildir.",
  },
  {
    title: "Geciken onaylar",
    body: "Tasarım, satın alma ve üretim onayları kayıt altına alınmaz; işler onay beklerken tıkanır.",
  },
  {
    title: "Haftalık görünmezlik",
    body: "Yönetici ilerlemeyi görmek için tek tek sormak zorunda kalır; operasyon hafızaya dayanır.",
  },
];

const FEATURES = [
  {
    icon: LayoutGrid,
    title: "Departman merkezi",
    body: "Üretim, içerik, koleksiyon, satın alma — her departmanın işi kendi alanında, tek panelde.",
  },
  {
    icon: Users,
    title: "Görevler ve sorumlular",
    body: "Her işin bir sahibi, bir sorumlusu ve bir teslim tarihi olur. Kim ne yapıyor, herkes görür.",
  },
  {
    icon: CalendarCheck,
    title: "Haftalık görünüm",
    body: "Bu hafta ne bitti, ne gecikti, ne kritik? Sormadan görün.",
  },
  {
    icon: CheckCircle2,
    title: "Onay ve bekleyen işler",
    body: "Onay bekleyen işler mesajlarda kaybolmaz. Kimin hangi kararı beklediği açıkça görünür.",
  },
  {
    icon: ClipboardList,
    title: "Kurallar ve standartlar",
    body: "Ekip kuralları mesajlarda değil, herkesin erişebileceği sade bir alanda yaşar.",
  },
  {
    icon: ShieldCheck,
    title: "Rol bazlı ekip kullanımı",
    body: "Owner, admin, member ve viewer rolleriyle kimin neyi görüp değiştirebileceğini kontrol edin.",
  },
];

const USE_CASES = [
  {
    title: "Moda marka operasyonları",
    body: "Koleksiyon, numune, kumaş onayı ve üretim takibini tek panelde yönetin.",
  },
  {
    title: "E-ticaret operasyonları",
    body: "Kampanya lansmanları, ürün görselleri ve haftalık yayın takvimini disipline taşıyın.",
  },
  {
    title: "Yaratıcı stüdyo operasyonları",
    body: "Revizyon döngülerini, müşteri onaylarını ve teslimleri görünür hale getirin.",
  },
  {
    title: "Onay ve teslim tarihi takibi",
    body: "Hiçbir iş onay beklerken sessizce tıkanmasın; geciken teslimler panelde öne çıksın.",
  },
  {
    title: "Excel'den operasyon paneline geçiş",
    body: "Mevcut Excel listenizi görev kartlarına, sorumlulara ve teslim tarihlerine dönüştürün.",
  },
];

const NOT_FOR = [
  "Sadece muhasebe veya e-fatura çözümü arayanlar",
  "Ağır ERP, PLM veya depo yönetim sistemi isteyenler",
  "Sistemi ekipçe kullanmaya niyeti olmayan ekipler",
  "Tek kişilik, basit operasyonlar",
  "Sınırsız özel yazılım geliştirme bekleyenler",
];

const FAQ = [
  {
    q: "Kurulum ne kadar sürer?",
    a: "Standart kurulum, bilgi ve verilerin teslim hızına bağlı olarak 7-14 iş günü içinde tamamlanır. Operasyonunuzu birlikte haritalar, çalışma alanınızı biz kurarız.",
  },
  {
    q: "Lospia ClickUp veya Notion'dan nasıl farklı?",
    a: "ClickUp ve Notion boş bir tuval verir; kurulumu, düzeni ve disiplini sizden bekler. Lospia marka operasyonları için hazır bir yapıyla gelir ve çalışma alanınız sizinle birlikte kurulur. Amaç daha fazla özellik değil, ekipçe gerçekten kullanılan sade bir sistem.",
  },
  {
    q: "Verilerimiz güvende mi?",
    a: "Her çalışma alanı veritabanı seviyesinde (Row Level Security) izole edilir; bir müşterinin verisine başka bir müşteri erişemez. Erişim rol bazlıdır ve tüm bağlantılar şifrelidir.",
  },
  {
    q: "Ücretsiz deneme var mı?",
    a: "Hayır. Lospia self-service bir ürün değil; kurulum destekli bir pilot süreciyle başlar. Boş bir panel yerine, operasyonunuza göre kurulmuş bir sistem teslim ederiz.",
  },
  {
    q: "Fiyatlandırma nasıl?",
    a: "Tek seferlik kurulum ücreti + aylık workspace aboneliği. Kullanıcı başına değil, çalışma alanı bazında fiyatlandırılır. Kapsam ve ekip büyüklüğüne göre kurulum görüşmesinde netleştirilir.",
  },
  {
    q: "Ekibimiz kullanmazsa ne olur?",
    a: "Kurulum sürecinin bir parçası ekip eğitimidir: canlı onboarding, rol dağılımı ve ilk haftalık takip birlikte yapılır. İlk haftalarda düzenli kontrol görüşmeleriyle sistemin gerçekten oturmasını takip ederiz.",
  },
  {
    q: "Excel verilerimizi aktarabilir miyiz?",
    a: "Evet. Mevcut Excel operasyon listeniz kurulum kapsamında Lospia'ya taşınır; satırlar görevlere, sorumlulara ve teslim tarihlerine dönüşür.",
  },
  {
    q: "Özel geliştirme yapıyor musunuz?",
    a: "Standart kurulum kapsamında özel yazılım geliştirme yer almaz. Lospia bilinçli olarak sade ve opinionated bir üründür. Tekrarlanan ihtiyaçlar ürün yol haritasına alınır; birden fazla müşteride görülen talepler standart özellik olur.",
  },
];

function SectionHeading({
  kicker,
  title,
  body,
}: {
  kicker?: string;
  title: string;
  body?: string;
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      {kicker && (
        <p className="mb-3 text-sm font-medium uppercase tracking-widest text-brand">
          {kicker}
        </p>
      )}
      <h2 className="font-serif text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
        {title}
      </h2>
      {body && <p className="mt-4 text-base leading-relaxed text-muted">{body}</p>}
    </div>
  );
}

export function MarketingHome() {
  return (
    <MarketingShell>
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="border-b border-hairline bg-surface">
        <div className="mx-auto max-w-4xl px-4 pb-20 pt-20 text-center sm:px-6 sm:pt-28">
          <h1 className="font-serif text-4xl font-semibold leading-tight tracking-tight text-ink sm:text-5xl">
            Excel ve WhatsApp karmaşasına son verin.
            <br className="hidden sm:block" /> Marka operasyonlarınızı tek panelde
            yönetin.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted">
            Lospia; moda, e-ticaret ve yaratıcı ekiplerin görevleri, sorumluları,
            teslim tarihlerini, onay bekleyen işleri ve haftalık ilerlemeyi tek sade
            panelde yönetmesini sağlar.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/request-access"
              className="w-full rounded-lg bg-brand px-6 py-3 text-base font-medium text-white shadow-sm transition-colors hover:bg-brand-strong sm:w-auto"
            >
              Kurulum Görüşmesi Planla
            </Link>
            <Link
              href="/request-access"
              className="w-full rounded-lg border border-line bg-surface px-6 py-3 text-base font-medium text-ink transition-colors hover:bg-surface-muted sm:w-auto"
            >
              Demo Talep Et
            </Link>
          </div>
          <p className="mt-5 text-sm text-subtle">
            Self-service değil. Mevcut operasyonunuzu birlikte haritalayıp çalışma
            alanınızı kuruyoruz.
          </p>
        </div>
      </section>

      {/* ── Problem ──────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <SectionHeading
          kicker="Problem"
          title="Operasyonlarınız hâlâ ekibinizin hafızasına mı bağlı?"
          body="Küçük marka ve e-ticaret ekipleri kritik işleri genellikle Excel tabloları, WhatsApp mesajları ve sözlü onaylarla yürütür. Bu yöntem pratik görünür; ama ekip büyüdükçe görevler kaybolur, onaylar unutulur ve yöneticiler sürekli takip yapmak zorunda kalır."
        />
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {PROBLEMS.map((p) => (
            <div
              key={p.title}
              className="rounded-card border border-line bg-surface p-6 shadow-card"
            >
              <h3 className="font-medium text-ink">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Solution ─────────────────────────────────────────────────── */}
      <section className="border-y border-hairline bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <SectionHeading
            kicker="Çözüm"
            title="Lospia, dağınık iş akışını net bir operasyon paneline dönüştürür."
            body="Görevler, sahipler, teslim tarihleri, bekleyen onaylar, kurallar ve haftalık görünürlük tek sade sistemde birleşir. Ekip ne yapacağını bilir, yönetici neyin tıkandığını görür."
          />
          <div className="mx-auto mt-12 grid max-w-3xl gap-4 sm:grid-cols-2">
            {[
              "Görevleri netleştirin",
              "Sorumluları görünür yapın",
              "Teslim tarihlerini takip edin",
              "Onay bekleyen işleri kaçırmayın",
              "Kuralları herkes için görünür hale getirin",
              "Haftalık ilerlemeyi tek ekrandan görün",
            ].map((item) => (
              <div key={item} className="flex items-start gap-3">
                <ListChecks className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
                <p className="text-base text-ink">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Feature walkthrough ──────────────────────────────────────── */}
      <section id="urun" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
        <SectionHeading
          kicker="Ürün"
          title="Departman bazlı operasyonlar için tek sade panel"
          body="Daha fazla özellik değil, ekipçe gerçekten kullanılan net bir sistem."
        />
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-card border border-line bg-surface p-6 shadow-card"
            >
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-brand-soft">
                <f.icon className="h-5 w-5 text-brand" />
              </div>
              <h3 className="font-medium text-ink">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Use cases ────────────────────────────────────────────────── */}
      <section id="kullanim" className="border-y border-hairline bg-surface">
        <div className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
          <SectionHeading
            kicker="Kullanım alanları"
            title="Operasyonunuz hangisine benziyor?"
          />
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {USE_CASES.map((u) => (
              <div
                key={u.title}
                className="rounded-card border border-line bg-app p-6"
              >
                <h3 className="font-medium text-ink">{u.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{u.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pilot / social proof ─────────────────────────────────────── */}
      <section className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6">
        <Eye className="mx-auto mb-5 h-6 w-6 text-brand" />
        <h2 className="font-serif text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          İlk pilot süreç, gerçek bir marka operasyonu üzerinde şekillendirildi.
        </h2>
        <p className="mt-4 text-base leading-relaxed text-muted">
          Lospia, gerçek bir moda markasının günlük operasyonları içinde
          geliştiriliyor: görevler, onaylar, departman akışları ve haftalık takip —
          teoride değil, sahada test edilerek. Boş bir araç değil, çalışan bir
          operasyon modelinin ürünleşmiş hali.
        </p>
      </section>

      {/* ── Pricing direction ────────────────────────────────────────── */}
      <section id="fiyatlandirma" className="border-y border-hairline bg-surface">
        <div className="mx-auto max-w-3xl scroll-mt-20 px-4 py-20 text-center sm:px-6">
          <SectionHeading
            kicker="Fiyatlandırma"
            title="Kurulum destekli pilot + aylık abonelik"
            body="Karmaşık paket tabloları yok. Kapsam ve ekip büyüklüğüne göre birlikte netleştiriyoruz."
          />
          <ul className="mx-auto mt-10 max-w-md space-y-3 text-left">
            {[
              "Kurulum destekli pilot süreci",
              "Mevcut Excel / iş akışı analizi",
              "Workspace kurulumu ve yapılandırma",
              "Ekip onboarding ve canlı eğitim",
              "Aylık workspace aboneliği",
            ].map((item) => (
              <li key={item} className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
                <span className="text-base text-ink">{item}</span>
              </li>
            ))}
          </ul>
          <Link
            href="/request-access"
            className="mt-10 inline-block rounded-lg bg-brand px-6 py-3 text-base font-medium text-white shadow-sm transition-colors hover:bg-brand-strong"
          >
            Kurulum görüşmesi planla
          </Link>
        </div>
      </section>

      {/* ── Who it is NOT for ────────────────────────────────────────── */}
      <section className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
        <SectionHeading
          title="Lospia herkes için değil"
          body="Doğru beklentiyle başlamak, iki taraf için de en değerli filtre."
        />
        <ul className="mx-auto mt-10 max-w-xl space-y-3">
          {NOT_FOR.map((item) => (
            <li key={item} className="flex items-start gap-3">
              <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-subtle" />
              <span className="text-base text-muted">{item}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────── */}
      <section className="border-y border-hairline bg-surface">
        <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
          <SectionHeading kicker="SSS" title="Sık sorulan sorular" />
          <div className="mt-10 divide-y divide-hairline">
            {FAQ.map((item) => (
              <details key={item.q} className="group py-4">
                <summary className="cursor-pointer list-none text-base font-medium text-ink marker:content-none">
                  {item.q}
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-muted">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-3xl px-4 py-24 text-center sm:px-6">
        <h2 className="font-serif text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          Operasyonunuzu birlikte haritalayalım.
        </h2>
        <p className="mt-4 text-base leading-relaxed text-muted">
          15 dakikalık bir görüşmeyle mevcut Excel / WhatsApp akışınızı inceleyip
          Lospia&apos;nın operasyonunuza uygun olup olmadığını birlikte görelim.
        </p>
        <Link
          href="/request-access"
          className="mt-9 inline-block rounded-lg bg-brand px-7 py-3.5 text-base font-medium text-white shadow-sm transition-colors hover:bg-brand-strong"
        >
          Kurulum Görüşmesi Planla
        </Link>
      </section>
    </MarketingShell>
  );
}
