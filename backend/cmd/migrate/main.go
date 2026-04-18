// migrate runs golang-migrate against DATABASE_URL.
// Usage:
//
//	go run ./cmd/migrate up              # apply all pending
//	go run ./cmd/migrate down 1          # rollback one step
//	go run ./cmd/migrate goto 3          # go to specific version
//	go run ./cmd/migrate version         # print current version
package main

import (
	"errors"
	"fmt"
	"os"
	"strconv"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"

	"github.com/ama-bmgpesh/trimurti-erp/backend/internal/config"
)

func main() {
	if len(os.Args) < 2 {
		usage()
		os.Exit(2)
	}
	cmd := os.Args[1]

	cfg, err := config.Load()
	if err != nil {
		die(err)
	}

	m, err := migrate.New("file://migrations", cfg.DatabaseURL)
	if err != nil {
		die(fmt.Errorf("opening migrate: %w", err))
	}
	defer func() { _, _ = m.Close() }()

	switch cmd {
	case "up":
		if err := m.Up(); err != nil && !errors.Is(err, migrate.ErrNoChange) {
			die(err)
		}
		fmt.Println("migrate: up complete")
	case "down":
		steps := 1
		if len(os.Args) >= 3 {
			steps, err = strconv.Atoi(os.Args[2])
			if err != nil {
				die(fmt.Errorf("invalid steps: %w", err))
			}
		}
		if err := m.Steps(-steps); err != nil {
			die(err)
		}
		fmt.Printf("migrate: rolled back %d step(s)\n", steps)
	case "goto":
		if len(os.Args) < 3 {
			die(errors.New("goto requires a version"))
		}
		v, err := strconv.ParseUint(os.Args[2], 10, 32)
		if err != nil {
			die(err)
		}
		if err := m.Migrate(uint(v)); err != nil {
			die(err)
		}
		fmt.Printf("migrate: at version %d\n", v)
	case "version":
		v, dirty, err := m.Version()
		if errors.Is(err, migrate.ErrNilVersion) {
			fmt.Println("migrate: no migrations applied")
			return
		}
		if err != nil {
			die(err)
		}
		fmt.Printf("migrate: version %d dirty=%t\n", v, dirty)
	case "force":
		if len(os.Args) < 3 {
			die(errors.New("force requires a version"))
		}
		v, err := strconv.Atoi(os.Args[2])
		if err != nil {
			die(err)
		}
		if err := m.Force(v); err != nil {
			die(err)
		}
		fmt.Printf("migrate: forced to version %d\n", v)
	default:
		usage()
		os.Exit(2)
	}
}

func usage() {
	fmt.Fprintln(os.Stderr, "usage: migrate <up|down [N]|goto V|version|force V>")
}

func die(err error) {
	fmt.Fprintf(os.Stderr, "migrate: %v\n", err)
	os.Exit(1)
}
