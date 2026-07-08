// Shared Lospia-style preview primitives + demo-safe sample data for the
// public marketing site. Used by the static hero composition (ProductPreview)
// and the interactive tabbed showcase (ProductPreviewTabs). Pure markup — no
// client hooks here, so both server and client components can import it.
//
// Visual language: cool grays, deep graphite text, cobalt/indigo accent,
// colored department DOTS on neutral chips (deliberately less pastel than the
// in-app board so the marketing surface reads corporate, not toy-like).
// All names/tasks are the approved demo-safe brand-operations set — no real
// customer data, no Aslı Filinta production data, no "Lookbook".

export type Dept = "icerik" | "eticaret" | "uretim" | "tasarim" | "onaylar";

export const DEPT: Record<Dept, { label: string; dot: string; accent: string }> = {
  icerik: { label: "İçerik", dot: "bg-orange-500", accent: "bg-orange-400" },
  eticaret: { label: "E-ticaret", dot: "bg-sky-500", accent: "bg-sky-400" },
  uretim: { label: "Üretim", dot: "bg-amber-500", accent: "bg-amber-400" },
  tasarim: { label: "Tasarım", dot: "bg-rose-500", accent: "bg-rose-400" },
  onaylar: { label: "Onaylar", dot: "bg-violet-500", accent: "bg-violet-400" },
};

export type Status = "yapilacak" | "devam" | "review" | "done";

export const STATUS: Record<Status, { label: string; chip: string }> = {
  yapilacak: { label: "Yapılacak", chip: "bg-slate-100 text-slate-600 ring-slate-200" },
  devam: { label: "Devam ediyor", chip: "bg-sky-50 text-sky-700 ring-sky-100" },
  review: { label: "Kontrol / Onay", chip: "bg-emerald-50 text-emerald-700 ring-emerald-100" },
  done: { label: "Tamamlandı", chip: "bg-emerald-100 text-emerald-800 ring-emerald-200" },
};

export const OWNER: Record<string, { name: string; bg: string }> = {
  MA: { name: "Mert A.", bg: "bg-blue-600" },
  DT: { name: "Deniz T.", bg: "bg-violet-600" },
  ZD: { name: "Zeynep D.", bg: "bg-teal-600" },
  EK: { name: "Elif K.", bg: "bg-red-600" },
};

export type PreviewTask = {
  title: string;
  dept: Dept;
  status: Status;
  owners: string[];
  due: string;
  overdue?: boolean;
  approval?: boolean;
};

export const BOARD_COLUMNS: { title: string; status: Status; tasks: PreviewTask[] }[] = [
  {
    title: "Yapılacak",
    status: "yapilacak",
    tasks: [
      { title: "Kampanya içerik planı", dept: "icerik", status: "yapilacak", owners: ["MA"], due: "8 Tem" },
      { title: "Ürün görsel planı", dept: "tasarim", status: "yapilacak", owners: ["DT"], due: "9 Tem" },
      { title: "Sezon ürün listesi güncellemesi", dept: "eticaret", status: "yapilacak", owners: ["DT"], due: "10 Tem" },
    ],
  },
  {
    title: "Devam ediyor",
    status: "devam",
    tasks: [
      { title: "Web sitesi banner güncellemesi", dept: "eticaret", status: "devam", owners: ["DT"], due: "7 Tem", overdue: true },
      { title: "Ürün açıklamaları revizyonu", dept: "eticaret", status: "devam", owners: ["DT"], due: "9 Tem" },
      { title: "Numune revizyon takibi", dept: "uretim", status: "devam", owners: ["ZD"], due: "8 Tem" },
    ],
  },
  {
    title: "Kontrol / Onay",
    status: "review",
    tasks: [
      { title: "Onay bekleyen kreatifler", dept: "onaylar", status: "review", owners: ["MA", "EK"], due: "7 Tem", overdue: true, approval: true },
      { title: "E-posta bülteni taslağı", dept: "icerik", status: "review", owners: ["MA"], due: "9 Tem", approval: true },
    ],
  },
  {
    title: "Tamamlandı",
    status: "done",
    tasks: [
      { title: "Haftalık operasyon kontrolü", dept: "uretim", status: "done", owners: ["ZD"], due: "Bitti" },
      { title: "Sosyal medya planı onayı", dept: "icerik", status: "done", owners: ["MA"], due: "Bitti" },
    ],
  },
];

export const LIST_ROWS: PreviewTask[] = [
  { title: "Onay bekleyen kreatifler", dept: "onaylar", status: "review", owners: ["MA"], due: "7 Tem", overdue: true, approval: true },
  { title: "Web sitesi banner güncellemesi", dept: "eticaret", status: "devam", owners: ["DT"], due: "7 Tem", overdue: true },
  { title: "Numune revizyon takibi", dept: "uretim", status: "devam", owners: ["ZD"], due: "8 Tem" },
  { title: "Kampanya içerik planı", dept: "icerik", status: "yapilacak", owners: ["MA"], due: "8 Tem" },
  { title: "Ürün görsel planı", dept: "tasarim", status: "yapilacak", owners: ["DT"], due: "9 Tem" },
  { title: "E-posta bülteni taslağı", dept: "icerik", status: "review", owners: ["MA"], due: "9 Tem", approval: true },
  { title: "Ürün açıklamaları revizyonu", dept: "eticaret", status: "devam", owners: ["DT"], due: "9 Tem" },
  { title: "Haftalık operasyon kontrolü", dept: "uretim", status: "done", owners: ["ZD"], due: "Bitti" },
];

export type CalendarDay = {
  day: string;
  date: number;
  today?: boolean;
  chips: { label: string; dept: Dept; done?: boolean; approval?: boolean }[];
};

export const CALENDAR_WEEK: CalendarDay[] = [
  { day: "Pzt", date: 6, today: true, chips: [{ label: "Haftalık operasyon", dept: "uretim", done: true }] },
  { day: "Sal", date: 7, chips: [{ label: "Onay bekleyen kreatifler", dept: "onaylar", approval: true }, { label: "Web sitesi banner", dept: "eticaret" }] },
  { day: "Çar", date: 8, chips: [{ label: "Kampanya içerik planı", dept: "icerik" }, { label: "Numune revizyon", dept: "uretim" }] },
  { day: "Per", date: 9, chips: [{ label: "Ürün görsel planı", dept: "tasarim" }, { label: "E-posta bülteni", dept: "icerik", approval: true }] },
  { day: "Cum", date: 10, chips: [{ label: "Sezon ürün listesi", dept: "eticaret" }] },
  { day: "Cmt", date: 11, chips: [] },
  { day: "Paz", date: 12, chips: [] },
];

export const DASH_TILES = [
  { label: "Aktif görev", value: "16", tone: "text-slate-900" },
  { label: "Kontrol / Onay bekleyen", value: "4", tone: "text-emerald-600" },
  { label: "Geciken kritik", value: "2", tone: "text-rose-600" },
  { label: "Bu hafta tamamlanan", value: "4", tone: "text-emerald-700" },
];

export const DASH_FOCUS = [
  { label: "Bugün teslim", value: "1" },
  { label: "Bu hafta teslim", value: "6" },
  { label: "Onay kuyruğu", value: "4" },
  { label: "Geciken kritik", value: "2" },
];

export const DASH_DEPTS: { dept: Dept; done: number; total: number }[] = [
  { dept: "icerik", done: 3, total: 5 },
  { dept: "eticaret", done: 2, total: 5 },
  { dept: "uretim", done: 4, total: 5 },
  { dept: "tasarim", done: 2, total: 3 },
];

// ── Primitives ─────────────────────────────────────────────────────────

export function Chip({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${className}`}>
      {children}
    </span>
  );
}

export function DeptChip({ dept }: { dept: Dept }) {
  const d = DEPT[dept];
  return (
    <Chip className="bg-white text-slate-600 ring-slate-200">
      <span className={`h-1.5 w-1.5 rounded-full ${d.dot}`} />
      {d.label}
    </Chip>
  );
}

export function StatusChip({ status }: { status: Status }) {
  const s = STATUS[status];
  return <Chip className={s.chip}>{s.label}</Chip>;
}

export function OwnerDot({ id, size = "h-5 w-5 text-[9px]" }: { id: string; size?: string }) {
  const o = OWNER[id];
  return (
    <span
      title={o?.name}
      className={`flex ${size} items-center justify-center rounded-full font-semibold text-white ring-2 ring-white ${o?.bg ?? "bg-slate-500"}`}
    >
      {id}
    </span>
  );
}

export function OwnerStack({ ids }: { ids: string[] }) {
  return (
    <span className="flex -space-x-1.5">
      {ids.map((id) => (
        <OwnerDot key={id} id={id} />
      ))}
    </span>
  );
}

export function MiniTaskCard({ task, dense }: { task: PreviewTask; dense?: boolean }) {
  const d = DEPT[task.dept];
  return (
    <div className={`flex gap-2 rounded-lg border bg-white shadow-[0_1px_2px_rgba(15,23,42,0.05)] ${task.status === "done" ? "border-emerald-100 bg-emerald-50/40" : task.status === "review" ? "border-emerald-100" : "border-slate-200"} ${dense ? "p-2" : "p-2.5"}`}>
      <span className={`w-1 shrink-0 rounded-full ${d.accent}`} />
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex flex-wrap items-center gap-1">
          <DeptChip dept={task.dept} />
          {task.overdue ? <Chip className="bg-rose-50 text-rose-600 ring-rose-100">Gecikti</Chip> : null}
          {task.approval ? <Chip className="bg-violet-50 text-violet-700 ring-violet-100">Onay bekliyor</Chip> : null}
        </div>
        <p className="truncate text-[12px] font-semibold text-slate-800">{task.title}</p>
        <div className="mt-1.5 flex items-center justify-between">
          <span className={`text-[10px] font-medium ${task.due === "Bitti" ? "text-emerald-600" : task.overdue ? "text-rose-500" : "text-slate-400"}`}>
            {task.due}
          </span>
          <OwnerStack ids={task.owners} />
        </div>
      </div>
    </div>
  );
}
