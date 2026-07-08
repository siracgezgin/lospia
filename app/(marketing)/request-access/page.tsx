import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  LockKeyhole,
  MessagesSquare,
  ShieldCheck,
} from "lucide-react";
import { RequestAccessForm } from "@/components/marketing/RequestAccessForm";

export const metadata: Metadata = {
  title: "Kurulum Görüşmesi",
  description:
    "Ekibinizin görev, onay ve haftalık takip yapısını 15-30 dakikalık kısa bir görüşmede birlikte inceleyelim. Lospia çalışma alanınızı kurulum destekli pilot süreciyle hazırlıyoruz.",
};

const MEETING_FACTS = [
  { icon: CalendarClock, text: "15-30 dakikalık kısa bir görüşme" },
  { icon: MessagesSquare, text: "Mevcut operasyon akışınızı anlamaya odaklanır" },
  { icon: CheckCircle2, text: "Uygun kurulum kapsamını birlikte belirleriz" },
  { icon: ShieldCheck, text: "Satış baskısı değil, ihtiyaç analizi" },
];

const MEETING_TOPICS = [
  "Bugünkü Excel / WhatsApp akışınız ve ekip yapınız",
  "Görev, onay ve teslim tarihi takibinde tıkanan noktalar",
  "Lospia'nın ekibinize uygun olup olmadığı",
  "Uygunsa kurulum kapsamı ve sonraki adımlar",
];

export default function RequestAccessPage() {
  return (
    <div className="relative overflow-hidden bg-gradient-to-b from-blue-50/70 via-white to-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_60%_40%_at_50%_-10%,rgba(79,70,229,0.10),transparent_65%)]"
      />
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-600 shadow-sm transition-all duration-200 hover:-translate-x-0.5 hover:border-slate-300 hover:text-slate-900 hover:shadow-md active:translate-x-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 focus-visible:ring-offset-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Ana sayfaya dön
        </Link>

        <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-12">
          {/* Left: intro + trust framing */}
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-indigo-600">
              Kurulum görüşmesi
            </p>
            <h1 className="mt-2.5 text-3xl font-semibold tracking-tight text-slate-900">
              Kurulum görüşmesi planla
            </h1>
            <p className="mt-3 text-[15px] leading-relaxed text-slate-600">
              Bu form bir satış hunisi değil; kısa bir keşif görüşmesi talebidir.
              Ekibinizin görev, onay ve haftalık takip yapısını birlikte inceler,
              Lospia&apos;nın operasyonunuza uygun olup olmadığını netleştiririz.
            </p>

            <ul className="mt-6 space-y-2.5">
              {MEETING_FACTS.map((item) => (
                <li key={item.text} className="flex items-start gap-3 text-sm text-slate-700">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-indigo-100 bg-indigo-50/60">
                    <item.icon className="h-4 w-4 text-indigo-600" />
                  </span>
                  <span className="pt-1">{item.text}</span>
                </li>
              ))}
            </ul>

            <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900">
                Bu görüşmede neleri konuşuruz?
              </h2>
              <ul className="mt-3 space-y-2">
                {MEETING_TOPICS.map((topic) => (
                  <li key={topic} className="flex items-start gap-2.5 text-sm text-slate-600">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" />
                    {topic}
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-5 flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
              <p className="text-sm leading-relaxed text-slate-600">
                Bilgileriniz yalnızca kurulum görüşmesini planlamak için
                kullanılır; pazarlama listelerine eklenmez. Formu doldurduktan
                sonra genellikle 1 iş günü içinde dönüş yaparız.
              </p>
            </div>
          </div>

          {/* Right: form card */}
          <div>
            <RequestAccessForm />
          </div>
        </div>
      </div>
    </div>
  );
}
