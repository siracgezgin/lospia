export function normalizeTags(input: string | string[] | null | undefined): string[] {
  const raw = Array.isArray(input)
    ? input
    : typeof input === "string"
    ? input.split(",")
    : [];

  const seen = new Set<string>();
  const result: string[] = [];

  for (const t of raw) {
    const trimmed = t.trim();
    if (!trimmed) continue;
    const lower = trimmed.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    result.push(trimmed);
    if (result.length >= 10) break;
  }

  return result;
}
