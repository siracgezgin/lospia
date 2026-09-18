-- NOT KONUYA AİT, TOPLANTIYA DEĞİL.
--
-- Sıraç (18.09.2026): "Not başlığa değil konulara eklenmeli. O yüzden
-- başlıktaki kısmı kaldır, her konuya özel not girilecek. Şu ankilerin
-- hepsinde olsun; Aslı Hanım gereksizlerden kaldırır, ama başlıkta not olmaz."
--
-- Bugüne kadar not TOPLANTININ alanıydı (`planning_meetings.content`) ve
-- haftalık ızgarada başlığın altında açılıyordu. Pratikte oraya konuların
-- gündemi yazılıyordu: "1. Nihal hocadan gelen kısa göynekler online açılacak
-- 2. Dükkanda yeni eklenecekler 3. Yazıların revizeleri" — yani üç ayrı konuya
-- ait üç not, tek kutuda. Notun doğru yeri konunun kendisi.
--
-- ESKİ VERİ SİLİNMEZ. `planning_meetings.content` yerinde duruyor; toplantı
-- penceresinde salt okunur bir "eski not" satırı olarak görünür ve oradan
-- temizlenir. Silme kararı kullanıcınındır, migration'ın değil — o metinlerin
-- hangi konuya ait olduğunu makine bilemez (AFCOM'un notu üç maddeydi,
-- konuları ise bambaşka üç satır).

alter table public.planning_topics
  add column if not exists note text;

comment on column public.planning_topics.note is
  'Konuya ait not. Takvimde YAZILMAZ — yalnız varlığı işaretlenir, metin konu açılınca görünür (Aslı Hanım, 18.09.2026).';
