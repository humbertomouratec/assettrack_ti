package handler

import (
	"bytes"
	"encoding/csv"
	"errors"
	"fmt"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/assettrack/backend/internal/middleware"
	"github.com/assettrack/backend/internal/models"
	"github.com/assettrack/backend/internal/repository"
	"github.com/gin-gonic/gin"
	qrcode "github.com/skip2/go-qrcode"
	qrdecoder "github.com/tuotoo/qrcode"
	"gorm.io/gorm"
)

type AssetHandler struct {
	repo         *repository.AssetRepository
	categoryRepo *repository.AssetCategoryRepository
}

func sameAssetUserID(left, right *uint) bool {
	if left == nil || right == nil {
		return left == nil && right == nil
	}
	return *left == *right
}

func NewAssetHandler(repo *repository.AssetRepository, categoryRepo *repository.AssetCategoryRepository) *AssetHandler {
	return &AssetHandler{
		repo:         repo,
		categoryRepo: categoryRepo,
	}
}

func (h *AssetHandler) List(c *gin.Context) {
	skip, _ := strconv.Atoi(c.DefaultQuery("skip", "0"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "100"))

	assets, err := h.repo.ListWithFilters(skip, limit, buildAssetFilters(c))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, assets)
}

func (h *AssetHandler) ExportCSV(c *gin.Context) {
	assets, err := h.repo.ListWithFilters(0, 10000, buildAssetFilters(c))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var buf bytes.Buffer
	buf.WriteString("\xEF\xBB\xBF")

	writer := csv.NewWriter(&buf)
	writer.Comma = ';'

	if err := writer.Write([]string{
		"ID",
		"E-Patrimonio",
		"Nome",
		"Modelo",
		"Numero de Serie",
		"Status",
		"Categoria",
		"Localizacao",
		"Armazenamento",
		"Fornecedor",
		"Nota Fiscal",
		"Data Aquisicao",
		"Valor",
		"Ativo Fixo",
		"Em Posse De",
		"Setor",
		"Requer Termo RH",
	}); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Falha ao gerar CSV"})
		return
	}

	for _, asset := range assets {
		row := []string{
			strconv.FormatUint(uint64(asset.ID), 10),
			safeCSV(asset.EPatrimonio),
			safeCSV(asset.Nome),
			safeCSV(stringValue(asset.Modelo)),
			safeCSV(stringValue(asset.NumeroSerie)),
			string(asset.Status),
			safeCSV(assetCategoryName(asset)),
			safeCSV(assetLocationName(asset)),
			safeCSV(assetStorageName(asset)),
			safeCSV(assetSupplierName(asset)),
			safeCSV(assetInvoiceNumber(asset)),
			formatDate(asset.DataAquisicao),
			formatFloat(asset.Valor),
			formatBool(asset.Bloqueado),
			safeCSV(stringValue(asset.EmPosseDe)),
			safeCSV(assetDepartamentoName(asset)),
			formatBool(asset.RequerTermoRH),
		}
		if err := writer.Write(row); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Falha ao gerar CSV"})
			return
		}
	}

	writer.Flush()
	if err := writer.Error(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Falha ao finalizar CSV"})
		return
	}

	filename := fmt.Sprintf("ativos_%s.csv", time.Now().Format("20060102_150405"))
	c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
	c.Data(http.StatusOK, "text/csv; charset=utf-8", buf.Bytes())
}

func buildAssetFilters(c *gin.Context) repository.AssetListFilters {
	return repository.AssetListFilters{
		EPatrimonio:   c.Query("e_patrimonio"),
		Nome:          c.Query("nome"),
		CategoriaID:   parseUintQuery(c, "categoria_id"),
		LocalizacaoID: parseUintQuery(c, "localizacao_id"),
		FornecedorID:  parseUintQuery(c, "fornecedor_id"),
		NotaFiscal:    c.Query("nfe"),
		Status:        c.Query("status"),
		DataInicio:    c.Query("data_inicio"),
		DataFim:       c.Query("data_fim"),
	}
}

func parseUintQuery(c *gin.Context, name string) uint {
	value := c.Query(name)
	if value == "" {
		return 0
	}
	parsed, err := strconv.ParseUint(value, 10, 32)
	if err != nil {
		return 0
	}
	return uint(parsed)
}

func stringValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func formatDate(value *time.Time) string {
	if value == nil {
		return ""
	}
	return value.Format("02/01/2006")
}

func formatFloat(value *float64) string {
	if value == nil {
		return ""
	}
	return fmt.Sprintf("%.2f", *value)
}

func formatBool(value bool) string {
	if value {
		return "Sim"
	}
	return "Nao"
}

func safeCSV(value string) string {
	if value == "" {
		return ""
	}
	if strings.ContainsAny(value[:1], "=+-@") {
		return "'" + value
	}
	return value
}

func assetCategoryName(asset models.Asset) string {
	if asset.Categoria == nil {
		return ""
	}
	return asset.Categoria.Nome
}

func assetLocationName(asset models.Asset) string {
	if asset.CurrentLocal == nil {
		return ""
	}
	return asset.CurrentLocal.Nome
}

func assetStorageName(asset models.Asset) string {
	if asset.CurrentArmazenamento == nil {
		return ""
	}
	return asset.CurrentArmazenamento.Nome
}

func assetDepartamentoName(asset models.Asset) string {
	if asset.CurrentDepartamento == nil {
		return ""
	}
	return asset.CurrentDepartamento.Nome
}

func assetSupplierName(asset models.Asset) string {
	if asset.Fornecedor == nil {
		return ""
	}
	return asset.Fornecedor.Nome
}

func assetInvoiceNumber(asset models.Asset) string {
	if asset.NotaFiscal == nil {
		return ""
	}
	return asset.NotaFiscal.NumeroNota
}

func (h *AssetHandler) GetByID(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido"})
		return
	}

	asset, err := h.repo.GetByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Ativo não encontrado"})
		return
	}
	c.JSON(http.StatusOK, asset)
}

func (h *AssetHandler) Create(c *gin.Context) {
	var asset models.Asset
	if err := c.ShouldBindJSON(&asset); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Verify EPatrimonio uniqueness
	existing, _ := h.repo.GetByEPatrimonio(asset.EPatrimonio)
	if existing != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Ativo com este E-Patrimônio já existe"})
		return
	}

	// Always derive the creator from the authenticated session.
	if user := middleware.GetCurrentUser(c); user != nil {
		userID := user.ID
		asset.CreatedByID = &userID
	}

	if err := h.repo.Create(&asset); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, asset)
}

type AssetImportRowResult struct {
	Linha       int    `json:"linha"`
	EPatrimonio string `json:"e_patrimonio"`
	Nome        string `json:"nome"`
	Acao        string `json:"acao,omitempty"`
	Erro        string `json:"erro,omitempty"`
}

type AssetImportResponse struct {
	Criados     int                    `json:"criados"`
	Atualizados int                    `json:"atualizados"`
	Falhas      int                    `json:"falhas"`
	Resultados  []AssetImportRowResult `json:"resultados"`
}

type assetCSVHeaderIndex struct {
	ePatrimonio   int
	nome          int
	modelo        int
	numeroSerie   int
	status        int
	categoria     int
	localizacao   int
	armazenamento int
	fornecedor    int
	dataAquisicao int
	valor         int
	ativoFixo     int
	emPosseDe     int
	setor         int
	requerTermoRH int
}

func (h *AssetHandler) ImportCSV(c *gin.Context) {
	fileHeader, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Arquivo CSV não enviado"})
		return
	}

	file, err := fileHeader.Open()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Falha ao abrir o arquivo CSV"})
		return
	}
	defer file.Close()

	reader := csv.NewReader(file)
	reader.Comma = ';'
	reader.FieldsPerRecord = -1
	reader.LazyQuotes = true

	rows, err := reader.ReadAll()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Não foi possível ler o CSV. Verifique se o arquivo usa ';' como separador."})
		return
	}
	if len(rows) < 2 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "O CSV precisa ter cabeçalho e pelo menos uma linha de dados"})
		return
	}

	headers := normalizeCSVHeaderRow(rows[0])
	headerIndex, err := parseAssetCSVHeaders(headers)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	response := AssetImportResponse{
		Resultados: make([]AssetImportRowResult, 0, len(rows)-1),
	}

	for rowIndex, row := range rows[1:] {
		lineNumber := rowIndex + 2
		if isCSVRowEmpty(row) {
			continue
		}

		result := AssetImportRowResult{
			Linha:       lineNumber,
			EPatrimonio: csvValue(row, headerIndex.ePatrimonio),
			Nome:        csvValue(row, headerIndex.nome),
		}

		if result.EPatrimonio == "" || result.Nome == "" {
			result.Erro = "E-Patrimônio e Nome são obrigatórios"
			response.Falhas++
			response.Resultados = append(response.Resultados, result)
			continue
		}

		err := h.repo.DB().Transaction(func(tx *gorm.DB) error {
			asset, action, buildErr := h.buildAssetFromCSVRow(tx, row, headerIndex, c)
			if buildErr != nil {
				return buildErr
			}

			result.Acao = action
			if action == "criado" {
				return tx.Create(asset).Error
			}
			return tx.Save(asset).Error
		})
		if err != nil {
			result.Erro = err.Error()
			response.Falhas++
		} else if result.Acao == "criado" {
			response.Criados++
		} else {
			response.Atualizados++
		}
		response.Resultados = append(response.Resultados, result)
	}

	c.JSON(http.StatusOK, response)
}

func normalizeCSVHeaderRow(row []string) []string {
	headers := make([]string, len(row))
	for i, value := range row {
		headers[i] = normalizeCSVHeader(value)
	}
	return headers
}

func normalizeCSVHeader(value string) string {
	value = strings.TrimSpace(strings.TrimPrefix(value, "\uFEFF"))
	value = strings.ToLower(value)
	replacer := strings.NewReplacer(
		"á", "a",
		"à", "a",
		"ã", "a",
		"â", "a",
		"é", "e",
		"ê", "e",
		"í", "i",
		"ó", "o",
		"ô", "o",
		"õ", "o",
		"ú", "u",
		"ç", "c",
		"-", "",
		"_", "",
		" ", "",
	)
	return replacer.Replace(value)
}

func parseAssetCSVHeaders(headers []string) (assetCSVHeaderIndex, error) {
	index := assetCSVHeaderIndex{
		ePatrimonio:   -1,
		nome:          -1,
		modelo:        -1,
		numeroSerie:   -1,
		status:        -1,
		categoria:     -1,
		localizacao:   -1,
		armazenamento: -1,
		fornecedor:    -1,
		dataAquisicao: -1,
		valor:         -1,
		ativoFixo:     -1,
		emPosseDe:     -1,
		setor:         -1,
		requerTermoRH: -1,
	}

	for i, header := range headers {
		switch header {
		case "epatrimonio":
			index.ePatrimonio = i
		case "nome":
			index.nome = i
		case "modelo":
			index.modelo = i
		case "numerodeserie":
			index.numeroSerie = i
		case "status":
			index.status = i
		case "categoria":
			index.categoria = i
		case "localizacao":
			index.localizacao = i
		case "armazenamento":
			index.armazenamento = i
		case "fornecedor":
			index.fornecedor = i
		case "dataaquisicao":
			index.dataAquisicao = i
		case "valor":
			index.valor = i
		case "ativofixo":
			index.ativoFixo = i
		case "empossede":
			index.emPosseDe = i
		case "setor":
			index.setor = i
		case "requertermorh":
			index.requerTermoRH = i
		}
	}

	if index.ePatrimonio == -1 || index.nome == -1 {
		return index, errors.New("Cabeçalho inválido. O CSV precisa conter ao menos as colunas 'E-Patrimonio' e 'Nome'")
	}
	return index, nil
}

func isCSVRowEmpty(row []string) bool {
	for _, value := range row {
		if strings.TrimSpace(value) != "" {
			return false
		}
	}
	return true
}

func csvValue(row []string, index int) string {
	if index < 0 || index >= len(row) {
		return ""
	}
	value := strings.TrimSpace(strings.TrimPrefix(row[index], "\uFEFF"))
	return strings.TrimPrefix(value, "'")
}

func (h *AssetHandler) buildAssetFromCSVRow(tx *gorm.DB, row []string, headers assetCSVHeaderIndex, c *gin.Context) (*models.Asset, string, error) {
	ePatrimonio := csvValue(row, headers.ePatrimonio)
	nome := csvValue(row, headers.nome)

	var asset models.Asset
	action := "criado"
	err := tx.Where("e_patrimonio = ?", ePatrimonio).First(&asset).Error
	if err != nil {
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, "", err
		}
		asset = models.Asset{EPatrimonio: ePatrimonio}
		asset.Status = models.AssetStatusDisponivel
		if user := middleware.GetCurrentUser(c); user != nil {
			userID := user.ID
			asset.CreatedByID = &userID
		}
	} else {
		action = "atualizado"
	}

	asset.Nome = nome
	asset.Modelo = stringPointerOrNil(csvValue(row, headers.modelo))
	asset.NumeroSerie = stringPointerOrNil(csvValue(row, headers.numeroSerie))
	asset.EmPosseDe = stringPointerOrNil(csvValue(row, headers.emPosseDe))

	if headers.status >= 0 {
		status, err := parseAssetStatus(csvValue(row, headers.status))
		if err != nil {
			return nil, "", err
		}
		asset.Status = status
	}

	if headers.dataAquisicao >= 0 {
		dateValue, err := parseCSVDate(csvValue(row, headers.dataAquisicao))
		if err != nil {
			return nil, "", err
		}
		asset.DataAquisicao = dateValue
	}

	if headers.valor >= 0 {
		floatValue, err := parseCSVFloat(csvValue(row, headers.valor))
		if err != nil {
			return nil, "", err
		}
		asset.Valor = floatValue
	}

	if headers.ativoFixo >= 0 {
		asset.Bloqueado = parseCSVBool(csvValue(row, headers.ativoFixo))
	}
	if headers.requerTermoRH >= 0 {
		asset.RequerTermoRH = parseCSVBool(csvValue(row, headers.requerTermoRH))
	}

	categoriaID, err := lookupReferenceID[models.AssetCategory](tx, csvValue(row, headers.categoria))
	if err != nil {
		return nil, "", fmt.Errorf("categoria: %w", err)
	}
	localID, err := lookupReferenceID[models.Localizacao](tx, csvValue(row, headers.localizacao))
	if err != nil {
		return nil, "", fmt.Errorf("localização: %w", err)
	}
	armazenamentoID, err := lookupReferenceID[models.Armazenamento](tx, csvValue(row, headers.armazenamento))
	if err != nil {
		return nil, "", fmt.Errorf("armazenamento: %w", err)
	}
	fornecedorID, err := lookupReferenceID[models.Fornecedor](tx, csvValue(row, headers.fornecedor))
	if err != nil {
		return nil, "", fmt.Errorf("fornecedor: %w", err)
	}
	setorID, err := lookupReferenceID[models.Departamento](tx, csvValue(row, headers.setor))
	if err != nil {
		return nil, "", fmt.Errorf("setor: %w", err)
	}

	asset.CategoriaID = categoriaID
	asset.CurrentLocalID = localID
	asset.CurrentArmazenamentoID = armazenamentoID
	asset.FornecedorID = fornecedorID
	asset.CurrentDepartamentoID = setorID

	return &asset, action, nil
}

func stringPointerOrNil(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}

func parseAssetStatus(value string) (models.AssetStatus, error) {
	normalized := strings.ToLower(strings.TrimSpace(value))
	switch normalized {
	case "", "disponivel", "disponível":
		return models.AssetStatusDisponivel, nil
	case "em uso", "emuso":
		return models.AssetStatusEmUso, nil
	case "manutencao", "manutenção":
		return models.AssetStatusManutencao, nil
	case "armazenado":
		return models.AssetStatusArmazenado, nil
	case "baixado":
		return models.AssetStatusBaixado, nil
	default:
		return "", fmt.Errorf("status inválido: %s", value)
	}
}

func parseCSVDate(value string) (*time.Time, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil, nil
	}

	layouts := []string{"02/01/2006", "2006-01-02", time.RFC3339}
	for _, layout := range layouts {
		if parsed, err := time.Parse(layout, value); err == nil {
			return &parsed, nil
		}
	}
	return nil, fmt.Errorf("data inválida: %s", value)
}

func parseCSVFloat(value string) (*float64, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil, nil
	}
	lastComma := strings.LastIndex(value, ",")
	lastDot := strings.LastIndex(value, ".")
	switch {
	case lastComma >= 0 && lastDot >= 0:
		if lastComma > lastDot {
			value = strings.ReplaceAll(value, ".", "")
			value = strings.ReplaceAll(value, ",", ".")
		} else {
			value = strings.ReplaceAll(value, ",", "")
		}
	case lastComma >= 0:
		value = strings.ReplaceAll(value, ".", "")
		value = strings.ReplaceAll(value, ",", ".")
	default:
		value = strings.ReplaceAll(value, ",", "")
	}
	parsed, err := strconv.ParseFloat(value, 64)
	if err != nil {
		return nil, fmt.Errorf("valor inválido: %s", value)
	}
	return &parsed, nil
}

func parseCSVBool(value string) bool {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "1", "true", "sim", "s", "yes", "y":
		return true
	default:
		return false
	}
}

func lookupReferenceID[T any](tx *gorm.DB, name string) (*uint, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, nil
	}

	var item struct {
		ID uint
	}
	if err := tx.Model(new(T)).Select("id").Where("nome = ?", name).First(&item).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, fmt.Errorf("'%s' não encontrado", name)
		}
		return nil, err
	}
	return &item.ID, nil
}

func (h *AssetHandler) Update(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido"})
		return
	}

	// Find existing
	asset, err := h.repo.GetByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Ativo não encontrado"})
		return
	}

	oldStatus := asset.Status
	var oldUserID *uint
	if asset.CurrentUserID != nil {
		uid := *asset.CurrentUserID
		oldUserID = &uid
	}

	// Bind update payload into existing struct
	if err := c.ShouldBindJSON(asset); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Ensure ID stays the same
	asset.ID = uint(id)

	// Keep the legacy display field in sync with the canonical user relation.
	// This prevents an old free-text value in `em_posse_de` from diverging from
	// the user actually linked to the asset whenever it is marked as in use.
	if asset.Status == models.AssetStatusEmUso && asset.CurrentUserID == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Selecione o usuário responsável para colocar o ativo em uso"})
		return
	}

	// When an asset is newly assigned (or the responsible user changes),
	// derive its location, department and storage from the user. Once the
	// same user is already assigned, preserve manually edited location data.
	userAssignmentChanged := !sameAssetUserID(oldUserID, asset.CurrentUserID)
	if asset.Status == models.AssetStatusEmUso && asset.CurrentUserID != nil &&
		(oldStatus != models.AssetStatusEmUso || userAssignmentChanged) {
		var currentUser models.User
		if err := h.repo.DB().Preload("Departamento").Preload("Localizacao").First(&currentUser, *asset.CurrentUserID).Error; err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Usuário responsável pelo ativo não encontrado"})
			return
		}
		asset.EmPosseDe = &currentUser.Nome
		asset.CurrentDepartamentoID = currentUser.DepartamentoID
		asset.CurrentLocalID = currentUser.LocalizacaoID
		asset.CurrentArmazenamentoID = nil
	} else if asset.Status == models.AssetStatusDisponivel {
		// Um ativo disponível não pode continuar atribuído a uma pessoa.
		asset.CurrentUserID = nil
		asset.EmPosseDe = nil
	}

	if err := h.repo.Update(asset); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Sync maintenance records if status changed to/from Manutenção
	newStatusLower := strings.ToLower(string(asset.Status))
	oldStatusLower := strings.ToLower(string(oldStatus))

	if (strings.Contains(newStatusLower, "manuten") || asset.Status == models.AssetStatusManutencao) && !strings.Contains(oldStatusLower, "manuten") {
		// Ensure active record exists in table manutencoes
		var count int64
		h.repo.DB().Model(&models.Manutencao{}).
			Where("asset_id = ? AND status = ?", asset.ID, models.StatusManutencaoEmAndamento).
			Count(&count)

		if count == 0 {
			var userIDPtr *uint
			if user := middleware.GetCurrentUser(c); user != nil {
				uid := user.ID
				userIDPtr = &uid
			}
			maint := models.Manutencao{
				AssetID:       asset.ID,
				ResponsavelID: userIDPtr,
				Motivo:        "Ativo alterado para Manutenção via cadastro de ativos",
				Tipo:          models.TipoManutencaoCorretiva,
				DataEntrada:   time.Now(),
				Status:        models.StatusManutencaoEmAndamento,
			}
			_ = h.repo.DB().Create(&maint).Error
		}
	} else if strings.Contains(oldStatusLower, "manuten") && !strings.Contains(newStatusLower, "manuten") {
		// Conclude active maintenance
		now := time.Now()
		h.repo.DB().Model(&models.Manutencao{}).
			Where("asset_id = ? AND status = ?", asset.ID, models.StatusManutencaoEmAndamento).
			Updates(map[string]interface{}{
				"status":         models.StatusManutencaoConcluida,
				"data_conclusao": &now,
			})
	}

	// Handle User Transfer (Emprestimo Implícito)
	if asset.CurrentUserID != nil {
		if oldUserID == nil || *oldUserID != *asset.CurrentUserID {
			var adminIDPtr *uint
			if user := middleware.GetCurrentUser(c); user != nil {
				uid := user.ID
				adminIDPtr = &uid
			}

			now := time.Now()
			sol := &models.Solicitacao{
				SolicitanteID:   asset.CurrentUserID,
				AssetID:         &asset.ID,
				Motivo:          "Transferência direta via painel de ativos",
				Status:          models.StatusSolicitacaoEntregue,
				DataSolicitacao: now,
				DataAprovacao:   &now,
				AprovadorID:     adminIDPtr,
				DataEntrega:     &now,
				ConfirmadoPorID: adminIDPtr,
			}

			_ = h.repo.DB().Create(sol).Error

			mov := &models.Movimentacao{
				AssetID:    asset.ID,
				Tipo:       models.TipoMovimentacaoEmprestimo,
				DeUserID:   oldUserID,
				ParaUserID: asset.CurrentUserID,
				Data:       now,
			}
			obs := "Transferência direta registrada pelo painel"
			mov.Observacao = &obs
			_ = h.repo.DB().Create(mov).Error
		}
	}

	// Return the persisted asset with fresh relations. The update request may
	// change a foreign key such as CurrentLocalID, while the asset loaded above
	// still holds the old preloaded CurrentLocal relation in memory.
	updatedAsset, err := h.repo.GetByID(asset.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ativo atualizado, mas não foi possível recarregar os dados"})
		return
	}
	c.JSON(http.StatusOK, updatedAsset)
}

func (h *AssetHandler) Delete(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido"})
		return
	}

	if err := h.repo.Delete(uint(id)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "deleted"})
}

func (h *AssetHandler) GetReferences(c *gin.Context) {
	refs, err := h.repo.GetReferences()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, refs)
}

func (h *AssetHandler) CreateCategoria(c *gin.Context) {
	var item models.AssetCategory
	if err := c.ShouldBindJSON(&item); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.repo.DB().Create(&item).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Erro ao criar categoria"})
		return
	}
	c.JSON(http.StatusCreated, item)
}

func (h *AssetHandler) UpdateCategoria(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido"})
		return
	}

	var payload struct {
		Nome string `json:"nome" binding:"required"`
	}
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Nome da categoria é obrigatório"})
		return
	}

	var item models.AssetCategory
	if err := h.repo.DB().First(&item, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Categoria não encontrada"})
		return
	}

	item.Nome = strings.TrimSpace(payload.Nome)
	if item.Nome == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Nome da categoria é obrigatório"})
		return
	}

	if err := h.repo.DB().Save(&item).Error; err != nil {
		if strings.Contains(err.Error(), "duplicate key") || strings.Contains(err.Error(), "unique constraint") {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Já existe uma categoria com esse nome"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Erro ao atualizar categoria"})
		return
	}

	c.JSON(http.StatusOK, item)
}

func (h *AssetHandler) DeleteCategoria(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido"})
		return
	}

	if err := h.repo.DB().Delete(&models.AssetCategory{}, id).Error; err != nil {
		if strings.Contains(err.Error(), "foreign key constraint") || strings.Contains(err.Error(), "violates foreign key") || strings.Contains(err.Error(), "a foreign key constraint fails") || strings.Contains(err.Error(), "SQLSTATE 23503") {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Não é possível excluir esta categoria pois existem ativos vinculados a ela."})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Erro ao excluir categoria"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"detail": "Categoria excluída com sucesso"})
}

func (h *AssetHandler) CreateLocalizacao(c *gin.Context) {
	var item models.Localizacao
	if err := c.ShouldBindJSON(&item); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.repo.DB().Create(&item).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Erro ao criar localização"})
		return
	}
	c.JSON(http.StatusCreated, item)
}

func (h *AssetHandler) UpdateLocalizacao(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido"})
		return
	}

	var payload struct {
		Nome string `json:"nome" binding:"required"`
	}
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Nome da localização é obrigatório"})
		return
	}

	var item models.Localizacao
	if err := h.repo.DB().First(&item, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Localização não encontrada"})
		return
	}

	item.Nome = strings.TrimSpace(payload.Nome)
	if item.Nome == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Nome da localização é obrigatório"})
		return
	}

	if err := h.repo.DB().Save(&item).Error; err != nil {
		if strings.Contains(err.Error(), "duplicate key") || strings.Contains(err.Error(), "unique constraint") {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Já existe uma localização com esse nome"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Erro ao atualizar localização"})
		return
	}

	c.JSON(http.StatusOK, item)
}

func (h *AssetHandler) DeleteLocalizacao(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido"})
		return
	}

	if err := h.repo.DB().Delete(&models.Localizacao{}, id).Error; err != nil {
		if strings.Contains(err.Error(), "foreign key constraint") || strings.Contains(err.Error(), "violates foreign key") || strings.Contains(err.Error(), "a foreign key constraint fails") || strings.Contains(err.Error(), "SQLSTATE 23503") {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Não é possível excluir esta localização pois existem ativos vinculados a ela."})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Erro ao excluir localização"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"detail": "Localização excluída com sucesso"})
}

func (h *AssetHandler) CreateArmazenamento(c *gin.Context) {
	var item models.Armazenamento
	if err := c.ShouldBindJSON(&item); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.repo.DB().Create(&item).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Erro ao criar armazenamento"})
		return
	}
	c.JSON(http.StatusCreated, item)
}

func (h *AssetHandler) CreateDepartamento(c *gin.Context) {
	var item models.Departamento
	if err := c.ShouldBindJSON(&item); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.repo.DB().Create(&item).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Erro ao criar departamento"})
		return
	}
	c.JSON(http.StatusCreated, item)
}

func (h *AssetHandler) DeleteDepartamento(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido"})
		return
	}

	if err := h.repo.DB().Delete(&models.Departamento{}, id).Error; err != nil {
		if strings.Contains(err.Error(), "foreign key constraint") || strings.Contains(err.Error(), "violates foreign key") || strings.Contains(err.Error(), "a foreign key constraint fails") || strings.Contains(err.Error(), "SQLSTATE 23503") {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Não é possível excluir este setor pois existem usuários ou ativos vinculados a ele."})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Erro ao excluir departamento"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"detail": "Setor excluído com sucesso"})
}
func (h *AssetHandler) GetQRCode(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido"})
		return
	}

	asset, err := h.repo.GetByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Ativo não encontrado"})
		return
	}

	qrContent := fmt.Sprintf("assettrack://assets/ep/%s", asset.EPatrimonio)
	pngBytes, err := qrcode.Encode(qrContent, qrcode.Medium, 256)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Erro ao gerar QR Code"})
		return
	}

	c.Data(http.StatusOK, "image/png", pngBytes)
}

func (h *AssetHandler) ScanQRCode(c *gin.Context) {
	fileHeader, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Arquivo não enviado"})
		return
	}

	file, err := fileHeader.Open()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Falha ao abrir arquivo"})
		return
	}
	defer file.Close()

	fileBytes, err := io.ReadAll(file)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Falha ao ler arquivo"})
		return
	}

	// Decode QR image bytes using pure Go qr decoder
	matrix, err := qrdecoder.Decode(bytes.NewReader(fileBytes))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Não foi possível decodificar o QR Code"})
		return
	}

	decoded := strings.TrimSpace(matrix.Content)
	var asset *models.Asset

	if strings.Contains(decoded, "assets/ep/") {
		patrimonio := strings.Split(decoded, "assets/ep/")[1]
		patrimonio = strings.Split(patrimonio, "?")[0]
		patrimonio = strings.Split(patrimonio, "/")[0]
		asset, err = h.repo.GetByEPatrimonio(strings.TrimSpace(patrimonio))
	} else if strings.Contains(decoded, "assets/sn/") {
		serial := strings.Split(decoded, "assets/sn/")[1]
		serial = strings.Split(serial, "?")[0]
		serial = strings.Split(serial, "/")[0]
		asset, err = h.repo.GetByEPatrimonio(strings.TrimSpace(serial))
	} else if strings.Contains(decoded, "assets/") {
		assetIDStr := strings.Split(decoded, "assets/")[1]
		assetIDStr = strings.Split(assetIDStr, "?")[0]
		assetIDStr = strings.Split(assetIDStr, "/")[0]
		assetID, _ := strconv.ParseUint(assetIDStr, 10, 32)
		asset, err = h.repo.GetByID(uint(assetID))
	} else {
		// Try parsing direct ID first
		assetID, errParse := strconv.ParseUint(decoded, 10, 32)
		if errParse == nil {
			asset, err = h.repo.GetByID(uint(assetID))
		}
		// If not found by ID or decode is alphanumeric, search by EPatrimonio
		if asset == nil {
			asset, err = h.repo.GetByEPatrimonio(decoded)
		}
	}

	if err != nil || asset == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Ativo não encontrado com base no QR Code"})
		return
	}

	c.JSON(http.StatusOK, asset)
}

type BulkCopySpec struct {
	EPatrimonio            string  `json:"e_patrimonio" binding:"required"`
	NumeroSerie            *string `json:"numero_serie"`
	CurrentLocalID         *uint   `json:"current_local_id"`
	CurrentArmazenamentoID *uint   `json:"current_armazenamento_id"`
}

type BulkDuplicateRequest struct {
	TemplateID uint           `json:"template_id" binding:"required"`
	Copies     []BulkCopySpec `json:"copies" binding:"required"`
}

type BulkCopyResult struct {
	EPatrimonio string `json:"e_patrimonio"`
	Success     bool   `json:"success"`
	Error       string `json:"error,omitempty"`
	AssetID     uint   `json:"asset_id,omitempty"`
}

func (h *AssetHandler) BulkDuplicate(c *gin.Context) {
	var req BulkDuplicateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	template, err := h.repo.GetByID(req.TemplateID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Ativo template não encontrado"})
		return
	}

	results := make([]BulkCopyResult, 0, len(req.Copies))
	successCount := 0
	failedCount := 0

	for _, copySpec := range req.Copies {
		// Check EPatrimonio uniqueness
		existing, _ := h.repo.GetByEPatrimonio(copySpec.EPatrimonio)
		if existing != nil {
			results = append(results, BulkCopyResult{
				EPatrimonio: copySpec.EPatrimonio,
				Success:     false,
				Error:       "Ativo com este E-Patrimônio já existe",
			})
			failedCount++
			continue
		}

		// Prepare duplicate object from template
		newAsset := models.Asset{
			Nome:                   template.Nome,
			Modelo:                 template.Modelo,
			Descricao:              template.Descricao,
			Valor:                  template.Valor,
			Status:                 models.AssetStatusDisponivel,
			Bloqueado:              template.Bloqueado,
			RequerTermoRH:          template.RequerTermoRH,
			DatasheetPath:          template.DatasheetPath,
			DatasheetNome:          template.DatasheetNome,
			CategoriaID:            template.CategoriaID,
			FornecedorID:           template.FornecedorID,
			NotaFiscalID:           template.NotaFiscalID,
			CurrentUserID:          nil, // Disassociated on copy
			CurrentDepartamentoID:  template.CurrentDepartamentoID,
			CurrentLocalID:         copySpec.CurrentLocalID,
			CurrentArmazenamentoID: copySpec.CurrentArmazenamentoID,
			EPatrimonio:            copySpec.EPatrimonio,
			NumeroSerie:            copySpec.NumeroSerie,
		}

		// Inherit location from template if not customized in the spec
		if newAsset.CurrentLocalID == nil {
			newAsset.CurrentLocalID = template.CurrentLocalID
		}
		if newAsset.CurrentArmazenamentoID == nil {
			newAsset.CurrentArmazenamentoID = template.CurrentArmazenamentoID
		}

		// Auth context user id as creator
		if user := middleware.GetCurrentUser(c); user != nil {
			userID := user.ID
			newAsset.CreatedByID = &userID
		}

		// Create copy spec
		if err := h.repo.Create(&newAsset); err != nil {
			results = append(results, BulkCopyResult{
				EPatrimonio: copySpec.EPatrimonio,
				Success:     false,
				Error:       err.Error(),
			})
			failedCount++
		} else {
			results = append(results, BulkCopyResult{
				EPatrimonio: copySpec.EPatrimonio,
				Success:     true,
				AssetID:     newAsset.ID,
			})
			successCount++
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"success_count": successCount,
		"failed_count":  failedCount,
		"results":       results,
	})
}

// GetAssetHistory returns the complete audit and operational history of an asset
func (h *AssetHandler) GetAssetHistory(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido"})
		return
	}
	assetID := uint(id)

	asset, err := h.repo.GetByID(assetID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Ativo não encontrado"})
		return
	}

	db := h.repo.DB()

	// 1. Movimentações
	var movs []models.Movimentacao
	_ = db.Where("asset_id = ?", assetID).
		Preload("DeUser").
		Preload("ParaUser").
		Order("data desc").
		Find(&movs).Error

	// 2. Solicitações de Empréstimo
	var sols []models.Solicitacao
	_ = db.Where("asset_id = ?", assetID).
		Preload("Solicitante").
		Preload("Aprovador").
		Preload("Confirmador").
		Preload("Recebedor").
		Preload("Termo").
		Order("data_solicitacao desc").
		Find(&sols).Error

	// 3. Manutenções Corretivas / Gerais
	var maints []models.Manutencao
	_ = db.Where("asset_id = ?", assetID).
		Preload("Responsavel").
		Preload("DestinoUser").
		Order("data_entrada desc").
		Find(&maints).Error

	// 4. Solicitações de Manutenção
	var solMaints []models.SolicitacaoManutencao
	_ = db.Where("asset_id = ?", assetID).
		Preload("Solicitante").
		Preload("Responsavel").
		Preload("Manutencao").
		Order("data_solicitacao desc").
		Find(&solMaints).Error

	// 5. Ordens de Manutenção Preventiva
	var prevOrders []models.MaintenanceOrder
	_ = db.Where("asset_id = ?", assetID).
		Preload("Plan").
		Preload("Tecnico").
		Preload("ValidadoPor").
		Preload("Materials").
		Preload("Photos").
		Preload("History").
		Preload("Executions.ChecklistItem").
		Order("data_abertura desc").
		Find(&prevOrders).Error

	// 6. Planos Preventivos Vinculados
	var planAssets []models.MaintenancePlanAsset
	var planIDs []uint
	_ = db.Where("asset_id = ?", assetID).Find(&planAssets).Error
	for _, pa := range planAssets {
		planIDs = append(planIDs, pa.PlanID)
	}
	var plans []models.MaintenancePlan
	if len(planIDs) > 0 {
		_ = db.Where("id IN ?", planIDs).
			Preload("Responsavel").
			Preload("Departamento").
			Find(&plans).Error
	}

	// 7. Solicitações de Compra / Peças vinculadas
	var purchaseItems []models.PurchaseRequestItem
	_ = db.Joins("JOIN purchase_requests ON purchase_requests.id = purchase_request_items.request_id").
		Where("purchase_request_items.observacao ILIKE ? OR purchase_requests.justificativa ILIKE ?", "%"+asset.EPatrimonio+"%", "%"+asset.EPatrimonio+"%").
		Preload("Request.Solicitante").
		Preload("Product").
		Preload("FornecedorSugerido").
		Order("purchase_request_items.id desc").
		Find(&purchaseItems).Error

	c.JSON(http.StatusOK, gin.H{
		"asset":                   asset,
		"movimentacoes":           movs,
		"solicitacoes_emprestimo": sols,
		"manutencoes":             maints,
		"solicitacoes_manutencao": solMaints,
		"manutencoes_preventivas": prevOrders,
		"planos_preventivos":      plans,
		"solicitacoes_compra":     purchaseItems,
	})
}

func (h *AssetHandler) UploadDatasheet(c *gin.Context) {
	fileHeader, err := c.FormFile("arquivo")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Arquivo não fornecido"})
		return
	}

	// Limit to 25MB
	if fileHeader.Size > 25*1024*1024 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "O arquivo deve ter no máximo 25MB"})
		return
	}

	ext := strings.ToLower(filepath.Ext(fileHeader.Filename))
	validExts := map[string]bool{
		".pdf": true,
		".txt": true,
		".csv": true,
	}
	if !validExts[ext] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Formato inválido. Apenas arquivos .pdf, .txt ou .csv são permitidos"})
		return
	}

	uploadDir := filepath.Join("uploads", "datasheets")
	if err := os.MkdirAll(uploadDir, 0o755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Falha ao criar diretório de upload"})
		return
	}

	cleanOriginal := filepath.Base(fileHeader.Filename)
	filename := fmt.Sprintf("datasheet_%d%s", time.Now().UnixNano(), ext)
	dst := filepath.Join(uploadDir, filename)

	if err := c.SaveUploadedFile(fileHeader, dst); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Falha ao salvar o arquivo do datasheet"})
		return
	}

	publicPath := fmt.Sprintf("/uploads/datasheets/%s", filename)
	c.JSON(http.StatusOK, gin.H{
		"url":      publicPath,
		"filename": cleanOriginal,
	})
}

func (h *AssetHandler) DownloadDatasheet(c *gin.Context) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "ID inválido"})
		return
	}

	asset, err := h.repo.GetByID(uint(id))
	if err != nil || asset.DatasheetPath == nil || *asset.DatasheetPath == "" {
		c.JSON(http.StatusNotFound, gin.H{"error": "Datasheet não encontrado para este ativo"})
		return
	}

	pathVal := strings.TrimSpace(*asset.DatasheetPath)
	candidates := []string{
		strings.TrimPrefix(pathVal, "/"),
		filepath.Join("uploads", strings.TrimPrefix(pathVal, "/uploads/")),
		filepath.Join("uploads", "datasheets", filepath.Base(pathVal)),
	}

	var foundPath string
	for _, cand := range candidates {
		if _, err := os.Stat(cand); err == nil {
			foundPath = cand
			break
		}
	}

	if foundPath == "" {
		c.JSON(http.StatusNotFound, gin.H{"error": "Arquivo do datasheet não foi encontrado no servidor"})
		return
	}

	filename := "datasheet"
	if asset.DatasheetNome != nil && *asset.DatasheetNome != "" {
		filename = *asset.DatasheetNome
	} else {
		filename = filepath.Base(foundPath)
	}

	ext := strings.ToLower(filepath.Ext(foundPath))
	switch ext {
	case ".pdf":
		c.Header("Content-Type", "application/pdf")
	case ".txt":
		c.Header("Content-Type", "text/plain; charset=utf-8")
	case ".csv":
		c.Header("Content-Type", "text/csv; charset=utf-8")
	}

	c.Header("Content-Disposition", fmt.Sprintf("inline; filename=\"%s\"", filename))
	c.File(foundPath)
}
