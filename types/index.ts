// Re-exports from generated schema types
export type { Database, Json } from "./database";
export { Constants } from "./database";
export type {
  Tables,
  TablesInsert,
  TablesUpdate,
  Enums,
} from "./database";

import type { Database } from "./database";

// Convenience row types
export type Task = Database["public"]["Tables"]["tasks"]["Row"];
export type TaskInsert = Database["public"]["Tables"]["tasks"]["Insert"];
export type TaskUpdate = Database["public"]["Tables"]["tasks"]["Update"];

export type TaskActivity = Database["public"]["Tables"]["task_activity"]["Row"];
export type TaskActivityInsert = Database["public"]["Tables"]["task_activity"]["Insert"];

// Phase 2A — dedicated audit trail (separate from task_activity)
export type TaskActivityLog = Database["public"]["Tables"]["task_activity_logs"]["Row"];
export type TaskActivityLogInsert = Database["public"]["Tables"]["task_activity_logs"]["Insert"];
// Activity log row joined with the actor's profile (for UI rendering)
export type TaskActivityLogWithActor = TaskActivityLog & {
  actor: Pick<Profile, "id" | "full_name" | "email"> | null;
};

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export type Workspace = Database["public"]["Tables"]["workspaces"]["Row"];

export type WorkspaceMember = Database["public"]["Tables"]["workspace_members"]["Row"];

export type SavedView = Database["public"]["Tables"]["saved_views"]["Row"];

export type Notification = Database["public"]["Tables"]["notifications"]["Row"];

export type TimeEntry = Database["public"]["Tables"]["time_entries"]["Row"];

export type TaskAttachment = Database["public"]["Tables"]["task_attachments"]["Row"];

export type CustomFieldDefinition = Database["public"]["Tables"]["custom_field_definitions"]["Row"];

export type WebhookEvent = Database["public"]["Tables"]["webhook_events"]["Row"];

// workspace_contacts is not in the generated schema yet — define manually.
// The CRM v0 fields (organization … metadata) are additive/optional columns
// from 20240204000000_crm_contact_fields.sql; older rows have them as null.
export type WorkspaceContact = {
  id: string;
  workspace_id: string;
  name: string;
  email: string | null;
  role_label: string | null;
  created_at: string;
  updated_at: string;
  // CRM v0 (all optional / additive)
  organization?: string | null;
  segment?: string | null;
  phone?: string | null;
  source_channel?: string | null;
  notes?: string | null;
  last_contact_at?: string | null;
  next_follow_up_at?: string | null;
  owner_id?: string | null;
  crm_status?: string | null;
  /** Influencer seeding adımı (20240330) — bkz. lib/crm/seeding.ts. */
  seeding_stage?: string | null;
  metadata?: Record<string, unknown> | null;
  // Optional link to a system user/profile (20240206000000_contact_user_link).
  user_id?: string | null;
};

// creative_assets — Kreatif Linkler registry (link/reference, not file store).
export type CreativeProvider =
  | "canva" | "google_drive" | "dropbox" | "figma" | "website" | "other";
export type CreativeStatus = "draft" | "in_review" | "approved" | "archived";

export type CreativeAsset = {
  id: string;
  workspace_id: string;
  title: string;
  url: string;
  provider: CreativeProvider;
  department_id: string | null;
  related_task_id: string | null;
  related_contact_id: string | null;
  status: CreativeStatus;
  notes: string | null;
  created_by: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

// ── Office Center (Doküman Merkezi · Şablon Kütüphanesi · Tablo Merkezi) ─────
// Link/metadata + JSON snapshot tables — no file storage. Tables come from
// 20240207000000_office_center_foundation.sql (not in generated schema yet).

export type OfficeRecordStatus = "draft" | "in_review" | "approved" | "archived";

export type OperationDocumentType =
  | "drive_link" | "google_doc" | "google_sheet" | "canva" | "figma"
  | "pdf_link" | "word_link" | "excel_link" | "website" | "internal_note" | "other"
  /** Sisteme YÜKLENMİŞ dosya (20240312). Bağlantı değil; klasör tarayıcısında
   *  yaşar, "Bağlantılar" listesinde görünmez. */
  | "file"
  /** Sistemde YAZILAN metin — AF Teamwork'ün Word'ü (20240325). Gövdesi
   *  `body` kolonunda; /documents/[id] editöründe açılır. */
  | "doc";

/** Bağlantı formunun üretebildiği türler — "file" ve "doc" yalnız kendi
 *  akışlarında oluşur, elle seçilemez. */
export type LinkDocumentType = Exclude<OperationDocumentType, "file" | "doc">;

export type OperationDocument = {
  id: string;
  workspace_id: string;
  title: string;
  description: string | null;
  document_type: OperationDocumentType;
  url: string | null;
  department_id: string | null;
  related_task_id: string | null;
  related_contact_id: string | null;
  status: OfficeRecordStatus;
  owner_id: string | null;
  /** Yazının gövdesi — yalnız document_type = "doc" kayıtlarında dolu. */
  body?: string | null;
  /** Bulunduğu klasör (20240312). NULL = AF Teamwork kökü. */
  folder_id?: string | null;
  tags: string[];
  notes: string | null;
  metadata: Record<string, unknown>;
  created_by: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type TemplateCategory =
  | "general" | "customer_email" | "whatsapp_message" | "producer_brief"
  | "order_form" | "pr_influencer" | "sales" | "after_sales"
  | "internal_process" | "other";

export type TemplateChannel =
  | "general" | "email" | "whatsapp" | "document" | "internal" | "other";

export type DocumentTemplate = {
  id: string;
  workspace_id: string;
  title: string;
  description: string | null;
  category: TemplateCategory;
  channel: TemplateChannel;
  content_json: unknown | null;
  content_html: string | null;
  plain_text: string | null;
  variables: string[];
  department_id: string | null;
  related_task_id: string | null;
  related_contact_id: string | null;
  status: OfficeRecordStatus;
  owner_id: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
  created_by: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SpreadsheetType =
  | "freeform" | "collection" | "production" | "inventory"
  | "finance" | "sales" | "crm" | "other";

export type SpreadsheetStatus = "draft" | "active" | "locked" | "archived";

export type OperationSpreadsheet = {
  id: string;
  workspace_id: string;
  title: string;
  description: string | null;
  sheet_type: SpreadsheetType;
  snapshot: Record<string, unknown>;
  schema_json: Record<string, unknown>;
  department_id: string | null;
  related_task_id: string | null;
  related_contact_id: string | null;
  status: SpreadsheetStatus;
  owner_id: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
  created_by: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

/** Hammadde kategorisi — maliyet kalemine eşlenir (bkz. MATERIAL_COST_KEY). */
export type MaterialCategory =
  | "kumas" | "aksesuar" | "fermuar" | "tela" | "iplik" | "etiket" | "diger";

export type MaterialUnit = "m" | "adet" | "kg" | "takım" | "paket";

/** Tedarikçi — hammaddenin kaynağı (20240310). */
export type Supplier = {
  id: string;
  workspace_id: string;
  name: string;
  city: string | null;
  country: string | null;
  currency: string;
  lead_time_days: number | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  is_active: boolean;
  position: number;
  created_at: string;
  updated_at: string;
};

/**
 * Hammadde (20240310).
 *
 * Kumaş/aksesuar BİR KEZ tanımlanır, tüm föylerde yeniden kullanılır. Birim
 * fiyat tek yerde durur — değişince tüm föylerin maliyeti kendiliğinden
 * güncellenir. Eskiden her föyde serbest metin olarak tekrar yazılıyordu.
 */
export type Material = {
  id: string;
  workspace_id: string;
  code: string | null;
  name: string;
  category: MaterialCategory;
  supplier_id: string | null;
  composition: string | null;
  width_cm: number | null;
  unit: MaterialUnit;
  unit_price: number | null;
  currency: string;
  photo_url: string | null;
  notes: string | null;
  is_active: boolean;
  position: number;
  created_at: string;
  updated_at: string;
};

/** Reçete satırı (BOM) — föy ↔ malzeme + birim başına tüketim + fire. */
export type SheetMaterial = {
  id: string;
  workspace_id: string;
  sheet_id: string;
  material_id: string;
  consumption: number;
  waste_pct: number;
  note: string | null;
  position: number;
  created_at: string;
  updated_at: string;
};

/** Reçete satırı + bağlı malzeme — ekranın çalıştığı birleşik biçim. */
export type SheetMaterialWithMaterial = SheetMaterial & {
  material: Pick<Material, "id" | "name" | "code" | "category" | "unit" | "unit_price" | "currency" | "width_cm">;
};

/**
 * Sezon — 20240309 migration.
 *
 * Zedonk incelemesinden gelen mimari fikir: her ekranın sağ üstünde bir sezon
 * seçici var (`SS 21 - WW`) ve bu bir filtre değil, sistemin çalıştığı BAĞLAM.
 * Bizde `production_sheets.season` yalnız serbest metindi.
 */
export type Season = {
  id: string;
  workspace_id: string;
  name: string;
  starts_on: string | null;
  ends_on: string | null;
  /** Aktif sezon — çalışma alanı başına en fazla bir tane. */
  is_current: boolean;
  position: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Üretici (Usta) — 20240307 migration.
 *
 * Aslı Hanım (2026-08-19): "Cihan Usta, o ustaları da öyle açacağız. Cihan diye
 * bir fotoğraf, Hakan diye bir olsa, ona gireceksin — hangi ürünler orada
 * dikiliyor." Eskiden yalnız serbest metindi (production_sheets.producer);
 * artık gerçek kayıt.
 *
 * lead_time_days / min_order_qty / currency alanları Zedonk incelemesinden
 * geldi (Manufacturers sekmesi: Lead Time, Minimums, Currency).
 */
export type Manufacturer = {
  id: string;
  workspace_id: string;
  name: string;
  photo_url: string | null;
  city: string | null;
  country: string | null;
  currency: string;
  lead_time_days: number | null;
  min_order_qty: number | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  is_active: boolean;
  position: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

// ── Üretim Föyü — production_sheets ──────────────────────────────────────────
// Hand-written (not from generated database.ts) so the feature ships without a
// local Supabase type regen. Mirrors 20240212000000_production_sheets.sql.
export type ProductionSheetStatus = "draft" | "active" | "archived";

/** ÖLÇÜLER tablosunun bir satırı. */
export type MeasurementRow = { no: string; label: string; value: string };
/** TESLİM EDİLEN ÜRÜNLER tablosunun bir satırı. */
export type DeliveredItemRow = { no: string; label: string; qty: string };
/** BEDEN DAĞILIMI ızgarası — beden başlıkları + varyant satırları. */
export type SizeDistribution = {
  sizes: string[];
  rows: { label: string; values: string[]; total: string }[];
  /** Beden GRUBU satırı — Aslı Hanım (2026-08-19): "Bedenlerin altına o ürünün
   *  gibi bir sıra daha açacaksın. XSmall'la small'a 1, medium'le large'a 2,
   *  XXlarge'a 3 diyeceksin. Bir de hepsinin işaretli olduğu one size."
   *  Beden adı → grup etiketi ("1" | "2" | "3" | "OS"). */
  groups?: Record<string, string>;
};

/** Föye eklenen görsellerin bağlı olduğu bölüm.
 *  technical_drawing (tekil) geri uyum içindir — yeni föyler ÖN/ARKA kullanır. */
export type ProductionImageSection =
  | "technical_drawing" | "technical_drawing_front" | "technical_drawing_back"
  | "fabric" | "accessories" | "embellishments" | "sewing" | "general";
/** Supabase Storage'da tutulan föy görseli (public URL + silme için path). */
export type ProductionImage = {
  url: string;
  path: string;
  section: ProductionImageSection;
  caption?: string;
};

export type ProductionSheet = {
  id: string;
  workspace_id: string;
  title: string;
  status: ProductionSheetStatus;
  product_code: string | null;
  product_kind: string | null;
  producer: string | null;        // eski serbest metin (geri uyum)
  manufacturer_id?: string | null; // gerçek usta kaydı (20240307) — bu kazanır
  description: string | null;
  season: string | null;          // eski serbest metin (geri uyum)
  season_id?: string | null;      // gerçek sezon kaydı (20240309) — bu kazanır
  production_date: string | null;
  delivery_date: string | null;
  /** Dikim teslim tarihi — ürün teslim tarihinden AYRI (20240306). */
  sewing_delivery_date?: string | null;
  meterage: string | null;
  measurements: MeasurementRow[];
  delivered_items: DeliveredItemRow[];
  size_distribution: SizeDistribution;
  photo_refs: ProductionImage[];
  wash_instruction: string | null;
  fabric_lining: string | null;
  fabric_info: string | null;
  accessories_info: string | null;
  embellishments: string | null;
  sewing_instruction: string | null;
  workmanship_notes: string | null;
  qc_revision: string | null;
  revision_notes: string | null;
  production_waste: string | null;
  created_by: string | null;
  updated_by: string | null;
  // Kategori taksonomisi (web nav yapısı) + fiyat — 20240217 migration
  category: ProductionCategory | null;
  subcategory: string | null;
  pricing: ProductionPricing;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  /** Konfirmasyon (20240308). Föy her güncellendiğinde trigger ile SIFIRLANIR —
   *  "hazırla → Nisa konfirme → Aslı'ya göster" akışının veri karşılığı. */
  confirmed_at?: string | null;
  confirmed_by?: string | null;
  /** Renk adı — kimliğin üçüncü parçası (model | kumaş | RENK), 20240311. */
  colorway?: string | null;
  /** Varyantsa ana föy. Veri paylaşılmaz; yalnız gruplama. */
  parent_sheet_id?: string | null;
};

/** Web nav ana kategorileri (aslifilinta.com). */
export type ProductionCategory =
  | "one_of_a_kind" | "ready_to_wear" | "shoes" | "accessories";

/**
 * Maliyet kalemi — ürünün birim maliyetini oluşturan TEK bir gider.
 *
 * Aslı Hanım (2026-08-19):
 *   "Maliyet şöyle hesaplanıyor: kumaşın fiyatına ayrı giriyorsun, dikim
 *    fiyatına ayrı giriyorsun, fermuar fiyatına ayrı giriyorsun, ütü paketi
 *    ayrı giriyorsun, kalıba ayrı giriyorsun, genel giderleri ayrı giriyorsun.
 *    Maliyetin bir sürü kategorisi var."
 */
export type CostItemKey =
  | "kumas" | "dikim" | "fermuar" | "utu_paket" | "kalip" | "aksesuar"
  | "genel_gider" | "diger";

export type CostItem = {
  key: CostItemKey;
  /** Serbest ad — "diger" kaleminde kullanıcı yazar. */
  label?: string;
  /** Birim başına tutar (serbest metin; parseMoney ile sayıya çevrilir). */
  amount: string;
};

/** Föy fiyat bilgisi — her föy tek ürün. Toplam adet beden dağılımından gelir. */
export type ProductionPricing = {
  /** Birim ÜRETİM maliyeti — artık cost_items toplamından türetilir. */
  unit_price?: string;
  purchase_cost?: string;   // satın alma / malzeme maliyeti (geri uyum)
  web_sale_price?: string;  // web sitesi satış fiyatı
  currency?: string;        // varsayılan "TL"
  notes?: string;
  /** Kalem kalem maliyet — gerçek maliyet hesabı (20240306 sonrası). */
  cost_items?: CostItem[];
  /** Ustaya birim başına ödenen tutar. ÖDEME TABLOSU bunu kullanır; maliyetle
   *  KARIŞTIRILMAZ — "bu maliyet değil, bu ödeme tablosu". */
  usta_unit_payment?: string;
  /* FATURA KARŞILIĞI. Aslı Hanım (2026-08-28): "Toplam fatura bilgileri. Bir
     de fatura karşılığının bilgisi de girsin buraya. Çünkü muhasebeyi de
     buraya bağlayacaksın ya sonra." Ödenen tutar ile faturalanan tutar aynı
     olmak zorunda değil — ikisi ayrı alanda yaşar ki muhasebe eşleştirmesi
     yapılabilsin. */
  invoice_no?: string;
  invoice_amount?: string;
};

// ── Planlama Modülü — Haftalık Toplantı Takvimi (20240216 migration) ─────────
/** Toplantı kategorisi → ızgarada renk paterni. */
export type PlanningCategory =
  | "uretim" | "ai" | "sales" | "marketing" | "finance" | "external" | "system" | "tasarim" | "other";

/** Izgaradaki renkli "toplantı kutusu" (gün + saat). */
export type PlanningMeeting = {
  id: string;
  workspace_id: string;
  meeting_date: string;        // "YYYY-MM-DD" (sütun = gün)
  time_slot: string;           // "09:00" (satır = saat)
  category: PlanningCategory;
  title: string | null;
  content: string | null;
  kim: string | null;          // "Kim" — serbest metin (SE, ND…)
  participant_ids: string[];   // ileride yapısal katılımcı
  collaborator_ids?: string[]; // iş birliği yapan kişiler (20240304)
  position: number;
  template_id?: string | null; // şablondan kurulduysa kaynağı (20240222)
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

/** Toplantı altındaki "Konu" (max 5). Konu = gerçek görev (task_id). */
export type PlanningTopic = {
  id: string;
  meeting_id: string;
  workspace_id: string;
  position: number;
  text: string | null;
  kim: string | null;              // eski serbest metin (geri uyum)
  participant_ids: string[];       // konu bazlı "Kim" — SORUMLU üye id'leri
  collaborator_ids?: string[];     // "İş birliği" — yanında çalışan kişiler (20240304)
  due_date: string | null;         // konu teslim tarihi (deadline)
  task_id: string | null;          // göreve dönüştürüldüyse ilgili görev
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

/** Toplantı + konuları birlikte. */
export type PlanningMeetingWithTopics = PlanningMeeting & {
  topics: PlanningTopic[];
};

/** Haftanın iskeleti: tekrar eden toplantı bloğu (20240222 migration).
 *  "Her gün aynı saatte üretim" ritmini tek yerden tanımlar. */
export type PlanningTemplate = {
  id: string;
  workspace_id: string;
  weekday: number;             // 0=Pazartesi … 6=Pazar
  time_slot: string;           // "09:00"
  category: PlanningCategory;
  title: string | null;
  content: string | null;
  participant_ids: string[];   // varsayılan katılımcılar (user id)
  position: number;
  active: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

/** "Tamamlanmamış Eksik Konular" satırı (20240228 migration).
 *  Haftaya bağlı DEĞİL — tamamlanana kadar durur. Sütun = kişi. */
export type PlanningOpenItem = {
  id: string;
  workspace_id: string;
  owner_user_id: string | null;   // sistemde kullanıcısı olan sahip
  owner_label: string | null;     // kullanıcı yoksa serbest ad ("EF", "Genel")
  owner_role: string | null;      // kişinin alt sütunu ("Sales / AFCOM") (20240301)
  collaborator_user_id?: string | null; // iş birliği yapan kişi (20240304)
  text: string;
  category: PlanningCategory | null;
  done: boolean;
  done_at: string | null;
  position: number;
  task_id: string | null;         // göreve dönüştürüldüyse ilgili görev
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

/** Takvimin altındaki "Tarih/Saat × departman" matrisi (20240301 migration).
 *  Satır = haftanın günü (Mon 09:00 … Fri 09:00), sütun = departman. */
export type PlanningWeekMatrixRow = {
  id: string;
  workspace_id: string;
  week_start: string;          // haftanın pazartesisi "YYYY-MM-DD"
  weekday: number;             // 0=Pazartesi … 6=Pazar
  time_slot: string;           // "09:00"
  category: PlanningCategory;  // sütun
  text: string | null;
  kim: string | null;
  participant_ids: string[];
  position: number;            // sütun sırası (Excel'deki soldan sağa)
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

/** "Adımlar / Operasyon Kurgusu / Kim" (20240301 migration).
 *  Haftaya bağlı DEĞİL — markanın sabit iş akışı. */
export type PlanningProcessStep = {
  id: string;
  workspace_id: string;
  position: number;            // 1, 2, 3…
  title: string;
  note: string | null;
  kim: string | null;
  participant_ids: string[];
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

// ── Finans — Ödeme Takibi (20240223 migration; admin-only) ───────────────────
export type FinancePaymentStatus = "bekliyor" | "odendi";

export type FinancePayment = {
  id: string;
  workspace_id: string;
  title: string;
  payee: string | null;
  amount: number | null;
  currency: string;
  status: FinancePaymentStatus;
  due_date: string | null;
  paid_at: string | null;
  category: string | null;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

// workspace_rules — daily SOPs / checklists
export type WorkspaceRule = Database["public"]["Tables"]["workspace_rules"]["Row"];
export type WorkspaceRuleInsert = Database["public"]["Tables"]["workspace_rules"]["Insert"];

// workspace_notes — sticky note board lane (not tasks)
export type NoteColor = "yellow" | "blue" | "green" | "purple";

export type WorkspaceNote = {
  id: string;
  workspace_id: string;
  title: string;
  body: string | null;
  color: NoteColor;
  position: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

// workspace_invites — team-access allowlist. An admin adds allowed e-mails here;
// when a person signs up with an allowed e-mail they join the workspace. Not an
// e-mail invite — no link or message is sent.
export type WorkspaceInvite = {
  id: string;
  workspace_id: string;
  email: string;
  role: "admin" | "member" | "viewer";
  invited_by: string | null;
  accepted_at: string | null;
  accepted_user_id: string | null;
  created_at: string;
  full_name: string | null;
  username: string | null;
};

// workspace_departments — department tree (top-level + sub-areas)
export type WorkspaceDepartment = {
  id: string;
  workspace_id: string;
  parent_id: string | null;
  name: string;
  description: string | null;
  color_key: string | null;
  position: number;
  created_at: string;
  updated_at: string;
};

// department_members — person ↔ department (many-to-many)
export type DepartmentMember = {
  id: string;
  workspace_id: string;
  department_id: string;
  member_id: string;
  role: "lead" | "member";
  created_at: string;
};

// task_notes — user-authored notes on tasks ("Notlar")
// Workflow fields (note_type … action_status) come from
// 20240209000000_task_note_workflow.sql; they are optional so the app keeps
// working (plain-note fallback) when the migration is not applied yet.
export type TaskNoteType = "info" | "action_required" | "handoff" | "approval_waiting";
export type TaskNoteActionStatus = "open" | "seen" | "claimed" | "closed";
export type TaskNoteAcknowledgementAction = "seen" | "claimed";

export type TaskNote = {
  id: string;
  workspace_id: string;
  task_id: string;
  author_id: string | null;
  content: string;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
  // Operational note workflow (additive; absent pre-migration)
  note_type?: TaskNoteType;
  metadata?: Record<string, unknown> | null;
  due_date_at_note_time?: string | null;
  action_status?: TaskNoteActionStatus;
};

export type TaskNoteWithAuthor = TaskNote & {
  author: Pick<Profile, "id" | "full_name" | "email"> | null;
};

// task_note_acknowledgements — per-user "Gördüm" / "Üzerime aldım" receipts
export type TaskNoteAcknowledgement = {
  id: string;
  workspace_id: string;
  task_id: string;
  note_id: string;
  user_id: string;
  action: TaskNoteAcknowledgementAction;
  created_at: string;
};

// One weekly note-feed entry on the board's left column — a task note joined
// with just enough task/author context to render a compact feed card.
export type BoardNoteFeedItem = {
  id: string;
  taskId: string;
  taskTitle: string;
  taskDueDate: string | null;
  departmentId: string | null;
  authorId: string | null;
  authorName: string;
  content: string;
  noteType: TaskNoteType;
  actionStatus: TaskNoteActionStatus;
  createdAt: string;
  /** Resolved display names of the note's notify targets (may be empty). */
  notifiedNames: string[];
  /** Who claimed the action ("Üzerine aldı"), when derivable. */
  claimedByName: string | null;
};

// Per-person task completion (multi-participant workflow)
export type TaskMemberCompletion = {
  id: string;
  workspace_id: string;
  task_id: string;
  member_id: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

// A task participant resolved for display: which workspace member, their name,
// and whether they have completed their part.
export type TaskParticipant = {
  memberId: string;     // workspace_members.id
  userId: string;       // profiles.id
  name: string;
  completed: boolean;
};

// Enum aliases
export type TaskStatus = Database["public"]["Enums"]["task_status"];
export type TaskPriority = Database["public"]["Enums"]["task_priority"];
export type WorkspaceRole = Database["public"]["Enums"]["workspace_role"];
export type TaskActivityType = Database["public"]["Enums"]["task_activity_type"];
export type NotificationType = Database["public"]["Enums"]["notification_type"];
export type CustomFieldType = Database["public"]["Enums"]["custom_field_type"];
export type WebhookSource = Database["public"]["Enums"]["webhook_source"];
