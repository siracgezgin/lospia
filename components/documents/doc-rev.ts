/**
 * YAZI GÖVDESİNİN PARMAK İZİ — "ben açtıktan sonra başkası değiştirdi mi?"
 *
 * Yazı tek parça HTML olarak kaydedilir. İki kişi aynı yazıyı açıp yazarsa
 * SON KAYDEDEN ötekinin paragraflarını sessizce siliyordu (17.11.2026
 * denetimi). Kayıt, ekranın bildiği son SUNUCU gövdesinin parmak izini taşır;
 * sunucudaki farklıysa yazılmaz, kullanıcıya sorulur (tablodaki düzenin
 * aynısı — orada sayaç sütunu var, burada sütun gerekmedi).
 *
 * Güvenlik için değil eşitlik için: cyrb53 + uzunluk. Sunucu (kayıt eylemi)
 * ve tarayıcı (editör) AYNI işlevi kullanır.
 */
export function bodyRev(body: string | null | undefined): string {
  const text = body ?? "";
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `${text.length}:${(4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)}`;
}
