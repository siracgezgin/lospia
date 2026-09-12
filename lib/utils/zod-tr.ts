import { z } from "zod";

/**
 * ZOD'UN HATA MESAJLARI TÜRKÇE — tek yerden.
 *
 * Uygulamanın tamamı Türkçe ama doğrulama hataları İngilizce sızıyordu:
 * kullanıcı bir e-posta alanını yanlış doldurduğunda "Invalid email address",
 * bir kimlik bozuksa "Invalid UUID", bir liste uzunsa "Too big: expected array
 * to have <=20 items" görüyordu. Sunucu aksiyonları hatayı
 * `error.issues[0].message` ile olduğu gibi ekrana veriyor.
 *
 * 143 doğrulama noktasının her birine elle Türkçe mesaj yazmak hem büyük bir
 * değişiklik olurdu hem de YARIN yazılan kodu kapsamazdı. Zod 4 kendi Türkçe
 * yerelini getiriyor; tek çağrı bütün kütüphaneyi çeviriyor ve bundan sonra
 * yazılacak her şema da kendiliğinden Türkçe konuşuyor.
 *
 * ELLE YAZILMIŞ MESAJLAR KORUNUR: `z.string().email("Geçersiz e-posta
 * adresi.")` gibi açık mesajlar yerelin önüne geçer — yani bağlama özel,
 * daha iyi cümleler olduğu gibi kalır. Yerel yalnız BOŞ bırakılan yerleri
 * doldurur.
 *
 * NEREDE ÇAĞRILIR: modülün kendisi içe aktarıldığı anda uygulanır. Sunucu
 * aksiyonlarının ortak girişi olmadığı için `lib/supabase/server.ts` üzerinden
 * değil, doğrudan `instrumentation.ts`ten (sunucu) ve kök layout'tan (istemci)
 * içe aktarılır — iki taraf da aynı dili konuşsun.
 */
z.config(z.locales.tr());

export {};
