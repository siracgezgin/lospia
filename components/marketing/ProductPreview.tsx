import { CheckCircle2 } from "lucide-react";
import {
  BOARD_COLUMNS,
  Chip,
  MiniTaskCard,
  OwnerDot,
} from "./previewUi";

// Hero product composition — a large, layered, product-faithful Lospia visual
// designed to sit beside the hero copy as part of the first impression (not a
// small screenshot under the text). Layers: a 3-column board frame, a docked
// task-detail/approval panel, a weekly-visibility strip and a floating
// calendar chip card. Pure markup, demo-safe data only (see previewUi.tsx).
//
// Composition rules (keep these when touching layout):
// - Each floating card anchors to a DIFFERENT frame edge (top-right chip,
//   right-middle panel, bottom-left strip) so the depth reads as a deliberate
//   diagonal, never a pile.
// - Overlaps stay shallow and only ever cover empty board canvas: the third
//   column renders a single card so the detail panel docks over whitespace,
//   and the frame header carries no right-side pill under the calendar chip.
// - Floats are vertically separated (chip top, panel mid, strip bottom) so
//   they can never collide with each other at any container width.

const HERO_COLUMNS = BOARD_COLUMNS.slice(0, 3); // Yapılacak · Devam ediyor · Kontrol / Onay

const HERO_STATS = [
  { label: "Bu hafta tamamlanan", value: "4", tone: "text-emerald-600" },
  { label: "Kontrol bekleyen", value: "4", tone: "text-emerald-600" },
  { label: "Geciken", value: "2", tone: "text-rose-600" },
];

export function ProductPreview() {
  return (
    // Reserved gutters (top / right / bottom padding) are the zones the
    // floating cards hang into — they overlap the frame edge, not its content.
    <div className="relative pb-9 pt-10 sm:pr-6 lg:pr-8">
      {/* ambient tint behind the composition */}
      <div
        aria-hidden
        className="absolute -inset-x-10 -top-4 bottom-0 -z-10 rounded-[3rem] bg-[radial-gradient(ellipse_60%_55%_at_60%_35%,rgba(79,70,229,0.10),transparent_70%)]"
      />

      {/* Main app frame — board */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_32px_70px_-32px_rgba(15,23,42,0.35)] ring-1 ring-slate-900/[0.04]">
        {/* No decorative pill on the right of this bar — that corner belongs
            to the floating calendar chip above it. */}
        <div className="flex items-center gap-2.5 border-b border-slate-200 bg-white px-4 py-2.5">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-indigo-600 text-[11px] font-bold text-white">L</span>
          <span className="text-[13px] font-semibold text-slate-800">Lospia Demo Operasyon</span>
          <span className="ml-1 flex items-center gap-1">
            {["Pano", "Liste", "Takvim"].map((t, i) => (
              <span
                key={t}
                className={`rounded-md px-2 py-1 text-[11px] font-medium ${i === 0 ? "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100" : "text-slate-500"}`}
              >
                {t}
              </span>
            ))}
          </span>
        </div>

        <div className="grid gap-3 bg-slate-50/70 p-4 pb-10 sm:grid-cols-3">
          {HERO_COLUMNS.map((col) => (
            <div key={col.title} className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between px-0.5">
                <span className={`text-[11px] font-semibold uppercase tracking-wide ${col.status === "review" ? "text-emerald-600" : "text-slate-500"}`}>
                  {col.title}
                </span>
                <span className="rounded-full bg-slate-200/70 px-1.5 text-[10px] font-medium text-slate-500">
                  {col.tasks.length}
                </span>
              </div>
              {/* Third column stays intentionally light: the detail panel
                  docks over its lower half, so it must overlap whitespace. */}
              {col.tasks.slice(0, col.status === "review" ? 1 : 2).map((task) => (
                <MiniTaskCard key={task.title} task={task} dense />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Docked task-detail / approval panel — right edge, mid height */}
      <div className="absolute -right-1 bottom-16 z-20 hidden w-60 rounded-xl border border-slate-200 bg-white p-3.5 shadow-[0_18px_44px_-18px_rgba(15,23,42,0.3)] ring-1 ring-slate-900/[0.04] sm:block lg:-right-2">
        <div className="flex items-center gap-1.5">
          <Chip className="bg-emerald-50 text-emerald-700 ring-emerald-100">Kontrol / Onay</Chip>
          <Chip className="bg-violet-50 text-violet-700 ring-violet-100">Onay bekliyor</Chip>
        </div>
        <p className="mt-2 text-[13px] font-semibold text-slate-800">Numune revizyon kontrolü</p>
        <dl className="mt-2.5 space-y-1.5 text-[11px]">
          <div className="flex items-center justify-between">
            <dt className="text-slate-400">Sorumlu</dt>
            <dd className="flex items-center gap-1.5 font-medium text-slate-600">
              <OwnerDot id="ZD" /> Zeynep D.
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-400">Teslim tarihi</dt>
            <dd className="font-medium text-rose-500">Bu hafta</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-400">Departman</dt>
            <dd className="font-medium text-slate-600">Üretim</dd>
          </div>
        </dl>
        <div className="mt-3 flex items-center gap-1.5 rounded-lg border border-emerald-100 bg-emerald-50/70 px-2.5 py-1.5 text-[11px] font-medium text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5" /> Onaya hazır
        </div>
      </div>

      {/* Weekly visibility strip — steps down from the frame's bottom-left */}
      <div className="absolute bottom-0 left-5 z-10 grid w-[min(78%,21rem)] grid-cols-3 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 shadow-[0_18px_44px_-18px_rgba(15,23,42,0.3)] ring-1 ring-slate-900/[0.04] sm:left-7">
        {HERO_STATS.map((stat) => (
          <div key={stat.label} className="bg-white px-3.5 py-2.5">
            <p className={`text-base font-semibold ${stat.tone}`}>{stat.value}</p>
            <p className="text-[10px] leading-tight text-slate-500">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Floating calendar chip card — hangs over the top-right corner */}
      <div className="absolute right-4 top-0 z-20 hidden rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-[0_18px_44px_-18px_rgba(15,23,42,0.3)] ring-1 ring-slate-900/[0.04] lg:block">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Takvim · 6 – 12 Tem</p>
        <div className="mt-1.5 flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-1.5 py-1 text-[10px] font-medium text-slate-600">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Numune revizyon
        </div>
        <div className="mt-1 flex items-center gap-1.5 rounded-md border border-violet-100 bg-violet-50 px-1.5 py-1 text-[10px] font-medium text-violet-700">
          <span className="h-1.5 w-1.5 rounded-full bg-violet-500" /> Kreatif onayı
        </div>
      </div>
    </div>
  );
}
