# Lospia — Demo Seed Script Planı (docs-only)

> **Bu doküman bir plan, kod değil.** Bu fazda script implemente edilmedi —
> bilinçli olarak. Aşağıdaki güvenlik kuralları sağlanmadan implementasyona
> başlanmaz. Demo verisi bu arada elle girilebilir
> (`DEMO_DATA_SEED_SPEC.md` rehberdir).

## 1. Amaç

Gelecekte `scripts/seed-demo-workspace.ts` benzeri bir script ile "Lospia
Demo Operasyon" workspace'ini tek komutla, güvenle ve tekrarlanabilir şekilde
kurmak. Kaynak veri: `DEMO_DATA_SEED_SPEC.md` (workspace, 6 departman,
4 kullanıcı, 20 görev, notlar, kurallar, haftalık notlar).

Tekrarlanabilirlik önemli çünkü teslim tarihleri göreli ("bu hafta Çarşamba",
"2 gün gecikmiş"): her çekim döneminde script yeniden çalıştırılarak tarihler
o haftaya göre yeniden hesaplanır.

## 2. Zorunlu güvenlik kuralları

Script aşağıdakilerin **tamamını** uygulamak zorundadır; biri eksikse
implementasyon kabul edilmez:

1. **`--demo-only` bayrağı zorunlu.** Bayrak verilmeden script açıklayıcı
   bir hata ile çıkar; hiçbir bağlantı kurulmaz.
2. **Varsayılan mod: dry-run.** Bayraksız/parametresiz çalıştırma yalnızca
   ne yapılacağını (workspace adı, kayıt sayıları, hedef URL) yazdırır.
   Gerçek yazma ayrıca `--execute` ister.
3. **Production reddedilir.** Hedef Supabase URL'i local değilse
   (`127.0.0.1` / `localhost` dışıysa) script, `DEMO_SEED_ALLOW_REMOTE=true`
   env değişkeni olmadan **çalışmayı reddeder**. Bu değişken normalde asla
   set edilmez; varlığı bile uyarı yazdırır.
4. **Asla veri silmez.** Script'te delete/truncate/reset yolu yoktur.
   "Temiz kurulum" gerekiyorsa eski demo workspace elle arşivlenir; script
   yalnızca **yeni** kayıt ekler.
5. **AF Operasyon workspace'ine asla dokunmaz.** Tüm insert'ler script'in
   kendi oluşturduğu workspace ID'sine bağlanır; mevcut workspace'lere
   yazma/güncelleme yolu yoktur. Ek koruma: hedefte "AF Operasyon" adlı
   workspace'in ID'si hiçbir sorguda kullanılmaz.
6. **Ayrı workspace oluşturur.** "Lospia Demo Operasyon" adında yeni
   workspace açar; aynı adda workspace zaten varsa **durur** ve kullanıcıya
   bırakır (üstüne yazmaz, içine eklemez).
7. **Hedefi açıkça yazdırır.** Çalışmaya başlamadan önce hedef Supabase
   URL'i, veritabanı ve modu (dry-run/execute) ekrana basar.
8. **Yazılı onay ister.** Execute modunda kullanıcıdan birebir
   `CREATE_DEMO_WORKSPACE` metnini yazmasını ister; başka her girdi iptaldir.
9. **Log/backup yazar.** Oluşturulan her kaydın ID'si ve özeti
   `scripts/logs/demo-seed-{timestamp}.json` benzeri bir dosyaya yazılır —
   hem denetim izi hem de gerekirse elle geri alma listesi.
10. **Yalnızca demo-safe veri.** Veri kaynağı `DEMO_DATA_SEED_SPEC.md` ile
    sınırlıdır; gerçek isim/e-posta/görev içeren hiçbir sabit script'e
    giremez. Demo e-postaları `@demo.lospia.test` ile biter; script başka
    domain'e izin vermez.

## 3. Önerilen akış

```
npx tsx scripts/seed-demo-workspace.ts --demo-only [--execute]
```

1. Bayrak kontrolü (`--demo-only` yoksa çık)
2. `.env.local`'den Supabase URL oku; local değilse `DEMO_SEED_ALLOW_REMOTE`
   kontrolü → yoksa reddet
3. Hedef URL + mod bilgisini yazdır
4. Dry-run: oluşturulacak kayıtların özetini bas ve çık
5. Execute: `CREATE_DEMO_WORKSPACE` onayını al
6. "Lospia Demo Operasyon" var mı kontrol et → varsa dur
7. Sırayla oluştur: workspace → departmanlar → demo kullanıcılar
   (auth: proje kurallarına göre team-access grant akışıyla;
   `provision_workspace` kullanılmaz) → görevler (göreli tarihler o haftanın
   Pazartesi'sine göre hesaplanır) → notlar → kurallar → haftalık notlar
8. Log dosyasını yaz; oluşturulan workspace ID'sini ve özeti ekrana bas

## 4. Göreli tarih hesabı

Script çalıştığı günün haftasını baz alır (hafta başlangıcı: Pazartesi,
date-fns `startOfWeek(..., { weekStartsOn: 1 })`):

| Spec ifadesi | Hesap |
|---|---|
| bu hafta Pazartesi | haftanın 1. günü |
| bu hafta Çarşamba | Pazartesi + 2 |
| bu hafta Cuma | Pazartesi + 4 |
| gelecek Pazartesi/Çarşamba/Cuma | +7 gün |
| geçen Cuma | Pazartesi − 3 |
| 2 gün gecikmiş | bugün − 2 |

Tarihler date-only tutulur (haftalık board due_date bazlı ve date-only —
saat bileşeni verilmez).

## 5. Implementasyona başlama önkoşulları

- [ ] Bu plandaki 10 güvenlik kuralının tamamı tasarımda karşılandı
- [ ] Script'in kullandığı client'ın RLS/service-role kararı netleşti
      (local'de service role kabul; `SUPABASE_SERVICE_ROLE_KEY` yalnızca
      script ortamında, asla tarayıcıya/commit'e girmez)
- [ ] Dry-run çıktısı gözden geçirildi
- [ ] İlk execute yalnızca local Supabase'te, `supabase status` ile URL
      teyit edilerek yapıldı
- [ ] Kod review: production'a giden herhangi bir yol olmadığı ikinci kişi
      (veya ertesi gün ikinci bakış) tarafından doğrulandı

O zamana kadar: demo verisi elle girilir, bu doküman spesifikasyon olarak
kalır.
