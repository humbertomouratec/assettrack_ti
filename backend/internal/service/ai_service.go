package service

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io/ioutil"
	"net/http"
	"strings"

	"github.com/assettrack/backend/internal/models"
	"github.com/assettrack/backend/internal/repository"
)

type AIService interface {
	Chat(ctx context.Context, currentUser *models.User, messages []map[string]interface{}) (string, error)
}

type aiService struct {
	settingsRepo repository.SystemSettingsRepository
}

func buildApplicationHelpContext(currentUser *models.User) string {
	role := "usuario_comum"
	nome := "Colaborador"
	if currentUser != nil {
		if currentUser.Role != "" {
			role = currentUser.Role
		}
		if currentUser.Nome != "" {
			nome = currentUser.Nome
		}
	}

	roleName := "Usuário Comum"
	switch role {
	case "admin":
		roleName = "Administrador do Sistema"
	case "gerente_ti":
		roleName = "Gerente de TI"
	case "gerente_infra":
		roleName = "Gerente de Infraestrutura"
	case "tecnico":
		roleName = "Técnico de TI / Suporte"
	case "comprador":
		roleName = "Comprador / Suprimentos"
	case "rh":
		roleName = "Recursos Humanos (RH)"
	case "usuario_comum":
		roleName = "Usuário Comum / Solicitante"
	}

	var modulesBuilder strings.Builder

	// Common modules available to all users
	modulesBuilder.WriteString(`
1. ACESSO E AUTENTICAÇÃO (/login):
   - Login por e-mail e senha corporativos ou por Crachá Digital QR Code + PIN numérico de 4 a 6 dígitos.
   - Cabeçalho: monitor de conexão (Online/Offline), botão de emergência, perfil e download do app Android APK.

2. DASHBOARD (/ e /dashboard):
   - Visão dos seus equipamentos em posse, chamados abertos e carrossel de Comunicados Oficiais.

3. MEU PERFIL E PORTAL PESSOAL (/profile):
   - Atualização de dados pessoais, troca de senha e upload de foto de avatar (usada em chamados e na TV).
   - Consulta ao seu status pessoal de RH (folga, férias, banco de horas, atestados) e comunicados recebidos.

4. MEU CRACHÁ DIGITAL QR (/badge):
   - Exibição de QR Code exclusivo e redefinição de PIN de segurança.
   - Usado pela equipe de TI para validar formalmente a entrega e devolução física de equipamentos.

5. CENTRAL DE SUPORTE - SERVICE DESK (/servicos):
   - Abertura de chamados: seleção de categoria/serviço, prioridade (Baixa, Média, Alta, Crítica), descrição e fotos/anexos.
   - Timeline em tempo real com mensagens de interação com a equipe técnica.

6. EMPRÉSTIMOS E POSSE DE EQUIPAMENTOS (/emprestimos):
   - Solicitação de ativos com justificativa e período necessário; acompanhamento de aprovação e devolução ao estoque com confirmação por QR.

7. MANUTENÇÃO CORRETIVA (/manutencoes):
   - Solicitação de reparo direto para o equipamento sob sua posse quando apresentar defeito ou quebra física.

8. ALERTAS EMERGENCIAIS & BOTÃO DE PÂNICO (/alertas):
   - Acionamento imediato em situações críticas com descrição rápida. O sistema identifica seu nome e equipamento em uso e transmite alarme com som à equipe de TI.

9. APLICATIVO MÓVEL ANDROID (/api/v1/app/download):
   - Download do APK oficial. No app móvel, informe apenas a URL base da aplicação.`)

	// Technician modules
	if role == "tecnico" || role == "gerente_ti" || role == "gerente_infra" || role == "admin" {
		modulesBuilder.WriteString(`

10. ATIVOS & INVENTÁRIO PATRIMONIAL (/assets):
    - Consulta e cadastro de ativos, etiquetas com QR Code, upload de datasheets PDF, importação/exportação CSV e histórico de movimentações.

11. GESTÃO DE SUPORTE - SERVICE DESK TÉCNICO (/servicos):
    - Atribuição de técnicos a chamados, atualização de status (Aberto, Em Atendimento, Aguardando Peça, Concluído, Cancelado), envio de mensagens e registro de solução com laudo.

12. EXECUÇÃO DE MANUTENÇÃO CORRETIVA (/manutencoes):
    - Assumir ordens de reparo, diagnóstico técnico, solicitação de peças ao módulo de compras e conclusão com entrega via QR Code.

13. MANUTENÇÃO PREVENTIVA PROGRAMADA (/manutencao-preventiva):
    - Execução de ordens preventivas com checklist de itens normativos, fotos antes/depois, baixa de materiais e histórico.

14. KANBAN DE PROJETOS (/kanban):
    - Quadro ágil SSE em tempo real, colunas customizáveis, cards com prazos, responsáveis, checklists, anexos e compras vinculadas.

15. SALA DE MONITORAMENTO TV - NOC (/monitoramento):
    - Painel TV em tempo real (atualização a cada 5s) com chamados, manutenções, kanban, escala do RH e alertas sonoros.

16. COMUNICADOS OFICIAIS (/alertas):
    - Publicação de avisos corporativos com texto, imagens, vídeos ou links externos.`)
	}

	// Procurement modules
	if role == "comprador" || role == "gerente_ti" || role == "gerente_infra" || role == "admin" {
		modulesBuilder.WriteString(`

17. COMPRAS, COTAÇÕES & ESTOQUE (/compras):
    - Solicitações de compra (manuais ou vindas de chamados/manutenções/Kanban), cotações com múltiplos fornecedores e aprovação de vencedor.
    - Pedidos de compra, recebimento físico com reconciliação/criação automática de ativos no inventário patrimonial.
    - Controle de estoque físico de peças, transações de consumo, contratos de fornecimento e pesquisas de mercado.

18. FORNECEDORES & NOTAS FISCAIS (/compras/fornecedores):
    - Cadastro de fornecedores com CNPJ e contatos, upload e processamento automático de XML de NF-e.`)
	}

	// HR modules
	if role == "rh" || role == "admin" {
		modulesBuilder.WriteString(`

19. PORTAL RH: TERMOS, STATUS & PESSOAS (/rh):
    - Emissão de Termos de Responsabilidade em PDF com base em entregas de equipamentos e upload de termos assinados.
    - Escala diária da equipe (Trabalhando, Home Office, Folga, Férias, Atestado, Licença) e controle de saldo de Banco de Horas.
    - Definição de colaboradores visíveis na Sala TV, comunicados do RH e processo de desligamento (Offboarding).

20. RELATÓRIOS DE USUÁRIOS (/users):
    - Consulta de histórico individual de colaboradores com ativos em posse e vínculos.`)
	}

	// Management & Admin modules
	if role == "gerente_ti" || role == "gerente_infra" || role == "admin" {
		modulesBuilder.WriteString(`

21. SETORES & DEPARTAMENTOS (/setores):
    - Cadastro e gerenciamento de áreas da empresa para alocação de colaboradores e patrimônio.

22. BACKUP & RESTORE (/backups):
    - Geração de backup .ZIP (dump PostgreSQL + uploads), download e restauração direta do sistema.

23. CONFIGURAÇÕES GERAIS (/configuracoes):
    - Chaveamento modular (Preventiva, Compras, Kanban, IA) e servidor SMTP com teste de envio em tempo real.`)
	}

	// Admin exclusive modules & Matrix
	if role == "admin" {
		modulesBuilder.WriteString(`

24. USUÁRIOS & PERMISSÕES RBAC (/users):
    - Criação de usuários, definição de perfis, ativação/inativação e redefinição de senhas.

25. WEBHOOKS & INTEGRAÇÕES (/webhooks):
    - Cadastro de endpoints HTTP JSON para notificações em tempo real (Slack, Teams, Discord, ERPs) com testes e logs.

26. LOGS DE E-MAIL (/logs-email):
    - Auditoria de mensagens SMTP disparadas pelo sistema e diagnóstico de entrega.

27. MATRIZ DE ACESSOS E PERMISSÕES DO SISTEMA:
    - Administrador (admin): Acesso total e irrestrito a todos os 22 módulos do sistema.
    - Gerente de TI / Infra (gerente_ti / gerente_infra): Gestão de ativos, chamados, manutenções, preventivas, kanban, compras, fornecedores, setores, TV e backups.
    - Técnico (tecnico): Atendimento a chamados, execução de manutenções corretivas/preventivas, kanban, ativos, empréstimos por QR, TV e emergências.
    - Comprador (comprador): Compras, cotações, pedidos, fornecedores, XML NF-e, estoque e pesquisas.
    - RH (rh): Termos de responsabilidade, escala da equipe, banco de horas, comunicados do RH e relatórios de usuários.
    - Usuário Comum (usuario_comum): Dashboard, abertura/acompanhamento de chamados, solicitação/devolução de ativos, reparo de seu ativo, emergência, crachá QR com PIN, perfil e app Android.`)
	}

	matrixNotice := "A Matriz de Acessos do sistema é restrita a Administradores. Não forneça detalhes da matriz completa de governança a outros perfis."
	if role == "admin" {
		matrixNotice = "Como o usuário atual é Administrador, você pode explicar a Matriz de Acessos e governança sempre que solicitado."
	}

	return fmt.Sprintf(`Você é o Assistente Oficial de Ajuda e IA do AssetTrack TI.
Responda sempre em português do Brasil (pt-BR), de forma clara, prestativa, objetiva e estruturada.

DADOS DO USUÁRIO QUE ESTÁ CONVERSANDO COM VOCÊ:
- Nome: %s
- Perfil de Acesso (Role): %s (%s)

DIRETRIZES FUNDAMENTAIS DE ESCOPO E PERMISSÃO:
1. Você DEVE orientar e fornecer instruções SOMENTE sobre os módulos e recursos que condizem com o perfil do usuário atual (%s).
2. NUNCA forneça instruções passo a passo ou caminhos de módulos restritos aos quais o usuário atual não tem permissão de acesso.
   - Exemplo: se um 'usuario_comum' perguntar como cadastrar um ativo, criar preventiva, aprovar compras ou cadastrar setores, informe educadamente que essa rotina é exclusiva para a equipe técnica/gestão e recomende abrir um chamado na Central de Suporte (/servicos).
3. %s
4. NUNCA invente botões, URLs ou recursos inexistentes.
5. NUNCA diga que executou comandos, alterou o banco de dados SQL ou consultou registros no servidor diretamente, pois você é estritamente um assistente de orientação da interface.

MÓDULOS E FUNCIONALIDADES AUTORIZADAS PARA ESTE PERFIL:
%s

Ao orientar o usuário, seja educado, forneça os caminhos exatos na interface (menu lateral, botões e telas) e atenha-se estritamente ao que está autorizado para o perfil %s.`,
		nome, roleName, role, roleName, matrixNotice, modulesBuilder.String(), roleName)
}

func NewAIService(settingsRepo repository.SystemSettingsRepository) AIService {
	return &aiService{
		settingsRepo: settingsRepo,
	}
}

func (s *aiService) Chat(ctx context.Context, currentUser *models.User, messages []map[string]interface{}) (string, error) {
	// Check if AI is enabled
	enabledSetting, _ := s.settingsRepo.GetSetting(ctx, "ai_enabled")
	if enabledSetting == nil || strings.ToLower(enabledSetting.SettingValue) != "true" {
		return "", errors.New("Assistente IA está desativado nas configurações do sistema")
	}

	providerSetting, _ := s.settingsRepo.GetSetting(ctx, "ai_provider")
	provider := "openai"
	if providerSetting != nil && providerSetting.SettingValue != "" {
		provider = providerSetting.SettingValue
	}

	apiKeySetting, _ := s.settingsRepo.GetSetting(ctx, provider+"_api_key")
	apiKey := ""
	if apiKeySetting != nil {
		apiKey = apiKeySetting.SettingValue
	}

	modelSetting, _ := s.settingsRepo.GetSetting(ctx, provider+"_model")
	model := ""
	if modelSetting != nil {
		model = modelSetting.SettingValue
	}

	enrichedMessages := withApplicationHelpContext(currentUser, messages)

	if provider == "ollama" {
		baseUrlSetting, _ := s.settingsRepo.GetSetting(ctx, "ollama_base_url")
		baseUrl := "http://localhost:11434"
		if baseUrlSetting != nil && baseUrlSetting.SettingValue != "" {
			baseUrl = baseUrlSetting.SettingValue
		}
		if model == "" {
			model = "llama3"
		}
		return s.chatOllama(ctx, baseUrl, model, enrichedMessages)
	} else if provider == "gemini" {
		if apiKey == "" {
			return "", errors.New("API Key não configurada para o Google Gemini")
		}
		if model == "" {
			model = "gemini-2.5-flash"
		}
		return s.chatGemini(ctx, apiKey, model, enrichedMessages)
	} else { // default to openai
		if apiKey == "" {
			return "", errors.New("API Key não configurada para OpenAI")
		}
		if model == "" {
			model = "gpt-4o-mini"
		}
		return s.chatOpenAI(ctx, apiKey, model, enrichedMessages)
	}
}

func withApplicationHelpContext(currentUser *models.User, messages []map[string]interface{}) []map[string]interface{} {
	contextMessage := map[string]interface{}{
		"role":    "system",
		"content": buildApplicationHelpContext(currentUser),
	}
	return append([]map[string]interface{}{contextMessage}, messages...)
}

func (s *aiService) chatOpenAI(ctx context.Context, apiKey string, model string, messages []map[string]interface{}) (string, error) {
	url := "https://api.openai.com/v1/chat/completions"
	payload := map[string]interface{}{
		"model":    model,
		"messages": messages,
	}

	body, _ := json.Marshal(payload)
	req, _ := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(body))
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := ioutil.ReadAll(resp.Body)
		return "", fmt.Errorf("OpenAI API error: %s", string(bodyBytes))
	}

	var result map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&result)

	choices, ok := result["choices"].([]interface{})
	if ok && len(choices) > 0 {
		choice := choices[0].(map[string]interface{})
		message := choice["message"].(map[string]interface{})
		return message["content"].(string), nil
	}

	return "", errors.New("Falha ao processar resposta da OpenAI")
}

func (s *aiService) chatGemini(ctx context.Context, apiKey string, model string, messages []map[string]interface{}) (string, error) {
	url := fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent?key=%s", model, apiKey)

	var geminiContents []map[string]interface{}
	for _, m := range messages {
		role := m["role"].(string)
		content := m["content"].(string)
		gRole := "user"
		if role == "assistant" {
			gRole = "model"
		} else if role == "system" {
			gRole = "user"
		}

		geminiContents = append(geminiContents, map[string]interface{}{
			"role": gRole,
			"parts": []map[string]interface{}{
				{"text": content},
			},
		})
	}

	payload := map[string]interface{}{
		"contents": geminiContents,
	}

	body, _ := json.Marshal(payload)
	req, _ := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := ioutil.ReadAll(resp.Body)
		return "", fmt.Errorf("Gemini API error: %s", string(bodyBytes))
	}

	var result map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&result)

	candidates, ok := result["candidates"].([]interface{})
	if ok && len(candidates) > 0 {
		candidate := candidates[0].(map[string]interface{})
		content := candidate["content"].(map[string]interface{})
		parts := content["parts"].([]interface{})
		if len(parts) > 0 {
			part := parts[0].(map[string]interface{})
			return part["text"].(string), nil
		}
	}

	return "", errors.New("Falha ao processar resposta do Gemini")
}

func (s *aiService) chatOllama(ctx context.Context, baseUrl string, model string, messages []map[string]interface{}) (string, error) {
	url := strings.TrimRight(baseUrl, "/") + "/api/chat"
	payload := map[string]interface{}{
		"model":    model,
		"messages": messages,
		"stream":   false,
	}

	body, _ := json.Marshal(payload)
	req, _ := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := ioutil.ReadAll(resp.Body)
		return "", fmt.Errorf("Ollama API error: %s", string(bodyBytes))
	}

	var result map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&result)

	message, ok := result["message"].(map[string]interface{})
	if ok {
		return message["content"].(string), nil
	}

	return "", errors.New("Falha ao processar resposta do Ollama")
}

