"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarClock, LayoutGrid } from "lucide-react";

// Client half of the demo slot. Renders a native HTML5 <video> and, if the
// browser can't load/decode it (Safari codec/network errors surface as
// AbortError), swaps to a trustworthy live-demo CTA instead of leaving a blank
// gray player. We never call video.play() ourselves — no autoplay — so there is
// no play() promise to reject with AbortError.

const DEMO_VIDEO_PUBLIC_PATH = "/demo/lospia-demo.mp4";
const DEMO_POSTER_PUBLIC_PATH = "/demo/lospia-demo-poster.png";

/** Polished live-demo CTA — shown when there is no video, or it failed to load. */
export function LiveDemoCta() {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10">
      <div className="grid items-center gap-8 p-8 sm:grid-cols-2 sm:p-10">
        <div>
          <div className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-indigo-100 bg-indigo-50">
            <LayoutGrid className="h-5 w-5 text-indigo-600" />
          </div>
          <h3 className="text-xl font-semibold tracking-tight text-slate-900">
            Lospia&apos;yı canlı akış üzerinden görün
          </h3>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            15-30 dakikalık kısa bir görüşmede mevcut iş akışınızı konuşup
            Lospia&apos;nın sizin ekibiniz için nasıl kurulacağını gösterelim.
          </p>
          <Link
            href="/request-access"
            style={{ backgroundColor: "#4f46e5", color: "#ffffff" }}
            className="mt-6 inline-flex items-center justify-center rounded-lg border border-indigo-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700"
          >
            Canlı demo talep et
          </Link>
        </div>
        <div className="hidden rounded-xl border border-slate-200 bg-slate-50 p-5 sm:block">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
            <CalendarClock className="h-4 w-4 text-indigo-500" />
            Görüşmede göreceğiniz akış
          </div>
          <ul className="mt-4 space-y-3 text-sm text-slate-700">
            <li className="flex items-start gap-2.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500" />
              Pano üzerinde görev ve sorumluluk takibi
            </li>
            <li className="flex items-start gap-2.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500" />
              Onay / kontrol akışının nasıl işlediği
            </li>
            <li className="flex items-start gap-2.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500" />
              Haftalık görünürlük ve yönetici özeti
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export function DemoVideoPlayer({ hasPoster }: { hasPoster: boolean }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return <LiveDemoCta />;
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10">
      <video
        className="aspect-video w-full bg-white"
        controls
        preload="metadata"
        playsInline
        poster={hasPoster ? DEMO_POSTER_PUBLIC_PATH : undefined}
        onError={() => setFailed(true)}
      >
        <source src={DEMO_VIDEO_PUBLIC_PATH} type="video/mp4" />
      </video>
    </div>
  );
}
