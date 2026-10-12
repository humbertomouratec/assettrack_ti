package wiki

import (
	"bytes"
	"context"
	"database/sql"
	"database/sql/driver"
	"encoding/json"
	"errors"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// ============================================================================
// 1. Mock ModuleStatusProvider for Feature Toggle Middleware Tests
// ============================================================================

type mockModuleStatusProvider struct {
	mu      sync.RWMutex
	enabled bool
	err     error
	calls   atomic.Int32
}

func (m *mockModuleStatusProvider) IsModuleEnabled(_ context.Context, moduleName string) (bool, error) {
	m.calls.Add(1)
	m.mu.RLock()
	defer m.mu.RUnlock()
	if moduleName != WikiModuleName {
		return false, nil
	}
	return m.enabled, m.err
}

func (m *mockModuleStatusProvider) setEnabled(v bool) {
	m.mu.Lock()
	m.enabled = v
	m.mu.Unlock()
}

func TestWikiFeatureToggleMiddleware_BlocksWhenDisabledAndAllowsWhenEnabled(t *testing.T) {
	provider := &mockModuleStatusProvider{enabled: false}
	cache := NewFeatureToggleCache(provider, 100*time.Millisecond)

	nextCalled := false
	dummyHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		nextCalled = true
		writeJSON(w, http.StatusOK, map[string]any{"status": "ok"})
	})

	mw := WikiFeatureToggleMiddleware(provider, cache)(dummyHandler)

	// Case 1: Module disabled -> 403 Forbidden
	reqDisabled := httptest.NewRequest(http.MethodGet, "/api/v1/wiki/articles", nil)
	recDisabled := httptest.NewRecorder()
	mw.ServeHTTP(recDisabled, reqDisabled)

	if recDisabled.Code != http.StatusForbidden {
		t.Fatalf("expected status 403 Forbidden when module is disabled, got %d", recDisabled.Code)
	}
	if nextCalled {
		t.Fatalf("expected next handler NOT to be called when wiki module is disabled")
	}

	var errResp map[string]any
	if err := json.Unmarshal(recDisabled.Body.Bytes(), &errResp); err != nil {
		t.Fatalf("failed to decode 403 JSON response: %v", err)
	}
	if errResp["error"] != "module_disabled" {
		t.Errorf("expected error='module_disabled', got %v", errResp["error"])
	}

	// Verify in-memory cache prevents duplicate DB queries within TTL
	reqCached := httptest.NewRequest(http.MethodGet, "/api/v1/wiki/articles", nil)
	recCached := httptest.NewRecorder()
	mw.ServeHTTP(recCached, reqCached)
	if provider.calls.Load() != 1 {
		t.Errorf("expected cache to serve status without extra DB query; calls=%d", provider.calls.Load())
	}

	// Case 2: Enable module and invalidate cache -> 200 OK
	provider.setEnabled(true)
	cache.Invalidate()

	reqEnabled := httptest.NewRequest(http.MethodGet, "/api/v1/wiki/articles", nil)
	recEnabled := httptest.NewRecorder()
	mw.ServeHTTP(recEnabled, reqEnabled)

	if recEnabled.Code != http.StatusOK {
		t.Fatalf("expected status 200 OK when module is enabled, got %d", recEnabled.Code)
	}
	if !nextCalled {
		t.Fatalf("expected next handler to be called when wiki module is enabled")
	}

	// Case 3: Admin toggle route is reachable even when module is disabled
	cache.SetCachedState(false)
	nextCalled = false

	reqAdminToggle := httptest.NewRequest(http.MethodPut, "/api/v1/wiki/admin/module-toggle", nil)
	reqAdminToggle.Header.Set("X-User-ID", "1")
	reqAdminToggle.Header.Set("X-User-Role", "admin")
	recAdminToggle := httptest.NewRecorder()
	mw.ServeHTTP(recAdminToggle, reqAdminToggle)

	if recAdminToggle.Code != http.StatusOK || !nextCalled {
		t.Fatalf("expected admin toggle endpoint to bypass disabled lock for admin user, got status %d", recAdminToggle.Code)
	}
}

// ============================================================================
// 2. WikiUploadHandler Tests (Valid Media, Invalid Extensions, Fake Magic Bytes)
// ============================================================================

func buildMultipartUploadRequest(t *testing.T, fieldName, filename string, content []byte) *http.Request {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)

	part, err := writer.CreateFormFile(fieldName, filename)
	if err != nil {
		t.Fatalf("failed to create form file: %v", err)
	}
	if _, err := part.Write(content); err != nil {
		t.Fatalf("failed to write multipart content: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("failed to close multipart writer: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/v1/wiki/upload", &body)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	req.Header.Set("X-User-ID", "42")
	req.Header.Set("X-User-Role", "tecnico")
	req.Header.Set("X-User-Active", "true")
	return req
}

func TestWikiUploadHandler_ValidImageAndVideoUploads(t *testing.T) {
	tempDir := t.TempDir()
	uploadHandler := NewWikiUploadHandler(tempDir)

	// Valid PNG signature (89 50 4E 47 0D 0A 1A 0A) + IHDR padding
	validPNG := append(
		[]byte{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52},
		bytes.Repeat([]byte{0x00}, 64)...,
	)

	// Valid MP4 ISO Base Media signature ('ftyp' at offset 4)
	validMP4 := append(
		[]byte{0x00, 0x00, 0x00, 0x18, 'f', 't', 'y', 'p', 'm', 'p', '4', '2', 0x00, 0x00, 0x00, 0x00},
		bytes.Repeat([]byte{0x00}, 64)...,
	)

	testCases := []struct {
		name         string
		filename     string
		payload      []byte
		expectedMime string
	}{
		{
			name:         "Valid PNG Screenshot",
			filename:     "topologia_rede.png",
			payload:      validPNG,
			expectedMime: "image/png",
		},
		{
			name:         "Valid MP4 Instructional Video",
			filename:     "procedimento_vpn.mp4",
			payload:      validMP4,
			expectedMime: "video/mp4",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			req := buildMultipartUploadRequest(t, "file", tc.filename, tc.payload)
			rec := httptest.NewRecorder()

			uploadHandler.UploadMedia(rec, req)

			if rec.Code != http.StatusCreated {
				t.Fatalf("expected 201 Created for %s, got %d: %s", tc.filename, rec.Code, rec.Body.String())
			}

			var resp UploadMediaResponse
			if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
				t.Fatalf("failed to decode UploadMediaResponse: %v", err)
			}

			if !strings.HasPrefix(resp.URL, "/uploads/wiki/wiki_") {
				t.Errorf("expected URL to start with '/uploads/wiki/wiki_', got %q", resp.URL)
			}
			if resp.MimeType != tc.expectedMime {
				t.Errorf("expected MimeType %q, got %q", tc.expectedMime, resp.MimeType)
			}

			// Verify file was physically saved in the temporary directory
			savedPath := filepath.Join(tempDir, resp.Filename)
			info, err := os.Stat(savedPath)
			if err != nil {
				t.Fatalf("expected uploaded file to exist at %s: %v", savedPath, err)
			}
			if info.Size() != int64(len(tc.payload)) {
				t.Errorf("expected saved file size %d, got %d", len(tc.payload), info.Size())
			}
		})
	}
}

func TestWikiUploadHandler_BlocksInvalidExtensionsAndFakeMagicBytes(t *testing.T) {
	tempDir := t.TempDir()
	uploadHandler := NewWikiUploadHandler(tempDir)

	// 1. Disallowed extensions (.php, .exe)
	for _, badFile := range []string{"shell.php", "trojan.exe", "script.sh"} {
		req := buildMultipartUploadRequest(t, "file", badFile, []byte("<?php echo 'hacked'; ?>"))
		rec := httptest.NewRecorder()
		uploadHandler.UploadMedia(rec, req)

		if rec.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 Bad Request for disallowed extension %s, got %d", badFile, rec.Code)
		}
		if !strings.Contains(rec.Body.String(), "invalid_file_extension") {
			t.Errorf("expected invalid_file_extension error code for %s, got %s", badFile, rec.Body.String())
		}
	}

	// 2. Spoofed Magic Bytes (.png containing PHP code, .mp4 containing Windows MZ PE header)
	spoofedCases := []struct {
		filename string
		payload  []byte
	}{
		{
			filename: "fake_image.png",
			payload:  []byte("<?php system($_GET['cmd']); ?>"),
		},
		{
			filename: "fake_video.mp4",
			payload:  []byte{'M', 'Z', 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00},
		},
	}

	for _, sc := range spoofedCases {
		req := buildMultipartUploadRequest(t, "file", sc.filename, sc.payload)
		rec := httptest.NewRecorder()
		uploadHandler.UploadMedia(rec, req)

		if rec.Code != http.StatusUnsupportedMediaType {
			t.Fatalf("expected 415 Unsupported Media Type for spoofed file %s, got %d: %s", sc.filename, rec.Code, rec.Body.String())
		}
		if !strings.Contains(rec.Body.String(), "invalid_magic_bytes") {
			t.Errorf("expected invalid_magic_bytes error for %s, got %s", sc.filename, rec.Body.String())
		}
	}

	// Ensure no files were written to tempDir after rejected uploads
	entries, err := os.ReadDir(tempDir)
	if err == nil && len(entries) > 0 {
		t.Errorf("expected 0 files in tempDir after rejected uploads, found %d", len(entries))
	}
}

// ============================================================================
// 3. Models, RBAC Helpers & Bulk Permission Update (Anti-IDOR) Tests
// ============================================================================

func TestModelsAndRBACValidationHelpers(t *testing.T) {
	if !IsValidAccessLevel("none") || !IsValidAccessLevel("READ") || !IsValidAccessLevel(" write ") {
		t.Errorf("expected 'none', 'READ', and 'write' to be valid access levels")
	}
	if IsValidAccessLevel("superadmin") || IsValidAccessLevel("delete") || IsValidAccessLevel("") {
		t.Errorf("expected invalid access levels to be rejected")
	}

	if NormalizeContentFormat("JSON") != FormatJSON {
		t.Errorf("expected 'JSON' to normalize to 'json'")
	}
	if NormalizeContentFormat("markdown") != FormatHTML {
		t.Errorf("expected non-json format to normalize to 'html' for DB CHECK constraint")
	}

	adminUser := &AuthenticatedUser{ID: 1, Role: "admin", IsActive: true}
	if !adminUser.IsAdmin() {
		t.Errorf("expected adminUser.IsAdmin() to be true")
	}

	mgrUser := &AuthenticatedUser{ID: 5, Role: "gerente_ti", IsActive: true}
	if mgrUser.IsAdmin() || !mgrUser.HasManagerRole() {
		t.Errorf("expected gerente_ti to have manager role but not admin")
	}

	techUser := &AuthenticatedUser{ID: 9, Role: "tecnico", IsActive: true}
	if techUser.IsAdmin() || techUser.HasManagerRole() {
		t.Errorf("expected tecnico to not be admin or manager")
	}
}

// Minimal in-memory sql/driver mock to unit-test WikiRepository.BulkUpdatePermissions
// and WikiHandler.BulkUpdatePermissions without requiring a live PostgreSQL server.
type mockBulkState struct {
	isManager          bool
	validCategoryCount int64
	validUserCount     int64
	upsertedCount      int
}

var (
	registerMockDriverOnce sync.Once
	currentMockBulkState   = &mockBulkState{}
	mockBulkMu             sync.Mutex
)

type mockSQLDriver struct{}
type mockSQLConn struct{}
type mockSQLTx struct{}
type mockSQLRows struct {
	cols   []string
	values [][]driver.Value
	idx    int
}

func (d *mockSQLDriver) Open(_ string) (driver.Conn, error) { return &mockSQLConn{}, nil }
func (c *mockSQLConn) Prepare(_ string) (driver.Stmt, error) {
	return nil, errors.New("not implemented")
}
func (c *mockSQLConn) Close() error              { return nil }
func (c *mockSQLConn) Begin() (driver.Tx, error) { return &mockSQLTx{}, nil }
func (tx *mockSQLTx) Commit() error              { return nil }
func (tx *mockSQLTx) Rollback() error            { return nil }

func (c *mockSQLConn) QueryContext(_ context.Context, query string, _ []driver.NamedValue) (driver.Rows, error) {
	mockBulkMu.Lock()
	defer mockBulkMu.Unlock()

	switch {
	case strings.Contains(query, "FROM departamentos d"):
		return &mockSQLRows{
			cols:   []string{"exists"},
			values: [][]driver.Value{{currentMockBulkState.isManager}},
		}, nil
	case strings.Contains(query, "FROM wiki_categories WHERE department_id"):
		return &mockSQLRows{
			cols:   []string{"count"},
			values: [][]driver.Value{{currentMockBulkState.validCategoryCount}},
		}, nil
	case strings.Contains(query, "FROM users WHERE departamento_id"):
		return &mockSQLRows{
			cols:   []string{"count"},
			values: [][]driver.Value{{currentMockBulkState.validUserCount}},
		}, nil
	default:
		return nil, errors.New("unexpected query in mockSQLConn: " + query)
	}
}

func (c *mockSQLConn) ExecContext(_ context.Context, query string, _ []driver.NamedValue) (driver.Result, error) {
	mockBulkMu.Lock()
	defer mockBulkMu.Unlock()

	if strings.Contains(query, "INSERT INTO wiki_permissions") {
		currentMockBulkState.upsertedCount++
		return driver.RowsAffected(1), nil
	}
	if strings.Contains(query, "DELETE FROM wiki_articles") {
		return driver.RowsAffected(1), nil
	}
	return nil, errors.New("unexpected exec in mockSQLConn: " + query)
}

func (r *mockSQLRows) Columns() []string { return r.cols }
func (r *mockSQLRows) Close() error      { return nil }
func (r *mockSQLRows) Next(dest []driver.Value) error {
	if r.idx >= len(r.values) {
		return io.EOF
	}
	copy(dest, r.values[r.idx])
	r.idx++
	return nil
}

func openMockWikiDB(t *testing.T, state mockBulkState) *sql.DB {
	t.Helper()
	registerMockDriverOnce.Do(func() {
		sql.Register("wiki_mock_sql", &mockSQLDriver{})
	})
	mockBulkMu.Lock()
	*currentMockBulkState = state
	mockBulkMu.Unlock()

	db, err := sql.Open("wiki_mock_sql", "mock")
	if err != nil {
		t.Fatalf("failed to open mock sql db: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return db
}

func TestBulkUpdatePermissions_RBACAndAntiIDOR(t *testing.T) {
	deptTI := int64(10)

	// Scenario 1: Cross-Department IDOR attempt (Manager of Dept 10 tries to modify Dept 99)
	dbIDOR := openMockWikiDB(t, mockBulkState{
		isManager:          false, // Not manager of Dept 99
		validCategoryCount: 1,
		validUserCount:     1,
	})
	repoIDOR := NewWikiRepository(dbIDOR)
	handlerIDOR := NewWikiHandler(repoIDOR)

	idorPayload := `{"department_id": 99, "permissions": [{"user_id": 15, "category_id": 3, "access_level": "write"}]}`
	reqIDOR := httptest.NewRequest(http.MethodPut, "/api/v1/wiki/permissions/bulk", strings.NewReader(idorPayload))
	reqIDOR.Header.Set("X-User-ID", "7")
	reqIDOR.Header.Set("X-User-Role", "gerente_ti")
	reqIDOR.Header.Set("X-User-Department-ID", "10")
	recIDOR := httptest.NewRecorder()

	handlerIDOR.BulkUpdatePermissions(recIDOR, reqIDOR)

	if recIDOR.Code != http.StatusForbidden {
		t.Fatalf("expected 403 Forbidden for cross-department IDOR attempt, got %d: %s", recIDOR.Code, recIDOR.Body.String())
	}
	if !strings.Contains(recIDOR.Body.String(), "cross_department_access_denied") {
		t.Errorf("expected cross_department_access_denied error, got %s", recIDOR.Body.String())
	}

	// Scenario 2: Category from another department injected into payload -> 403 Forbidden
	dbForeignCat := openMockWikiDB(t, mockBulkState{
		isManager:          true,
		validCategoryCount: 1, // Only 1 of 2 categories belongs to Dept 10
		validUserCount:     1,
	})
	repoForeignCat := NewWikiRepository(dbForeignCat)
	_, err := repoForeignCat.BulkUpdatePermissions(
		context.Background(),
		&AuthenticatedUser{ID: 7, Role: "gerente_ti", DepartmentID: &deptTI, IsActive: true},
		BulkPermissionUpdateRequest{
			DepartmentID: deptTI,
			Permissions: []BulkPermissionItem{
				{UserID: 20, CategoryID: 101, AccessLevel: AccessRead},
				{UserID: 20, CategoryID: 999, AccessLevel: AccessWrite}, // Foreign category
			},
		},
	)
	if !errors.Is(err, ErrCrossDepartmentAccess) {
		t.Fatalf("expected ErrCrossDepartmentAccess when foreign category is passed, got %v", err)
	}

	// Scenario 3: Valid Bulk Permission Update by legitimate Department Manager -> 200 OK
	dbValid := openMockWikiDB(t, mockBulkState{
		isManager:          true,
		validCategoryCount: 2,
		validUserCount:     2,
	})
	repoValid := NewWikiRepository(dbValid)
	handlerValid := NewWikiHandler(repoValid)

	validPayload := `{
		"department_id": 10,
		"permissions": [
			{"user_id": 21, "category_id": 101, "access_level": "read"},
			{"user_id": 22, "category_id": 102, "access_level": "write"}
		]
	}`
	reqValid := httptest.NewRequest(http.MethodPut, "/api/v1/wiki/permissions/bulk", strings.NewReader(validPayload))
	reqValid.Header.Set("X-User-ID", "7")
	reqValid.Header.Set("X-User-Role", "gerente_ti")
	reqValid.Header.Set("X-User-Department-ID", "10")
	recValid := httptest.NewRecorder()

	handlerValid.BulkUpdatePermissions(recValid, reqValid)

	if recValid.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for valid bulk permission update, got %d: %s", recValid.Code, recValid.Body.String())
	}

	var bulkResp BulkPermissionUpdateResponse
	if err := json.Unmarshal(recValid.Body.Bytes(), &bulkResp); err != nil {
		t.Fatalf("failed to decode BulkPermissionUpdateResponse: %v", err)
	}
	if bulkResp.UpdatedCount != 2 || bulkResp.DepartmentID != 10 {
		t.Errorf("expected UpdatedCount=2 and DepartmentID=10, got %+v", bulkResp)
	}
}

func TestDeleteArticle_RBAC(t *testing.T) {
	// 1. Non-admin user attempting DELETE -> 403 Forbidden
	db := openMockWikiDB(t, mockBulkState{})
	repo := NewWikiRepository(db)
	handler := NewWikiHandler(repo)

	reqNonAdmin := httptest.NewRequest(http.MethodDelete, "/api/v1/wiki/articles/42", nil)
	reqNonAdmin.Header.Set("X-User-ID", "15")
	reqNonAdmin.Header.Set("X-User-Role", "tecnico")
	reqNonAdmin.Header.Set("X-User-Active", "true")
	recNonAdmin := httptest.NewRecorder()

	handler.DeleteArticle(recNonAdmin, reqNonAdmin)

	if recNonAdmin.Code != http.StatusForbidden {
		t.Fatalf("expected 403 Forbidden when non-admin attempts to delete article, got %d", recNonAdmin.Code)
	}

	// 2. Admin attempting DELETE on mock DB where DELETE returns rows affected = 1
	reqAdmin := httptest.NewRequest(http.MethodDelete, "/api/v1/wiki/articles/42", nil)
	reqAdmin.Header.Set("X-User-ID", "1")
	reqAdmin.Header.Set("X-User-Role", "admin")
	reqAdmin.Header.Set("X-User-Active", "true")
	recAdmin := httptest.NewRecorder()

	handler.DeleteArticle(recAdmin, reqAdmin)

	if recAdmin.Code != http.StatusOK {
		t.Fatalf("expected 200 OK when admin deletes article, got %d: %s", recAdmin.Code, recAdmin.Body.String())
	}

	var resp map[string]any
	if err := json.Unmarshal(recAdmin.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if resp["message"] != "Artigo excluído com sucesso" {
		t.Errorf("expected success message, got %v", resp["message"])
	}
}
