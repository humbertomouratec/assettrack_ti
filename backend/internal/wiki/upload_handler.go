package wiki

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const (
	// MaxWikiUploadSize enforces the strict 50MB limit for images and short instructional videos.
	MaxWikiUploadSize int64 = 50 << 20 // 50 MB (52,428,800 bytes)

	// DefaultWikiUploadDir is the local filesystem destination for Wiki rich-text media.
	DefaultWikiUploadDir = "./uploads/wiki"

	// DefaultWikiPublicURLPrefix is the public URL path mapped by the static file server.
	DefaultWikiPublicURLPrefix = "/uploads/wiki"
)

// allowedWikiExtensions maps each permitted file extension to its expected canonical MIME family.
var allowedWikiExtensions = map[string]string{
	".jpg":  "image/jpeg",
	".jpeg": "image/jpeg",
	".png":  "image/png",
	".gif":  "image/gif",
	".webp": "image/webp",
	".mp4":  "video/mp4",
	".webm": "video/webm",
	".mov":  "video/quicktime",
}

// WikiUploadHandler handles multipart media uploads for the Wiki Rich Text Editor.
type WikiUploadHandler struct {
	uploadDir       string
	publicURLPrefix string
}

// NewWikiUploadHandler creates a new WikiUploadHandler.
// If uploadDir is empty, it defaults to "./uploads/wiki".
func NewWikiUploadHandler(uploadDir ...string) *WikiUploadHandler {
	dir := DefaultWikiUploadDir
	if len(uploadDir) > 0 && strings.TrimSpace(uploadDir[0]) != "" {
		dir = strings.TrimSpace(uploadDir[0])
	}
	return &WikiUploadHandler{
		uploadDir:       dir,
		publicURLPrefix: DefaultWikiPublicURLPrefix,
	}
}

// UploadMedia handles POST /api/v1/wiki/upload (and /api/v1/wiki/media/upload).
// Security controls:
//  1. Requires an active authenticated user.
//  2. Enforces 50MB limit via http.MaxBytesReader.
//  3. Validates extension against allowlist (.jpg, .jpeg, .png, .gif, .webp, .mp4, .webm, .mov).
//  4. Validates file Magic Bytes on the first 512 bytes using http.DetectContentType + container signatures.
//  5. Generates a collision-free, traversal-safe filename: wiki_<unix_nano>_<rand_hex>.<ext>.
func (u *WikiUploadHandler) UploadMedia(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSONError(w, http.StatusMethodNotAllowed, "Método não permitido; utilize POST multipart/form-data")
		return
	}

	user, err := ExtractAuthenticatedUser(r)
	if err != nil || user == nil || !user.IsActive {
		writeJSONError(w, http.StatusUnauthorized, ErrUnauthorized.Error(), map[string]any{"error": "unauthorized"})
		return
	}

	// Enforce 50MB hard limit on the entire request body
	r.Body = http.MaxBytesReader(w, r.Body, MaxWikiUploadSize)

	if err := r.ParseMultipartForm(10 << 20); err != nil {
		var maxBytesErr *http.MaxBytesError
		if errors.As(err, &maxBytesErr) || strings.Contains(strings.ToLower(err.Error()), "request body too large") {
			writeJSONError(w, http.StatusRequestEntityTooLarge, "O arquivo excede o limite máximo permitido de 50MB", map[string]any{
				"error":        "file_too_large",
				"max_size_mb":  50,
				"max_size_raw": MaxWikiUploadSize,
			})
			return
		}
		writeJSONError(w, http.StatusBadRequest, "Falha ao processar formulário multipart/form-data")
		return
	}
	if r.MultipartForm != nil {
		defer func() {
			_ = r.MultipartForm.RemoveAll()
		}()
	}

	file, header, err := extractMultipartFile(r)
	if err != nil {
		writeJSONError(w, http.StatusBadRequest, "Nenhum arquivo encontrado no campo 'file'")
		return
	}
	defer file.Close()

	if header.Size > MaxWikiUploadSize {
		writeJSONError(w, http.StatusRequestEntityTooLarge, "O arquivo excede o limite máximo permitido de 50MB")
		return
	}

	// 1. Validate file extension
	originalName := filepath.Base(strings.TrimSpace(header.Filename))
	ext := strings.ToLower(filepath.Ext(originalName))
	if _, ok := allowedWikiExtensions[ext]; !ok {
		writeJSONError(w, http.StatusBadRequest, fmt.Sprintf("Extensão de arquivo %q não permitida na Wiki", ext), map[string]any{
			"error":              "invalid_file_extension",
			"allowed_extensions": []string{".jpg", ".jpeg", ".png", ".gif", ".webp", ".mp4", ".webm", ".mov"},
		})
		return
	}

	// 2. Read first 512 bytes to inspect Magic Bytes via http.DetectContentType
	sniffBuf := make([]byte, 512)
	n, readErr := io.ReadFull(file, sniffBuf)
	if readErr != nil && !errors.Is(readErr, io.EOF) && !errors.Is(readErr, io.ErrUnexpectedEOF) {
		writeJSONError(w, http.StatusBadRequest, "Falha ao ler cabeçalho do arquivo enviado")
		return
	}
	if n == 0 {
		writeJSONError(w, http.StatusBadRequest, "O arquivo enviado está vazio")
		return
	}
	sniffBuf = sniffBuf[:n]

	detectedMime, validMagic := validateMediaMagicBytes(ext, sniffBuf)
	if !validMagic {
		writeJSONError(w, http.StatusUnsupportedMediaType, "Assinatura binária (Magic Bytes) incompatível com o tipo de mídia permitido", map[string]any{
			"error":         "invalid_magic_bytes",
			"detected_mime": detectedMime,
			"extension":     ext,
		})
		return
	}

	// 3. Ensure target directory ./uploads/wiki/ exists
	if err := os.MkdirAll(u.uploadDir, 0o755); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Falha ao preparar diretório de armazenamento da Wiki")
		return
	}

	// 4. Generate unique, collision-free filename based on UnixNano timestamp + random suffix
	safeFilename := generateUniqueWikiFilename(ext)
	destPath := filepath.Join(u.uploadDir, filepath.Base(safeFilename))

	dst, err := os.OpenFile(destPath, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Falha ao criar arquivo de mídia no disco")
		return
	}

	// Combine the already-read 512-byte header with the rest of the stream, capped at MaxWikiUploadSize + 1
	combinedReader := io.MultiReader(bytes.NewReader(sniffBuf), file)
	written, copyErr := io.Copy(dst, io.LimitReader(combinedReader, MaxWikiUploadSize+1))
	closeErr := dst.Close()

	if copyErr != nil || closeErr != nil {
		_ = os.Remove(destPath)
		var maxBytesErr *http.MaxBytesError
		if errors.As(copyErr, &maxBytesErr) {
			writeJSONError(w, http.StatusRequestEntityTooLarge, "O arquivo excede o limite máximo permitido de 50MB")
			return
		}
		writeJSONError(w, http.StatusInternalServerError, "Erro ao gravar arquivo de mídia no servidor")
		return
	}

	if written > MaxWikiUploadSize {
		_ = os.Remove(destPath)
		writeJSONError(w, http.StatusRequestEntityTooLarge, "O arquivo excede o limite máximo permitido de 50MB")
		return
	}

	publicURL := strings.TrimRight(u.publicURLPrefix, "/") + "/" + safeFilename

	writeJSON(w, http.StatusCreated, UploadMediaResponse{
		URL:          publicURL,
		Filename:     safeFilename,
		OriginalName: originalName,
		Size:         written,
		MimeType:     detectedMime,
		UploadedAt:   time.Now().UTC(),
	})
}

// extractMultipartFile attempts common form field names ('file', 'media', 'image', 'video') for convenience.
func extractMultipartFile(r *http.Request) (multipart.File, *multipart.FileHeader, error) {
	for _, field := range []string{"file", "media", "image", "video"} {
		f, hdr, err := r.FormFile(field)
		if err == nil && f != nil && hdr != nil {
			return f, hdr, nil
		}
	}
	return nil, nil, errors.New("multipart file field not found")
}

// validateMediaMagicBytes inspects the first 512 bytes using http.DetectContentType and binary container headers.
func validateMediaMagicBytes(ext string, header []byte) (string, bool) {
	rawDetected := http.DetectContentType(header)
	detected := strings.ToLower(strings.TrimSpace(strings.Split(rawDetected, ";")[0]))

	switch ext {
	case ".jpg", ".jpeg":
		return detected, detected == "image/jpeg"
	case ".png":
		return detected, detected == "image/png"
	case ".gif":
		return detected, detected == "image/gif"
	case ".webp":
		return detected, detected == "image/webp"
	case ".webm":
		// WebM / Matroska EBML magic bytes: 0x1A 0x45 0xDF 0xA3
		if detected == "video/webm" {
			return "video/webm", true
		}
		if len(header) >= 4 && header[0] == 0x1A && header[1] == 0x45 && header[2] == 0xDF && header[3] == 0xA3 {
			return "video/webm", true
		}
		return detected, false
	case ".mp4":
		if detected == "video/mp4" {
			return "video/mp4", true
		}
		// ISO Base Media File Format ('ftyp' box at offset 4)
		if len(header) >= 12 && string(header[4:8]) == "ftyp" {
			return "video/mp4", true
		}
		return detected, false
	case ".mov":
		if detected == "video/quicktime" || detected == "video/mp4" {
			return "video/quicktime", true
		}
		// QuickTime container atoms at offset 4 ('ftyp', 'moov', 'mdat', 'wide', 'free', 'skip')
		if len(header) >= 8 {
			atomType := string(header[4:8])
			switch atomType {
			case "ftyp", "moov", "mdat", "wide", "free", "skip", "pnot":
				return "video/quicktime", true
			}
		}
		return detected, false
	default:
		return detected, false
	}
}

// generateUniqueWikiFilename creates a safe, unique filename based on UnixNano timestamp + random cryptographic hex.
func generateUniqueWikiFilename(ext string) string {
	randBytes := make([]byte, 4)
	if _, err := rand.Read(randBytes); err != nil {
		return fmt.Sprintf("wiki_%d%s", time.Now().UnixNano(), ext)
	}
	return fmt.Sprintf("wiki_%d_%s%s", time.Now().UnixNano(), hex.EncodeToString(randBytes), ext)
}
