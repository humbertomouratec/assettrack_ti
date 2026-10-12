# AssetTrack TI - API Reference

Documentação completa dos endpoints do AssetTrack TI. A aplicação possui dois tipos de rotas:

- **API REST** (`/api/v1`): endpoints em Go (Gin) que retornam JSON para integração e consumo do frontend.
- **Rotas Web (Frontend)**: páginas Single Page Application (SPA) renderizadas via React (Vite + React Router).

---

# API REST — JSON (`/api/v1`)

Em instalações Docker, o frontend deve consumir a API pelo mesmo host da aplicação usando `/api/v1`. Exemplo:

```text
http://IP_DO_SERVIDOR:8000/api/v1
```

O Nginx do container web encaminha essa rota internamente para a API Go. O acesso direto em `http://IP_DO_SERVIDOR:8080/api/v1` continua útil para diagnóstico, mas não precisa ser configurado na tela de login nem no APK.

## 🗂️ Grupos de Endpoints

| Grupo | Base | Finalidade |
|-------|------|------------|
| Aplicativo Android | `/app` | Versão publicada e download do APK anexado. |
| Autenticação | `/auth` | Login, cadastro administrativo e sessão atual. |
| Usuários | `/users` | Colaboradores, perfis, histórico e relatórios. |
| Ativos | `/assets` | Inventário, referências, importação/exportação, QR e histórico. |
| Service Desk | `/servicos` | Categorias, definições, chamados, anexos e interações. |
| Manutenção Corretiva | `/solicitacoes-manutencao` | Solicitações, aceite, rejeição, conclusão e recebimento. |
| Solicitações/Empréstimos | `/solicitacoes`, `/movimentacoes` | Pedidos de ativos, aprovação, transferência e devolução. |
| Fornecedores/NF-e | `/fornecedores`, `/notas-fiscais` | Cadastro, notas fiscais, upload e leitura de XML. |
| Manutenção Preventiva | `/preventiva` | Dashboard, planos, checklists, ordens, materiais, fotos e notificações. |
| Kanban | `/kanban` | Projetos, colunas, cards, anexos, comentários, SSE e notificações. |
| Alertas | `/alertas`, `/emergencia` | Emergências, streaming, histórico, ciência e atendimento. |
| Avisos | `/avisos` | Comunicados oficiais com mídia, vigência e ativação. |
| Compras | `/compras` | Dashboard, categorias, produtos, centro de custos, solicitações, cotações, pedidos, estoque, contratos e pesquisas. |
| RH | `/rh` | Termos, controle de status, comunicados, desligamento e seleção para monitoramento. |
| Monitoramento | `/monitoramento` | Dados auxiliares para a Sala de Monitoramento TV. |
| QR/Crachá | `/qr` | Login por QR, crachá, PIN, perfil público e confirmação de entrega. |
| Webhooks | `/webhooks` | Integrações externas, testes e logs. |
| Backup | `/backups` | Geração, download, exclusão, restore e status. |
| Perfil | `/profile` | Dados pessoais, avatar, senha e portal RH pessoal. |
| Dashboard | `/dashboard` | Indicadores consolidados. |
| Gamificação | `/gamification` | Perfil de gamificação, pontuação, XP, medalhas e ranking técnico. |
| Home Assistant | `/home-assistant`, `/admin/home-assistant` | Dispositivos IoT, telemetria de ativos, controle de serviços e categorias. |
| Administração | `/admin/settings`, `/admin/email-logs`, `/admin/system` | Configurações globais, permissões, logs de e-mail e atualização via Git. |
| IA | `/chat` | Assistente conversacional conectado aos dados da aplicação. |

## 🔐 Autenticação (`/auth`)

### POST `/auth/login`
Obtém o token JWT para acesso.

**Parâmetros (Form URL Encoded):**
| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| username | string | Sim | E-mail do usuário |
| password | string | Sim | Senha do usuário |

**Response (200 OK):**
```json
{
  "access_token": "ey...",
  "token_type": "bearer"
}
```

### POST `/auth/register`
Registra um novo usuário.

### GET `/auth/me`
Retorna os dados do usuário autenticado.

## 📦 Ativos (`/assets`)

Todos os endpoints requerem cabeçalho `Authorization: Bearer <token>`.

### GET `/assets/referencias`
Busca todas as tabelas de referência para o preenchimento de formulários e filtros de ativos.

**Response (200 OK):**
```json
{
  "categorias": [{"id": 1, "nome": "Notebooks", "descricao": "Computadores portáteis"}],
  "setores": [{"id": 1, "nome": "TI"}],
  "localizacoes": [{"id": 1, "nome": "Sede Central"}],
  "armazenamentos": [{"id": 1, "nome": "Escaninho A", "codigo": "ESC-A"}],
  "fornecedores": [{"id": 1, "nome": "Dell Brasil"}]
}
```

### GET `/assets`
Lista os ativos cadastrados.

**Query Parameters:**
| Campo | Tipo | Descrição |
|-------|------|-----------|
| skip | int | Quantidade de registros a pular (default: 0) |
| limit | int | Limite de registros a retornar (default: 100) |
| e_patrimonio | string | Busca por número de patrimônio (opcional) |

**Response (200 OK):**
```json
[
  {
    "id": 1,
    "nome": "Notebook Latitude",
    "e_patrimonio": "EP-0001",
    "status": "Disponível",
    "bloqueado": true,
    "categoria": {
      "id": 1,
      "nome": "Notebooks"
    }
  }
]
```

### POST `/assets`
Cadastra um novo ativo. (Requer permissão Admin/Gerente/Gerente Infra/Técnico)

**Body (JSON):**
```json
{
  "nome": "Monitor Dell 27",
  "e_patrimonio": "EP-0982",
  "modelo": "U2723QE",
  "descricao": "Monitor 4K IPS Black",
  "valor": 2499.90,
  "status": "Disponível",
  "numero_serie": "CN-082J29",
  "bloqueado": false,
  "requer_termo_rh": false,
  "categoria_id": 2,
  "fornecedor_id": 1,
  "current_local_id": 1,
  "current_armazenamento_id": 1
}
```

### GET `/assets/{id}`
Busca os detalhes completos de um ativo específico.

### PUT `/assets/{id}`
Atualiza dados do ativo. (Requer permissão Admin/Gerente/Gerente Infra/Técnico)

> [!NOTE]
> **Regra de Negócio de Ativos Bloqueados (Ativo Fixo):**
> Se o ativo possui a flag `"bloqueado": true` e seu status é alterado para `"Manutenção"`, o sistema realiza um snapshot do estado de localização atual (colunas `prev_*`). Durante a manutenção, qualquer alteração nas colunas de localização/setor/posse será ignorada/bloqueada para preservar a integridade. Ao final da manutenção (mudança de status para qualquer outro valor), os valores de localização anteriores são restaurados de forma automática.

### DELETE `/assets/{id}`
Remove permanentemente o ativo. (Requer permissão Admin)

### GET `/assets/{id}/qrcode`
Gera e retorna um stream de imagem em formato PNG contendo o QR Code do ativo.

### POST `/assets/scan-qr`
Escaneia uma imagem enviada via multipart/form-data e localiza o ativo associado.

**Request (Multipart Form):**
- `file`: Arquivo de imagem do QR Code.

**Response (200 OK):**
Retorna o objeto do ativo decodificado.

### POST `/assets/bulk`
Duplica um ativo base em lote com suporte a sucesso parcial e rollback interno de falhas. (Requer permissão Admin/Gerente/Gerente Infra/Técnico)

**Body (JSON):**
```json
{
  "template_id": 1,
  "copies": [
    {
      "e_patrimonio": "EP-0002",
      "numero_serie": "SN-002",
      "current_local_id": 1,
      "current_armazenamento_id": 1
    },
    {
      "e_patrimonio": "EP-0003",
      "numero_serie": "SN-003",
      "current_local_id": 1,
      "current_armazenamento_id": 1
    }
  ]
}
```

**Response (200 OK):**
```json
{
  "success_count": 2,
  "failed_count": 0,
  "results": [
    {
      "e_patrimonio": "EP-0002",
      "success": true,
      "asset_id": 12
    },
    {
      "e_patrimonio": "EP-0003",
      "success": true,
      "asset_id": 13
    }
  ]
}
```

---

## 📝 Solicitações (`/solicitacoes`)

### GET `/solicitacoes/`
Lista as solicitações do usuário logado.

### POST `/solicitacoes/`
Cria uma solicitação de ativo.

**Body (JSON):**
```json
{
  "asset_id": 5,
  "tipo": "EMPRESTIMO",
  "observacao": "Preciso para home office"
}
```

### PUT `/solicitacoes/{solicitacao_id}/approve`
Aprova uma solicitação.

### PUT `/solicitacoes/{solicitacao_id}/reject`
Rejeita uma solicitação.

---

## 🔄 Movimentações (`/movimentacoes`)

### GET `/movimentacoes/`
Lista o histórico de movimentações.

### POST `/movimentacoes/devolver/{asset_id}`
Registra a devolução de um ativo.

---

## 📱 QR Code (`/qr`)

### GET `/qr/me`
Retorna o token QR do usuário logado.

### POST `/qr/me/generate`
Gera um novo token QR para o usuário.

### POST `/qr/login`
Autenticação via QR Code.

**Body (JSON):**
```json
{
  "token": "token-do-qr",
  "pin": "123456"
}
```

### GET `/qr/user/{token}`
Retorna o perfil público do usuário pelo token QR.

### POST `/qr/delivery/confirm`
Confirma entrega de equipamento via scanner QR.

---

## 👥 Usuários (`/users`)

### GET `/users/`
Lista todos os usuários (Admin).

### POST `/users/`
Cria um novo usuário.

### GET `/users/{user_id}`
Retorna dados de um usuário específico.

### PUT `/users/{user_id}`
Atualiza dados de um usuário.

---

## 📢 Avisos do Sistema (`/avisos`)

### POST `/avisos/upload`
Realiza o upload de arquivos de imagem (PNG/JPG/WEBP) ou vídeo (MP4/WEBM) de até 100MB para anexar em comunicados do sistema.

**Header:** `Authorization: Bearer <token>` (Requer perfil Admin, Gerente ou Técnico)

**Response (200 OK):**
```json
{
  "url": "/uploads/avisos/1787496015.mp4"
}
```

---

## 📱 Aplicativo Android & APK (`/app`)

### GET `/app/version`
Retorna as informações sobre a versão oficial compilada do APK Android.

**Response (200 OK):**
```json
{
  "version_code": 20260824103045,
  "version_name": "2026.08.24.1030",
  "release_date": "2026-08-24T13:30:45Z",
  "download_url": "/api/v1/app/download",
  "apk_filename": "AssetTrack-TI-v2026.08.24.1030.apk",
  "apk_size_bytes": 5885123,
  "apk_size_formatted": "5.6 MB",
  "min_android_version": "Android 7.0 (Nougat) ou superior",
  "release_notes": "• APK anexado manualmente após build realizado via terminal..."
}
```

### GET `/app/download`
Transmite o arquivo binário `.apk` mais recente via HTTP com cabeçalhos para download direto no navegador ou smartphone. O nome do arquivo é derivado do manifest gerado ao anexar o APK manualmente com `scripts/publish_mobile_apk.sh /caminho/AssetTrack-TI.apk`.

---

## 🚀 Atualização do Sistema (`/admin/system`)

Endpoints protegidos exclusivamente para usuários com papel `admin` (`rActive` + `rAdmin`).

### GET `/admin/system/version`
Retorna informações da versão local instalada (commit hash, branch, data e mensagem do commit).

### POST `/admin/system/updates/check`
Executa `git fetch` e calcula a quantidade e a lista de commits pendentes no repositório remoto upstream.

### POST `/admin/system/updates/apply`
Dispara de forma assíncrona o processo de atualização (`git pull` e reconstrução dos containers Docker). Retorna `202 Accepted` com identificador do job.

### GET `/admin/system/updates/logs`
Retorna o status atual (`idle`, `checking`, `updating`, `completed`, `error`) e o buffer circular de linhas de log do terminal em tempo real.

---

## 🏆 Gamificação (`/gamification`)

Endpoints protegidos para os perfis autorizados (`ADMIN`, `GERENTE_TI`, `GERENTE_INFRA`, `TECNICO`).

### GET `/gamification/me`
Retorna o perfil completo de gamificação do usuário autenticado.

**Response (200 OK):**
```json
{
  "user_id": 4,
  "nome": "Carlos Silva",
  "cargo": "Técnico de Suporte",
  "pontos": 1250,
  "nivel": 5,
  "proximo_nivel_pontos": 1500,
  "posicao_ranking": 2,
  "badges": [
    {
      "id": "fast_resolver",
      "nome": "Resolvedor Ágil",
      "descricao": "Resolveu 50 chamados dentro do SLA",
      "raridade": "raro",
      "desbloqueado_em": "2026-09-20T14:30:00Z"
    }
  ]
}
```

### GET `/gamification/leaderboard`
Retorna o ranking geral da equipe técnica ordenado por pontuação decrescente.

**Response (200 OK):**
```json
[
  {
    "posicao": 1,
    "user_id": 2,
    "nome": "Ana Souza",
    "avatar": "/uploads/avatars/user2.png",
    "pontos": 1820,
    "nivel": 7,
    "badges_count": 12
  }
]
```

### GET `/gamification/user/:id`
Retorna o perfil público de gamificação de um colaborador específico.

---

## 🏠 Home Assistant IoT & Automação (`/home-assistant`)

Endpoints de monitoramento e controle IoT. Requerem perfil técnico ou administrativo (`ADMIN`, `GERENTE_TI`, `GERENTE_INFRA`, `TECNICO`).

### GET `/home-assistant/overview`
Retorna a lista consolidada de dispositivos e entidades descobertas no Home Assistant com seus estados e atributos atuais.

**Response (200 OK):**
```json
{
  "connected": true,
  "entities": [
    {
      "entity_id": "sensor.datacenter_temperatura",
      "state": "21.4",
      "attributes": {
        "unit_of_measurement": "°C",
        "friendly_name": "Temperatura Rack Principal"
      },
      "last_updated": "2026-10-07T21:30:00Z",
      "asset_id": 15,
      "asset_patrimonio": "EP-0015",
      "visible": true,
      "category_id": 1
    }
  ]
}
```

### POST `/home-assistant/service`
Dispara um comando/serviço no Home Assistant (ex: alternar relé, ligar/desligar tomada inteligente).

**Payload:**
```json
{
  "domain": "switch",
  "service": "turn_on",
  "target": {
    "entity_id": "switch.tomada_nobreak_rack"
  },
  "service_data": {}
}
```

### GET `/home-assistant/asset/:id/telemetry`
Retorna os dados de telemetria e sensores vinculados a um ativo patrimonial específico.

### GET `/home-assistant/bindings`
Lista todos os vínculos ativos entre entidades Home Assistant e IDs de ativos de TI.

### POST `/home-assistant/bindings`
Cria ou atualiza um vínculo entre uma entidade IoT e um ativo do inventário.

**Payload:**
```json
{
  "entity_id": "sensor.datacenter_temperatura",
  "asset_id": 15
}
```

### DELETE `/home-assistant/bindings/:id`
Remove o vínculo do ativo com a entidade IoT.

### PATCH `/home-assistant/visibility`
Define se uma entidade específica deve ser exibida ou ocultada no painel operacional.

**Payload:**
```json
{
  "entity_id": "sensor.sensor_secundario",
  "visible": false
}
```

### GET `/home-assistant/categories`
Lista as categorias customizadas de dispositivos IoT.

### POST `/home-assistant/categories`
Cria uma nova categoria para organização de dispositivos.

### POST `/admin/home-assistant/test`
*(Exclusivo Admin)* Testa a conectividade com a instância do Home Assistant usando as credenciais configuradas em `SystemSettings`.

---

## 📚 Wiki e Base de Conhecimento (`/wiki`)

Todas as rotas abaixo são protegidas por autenticação JWT e pelo middleware `WikiFeatureToggleMiddleware` (retorna `403 Forbidden` caso o módulo `wiki` esteja desativado em `system_modules`).

### GET `/wiki/articles`
Lista os artigos visíveis ao usuário autenticado aplicando rigorosamente o filtro RBAC (Administrador Geral, Gestor do Departamento, categorias globais sem bloqueio ou permissão explícita `read`/`write` em `wiki_permissions`). Suporta query params `category_id` e `q` (busca textual).

### GET `/wiki/articles/:id`
Retorna os detalhes e o conteúdo Rich Text (HTML/JSON) de um artigo específico, validando permissão de leitura na categoria.

### POST `/wiki/articles`
Cria um novo artigo na Wiki (requer permissão `write` na categoria, Gestor do setor ou Administrador).

### PUT `/wiki/articles/:id`
Atualiza um artigo existente em transação SQL, gravando automaticamente a versão anterior em `wiki_article_revisions` (`edited_by`, `previous_title`, `previous_content`, `change_summary`, `created_at`).

### GET `/wiki/articles/:id/revisions`
Lista o histórico cronológico de revisões e auditoria de um artigo.

### GET `/wiki/categories` & POST `/wiki/categories`
Lista as categorias acessíveis (globais e departamentais) ou cria uma nova categoria vinculada opcionalmente a um `department_id`.

### GET `/wiki/departments`
Lista os setores/departamentos disponíveis para gerenciamento de permissões da Wiki.

### GET `/wiki/departments/:departmentId/permissions-matrix`
Carrega os colaboradores do departamento, as categorias da Wiki daquele setor e a matriz atual de permissões (`none`, `read`, `write`) para o painel do Gestor.

### PUT `/wiki/permissions/bulk`
Atualiza em lote (*Bulk Update* transacional) os níveis de acesso da equipe de um departamento, impedindo que um Gestor altere categorias ou usuários de outros setores.

### POST `/wiki/upload` (ou `/wiki/media/upload`)
Recebe arquivos de mídia via `multipart/form-data` (limite de **50MB**), valida extensão (`.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.svg`, `.mp4`, `.webm`, `.mov`) e *Magic Bytes*, salva em `./uploads/wiki/` com nome único baseado em timestamp e retorna `{ "url": "/uploads/wiki/..." }`.

### GET `/wiki/admin/module-status` & PUT `/wiki/admin/module-toggle`
Consulta ou altera globalmente o status de ativação do módulo Wiki (exclusivo para Administrador) e invalida o cache em memória imediatamente.

---

# Rotas do Frontend (React Router)

As rotas abaixo representam as páginas atuais da SPA em React. Elas são renderizadas no frontend e consomem a API REST em `/api/v1`.

| Rota | Página |
|------|--------|
| `/` | Dashboard principal |
| `/login` | Login |
| `/gamificacao` | Central de Gamificação, Conquistas e Leaderboard |
| `/home-assistant` | Painel IoT Home Assistant e Telemetria de Infraestrutura |
| `/users` | Usuários |
| `/assets` | Ativos & Inventário, incluindo filtros e relatórios |
| `/badge` | Meu crachá / QR |
| `/servicos` | Service Desk |
| `/manutencoes` | Manutenções corretivas |
| `/emprestimos` | Empréstimos e devoluções |
| `/fornecedores` | Fornecedores |
| `/setores` | Setores |
| `/manutencao-preventiva` | Manutenção preventiva |
| `/kanban` | Kanban |
| `/alertas` | Alertas de emergência |
| `/compras` | Compras / Procurement |
| `/rh` | Portal RH |
| `/wiki` | Wiki e Base de Conhecimento (Artigos, Editor WYSIWYG e Matriz RBAC por Setor) |
| `/monitoramento` | Sala de monitoramento para TV |
| `/webhooks` | Webhooks |
| `/backups` | Backup & Restore |
| `/profile` | Perfil |
| `/configuracoes` | Configurações administrativas e atualização |
| `/logs-email` | Logs de e-mail |

## Observações importantes da arquitetura atual

- A UI não usa mais rotas HTML server-side como `/assets/new`, `/admin/modulos` ou `/servicos/novo`.
- Exportação de relatórios de ativos é feita via `GET /api/v1/assets/export.csv`.
- Configurações administrativas são feitas via `GET/PUT /api/v1/admin/settings`.
- Alertas aceitam dois estágios operacionais distintos: `ciente` e `atendido`.
- A manutenção preventiva possui rotas REST próprias em `/api/v1/preventiva/*`.
- O módulo de Wiki possui rotas REST isoladas em `/api/v1/wiki/*` e serve arquivos estáticos de mídia em `/uploads/wiki/*`.
- O RH controla a exibição de colaboradores na sala por `PUT /api/v1/rh/colaboradores/:id/monitoramento`.
- A sala de monitoramento consulta os colaboradores selecionados em `GET /api/v1/monitoramento/equipe-rh`.

---

## 🛠️ Status Codes Comuns

- **200 OK**: Sucesso.
- **201 Created**: Recurso criado.
- **400 Bad Request**: Erro de validação ou regra de negócio.
- **401 Unauthorized**: Falha na autenticação.
- **403 Forbidden**: Sem permissão.
- **404 Not Found**: Recurso não encontrado.

