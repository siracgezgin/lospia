/**
 * ESKİ GİRİŞ — geriye uyum için ince katman.
 *
 * İki paralel form primitifi vardı (Input.tsx ve Field.tsx); aynı iş için iki
 * ölçü, iki odak halkası. Tek kaynak artık `components/ui/Field`. Buradaki
 * adlar oradakilere eşlenir; yeni kodda doğrudan Field'ı içe aktar.
 */
export { TextInput as Input, TextArea as Textarea, SelectInput as Select, Field } from "./Field";
