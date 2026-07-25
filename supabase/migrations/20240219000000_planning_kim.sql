-- Planlama: toplantı ve konulara serbest metin "Kim" alanı (Aslı'nın takvimindeki
-- "Kim" sütunu — SE, ND, SG gibi kısaltmalar; sistem kullanıcısı olma zorunluluğu
-- yok). Yapısal katılımcı (participant_ids) ileride ayrıca kullanılabilir.
alter table public.planning_meetings add column if not exists kim text;
alter table public.planning_topics   add column if not exists kim text;
