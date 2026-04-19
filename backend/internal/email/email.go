// Package email wraps outbound mail for password resets and (future)
// notifications. Two transports:
//
//   - SMTPSender hits a real SMTP relay (SendGrid, SES, Gmail app-password,
//     Mailhog in dev). Used when SMTP_HOST is non-empty.
//   - ConsoleSender prints the message to stderr. Used in CI and as a safe
//     fallback when SMTP isn't configured — the operator can `docker
//     compose logs backend` to retrieve a reset link without needing a
//     real mail provider wired up.
//
// The package intentionally avoids HTML for now; plain text bodies survive
// every client and don't require a templater dependency.
package email

import (
	"context"
	"crypto/tls"
	"fmt"
	"net"
	"net/smtp"
	"os"
	"strings"
	"time"
)

// Message is the minimum the handlers need to send mail.
type Message struct {
	To      string
	Subject string
	Body    string
}

// Sender is what the rest of the app depends on. Implementations must be
// safe for concurrent use by multiple goroutines.
type Sender interface {
	Send(ctx context.Context, m Message) error
}

// NewFromEnv picks a sender based on config. It is called once at startup.
//
//   - host empty → ConsoleSender (dev / CI / preflight)
//   - host set   → SMTPSender (prod)
//
// The returned sender is always non-nil; it never errors at construction so
// the API server can still boot when SMTP is misconfigured. Individual
// Send() calls error instead, which lets the password-reset path degrade
// gracefully (the reset link is still written to audit + logs).
func NewFromEnv(host string, port int, from, user, pass string) Sender {
	if strings.TrimSpace(host) == "" {
		return &ConsoleSender{From: from}
	}
	return &SMTPSender{
		Host: host, Port: port, From: from,
		User: user, Pass: pass,
	}
}

// ConsoleSender prints to stderr. Used when SMTP is not configured.
type ConsoleSender struct {
	From string
}

func (c *ConsoleSender) Send(_ context.Context, m Message) error {
	fmt.Fprintf(os.Stderr,
		"\n--- email (console fallback) ---\nFrom: %s\nTo:   %s\nSubject: %s\n\n%s\n--- end ---\n\n",
		c.From, m.To, m.Subject, m.Body)
	return nil
}

// SMTPSender uses net/smtp with STARTTLS when the server supports it.
// Auth uses PLAIN; fine for every major provider and for Mailhog (which
// ignores auth entirely).
type SMTPSender struct {
	Host string
	Port int
	From string
	User string
	Pass string
}

func (s *SMTPSender) Send(ctx context.Context, m Message) error {
	addr := fmt.Sprintf("%s:%d", s.Host, s.Port)

	// net/smtp has no native context support; wrap dial in a goroutine so
	// a dead server doesn't hang the request indefinitely.
	type dialResult struct {
		c   *smtp.Client
		err error
	}
	ch := make(chan dialResult, 1)
	go func() {
		d := &net.Dialer{Timeout: 10 * time.Second}
		conn, err := d.DialContext(ctx, "tcp", addr)
		if err != nil {
			ch <- dialResult{err: err}
			return
		}
		c, err := smtp.NewClient(conn, s.Host)
		ch <- dialResult{c: c, err: err}
	}()

	var r dialResult
	select {
	case <-ctx.Done():
		return ctx.Err()
	case r = <-ch:
	}
	if r.err != nil {
		return fmt.Errorf("smtp dial: %w", r.err)
	}
	c := r.c
	defer func() { _ = c.Close() }()

	// STARTTLS if the server offers it — providers require it.
	if ok, _ := c.Extension("STARTTLS"); ok {
		if err := c.StartTLS(&tls.Config{ServerName: s.Host, MinVersion: tls.VersionTLS12}); err != nil {
			return fmt.Errorf("starttls: %w", err)
		}
	}
	if s.User != "" {
		if err := c.Auth(smtp.PlainAuth("", s.User, s.Pass, s.Host)); err != nil {
			return fmt.Errorf("smtp auth: %w", err)
		}
	}
	if err := c.Mail(s.From); err != nil {
		return fmt.Errorf("smtp MAIL FROM: %w", err)
	}
	if err := c.Rcpt(m.To); err != nil {
		return fmt.Errorf("smtp RCPT TO: %w", err)
	}
	w, err := c.Data()
	if err != nil {
		return fmt.Errorf("smtp DATA: %w", err)
	}
	body := fmt.Sprintf(
		"From: %s\r\nTo: %s\r\nSubject: %s\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n%s",
		s.From, m.To, m.Subject, m.Body,
	)
	if _, err := w.Write([]byte(body)); err != nil {
		return fmt.Errorf("smtp body: %w", err)
	}
	if err := w.Close(); err != nil {
		return fmt.Errorf("smtp body close: %w", err)
	}
	return c.Quit()
}
