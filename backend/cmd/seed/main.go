// seed creates the baseline roles, permissions and an admin user.
// Safe to run multiple times — upserts where possible.
package main

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/ama-bmgpesh/trimurti-erp/backend/internal/auth"
	"github.com/ama-bmgpesh/trimurti-erp/backend/internal/config"
	"github.com/ama-bmgpesh/trimurti-erp/backend/internal/db"
)

type roleDef struct {
	Code        string
	NameEN      string
	NameTH      string
	Permissions []string // permission codes granted to this role
}

// Baseline permissions. Each module extends this as it lands.
var baselinePermissions = []struct {
	Code, Module, Action, Description string
}{
	{"dashboard.read", "dashboard", "read", "View dashboards"},
	{"audit.read", "audit", "read", "View audit log"},
	{"gov_rbac.read", "gov_rbac", "read", "View roles and permissions"},
	{"gov_rbac.write", "gov_rbac", "write", "Manage roles and permissions"},
	{"settings.read", "settings", "read", "View settings"},
	{"settings.write", "settings", "write", "Edit settings"},
	{"hr_master.read", "hr_master", "read", "View companies, departments, positions"},
	{"hr_employees.read", "hr_employees", "read", "View employees (PII masked)"},
	{"hr_employees.write", "hr_employees", "write", "Create and edit employees"},
	{"hr_employees.terminate", "hr_employees", "terminate", "Terminate employees"},
	{"hr_employees.reveal_pii", "hr_employees", "reveal_pii", "Reveal national_id and salary"},
	{"approval.read", "approval", "read", "View approval inbox"},
	{"approval.act", "approval", "act", "Approve or reject items"},
}

var roles = []roleDef{
	{
		Code: "ADMIN", NameEN: "Administrator", NameTH: "ผู้ดูแลระบบ",
		Permissions: allPermissionCodes(),
	},
	{
		Code: "CEO", NameEN: "Chief Executive Officer", NameTH: "ประธานเจ้าหน้าที่บริหาร",
		Permissions: []string{
			"dashboard.read", "audit.read", "approval.read", "approval.act",
			"hr_master.read", "hr_employees.read", "hr_employees.reveal_pii",
		},
	},
	{
		Code: "CFO", NameEN: "Chief Financial Officer", NameTH: "ประธานเจ้าหน้าที่การเงิน",
		Permissions: []string{
			"dashboard.read", "audit.read", "approval.read", "approval.act",
			"hr_master.read", "hr_employees.read", "hr_employees.reveal_pii",
		},
	},
	{
		Code: "HR", NameEN: "Human Resources", NameTH: "ฝ่ายบุคคล",
		Permissions: []string{
			"dashboard.read", "hr_master.read",
			"hr_employees.read", "hr_employees.write",
			"hr_employees.terminate", "hr_employees.reveal_pii",
		},
	},
	{
		Code: "PM", NameEN: "Project Manager", NameTH: "ผู้จัดการโครงการ",
		Permissions: []string{
			"dashboard.read", "approval.read", "approval.act",
			"hr_master.read", "hr_employees.read",
		},
	},
	{
		Code: "SITE_ENGINEER", NameEN: "Site Engineer", NameTH: "วิศวกรประจำหน้างาน",
		Permissions: []string{"dashboard.read"},
	},
	{
		Code: "AUDITOR", NameEN: "Auditor", NameTH: "ผู้ตรวจสอบ",
		Permissions: []string{
			"dashboard.read", "audit.read",
			"hr_master.read", "hr_employees.read",
		},
	},
}

// Default HR master data — seeded only if tables are empty. Safe to run repeatedly.
type deptDef struct{ Code, NameTH, NameEN string }
type posDef struct {
	Code, NameTH, NameEN string
	Level                int
}

var defaultCompany = struct {
	Code, NameTH, NameEN, TaxID, Phone, Email string
}{
	Code:   "TMR",
	NameTH: "บริษัท ตรีมูรติ เดโม จำกัด",
	NameEN: "Trimurti Demo Co., Ltd.",
	TaxID:  "0105560000000",
	Phone:  "+66-2-000-0000",
	Email:  "info@trimurti.local",
}

var defaultDepartments = []deptDef{
	{"EXEC", "บริหาร", "Executive"},
	{"FIN", "บัญชี-การเงิน", "Finance & Accounting"},
	{"OPS", "ก่อสร้าง", "Construction Operations"},
	{"PROC", "จัดซื้อ", "Procurement"},
	{"HR", "บุคคล", "Human Resources"},
}

var defaultPositions = []posDef{
	{"CEO", "ประธานเจ้าหน้าที่บริหาร", "Chief Executive Officer", 10},
	{"CFO", "ประธานเจ้าหน้าที่การเงิน", "Chief Financial Officer", 9},
	{"COO", "ประธานเจ้าหน้าที่ปฏิบัติการ", "Chief Operating Officer", 9},
	{"PM", "ผู้จัดการโครงการ", "Project Manager", 7},
	{"SE", "วิศวกรประจำหน้างาน", "Site Engineer", 5},
	{"FM", "หัวหน้างาน", "Foreman", 4},
	{"ACC", "เจ้าหน้าที่บัญชี", "Accountant", 4},
	{"PO", "เจ้าหน้าที่จัดซื้อ", "Purchasing Officer", 4},
	{"HRO", "เจ้าหน้าที่บุคคล", "HR Officer", 4},
	{"WKR", "คนงาน", "Worker", 1},
}

func allPermissionCodes() []string {
	out := make([]string, 0, len(baselinePermissions))
	for _, p := range baselinePermissions {
		out = append(out, p.Code)
	}
	return out
}

func main() {
	cfg, err := config.Load()
	if err != nil {
		die(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	pool, err := db.NewPool(ctx, cfg.DatabaseURL)
	if err != nil {
		die(err)
	}
	defer pool.Close()

	tx, err := pool.Begin(ctx)
	if err != nil {
		die(err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	// ---- permissions ----
	for _, p := range baselinePermissions {
		if _, err := tx.Exec(ctx, `
			INSERT INTO permissions (code, module, action, description)
			VALUES ($1,$2,$3,$4)
			ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description`,
			p.Code, p.Module, p.Action, p.Description); err != nil {
			die(fmt.Errorf("upsert permission %s: %w", p.Code, err))
		}
	}

	// ---- roles ----
	for _, r := range roles {
		var roleID int64
		err := tx.QueryRow(ctx, `
			INSERT INTO roles (code, name_en, name_th, is_system)
			VALUES ($1,$2,$3,TRUE)
			ON CONFLICT (code) DO UPDATE SET name_en = EXCLUDED.name_en, name_th = EXCLUDED.name_th
			RETURNING id`, r.Code, r.NameEN, r.NameTH).Scan(&roleID)
		if err != nil {
			die(fmt.Errorf("upsert role %s: %w", r.Code, err))
		}
		for _, permCode := range r.Permissions {
			if _, err := tx.Exec(ctx, `
				INSERT INTO role_permissions (role_id, permission_id)
				SELECT $1, p.id FROM permissions p WHERE p.code = $2
				ON CONFLICT DO NOTHING`, roleID, permCode); err != nil {
				die(fmt.Errorf("grant %s to %s: %w", permCode, r.Code, err))
			}
		}
	}

	// ---- HR master: company / departments / positions ----
	// Runs before the admin user so `default_company_id` can be set on the
	// initial insert. Upserts so the seed remains idempotent. Migrations
	// 0002+ (and 0006 for default_company_id / user_companies) must be
	// applied first.
	var companyID int64
	err = tx.QueryRow(ctx, `
		INSERT INTO companies (code, name_th, name_en, tax_id, phone, email)
		VALUES ($1,$2,$3,$4,$5,$6)
		ON CONFLICT (code) DO UPDATE SET name_th = EXCLUDED.name_th, name_en = EXCLUDED.name_en
		RETURNING id`,
		defaultCompany.Code, defaultCompany.NameTH, defaultCompany.NameEN,
		defaultCompany.TaxID, defaultCompany.Phone, defaultCompany.Email).Scan(&companyID)
	if err != nil {
		die(fmt.Errorf("upsert company: %w", err))
	}

	for _, d := range defaultDepartments {
		if _, err := tx.Exec(ctx, `
			INSERT INTO departments (company_id, code, name_th, name_en)
			VALUES ($1,$2,$3,$4)
			ON CONFLICT (company_id, code) DO UPDATE SET name_th = EXCLUDED.name_th, name_en = EXCLUDED.name_en`,
			companyID, d.Code, d.NameTH, d.NameEN); err != nil {
			die(fmt.Errorf("upsert department %s: %w", d.Code, err))
		}
	}

	for _, p := range defaultPositions {
		if _, err := tx.Exec(ctx, `
			INSERT INTO positions (code, name_th, name_en, level)
			VALUES ($1,$2,$3,$4)
			ON CONFLICT (code) DO UPDATE SET name_th = EXCLUDED.name_th, name_en = EXCLUDED.name_en, level = EXCLUDED.level`,
			p.Code, p.NameTH, p.NameEN, p.Level); err != nil {
			die(fmt.Errorf("upsert position %s: %w", p.Code, err))
		}
	}

	// ---- admin user ----
	email := strings.ToLower(strings.TrimSpace(os.Getenv("SEED_ADMIN_EMAIL")))
	if email == "" {
		email = "admin@trimurti.local"
	}
	// Behaviour matrix:
	//   SEED_ADMIN_PASSWORD unset + user absent  → auto-generate, persist, print once.
	//   SEED_ADMIN_PASSWORD unset + user present → keep current password ("unchanged").
	//   SEED_ADMIN_PASSWORD set   + user absent  → persist given password.
	//   SEED_ADMIN_PASSWORD set   + user present → ROTATE to given password.
	//
	// Previous behaviour silently ignored the set-but-user-present case, which
	// made Session-2 password rotation impossible without SQL surgery.
	explicitPassword := os.Getenv("SEED_ADMIN_PASSWORD")
	password := explicitPassword
	generated := false
	if password == "" {
		password = mustRandomPassword(20)
		generated = true
	}
	hash, err := auth.Hash(password, auth.DefaultParams)
	if err != nil {
		die(err)
	}

	// Was the user there before we touched the table?
	var existedBefore bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM users WHERE email=$1)`, email).Scan(&existedBefore); err != nil {
		die(fmt.Errorf("check admin existence: %w", err))
	}

	// Build the UPSERT conditionally: update password_hash only when the caller
	// explicitly provided a password. Otherwise keep the existing hash so a
	// no-op seed run never resets credentials by accident.
	//
	// default_company_id is set on insert; on conflict we only fill it when
	// NULL so a user who has already chosen a different default is not
	// stomped on re-seed.
	upsertSQL := `
		INSERT INTO users (email, username, password_hash, display_name, display_name_th, default_company_id)
		VALUES ($1,$2,$3,$4,$5,$6)
		ON CONFLICT (email) DO UPDATE SET
			display_name       = EXCLUDED.display_name,
			default_company_id = COALESCE(users.default_company_id, EXCLUDED.default_company_id)
		RETURNING id`
	if explicitPassword != "" {
		upsertSQL = `
			INSERT INTO users (email, username, password_hash, display_name, display_name_th, default_company_id)
			VALUES ($1,$2,$3,$4,$5,$6)
			ON CONFLICT (email) DO UPDATE SET
				display_name        = EXCLUDED.display_name,
				password_hash       = EXCLUDED.password_hash,
				password_changed_at = NOW(),
				failed_login_attempts = 0,
				locked_until        = NULL,
				default_company_id  = COALESCE(users.default_company_id, EXCLUDED.default_company_id)
			RETURNING id`
	}

	var userID int64
	if err := tx.QueryRow(ctx, upsertSQL, email, "admin", hash, "Administrator", "ผู้ดูแลระบบ", companyID).Scan(&userID); err != nil {
		die(fmt.Errorf("upsert admin: %w", err))
	}

	// Message for the operator. Only overwrite `password` for display when we
	// truly left it alone (no explicit env, user was already there).
	rotated := explicitPassword != "" && existedBefore
	if !generated && !rotated {
		password = "<unchanged>"
	}

	if _, err := tx.Exec(ctx, `
		INSERT INTO user_roles (user_id, role_id)
		SELECT $1, r.id FROM roles r WHERE r.code = 'ADMIN'
		ON CONFLICT DO NOTHING`, userID); err != nil {
		die(fmt.Errorf("assign ADMIN: %w", err))
	}

	// Admin is a member of the seeded company. On rerun we keep the row
	// but do NOT stomp is_default — if the operator later added admin to
	// a second company with is_default=TRUE there, forcing the original
	// row back to TRUE would make two rows default at once and violate
	// uq_user_companies_one_default. Membership is what we care about;
	// the default flag is the user's choice thereafter.
	if _, err := tx.Exec(ctx, `
		INSERT INTO user_companies (user_id, company_id, is_default)
		VALUES ($1, $2, TRUE)
		ON CONFLICT (user_id, company_id) DO NOTHING`,
		userID, companyID); err != nil {
		die(fmt.Errorf("assign admin → company: %w", err))
	}

	if err := tx.Commit(ctx); err != nil {
		die(err)
	}

	fmt.Println("seed: complete")
	fmt.Printf("  admin email:    %s\n", email)
	switch {
	case generated:
		fmt.Printf("  admin password: %s   <-- write this down; it is NOT stored\n", password)
	case rotated:
		fmt.Printf("  admin password: ROTATED to the value from SEED_ADMIN_PASSWORD\n")
	default:
		fmt.Printf("  admin password: unchanged (use existing or set SEED_ADMIN_PASSWORD to rotate)\n")
	}
	fmt.Printf("  company:        %s (%s)\n", defaultCompany.NameEN, defaultCompany.Code)
	fmt.Printf("  departments:    %d seeded\n", len(defaultDepartments))
	fmt.Printf("  positions:      %d seeded\n", len(defaultPositions))
}

func mustRandomPassword(n int) string {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		die(err)
	}
	return base64.RawURLEncoding.EncodeToString(b)[:n]
}

func die(err error) {
	fmt.Fprintf(os.Stderr, "seed: %v\n", err)
	os.Exit(1)
}

var _ = pgx.ErrNoRows // keep the import; may be used when seed grows
