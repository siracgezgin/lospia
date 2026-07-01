# Phase 1 — Production Migration Apply Plan

Lospia / AF Operasyon · Phase 1 hazırlık modülleri (CRM, Kreatif Linkler, Kişi
eşleştirme) için **production Supabase** veritabanına uygulanması gereken
migration planı.

> **Neden gerekli?** Kod, aşağıdaki tablo/kolonlara güveniyor. Production DB'de
> bunlar henüz yoksa uygulama artık ham hata basmıyor — CRM ve Creative sayfaları
> düzgün "veritabanı güncellemesi bekleniyor" durumuna düşüyor. Migration
> uygulandıktan sonra bu alanlar otomatik aktif olur.

## ⚠️ Güvenlik kuralları

- ❌ `supabase db reset` **YOK** (production verisini siler).
- ❌ `drop` / `delete` / `rename` **YOK**. Tüm migrationlar **additive**.
- ✅ Migrationlar aşağıdaki **sırayla** uygulanır.
- ✅ En sonda PostgREST schema cache **reload** edilir.
- Bu dosya yalnızca plandır; hiçbir SQL otomatik çalıştırılmaz.

## Uygulama sırası (Supabase SQL Editor)

Supabase Dashboard → **SQL Editor** → **New query** açın ve aşağıdaki dosyaların
içeriğini **sırayla** yapıştırıp çalıştırın:

| # | Migration dosyası | İçerik |
|---|---|---|
| 1 | `supabase/migrations/20240204000000_crm_contact_fields.sql` | `workspace_contacts` üzerine additive CRM kolonları (`organization`, `segment`, `crm_status`, `phone`, `source_channel`, `notes`, `last_contact_at`, `next_follow_up_at`, `owner_id`, `metadata`) + index'ler |
| 2 | `supabase/migrations/20240205000000_creative_assets.sql` | `creative_assets` tablosu (link registry) + RLS policy'leri + index'ler |
| 3 | `supabase/migrations/20240206000000_contact_user_link.sql` | `workspace_contacts.user_id` (profiles'a opsiyonel bağ) + unique/partial index |

> Her üç dosya da `add column if not exists` / `create table if not exists` /
> `create index if not exists` kullanır — tekrar çalıştırmak güvenlidir
> (idempotent).

### Alternatif: tek dosyada birleşik SQL

Kolaylık için üç migration'ın birleşik hâli hazırlanmıştır:

```
docs/sql/phase1_foundation_apply.sql
```

Bu dosyanın **tamamını** SQL Editor'a yapıştırıp tek seferde çalıştırabilirsiniz.
Sonundaki schema reload komutu da dahildir. (Yalnızca dokümantasyon amaçlıdır;
otomatik çalıştırılmaz.)

## Son adım — Schema cache reload

Migrationlar bittikten sonra PostgREST'in yeni şemayı görmesi için **mutlaka**
şunu çalıştırın:

```sql
notify pgrst, 'reload schema';
```

Bu yapılmazsa yeni kolon/tablo "schema cache"te görünmez ve uygulama setup-required
durumunda kalmaya devam eder.

## Uygulama sonrası doğrulama (Vercel — https://lospia.vercel.app)

Bir **yönetici** hesabıyla giriş yapıp test edin:

- [ ] `/crm` → üstte setup banner **görünmüyor**; "Yeni ilişki ekle" ve "Kişi eşleştirme" **aktif**.
- [ ] `/crm` → yeni ilişki ekle → segment/durum kaydediliyor, ham hata yok.
- [ ] `/crm` → "Kişi eşleştirme" paneli açılıyor, bir kişi sistem hesabıyla eşleştirilebiliyor.
- [ ] `/crm` → tablodaki "N ilişkili görev" linki `/list?person=<id>` sayfasına gidiyor.
- [ ] `/creative` → setup state **yok**; "Yeni link ekle" ile bağlantı eklenebiliyor.
- [ ] `/creative` → eklenen link listede görünüyor, "Bağlantıyı aç" çalışıyor.
- [ ] `/collection` → geri dönüş butonu ("Operasyon Modülleri'ne dön") çalışıyor.
- [ ] `/inventory`, `/production`, `/reports`, `/sales`, `/finance` → hazırlık shell'i + geri dönüş çalışıyor.

### Erişim kontrolü (bozulmamalı)

- [ ] Normal **üye** sidebar'da "Operasyon Modülleri" **görmüyor**.
- [ ] Üye doğrudan `/crm` veya `/creative` yazınca **AccessDenied** görüyor (içerik değil).
- [ ] Yönetici tüm modülleri görüyor.

## Migration uygulanmadan da güvenli davranış (mevcut kod)

Migration uygulanmasa bile uygulama **crash etmez**:

- `/crm` — mevcut kişiler minimal alanlarla listelenir; migration'a bağlı
  aksiyonlar (yeni ilişki, kişi eşleştirme) disabled + Türkçe setup banner.
- `/creative` — tablo yoksa liste yerine setup state gösterilir; "Yeni link ekle"
  yerine açıklamalı kurulum notu.
- Modal/aksiyonlarda ham İngilizce PostgREST hatası **hiçbir zaman** görünmez;
  yerine Türkçe "veritabanı güncellemesi bekleniyor" mesajı gösterilir.
