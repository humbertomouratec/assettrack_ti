package utils

import (
	"fmt"
	"time"
)

// LocationSP returns America/Sao_Paulo location or time.Local on fallback
func LocationSP() *time.Location {
	loc, err := time.LoadLocation("America/Sao_Paulo")
	if err != nil {
		return time.Local
	}
	return loc
}

// NowSP returns current time in America/Sao_Paulo
func NowSP() time.Time {
	return time.Now().In(LocationSP())
}

// ParseDateSP parses YYYY-MM-DD or RFC3339 in America/Sao_Paulo
func ParseDateSP(value string) (*time.Time, error) {
	loc := LocationSP()
	for _, layout := range []string{"2006-01-02", time.RFC3339, "2006-01-02T15:04:05", "2006-01-02T15:04"} {
		if t, err := time.ParseInLocation(layout, value, loc); err == nil {
			return &t, nil
		}
	}
	return nil, fmt.Errorf("invalid date format: %s", value)
}

// StringPtr returns a pointer to a string
func StringPtr(s string) *string { return &s }

// UintPtr returns a pointer to a uint
func UintPtr(u uint) *uint { return &u }

// BoolPtr returns a pointer to a bool
func BoolPtr(b bool) *bool { return &b }
