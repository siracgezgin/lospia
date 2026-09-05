import Link from "next/link";
import {
  ArrowRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  FileSpreadsheet,
  Flag,
  GraduationCap,
  LayoutGrid,
  Megaphone,
  MessageSquare,
  PackageCheck,
  PenTool,
  PlayCircle,
  Search,
  ShoppingBag,
  UserRound,
  Users,
  Workflow,
} from "lucide-react";
import { MarketingShell } from "./MarketingShell";
import { ProductPreview } from "./ProductPreview";
import { ProductPreviewTabs } from "./ProductPreviewTabs";
import { DemoVideo, hasDemoVideo } from "./DemoVideo";

// Lospia public homepage — premium, corporate, product-led B2B operations
// system for brand / e-commerce / creative teams. Copy follows docs/rota.md
// positioning: productized setup + monthly subscription; every CTA leads to a
// setup call. Deliberately NO self-serve language ("Ücretsiz Başla"), no
// instant signup, no USD pricing, no AI / Slack / mobile / ERP / compliance /
// fake-customer claims. Layout is wide + editorial (max-w ~1360px, asymmetric
// sections, product visuals as part of the layout) instead of a narrow
// centered SaaS-template column. Styling is scoped to marketing with explicit
// light utility classes so the product design tokens stay untouched.

const CONTAINER = "mx-auto max-w-[1360px] px-4 sm:px-6 lg:px-10";

// Hover on the primary CTA works via brightness/shadow/transform (not
// background swap) so the inline background pin below can never mute it.
const PRIMARY_CTA =
  "inline-flex items-center justify-center rounded-lg border border-indigo-600 bg-indigo-600 px-6 py-3 text-base font-medium text-white shadow-[0_8px_22px_-8px_rgba(79,70,229,0.55)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_30px_-10px_rgba(79,70,229,0.65)] hover:brightness-[1.07] active:translate-y-0 active:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60 focus-visible:ring-offset-2";
// Cobalt/indigo pinned inline so the primary CTA is never a blank white button,
// independent of whether the marketing-only `indigo` utilities land in a build.
const PRIMARY_CTA_STYLE: React.CSSProperties = {
  backgroundColor: "#4f46e5",
  color: "#ffffff",
};
const SECONDARY_CTA =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-6 py-3 text-base font-medium text-slate-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-400 hover:bg-slate-50 hover:text-slate-900 hover:shadow-md active:translate-y-0 active:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 focus-visible:ring-offset-2";

// Subtle blueprint grid used behind hero / dark bands — an operations feel,
// not a startup gradient.
const GRID_BG: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(to right, rgba(100,116,139,0.07) 1px, transparent 1px), linear-gradient(to bottom, rgba(100,116,139,0.07) 1px, transparent 1px)",
  backgroundSize: "56px 56px",
};
const GRID_BG_DARK: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(to right, rgba(148,163,184,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.06) 1px, transparent 1px)",
  backgroundSize: "56px 56px",
};

// ── Content ────────────────────────────────────────────────────────────

const HERO_POINTS = [
  "İlk günden ekibinize göre yapılandırılmış teslim edilir",
  "Mevcut iş listeleriniz görevlere, sorumlulara ve tarihlere dönüşür",
  "Onaylar ve haftalık ilerleme yönetici panelinde görünür",
];

const SCATTERED = [
  { icon: MessageSquare, text: "“Banner bitti mi? Kim bakıyordu?”", sub: "WhatsApp · dün 22:41", rotate: "-rotate-2" },
  { icon: FileSpreadsheet, text: "operasyon_listesi_v7_SON(2).xlsx", sub: "En son 11 gün önce güncellendi", rotate: "rotate-1" },
  { icon: ClipboardCheck, text: "Kreatif onayı — 5 gündür bekliyor", sub: "Kimin onaylayacağı belirsiz", rotate: "-rotate-1" },
  { icon: Flag, text: "Numune teslimi sessizce geçti", sub: "Kimse fark etmedi", rotate: "rotate-2" },
];

const ORGANIZED = [
  { title: "Web sitesi banner güncellemesi", owner: "Deniz T.", due: "7 Tem", status: "Devam ediyor", statusClass: "bg-sky-50 text-sky-700 ring-sky-100" },
  { title: "Kreatif onayı", owner: "Elif K.", due: "7 Tem", status: "Onay bekliyor", statusClass: "bg-violet-50 text-violet-700 ring-violet-100" },
  { title: "Numune revizyon takibi", owner: "Zeynep D.", due: "8 Tem", status: "Kontrol / Onay", statusClass: "bg-emerald-50 text-emerald-700 ring-emerald-100" },
];

const PAIN_POINTS = [
  { title: "WhatsApp'ta kaybolan işler", body: "Görevler ve kararlar mesaj geçmişinde kalır; kimse geri dönüp bulamaz." },
  { title: "Excel'de unutulan teslim tarihleri", body: "Tablo güncellenmez, satırlar eskir; teslim tarihleri sessizce geçer." },
  { title: "Belirsiz sorumlular", body: "Hangi işin kimde olduğu ve ne zamana yetişeceği net değildir." },
  { title: "Geciken onaylar", body: "Kreatif, üretim ve satın alma onayları takılır; işler beklerken durur." },
  { title: "Haftalık görünürlük eksikliği", body: "Ne bitti, ne gecikti görmek için herkese tek tek sormak gerekir." },
];

const SYSTEM_NODES = [
  { icon: ClipboardList, title: "Görev", body: "Her iş tek kayıt olur; açıklaması ve departmanı bellidir.", chip: "Kampanya içerik planı" },
  { icon: UserRound, title: "Sorumlu", body: "Her görevin sahibi tektir; “kimdeydi?” sorusu biter.", chip: "Mert A. · İçerik" },
  { icon: CalendarDays, title: "Teslim tarihi", body: "Tarihler takvimde ve listede görünür; sessizce geçmez.", chip: "8 Temmuz" },
  { icon: ClipboardCheck, title: "Onay durumu", body: "Onay bekleyen işler ayrı akışta durur; takılan iş görünür.", chip: "Onay bekliyor" },
  { icon: LayoutGrid, title: "Haftalık görünürlük", body: "Tamamlanan, geciken ve bekleyen işler haftalık özetlenir.", chip: "6 iş bu hafta" },
];

const COMMAND_TILES = [
  { label: "Bu hafta tamamlanan", value: "4", tone: "text-emerald-400" },
  { label: "Geciken kritik", value: "2", tone: "text-rose-400" },
  { label: "Kontrol / Onay bekleyen", value: "4", tone: "text-emerald-300" },
  { label: "Bu haftanın odağı", value: "6", tone: "text-white" },
];

const COMMAND_ROWS = [
  { title: "Onay bekleyen kreatifler", meta: "Onaylar · Elif K.", state: "Onay bekliyor", stateClass: "bg-violet-500/15 text-violet-300 ring-violet-500/20" },
  { title: "Web sitesi banner güncellemesi", meta: "E-ticaret · Deniz T.", state: "Gecikti", stateClass: "bg-rose-500/15 text-rose-300 ring-rose-500/20" },
  { title: "Numune revizyon takibi", meta: "Üretim · Zeynep D.", state: "Bu hafta", stateClass: "bg-slate-500/20 text-slate-300 ring-slate-500/20" },
];

const SETUP_STEPS = [
  { icon: Search, title: "Mevcut akışınızı anlarız", body: "30 dakikalık operasyon keşfinde bugünkü Excel / WhatsApp düzeninizi, ekibinizi ve onay noktalarınızı haritalarız." },
  { icon: Users, title: "Departman ve rollerinizi kurarız", body: "Departmanlar, kullanıcılar ve yetki seviyeleri sizin organizasyonunuza göre yapılandırılır." },
  { icon: Workflow, title: "Görev ve onay akışlarını yapılandırırız", body: "Mevcut iş listeleriniz görevlere dönüşür; onay ve kontrol noktaları akışa yerleştirilir." },
  { icon: GraduationCap, title: "İlk haftayı ekibinizle oturturuz", body: "Canlı eğitim yapılır, ilk hafta birlikte izlenir; tıkanan akışlar yerinde düzeltilir." },
];

// Confident use-context section (replaces the old "şunlar için değil"
// two-column block — negative framing made the product feel smaller). Each
// entry pairs a team structure with the concrete outcome it gets, so this
// section stays outcome-focused and doesn't repeat the pain-points list.
const USE_CASES = [
  {
    icon: Megaphone,
    title: "Marka ve pazarlama ekipleri",
    body: "Kampanya, lansman ve içerik teslimleri tek akışta ilerler; hiçbir iş mesaj trafiğinde kaybolmaz.",
  },
  {
    icon: ShoppingBag,
    title: "E-ticaret operasyonları",
    body: "Ürün, görsel ve kampanya hazırlıkları teslim tarihi ve sorumlusuyla birlikte takip edilir.",
  },
  {
    icon: PenTool,
    title: "İçerik ve kreatif ekipler",
    body: "Üretim ve onay döngüsü kısalır; revizyon turları görünür ve izlenebilir olur.",
  },
  {
    icon: ClipboardCheck,
    title: "Onay akışı yoğun ekipler",
    body: "Bekleyen her iş tek kuyrukta durur; kimin onayında beklediği her an bellidir.",
  },
  {
    icon: Building2,
    title: "Büyüyen KOBİ operasyonları",
    body: "Departmanlar arası koordinasyon tek panelde toplanır; büyüme düzeni bozmaz.",
  },
  {
    icon: PackageCheck,
    title: "Teslimat ve koordinasyon ekipleri",
    body: "Kim, neyi, ne zamana teslim edecek — her adım net sahiplikle ilerler.",
  },
];

type Tier = {
  name: string;
  users: string;
  audience: string;
  setup: string;
  monthly: string;
  scope: string;
  items: string[];
  cta: string;
  featured?: string;
};

const PRICING: Tier[] = [
  {
    name: "Başlangıç",
    users: "1–15 kullanıcı",
    audience: "Küçük ve orta marka ekipleri",
    setup: "Temel kurulum · tek seferlik",
    monthly: "Aylık kullanım aboneliği",
    scope: "Tek workspace üzerinde temel operasyon düzeni",
    items: [
      "1 workspace",
      "Pano, liste ve takvim görünümü",
      "Görev ve sorumlu takibi",
      "Temel onay akışı",
      "Departman bazlı takip",
      "İlk kurulum görüşmesi",
      "1 canlı eğitim",
      "İlk hafta kontrolü",
    ],
    cta: "Kurulum görüşmesi planla",
  },
  {
    name: "Marka Operasyon",
    users: "16–50 kullanıcı",
    audience: "Büyüyen marka ve e-ticaret ekipleri",
    setup: "Kapsamlı kurulum · tek seferlik",
    monthly: "Aylık kullanım aboneliği",
    scope: "Çok departmanlı yapı + veri aktarımı + yönetici görünürlüğü",
    items: [
      "Çok departmanlı operasyon yapısı",
      "İçerik / üretim / e-ticaret / onay alanları",
      "Excel'den ilk veri aktarımı",
      "Özel görev akışı düzenleme",
      "Rol ve yetki kurgusu",
      "Haftalık kontrol akışı",
      "Yönetici görünürlüğü ve özet panel",
      "2 canlı eğitim",
      "14 gün yakın destek",
    ],
    cta: "Görüşme planla",
    featured: "En uygun operasyon paketi",
  },
  {
    name: "Geniş Ekip",
    users: "51+ kullanıcı veya özel operasyon",
    audience: "Daha kompleks, çok ekipli operasyonlar",
    setup: "Teklif ile belirlenir",
    monthly: "Teklif ile belirlenir",
    scope: "Çok workspace'li, şablonlu ve danışmanlık destekli kurulum",
    items: [
      "Çok workspace / departman yapısı",
      "Özel operasyon şablonları",
      "Özel onboarding programı",
      "Gelişmiş rol yapısı",
      "Ek veri taşıma kapsamı",
      "Özel destek planı",
      "Süreç danışmanlığı opsiyonu",
    ],
    cta: "Teklif iste",
  },
];

const FAQ = [
  {
    q: "Lospia hangi ekipler için uygun?",
    a: "Marka, e-ticaret, içerik / kreatif ve operasyon ekipleri ile büyüyen KOBİ yapıları için uygundur. Görevlerin, onayların ve teslim tarihlerinin birden fazla kişi arasında dağıldığı, koordinasyon yükü artmış her ekip fayda görür.",
  },
  {
    q: "Kurulum ne kadar sürer?",
    a: "Standart kurulum, bilgi ve verilerin teslim hızına bağlı olarak genellikle 7-14 iş günü içinde tamamlanır. Operasyonunuzu birlikte haritalar, çalışma alanınızı biz kurarız.",
  },
  {
    q: "Mevcut Excel dosyalarımızı aktarabilir miyiz?",
    a: "Evet. Mevcut Excel operasyon listeniz kurulum kapsamında Lospia'ya taşınır; satırlar görevlere, sorumlulara ve teslim tarihlerine dönüşür. İlk aktarım demo-safe şekilde yapılır.",
  },
  {
    q: "Fiyatlandırma nasıl belirlenir?",
    a: "Fiyatlandırma ekip büyüklüğü, kullanıcı sayısı ve kurulum kapsamına göre netleşir. 1–15, 16–50 ve 51+ kullanıcı bandı üzerinden, kurulum ücreti + aylık abonelik modeliyle net bir teklif hazırlanır.",
  },
  {
    q: "Lospia ClickUp, Asana veya Notion'dan nasıl farklı?",
    a: "Bu araçlar boş bir tuval verir; kurulumu, düzeni ve disiplini sizden bekler. Lospia operasyon ekipleri için hazır bir yapıyla gelir ve çalışma alanınız sizinle birlikte kurulur. Amaç daha fazla özellik değil, ekipçe gerçekten kullanılan sade bir sistem.",
  },
  {
    q: "Ücretsiz deneme var mı?",
    a: "Lospia şu aşamada self-service ücretsiz deneme ürünü değildir. Önce kısa bir kurulum görüşmesi yapılır, ardından uygun ekipler için kurulum destekli pilot önerilir.",
  },
  {
    q: "Özel entegrasyonlar dahil mi?",
    a: "Standart kurulum ve abonelik; özel API entegrasyonları, ERP / PLM / WMS bağlantıları, ağır veri temizliği ve özel yazılım geliştirme içermez. Bu kapsamlar görüşmede ayrıca netleştirilir.",
  },
  {
    q: "Verilerimiz güvende mi?",
    a: "Her çalışma alanı veritabanı seviyesinde izole edilir; bir müşterinin verisine başka bir müşteri erişemez. Erişim rol bazlıdır ve tüm bağlantılar şifrelidir.",
  },
];

// ── Section heading (left-aligned, editorial — optionally two-column) ──
function SectionIntro({
  kicker,
  title,
  body,
  dark,
}: {
  kicker: string;
  title: string;
  body?: string;
  dark?: boolean;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr] lg:items-end">
      <div>
        <p className={`mb-3 text-sm font-semibold uppercase tracking-widest ${dark ? "text-indigo-400" : "text-indigo-600"}`}>
          {kicker}
        </p>
        <h2 className={`max-w-xl text-3xl font-semibold tracking-tight sm:text-4xl ${dark ? "text-white" : "text-slate-900"}`}>
          {title}
        </h2>
      </div>
      {body ? (
        <p className={`max-w-xl text-base leading-relaxed lg:justify-self-end ${dark ? "text-slate-300" : "text-slate-600"}`}>
          {body}
        </p>
      ) : null}
    </div>
  );
}

export function MarketingHome() {
  const videoReady = hasDemoVideo();

  return (
    <MarketingShell>
      {/* ── Hero — asymmetric, product-led ─────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-slate-200 bg-slate-50">
        <div aria-hidden className="pointer-events-none absolute inset-0" style={GRID_BG} />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_50%_60%_at_75%_20%,rgba(79,70,229,0.08),transparent_65%)]"
        />
        <div className={`${CONTAINER} relative grid items-center gap-14 pb-24 pt-16 sm:pt-20 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-10 lg:pb-28`}>
          {/* Left: message */}
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-1.5 text-xs font-medium text-slate-600 shadow-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
              Kurulum destekli operasyon paneli
            </div>
            <h1 className="text-4xl font-semibold leading-[1.08] tracking-tight text-slate-900 sm:text-5xl xl:text-[3.4rem]">
              Excel ve WhatsApp karmaşasına son verin.{" "}
              <span className="text-indigo-600">Operasyonlarınızı tek panelde yönetin.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-600">
              Lospia; marka, e-ticaret, içerik ve operasyon ekiplerinin görevleri,
              sorumluları, onayları ve teslim tarihlerini tek panelde takip
              etmesini sağlar.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/request-access" style={PRIMARY_CTA_STYLE} className={PRIMARY_CTA}>
                Kurulum görüşmesi planla
              </Link>
              <Link href={videoReady ? "#demo" : "/request-access"} className={SECONDARY_CTA}>
                <PlayCircle className="h-5 w-5 text-indigo-600" />
                {videoReady ? "60 saniyelik demoyu izle" : "Canlı demo talep et"}
              </Link>
            </div>
            <ul className="mt-8 space-y-2.5 border-t border-slate-200 pt-6">
              {HERO_POINTS.map((point) => (
                <li key={point} className="flex items-start gap-2.5 text-sm text-slate-600">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />
                  {point}
                </li>
              ))}
            </ul>
          </div>

          {/* Right: layered product composition — part of the first impression */}
          <div className="relative lg:pl-4">
            <ProductPreview />
          </div>
        </div>
      </section>

      {/* ── Positioning strip ──────────────────────────────────────────── */}
      <section className="border-b border-slate-200 bg-white">
        <div className={`${CONTAINER} grid divide-y divide-slate-200 sm:grid-cols-3 sm:divide-x sm:divide-y-0`}>
          {[
            { title: "Kurulum destekli", body: "Boş panel teslim etmeyiz; sisteminizi birlikte kurarız." },
            { title: "Excel aktarımıyla başlar", body: "Mevcut iş listeniz görevlere ve sorumlulara dönüşür." },
            { title: "Haftalık görünürlük", body: "Yönetici sormadan görür: biten, geciken, bekleyen." },
          ].map((item) => (
            <div key={item.title} className="px-2 py-6 sm:px-8 sm:first:pl-0 sm:last:pr-0">
              <p className="text-sm font-semibold text-slate-900">{item.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-slate-500">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Problem — scattered vs organized ──────────────────────────── */}
      <section className="bg-white">
        <div className={`${CONTAINER} py-16 sm:py-20 lg:py-24`}>
          <SectionIntro
            kicker="Problem"
            title="Dağınık takip neden kırılır?"
            body="Büyüyen ekipler kritik işleri Excel, WhatsApp ve sözlü onaylarla yürütür. Ekip büyüdükçe bu düzen görevleri kaybeder, onayları geciktirir ve yöneticiye sürekli takip yükü bindirir."
          />

          <div className="mt-14 grid gap-10 lg:grid-cols-[1fr_auto_1fr] lg:items-center">
            {/* Scattered side */}
            <div className="relative rounded-2xl border border-slate-200 bg-slate-50 p-6 sm:p-8">
              <p className="mb-5 text-xs font-semibold uppercase tracking-widest text-slate-400">
                Bugün · dağınık takip
              </p>
              <div className="space-y-3.5">
                {SCATTERED.map((item) => (
                  <div
                    key={item.text}
                    className={`flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm ${item.rotate}`}
                  >
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-500">
                      <item.icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800">{item.text}</p>
                      <p className="mt-0.5 text-xs text-slate-400">{item.sub}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Arrow */}
            <div className="hidden lg:flex lg:flex-col lg:items-center lg:gap-2">
              <span className="rounded-full border border-slate-200 bg-white p-3 shadow-sm">
                <ArrowRight className="h-5 w-5 text-indigo-600" />
              </span>
              <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Lospia</span>
            </div>

            {/* Organized side */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_24px_60px_-30px_rgba(15,23,42,0.25)] sm:p-8">
              <p className="mb-5 text-xs font-semibold uppercase tracking-widest text-indigo-600">
                Lospia&apos;da · sahipli ve görünür
              </p>
              <div className="space-y-3">
                {ORGANIZED.map((row) => (
                  <div key={row.title} className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate text-sm font-semibold text-slate-800">{row.title}</p>
                      <span className={`inline-flex whitespace-nowrap rounded-md px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${row.statusClass}`}>
                        {row.status}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-4 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1.5">
                        <UserRound className="h-3.5 w-3.5 text-slate-400" /> {row.owner}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarDays className="h-3.5 w-3.5 text-slate-400" /> {row.due}
                      </span>
                    </div>
                  </div>
                ))}
                <div className="rounded-xl border border-dashed border-emerald-200 bg-emerald-50/60 px-3.5 py-2.5 text-xs font-medium text-emerald-700">
                  Haftalık özet yöneticiye otomatik görünür — kimseye sormak gerekmez
                </div>
              </div>
            </div>
          </div>

          {/* Pain points as a compact editorial row */}
          <div className="mt-14 grid gap-x-10 gap-y-6 border-t border-slate-200 pt-10 sm:grid-cols-2 lg:grid-cols-5">
            {PAIN_POINTS.map((p, i) => (
              <div key={p.title}>
                <p className="text-xs font-semibold text-slate-400">0{i + 1}</p>
                <h3 className="mt-1.5 text-sm font-semibold text-slate-900">{p.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{p.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── System map — how Lospia pulls it together ─────────────────── */}
      <section className="border-y border-slate-200 bg-slate-50">
        <div className={`${CONTAINER} py-16 sm:py-20 lg:py-24`}>
          <SectionIntro
            kicker="Sistem"
            title="Lospia dağınık işleri nasıl toplar?"
            body="Her iş beş net parçaya bağlanır: görev, sorumlu, teslim tarihi, onay durumu ve haftalık görünürlük. Bu zincir kurulunca operasyon kendi kendine görünür hale gelir."
          />
          <div className="relative mt-14">
            {/* connecting line */}
            <div aria-hidden className="absolute left-0 right-0 top-7 hidden border-t-2 border-dashed border-indigo-200 lg:block" />
            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-5 lg:gap-5">
              {SYSTEM_NODES.map((node, i) => (
                <div key={node.title} className="relative">
                  <div className="relative z-10 mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-indigo-100 bg-white shadow-sm">
                    <node.icon className="h-6 w-6 text-indigo-600" />
                  </div>
                  <p className="text-xs font-semibold text-indigo-500">Adım {i + 1}</p>
                  <h3 className="mt-1 text-base font-semibold text-slate-900">{node.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{node.body}</p>
                  <span className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 shadow-sm">
                    <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                    {node.chip}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Interactive product preview ────────────────────────────────── */}
      <section id="urun" className="scroll-mt-[124px] lg:scroll-mt-20 bg-white">
        <div className={`${CONTAINER} py-16 sm:py-20 lg:py-24`}>
          <SectionIntro
            kicker="Ürün"
            title="Ürünü şimdi inceleyin — sekmeler tıklanabilir."
            body="Pano, liste, takvim ve gösterge paneli: günlük operasyon takibi için gereken ana görünümler. Aşağıdaki önizleme gerçek Lospia arayüz düzenini örnek verilerle gösterir."
          />
          <div className="mt-12">
            <ProductPreviewTabs />
          </div>
          <div className="mt-8 grid gap-x-10 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { title: "Onay / kontrol akışı", body: "Onay bekleyen kreatif, üretim ve içerik işleri ayrı akışta görünür kalır." },
              { title: "Operasyon modülleri", body: "İçerik, üretim, e-ticaret ve yönetim alanları departman bazında ayrışır." },
              { title: "Kurallar", body: "Ekip standartları ve operasyon kuralları tek yerde durur." },
              { title: "Aktivite günlüğü", body: "Kim neyi ne zaman değiştirdi; geriye dönük iz kaybolmaz." },
            ].map((f) => (
              <div key={f.title} className="border-l-2 border-indigo-100 pl-4">
                <h3 className="text-sm font-semibold text-slate-900">{f.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-500">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Weekly visibility — operations command center (dark) ─────── */}
      <section className="relative overflow-hidden bg-slate-900">
        <div aria-hidden className="pointer-events-none absolute inset-0" style={GRID_BG_DARK} />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_45%_50%_at_20%_10%,rgba(99,102,241,0.16),transparent_60%)]"
        />
        <div className={`${CONTAINER} relative grid items-center gap-14 py-16 sm:py-20 lg:py-24 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]`}>
          <div>
            <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-indigo-400">
              Haftalık görünürlük
            </p>
            <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Operasyonunuzun komuta merkezi.
            </h2>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-300">
              Haftalık görünürlük tek tek sormadan oluşur: tamamlanan, geciken,
              kontrol bekleyen ve kritik işler yönetici panelinde her an günceldir.
              Haftalık toplantı, rapor toplamakla değil karar vermekle geçer.
            </p>
            <ul className="mt-7 space-y-3">
              {[
                "Tamamlanan / geciken / bekleyen işler anlık sayılır",
                "Onay kuyruğu ve kritik işler öne çıkar",
                "Bu haftanın odağı ekip için netleşir",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm text-slate-300">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-indigo-400" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Drawn dark dashboard panel */}
          <div className="rounded-2xl border border-slate-700/70 bg-slate-800/60 p-5 shadow-[0_40px_90px_-40px_rgba(0,0,0,0.8)] backdrop-blur-sm sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-semibold text-white">Gösterge Paneli</p>
              <span className="rounded-md border border-slate-600 px-2 py-0.5 text-[11px] text-slate-400">
                6 – 12 Temmuz
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {COMMAND_TILES.map((tile) => (
                <div key={tile.label} className="rounded-xl border border-slate-700 bg-slate-800 p-3.5">
                  <p className={`text-2xl font-semibold tracking-tight ${tile.tone}`}>{tile.value}</p>
                  <p className="mt-1 text-[11px] leading-tight text-slate-400">{tile.label}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 rounded-xl border border-slate-700 bg-slate-800 p-4">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Dikkat isteyen işler
              </p>
              <div className="space-y-2.5">
                {COMMAND_ROWS.map((row) => (
                  <div key={row.title} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-200">{row.title}</p>
                      <p className="text-[11px] text-slate-500">{row.meta}</p>
                    </div>
                    <span className={`inline-flex whitespace-nowrap rounded-md px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${row.stateClass}`}>
                      {row.state}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Setup-supported system ─────────────────────────────────────── */}
      <section id="nasil-calisir" className="scroll-mt-[124px] lg:scroll-mt-20 bg-white">
        <div className={`${CONTAINER} py-16 sm:py-20 lg:py-24`}>
          <SectionIntro
            kicker="Kurulum destekli sistem"
            title="Kurulumun tamamı bizde; dört adımda ekibinizle oturur."
            body="Operasyonunuzu birlikte haritalar, çalışma alanınızı biz kurar, ilk haftayı ekibinizle birlikte izleriz. Standart kurulum 7-14 iş günü sürer."
          />
          <div className="relative mt-14">
            <div aria-hidden className="absolute left-6 top-0 bottom-0 hidden border-l-2 border-dashed border-indigo-200 lg:left-0 lg:right-0 lg:top-6 lg:bottom-auto lg:border-l-0 lg:border-t-2" />
            <div className="grid gap-10 lg:grid-cols-4 lg:gap-6">
              {SETUP_STEPS.map((step, i) => (
                <div key={step.title} className="relative pl-16 lg:pl-0 lg:pt-16">
                  <div className="absolute left-0 top-0 z-10 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-[0_10px_24px_-8px_rgba(79,70,229,0.6)] lg:top-0">
                    <step.icon className="h-5 w-5" />
                  </div>
                  <p className="text-xs font-semibold text-indigo-500">Adım {i + 1}</p>
                  <h3 className="mt-1 text-base font-semibold text-slate-900">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-500">{step.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Use contexts — where Lospia creates value fastest ─────────── */}
      <section id="kimler" className="scroll-mt-[124px] lg:scroll-mt-20 border-y border-slate-200 bg-slate-50">
        <div className={`${CONTAINER} py-16 sm:py-20 lg:py-24`}>
          <SectionIntro
            kicker="Kullanım alanları"
            title="Lospia hangi ekiplerde en hızlı değer üretir?"
            body="İşlerin birden fazla kişiye, departmana ve onay adımına dağıldığı her yapıda çalışır. En hızlı sonucu bu ekip yapıları alır."
          />
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {USE_CASES.map((uc) => (
              <div
                key={uc.title}
                className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all duration-200 ease-out hover:-translate-y-1 hover:border-indigo-200 hover:shadow-[0_20px_44px_-20px_rgba(15,23,42,0.25)]"
              >
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-indigo-100 bg-indigo-50/70 text-indigo-600 transition-colors duration-200 group-hover:bg-indigo-100">
                  <uc.icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 text-base font-semibold text-slate-900">{uc.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{uc.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Demo ───────────────────────────────────────────────────────── */}
      <section id="demo" className="scroll-mt-[124px] lg:scroll-mt-20 bg-white">
        <div className={`${CONTAINER} py-16 sm:py-20 lg:py-24`}>
          {videoReady ? (
            <SectionIntro
              kicker="Demo"
              title="60 saniyede Lospia"
              body="Pano, onay akışı ve haftalık görünürlüğün nasıl çalıştığını kısa bir ürün videosuyla görün. Video altyazılıdır."
            />
          ) : (
            <SectionIntro
              kicker="Demo"
              title="Lospia'yı canlı akış üzerinden görün"
              body="15-30 dakikalık kısa bir görüşmede mevcut iş akışınızı konuşup Lospia'nın sizin ekibiniz için nasıl kurulacağını gösterelim."
            />
          )}
          <DemoVideo />
        </div>
      </section>

      {/* ── Pricing — setup-supported B2B packages ─────────────────────── */}
      <section id="fiyatlandirma" className="scroll-mt-[124px] lg:scroll-mt-20 border-y border-slate-200 bg-slate-50">
        <div className={`${CONTAINER} py-16 sm:py-20 lg:py-24`}>
          <SectionIntro
            kicker="Paketler"
            title="Kurulum destekli Lospia paketleri"
            body="Bu bir self-servis abonelik listesi değildir. Her paket kurulum, eğitim ve aylık kullanım içerir; ilk görüşmede ekibinize göre net bir teklif sunulur."
          />
          <div className="mt-12 grid items-stretch gap-6 lg:grid-cols-3">
            {PRICING.map((tier) => (
              <div
                key={tier.name}
                className={`relative flex flex-col rounded-2xl border bg-white p-8 transition-all duration-200 ease-out hover:-translate-y-1 ${
                  tier.featured
                    ? "border-indigo-300 shadow-xl shadow-indigo-500/10 ring-1 ring-indigo-200 hover:shadow-2xl hover:shadow-indigo-500/15"
                    : "border-slate-200 shadow-sm hover:border-slate-300 hover:shadow-[0_20px_44px_-20px_rgba(15,23,42,0.25)]"
                }`}
              >
                {tier.featured && (
                  <span className="absolute -top-3 left-8 whitespace-nowrap rounded-full bg-indigo-600 px-3 py-1 text-[11px] font-medium text-white shadow-sm">
                    {tier.featured}
                  </span>
                )}
                <h3 className="text-xl font-semibold text-slate-900">{tier.name}</h3>
                <p className="mt-1 text-sm text-slate-500">{tier.audience}</p>

                <dl className="mt-6 space-y-2.5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-slate-500">Kullanıcı</dt>
                    <dd className="font-semibold text-slate-900">{tier.users}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-slate-500">Kurulum</dt>
                    <dd className="text-right font-medium text-slate-700">{tier.setup}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-slate-500">Abonelik</dt>
                    <dd className="text-right font-medium text-slate-700">{tier.monthly}</dd>
                  </div>
                </dl>

                <p className="mt-5 text-sm font-medium leading-relaxed text-slate-700">{tier.scope}</p>

                <ul className="mt-5 flex-1 space-y-2.5 border-t border-slate-100 pt-5">
                  {tier.items.map((item) => (
                    <li key={item} className="flex items-start gap-2.5 text-sm text-slate-600">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />
                      {item}
                    </li>
                  ))}
                </ul>

                <Link
                  href="/request-access"
                  style={tier.featured ? PRIMARY_CTA_STYLE : undefined}
                  className={`mt-8 w-full text-center ${
                    tier.featured
                      ? "rounded-lg border border-indigo-600 bg-indigo-600 px-5 py-3 text-sm font-medium text-white shadow-[0_8px_22px_-8px_rgba(79,70,229,0.5)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_28px_-10px_rgba(79,70,229,0.6)] hover:brightness-[1.07] active:translate-y-0 active:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60 focus-visible:ring-offset-2"
                      : "rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-medium text-slate-800 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-400 hover:bg-slate-50 hover:shadow-md active:translate-y-0 active:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 focus-visible:ring-offset-2"
                  }`}
                >
                  {tier.cta}
                </Link>
              </div>
            ))}
          </div>
          <div className="mt-10 grid gap-6 rounded-2xl border border-slate-200 bg-white p-6 text-sm leading-relaxed text-slate-500 sm:grid-cols-2 sm:p-8">
            <p>
              <span className="font-semibold text-slate-700">Fiyatlandırma nasıl netleşir?</span>{" "}
              Ekip büyüklüğü, kullanıcı sayısı ve kurulum kapsamına göre kurulum
              ücreti + aylık abonelik olarak teklif hazırlanır. Ücretsiz pilot
              yoktur; her kurulum gerçek bir operasyon projesidir.
            </p>
            <p>
              <span className="font-semibold text-slate-700">Kapsam dışı olanlar:</span>{" "}
              özel API entegrasyonları, ERP / PLM / WMS bağlantıları, ağır veri
              temizliği, özel yazılım geliştirme ve sınırsız revizyon pakete dahil
              değildir; görüşmede ayrıca netleştirilir.
            </p>
          </div>
        </div>
      </section>

      {/* ── FAQ ────────────────────────────────────────────────────────── */}
      <section className="bg-white">
        <div className={`${CONTAINER} grid gap-12 py-16 sm:py-20 lg:py-24 lg:grid-cols-[1fr_2fr]`}>
          <div>
            <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-indigo-600">SSS</p>
            <h2 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
              Sık sorulan sorular
            </h2>
            <p className="mt-4 text-base leading-relaxed text-slate-600">
              Cevabını bulamadığınız bir soru için kurulum görüşmesinde
              doğrudan konuşalım.
            </p>
          </div>
          <div className="space-y-3">
            {FAQ.map((item) => (
              <details
                key={item.q}
                className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all duration-200 ease-out hover:border-indigo-200 hover:shadow-md open:border-indigo-200"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between rounded-md text-base font-medium text-slate-900 transition-colors duration-150 marker:content-none hover:text-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 focus-visible:ring-offset-2">
                  {item.q}
                  <span className="ml-4 text-indigo-500 transition-transform duration-200 group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA (dark graphite band) ─────────────────────────────── */}
      <section className="relative overflow-hidden bg-slate-900">
        <div aria-hidden className="pointer-events-none absolute inset-0" style={GRID_BG_DARK} />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_50%_60%_at_50%_120%,rgba(99,102,241,0.3),transparent_60%)]"
        />
        <div className={`${CONTAINER} relative grid items-center gap-10 py-16 sm:py-20 lg:py-24 lg:grid-cols-[2fr_1fr]`}>
          <div>
            <h2 className="max-w-2xl text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Operasyonunuzu tek panele taşıyalım.
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-300">
              Bugünkü iş akışınızı birlikte inceleyelim; ekibiniz için
              Lospia&apos;nın uygun olup olmadığını 15-30 dakikalık görüşmede
              netleştirelim.
            </p>
          </div>
          <div className="flex flex-col gap-3 lg:items-end">
            <Link
              href="/request-access"
              className="inline-flex items-center justify-center rounded-lg bg-white px-6 py-3 text-base font-medium text-slate-900 shadow-[0_10px_28px_-12px_rgba(255,255,255,0.4)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-slate-100 hover:shadow-[0_14px_32px_-12px_rgba(255,255,255,0.5)] active:translate-y-0 active:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
            >
              Kurulum görüşmesi planla
            </Link>
            <p className="text-xs text-slate-400">Yanıt genellikle 1 iş günü içinde verilir.</p>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
