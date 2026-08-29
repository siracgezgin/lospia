/**
 * ZIP YAZICI — sıfır bağımlılık, akış hâlinde.
 *
 * Sıraç (2026-08-29): "Drive'daki bütün dosyaları buraya alacağız, o yüzden
 * silinme ve kayıp riskinin olmaması gerekiyor… haftada bir bu yedeği alıp
 * indirmemiz gerekiyor, sistemde olan şeyler yanımızda kaybolmasın."
 *
 * Yedek TEK dosya olarak inmeli (klasör klasör indirilen bir yedek alınmaz),
 * bu yüzden bir arşiv formatı gerekiyordu. Yeni bir paket kurmak yerine ZIP'in
 * kendisi yazıldı: biçim küçük ve kararlı, sıkıştırmayı Node'un zlib'i yapıyor.
 * Böylece yedek özelliği hiçbir üçüncü parti kodun devamlılığına bağlı değil.
 *
 * Akış (ReadableStream) tercih edildi: dosyalı yedek yüzlerce MB olabilir ve
 * hepsini belleğe alan bir uç nokta ilk büyük yedekte çökerdi. Girdiler
 * geldikçe sıkıştırılıp gönderilir; bellekte yalnız merkezi dizin birikir
 * (dosya başına ~100 bayt).
 *
 * Sınır: ZIP64 YAZILMAZ. 4 GB'ı aşan bir arşiv ya da girdi bu yazıcıyla
 * üretilemez; çağıran taraf boyutu sınırlar (bkz. app/api/backup/route.ts).
 */

import { deflateRawSync } from "node:zlib";

export interface ZipEntry {
  /** Arşiv içindeki yol — "veri/tasks.json" gibi. */
  name: string;
  data: Uint8Array;
  /** Sıkıştırma atlanır (zaten sıkışık: jpg/png/pdf/zip). */
  store?: boolean;
}

/** CRC-32 (IEEE 802.3) — ZIP her girdi için bunu ister. */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** MS-DOS tarih/saat çifti — ZIP başlığının beklediği eski biçim. */
function dosDateTime(d: Date): { time: number; date: number } {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (Math.floor(d.getSeconds() / 2) & 0x1f),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

/** Sıkışık olduğu bilinen uzantılar — ikinci kez sıkıştırmak yalnız CPU yakar. */
export function isPrecompressed(name: string): boolean {
  return /\.(jpe?g|png|gif|webp|avif|heic|pdf|zip|gz|mp4|mov|webm|mp3|m4a|docx|xlsx|pptx)$/i.test(name);
}

interface CentralRecord {
  name: Uint8Array;
  crc: number;
  csize: number;
  usize: number;
  offset: number;
  method: number;
  time: number;
  date: number;
}

/**
 * Girdileri sırayla ZIP akışına çevirir.
 * Girdi üreteci tembeldir: dosyalar ancak sıraları geldiğinde indirilir.
 */
export function createZipStream(entries: AsyncIterable<ZipEntry>): ReadableStream<Uint8Array> {
  const central: CentralRecord[] = [];
  let offset = 0;
  const iterator = entries[Symbol.asyncIterator]();

  const encoder = new TextEncoder();

  function push(controller: ReadableStreamDefaultController<Uint8Array>, chunk: Uint8Array) {
    controller.enqueue(chunk);
    offset += chunk.length;
  }

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const next = await iterator.next();

      if (!next.done) {
        const entry = next.value;
        const name = encoder.encode(entry.name);
        const raw = entry.data;
        const store = entry.store ?? isPrecompressed(entry.name);
        const body = store ? raw : new Uint8Array(deflateRawSync(raw, { level: 6 }));
        const method = store ? 0 : 8;
        const { time, date } = dosDateTime(new Date());
        const crc = crc32(raw);

        const header = new DataView(new ArrayBuffer(30));
        header.setUint32(0, 0x04034b50, true); // local file header
        header.setUint16(4, 20, true);         // gereken sürüm: 2.0
        header.setUint16(6, 0x0800, true);     // bit 11: ad UTF-8
        header.setUint16(8, method, true);
        header.setUint16(10, time, true);
        header.setUint16(12, date, true);
        header.setUint32(14, crc, true);
        header.setUint32(18, body.length, true);
        header.setUint32(22, raw.length, true);
        header.setUint16(26, name.length, true);
        header.setUint16(28, 0, true);         // extra alanı yok

        central.push({ name, crc, csize: body.length, usize: raw.length, offset, method, time, date });

        push(controller, new Uint8Array(header.buffer));
        push(controller, name);
        push(controller, body);
        return;
      }

      // Girdiler bitti → merkezi dizin + son kayıt.
      const dirStart = offset;
      for (const r of central) {
        const h = new DataView(new ArrayBuffer(46));
        h.setUint32(0, 0x02014b50, true);  // central directory header
        h.setUint16(4, 20, true);          // yazan sürüm
        h.setUint16(6, 20, true);          // gereken sürüm
        h.setUint16(8, 0x0800, true);
        h.setUint16(10, r.method, true);
        h.setUint16(12, r.time, true);
        h.setUint16(14, r.date, true);
        h.setUint32(16, r.crc, true);
        h.setUint32(20, r.csize, true);
        h.setUint32(24, r.usize, true);
        h.setUint16(28, r.name.length, true);
        h.setUint16(30, 0, true);          // extra
        h.setUint16(32, 0, true);          // yorum
        h.setUint16(34, 0, true);          // disk no
        h.setUint16(36, 0, true);          // iç öznitelik
        h.setUint32(38, 0, true);          // dış öznitelik
        h.setUint32(42, r.offset, true);
        push(controller, new Uint8Array(h.buffer));
        push(controller, r.name);
      }
      const dirSize = offset - dirStart;

      const end = new DataView(new ArrayBuffer(22));
      end.setUint32(0, 0x06054b50, true);  // end of central directory
      end.setUint16(4, 0, true);
      end.setUint16(6, 0, true);
      end.setUint16(8, central.length, true);
      end.setUint16(10, central.length, true);
      end.setUint32(12, dirSize, true);
      end.setUint32(16, dirStart, true);
      end.setUint16(20, 0, true);
      push(controller, new Uint8Array(end.buffer));

      controller.close();
    },
  });
}

/** Metin girdisi kısayolu (JSON, CSV, OKUBENI). */
export function textEntry(name: string, text: string): ZipEntry {
  return { name, data: new TextEncoder().encode(text) };
}
