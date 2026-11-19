/**
 * PANODAN IZGARA — Excel / Google Sheets kopyası.
 *
 * Pano metni sekmeyle ayrılır, satır sonuyla satırlara bölünür. İçinde SATIR
 * SONU (Alt+Enter ile yazılmış çok satırlı hücre), sekme ya da çift tırnak
 * olan hücre "çift tırnak" içinde gelir; içteki tırnak ikilenir ("").
 *
 * Eski yapıştırma metni düz `\n` ile bölüyordu: çok satırlı tek bir hücre
 * (ör. "Açıklama" sütunundaki üç maddelik not) üç ayrı SATIRA dağılıyor,
 * altındaki bütün satırlar kayıyordu — "Excel'den yapıştırınca bozuluyor".
 *
 * Tırnakla BAŞLAYAN ama Excel alıntısı olmayan düz metin ("merhaba" dedi)
 * olduğu gibi kalır: alıntı sayılması için kapanan tırnağın hemen ardından
 * sekme, satır sonu ya da metnin sonu gelmelidir.
 */
export function parseClipboardGrid(raw: string): string[][] {
  const text = raw.replace(/\r\n?/g, "\n");
  const rows: string[][] = [];
  let row: string[] = [];
  let i = 0;
  const n = text.length;

  /** `start` bir tırnaksa ve alıntı düzgün kapanıyorsa kapanış konumu; değilse -1. */
  const quotedEnd = (start: number): number => {
    for (let j = start + 1; j < n; j++) {
      if (text[j] !== '"') continue;
      if (text[j + 1] === '"') { j++; continue; }
      const next = text[j + 1];
      return next === undefined || next === "\t" || next === "\n" ? j : -1;
    }
    return -1;
  };

  for (;;) {
    let cell: string;
    const end = text[i] === '"' ? quotedEnd(i) : -1;
    if (end >= 0) {
      cell = text.slice(i + 1, end).replace(/""/g, '"');
      i = end + 1;
    } else {
      let j = i;
      while (j < n && text[j] !== "\t" && text[j] !== "\n") j++;
      cell = text.slice(i, j);
      i = j;
    }
    row.push(cell);
    if (i >= n) { rows.push(row); break; }
    if (text[i] === "\n") { rows.push(row); row = []; }
    i++; // sekme ya da satır sonu
    if (i >= n) { if (text[n - 1] === "\t") { row.push(""); rows.push(row); } break; }
  }
  /* Excel kopyanın sonuna bir satır sonu ekler — boş son satır atılır. */
  while (rows.length && rows[rows.length - 1].every((c) => c === "") && rows[rows.length - 1].length <= 1) rows.pop();
  return rows;
}
