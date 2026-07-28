// İsim → baş harfler (Selen Erdem → "SE"). Tek kelime → ilk iki harf.
export function initialsOf(name?: string | null): string {
  const n = (name ?? "").trim();
  if (!n) return "?";
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toLocaleUpperCase("tr-TR");
  return (parts[0][0] + parts[parts.length - 1][0]).toLocaleUpperCase("tr-TR");
}

const lower = (s: string) => s.trim().toLocaleLowerCase("tr-TR");

/**
 * Ham "Kim" metnindeki (Aslı'nın takvimi: "Meral, SE") isimlerden sistem
 * üyesine ÇÖZÜLMEMİŞ olanları döner — Meral, Hakan Usta gibi sistemde
 * kullanıcısı olmayan kişiler ekranda kaybolmasın diye.
 */
export function unresolvedKim(kim: string | null | undefined, resolvedNames: string[]): string[] {
  const tokens = (kim ?? "").split(",").map((t) => t.trim()).filter(Boolean);
  if (!tokens.length) return [];
  return tokens.filter(
    (tok) =>
      !resolvedNames.some(
        (name) =>
          lower(name) === lower(tok) ||
          initialsOf(name) === tok.toLocaleUpperCase("tr-TR") ||
          lower(name).startsWith(lower(tok) + " "),
      ),
  );
}
