-- Extensions enabled on fresh DB creation.
-- pgcrypto: field-level encryption for PII (ID card, bank account, salary)
-- uuid-ossp: uuid_generate_v4() for session IDs, request IDs
-- citext: case-insensitive text (email, usernames)
-- pg_trgm: fuzzy text search for the ⌘K palette
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "citext";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
