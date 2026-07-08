import React from "react";
import {
  AbsoluteFill,
  Audio,
  Easing,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  theme,
  dept as DEPT,
  statusChip,
  reviewCardStyle,
  doneCardStyle,
  columnHeaderTone,
  avatarColor,
  avatarFallback,
  type StatusKey,
} from "./styles/lospiaVideoTheme";
import {
  SCENES,
  approvedVoiceover,
  approvedMusic,
  captions,
  cta,
  intro,
  problems,
  navGroups,
  workspaceName,
  boardColumns,
  boardToolbar,
  movingCard,
  taskDetail,
  listRows,
  calendar,
  dashboard,
  currentUser,
  type BoardCard,
  type NavIcon,
} from "./data/lospiaDemoData";

// ══════════════════════════════════════════════════════════════════════
// Lospia PRODUCT EXPLAINER — a video-native, ANIMATED rebuild of the real
// Lospia interface. Nothing here is a screenshot: every surface (sidebar,
// top bar, board, task-detail drawer, list, calendar, dashboard) is drawn
// in Remotion from the real app's design DNA (see remotion/assets/
// screenshots/* used ONLY as visual reference). The result reads as a
// premium motion-design walkthrough, not a cropped screen recording.
//
// Design DNA (sampled from the real app):
//   • off-white app bg, deep-graphite text, cobalt/indigo primary accent
//   • muted department pastels, refined badges, thin borders, subtle shadows
//   • compact professional density; the app shell fills ~88%×75% of frame
//
// Timeline @30fps · 2250 frames (75s). Boundaries live in data/SCENES.
// ══════════════════════════════════════════════════════════════════════

const C = theme.color;
const F = theme.font.family;
const SH = theme.shadow;
const S = theme.shell;
const EASE = Easing.bezier(0.4, 0, 0.2, 1);
const EASE_OUT = Easing.out(Easing.cubic);

export type LospiaDemoProps = { audio?: boolean; musicExt?: "mp3" | "wav" | null };

const WORDMARK = () => staticFile("brand/lospia/logo-wordmark.png");
const ICON = () => staticFile("brand/lospia/icon.png");
const WORDMARK_RATIO = 2.85;

// Content region inside the shell (right of the sidebar, below the top bar).
const CONTENT = {
  w: S.width - S.sidebarWidth,
  h: S.height - S.headerHeight,
};

// ── Motion helpers ────────────────────────────────────────────────────
function ramp(frame: number, points: number[], values: number[], easing?: (n: number) => number) {
  return interpolate(frame, points, values, {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing,
  });
}
function useEnter(delay = 0, distance = 18) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 200, mass: 0.7 } });
  return { opacity: s, transform: `translateY(${(1 - s) * distance}px)` };
}
function countUp(frame: number, target: number, from: number, dur: number) {
  return Math.round(ramp(frame, [from, from + dur], [0, target], EASE_OUT));
}

// ══════════════════════════════════════════════════════════════════════
// PRIMITIVES
// ══════════════════════════════════════════════════════════════════════

// ── Glyphs (thin lucide-style line icons, drawn — no icon font) ───────
type GlyphName = NavIcon | "bell" | "search" | "chevronDown" | "chevronLeft" | "chevronRight" | "plus" | "pencil" | "calendarSm" | "flag" | "check";

function Glyph({ name, size = 18, color = C.textMuted, strokeWidth = 1.8 }: { name: GlyphName; size?: number; color?: string; strokeWidth?: number }) {
  const p = { fill: "none", stroke: color, strokeWidth, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const paths: Record<GlyphName, React.ReactNode> = {
    board: (<><rect x={4} y={4} width={4.5} height={16} rx={1.2} {...p} /><rect x={10} y={4} width={4.5} height={11} rx={1.2} {...p} /><rect x={16} y={4} width={4.5} height={14} rx={1.2} {...p} /></>),
    adminBoard: (<path d="M12 3l7 3v5c0 4.4-3 8-7 10-4-2-7-5.6-7-10V6l7-3z" {...p} />),
    list: (<><path d="M8 6h12M8 12h12M8 18h12" {...p} /><circle cx={4} cy={6} r={1} fill={color} /><circle cx={4} cy={12} r={1} fill={color} /><circle cx={4} cy={18} r={1} fill={color} /></>),
    modules: (<><rect x={4} y={4} width={7} height={7} rx={1.5} {...p} /><rect x={13} y={4} width={7} height={7} rx={1.5} {...p} /><rect x={4} y={13} width={7} height={7} rx={1.5} {...p} /><rect x={13} y={13} width={7} height={7} rx={1.5} {...p} /></>),
    dashboard: (<><rect x={4} y={4} width={7} height={9} rx={1.5} {...p} /><rect x={13} y={4} width={7} height={5} rx={1.5} {...p} /><rect x={4} y={16} width={7} height={4} rx={1.5} {...p} /><rect x={13} y={12} width={7} height={8} rx={1.5} {...p} /></>),
    calendar: (<><rect x={4} y={5} width={16} height={15} rx={2.4} {...p} /><path d="M4 9h16M8 3v4M16 3v4" {...p} /></>),
    calendarSm: (<><rect x={4} y={5} width={16} height={15} rx={2.4} {...p} /><path d="M4 9h16M8 3v4M16 3v4" {...p} /></>),
    rules: (<path d="M5 5.5A2 2 0 017 4h11v14H7a2 2 0 00-2 2V5.5zM18 4v14" {...p} />),
    activity: (<path d="M4 12h4l2-6 4 12 2-6h4" {...p} />),
    archive: (<><rect x={4} y={5} width={16} height={4} rx={1.2} {...p} /><path d="M5 9v9a1.5 1.5 0 001.5 1.5h11A1.5 1.5 0 0019 18V9M10 13h4" {...p} /></>),
    trash: (<path d="M5 7h14M10 7V5h4v2M6.5 7l1 12.5A1.5 1.5 0 009 21h6a1.5 1.5 0 001.5-1.5L17.5 7" {...p} />),
    settings: (<><circle cx={12} cy={12} r={3.2} {...p} /><path d="M12 3.5v2.5M12 18v2.5M4.6 7.5l2.1 1.3M17.3 15.2l2.1 1.3M4.6 16.5l2.1-1.3M17.3 8.8l2.1-1.3" {...p} /></>),
    bell: (<path d="M6 9a6 6 0 0112 0c0 5 2 6 2 6H4s2-1 2-6M10 20a2 2 0 004 0" {...p} />),
    search: (<><circle cx={11} cy={11} r={6} {...p} /><path d="M20 20l-3.6-3.6" {...p} /></>),
    chevronDown: (<path d="M6 9l6 6 6-6" {...p} />),
    chevronLeft: (<path d="M15 6l-6 6 6 6" {...p} />),
    chevronRight: (<path d="M9 6l6 6-6 6" {...p} />),
    plus: (<path d="M12 5v14M5 12h14" {...p} />),
    pencil: (<path d="M4 20l1-4L16 5l3 3L8 19l-4 1zM14 7l3 3" {...p} />),
    flag: (<path d="M6 21V4h11l-2 3.5L17 11H6" {...p} />),
    check: (<path d="M5 12.5l4.5 4.5L19 7" {...p} />),
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: "block", flexShrink: 0 }}>
      {paths[name]}
    </svg>
  );
}

// ── Avatar + stack ────────────────────────────────────────────────────
function Avatar({ id, size = 26, ring = "#fff" }: { id: string; size?: number; ring?: string }) {
  const bg = avatarColor[id] ?? avatarFallback;
  return (
    <div style={{ width: size, height: size, borderRadius: 999, background: bg, color: "#fff", fontFamily: F, fontSize: size * 0.4, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", border: `2px solid ${ring}`, boxSizing: "border-box", flexShrink: 0 }}>{id}</div>
  );
}
function AvatarStack({ ids, size = 26 }: { ids: string[]; size?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "row-reverse" }}>
      {[...ids].reverse().map((id, i) => (
        <div key={id + i} style={{ marginLeft: i === ids.length - 1 ? 0 : -size * 0.34 }}>
          <Avatar id={id} size={size} />
        </div>
      ))}
    </div>
  );
}

// ── Chip / badge ──────────────────────────────────────────────────────
function Chip({ bg, color, border, dot, children, size = 15 }: { bg: string; color: string; border?: string; dot?: string; children: React.ReactNode; size?: number }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, background: bg, color, border: border ? `1px solid ${border}` : undefined, borderRadius: 999, padding: "3px 10px", fontFamily: F, fontSize: size, fontWeight: 600, lineHeight: 1, whiteSpace: "nowrap" }}>
      {dot ? <span style={{ width: 7, height: 7, borderRadius: 999, background: dot }} /> : null}
      {children}
    </span>
  );
}

// ── Cursor (restrained macOS-style pointer) ──────────────────────────
function Cursor({ x, y, opacity = 1, scale = 1 }: { x: number; y: number; opacity?: number; scale?: number }) {
  return (
    <div style={{ position: "absolute", left: x, top: y, opacity, transform: `scale(${scale})`, transformOrigin: "top left", pointerEvents: "none", zIndex: 50 }}>
      <svg width={30} height={30} viewBox="0 0 24 24" style={{ filter: "drop-shadow(0 2px 3px rgba(20,28,40,0.35))" }}>
        <path d="M5 3l14 7-6 1.6 3.2 6.1-2.6 1.3L10.3 13 5 17V3z" fill="#ffffff" stroke="#1d2127" strokeWidth={1.3} strokeLinejoin="round" />
      </svg>
    </div>
  );
}

// ── Highlight box (cobalt focus ring — restrained, never neon) ───────
function HighlightBox({ box, k, radius = 12 }: { box: { left: number; top: number; width: number; height: number }; k: number; radius?: number }) {
  if (k <= 0.001) return null;
  return (
    <div style={{ position: "absolute", ...box, borderRadius: radius, border: `2px solid rgba(47,95,224,${0.9 * k})`, background: `rgba(47,95,224,${0.05 * k})`, boxShadow: `0 0 0 ${5 * k}px rgba(47,95,224,${0.12 * k}), 0 12px 30px -14px rgba(47,95,224,${0.4 * k})`, pointerEvents: "none", zIndex: 40 }} />
  );
}

// ── Callout (small graphite label pill) ──────────────────────────────
function Callout({ x, y, k, children, arrow }: { x: number; y: number; k: number; children: React.ReactNode; arrow?: "down" | "left" }) {
  if (k <= 0.001) return null;
  return (
    <div style={{ position: "absolute", left: x, top: y, opacity: k, transform: `translateY(${(1 - k) * 8}px)`, zIndex: 45 }}>
      <div style={{ position: "relative", background: C.text, color: "#fff", fontFamily: F, fontSize: 18, fontWeight: 600, padding: "10px 16px", borderRadius: 10, boxShadow: "0 14px 32px -14px rgba(20,28,40,0.6)", whiteSpace: "nowrap" }}>
        {children}
        {arrow === "down" ? <span style={{ position: "absolute", left: 22, bottom: -6, width: 12, height: 12, background: C.text, transform: "rotate(45deg)" }} /> : null}
        {arrow === "left" ? <span style={{ position: "absolute", left: -6, top: 14, width: 12, height: 12, background: C.text, transform: "rotate(45deg)" }} /> : null}
      </div>
    </div>
  );
}

// ── Animated flow line (draws-on SVG path) ───────────────────────────
function AnimatedFlowLine({ d, k, width = 2, color = C.primary, dashed = false }: { d: string; k: number; width?: number; color?: string; dashed?: boolean }) {
  return (
    <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 5 }}>
      <path d={d} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" pathLength={1} strokeDasharray={dashed ? "5 6" : 1} strokeDashoffset={dashed ? 0 : 1 - k} opacity={dashed ? 0.5 * k : 0.85} />
    </svg>
  );
}

// ══════════════════════════════════════════════════════════════════════
// APP SHELL — sidebar + top bar (drawn from real Lospia chrome)
// ══════════════════════════════════════════════════════════════════════

function AnimatedSidebar({ active }: { active: NavIcon }) {
  return (
    <div style={{ width: S.sidebarWidth, height: "100%", background: "#fff", borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", flexShrink: 0 }}>
      {/* brand */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 16px 14px" }}>
        <Img src={ICON()} style={{ width: 30, height: 30, borderRadius: 8, objectFit: "contain" }} />
        <div style={{ fontFamily: F, fontSize: 15.5, fontWeight: 700, color: C.text, letterSpacing: -0.2, lineHeight: 1.1 }}>{workspaceName}</div>
      </div>
      {/* nav */}
      <div style={{ padding: "6px 12px", flex: 1, overflow: "hidden" }}>
        {navGroups.map((group) => (
          <div key={group.title} style={{ marginBottom: 12 }}>
            <div style={{ fontFamily: F, fontSize: 11, fontWeight: 700, letterSpacing: 0.8, color: C.textSubtle, textTransform: "uppercase", padding: "6px 10px 5px" }}>{group.title}</div>
            {group.items.map((item) => {
              const isActive = item.icon === active;
              return (
                <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 11, padding: "8px 10px", borderRadius: 9, marginBottom: 2, background: isActive ? C.surfaceSunken : "transparent", position: "relative" }}>
                  {isActive ? <span style={{ position: "absolute", left: 0, top: 8, bottom: 8, width: 3, borderRadius: 999, background: C.primary }} /> : null}
                  <Glyph name={item.icon} size={18} color={isActive ? C.text : C.textMuted} strokeWidth={isActive ? 2 : 1.8} />
                  <span style={{ fontFamily: F, fontSize: 14.5, fontWeight: isActive ? 650 : 500, color: isActive ? C.text : C.textMuted }}>{item.label}</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {/* progress card */}
      <div style={{ margin: "0 12px 10px", border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 13px", background: C.surfaceMuted }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: F, fontSize: 11, fontWeight: 700, letterSpacing: 0.6, color: C.textSubtle, textTransform: "uppercase", marginBottom: 8 }}>
          <Glyph name="activity" size={13} color={C.textSubtle} /> Bu ayın ilerlemesi
        </div>
        {[["Ekipçe tamamlanan", "4"], ["Kontrol bekleyen", "4"]].map(([l, v]) => (
          <div key={l} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0", fontFamily: F, fontSize: 13.5 }}>
            <span style={{ color: C.textMuted }}>{l}</span>
            <span style={{ color: C.text, fontWeight: 700 }}>{v}</span>
          </div>
        ))}
        <div style={{ marginTop: 8, fontFamily: F, fontSize: 12.5, fontWeight: 600, color: C.primary }}>Puan özetini gör →</div>
      </div>
      {/* wordmark */}
      <div style={{ padding: "4px 16px 16px" }}>
        <Img src={WORDMARK()} style={{ height: 24, width: 24 * WORDMARK_RATIO, objectFit: "contain", opacity: 0.9 }} />
      </div>
    </div>
  );
}

function AnimatedTopBar({ page }: { page: string }) {
  return (
    <div style={{ height: S.headerHeight, borderBottom: `1px solid ${C.border}`, background: "#fff", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 26px", flexShrink: 0 }}>
      <div style={{ fontFamily: F, fontSize: 19, fontWeight: 650, color: C.text, letterSpacing: -0.2 }}>{page}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ width: 34, height: 34, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Glyph name="bell" size={20} color={C.textMuted} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 9, border: `1px solid ${C.border}`, borderRadius: 999, padding: "4px 10px 4px 4px" }}>
          <Avatar id={currentUser.initials} size={30} />
          <div style={{ lineHeight: 1.1 }}>
            <div style={{ fontFamily: F, fontSize: 13.5, fontWeight: 650, color: C.text }}>{currentUser.name}</div>
            <div style={{ fontFamily: F, fontSize: 11.5, color: C.textSubtle }}>{currentUser.role}</div>
          </div>
          <Glyph name="chevronDown" size={15} color={C.textSubtle} />
        </div>
      </div>
    </div>
  );
}

function AnimatedLospiaAppShell({ page, active, children, k = 1 }: { page: string; active: NavIcon; children: React.ReactNode; k?: number }) {
  return (
    <AbsoluteFill style={{ background: C.appBg }}>
      <AbsoluteFill style={{ background: `radial-gradient(58% 46% at 50% -4%, ${C.brandSoft}55, transparent 62%)` }} />
      <div style={{ position: "absolute", left: S.x, top: S.y, width: S.width, height: S.height, borderRadius: S.radius, background: "#fff", border: `1px solid ${C.border}`, boxShadow: SH.frame, overflow: "hidden", display: "flex", opacity: k, transform: `translateY(${(1 - k) * 18}px)` }}>
        <AnimatedSidebar active={active} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <AnimatedTopBar page={page} />
          <div style={{ flex: 1, position: "relative", background: C.appBg, overflow: "hidden" }}>{children}</div>
        </div>
      </div>
    </AbsoluteFill>
  );
}

// ══════════════════════════════════════════════════════════════════════
// TASK CARD (board + list share the DNA)
// ══════════════════════════════════════════════════════════════════════

function DueLabel({ due, overdue }: { due: string; overdue?: boolean }) {
  if (due === "Bitti") return <span style={{ fontFamily: F, fontSize: 13, color: C.success, fontWeight: 600 }}>{due}</span>;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: F, fontSize: 13, fontWeight: 600, color: overdue ? C.danger : C.textMuted }}>
      {overdue ? <span style={{ fontSize: 12 }}>⚠</span> : null}{due}
    </span>
  );
}

function AnimatedTaskCard({ card, width }: { card: BoardCard; width?: number }) {
  const d = DEPT[card.dept];
  const isReview = card.status === "review";
  const isDone = card.status === "done";
  const surface = isDone ? doneCardStyle.surface : isReview ? reviewCardStyle.surface : "#fff";
  const borderCol = isDone ? doneCardStyle.border : isReview ? reviewCardStyle.border : C.border;
  return (
    <div style={{ width, background: surface, border: `1px solid ${borderCol}`, borderLeft: `3px solid ${d.accent}`, borderRadius: 10, boxShadow: SH.card, padding: "12px 13px", boxSizing: "border-box" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 9 }}>
        <Chip bg={d.chipBg} color={d.chipText} dot={d.dot} size={13}>{d.label}</Chip>
        {card.overdue ? <Chip bg="#fbe6e2" color="#a83a2c" size={13}>Gecikti</Chip> : null}
        {card.approval ? <Chip bg="#ece4fa" color="#5e44a0" size={13}>Onay bekliyor</Chip> : null}
      </div>
      <div style={{ fontFamily: F, fontSize: 16.5, fontWeight: 650, color: C.text, letterSpacing: -0.2, marginBottom: 5, lineHeight: 1.25 }}>{card.title}</div>
      {card.description ? (
        <div style={{ fontFamily: F, fontSize: 13.5, color: C.textMuted, lineHeight: 1.4, marginBottom: 11, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{card.description}</div>
      ) : <div style={{ height: 8 }} />}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Chip bg={statusChip[card.status].bg} color={statusChip[card.status].text} size={12.5}>{statusChip[card.status].label}</Chip>
          <DueLabel due={card.due} overdue={card.overdue} />
        </div>
        <AvatarStack ids={card.avatars} size={24} />
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// BOARD (Scene 3) — animated columns + a card that moves into approval
// ══════════════════════════════════════════════════════════════════════

const PAD = 24;
const COL_GAP = 16;
const COL_W = Math.round((CONTENT.w - PAD * 2 - COL_GAP * 3) / 4); // 4 columns
const CARDS_TOP = 178;
const SLOT = 172;
const colX = (i: number) => PAD + i * (COL_W + COL_GAP);
const HEADER_TONE_KEY: StatusKey[] = ["yapilacak", "devam", "review", "done"];

function BoardToolbar() {
  return (
    <div style={{ position: "absolute", left: PAD, right: PAD, top: 74, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, background: C.primary, color: "#fff", fontFamily: F, fontSize: 14.5, fontWeight: 600, padding: "9px 15px", borderRadius: 9, boxShadow: "0 6px 16px -8px rgba(47,95,224,0.55)" }}>
          <Glyph name="plus" size={16} color="#fff" /> {boardToolbar.create}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 7, background: "#fff", color: C.textMuted, fontFamily: F, fontSize: 14, fontWeight: 600, padding: "9px 14px", borderRadius: 9, border: `1px solid ${C.border}` }}>
          {boardToolbar.importCsv}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        {boardToolbar.filters.map((f) => (
          <div key={f} style={{ display: "flex", alignItems: "center", gap: 8, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 9, padding: "9px 12px", fontFamily: F, fontSize: 13.5, color: C.textMuted, fontWeight: 500 }}>
            {f} <Glyph name="chevronDown" size={14} color={C.textSubtle} />
          </div>
        ))}
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 9, padding: "9px 14px", width: 150, fontFamily: F, fontSize: 13.5, color: C.textSubtle }}>
          <Glyph name="search" size={15} color={C.textSubtle} /> {boardToolbar.search}
        </div>
      </div>
    </div>
  );
}

function ColumnHeader({ i, label, count, x }: { i: number; label: string; count: number; x: number }) {
  const tone = columnHeaderTone[HEADER_TONE_KEY[i]] ?? C.textMuted;
  return (
    <div style={{ position: "absolute", left: x, top: CARDS_TOP - 34, width: COL_W, display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontFamily: F, fontSize: 13.5, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: tone }}>{label}</span>
      <span style={{ fontFamily: F, fontSize: 12.5, fontWeight: 700, color: C.textSubtle, background: C.surfaceSunken, borderRadius: 999, padding: "1px 8px" }}>{count}</span>
    </div>
  );
}

function AnimatedBoard({ frozen = false }: { frozen?: boolean }) {
  const liveFrame = useCurrentFrame();
  const frame = frozen ? 520 : liveFrame;

  // Columns: use the 4 workflow columns (drop the NOTLAR column for a clean
  // video-native board). Devam shows 2 base cards + the moving card as a 3rd.
  const cols = boardColumns; // yapilacak, devam, review, done
  const devamIdx = 1;
  const reviewIdx = 2;

  // Moving card path: devam 3rd slot → review top slot.
  const startX = colX(devamIdx);
  const startY = CARDS_TOP + 2 * SLOT;
  const endX = colX(reviewIdx);
  const endY = CARDS_TOP;
  const mv = ramp(frame, [170, 300], [0, 1], EASE);
  const mvLift = ramp(frame, [170, 220, 260, 300], [0, 1, 1, 0]);
  const mCardX = startX + (endX - startX) * mv;
  const mCardY = startY + (endY - startY) * mv;

  // Review column highlight + callout.
  const reviewHi = frozen ? 0 : ramp(frame, [300, 330, 470, 500], [0, 1, 1, 0]);
  const calloutK = frozen ? 0 : ramp(frame, [330, 360, 470, 500], [0, 1, 1, 0]);

  // Cursor glides toward the moving card / approval column.
  const cursorK = frozen ? 0 : ramp(frame, [60, 160, 470, 500], [0, 1, 1, 0]);
  const cx = ramp(frame, [60, 160, 300], [colX(0) + 180, startX + COL_W / 2, endX + COL_W / 2], EASE);
  const cy = ramp(frame, [60, 160, 300], [CARDS_TOP + 60, startY + 40, endY + 40], EASE);

  const reviewBox = { left: colX(reviewIdx) - 6, top: CARDS_TOP - 40, width: COL_W + 12, height: 3 * SLOT + 24 };

  return (
    <AbsoluteFill>
      {/* Kurallar collapsed banner (slim, faithful) */}
      <div style={{ position: "absolute", left: PAD, right: PAD, top: 18, height: 30, display: "flex", alignItems: "center", justifyContent: "space-between", background: "#fdf7ec", border: `1px solid #f0e2c4`, borderRadius: 9, padding: "0 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: F, fontSize: 13.5, fontWeight: 600, color: "#8a6a1e" }}>
          <Glyph name="chevronRight" size={14} color="#8a6a1e" /> <Glyph name="rules" size={15} color="#8a6a1e" /> Kurallar <span style={{ color: "#b08933" }}>(5)</span>
        </div>
        <div style={{ fontFamily: F, fontSize: 12.5, fontWeight: 600, color: "#8a6a1e" }}>Tümünü yönet →</div>
      </div>

      {/* Week selector */}
      <div style={{ position: "absolute", left: PAD, top: 58, display: "flex", alignItems: "center", gap: 10 }}>
        <Glyph name="chevronLeft" size={16} color={C.textSubtle} />
        <span style={{ fontFamily: F, fontSize: 16, fontWeight: 650, color: C.text }}>{boardToolbar.week}</span>
        <Glyph name="chevronRight" size={16} color={C.textSubtle} />
      </div>

      <BoardToolbar />

      {/* Columns */}
      {cols.map((col, i) => {
        const enter = frozen ? 1 : ramp(frame, [20 + i * 16, 55 + i * 16], [0, 1], EASE_OUT);
        return (
          <React.Fragment key={col.id}>
            <div style={{ opacity: enter }}>
              <ColumnHeader i={i} label={col.label} count={col.cards.length + (i === reviewIdx ? 1 : 0)} x={colX(i)} />
            </div>
            {/* review reserves an empty top drop slot */}
            {i === reviewIdx ? (
              <div style={{ position: "absolute", left: colX(i), top: CARDS_TOP, width: COL_W, height: SLOT - 16, borderRadius: 10, border: `1.5px dashed ${C.borderStrong}`, background: "rgba(47,95,224,0.02)", opacity: (frozen ? 0 : ramp(frame, [30, 60, 250, 300], [0, 1, 1, 0])) }} />
            ) : null}
            {col.cards.map((card, ci) => {
              const slotIndex = i === reviewIdx ? ci + 1 : ci; // review cards sit below the reserved slot
              const y = CARDS_TOP + slotIndex * SLOT;
              const cardEnter = frozen ? 1 : ramp(frame, [30 + i * 16 + ci * 12, 70 + i * 16 + ci * 12], [0, 1], EASE_OUT);
              return (
                <div key={card.title} style={{ position: "absolute", left: colX(i), top: y, opacity: cardEnter, transform: `translateY(${(1 - cardEnter) * 14}px)` }}>
                  <AnimatedTaskCard card={card} width={COL_W} />
                </div>
              );
            })}
          </React.Fragment>
        );
      })}

      {/* Review column highlight */}
      <HighlightBox box={reviewBox} k={reviewHi} radius={14} />

      {/* Moving card overlay */}
      <div style={{ position: "absolute", left: mCardX, top: mCardY, width: COL_W, transform: `scale(${1 + 0.03 * mvLift})`, transformOrigin: "center", filter: mvLift > 0 ? `drop-shadow(0 18px 30px rgba(20,28,40,${0.16 * mvLift}))` : undefined, zIndex: 30 }}>
        <AnimatedTaskCard card={movingCard} width={COL_W} />
      </div>

      {/* Callout near approval column */}
      <Callout x={colX(reviewIdx)} y={CARDS_TOP - 78} k={calloutK} arrow="down">Onay bekleyen işler ayrı görünür</Callout>

      {!frozen ? <Cursor x={cx} y={cy} opacity={cursorK} /> : null}
    </AbsoluteFill>
  );
}

// ══════════════════════════════════════════════════════════════════════
// TASK DETAIL DRAWER (Scene 4)
// ══════════════════════════════════════════════════════════════════════

function FieldBox({ label, children, ring = 0 }: { label: string; children: React.ReactNode; ring?: number }) {
  return (
    <div>
      <div style={{ fontFamily: F, fontSize: 13, fontWeight: 500, color: C.textMuted, marginBottom: 6 }}>{label}</div>
      <div style={{ position: "relative", background: "#fff", border: `1px solid ${C.border}`, borderRadius: 9, padding: "11px 13px", fontFamily: F, fontSize: 15, fontWeight: 500, color: C.text, boxShadow: ring > 0.01 ? `0 0 0 ${2 * ring}px rgba(47,95,224,${0.9 * ring}), 0 0 0 ${5 * ring}px rgba(47,95,224,${0.14 * ring})` : undefined }}>
        {children}
      </div>
    </div>
  );
}

function AnimatedTaskDetailPanel() {
  const frame = useCurrentFrame();
  const t = taskDetail;
  const drawerW = Math.round(CONTENT.w * 0.62);
  const slide = ramp(frame, [4, 30], [drawerW + 40, 0], EASE);
  const scrim = ramp(frame, [4, 26], [0, 0.34]);

  // Sequential focus: Sorumlu → Durum → Teslim.
  const ownerK = ramp(frame, [70, 92, 150, 168], [0, 1, 1, 0]);
  const statusK = ramp(frame, [150, 172, 230, 248], [0, 1, 1, 0]);
  const dueK = ramp(frame, [230, 252, 320, 340], [0, 1, 1, 0]);

  return (
    <AbsoluteFill>
      {/* dimmed board behind */}
      <AnimatedBoard frozen />
      <AbsoluteFill style={{ background: `rgba(20,28,40,${scrim})`, zIndex: 40 }} />

      {/* drawer (above the frozen board's floating card) */}
      <div style={{ position: "absolute", top: 0, right: 0, width: drawerW, height: "100%", background: C.appBg, borderLeft: `1px solid ${C.border}`, boxShadow: "-24px 0 60px -30px rgba(20,28,40,0.4)", transform: `translateX(${slide}px)`, overflow: "hidden", zIndex: 50 }}>
        {/* drawer header bar */}
        <div style={{ height: 52, borderBottom: `1px solid ${C.border}`, background: "#fff", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 22px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: F, fontSize: 13.5, fontWeight: 600, color: C.textMuted }}>
            <Glyph name="chevronLeft" size={16} color={C.textMuted} /> Panoya dön
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 7, background: C.surfaceSunken, color: C.textMuted, fontFamily: F, fontSize: 13, fontWeight: 600, padding: "7px 13px", borderRadius: 8, border: `1px solid ${C.border}` }}>Değişiklikleri Kaydet</div>
        </div>

        <div style={{ padding: "22px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
          {/* title + summary card */}
          <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 14, padding: "18px 20px", boxShadow: SH.card }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontFamily: F, fontSize: 26, fontWeight: 700, color: C.text, letterSpacing: -0.5 }}>{t.title}</div>
              <Glyph name="pencil" size={17} color={C.textSubtle} />
            </div>
            {/* Sorumlu */}
            <div style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 9, marginTop: 14, padding: "4px 8px 4px 4px", borderRadius: 999, boxShadow: ownerK > 0.01 ? `0 0 0 ${2 * ownerK}px rgba(47,95,224,${0.9 * ownerK}), 0 0 0 ${5 * ownerK}px rgba(47,95,224,${0.14 * ownerK})` : undefined }}>
              <span style={{ fontFamily: F, fontSize: 13.5, color: C.textMuted, marginRight: 2 }}>Sorumlu:</span>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: C.surfaceSunken, borderRadius: 999, padding: "3px 10px 3px 3px" }}>
                <Avatar id="ZD" size={22} /> <span style={{ fontFamily: F, fontSize: 13.5, fontWeight: 600, color: C.text }}>Zeynep D.</span>
              </div>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: C.surfaceSunken, borderRadius: 999, padding: "3px 10px 3px 3px" }}>
                <Avatar id="EK" size={22} /> <span style={{ fontFamily: F, fontSize: 13.5, fontWeight: 600, color: C.text }}>Elif K.</span>
              </div>
            </div>
            {/* chip row */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
              <div style={{ position: "relative", borderRadius: 999, boxShadow: statusK > 0.01 ? `0 0 0 ${2 * statusK}px rgba(47,95,224,${0.9 * statusK}), 0 0 0 ${5 * statusK}px rgba(47,95,224,${0.14 * statusK})` : undefined }}>
                <Chip bg={statusChip.review.bg} color={statusChip.review.text} size={14}>Kontrol / Onay</Chip>
              </div>
              <Chip bg="#dc2626" color="#fff" size={14}>Acil</Chip>
              <div style={{ position: "relative", borderRadius: 999, boxShadow: dueK > 0.01 ? `0 0 0 ${2 * dueK}px rgba(47,95,224,${0.9 * dueK}), 0 0 0 ${5 * dueK}px rgba(47,95,224,${0.14 * dueK})` : undefined }}>
                <Chip bg="#fbe6e2" color="#a83a2c" size={14}>📅 Teslim: 03.07.2026</Chip>
              </div>
              <Chip bg={C.surfaceSunken} color={C.textMuted} size={14}>🏢 Üretim</Chip>
            </div>
          </div>

          {/* Görev bilgileri */}
          <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 14, padding: "18px 20px", boxShadow: SH.card }}>
            <div style={{ fontFamily: F, fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 14 }}>Görev bilgileri</div>
            <FieldBox label="Açıklama">
              <span style={{ color: C.textMuted, fontWeight: 400, lineHeight: 1.45 }}>{t.description}</span>
            </FieldBox>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 14 }}>
              <FieldBox label="Durum" ring={statusK}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>Kontrol / Onay <Glyph name="chevronDown" size={14} color={C.textSubtle} /></div>
              </FieldBox>
              <FieldBox label="Öncelik">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>Acil <Glyph name="chevronDown" size={14} color={C.textSubtle} /></div>
              </FieldBox>
              <FieldBox label="Teslim tarihi" ring={dueK}>03.07.2026</FieldBox>
              <FieldBox label="Not">Revizyon kontrolü bekliyor</FieldBox>
            </div>
          </div>

          {/* Sorumlu kişiler / checklist */}
          <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 20px", boxShadow: SH.card }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: F, fontSize: 14.5, fontWeight: 650, color: C.text }}>Sorumlu kişiler <span style={{ fontWeight: 500, color: C.textSubtle, fontSize: 13 }}>· 0/2 tamamlandı</span></div>
              <div style={{ fontFamily: F, fontSize: 13, fontWeight: 600, color: C.primary }}>Kişi ekle / çıkar</div>
            </div>
            {[["ZD", "Zeynep D."], ["EK", "Elif K."]].map(([id, name]) => (
              <div key={id} style={{ display: "flex", alignItems: "center", gap: 11, padding: "8px 0" }}>
                <div style={{ width: 20, height: 20, borderRadius: 6, border: `1.6px solid ${C.borderStrong}`, background: "#fff" }} />
                <Avatar id={id} size={26} />
                <span style={{ fontFamily: F, fontSize: 14.5, fontWeight: 500, color: C.text }}>{name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
}

// ══════════════════════════════════════════════════════════════════════
// LIST + CALENDAR SPLIT (Scene 5)
// ══════════════════════════════════════════════════════════════════════

function AnimatedListView({ frame }: { frame: number }) {
  const rows = listRows.slice(0, 7);
  const filters = ["Tüm durumlar", "Tüm öncelikler", "Tüm kişiler"];
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <Glyph name="list" size={17} color={C.text} />
        <span style={{ fontFamily: F, fontSize: 16, fontWeight: 700, color: C.text }}>Liste</span>
      </div>
      {/* filter chips that "activate" */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {filters.map((f, i) => {
          const active = ramp(frame, [40 + i * 14, 70 + i * 14], [0, 1], EASE_OUT);
          return (
            <div key={f} style={{ display: "flex", alignItems: "center", gap: 7, background: `rgba(47,95,224,${0.06 * active})`, border: `1px solid ${active > 0.5 ? C.primaryRing : C.border}`, borderRadius: 8, padding: "7px 11px", fontFamily: F, fontSize: 12.5, fontWeight: 600, color: active > 0.5 ? C.primaryStrong : C.textMuted }}>
              {f} <Glyph name="chevronDown" size={13} color={active > 0.5 ? C.primaryStrong : C.textSubtle} />
            </div>
          );
        })}
      </div>
      {/* table */}
      <div style={{ flex: 1, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", boxShadow: SH.card }}>
        <div style={{ display: "grid", gridTemplateColumns: "2.3fr 1fr 1.2fr 1.1fr 0.9fr", gap: 8, padding: "11px 16px", borderBottom: `1px solid ${C.border}`, background: C.surfaceMuted, fontFamily: F, fontSize: 11.5, fontWeight: 700, letterSpacing: 0.4, color: C.textSubtle, textTransform: "uppercase" }}>
          <span>Başlık</span><span>Departman</span><span>Durum</span><span>Sorumlu</span><span>Teslim</span>
        </div>
        {rows.map((r, i) => {
          const enter = ramp(frame, [50 + i * 10, 84 + i * 10], [0, 1], EASE_OUT);
          const dueHi = ramp(frame, [150 + i * 6, 176 + i * 6], [0, 1], EASE_OUT);
          const d = DEPT[r.dept];
          const isDone = r.status === "done";
          return (
            <div key={r.title} style={{ display: "grid", gridTemplateColumns: "2.3fr 1fr 1.2fr 1.1fr 0.9fr", gap: 8, alignItems: "center", padding: "12px 16px", borderBottom: i < rows.length - 1 ? `1px solid ${C.hairline}` : undefined, background: isDone ? "#f4fbf6" : "transparent", opacity: enter, transform: `translateX(${(1 - enter) * 10}px)` }}>
              <span style={{ fontFamily: F, fontSize: 14, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</span>
              <span><Chip bg={d.chipBg} color={d.chipText} dot={d.dot} size={12}>{d.label}</Chip></span>
              <span><Chip bg={statusChip[r.status].bg} color={statusChip[r.status].text} size={12}>{statusChip[r.status].label}</Chip></span>
              <span style={{ fontFamily: F, fontSize: 13, color: C.textMuted }}>{r.owner}</span>
              <span style={{ display: "inline-flex", padding: "1px 6px", borderRadius: 6, background: r.overdue ? `rgba(200,80,61,${0.1 * dueHi})` : "transparent" }}><DueLabel due={r.due} overdue={r.overdue} /></span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AnimatedCalendarView({ frame }: { frame: number }) {
  // A compact single-week strip (this week) with deadline chips sliding in.
  const week = calendar.weeks[0];
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <Glyph name="calendar" size={17} color={C.text} />
        <span style={{ fontFamily: F, fontSize: 16, fontWeight: 700, color: C.text }}>Takvim</span>
        <span style={{ fontFamily: F, fontSize: 13.5, color: C.textMuted, marginLeft: 4 }}>· {calendar.monthLabel}</span>
      </div>
      <div style={{ flex: 1, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden", boxShadow: SH.card, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
          {calendar.weekdays.map((w) => (
            <div key={w} style={{ padding: "9px 0", textAlign: "center", fontFamily: F, fontSize: 11.5, fontWeight: 700, letterSpacing: 0.3, color: C.textSubtle, textTransform: "uppercase", borderBottom: `1px solid ${C.border}` }}>{w}</div>
          ))}
        </div>
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
          {week.map((cell, i) => {
            const isToday = cell.today;
            return (
              <div key={i} style={{ borderRight: i < 6 ? `1px solid ${C.hairline}` : undefined, padding: "9px 7px", display: "flex", flexDirection: "column", gap: 5, background: isToday ? C.primarySoft : cell.muted ? C.surfaceMuted : "#fff" }}>
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <span style={{ width: 24, height: 24, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: F, fontSize: 13, fontWeight: isToday ? 700 : 600, color: isToday ? "#fff" : cell.muted ? C.textSubtle : C.text, background: isToday ? C.primary : "transparent" }}>{cell.day}</span>
                </div>
                {(cell.chips ?? []).map((chip, ci) => {
                  const d = DEPT[chip.dept];
                  const slide = ramp(frame, [90 + i * 12 + ci * 20, 122 + i * 12 + ci * 20], [0, 1], EASE_OUT);
                  return (
                    <div key={ci} style={{ opacity: slide, transform: `translateY(${(1 - slide) * 8}px)`, display: "flex", alignItems: "center", gap: 5, background: d.surface, border: `1px solid ${d.border}`, borderRadius: 6, padding: "3px 6px", fontFamily: F, fontSize: 10.5, fontWeight: 600, color: d.chipText, textDecoration: chip.done ? "line-through" : "none", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                      <span style={{ width: 5, height: 5, borderRadius: 999, background: d.dot, flexShrink: 0 }} /> {chip.label}
                    </div>
                  );
                })}
                {cell.more ? <div style={{ fontFamily: F, fontSize: 10.5, fontWeight: 600, color: C.primary }}>+{cell.more} daha</div> : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function AnimatedListCalendar() {
  const frame = useCurrentFrame();
  const listW = "57%";
  const calW = "43%";
  const listEnter = ramp(frame, [0, 22], [0, 1], EASE_OUT);
  const calEnter = ramp(frame, [12, 34], [0, 1], EASE_OUT);
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", inset: 0, padding: "22px 24px", display: "flex", gap: 20 }}>
        <div style={{ width: listW, opacity: listEnter, transform: `translateY(${(1 - listEnter) * 14}px)` }}>
          <AnimatedListView frame={frame} />
        </div>
        <div style={{ width: calW, opacity: calEnter, transform: `translateY(${(1 - calEnter) * 14}px)` }}>
          <AnimatedCalendarView frame={frame} />
        </div>
      </div>
    </AbsoluteFill>
  );
}

// ══════════════════════════════════════════════════════════════════════
// DASHBOARD SUMMARY (Scene 6)
// ══════════════════════════════════════════════════════════════════════

const TILE_TONE: Record<string, { value: string; icon: string }> = {
  ink: { value: C.text, icon: C.textMuted },
  success: { value: C.success, icon: C.success },
  review: { value: "#2f8f68", icon: "#2f8f68" },
  danger: { value: C.danger, icon: C.danger },
  warning: { value: C.warning, icon: C.warning },
};

function AnimatedDashboardSummary() {
  const frame = useCurrentFrame();
  const headEnter = ramp(frame, [0, 20], [0, 1], EASE_OUT);
  return (
    <AbsoluteFill>
      <AnimatedFlowLine d={`M ${PAD + 40} 320 C ${CONTENT.w * 0.4} 250, ${CONTENT.w * 0.6} 250, ${CONTENT.w - PAD - 60} 320`} k={ramp(frame, [120, 200], [0, 1], EASE)} dashed />
      <div style={{ position: "absolute", inset: 0, padding: "24px 26px" }}>
        <div style={{ opacity: headEnter, transform: `translateY(${(1 - headEnter) * 10}px)` }}>
          <div style={{ fontFamily: F, fontSize: 24, fontWeight: 700, color: C.text, letterSpacing: -0.4 }}>{dashboard.title}</div>
          <div style={{ fontFamily: F, fontSize: 14.5, color: C.textMuted, marginTop: 4 }}>{dashboard.subtitle}</div>
        </div>

        {/* stat tiles — numbers count up */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginTop: 22 }}>
          {dashboard.tiles.map((tile, i) => {
            const enter = ramp(frame, [24 + i * 10, 58 + i * 10], [0, 1], EASE_OUT);
            const tone = TILE_TONE[tile.tone] ?? TILE_TONE.ink;
            const val = countUp(frame, tile.value, 30 + i * 8, 46);
            const isRisk = tile.tone === "danger" || tile.tone === "review";
            const hi = isRisk ? ramp(frame, [130, 160, 250, 280], [0, 1, 1, 0]) : 0;
            return (
              <div key={tile.label} style={{ background: "#fff", border: `1px solid ${hi > 0.3 ? C.primaryRing : C.border}`, borderRadius: 14, padding: "18px 20px", boxShadow: hi > 0.3 ? `${SH.card}, 0 0 0 ${4 * hi}px rgba(47,95,224,${0.1 * hi})` : SH.card, opacity: enter, transform: `translateY(${(1 - enter) * 14}px)` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: F, fontSize: 13.5, fontWeight: 600, color: C.textMuted }}>
                  <Glyph name={(tile.icon === "check" ? "check" : tile.icon === "alert" ? "flag" : tile.icon === "clock" ? "calendarSm" : "board") as GlyphName} size={16} color={tone.icon} />
                  {tile.label}
                </div>
                <div style={{ fontFamily: F, fontSize: 40, fontWeight: 750, color: tone.value, letterSpacing: -1, marginTop: 8, lineHeight: 1 }}>{val}</div>
              </div>
            );
          })}
        </div>

        {/* focus panel */}
        {(() => {
          const enter = ramp(frame, [80, 112], [0, 1], EASE_OUT);
          return (
            <div style={{ marginTop: 22, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 16, padding: "20px 22px", boxShadow: SH.card, opacity: enter, transform: `translateY(${(1 - enter) * 16}px)` }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9, fontFamily: F, fontSize: 17, fontWeight: 700, color: C.text }}>
                  <Glyph name="calendarSm" size={18} color={C.textMuted} /> {dashboard.focusTitle}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ fontFamily: F, fontSize: 12.5, fontWeight: 600, color: C.textMuted, border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 12px" }}>Takvim →</div>
                  <div style={{ fontFamily: F, fontSize: 12.5, fontWeight: 600, color: C.danger, border: `1px solid #f0d3cd`, borderRadius: 8, padding: "6px 12px" }}>Gecikenleri gör →</div>
                  <div style={{ fontFamily: F, fontSize: 12.5, fontWeight: 600, color: C.success, border: `1px solid #c3e6d3`, borderRadius: 8, padding: "6px 12px" }}>Onay bekleyenler →</div>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
                {dashboard.focus.map((f, i) => {
                  const enter2 = ramp(frame, [110 + i * 10, 140 + i * 10], [0, 1], EASE_OUT);
                  const tone = TILE_TONE[f.tone] ?? TILE_TONE.ink;
                  return (
                    <div key={f.label} style={{ background: C.surfaceMuted, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px", opacity: enter2, transform: `translateY(${(1 - enter2) * 10}px)` }}>
                      <div style={{ fontFamily: F, fontSize: 13, color: C.textMuted, fontWeight: 500 }}>{f.label}</div>
                      <div style={{ fontFamily: F, fontSize: 28, fontWeight: 750, color: tone.value, letterSpacing: -0.5, marginTop: 6, lineHeight: 1 }}>{f.value}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
      </div>
    </AbsoluteFill>
  );
}

// ══════════════════════════════════════════════════════════════════════
// BRAND SCENES: intro / problem / CTA
// ══════════════════════════════════════════════════════════════════════

// Subtle operational grid + workflow lines used behind brand scenes.
function OperationalBackdrop({ k = 1 }: { k?: number }) {
  return (
    <AbsoluteFill style={{ opacity: k }}>
      <svg width="100%" height="100%" style={{ position: "absolute", inset: 0 }}>
        <defs>
          <pattern id="grid" width={64} height={64} patternUnits="userSpaceOnUse">
            <path d="M64 0H0V64" fill="none" stroke="#e9edf2" strokeWidth={1} />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" opacity={0.6} />
      </svg>
      <AbsoluteFill style={{ background: `radial-gradient(52% 44% at 50% 32%, ${C.brandSoft}, transparent 70%)` }} />
    </AbsoluteFill>
  );
}

// A soft silhouette of the product shell forming in the background.
function ShellSilhouette({ k }: { k: number }) {
  return (
    <div style={{ position: "absolute", left: S.x + 60, top: S.y + 60, width: S.width - 120, height: S.height - 120, borderRadius: 20, border: `1px solid ${C.border}`, background: "rgba(255,255,255,0.5)", boxShadow: "0 40px 90px -50px rgba(20,28,40,0.25)", opacity: 0.5 * k, transform: `translateY(${(1 - k) * 24}px) scale(${0.98 + 0.02 * k})` }}>
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 190, borderRight: `1px solid ${C.border}`, background: "rgba(249,250,251,0.7)" }} />
      <div style={{ position: "absolute", left: 190, right: 0, top: 0, height: 52, borderBottom: `1px solid ${C.border}` }} />
    </div>
  );
}

// Small drawn UI fragments (task-card silhouettes) that assemble around the
// shell during the intro — gives the opening a staged motion-design build
// instead of a flat logo fade.
const INTRO_FRAGMENTS: { x: number; y: number; w: number; delay: number; dot: string }[] = [
  { x: 260, y: 300, w: 250, delay: 34, dot: "#df7314" },
  { x: 1440, y: 270, w: 230, delay: 44, dot: "#2563c9" },
  { x: 210, y: 660, w: 235, delay: 54, dot: "#7257b5" },
  { x: 1470, y: 640, w: 255, delay: 64, dot: "#2c8a61" },
];

function IntroFragment({ x, y, w, delay, dot }: { x: number; y: number; w: number; delay: number; dot: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 200, mass: 0.8 } });
  const drift = interpolate(frame, [delay, delay + 120], [0, -10], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  if (frame < delay) return null;
  return (
    <div style={{ position: "absolute", left: x, top: y + (1 - s) * 30 + drift, width: w, opacity: s * 0.9, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: SH.pop, padding: "13px 15px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 9 }}>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: dot }} />
        <span style={{ height: 8, width: w * 0.38, borderRadius: 4, background: C.surfaceSunken }} />
      </div>
      <div style={{ height: 9, width: w * 0.72, borderRadius: 4, background: C.surfaceSunken, marginBottom: 7 }} />
      <div style={{ height: 9, width: w * 0.5, borderRadius: 4, background: C.hairline }} />
    </div>
  );
}

function SceneIntro() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fade = ramp(frame, [0, 14], [0, 1]);
  const grid = ramp(frame, [0, 40], [0, 1]);
  const silK = ramp(frame, [26, 86], [0, 1], EASE_OUT);
  // Staged build: kicker chip → wordmark (spring scale) → headline → underline.
  const kicker = useEnter(12, 14);
  const markS = spring({ frame: frame - 24, fps, config: { damping: 200, mass: 0.9 } });
  const line = useEnter(52, 22);
  const rule = ramp(frame, [78, 112], [0, 1], EASE);
  // Gentle camera settle across the whole scene.
  const settle = ramp(frame, [0, 150], [1.035, 1], EASE_OUT);
  return (
    <AbsoluteFill style={{ background: C.appBg, opacity: fade }}>
      <AbsoluteFill style={{ transform: `scale(${settle})` }}>
        <OperationalBackdrop k={grid} />
        <ShellSilhouette k={silK} />
        {INTRO_FRAGMENTS.map((f) => (
          <IntroFragment key={f.delay} {...f} />
        ))}
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 30 }}>
          <div style={{ ...kicker, display: "flex", alignItems: "center", gap: 9, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 999, padding: "9px 20px", boxShadow: SH.card }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: C.primary }} />
            <span style={{ fontFamily: F, fontSize: 19, fontWeight: 600, color: C.textMuted, letterSpacing: 0.2 }}>Kurulum destekli operasyon paneli</span>
          </div>
          <div style={{ opacity: markS, transform: `scale(${0.92 + 0.08 * markS})` }}>
            <Img src={WORDMARK()} style={{ height: 96, width: 96 * WORDMARK_RATIO, objectFit: "contain" }} />
          </div>
          <div style={{ ...line, maxWidth: 1180, textAlign: "center", fontFamily: F, fontSize: 46, fontWeight: 650, lineHeight: 1.22, color: C.text, letterSpacing: -0.6 }}>{intro.headline}</div>
          <div style={{ width: 220 * rule, height: 3, borderRadius: 999, background: C.primary, opacity: 0.85 }} />
        </AbsoluteFill>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

const PROBLEM_ORIGINS: { x: number; y: number }[] = [
  { x: -420, y: -180 },
  { x: 460, y: -220 },
  { x: -520, y: 120 },
  { x: 500, y: 160 },
  { x: 0, y: 300 },
];

// Organized rows that appear inside the target panel once the scattered
// fragments converge — chaos visibly becomes a sahipli, tarihli, onaylı list.
const PROBLEM_RESOLVED: { title: string; owner: string; due: string }[] = [
  { title: "Web sitesi banner güncellemesi", owner: "DT", due: "7 Tem" },
  { title: "Kreatif onayı", owner: "EK", due: "7 Tem" },
  { title: "Numune revizyon takibi", owner: "ZD", due: "8 Tem" },
];

function SceneProblem() {
  const frame = useCurrentFrame();
  const head = useEnter(4, 14);
  // Chips drift in from the edges (0–80), hold briefly, then converge into the
  // panel (95–150) so the resolved rows land well before the scene fade-out.
  const converge = ramp(frame, [95, 150], [0, 1], EASE);
  const panelK = ramp(frame, [110, 155], [0, 1], EASE_OUT);
  const resolvedHead = ramp(frame, [135, 158], [0, 1], EASE_OUT);
  return (
    <AbsoluteFill style={{ background: C.appBg }}>
      <OperationalBackdrop k={0.7} />
      <div style={{ position: "absolute", top: 130, left: 0, right: 0, textAlign: "center", ...head }}>
        <div style={{ fontFamily: F, fontSize: 30, fontWeight: 650, color: C.text, letterSpacing: -0.4 }}>Dağınık takip, operasyonun görünürlüğünü azaltır</div>
        <div style={{ marginTop: 10, fontFamily: F, fontSize: 20, fontWeight: 500, color: C.textMuted }}>WhatsApp mesajları, Excel satırları ve sözlü onaylar tek sistemde toplanır</div>
      </div>

      {/* target panel that the fragments connect into */}
      <div style={{ position: "absolute", left: "50%", top: "56%", transform: "translate(-50%,-50%)", width: 640, height: 330, borderRadius: 18, border: `1px solid ${C.border}`, background: "#fff", boxShadow: SH.frame, opacity: panelK }}>
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 130, borderRight: `1px solid ${C.border}`, background: C.surfaceMuted, borderRadius: "18px 0 0 18px", padding: "16px 0 0 16px" }}>
          <Img src={ICON()} style={{ width: 26, height: 26, borderRadius: 7, objectFit: "contain" }} />
        </div>
        <div style={{ position: "absolute", left: 130, right: 0, top: 0, height: 48, borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", padding: "0 20px", opacity: resolvedHead }}>
          <span style={{ fontFamily: F, fontSize: 15, fontWeight: 700, color: C.text }}>Pano</span>
          <span style={{ marginLeft: "auto", fontFamily: F, fontSize: 12.5, fontWeight: 600, color: C.success }}>Sahipli · tarihli · onaylı</span>
        </div>
        <div style={{ position: "absolute", left: 154, top: 68, right: 22, display: "flex", flexDirection: "column", gap: 11 }}>
          {PROBLEM_RESOLVED.map((row, r) => {
            const rowK = ramp(frame, [148 + r * 12, 170 + r * 12], [0, 1], EASE_OUT);
            return (
              <div key={row.title} style={{ display: "flex", alignItems: "center", gap: 11, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 13px", opacity: rowK, transform: `translateY(${(1 - rowK) * 8}px)` }}>
                <span style={{ width: 18, height: 18, borderRadius: 999, background: "#e7f6ee", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Glyph name="check" size={11} color={C.success} strokeWidth={2.4} />
                </span>
                <span style={{ fontFamily: F, fontSize: 14.5, fontWeight: 600, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{row.title}</span>
                <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  <span style={{ fontFamily: F, fontSize: 12.5, fontWeight: 600, color: C.textMuted }}>{row.due}</span>
                  <Avatar id={row.owner} size={22} />
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* scattered fragments */}
      {problems.map((p, i) => {
        const o = PROBLEM_ORIGINS[i];
        const appear = ramp(frame, [10 + i * 12, 44 + i * 12], [0, 1], EASE_OUT);
        const wobble = Math.sin((frame + i * 31) / 26) * 4 * (1 - converge);
        // From origin offset → 0 as they converge.
        const dx = o.x * (1 - converge);
        const dy = o.y * (1 - converge) + wobble;
        const scale = 1 - 0.3 * converge;
        const opacity = appear * (1 - converge);
        return (
          <div key={p.title} style={{ position: "absolute", left: "50%", top: "56%", transform: `translate(-50%,-50%) translate(${dx}px, ${dy}px) scale(${scale}) rotate(${(i % 2 === 0 ? -2.5 : 2) * (1 - converge)}deg)`, opacity }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#fff", border: `1px solid ${C.border}`, borderLeft: `3px solid ${C.danger}`, borderRadius: 12, boxShadow: SH.pop, padding: "13px 18px", fontFamily: F, fontSize: 19, fontWeight: 600, color: C.text }}>
              <span style={{ width: 9, height: 9, borderRadius: 999, background: C.danger }} /> {p.title}
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
}

function SceneCTA() {
  const frame = useCurrentFrame();
  const kicker = useEnter(4, 12);
  const mark = useEnter(12, 18);
  const line = useEnter(24, 18);
  const btn = useEnter(38, 16);
  const small = useEnter(50, 12);
  const fade = ramp(frame, [0, 16], [0, 1]);
  const silK = ramp(frame, [0, 50], [0, 1], EASE_OUT);
  const settle = ramp(frame, [0, 130], [1.03, 1], EASE_OUT);
  // One restrained emphasis pulse on the CTA button (no loops, no neon).
  const pulse = 1 + 0.02 * Math.max(0, Math.sin(Math.min(Math.max(frame - 80, 0), 30) * (Math.PI / 30)));
  return (
    <AbsoluteFill style={{ background: C.appBg, opacity: fade }}>
      <AbsoluteFill style={{ transform: `scale(${settle})` }}>
        <OperationalBackdrop k={0.6} />
        <ShellSilhouette k={silK * 0.7} />
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 26 }}>
          <div style={{ ...kicker, display: "flex", alignItems: "center", gap: 8, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 999, padding: "8px 18px", boxShadow: SH.card }}>
            <span style={{ width: 7, height: 7, borderRadius: 999, background: C.primary }} />
            <span style={{ fontFamily: F, fontSize: 17, fontWeight: 600, color: C.textMuted }}>Kurulum destekli operasyon paneli</span>
          </div>
          <div style={mark}><Img src={WORDMARK()} style={{ height: 68, width: 68 * WORDMARK_RATIO, objectFit: "contain" }} /></div>
          <div style={{ ...line, maxWidth: 1080, textAlign: "center", fontFamily: F, fontSize: 40, fontWeight: 650, lineHeight: 1.25, color: C.text, letterSpacing: -0.5 }}>{cta.headline}</div>
          <div style={{ ...btn, marginTop: 6, transform: `${btn.transform} scale(${pulse})`, background: C.primary, color: "#fff", fontFamily: F, fontSize: 24, fontWeight: 650, padding: "17px 36px", borderRadius: 13, boxShadow: "0 18px 38px -16px rgba(47,95,224,0.62)" }}>{cta.button}</div>
          <div style={{ ...small, fontFamily: F, fontSize: 19, color: C.textMuted }}>{cta.small}</div>
        </AbsoluteFill>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

// ══════════════════════════════════════════════════════════════════════
// CAPTIONS
// ══════════════════════════════════════════════════════════════════════

function CaptionCard({ text, duration }: { text: string; duration: number }) {
  const frame = useCurrentFrame();
  const opacity = ramp(frame, [0, 12, duration - 14, duration], [0, 1, 1, 0]);
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", pointerEvents: "none" }}>
      <div style={{ opacity, marginBottom: 160, maxWidth: 900, textAlign: "center", background: "rgba(255,255,255,0.94)", border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: SH.pop, backdropFilter: "blur(6px)", padding: "13px 26px", fontFamily: F, fontSize: 26, fontWeight: 500, lineHeight: 1.34, color: C.text }}>{text}</div>
    </AbsoluteFill>
  );
}

// Captions accompany the PRODUCT scenes only — the intro / problem / CTA carry
// their own large on-screen headline, so a bottom caption there would double
// the text.
const PRODUCT_CAPTION_FROMS = new Set<number>([SCENES.board.from, SCENES.task.from, SCENES.listCalendar.from, SCENES.weekly.from]);

function Captions() {
  return (
    <>
      {captions.filter((c) => PRODUCT_CAPTION_FROMS.has(c.from)).map((c) => (
        <Sequence key={c.from} from={c.from} durationInFrames={c.duration}>
          <CaptionCard text={c.text} duration={c.duration} />
        </Sequence>
      ))}
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════
// SCENE WRAPPER (cross-fade)
// ══════════════════════════════════════════════════════════════════════

function FadeScene({ from, durationInFrames, children }: { from: number; durationInFrames: number; children: React.ReactNode }) {
  return (
    <Sequence from={from} durationInFrames={durationInFrames}>
      <SceneFader durationInFrames={durationInFrames}>{children}</SceneFader>
    </Sequence>
  );
}
function SceneFader({ durationInFrames, children }: { durationInFrames: number; children: React.ReactNode }) {
  const frame = useCurrentFrame();
  const opacity = ramp(frame, [0, 14, durationInFrames - 14, durationInFrames], [0, 1, 1, 0]);
  // A hair of scale with the cross-fade so cuts feel like camera moves, not
  // slideshow flips. Kept ≤1% so product UI never looks like it is zooming.
  const scale = ramp(frame, [0, 14, durationInFrames - 14, durationInFrames], [1.008, 1, 1, 0.996], EASE);
  return <AbsoluteFill style={{ opacity, transform: `scale(${scale})` }}>{children}</AbsoluteFill>;
}

// ══════════════════════════════════════════════════════════════════════
// AUDIO
// ══════════════════════════════════════════════════════════════════════

function VoiceOver() {
  // Mounted only when the render script confirmed an APPROVED voice file
  // exists — never the rejected generated master.
  return <Audio src={staticFile(approvedVoiceover)} />;
}

function BackgroundMusic({ ext }: { ext: "mp3" | "wav" }) {
  const { durationInFrames } = useVideoConfig();
  return (
    <Audio
      src={staticFile(approvedMusic[ext])}
      volume={(f) => {
        const fadeIn = interpolate(f, [0, 60], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        const fadeOut = interpolate(f, [durationInFrames - 90, durationInFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        return 0.06 * fadeIn * fadeOut; // ~ -26 dB under the narration
      }}
    />
  );
}

// ══════════════════════════════════════════════════════════════════════
// COMPOSITION
// ══════════════════════════════════════════════════════════════════════

export const LospiaDemo: React.FC<LospiaDemoProps> = ({ audio = false, musicExt = null }) => {
  return (
    <AbsoluteFill style={{ background: C.appBg }}>
      <FadeScene from={SCENES.intro.from} durationInFrames={SCENES.intro.duration}>
        <SceneIntro />
      </FadeScene>

      <FadeScene from={SCENES.problem.from} durationInFrames={SCENES.problem.duration}>
        <SceneProblem />
      </FadeScene>

      <FadeScene from={SCENES.board.from} durationInFrames={SCENES.board.duration}>
        <AnimatedLospiaAppShell page="Pano" active="board">
          <AnimatedBoard />
        </AnimatedLospiaAppShell>
      </FadeScene>

      <FadeScene from={SCENES.task.from} durationInFrames={SCENES.task.duration}>
        <AnimatedLospiaAppShell page="Görev" active="board">
          <AnimatedTaskDetailPanel />
        </AnimatedLospiaAppShell>
      </FadeScene>

      <FadeScene from={SCENES.listCalendar.from} durationInFrames={SCENES.listCalendar.duration}>
        <AnimatedLospiaAppShell page="Liste ve Takvim" active="list">
          <AnimatedListCalendar />
        </AnimatedLospiaAppShell>
      </FadeScene>

      <FadeScene from={SCENES.weekly.from} durationInFrames={SCENES.weekly.duration}>
        <AnimatedLospiaAppShell page="Gösterge Paneli" active="dashboard">
          <AnimatedDashboardSummary />
        </AnimatedLospiaAppShell>
      </FadeScene>

      <FadeScene from={SCENES.cta.from} durationInFrames={SCENES.cta.duration}>
        <SceneCTA />
      </FadeScene>

      <Captions />
      {audio ? <VoiceOver /> : null}
      {musicExt ? <BackgroundMusic ext={musicExt} /> : null}
    </AbsoluteFill>
  );
};
