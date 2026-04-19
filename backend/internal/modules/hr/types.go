package hr

import "time"

// Company, Department, Position — read-only dropdown shapes. Full CRUD lives
// with the settings module (TODO Phase 1B).
type Company struct {
	ID       int64  `json:"id"`
	Code     string `json:"code"`
	NameTH   string `json:"name_th"`
	NameEN   string `json:"name_en"`
	IsActive bool   `json:"is_active"`
}

type Department struct {
	ID        int64  `json:"id"`
	CompanyID int64  `json:"company_id"`
	Code      string `json:"code"`
	NameTH    string `json:"name_th"`
	NameEN    string `json:"name_en"`
	IsActive  bool   `json:"is_active"`
}

type Position struct {
	ID       int64  `json:"id"`
	Code     string `json:"code"`
	NameTH   string `json:"name_th"`
	NameEN   string `json:"name_en"`
	Level    int16  `json:"level"`
	IsActive bool   `json:"is_active"`
}

// Employee — full shape returned on detail. List omits PII fields.
// national_id and salary are cleartext today; field-level encryption lands
// in migration 0003_hr_encrypt (see SECURITY.md). Handlers mask these for
// callers without `hr_employees.reveal_pii` regardless.
type Employee struct {
	ID               int64      `json:"id"`
	EmployeeCode     string     `json:"employee_code"`
	CompanyID        int64      `json:"company_id"`
	DepartmentID     int64      `json:"department_id"`
	PositionID       int64      `json:"position_id"`
	CompanyNameEN    string     `json:"company_name_en,omitempty"`
	CompanyNameTH    string     `json:"company_name_th,omitempty"`
	DepartmentNameEN string     `json:"department_name_en,omitempty"`
	DepartmentNameTH string     `json:"department_name_th,omitempty"`
	PositionNameEN   string     `json:"position_name_en,omitempty"`
	PositionNameTH   string     `json:"position_name_th,omitempty"`
	FirstNameTH      string     `json:"first_name_th"`
	LastNameTH       string     `json:"last_name_th"`
	FirstNameEN      *string    `json:"first_name_en,omitempty"`
	LastNameEN       *string    `json:"last_name_en,omitempty"`
	Nickname         *string    `json:"nickname,omitempty"`
	Gender           string     `json:"gender"`
	Birthdate        time.Time  `json:"birthdate"`
	NationalID       *string    `json:"national_id,omitempty"` // masked unless reveal_pii
	Phone            *string    `json:"phone,omitempty"`
	Email            *string    `json:"email,omitempty"`
	AddressJSON      any        `json:"address,omitempty"`
	EmploymentType   string     `json:"employment_type"`
	HiredAt          time.Time  `json:"hired_at"`
	TerminatedAt     *time.Time `json:"terminated_at,omitempty"`
	TerminatedReason *string    `json:"terminated_reason,omitempty"`
	Salary           *string    `json:"salary,omitempty"` // masked unless reveal_pii; string to preserve decimal
	Status           string     `json:"status"`
	CreatedAt        time.Time  `json:"created_at"`
	UpdatedAt        time.Time  `json:"updated_at"`
}

type EmployeeListItem struct {
	ID               int64      `json:"id"`
	EmployeeCode     string     `json:"employee_code"`
	FirstNameTH      string     `json:"first_name_th"`
	LastNameTH       string     `json:"last_name_th"`
	FirstNameEN      *string    `json:"first_name_en,omitempty"`
	LastNameEN       *string    `json:"last_name_en,omitempty"`
	Nickname         *string    `json:"nickname,omitempty"`
	CompanyID        int64      `json:"company_id"`
	CompanyNameEN    string     `json:"company_name_en"`
	CompanyNameTH    string     `json:"company_name_th"`
	DepartmentID     int64      `json:"department_id"`
	DepartmentNameEN string     `json:"department_name_en"`
	DepartmentNameTH string     `json:"department_name_th"`
	PositionID       int64      `json:"position_id"`
	PositionNameEN   string     `json:"position_name_en"`
	PositionNameTH   string     `json:"position_name_th"`
	EmploymentType   string     `json:"employment_type"`
	HiredAt          time.Time  `json:"hired_at"`
	TerminatedAt     *time.Time `json:"terminated_at,omitempty"`
	Status           string     `json:"status"`
}

type EmployeeListResponse struct {
	Items  []EmployeeListItem `json:"items"`
	Total  int                `json:"total"`
	Limit  int                `json:"limit"`
	Offset int                `json:"offset"`
}

type CreateEmployeeRequest struct {
	CompanyID      int64   `json:"company_id" validate:"required,gt=0"`
	DepartmentID   int64   `json:"department_id" validate:"required,gt=0"`
	PositionID     int64   `json:"position_id" validate:"required,gt=0"`
	FirstNameTH    string  `json:"first_name_th" validate:"required,max=100"`
	LastNameTH     string  `json:"last_name_th" validate:"required,max=100"`
	FirstNameEN    *string `json:"first_name_en,omitempty" validate:"omitempty,max=100"`
	LastNameEN     *string `json:"last_name_en,omitempty" validate:"omitempty,max=100"`
	Nickname       *string `json:"nickname,omitempty" validate:"omitempty,max=50"`
	Gender         string  `json:"gender" validate:"required,oneof=M F O"`
	Birthdate      string  `json:"birthdate" validate:"required"` // YYYY-MM-DD
	NationalID     *string `json:"national_id,omitempty" validate:"omitempty,max=30"`
	Phone          *string `json:"phone,omitempty" validate:"omitempty,max=30"`
	Email          *string `json:"email,omitempty" validate:"omitempty,email,max=200"`
	AddressJSON    any     `json:"address,omitempty"`
	EmploymentType string  `json:"employment_type" validate:"required,oneof=fulltime contract daily parttime"`
	HiredAt        string  `json:"hired_at" validate:"required"` // YYYY-MM-DD
	Salary         *string `json:"salary,omitempty"`
}

type UpdateEmployeeRequest struct {
	DepartmentID   *int64  `json:"department_id,omitempty"`
	PositionID     *int64  `json:"position_id,omitempty"`
	FirstNameTH    *string `json:"first_name_th,omitempty" validate:"omitempty,max=100"`
	LastNameTH     *string `json:"last_name_th,omitempty" validate:"omitempty,max=100"`
	FirstNameEN    *string `json:"first_name_en,omitempty" validate:"omitempty,max=100"`
	LastNameEN     *string `json:"last_name_en,omitempty" validate:"omitempty,max=100"`
	Nickname       *string `json:"nickname,omitempty" validate:"omitempty,max=50"`
	Gender         *string `json:"gender,omitempty" validate:"omitempty,oneof=M F O"`
	Birthdate      *string `json:"birthdate,omitempty"`
	NationalID     *string `json:"national_id,omitempty" validate:"omitempty,max=30"`
	Phone          *string `json:"phone,omitempty" validate:"omitempty,max=30"`
	Email          *string `json:"email,omitempty" validate:"omitempty,email,max=200"`
	AddressJSON    any     `json:"address,omitempty"`
	EmploymentType *string `json:"employment_type,omitempty" validate:"omitempty,oneof=fulltime contract daily parttime"`
	Salary         *string `json:"salary,omitempty"`
	Status         *string `json:"status,omitempty" validate:"omitempty,oneof=active inactive on_leave"`
}

type TerminateEmployeeRequest struct {
	TerminatedAt     string `json:"terminated_at" validate:"required"` // YYYY-MM-DD
	TerminatedReason string `json:"terminated_reason" validate:"required,max=500"`
}
