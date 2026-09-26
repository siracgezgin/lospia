import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Föy görselleri Server Action ile yükleniyor. Tarayıcıda sıkıştırılsa da
      // (bkz. ImageUploader), varsayılan ~1MB limitine takılmamak için tavan.
      //
      // BU SAYI ÜST SINIRI BELİRLEMEZ, YALNIZ ALTINA İNER. Vercel'de istek
      // gövdesi 4,5 MB'ta platform tarafından kesilir ve next.config bunu
      // EZEMEZ: buraya 8 MB yazmak canlıda 8 MB'lık bir yükleme hakkı vermez,
      // yalnız Next'in kendi ~1 MB'lık varsayılanını kaldırır. Gerçek tavan
      // lib/utils/compress-image.ts'teki MAX_UPLOAD_BYTES'tır (4 MB) ve hata
      // orada, anlaşılır Türkçeyle çıkar.
      bodySizeLimit: "8mb",
    },
  },
};

export default nextConfig;
