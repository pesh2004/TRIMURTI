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
	Code    string
	NameEN  string
	NameTH  string
	Permissions []string // permission codes granted to this role
}

// Baseline permissions seeded across Phase 0. Module-specific permissions are
// added by each module's own seeder in Phase 1+.
var baselinePermissions = []struct {
	Code, Module, Action, Description string
}{
	{"dashboard.read", "dashboard", "read", "View dashboards"},
	{"audit.read", "audit", "read", "View audit log"},
	{"gov_rbac.read", "gov_rbac", "read", "View roles and permissions"},
	{"gov_rbac.write", "gov_rbac", "write", "Manage roles and permissions"},
	{"settings.read", "settings", "read", "View settings"},
	{"settings.write", "settings", "write", "Edit settings"},
	{"hr_employees.read", "hr_employees", "read", "View employees"},
	{"hr_employees.write", "hr_employees", "write", "Manage employees"},
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
		Permissions: []string{"dashboard.read", "audit.read", "approval.read", "approval.act", "hr_employees.read"},
	},
	{
		Code: "CFO", NameEN: "Chief Financial Officer", NameTH: "ประธานเจ้าหน้าที่การเงิน",
		Permissions: []string{"dashboard.read", "audit.read", "approval.read", "approval.act"},
	},
	{
		Code: "PM", NameEN: "Project Manager", NameTH: "ผู้จัดการโครงการ",
		Permissions: []string{"dashboard.read", "approval.read", "approval.act", "hr_employees.read"},
	},
	{
		Code: "SITE_ENGINEER", NameEN: "Site Engineer", NameTH: "วิศวกรประจำหน้างาน",
		Permissions: []string{"dashboard.read"},
	},
	{
		Code: "AUDITOR", NameEN: "Auditor", NameTH: "ผู้ตรวจสอบ",
		Permissions: []string{"dashboard.read", "audit.read"},
	},
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

	// ---- admin user ----
	email := strings.ToLower(strings.TrimSpace(os.Getenv("SEED_ADMIN_EMAIL")))
	if email == "" {
		email = "admin@trimurti.local"
	}
	password := os.Getenv("SEED_ADMIN_PASSWORD")
	generated := false
	if password == "" {
		password = mustRandomPassword(20)
		generated = true
	}
	hash, err := auth.Hash(password, auth.DefaultParams)
	if err != nil {
		die(err)
	}

	var userID int64
	err = tx.QueryRow(ctx, `
		INSERT INTO users (email, username, password_hash, display_name, display_name_th)
		VALUES ($1,$2,$3,$4,$5)
		ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name
		RETURNING id`, email, "admin", hash, "Administrator", "ผู้ดูแลระบบ").Scan(&userID)
	if err != nil {
		die(fmt.Errorf("upsert admin: %w", err))
	}

	// If the user already existed, keep their current password (don't reset silently).
	var existed bool
	if err := tx.QueryRow(ctx, `SELECT password_hash <> $1 FROM users WHERE id = $2`, hash, userID).Scan(&existed); err == nil && existed {
		generated = false
		password = "<unchanged>"
	}

	if _, err := tx.Exec(ctx, `
		INSERT INTO user_roles (user_id, role_id)
		SELECT $1, r.id FROM roles r WHERE r.code = 'ADMIN'
		ON CONFLICT DO NOTHING`, userID); err != nil {
		die(fmt.Errorf("assign ADMIN: %w", err))
	}

	if err := tx.Commit(ctx); err != nil {
		die(err)
	}

	fmt.Println("seed: complete")
	fmt.Printf("  admin email:    %s\n", email)
	if generated {
		fmt.Printf("  admin password: %s   <-- write this down; it is NOT stored\n", password)
	} else {
		fmt.Printf("  admin password: unchanged (use existing or set SEED_ADMIN_PASSWORD to rotate)\n")
	}
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
