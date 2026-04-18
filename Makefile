.DEFAULT_GOAL := help
SHELL := /bin/bash

# ---------- Meta ----------
.PHONY: help
help: ## Show this help
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_.-]+:.*?## / {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

# ---------- Local infra ----------
.PHONY: up
up: ## Start postgres + redis + mailhog via docker compose
	docker compose up -d
	@echo "Postgres: localhost:5432 | Redis: localhost:6379 | Mailhog UI: http://localhost:8025"

.PHONY: down
down: ## Stop docker compose stack
	docker compose down

.PHONY: reset-db
reset-db: ## DROP and recreate the dev database (destructive)
	docker compose exec -T postgres psql -U trimurti -d postgres -c "DROP DATABASE IF EXISTS trimurti;"
	docker compose exec -T postgres psql -U trimurti -d postgres -c "CREATE DATABASE trimurti;"
	$(MAKE) migrate

# ---------- Backend ----------
.PHONY: migrate
migrate: ## Apply all pending DB migrations
	cd backend && go run ./cmd/migrate up

.PHONY: migrate-down
migrate-down: ## Roll back the most recent migration
	cd backend && go run ./cmd/migrate down 1

.PHONY: seed
seed: ## Seed admin user + canonical roles
	cd backend && go run ./cmd/seed

.PHONY: sqlc
sqlc: ## Regenerate Go code from queries/*.sql (requires sqlc)
	cd backend && sqlc generate

.PHONY: backend
backend: ## Run backend with hot reload (requires air: go install github.com/air-verse/air@latest)
	cd backend && air

.PHONY: backend-run
backend-run: ## Run backend once (no hot reload)
	cd backend && go run ./cmd/api

.PHONY: backend-test
backend-test: ## Run backend tests with race detector
	cd backend && go test -race -count=1 ./...

.PHONY: backend-lint
backend-lint: ## Run backend linters
	cd backend && go vet ./... && golangci-lint run

# ---------- Frontend ----------
.PHONY: frontend
frontend: ## Run Vite dev server on :5173
	cd frontend && npm run dev

.PHONY: frontend-build
frontend-build: ## Production build frontend
	cd frontend && npm run build

.PHONY: frontend-test
frontend-test: ## Run frontend tests (vitest)
	cd frontend && npm test -- --run

.PHONY: frontend-lint
frontend-lint: ## Run frontend linter + type check
	cd frontend && npm run lint && npm run typecheck

.PHONY: frontend-install
frontend-install: ## Install frontend deps
	cd frontend && npm install

# ---------- All ----------
.PHONY: dev
dev: ## Start backend + frontend concurrently (needs docker infra up first)
	@trap 'kill 0' INT; \
	(cd backend && air) & \
	(cd frontend && npm run dev) & \
	wait

.PHONY: test
test: backend-test frontend-test ## Run all tests

.PHONY: lint
lint: backend-lint frontend-lint ## Run all linters

.PHONY: build
build: ## Build both backend binary and frontend static bundle
	cd backend && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o bin/api ./cmd/api
	cd frontend && npm run build
