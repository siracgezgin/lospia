import type { WorkspaceRole } from "@/types";

// User-facing role labels. The "owner" is the system administrator (Sıraç) and is
// NEVER shown as "Sahip"; it surfaces as "Sistem Admini". "admin" = Yönetici,
// "member" = Üye. "viewer" stays internal (İzleyici) but is not offered in pickers.
export const ROLE_LABELS: Record<WorkspaceRole, string> = {
  owner: "Sistem Admini",
  admin: "Yönetici",
  member: "Üye",
  viewer: "İzleyici",
};

export function roleLabel(role: string): string {
  return (ROLE_LABELS as Record<string, string>)[role] ?? role;
}

/**
 * KİŞİNİN ALTINDA NE YAZAR?
 *
 * Sıraç (2026-08-29): "'Sistem Admini', 'Yönetici' veya üye olduğunu SADECE
 * ADMİN görmeli. Diğer türlü kişiler ünvanlarını yazıp artık o şekilde
 * görünebilirler."
 *
 * Rol bir YETKİ bilgisidir, kimlik değil. Ekranda herkese "Üye" yazmak hem
 * hiyerarşiyi sürekli yüzlerine vuruyor hem de kişinin ne iş yaptığını
 * söylemiyordu — Aslı Hanım (2026-08-28) zaten bunu istemişti: "Bana da
 * tasarımcı yazarsan; ben yönetici olmak istemiyorum çünkü."
 *
 * Kural:
 *   • Ünvan yazılmışsa HER ZAMAN o görünür (kimin baktığından bağımsız).
 *   • Ünvan yoksa rol YALNIZ yöneticiye görünür.
 *   • Ünvan yoksa ve bakan kişi yönetici değilse hiçbir şey yazılmaz —
 *     uydurma bir etiket ("Ekip") kimseyi tanıtmıyor.
 */
export function personTitle(opts: {
  jobTitle?: string | null;
  role?: string | null;
  /** BAKAN kişi yönetici mi? Hedef kişi değil. */
  viewerIsAdmin: boolean;
}): string | null {
  const title = (opts.jobTitle ?? "").trim();
  if (title) return title;
  if (!opts.viewerIsAdmin) return null;
  return opts.role ? roleLabel(opts.role) : null;
}

// Roles selectable in member / invite dropdowns. Only Yönetici and Üye are
// exposed — owner is system-only and viewer is hidden (kept for internal use).
export const ASSIGNABLE_ROLE_OPTIONS: { value: "admin" | "member"; label: string }[] = [
  { value: "admin", label: "Yönetici" },
  { value: "member", label: "Üye" },
];
