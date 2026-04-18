-- name: WriteAuditLog :exec
INSERT INTO audit_log (
    user_id, request_id, ip_address, user_agent,
    action, entity, entity_id, before_json, after_json,
    prev_hash, row_hash
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
);

-- name: GetLastAuditHash :one
SELECT row_hash
FROM audit_log
ORDER BY ts DESC, id DESC
LIMIT 1;

-- name: ListAuditLog :many
SELECT *
FROM audit_log
WHERE ($1::BIGINT IS NULL OR user_id = $1)
  AND ($2::TEXT IS NULL OR entity = $2)
  AND ts >= $3 AND ts < $4
ORDER BY ts DESC
LIMIT $5 OFFSET $6;
