-- name: ListRoles :many
SELECT * FROM roles ORDER BY code;

-- name: ListPermissions :many
SELECT * FROM permissions ORDER BY module, action;

-- name: CreateRole :one
INSERT INTO roles (code, name_en, name_th, description, is_system)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: UpsertPermission :one
INSERT INTO permissions (code, module, action, description)
VALUES ($1, $2, $3, $4)
ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description
RETURNING *;

-- name: GrantPermissionToRole :exec
INSERT INTO role_permissions (role_id, permission_id)
VALUES ($1, $2)
ON CONFLICT DO NOTHING;

-- name: AssignRoleToUser :exec
INSERT INTO user_roles (user_id, role_id, assigned_by)
VALUES ($1, $2, $3)
ON CONFLICT DO NOTHING;

-- name: GetRoleByCode :one
SELECT * FROM roles WHERE code = $1 LIMIT 1;

-- name: GetPermissionByCode :one
SELECT * FROM permissions WHERE code = $1 LIMIT 1;
