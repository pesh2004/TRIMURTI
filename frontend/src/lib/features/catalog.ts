// Customer-facing feature catalog. Single source of truth for what the
// product does today and what's on the roadmap.
//
// **Convention** — whenever a module is flipped to [x] in PROGRESS.md,
// the same PR must either add a new entry here or flip an existing
// entry's `status` field. That way the `/features` page is always
// truthful and sales can demo directly off the running system.

export type FeatureStatus = 'live' | 'preview' | 'planned'

export type FeatureCategory =
  | 'security'
  | 'compliance'
  | 'hr'
  | 'sales'
  | 'procurement'
  | 'finance'
  | 'project'
  | 'platform'

export type Feature = {
  id: string
  category: FeatureCategory
  status: FeatureStatus
  title_th: string
  title_en: string
  summary_th: string
  summary_en: string
  highlights_th?: string[]
  highlights_en?: string[]
  // Short tag ("Phase 0", "Phase 1A", etc.) so customers see progression.
  since?: string
}

export const CATEGORY_ORDER: FeatureCategory[] = [
  'security',
  'compliance',
  'hr',
  'platform',
  'sales',
  'procurement',
  'finance',
  'project',
]

export const CATEGORY_LABELS: Record<FeatureCategory, { th: string; en: string }> = {
  security: { th: 'ความปลอดภัย', en: 'Security' },
  compliance: { th: 'Compliance กฎหมายไทย', en: 'Thai Compliance' },
  hr: { th: 'ทรัพยากรบุคคล', en: 'Human Resources' },
  platform: { th: 'แพลตฟอร์ม', en: 'Platform' },
  sales: { th: 'ขาย', en: 'Sales' },
  procurement: { th: 'จัดซื้อ', en: 'Procurement' },
  finance: { th: 'การเงิน/บัญชี', en: 'Finance' },
  project: { th: 'บริหารโครงการ', en: 'Project' },
}

export const features: Feature[] = [
  // ---------- Live today ----------
  {
    id: 'auth.session',
    category: 'security',
    status: 'live',
    since: 'Phase 0',
    title_th: 'ล็อกอิน + Session + RBAC',
    title_en: 'Login + Session + RBAC',
    summary_th:
      'ล็อกอินด้วยรหัสผ่านที่ hash ด้วย Argon2id, session เก็บใน Redis, และสิทธิ์เข้าถึงควบคุมด้วย role + permission ระดับ endpoint',
    summary_en:
      'Argon2id password hashing, Redis-backed sessions, and per-endpoint role + permission enforcement — no JWT, no token leakage.',
    highlights_th: [
      'Argon2id memory-hard hashing (OWASP-compliant)',
      'Sliding session timeout + server-side revocation',
      'Role / user / permission ทุกรายการ seed ใน gov_rbac',
    ],
    highlights_en: [
      'Argon2id memory-hard hashing (OWASP-compliant)',
      'Sliding session timeout + server-side revocation',
      'Every role / user / permission seeded via gov_rbac',
    ],
  },
  {
    id: 'compliance.audit',
    category: 'compliance',
    status: 'live',
    since: 'Phase 0',
    title_th: 'Audit log ที่แก้ย้อนหลังไม่ได้',
    title_en: 'Tamper-evident audit log',
    summary_th:
      'ทุกการเปลี่ยนแปลงข้อมูลถูกบันทึกพร้อม SHA-256 hash chain และเก็บอย่างน้อย 10 ปี ตามกฎหมายบัญชีไทย',
    summary_en:
      'Every mutation is logged with a forward-chained SHA-256 hash. Retention meets the 10-year minimum required by Thai accounting law.',
    highlights_th: [
      'Hash chain ตรวจสอบการแก้ไขย้อนหลังได้',
      'เก็บ before/after JSON ทุกรายการ',
      'Partition ตามเดือนเพื่อ query เร็วและลบตามอายุได้',
    ],
    highlights_en: [
      'Forward-chained row hashes detect tampering',
      'Before / after JSON stored for every mutation',
      'Partitioned monthly — fast queries and easy retention pruning',
    ],
  },
  {
    id: 'compliance.pii',
    category: 'compliance',
    status: 'live',
    since: 'Phase 1A',
    title_th: 'ปกป้องข้อมูลส่วนบุคคล (PDPA-aware)',
    title_en: 'PDPA-aware PII protection',
    summary_th:
      'เลขบัตรประชาชนและเงินเดือนเข้ารหัสที่ระดับ column ด้วย pgcrypto; แสดงผลแบบ mask เป็นค่าเริ่มต้น; ทุกครั้งที่เปิดดูข้อมูลจริงจะเขียน audit row แยกต่างหาก',
    summary_en:
      'National ID and salary are encrypted column-level with pgcrypto. Masked by default; any time plaintext leaves the server, a dedicated audit row captures who + when + which fields.',
    highlights_th: [
      'ตรวจ checksum เลขบัตรประชาชนไทย 13 หลัก (Luhn)',
      'สิทธิ์ hr_employees.reveal_pii แยกออกจากสิทธิ์อ่านปกติ',
      'การเปิดดู PII ถูก audit ฝั่ง server — bypass ผ่าน API ตรงๆ ไม่ได้',
    ],
    highlights_en: [
      'Thai national ID 13-digit + Luhn checksum enforced',
      'Dedicated hr_employees.reveal_pii permission, separate from read',
      'Every unmask is server-audited — no way to bypass via raw API',
    ],
  },
  {
    id: 'hr.employees',
    category: 'hr',
    status: 'live',
    since: 'Phase 1A',
    title_th: 'ทะเบียนพนักงาน',
    title_en: 'Employee master',
    summary_th:
      'ทะเบียนพนักงานบริษัท/แผนก/ตำแหน่ง พร้อมฟอร์มสร้าง-แก้ไข, drawer สรุปข้อมูล, และ flow เลิกจ้างที่บันทึก audit trail ครบถ้วน',
    summary_en:
      'Full employee master covering company / department / position, with create-edit form, summary drawer, and a termination flow that audits itself end-to-end.',
    highlights_th: [
      'รหัสพนักงานสร้างอัตโนมัติต่อปี/บริษัท (เช่น TMT-260001)',
      'Drawer แสดงอายุงาน, KPI, เปิด/ปิดข้อมูล PII พร้อม audit',
      'รองรับไทย-อังกฤษทุก label',
    ],
    highlights_en: [
      'Auto-generated employee codes per year + company (e.g. TMT-260001)',
      'Drawer shows tenure, KPIs, toggle PII reveal with live audit',
      'Every label is bilingual (Thai + English)',
    ],
  },
  {
    id: 'platform.i18n',
    category: 'platform',
    status: 'live',
    since: 'Phase 0',
    title_th: 'ใช้งานได้ทั้งภาษาไทยและอังกฤษ',
    title_en: 'Full Thai + English UI',
    summary_th:
      'สลับภาษาได้ทุกหน้า ทุก label แปลครบ ทั้งวันที่แบบไทย (พ.ศ.) และรูปแบบเลขบัตร/เบอร์โทรไทย',
    summary_en:
      'Language switchable on every page. Thai Buddhist-era year formatting, Thai-format ID numbers and phone numbers included.',
  },
  {
    id: 'platform.devops',
    category: 'platform',
    status: 'live',
    since: 'Phase 0',
    title_th: 'Deploy อัตโนมัติ + HTTPS พร้อม',
    title_en: 'Auto-deploy + HTTPS out of the box',
    summary_th:
      'ทุก push เข้า main ไป CI → รัน test/lint/e2e → deploy ลงเซิร์ฟเวอร์อัตโนมัติ; Caddy จัดการ HTTPS ให้เอง',
    summary_en:
      'Every push to main runs tests + lint + real browser E2E then auto-deploys. Caddy handles HTTPS certificate renewal automatically.',
    highlights_th: [
      'Postgres + Redis จริงใน CI — ไม่มี mock',
      'Playwright E2E ล็อกอิน → สร้างพนักงาน → verify',
      'Health check หลัง deploy ก่อน mark สำเร็จ',
    ],
    highlights_en: [
      'Real Postgres + Redis in CI — no mocks',
      'Playwright E2E: login → create employee → verify',
      'Post-deploy health check before marking success',
    ],
  },

  // ---------- Roadmap ----------
  {
    id: 'sales.quotation',
    category: 'sales',
    status: 'planned',
    since: 'Phase 2',
    title_th: 'ใบเสนอราคา + BOQ + VAT + WHT',
    title_en: 'Quotation with BOQ, VAT, WHT',
    summary_th: 'สร้างใบเสนอราคาจาก BOQ คำนวณ VAT และ WHT ตามกฎหมายไทยอัตโนมัติ',
    summary_en: 'Build quotations from BOQ, auto-compute Thai VAT and withholding tax.',
  },
  {
    id: 'finance.ap_ar',
    category: 'finance',
    status: 'planned',
    since: 'Phase 2-3',
    title_th: 'Accounts Payable / Receivable',
    title_en: 'Accounts Payable / Receivable',
    summary_th: 'รายงาน aging, 3-way match (PO/GRN/Invoice), e-Tax invoice',
    summary_en: 'Aging reports, 3-way match (PO/GRN/Invoice), e-Tax invoice generation.',
  },
  {
    id: 'project.wbs',
    category: 'project',
    status: 'planned',
    since: 'Phase 4',
    title_th: 'WBS + EVM + Variation Orders',
    title_en: 'WBS + Earned Value + Variation Orders',
    summary_th:
      'Work Breakdown Structure, ควบคุมต้นทุน (Budget vs Actual vs Earned Value), จัดการ Variation Order',
    summary_en:
      'Work Breakdown Structure, cost control (Budget vs Actual vs Earned Value), Variation Order management.',
  },
  {
    id: 'hr.payroll',
    category: 'hr',
    status: 'planned',
    since: 'Phase 7',
    title_th: 'Payroll + ภ.ง.ด. 1 / 3 / 53',
    title_en: 'Payroll + Thai PND tax files',
    summary_th: 'คำนวณเงินเดือน สร้างไฟล์ ภ.ง.ด. 1/3/53 และสลิปเงินเดือน',
    summary_en:
      'Payroll calculation, Thai Por.Ngor.Dor. (PND) 1 / 3 / 53 tax file generation, payslip rendering.',
  },
]

// Helpers used by the /features page + any future PDF/email exporter.
export function featuresByCategory(cat: FeatureCategory): Feature[] {
  return features.filter((f) => f.category === cat)
}

export function liveCount(): number {
  return features.filter((f) => f.status === 'live').length
}
