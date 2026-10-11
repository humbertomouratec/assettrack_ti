-- =============================================================================
-- Migration: 20261011_create_wiki_module.sql
-- Module: Wiki & Base de Conhecimento (100% Isolated Native Module)
-- Database: PostgreSQL
-- Description:
--   Creates isolated tables for the Wiki & Knowledge Base module without
--   altering any existing table, struct, or constraint in AssetTrack TI.
--   Includes:
--     1. system_modules        - Global Feature Toggle per module
--     2. wiki_categories       - Categories bound to departamentos(id) or global (NULL)
--     3. wiki_articles         - Structured Rich Text (HTML/JSON) articles
--     4. wiki_permissions      - Granular user/category RBAC ('none', 'read', 'write')
--     5. wiki_article_revisions- Immutable audit log of article changes
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Global Feature Toggle Table (system_modules)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS system_modules (
    module_name VARCHAR(64) PRIMARY KEY,
    is_enabled  BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE system_modules IS 'Controla a ativação global (Feature Toggle) de módulos independentes do sistema.';
COMMENT ON COLUMN system_modules.module_name IS 'Identificador único do módulo (ex: wiki).';
COMMENT ON COLUMN system_modules.is_enabled IS 'Flag booleana que habilita (true) ou bloqueia com HTTP 403 (false) todas as rotas do módulo.';

-- Seed inicial idempotente do módulo 'wiki' (habilitado por padrão)
INSERT INTO system_modules (module_name, is_enabled, updated_at)
VALUES ('wiki', TRUE, NOW())
ON CONFLICT (module_name) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 2. Categorias da Wiki (wiki_categories)
-- -----------------------------------------------------------------------------
-- Nota Arquitetural:
--   department_id referencia departamentos(id) existente.
--   Quando department_id IS NULL, a categoria é considerada GLOBAL (visível a
--   todos os colaboradores ativos; editável apenas por Administradores ou
--   usuários com permissão explícita 'write').
CREATE TABLE IF NOT EXISTS wiki_categories (
    id            BIGSERIAL PRIMARY KEY,
    name          VARCHAR(150) NOT NULL,
    slug          VARCHAR(160) NOT NULL UNIQUE,
    description   TEXT NOT NULL DEFAULT '',
    icon          VARCHAR(64) NOT NULL DEFAULT 'folder',
    department_id BIGINT NULL,
    sort_order    INTEGER NOT NULL DEFAULT 0,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_by    BIGINT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_wiki_categories_department
        FOREIGN KEY (department_id)
        REFERENCES departamentos(id)
        ON DELETE SET NULL,
    CONSTRAINT fk_wiki_categories_created_by
        FOREIGN KEY (created_by)
        REFERENCES users(id)
        ON DELETE SET NULL
);

COMMENT ON TABLE wiki_categories IS 'Categorias da Base de Conhecimento, vinculadas a um departamento específico ou globais (department_id IS NULL).';
COMMENT ON COLUMN wiki_categories.department_id IS 'FK opcional para departamentos(id). NULL indica categoria global da empresa.';

-- -----------------------------------------------------------------------------
-- 3. Artigos da Wiki (wiki_articles)
-- -----------------------------------------------------------------------------
-- Nota Arquitetural:
--   content armazena o corpo estruturado do artigo (HTML sanitizado ou JSON AST
--   do editor Rich Text como TipTap/Quill) contendo referências às mídias em
--   /uploads/wiki/.
CREATE TABLE IF NOT EXISTS wiki_articles (
    id             BIGSERIAL PRIMARY KEY,
    category_id    BIGINT NOT NULL,
    title          VARCHAR(255) NOT NULL,
    slug           VARCHAR(260) NOT NULL UNIQUE,
    summary        TEXT NOT NULL DEFAULT '',
    content        TEXT NOT NULL DEFAULT '',
    content_format VARCHAR(16) NOT NULL DEFAULT 'html',
    is_published   BOOLEAN NOT NULL DEFAULT TRUE,
    view_count     BIGINT NOT NULL DEFAULT 0,
    author_id      BIGINT NULL,
    updated_by     BIGINT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_wiki_articles_content_format
        CHECK (content_format IN ('html', 'json')),
    CONSTRAINT fk_wiki_articles_category
        FOREIGN KEY (category_id)
        REFERENCES wiki_categories(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_wiki_articles_author
        FOREIGN KEY (author_id)
        REFERENCES users(id)
        ON DELETE SET NULL,
    CONSTRAINT fk_wiki_articles_updated_by
        FOREIGN KEY (updated_by)
        REFERENCES users(id)
        ON DELETE SET NULL
);

COMMENT ON TABLE wiki_articles IS 'Artigos da Wiki com suporte a conteúdo Rich Text estruturado (HTML ou JSON).';
COMMENT ON COLUMN wiki_articles.content_format IS 'Formato estrutural do campo content: html ou json.';

-- -----------------------------------------------------------------------------
-- 4. Matriz de Permissões Granulares (wiki_permissions)
-- -----------------------------------------------------------------------------
-- Nota Arquitetural:
--   Controla o acesso explícito por usuário e categoria ('none', 'read', 'write').
--   A constraint UNIQUE (user_id, category_id) viabiliza operações atômicas de
--   Bulk Upsert (INSERT ... ON CONFLICT (user_id, category_id) DO UPDATE) pelo
--   Gestor do departamento.
CREATE TABLE IF NOT EXISTS wiki_permissions (
    id           BIGSERIAL PRIMARY KEY,
    user_id      BIGINT NOT NULL,
    category_id  BIGINT NOT NULL,
    access_level VARCHAR(16) NOT NULL DEFAULT 'none',
    granted_by   BIGINT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_wiki_permissions_access_level
        CHECK (access_level IN ('none', 'read', 'write')),
    CONSTRAINT uq_wiki_permissions_user_category
        UNIQUE (user_id, category_id),
    CONSTRAINT fk_wiki_permissions_user
        FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_wiki_permissions_category
        FOREIGN KEY (category_id)
        REFERENCES wiki_categories(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_wiki_permissions_granted_by
        FOREIGN KEY (granted_by)
        REFERENCES users(id)
        ON DELETE SET NULL
);

COMMENT ON TABLE wiki_permissions IS 'Permissões granulares de acesso por usuário e categoria da Wiki (none, read, write).';
COMMENT ON COLUMN wiki_permissions.access_level IS 'Nível de acesso explícito: none (bloqueado), read (leitura) ou write (leitura e edição).';

-- -----------------------------------------------------------------------------
-- 5. Histórico e Auditoria de Revisões (wiki_article_revisions)
-- -----------------------------------------------------------------------------
-- Nota Arquitetural:
--   Registra cada edição sofrida por um artigo, preservando o conteúdo anterior
--   (previous_content), o título anterior, o autor da modificação (edited_by) e
--   o carimbo de tempo (created_at).
CREATE TABLE IF NOT EXISTS wiki_article_revisions (
    id               BIGSERIAL PRIMARY KEY,
    article_id       BIGINT NOT NULL,
    edited_by        BIGINT NULL,
    previous_title   VARCHAR(255) NOT NULL DEFAULT '',
    previous_content TEXT NOT NULL,
    content_format   VARCHAR(16) NOT NULL DEFAULT 'html',
    change_note      VARCHAR(500) NOT NULL DEFAULT '',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_wiki_revisions_content_format
        CHECK (content_format IN ('html', 'json')),
    CONSTRAINT fk_wiki_revisions_article
        FOREIGN KEY (article_id)
        REFERENCES wiki_articles(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_wiki_revisions_edited_by
        FOREIGN KEY (edited_by)
        REFERENCES users(id)
        ON DELETE SET NULL
);

COMMENT ON TABLE wiki_article_revisions IS 'Log imutável de revisões de artigos da Wiki para rastreabilidade e auditoria.';
COMMENT ON COLUMN wiki_article_revisions.edited_by IS 'FK para users(id) identificando qual colaborador realizou a edição.';
COMMENT ON COLUMN wiki_article_revisions.previous_content IS 'Snapshot integral do conteúdo antes da alteração.';

-- -----------------------------------------------------------------------------
-- 6. Índices B-Tree para Otimização de Consultas RBAC e Listagens
-- -----------------------------------------------------------------------------
-- Otimiza filtro de categorias por departamento e categorias globais (IS NULL)
CREATE INDEX IF NOT EXISTS idx_wiki_categories_department_id
    ON wiki_categories (department_id);

CREATE INDEX IF NOT EXISTS idx_wiki_categories_active_dept_sort
    ON wiki_categories (is_active, department_id, sort_order);

-- Otimiza JOIN e filtro de artigos por categoria e status de publicação
CREATE INDEX IF NOT EXISTS idx_wiki_articles_category_id
    ON wiki_articles (category_id);

CREATE INDEX IF NOT EXISTS idx_wiki_articles_published_category_updated
    ON wiki_articles (is_published, category_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_wiki_articles_author_id
    ON wiki_articles (author_id);

-- Otimiza verificação rápida de RBAC (JOIN/EXISTS por user_id + category_id + access_level)
CREATE INDEX IF NOT EXISTS idx_wiki_permissions_rbac_lookup
    ON wiki_permissions (user_id, category_id, access_level);

CREATE INDEX IF NOT EXISTS idx_wiki_permissions_category_access
    ON wiki_permissions (category_id, access_level);

-- Otimiza listagem cronológica reversa do histórico de revisões de um artigo
CREATE INDEX IF NOT EXISTS idx_wiki_revisions_article_created
    ON wiki_article_revisions (article_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wiki_revisions_edited_by
    ON wiki_article_revisions (edited_by);

COMMIT;
