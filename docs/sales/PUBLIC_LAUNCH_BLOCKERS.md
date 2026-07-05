# Lospia — Public Launch Blocker Checklist

> Amaç: Public Lospia domaininde `NEXT_PUBLIC_MARKETING_SITE_ENABLED=true`
> yapılmadan önce nelerin bitmiş olması gerektiğini tek listede tutmak.
> AF production (`operasyon.aslifilinta.com`) bu karardan etkilenmez — AF
> host'unda marketing hiçbir zaman servis edilmez (hostname guard).

## Public marketing açılmadan önce ZORUNLU

**Alan adı + kimlik:**
- [ ] Lospia domaini seçildi ve satın alındı (ör. `lospia.com`)
- [ ] Resmi e-posta oluşturuldu (`hello@lospia.com` veya eşdeğeri)
- [ ] Resmi e-posta doğrulandı (gönderim + alım test edildi; SPF/DKIM/DMARC)

**Kod / konfigürasyon (docs-only fazda yapılmaz, launch anında yapılır):**
- [ ] `metadataBase` AF domaininden Lospia domainine güncellendi
- [ ] `request_access_leads` migration'ı prod'a uygulandı
      (`20240210000000_request_access_leads.sql` — henüz uygulanmadı)
- [ ] Vercel domain yönlendirmesi gözden geçirildi (Lospia domaini → app;
      AF domaini davranışı değişmedi, deploy sonrası doğrulandı)
- [ ] robots/indexleme kararı verildi (Lospia domaini indexlenir mi, hangi
      sayfalar; AF domaini indexlenmemeli)
- [ ] `/login` host-aware branding kararı verildi (Lospia domaininde Lospia
      görünümü; AF domaininde mevcut AF görünümü aynen kalır)

**İçerik / hukuk:**
- [ ] Legal sayfalar gözden geçirildi (privacy policy + terms; abartılı uyum
      iddiası yok — SOC2/ISO27001/tam KVKK-GDPR uyumu iddia edilmez)
- [ ] Privacy/iletişim e-postası placeholder'dan gerçek adrese güncellendi
- [ ] Request access formu uçtan uca test edildi (form → `request_access_leads`
      satırı → Supabase dashboard'da görünüyor)
- [ ] Demo ekran görüntüleri sanitize edildi ve gözden geçirildi
      (`DEMO_SCREENSHOT_CHECKLIST.md` yayın öncesi kontrolünden geçti)
- [ ] AF/pilot public metni ya müşteri onaylı ya da anonim
      ("gerçek bir marka operasyonu üzerinde şekillendirildi")

**Satış hazırlığı:**
- [ ] İlk demo videosu hazır (60 sn — `DEMO_SCRIPT_60_SEC.md`)
- [ ] İlk 100 lead tablosu hazır (`FIRST_100_LEADS_PLAN.md` kolonlarıyla)

## Private outreach'i ENGELLEMEMESİ gerekenler

Aşağıdakiler beklenmeden bugün 1:1 outreach (WhatsApp/LinkedIn/IG DM)
başlayabilir:

- Lospia domaini ve resmi e-posta (LinkedIn/DM kanalları domain istemez)
- Public marketing sitesinin açılması
- `request_access_leads` migration'ı (lead'ler ilk etapta tabloda manuel izlenir)
- Case study müşteri onayı (jenerik dil kullanılır)
- Legal sayfaların son hali (public site kapalıyken görünmüyor)
- Robots/indexing ve `/login` branding kararları

Private outreach için asgari gerekenler: demo videosu **veya** sanitize demo
ekranları + mesaj paketi (`OUTREACH_MESSAGE_PACK.md`) + lead tablosu.

## Public launch'ı MUTLAKA engelleyenler

Biri bile eksikse `NEXT_PUBLIC_MARKETING_SITE_ENABLED=true` yapılmaz:

1. Lospia domaini + doğrulanmış resmi e-posta yok
2. `request_access_leads` migration'ı prod'da değil (form çalışmaz → ölü CTA)
3. Legal sayfalarda placeholder e-posta / gözden geçirilmemiş metin
4. Sanitize edilmemiş ekran görüntüsü veya onaysız AF adı içeren public metin
5. Vercel domain routing doğrulanmadı (AF host davranışının bozulmadığı
   deploy sonrası test edilmedi)

## İlk 3 ücretli pilottan sonraya kalabilecekler

- Use-case alt sayfaları (moda/e-ticaret/stüdyo ayrı landing'ler)
- OG görseli ve görsel kimliğin son cilası
- Blog / SEO içerik üretimi
- Resend vb. otomatik lead bildirimi e-postası (şimdilik Supabase dashboard)
- Analytics derinleştirme (PostHog vb.; başlangıçta Vercel Analytics yeter)
- EN sayfa / global fiyatlandırma sayfası
- Onaylı, isimli case study sayfası (onay gelene kadar jenerik paragraf yeter)
- Cold email altyapısı (yan domain, warm-up, İYS entegrasyonu) — toplu e-posta
  zaten case study + demo hazır olmadan başlamayacak
