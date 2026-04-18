package auth

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"

	"golang.org/x/crypto/argon2"
)

// Argon2Params captures one specific parameter choice. Stored inline with the hash
// so parameters can be tuned upward over time without breaking existing users.
type Argon2Params struct {
	MemoryKB    uint32
	Iterations  uint32
	Parallelism uint8
	SaltLen     uint32
	KeyLen      uint32
}

var DefaultParams = Argon2Params{
	MemoryKB:    64 * 1024, // 64 MB
	Iterations:  3,
	Parallelism: 4,
	SaltLen:     16,
	KeyLen:      32,
}

var (
	ErrInvalidHash      = errors.New("auth: invalid password hash format")
	ErrUnsupportedAlgo  = errors.New("auth: unsupported password hash algorithm")
	ErrPasswordMismatch = errors.New("auth: password does not match")
)

// Hash returns an encoded argon2id hash string suitable for direct storage.
// Format:  $argon2id$v=19$m=65536,t=3,p=4$<b64salt>$<b64hash>
func Hash(password string, p Argon2Params) (string, error) {
	if p.MemoryKB == 0 {
		p = DefaultParams
	}
	salt := make([]byte, p.SaltLen)
	if _, err := rand.Read(salt); err != nil {
		return "", fmt.Errorf("generating salt: %w", err)
	}
	hash := argon2.IDKey([]byte(password), salt, p.Iterations, p.MemoryKB, p.Parallelism, p.KeyLen)
	encoded := fmt.Sprintf("$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s",
		argon2.Version,
		p.MemoryKB,
		p.Iterations,
		p.Parallelism,
		base64.RawStdEncoding.EncodeToString(salt),
		base64.RawStdEncoding.EncodeToString(hash),
	)
	return encoded, nil
}

// Verify returns nil when the password matches the encoded hash.
// Uses constant-time comparison to avoid timing leaks.
func Verify(password, encoded string) error {
	parts := strings.Split(encoded, "$")
	if len(parts) != 6 {
		return ErrInvalidHash
	}
	if parts[1] != "argon2id" {
		return ErrUnsupportedAlgo
	}
	var version int
	if _, err := fmt.Sscanf(parts[2], "v=%d", &version); err != nil || version != argon2.Version {
		return ErrInvalidHash
	}
	var memory, iterations uint32
	var parallel uint8
	if _, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &memory, &iterations, &parallel); err != nil {
		return ErrInvalidHash
	}
	salt, err := base64.RawStdEncoding.DecodeString(parts[4])
	if err != nil {
		return ErrInvalidHash
	}
	want, err := base64.RawStdEncoding.DecodeString(parts[5])
	if err != nil {
		return ErrInvalidHash
	}
	got := argon2.IDKey([]byte(password), salt, iterations, memory, parallel, uint32(len(want)))
	if subtle.ConstantTimeCompare(want, got) != 1 {
		return ErrPasswordMismatch
	}
	return nil
}
