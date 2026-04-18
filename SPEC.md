# BuildCorp ERP — ข้อกำหนดระบบ (SPEC.md)

> เอกสารสเปคระดับ Enterprise ERP สำหรับธุรกิจก่อสร้าง/อสังหาฯ
> ครอบคลุมโมดูลครบวงจรประมาณ **80 หน้า** ในสไตล์ SAP/Oracle Fusion ผสมความทันสมัยของ Notion/Linear
> ภาษา: TH / EN สลับได้ทั้งระบบ · ธีม: Light / Dark · บทบาท: CEO / CFO / PM / Site Engineer

---

## 1. หลักการออกแบบ (Design Principles)
1. **Information density สูง** — โต๊ะเดสก์ท็อปผู้ใช้จริงใน ERP เห็นข้อมูลเยอะ ไม่ใช้ whitespace เปลือง
2. **Consistent shell** — Sidebar ซ้าย (80 โมดูล จัด 17 กลุ่ม), Topbar (search ⌘K, company switcher, role switcher, lang, theme, noti), Main content
3. **Table-first** — ทุกโมดูลเชิงธุรกรรม (transactional) มี filter bar, KPI, ตารางหลัก, และ action
4. **Bilingual by default** — ทุก label, column header, status pill, tooltip มีทั้ง TH/EN
5. **Document-centric workflow** — เอกสารมี lifecycle: Draft → Pending → Approved → Posted → Paid/Closed พร้อม audit trail
6. **Realistic mock data** — ตัวเลขทางการเงินแบบบริษัทจริง (รายได้ 2,800M บาท, backlog 6,400M)

## 2. Persona & Role
| Role | ใช้งานหลัก |
|------|-----------|
| CEO | Executive dashboard, approval inbox (>10M), project P&L |
| CFO | AR/AP, cashflow, tax, multi-entity consolidation |
| PM | โครงการ, WBS, EVM, VO, Billing, Drawing, RFI |
| Site Engineer | DSR, IR, Punch, Permit, Safety, Mobile app |
| Accountant | GL, AP, AR, tax filing, FA |
| HR | Employee, Payroll, Training, Leave, Performance |
| Procurement | PR, RFQ, PO, Vendor, 3-Way match |

## 3. Module Inventory (80 modules)

### 3.1 Executive (3)
| ID | TH | EN | Purpose |
|----|----|----|---------|
| `exec_ceo` | แดชบอร์ด CEO | CEO Dashboard | Revenue YTD, Backlog, Margin, Pipeline, NPS, Headcount + featured projects + top pipeline |
| `exec_cfo` | แดชบอร์ด CFO | CFO Dashboard | Cash, AR/AP, DSO/DPO, EBITDA, Tax, Interest + overdue AR/AP + 13-week cashflow |
| `exec_coo` | แดชบอร์ด COO | COO Dashboard | Active projects, CPI/SPI, Incident-free days, QC pass, On-time + EVM per project + safety |

### 3.2 Workspace (2)
- `dashboard` — Enterprise dashboard 5 หน้าย่อย (Overview, Projects, Financial, Sales pipeline, HSE)
- `approval` — Inbox อนุมัติแบบ Kanban, bulk action, threshold matrix

### 3.3 Sales / Contract (3)
- `sales` — ใบเสนอราคา (BOQ, VAT, WHT), Pipeline, Win rate analysis
- `ct_contracts` — Contract register (Main / Subcontract / Consultant) ยอดรวม, วันลงนาม, หมดอายุ
- `ct_units` — Unit inventory (ห้อง/บ้าน) ขาย/จอง/โอน + ผู้ซื้อ + กำหนดโอน

### 3.4 CRM & Tender (3)
- `crm_opportunities` — Pipeline Kanban (Qualifying→Proposal→Negotiation→Won/Lost) + probability, expected close
- `crm_tenders` — Tender log (เปิด/ส่งแล้ว/ปิด), deadline countdown, document count
- `crm_estimation` — Estimation/BOQ workbench, cost items, margin target

### 3.5 Projects (5)
- `production` — Project master, Gantt, BOQ, resource loading, WBS, milestone
- `proj_vo` — Change Orders (VO) — pending/approved amount, days impact
- `proj_billing` — Progress Billing (งวดงาน), certification %, retention
- `proj_wbs` — WBS/Cost Control breakdown (budget vs actual vs EV) per level
- `proj_evm` — EVM dashboard — PV/EV/AC, CPI/SPI trend, forecast (EAC/ETC)

### 3.6 Site & Safety (5)
- `sitediary` — Site Diary (ภาพ/สภาพอากาศ/กำลังคน/ความคืบหน้า)
- `proj_dsr` — Daily Site Report — manpower, weather, progress, incidents
- `proj_ir` — Inspection Request (IR) — ขอตรวจ/ผ่าน/ไม่ผ่าน + ผู้ตรวจ
- `proj_punch` — Punch List (snag) ระดับยูนิต, trade, severity
- `proj_permits` — Permit to Work (ทำงานบนที่สูง, Hot work, Confined space)

### 3.7 Design & Docs (4)
- `drawing` — Drawing Viewer พร้อม markup
- `docs_drawings` — Drawing Register (ARC/STR/MEP) rev tracking
- `docs_submittal` — Submittal Log (material sample, shop drawing, MS)
- `docs_rfi` — RFI (คำถาม-ตอบ) priority, SLA
- `docs_trm` — Transmittal (หนังสือส่งเอกสาร) — signed/awaiting

### 3.8 Procurement & SCM (5)
- `purchase` — PO (หลัก) — 3-stage approval, delivery tracking
- `proc_pr` — Purchase Requisition (จากหน้างาน/ฝ่าย)
- `proc_rfq` — RFQ — เปรียบเทียบราคา ผู้ขาย ≥3 รายแบบ ISO 9001
- `proc_vendors` — Vendor Master + scorecard (rating, on-time, QC pass, spend)
- `proc_3way` — 3-Way Match (PO vs GRN vs Invoice) auto-flag variance
- `proc_landed` — Landed Cost นำเข้า — base/freight/duty/insurance

### 3.9 Inventory (3)
- `inventory` — Stock master, reorder point, safety stock
- `inv_grn` — Goods Receipt (GRN)
- `inv_movement` — Stock Movement ledger (receipt/issue/transfer/adjust)
- `inv_count` — Stock Count (cycle count, annual)

### 3.10 Equipment (3)
- `eq_fleet` — Equipment register (crane/roller/loader/mixer) with hours, next maintenance
- `eq_maint` — Maintenance (preventive/corrective) work orders
- `eq_fuel` — Fuel log, cost per km/hour, vendor

### 3.11 Subcontractor (2)
- `sub_list` — Subcontractor master + scorecard
- `sub_contracts` — Sub-contracts — value, billed, retention

### 3.12 HR & Payroll (5)
- `hr` — HR overview (headcount, attendance, leave, turnover)
- `hr_employees` — Employee master (profile, dept, position, salary)
- `hr_payroll` — Payroll (gross, OT, SSO, tax, net) + file PND 1/3/53
- `hr_training` — Training calendar + cost
- `hr_competency` — Competency matrix (ใบอนุญาต กว., AWS, จป., ปั้นจั่น) + expiry alert
- `hr_perf` — Performance review cycle (H1/H2) + KPI score

### 3.13 Finance & Tax (7)
- `accounting` — GL, Chart of Accounts, Journal entries, Trial balance
- `fin_ar` — Accounts Receivable — aging bucket (0-30/30-60/60-90/90+)
- `fin_ap` — Accounts Payable — aging bucket
- `fin_fa` — Fixed Assets — depreciation schedule
- `fin_cashflow` — 13-week cashflow forecast
- `fin_etax` — e-Tax invoice, ภ.พ.30, ภ.ง.ด.1/3/53 — submit + ack
- `fin_wht` — Withholding tax certificate generation
- `fin_multi` — Multi-entity consolidation (TH / SG / VN)

### 3.14 Risk & Insurance (4)
- `risk_register` — Risk register (likelihood × impact × score)
- `risk_insurance` — Insurance policies (CAR/WC/PL)
- `risk_bonds` — Bonds/Guarantees (Performance/Retention/Advance/Bid)
- `risk_warranty` — Defect Liability Period (DLP) tracker

### 3.15 Governance (3)
- `audit` — Audit log (action-level, user, before/after)
- `gov_audit` — Consolidated Audit Trail view
- `gov_matrix` — Approval Matrix (PO/VO/HR by threshold)
- `gov_rbac` — RBAC — roles, users, permissions

### 3.16 BI / Analytics (3)
- `reports` — Report library
- `bi_reports` — Saved report with owner/type/format
- `bi_alerts` — Alerts & Thresholds (cost, cash, safety, EVM)

### 3.17 System (2)
- `mobile` — Site mobile app (iOS frame)
- `settings` — Settings (company, users, integrations)

---

## 4. Cross-cutting Features
- **Language switcher** (TH/EN) — persisted in localStorage
- **Theme switcher** (Light/Dark)
- **Role switcher** — CEO/CFO/PM/Site — เปลี่ยน avatar, crumbs
- **Company switcher** — multi-entity
- **⌘K Command palette** — search any module/record
- **Notification drawer** — approval requests, alerts
- **Onboarding tour** — first visit
- **Module filter** — กรองโมดูลจาก sidebar (80 ตัว)

## 5. Data Model (concept)
### 5.1 Entities หลัก
- Project, WBS, BOQ item
- Drawing, Submittal, RFI, Transmittal
- PR, RFQ, PO, GRN, Invoice (AP), Payment
- SO (Quotation), Contract, Billing (AR), Receipt
- Employee, Payroll, Leave, Training
- Equipment, Maintenance, Fuel
- Journal, Account, FA, Tax filing
- Risk, Insurance, Bond, Warranty

### 5.2 Document Lifecycle (ทั่วไป)
```
Draft → Pending (submit) → Reviewed → Approved → Posted → (Paid / Closed)
                                                      ↓
                                                  Rejected
```

## 6. Audit & Control
- Every document-level action logged: `{ts, user, action, entity, from, to}`
- 3-Way match mandatory for AP Invoices >500k
- Approval Matrix (example):
  - PO <500k → PM only
  - PO 500k–2M → PM + Proc.Dir.
  - PO 2M–10M → PM + Proc.Dir. + CFO
  - PO >10M → PM + CFO + CEO

## 7. Ext Integration (ref.)
- Revenue Department e-Tax API
- SSO (ประกันสังคม) file upload
- Bank (SCB/BBL/Kbank) statement import
- Autodesk BIM360 / Revit (drawings)
- Google Drive / OneDrive (document storage)

## 8. Non-functional
- Desktop 1280+ primary; responsive fallback
- Page render <500ms (SSR or SPA cache)
- Audit retention 10 ปี (กฎหมายบัญชีไทย)
- Backup daily + offsite weekly

## 9. Known gaps / to expand later
- BIM viewer (embed Forge / Speckle)
- IoT sensor integration (CCTV, sensors)
- AI cost estimation assist
- Mobile app (native) for site teams
- Client portal (view progress, billing online)
