# PLAN: Wiki & Knowledge Base Native Module (`PLAN-wiki-module`)

## Overview
Implantar o módulo nativo e 100% isolado de **Wiki e Base de Conhecimento** no sistema **AssetTrack TI** (Go + PostgreSQL no backend e React + TypeScript + Tailwind CSS v4 no frontend), garantindo **zero alteração** em tabelas, structs ou funções existentes do sistema.

- **Objetivo Principal:** Fornecer documentação técnica e operacional controlada por Feature Toggle global (`system_modules`), RBAC granular por Departamento e Gestor (`wiki_categories`, `wiki_articles`, `wiki_permissions`), histórico de auditoria (`wiki_article_revisions`) e editor Rich Text com upload seguro de imagens e vídeos curtos até 50MB (`./uploads/wiki/`).
- **Decisões Arquiteturais Confirmadas (Socratic Gate):**
  1. **Isolamento Total & Agnóstico:** Pacote Go independente `backend/internal/wiki` utilizando `database/sql` e `net/http` nativos com adaptador opcional `RegisterGinRoutes` para acoplamento imediato ao `gin.Engine` existente.
  2. **RBAC & Categorias Globais:** Admin possui acesso irrestrito (`read`/`write`). Gestores validados via `departamentos.responsavel_id = user.id` (ou vínculo gerencial no próprio `department_id`) gerenciam permissões apenas do seu setor. Categorias globais (`department_id IS NULL`) permitem leitura para usuários ativos autenticados e escrita restrita ao Admin (ou permissão explícita `write`).
  3. **Rich Text & Upload Seguro (50MB):** Conteúdo estruturado (`TEXT` suportando JSON/HTML + `content_format`), upload multipart com `http.MaxBytesReader` (50MB), validação dupla (extensão + Magic Bytes via `http.DetectContentType` nos primeiros 512 bytes) e escrita em `./uploads/wiki/` com nomes únicos baseados em timestamp + sufixo criptográfico.
  4. **Performance no Feature Toggle:** Middleware `/api/v1/wiki` com cache em memória (`sync.RWMutex`, TTL 5s) e invalidação instantânea no toggle do Admin, bloqueando com `403 Forbidden` quando desativado.

## Project Type
**WEB / FULL-STACK** (`backend-specialist`, `database-architect`, `security-auditor`, `frontend-specialist`, `test-engineer`)

## Success Criteria
- [x] Nenhuma tabela, struct ou função existente do AssetTrack TI é alterada (`git diff` limpo em arquivos legados).
- [x] Script SQL de migração idempotente com `system_modules`, `wiki_categories`, `wiki_articles`, `wiki_permissions` e `wiki_article_revisions` + índices de performance.
- [x] Middleware Go interceptando `/api/v1/wiki` e retornando `403 Forbidden` imediatamente quando `is_enabled = false`.
- [x] Listagem de artigos em Go aplicando filtro estrito de RBAC (Admin, Gestor do departamento ou `wiki_permissions` com `read`/`write`) e atualização em lote (`Bulk Update`) com trava contra alteração de outros departamentos (`IDOR` protection).
- [x] Handler de upload limitando 50MB, validando extensões e MIME types reais (imagens e `.mp4`, `.webm`, `.mov`), salvando em `./uploads/wiki/` e retornando JSON padrão `{ "url": "/uploads/wiki/..." }`.
- [x] Componente React de Gestão de Permissões em Lote (Matriz de Acesso do Gestor) + Editor Rich Text com captura de Drag & Drop e Clipboard Paste assíncronos.
- [x] Testes unitários do pacote `internal/wiki` passando (`go test ./internal/wiki/...`) e scripts de auditoria executados.

## Tech Stack
| Camada | Tecnologia | Justificativa |
| :--- | :--- | :--- |
| **Banco de Dados** | PostgreSQL (`database/sql`) | Compatível com o banco existente do AssetTrack TI, usando FKs (`users.id`, `departamentos.id`) sem alterar tabelas originais. |
| **Backend** | Go 1.25 (`net/http`, `database/sql`, `mime/multipart`) | Código agnóstico, seguro e fácil de acoplar em qualquer roteador (`http.ServeMux` ou `gin.Engine`). |
| **Frontend** | React 19 + TypeScript + Tailwind CSS v4 + Lucide Icons | Alinhado ao stack existente em `frontend/package.json`, seguindo estética Swiss Grid / Brutalist Technical (Zero Purple). |
| **Testes** | Go `testing` + `httptest` | Validação isolada de middlewares, RBAC, Bulk Update e Upload de 50MB. |

## File Structure (100% Isolada)
```plaintext
backend/
├── migrations/
│   └── 20261011_create_wiki_module.sql       # DDL completo + índices + seed inicial do módulo 'wiki'
└── internal/
    └── wiki/
        ├── models.go                         # Structs Go, DTOs e tipos de acesso ('none', 'read', 'write')
        ├── repository.go                     # Queries parametrizadas em database/sql (RBAC, Bulk Update, Revisões)
        ├── middleware.go                     # Feature Toggle Middleware (/api/v1/wiki) + Auth Context Extractor
        ├── handler.go                        # Handlers net/http (Artigos, Categorias, Bulk Permissions, Revisões)
        ├── upload_handler.go                 # Handler Multipart 50MB (./uploads/wiki/) + Magic Bytes validation
        ├── router_adapter.go                 # Registro em net/http.ServeMux, Gin RouterGroup e Static FileServer
        └── wiki_test.go                      # Testes unitários cobrindo Feature Toggle, RBAC, IDOR e Upload

frontend/
└── src/
    └── components/
        └── wiki/
            ├── WikiDepartmentPermissionsPanel.tsx  # Painel do Gestor para Bulk Update de permissões por categoria
            └── WikiRichTextEditor.tsx              # Editor Rich Text com Drag & Drop e Paste assíncrono de mídia
```

## Task Breakdown

| ID | Task | Agent | Skills | Priority | Dependencies | INPUT → OUTPUT → VERIFY |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **T1** | Modelagem SQL e Índices (`system_modules`, `wiki_categories`, `wiki_articles`, `wiki_permissions`, `wiki_article_revisions`) | `database-architect` | `database-design`, `clean-code` | P0 | Nenhuma | **IN:** Especificação RBAC e FKs (`users.id`, `departamentos.id`) → **OUT:** `backend/migrations/20261011_create_wiki_module.sql` → **VERIFY:** `schema_validator.py` e validação de FKs/constraints `CHECK (access_level IN ('none', 'read', 'write'))`. |
| **T2** | Structs, Repositório SQL e Queries RBAC / Bulk Update Transacional | `backend-specialist` | `api-patterns`, `database-design`, `clean-code` | P0 | T1 | **IN:** Schema SQL → **OUT:** `models.go`, `repository.go` → **VERIFY:** Compilação sem erros (`go build ./internal/wiki/...`) e proteção contra SQL Injection (`$1, $2`). |
| **T3** | Middleware de Feature Toggle Global (`/api/v1/wiki`) e Handlers HTTP + Upload 50MB (`./uploads/wiki/`) | `backend-specialist` + `security-auditor` | `api-patterns`, `vulnerability-scanner` | P1 | T2 | **IN:** `repository.go` → **OUT:** `middleware.go`, `handler.go`, `upload_handler.go`, `router_adapter.go` → **VERIFY:** Retorno `403 Forbidden` quando desativado, bloqueio de cross-department Bulk Update e validação de Magic Bytes. |
| **T4** | Arquitetura Frontend: Painel RBAC do Gestor (Bulk Update) + Editor Rich Text (Drag & Drop / Paste) | `frontend-specialist` | `frontend-design`, `tailwind-patterns`, `clean-code` | P2 | T3 | **IN:** Contratos JSON da API Go → **OUT:** `WikiDepartmentPermissionsPanel.tsx`, `WikiRichTextEditor.tsx` → **VERIFY:** `npx tsc --noEmit` no frontend e `ux_audit.py`. |
| **T5** | Testes Automatizados e Auditoria de Segurança (Phase X) | `test-engineer` + `security-auditor` | `testing-patterns`, `vulnerability-scanner` | P3 | T3, T4 | **IN:** Pacote `internal/wiki` e componentes React → **OUT:** `wiki_test.go` + Relatório de Auditoria → **VERIFY:** `go test -v ./internal/wiki/...` e `security_scan.py`. |

## Phase X: Verification Checklist
- [x] `go test -v ./internal/wiki/...` passando 100%
- [x] `python3 .agent/skills/vulnerability-scanner/scripts/security_scan.py .` executado
- [x] `python3 .agent/skills/frontend-design/scripts/ux_audit.py .` executado
- [x] Zero arquivos existentes modificados (`git status` mostra apenas arquivos novos)
- [x] Sem cores roxas/violetas (Purple Ban respeitado)

## ✅ PHASE X COMPLETE
- Lint & Type Check: ✅ Pass
- Security: ✅ No critical issues
- Build & Unit Tests (`go test ./internal/wiki/...`): ✅ Success
- Date: 2026-10-11
