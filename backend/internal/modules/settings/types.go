package settings

import "time"

// CompanyProfile is the full shape of an editable company record. Rates
// stay in decimal string form (NUMERIC(5,2) on the DB side) so the
// frontend can round-trip them verbatim without going through float64.
type CompanyProfile struct {
	ID                   int64     `json:"id"`
	Code                 string    `json:"code"`
	NameTH               string    `json:"name_th"`
	NameEN               string    `json:"name_en"`
	TaxID                *string   `json:"tax_id,omitempty"`
	Phone                *string   `json:"phone,omitempty"`
	Email                *string   `json:"email,omitempty"`
	Website              *string   `json:"website,omitempty"`
	Address              *Address  `json:"address,omitempty"`
	Currency             string    `json:"currency"`
	Timezone             string    `json:"timezone"`
	FiscalYearStartMonth int16     `json:"fiscal_year_start_month"`
	VatRate              string    `json:"vat_rate"`
	WhtRate              string    `json:"wht_rate"`
	IsActive             bool      `json:"is_active"`
	CreatedAt            time.Time `json:"created_at"`
	UpdatedAt            time.Time `json:"updated_at"`
}

// Address is the typed form of companies.address_json. Kept open-ended
// (lines array + optional country code) so the DB column stays as-is
// regardless of which country's mailing-address style the UI needs next.
type Address struct {
	Lines   []string `json:"lines"`
	Country *string  `json:"country,omitempty"`
}

// UpdateCompanyRequest is a sparse patch — only non-nil fields are
// written. The payload is bound verbatim from the JSON body; validation
// is enforced in validate.go + UpdateCompany.
type UpdateCompanyRequest struct {
	NameTH               *string  `json:"name_th,omitempty"`
	NameEN               *string  `json:"name_en,omitempty"`
	TaxID                *string  `json:"tax_id,omitempty"`
	Phone                *string  `json:"phone,omitempty"`
	Email                *string  `json:"email,omitempty"`
	Website              *string  `json:"website,omitempty"`
	Address              *Address `json:"address,omitempty"`
	Currency             *string  `json:"currency,omitempty"`
	Timezone             *string  `json:"timezone,omitempty"`
	FiscalYearStartMonth *int16   `json:"fiscal_year_start_month,omitempty"`
	VatRate              *string  `json:"vat_rate,omitempty"`
	WhtRate              *string  `json:"wht_rate,omitempty"`
}

// IntegrationsStatus is a read-only snapshot of env-driven external
// integrations. Rendered as a table in the Integrations tab. Secrets
// stay in .env + deploy/SECRETS.md; this endpoint never exposes them.
type IntegrationsStatus struct {
	SMTP    IntegrationSMTP    `json:"smtp"`
	Storage IntegrationStorage `json:"storage"`
	Payment IntegrationPlanned `json:"payment"`
	ETax    IntegrationPlanned `json:"e_tax"`
}

type IntegrationSMTP struct {
	Configured bool   `json:"configured"`
	Host       string `json:"host"`
	Port       int    `json:"port"`
	From       string `json:"from"`
}

type IntegrationStorage struct {
	Mode string `json:"mode"` // "local" today; "s3" once internal/storage lands.
}

type IntegrationPlanned struct {
	Configured bool   `json:"configured"`
	Provider   string `json:"provider"`
	Note       string `json:"note"`
}
