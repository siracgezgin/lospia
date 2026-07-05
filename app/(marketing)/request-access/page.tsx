import type { Metadata } from "next";
import { RequestAccessForm } from "@/components/marketing/RequestAccessForm";

export const metadata: Metadata = {
  title: "Kurulum Görüşmesi Planla",
  description:
    "Mevcut Excel / WhatsApp operasyon akışınızı birlikte inceleyelim. Lospia çalışma alanınızı kurulum destekli pilot süreciyle hazırlıyoruz.",
};

export default function RequestAccessPage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-16 sm:px-6 sm:py-20">
      <div className="mb-10 text-center">
        <h1 className="font-serif text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          Kurulum görüşmesi planlayın
        </h1>
        <p className="mt-4 text-base leading-relaxed text-muted">
          Self-service değil: operasyonunuzu birlikte haritalayıp çalışma
          alanınızı kuruyoruz. Formu doldurun, akışınızı inceleyip dönüş yapalım.
        </p>
      </div>
      <RequestAccessForm />
    </div>
  );
}
