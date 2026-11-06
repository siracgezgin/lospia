/**
 * Föyün "Toplantı notları" sekmesi (20240367) — Order Review'un föye taşınan
 * hâli. Karar listesi Order Review'la aynı (lib/order-review/model).
 */

/** Numune fotoğraflarının klasörü — föyün kendi klasörü. */
export const sheetNotesPrefix = (workspaceId: string, sheetId: string) =>
  `${workspaceId}/toplanti/${sheetId}/`;
