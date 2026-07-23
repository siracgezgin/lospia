import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Föy görselleri Server Action ile yükleniyor. Tarayıcıda sıkıştırılsa da
      // (bkz. ImageUploader), varsayılan ~1MB limitine takılmamak için tavan.
      bodySizeLimit: "8mb",
    },
  },
};

export default nextConfig;
