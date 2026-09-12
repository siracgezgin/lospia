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

/**
 * Serbest metin "Kim" alanı BU KİŞİYİ mi işaret ediyor?
 *
 * Ekip katılımcıyı iki ayrı yoldan giriyor: ya yapısal alanlar
 * (`participant_ids` / `collaborator_ids`), ya da Aslı'nın takvimindeki gibi
 * serbest metin ("Meral, SE"). Ana Sayfa "bu toplantı benim mi?" diye
 * sorarken İKİSİNE de bakmak zorunda — yalnız yapısal alana bakmak, kişileri
 * kısaltmayla yazan toplantıları herkesin gözünden düşürürdü.
 *
 * Eşleşme kuralı `unresolvedKim` ile AYNI: tam ad, baş harfler ya da adın ilk
 * kelimesi. Tek yerde tanımlı olsun ki iki ekran aynı kişiyi farklı
 * çözmesin.
 */
export function kimMatches(kim: string | null | undefined, name: string | null | undefined): boolean {
  const who = (name ?? "").trim();
  if (!who) return false;
  const tokens = (kim ?? "").split(",").map((t) => t.trim()).filter(Boolean);
  if (!tokens.length) return false;
  const ini = initialsOf(who);
  return tokens.some(
    (tok) =>
      lower(who) === lower(tok) ||
      ini === tok.toLocaleUpperCase("tr-TR") ||
      lower(who).startsWith(lower(tok) + " "),
  );
}
