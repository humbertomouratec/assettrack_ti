# RH Agenda Management - Modernização da Gestão de Presença & Agenda

## Contexto & Objetivos
- Resolver a limitação de exibição de registros na Agenda de RH (onde `slice(0, 20)` ocultava registros e não havia busca/filtros).
- Implementar o **Painel de Gestão Integrado em Abas/Visões**:
  - **Aba 1: Quadro Geral de Colaboradores (Hoje)**: Exibição de todos os colaboradores ativos com status atual (Trabalhando, Folga, Banco de horas, Férias, Desligado), com busca de texto (nome, matrícula, cargo), filtro por setor e filtro por status. Ação de "+ Novo Status" direto pelo colaborador.
  - **Aba 2: Agenda & Escalas Programadas**: Listagem completa de todos os status programados, com busca por colaborador/observação, filtro por setor e filtro por tipo de status, sem limite arbitrário.
- Implementar a edição de datas e dados de status (**Modal de Edição Rápida**):
  - Criar rota backend `PUT /api/v1/rh/status/:id` e método no repositório.
  - Conectar no frontend via `rhApi.updateStatus`.
  - Permitir reprogramar Data Início, Data Fim, Horas e Observação, além de excluir.

## Tarefas de Execução

1. **Backend - Repositório de RH (`backend/internal/repository/rh_repo.go`)** [CONCLUÍDO]
   - Adicionado método `UpdateStatus(status *models.RHStatus) error`
   - Adicionado método `GetStatusByID(id uint) (*models.RHStatus, error)`
2. **Backend - Handler e Rota (`backend/internal/handler/rh_handler.go` & `backend/internal/router/router.go`)** [CONCLUÍDO]
   - Implementado `UpdateStatus(c *gin.Context)` com validações de data, autorização por gestor/RH e persistência
   - Registrada rota `PUT /rh/status/:id` no grupo de rotas `/rh`
3. **Frontend - Integração de API (`frontend/src/api/rh.ts`)** [CONCLUÍDO]
   - Adicionada função `updateStatus(id, data)`
4. **Frontend - Componentes & Interface (`frontend/src/pages/RHPage.tsx`)** [CONCLUÍDO]
   - Criado seletor de abas (`managementTab`: 'quadro' | 'agenda') com badges dinâmicos de contagem
   - Implementados filtros completos: busca textual em tempo real, seletor de setor e chips de status para ambas as visões
   - Removido o corte de 20 registros (`slice(0, 20)`) na visualização da agenda e comunicados
   - Implementado Modal de Edição Rápida para reprogramar Data Início, Data Fim, Tipo, Horas e Observação
   - Adicionado botão de atalho "+ Novo Status" direto de cada colaborador no quadro
5. **Verificação & Testes** [CONCLUÍDO]
   - Compilação Go backend concluída com sucesso via Docker (`docker compose build api`)
   - Build do TypeScript frontend concluído com sucesso via Vite (`tsc -b && vite build`)
   - Containers reiniciados e validados (`http://127.0.0.1:8000` e `http://127.0.0.1:8080` retornando HTTP 200 OK)
