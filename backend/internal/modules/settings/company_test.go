package settings

import (
	"strings"
	"testing"
)

func TestBuildUpdateSet_EmptyPatchProducesNoSQL(t *testing.T) {
	req := &UpdateCompanyRequest{}
	set, args, err := buildUpdateSet(req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if set != "" || len(args) != 0 {
		t.Errorf("expected empty patch, got set=%q args=%v", set, args)
	}
}

func TestBuildUpdateSet_PatchesOnlyProvidedFields(t *testing.T) {
	vat := "7.50"
	month := int16(4)
	name := "Trimurti Renamed"
	req := &UpdateCompanyRequest{NameEN: &name, VatRate: &vat, FiscalYearStartMonth: &month}

	set, args, err := buildUpdateSet(req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(set, "name_en") || !strings.Contains(set, "vat_rate") || !strings.Contains(set, "fiscal_year_start_month") {
		t.Errorf("expected name_en, vat_rate, fiscal_year_start_month in SET clause, got %q", set)
	}
	if strings.Contains(set, "wht_rate") || strings.Contains(set, "currency") {
		t.Errorf("unexpected field present: %q", set)
	}
	if len(args) != 3 {
		t.Errorf("expected 3 args, got %d", len(args))
	}
}

func TestBuildUpdateSet_EmptyOptionalBecomesNULL(t *testing.T) {
	empty := "  "
	req := &UpdateCompanyRequest{Phone: &empty}
	_, args, err := buildUpdateSet(req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(args) != 1 || args[0] != nil {
		t.Errorf("expected nil arg for empty optional, got %v", args)
	}
}

func TestValidatePatch_RejectsEmptyNames(t *testing.T) {
	empty := "   "
	if err := validatePatch(&UpdateCompanyRequest{NameTH: &empty}); err == nil {
		t.Error("empty name_th should be rejected")
	}
	if err := validatePatch(&UpdateCompanyRequest{NameEN: &empty}); err == nil {
		t.Error("empty name_en should be rejected")
	}
}

func TestValidatePatch_InvalidTaxIDRejected(t *testing.T) {
	bad := "1234567890123" // right length, wrong Luhn checksum
	if err := validatePatch(&UpdateCompanyRequest{TaxID: &bad}); err == nil {
		t.Error("invalid tax_id checksum should be rejected")
	}
}

func TestValidatePatch_BadRateRejected(t *testing.T) {
	overLimit := "150"
	if err := validatePatch(&UpdateCompanyRequest{VatRate: &overLimit}); err == nil {
		t.Error("vat_rate > 100 should be rejected")
	}
}

func TestValidatePatch_NormalisesRatePrecision(t *testing.T) {
	v := "7"
	req := &UpdateCompanyRequest{VatRate: &v}
	if err := validatePatch(req); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if *req.VatRate != "7.00" {
		t.Errorf("expected vat_rate normalised to 7.00, got %q", *req.VatRate)
	}
}

func TestNormalizeOptional(t *testing.T) {
	if normalizeOptional("   ") != nil {
		t.Error("whitespace-only input should normalise to NULL")
	}
	if normalizeOptional("") != nil {
		t.Error("empty input should normalise to NULL")
	}
	if got := normalizeOptional("  hello  "); got != "hello" {
		t.Errorf("expected trimmed 'hello', got %v", got)
	}
}
