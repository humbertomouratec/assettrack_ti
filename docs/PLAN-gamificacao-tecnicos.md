# Plan: Sistema de Gamificação para Técnicos (AssetTrack TI)

> **Documento de Planejamento de Projeto (Project Planner)**  
> **Arquivo:** `docs/PLAN-gamificacao-tecnicos.md`  
> **Status:** Proposto / Pronto para Revisão  
> **Data:** 2026-09-27  

---

## 1. Overview

O módulo de **Gamificação para Técnicos** do **AssetTrack TI** tem como objetivo incentivar, engajar e reconhecer a produtividade e qualidade do trabalho dos técnicos de TI e manutenção. A cada atividade atendida ou concluída (fechamento de chamados no Service Desk, execução de ordens preventivas com checklist, movimentação/auditoria de ativos via QR Code, conclusão de tarefas no Kanban, etc.), o sistema computará pontos de experiência (**XP**) e **Moedas/Créditos de Conquista (TechCoins/Pontos)**, permitindo que o técnico suba de **Nível**, desbloqueie **Insígnias/Badges de Conquistas**, dispute posições no **Ranking (Leaderboard)** e visualize sua evolução profissional em um **Painel de Perfil Gamificado**.

---

## 2. Project Type
**WEB & MOBILE (Full-Stack)**
- **Backend:** Go (Gin, GORM, PostgreSQL)
- **Frontend Web & Mobile (Capacitor/Responsive):** React 18, TypeScript, Tailwind CSS, Lucide Icons, Canvas-Confetti, Radix UI

---

## 3. Lógica do Motor de Gamificação (Core Engine)

### 3.1. Fórmula Matemática de Progressão de Níveis
Para manter o incentivo tanto para novos técnicos quanto para veteranos, a curva de experiência segue uma progressão polinomial com amortecimento:

$$\text{XP\_Necessário}(L) = \lfloor 100 \times (L - 1)^{1.6} + 150 \times (L - 1) \rfloor$$

- **Nível 1 (Iniciante / Recruta TI):** $0 \text{ XP}$
- **Nível 2:** $250 \text{ XP}$ (fácil de alcançar no 1º ou 2º dia)
- **Nível 3:** $650 \text{ XP}$
- **Nível 5:** $1.800 \text{ XP}$
- **Nível 10 (Especialista TI):** $7.200 \text{ XP}$
- **Nível 25 (Mestre dos Sistemas):** $35.000 \text{ XP}$
- **Nível 50 (Lenda do Suporte / Arquiteto Supremo):** $120.000 \text{ XP}$

### 3.2. Matriz de Pontuação de Atividades (Tabela de XP)

| Atividade Executada | XP Base | Pontos / Moedas | Regra de Bônus / Multiplicador |
|---|---|---|---|
| **Chamado Resolvido (Service Desk)** | +60 XP | +30 pts | +20 XP se resolvido dentro do SLA de tempo |
| **Avaliação do Usuário (5 Estrelas)** | +40 XP | +25 pts | +10 XP por feedback positivo detalhado |
| **Ordem de Preventiva Concluída** | +80 XP | +40 pts | +30 XP se todos os itens de checklist forem auditados com fotos |
| **Chamado Urgente / Emergência Atendido** | +120 XP | +60 pts | Conclusão sem reabertura em 48h |
| **Card / Tarefa Concluída no Kanban** | +35 XP | +15 pts | Tarefas prioritárias do projeto |
| **Auditoria / Leitura de QR Code de Ativo** | +15 XP | +10 pts | Limite diário anti-spam (máx 15 scans pontuados/dia) |
| **Manutenção Corretiva Concluída** | +70 XP | +35 pts | Peças trocadas e inventário atualizado |
| **Sequência Diária (Daily Streak)** | +25 XP | +10 pts | Aumenta +5% XP para cada dia consecutivo ativo (máx 25%) |

### 3.3. Sistema de Conquistas (Badges / Insígnias)
As conquistas são desbloqueadas automaticamente através de triggers no backend:
1. **Primeiro Passo:** Conclua o primeiro chamado ou manutenção no sistema (+50 XP bônus).
2. **Relâmpago:** Resolva 5 chamados em menos de 50% do tempo estimado (+150 XP bônus).
3. **Mestre do Checklist:** Conclua 20 manutenções preventivas sem pendências (+300 XP bônus).
4. **Cinco Estrelas:** Receba 10 avaliações consecutivas nota 5 dos solicitantes (+400 XP bônus).
5. **Guardião do Patrimônio:** Realize leitura e auditoria via QR Code de mais de 100 ativos (+250 XP bônus).
6. **Resolutor de Crises:** Finalize com sucesso 5 alertas de emergência (+500 XP bônus).
7. **Sem Parar (Streak de 7 Dias):** Trabalhe e resolva ao menos 1 atividade por dia durante 7 dias seguidos (+200 XP bônus).

### 3.4. Regras Anti-Abuso (Fair Play & Integridade)
- **Rate Limiting de Ações Simples:** Leituras de QR Code repetidas no mesmo ativo no mesmo dia não concedem XP cumulativo.
- **Validação de Fechamento:** Chamados reabertos pelo solicitante têm seu bônus de XP deduzido ou congelado temporariamente.
- **Auto-Atendimento Proibido:** Técnicos que abrem chamados para si mesmos não pontuam na conclusão.

---

## 4. Success Criteria
- [ ] Qualquer atividade concluída por um técnico (Service Desk, Preventiva, Corretiva, Kanban, QR) computa XP em background sem travar a requisição.
- [ ] O técnico possui um painel de perfil gamificado com barra de progresso do nível atual, progresso para o próximo nível e insígnias conquistadas.
- [ ] Leaderboard / Ranking dinâmico (com abas: "Semana", "Mês" e "Geral"), com opção de anonimização ou filtro por departamento/equipe.
- [ ] Efeito visual comemorativo (micro-interação/modal de Level Up com partículas/confetti) quando o técnico alcança um novo nível ou conquista uma insígnia.
- [ ] Módulo administrativo com permissão de habilitar/desabilitar a gamificação e calibrar os pesos de XP por tipo de atividade em `system_settings`.

---

## 5. Tech Stack
- **Backend:** Go 1.22+, GORM, Gin Framework, PostgreSQL.
- **Frontend:** React 18, Vite, TypeScript, Tailwind CSS, Lucide React, Canvas-Confetti, Radix UI.
- **Notificações:** WebSocket / In-App Notification Engine já existente em AssetTrack TI.

---

## 6. File Structure Planejada

```text
backend/
├── internal/
│   ├── models/
│   │   └── gamification.go           # Tabelas: GamificationProfile, ActivityLog, Badge, UserBadge
│   ├── repository/
│   │   └── gamification_repo.go      # Queries de perfil, ranking, logs e badges
│   ├── service/
│   │   ├── gamification_service.go   # Motor de cálculo de XP, progressão de nível e triggers
│   │   └── gamification_events.go    # Hookers / Listeners para chamados, preventivas, qr codes
│   └── handler/
│       └── gamification_handler.go   # Endpoints REST: GET /profile, GET /leaderboard, GET /badges
frontend/
├── src/
│   ├── types/
│   │   └── gamification.ts           # Interfaces TypeScript (Profile, Badge, Rank, Level)
│   ├── api/
│   │   └── gamification.ts           # Requisições Axios/Fetch para a API de gamificação
│   ├── components/
│   │   └── gamification/
│   │       ├── LevelProgressBar.tsx  # Barra de progresso moderna com XP atual / próximo nível
│   │       ├── BadgeCard.tsx         # Card visual das insígnias (bloqueadas vs desbloqueadas)
│   │       ├── LevelUpModal.tsx      # Modal com animação de celebração e novos privilégios
│   │       ├── LeaderboardTable.tsx  # Tabela com pódio (Top 3) e posições de 1º a 10º
│   │       └── DailyStreakBadge.tsx  # Indicador de sequência diária de produtividade
│   └── pages/
│       ├── GamificationDashboard.tsx # Visão geral de conquistas, histórico de XP e ranking
│       └── GamificationSettings.tsx  # Tela de administração para calibrar pesos de XP
```

---

## 7. Task Breakdown

### Task 1: Modelo de Dados e Migração (Backend)
- **Agent:** `backend-specialist`
- **Skills:** `database-design`, `clean-code`
- **Priority:** P0
- **Dependencies:** Nenhuma
- **INPUT:** Estrutura de banco e models existentes em `backend/internal/models/`.
- **OUTPUT:** Criação de `backend/internal/models/gamification.go` contendo as tabelas:
  - `user_gamification_profiles` (user_id, xp_total, nivel_atual, tech_coins, current_streak, last_activity_date)
  - `gamification_activity_logs` (id, user_id, tipo_atividade, referencia_id, xp_ganho, descricao, data)
  - `gamification_badges` (id, codigo, nome, descricao, icone, categoria, xp_bonus)
  - `user_badges` (id, user_id, badge_id, data_conquista)
  - Registro no `db.AutoMigrate` em `backend/cmd/server/main.go`.
- **VERIFY:** O banco executa o AutoMigrate sem erros e as tabelas com chaves estrangeiras são criadas corretamente.

---

### Task 2: Gamification Service Engine & Lógica de XP (Backend)
- **Agent:** `backend-specialist`
- **Skills:** `api-patterns`, `clean-code`
- **Priority:** P0
- **Dependencies:** Task 1
- **INPUT:** Modelos de gamificação e regras de negócio de pontuação.
- **OUTPUT:** Implementação em `backend/internal/service/gamification_service.go` com:
  - `AwardActivityXP(userID uint, activityType string, referenceID uint, metadata map[string]interface{}) (*XPResult, error)`
  - Algoritmo que calcula XP base + bônus de SLA + streak diário.
  - Verificação se o técnico subiu de nível (`nivel_atual` antigo vs novo) e se desbloqueou insígnias pendentes.
  - Registro atômico no `gamification_activity_logs`.
- **VERIFY:** Testes unitários validando que 250 XP atinge nível 2, e que atividades duplicadas fraudulentas são filtradas.

---

### Task 3: Integração dos Gatilhos nos Módulos Existentes (Backend)
- **Agent:** `backend-specialist`
- **Skills:** `clean-code`, `api-patterns`
- **Priority:** P1
- **Dependencies:** Task 2
- **INPUT:** Handlers e services de `service_desk.go`, `preventive_maintenance.go`, `kanban.go` e `qr_service.go`.
- **OUTPUT:** Disparo assíncrono ou síncrono seguro de evento para `GamificationService.AwardActivityXP`:
  - Ao mudar ticket de Service Desk para `ServiceStatusResolvido` ou `ServiceStatusFechado`.
  - Ao concluir `MaintenanceExecution` de ordem preventiva.
  - Ao mover card de Kanban para coluna "Concluído" / "Finalizado".
  - Ao registrar scan de ativo em `QRLog`.
- **VERIFY:** Fechar um chamado adiciona +60 XP ao técnico atribuído no perfil de gamificação.

---

### Task 4: Endpoints REST de Gamificação (Backend)
- **Agent:** `backend-specialist`
- **Skills:** `api-patterns`, `clean-code`
- **Priority:** P1
- **Dependencies:** Task 2
- **INPUT:** Rotas do Gin no backend.
- **OUTPUT:** Endpoints em `backend/internal/handler/gamification_handler.go`:
  - `GET /api/v1/gamification/me` (perfil completo do técnico autenticado, XP, nível, progresso, streak, badges).
  - `GET /api/v1/gamification/leaderboard?period=weekly|monthly|all` (ranking com paginação).
  - `GET /api/v1/gamification/badges` (todas as insígnias e status de desbloqueio).
  - `GET /api/v1/gamification/history` (extrato de XP ganho nas últimas atividades).
  - `PUT /api/v1/gamification/settings` (administrador calibrar pontuações).
- **VERIFY:** Chamadas HTTP autenticadas retornam JSON no formato esperado com status 200.

---

### Task 5: Componentes UI de Gamificação no Frontend (Frontend)
- **Agent:** `frontend-specialist`
- **Skills:** `frontend-design`, `modern-web-guidance`, `clean-code`
- **Priority:** P1
- **Dependencies:** Task 4
- **INPUT:** Endpoints da API e design system do projeto.
- **OUTPUT:** Componentes modulares e reutilizáveis em `frontend/src/components/gamification/`:
  - `LevelProgressBar.tsx`: Mostra a barra de XP atual, percentual até o próximo nível e badge do nível.
  - `BadgeCard.tsx`: Grid de insígnias com ícones estilizados, data de conquista e tooltip de como desbloquear.
  - `LeaderboardTable.tsx`: Tabela de ranking com medalhas (Ouro, Prata, Bronze), avatar do técnico e pontos.
  - `LevelUpModal.tsx`: Pop-up comemorativo de subida de nível com animação de confetti (`canvas-confetti`).
- **VERIFY:** Renderização fluida, responsiva (mobile & desktop), sem quebras de layout e aderente à paleta da aplicação.

---

### Task 6: Painel Completo do Técnico & Header Widget (Frontend)
- **Agent:** `frontend-specialist`
- **Skills:** `frontend-design`, `clean-code`
- **Priority:** P2
- **Dependencies:** Task 5
- **INPUT:** Componentes da Task 5 e rotas do React Router.
- **OUTPUT:**
  - Rota `/gamificacao` com visão do técnico (Perfil, Estatísticas, Conquistas, Extrato de Atividades e Leaderboard).
  - Mini-widget no Header do sistema (ao lado do avatar do usuário) mostrando "Nível X" e mini barra de XP.
- **VERIFY:** O técnico consegue navegar para `/gamificacao`, visualizar suas métricas e ver o widget no Header atualizado em tempo real após concluir uma atividade.

---

### Task 7: Painel de Gestão e Parâmetros para Administradores (Frontend/Backend)
- **Agent:** `frontend-specialist` e `backend-specialist`
- **Skills:** `frontend-design`, `api-patterns`
- **Priority:** P2
- **Dependencies:** Task 4, Task 6
- **INPUT:** Painel de Configurações Administrativas de `SystemSettings`.
- **OUTPUT:** Nova aba "Gamificação" nas configurações globais:
  - Toggle Ligar/Desligar Gamificação no sistema.
  - Sliders ou inputs numéricos para ajustar XP por atividade (ex: chamado normal = 60, chamado urgente = 120).
  - Opção de resetar temporadas ou rankings anuais.
- **VERIFY:** Modificar o valor de XP de uma atividade e salvar persiste no banco e altera o cálculo das próximas conclusões.

---

## 8. Phase X: Final Verification Checklist

- [x] **Security:** Validação de permissões para evitar injeção ou spoofing de XP (somente o backend pontua via eventos internos confiáveis).
- [x] **Data Integrity:** Transações atômicas no banco de dados para evitar condições de corrida (race conditions) em pontuações simultâneas.
- [x] **Mobile Touch & Responsiveness:** O painel de gamificação e o leaderboard funcionam confortavelmente na visualização móvel (telas verticais de técnicos em campo).
- [x] **Build:** Execução de `npm run build` no frontend e `go build` no backend sem erros ou avisos de tipos.
- [x] **Performance:** O cálculo de XP não adiciona latência perceptível ao tempo de resposta de finalização de um chamado.

## ✅ PHASE X COMPLETE
- Go Backend Vet & Build: ✅ Pass
- Frontend TypeScript & Vite Build: ✅ Pass
- Regras de Design: ✅ Respeitadas (Sem roxo/violeta, estética rica com dourado, azul e esmeralda)
- Data de Conclusão: 2026-09-27
