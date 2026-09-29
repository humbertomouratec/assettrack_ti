# AssetTrack TI - Funcionalidades

> Sistema de Gerenciamento de Ativos de TI com interface web moderna e suporte a Docker.

---

## 🔐 Autenticação & Usuários

| Funcionalidade | Descrição |
|----------------|-----------|
| **Login Tradicional** | Autenticação com email/senha e JWT. |
| **Login via QR** | Autenticação rápida com Crachá Digital + PIN. |
| **Meu QR Code** | Cada usuário possui um QR Code único para identificação e login. |
| **Crachá Digital** | Página própria com QR Code, dados do colaborador e suporte à validação de entregas. |
| **Perfil do Usuário** | Atualização de dados pessoais, senha, avatar e consulta ao portal RH individual. |
| **Níveis de Acesso** | `ADMIN`, `GERENTE_TI`, `GERENTE_INFRA`, `TECNICO`, `COMPRADOR`, `RH`, `USUARIO_COMUM`. |
| **Controle de Usuários** | Cadastro, edição, ativação/inativação, histórico por colaborador e emissão de relatórios. |

---

## 📊 Dashboard Principal

- **Indicadores Gerais:** Visão resumida de ativos, chamados, solicitações, compras, manutenções, alertas e atividades recentes.
- **Atalhos Operacionais:** Cards e links levam diretamente para listas filtradas, como ativos disponíveis, chamados abertos e compras pendentes.
- **Comunicados Oficiais:** Avisos ativos aparecem no painel inicial com suporte a texto, imagens, vídeos e links de ação.
- **Notificações Integradas:** Alertas de Kanban, compras, manutenção preventiva e emergências aparecem conforme o perfil e permissões.

## 📦 Gestão de Ativos (E-Patrimônio)

O sistema utiliza o conceito de **E-Patrimônio** para identificação única dos ativos.

| Funcionalidade | Descrição |
|----------------|-----------|
| **Inventário** | Listagem completa com filtros por status, setor e localização. |
| **E-Patrimônio** | Identificador principal único (ex: EP-0001). |
| **Número de Série** | Registro do Serial Number do fabricante para rastreabilidade. |
| **Scanner QR** | Leitura instantânea de etiquetas para abrir detalhes do ativo. |
| **Movimentações** | Histórico completo de quem usou o ativo e por onde ele passou. |
| **Baixa de Ativos** | Registro de saída definitiva do inventário. |
| **Categorias de Ativos** | Organização por categorias customizáveis (ex: Notebook, Monitor, Switch). |
| **Relatórios** | Filtros avançados por data, categoria, fornecedor, NF-e e exportação em PDF. |
| **Importação/Exportação CSV** | Importação em lote e exportação da lista filtrada para auditoria e planilhas. |
| **Duplicação em Lote** | Cadastro acelerado de múltiplos ativos semelhantes. |
| **Localizações e Armazenamentos** | Cadastro de locais físicos, depósitos e organização do inventário. |

---
## 🏢 Fornecedores

| Funcionalidade | Descrição |
|----------------|-----------|
| **Cadastro** | Registro completo de fornecedores com CNPJ, contato e endereço. |
| **Upload NF-e XML** | Upload de arquivo XML de Nota Fiscal para auto-preenchimento dos dados do fornecedor. |
| **Histórico de Notas** | Visualização das notas fiscais vinculadas a cada fornecedor. |

---

## 🔁 Empréstimos, Entregas e Movimentações

- **Solicitação de Ativos:** Usuários podem solicitar equipamentos e acompanhar aprovação ou rejeição.
- **Entrega e Transferência:** Perfis autorizados transferem ativos para colaboradores, registrando responsável atual.
- **Devolução:** Baixa da posse do colaborador e retorno do equipamento para estoque/local definido.
- **Confirmação por QR:** O QR Code do colaborador pode ser usado para validar entrega e recebimento.
- **Histórico Completo:** Cada movimentação fica vinculada ao ativo e ao usuário responsável pela ação.

---

## 🎧 Service Desk (Help Desk)

Módulo integrado e profissional de suporte técnico para agilização operacional.

- **Abertura de Chamados:** Solicitação rápida por categorias e setores com suporte opcional a uploads de imagem para identificação visual inicial.
- **Timeline de Interações com Fotos:** Histórico dinâmico cronológico em formato de linha do tempo com suporte a envio de imagens/fotos por usuários e técnicos para evidenciar o andamento.
- **Dashboard Gerencial Premium:** Gráficos interativos (Chart.js) com análise de status, prioridade de urgência, distribuição de categorias e ranking de usuários (exclusivo para Admins e Gerentes).
- **Filtros Inteligentes de Pesquisa:** Painel de filtros avançados estrategicamente posicionado abaixo dos gráficos para buscas por texto, status, categoria, prioridade e intervalo de datas.
- **Código e QR Rastreável:** Geração de códigos em formato estruturado (ex: `CH-2026-0001`) associados a um QR Code individual de visualização rápida no topo do chamado.
- **Fuso Horário Local (America/Sao_Paulo):** Registro rigoroso de abertura e atualizações no horário do servidor local.
- **Upload de Imagens via Clipboard:** Suporte a colar imagens diretamente do clipboard (Ctrl+V) nos formulários de chamados.
- **Catálogo de Serviços:** Cadastro de categorias e definições de atendimento por perfis autorizados.
- **Atribuição Técnica:** Chamados exibem técnico/responsável atual e status normalizado para operação e monitoramento.

---

## 🚨 Alertas de Emergência em Tempo Real

Módulo de alta prioridade para notificação instantânea de incidentes críticos.

- **Acionamento Rápido:** Botão de emergência em destaque no dashboard de usuários comuns com modal para justificativa detalhada e vínculo automático do setor/equipamento.
- **Transmissão SSE (Server-Sent Events):** Notificações enviadas em tempo real via streaming de eventos sem necessidade de atualização manual de página.
- **Notificação Sonora de Alerta:** Emissão automática de som de alerta (`notificacao_alerta.mp3`) no navegador da equipe técnica e administrativa (`ADMIN`, `GERENTE_TI`, `GERENTE_INFRA`, `TECNICO`).
- **Dashboard com Contadores em Tempo Real:** Banner no topo do dashboard com contagem de alertas totais recebidos e chamados pendentes.
- **Histórico e Marcação de Atendimento:** Modal com visualização completa de histórico, filtros de busca por status (*Todos*, *Pendentes*, *Atendidos*) e ação de encerramento/atendimento registrando a identidade do técnico responsável.
- **Compatibilidade de Rotas:** As rotas `/alertas` e `/emergencia` apontam para o mesmo fluxo operacional para preservar integrações existentes.

---

## 📢 Comunicados & Avisos Oficiais do Sistema

Módulo de transmissão de comunicados e comunicados institucionais para toda a equipe.

- **Criação Multimídia por Staff:** Administradores, Gerentes e Técnicos podem publicar comunicados em `/alertas` contendo texto formatado, links de ação, imagens em alta resolução (upload direto) e vídeos (uploads de arquivos MP4/WEBM ou links incorporados do YouTube/Vimeo).
- **Exibição Universal na Dashboard:** Seção em destaque no topo do Dashboard para todos os perfis de usuários com atualização via polling a cada 15 segundos.
- **Visualizador Modal Interativo:** Ao clicar em qualquer card de aviso na Dashboard, abre-se um modal amplo com reprodução de vídeo em tela cheia, galeria de fotos e texto completo.
- **Controle de Vigência:** Comunicados podem ter início/fim e podem ser ativados, desativados, editados ou removidos por staff autorizado.

---

## 📱 Aplicativo Android (Capacitor) & Arquitetura Offline-First

- **PWA para Mobile:** A versão web possui manifest e service worker para instalação pelo navegador em smartphones, usando o endereço atual da aplicação na rede local.
- **Arquitetura Offline-First:** Fila de mutações persistida no armazenamento local (`localStorage`), permitindo que técnicos registrem ações (chamados, manutenções e verificações de ativos) mesmo totalmente sem sinal de internet.
- **Sincronização Automática:** Reconexão transparente ao sinal de rede com indicador visual de status e contagem de itens sincronizados.
- **Botão e Modal de Download do APK na Web:** Botão em destaque no cabeçalho da versão web com modal interativo que exibe:
  - Download direto do arquivo APK anexado manualmente e refletido pelo manifest do backend.
  - QR Code apontando para o endereço de download do sistema para leitura e download imediato no celular.
  - Notas da versão e changelog.
  - Guia de 3 passos simples para instalação no Android.
- **Notificador de Novas Versões:** Verificação em segundo plano informando a disponibilidade de atualizações do aplicativo com 1 clique, comparando a versão atual do portal com a versão publicada do APK.
- **Configuração simples no APK:** quando necessário, o usuário informa apenas o endereço da aplicação, por exemplo `http://IP_DO_SERVIDOR:8000`; o caminho `/api/v1` é aplicado automaticamente.

---

## 🛠️ Manutenção Corretiva

- **Solicitação de Reparo:** Usuários podem relatar defeitos em seus equipamentos.
- **Painel Técnico:** Gestão de filas de conserto e troca de peças.
- **Validação de Entrega:** Uso do QR Code do usuário para confirmar a devolução do item reparado.
- **Aceite, Rejeição e Conclusão:** Técnicos e gestores acompanham o ciclo da solicitação até a confirmação de recebimento.

---

## 🧰 Manutenção Preventiva

- **Dashboard Preventivo:** Indicadores de planos, ordens abertas, atrasos, execução e histórico.
- **Planos de Manutenção:** Criação de planos por tipo, periodicidade, ativos vinculados e responsáveis.
- **Checklists:** Itens de verificação configuráveis por plano e executáveis dentro das ordens.
- **Ordens de Serviço:** Criação, início, pausa, conclusão, cancelamento e histórico operacional.
- **Materiais e Fotos:** Registro de consumo de materiais e evidências fotográficas durante a execução.
- **Tipos Customizados:** Cadastro de tipos próprios de preventiva conforme a operação.
- **Notificações:** Avisos de ordens e pendências para usuários envolvidos.
- **Integração com Kanban:** Planos podem iniciar ou sincronizar automações com projetos Kanban.

---

## 🛒 Compras & Suprimentos (Procurement)

Módulo completo integrado de suprimentos cobrindo do pedido ao recebimento.

- **Fluxo Ponta a Ponta:** Emissão de Solicitações de Compra (SC), aprovação por alçadas de diretoria/financeiro e controle orçamentário por Centro de Custo.
- **Cotações Multilateral:** Lançamento de cotações de fornecedores com painel comparativo do menor preço e melhor custo-benefício.
- **Pedidos de Compra (PO):** Emissão de pedidos formais de compra e monitoramento de entrega.
- **Recebimento e Integração Patrimonial:** A entrada de itens físicos atualiza o estoque simples e cadastra automaticamente novos Ativos no inventário de TI.
- **Gestão de Contratos:** Controle de prazos de validade com alertas visuais no painel geral, opções completas de edição/exclusão de registros, e armazenamento de PDFs de contratos e termos de garantia.
- **Categorias e Produtos:** Cadastro estruturado de produtos e categorias de compra.
- **Centros de Custo:** Organização orçamentária e aprovação por centro de custo.
- **Solicitações de Peças:** Manutenções podem gerar pedidos de compra de materiais.
- **Liberação de Orçamento:** Etapa de controle para aprovação financeira antes de seguir com cotações/pedidos.
- **Estoque e Consumo:** Controle de estoque, transações e consumo de itens em manutenções ou projetos.
- **Pesquisas de Compra:** Registro e envio de pesquisas, com decisão/aprovação por perfil autorizado.
- **Exportação CSV:** Relatórios de compras exportáveis para conferência externa.

---

## 📋 Kanban (Projetos Internos)

Módulo visual e ágil (estilo Trello) para gestão de projetos, iniciativas e tarefas da equipe de TI.

- **Quadros Customizáveis (Boards):** Criação de múltiplos projetos com fluxos e colunas flexíveis (ex: Backlog, Em Andamento, Homologação, Concluído).
- **Gestão de Tarefas (Cards):** Criação de cards detalhados com título, descrição em Markdown, datas de entrega, prioridade (Baixa, Média, Alta, Urgente), responsáveis e anexos.
- **Integração Drag & Drop:** Interface totalmente interativa permitindo arrastar cards entre colunas, com atualização de progresso em tempo real e de forma transparente.
- **Integração com Suprimentos:** Vinculação direta de tarefas a **Solicitações de Compra (SC)** ou a retiradas de materiais do **Estoque**.
- **Vinculação de Ativos:** Associação de múltiplos equipamentos (E-Patrimônio) a uma tarefa, facilitando rastreio em manutenções longas ou projetos de infraestrutura.
- **Métricas de Progresso:** Barra de progresso global ponderada, calculada automaticamente pela posição e avanço dos cards ao longo das colunas.
- **Privacidade e Acessos:** Visibilidade baseada na participação do usuário, respeitando os níveis de acesso (RBAC), e módulo ativável globalmente via Feature Toggle.
- **Notificações e Andamentos em Tempo Real:** Feed de atividades integrado ao Dashboard e menu superior (Sininho) com polling dinâmico. Registra e notifica imediatamente a criação de projetos, movimentação de cards, novas atribuições, anexos e vínculos de materiais para manter administradores e participantes 100% atualizados.

---

## 🤝 Recursos Humanos (RH) e Termos de Responsabilidade

Módulo desenhado para fechar o ciclo de entrega de equipamentos, oferecendo respaldo legal.

- **Fluxo Simplificado:** Usuários do perfil `RH` têm acesso a uma interface amigável (similar à do usuário comum), isolando a complexidade dos módulos técnicos da TI.
- **Emissão Automática:** Geração instantânea de Termos de Responsabilidade em PDF a partir de tickets e solicitações concluídas de entrega de ativos.
- **Gestão de Assinaturas:** Controle visual do status dos termos (Pendente de Assinatura vs. Assinado).
- **Armazenamento de Comprovantes:** Upload de arquivos PDF ou imagens do documento físico assinado pelo colaborador, mantendo tudo centralizado.
- **Status Atual da Equipe:** O RH acompanha a situação de cada colaborador (`Trabalhando`, `Folga`, `Férias`, `Banco de horas` ou `Desligado`) e pode selecionar quem deve aparecer na Sala de Monitoramento.
- **Exibição na Sala de Monitoramento:** Colaboradores marcados pelo RH aparecem na rota `/monitoramento` com avatar do perfil, primeiro nome, status atual e horas quando o status for `Banco de horas`.
- **Comunicados de RH:** Publicação de comunicados direcionados ou gerais para colaboradores, com controle de leitura pelo portal individual.
- **Portal RH do Colaborador:** Usuário consulta seu status atual, calendário de RH e comunicados no perfil.
- **Hierarquia por setor:** RH e administradores atribuem o gestor de cada setor e selecionam subordinados por nome. Gestores acessam apenas sua equipe configurada.
- **Comunicação privada:** Usuários enviam mensagens ao gestor direto ou ao RH/admin, sem exposição aos colegas, com confirmação de recebimento registrada.
- **Desligamento:** Fluxo administrativo para marcar colaborador como desligado e refletir o estado no painel de controle.
- **Exportação CSV:** Exportação do controle de status da equipe para conferência e arquivamento.

---

## 🤖 Assistente de Inteligência Artificial (IA)

Módulo de assistente virtual cognitivo integrado nativamente ao ERP, operando via *Function Calling* para consultar e analisar dados reais do banco de dados de forma conversacional.

- **Provedores Universais:** Suporte integrado a múltiplos ecossistemas de LLM (OpenAI, Gemini, Groq, OpenRouter e Moonshot/Kimi).
- **Gerenciamento de Funcionalidades:** O administrador pode plugar chaves de API, alternar modelos instantaneamente sem reiniciar o servidor e desligar o chat através do painel Administrativo.
- **Acesso ao Banco de Dados (Tool Calling):** O bot tem permissão de leitura programática (Functions) sobre: Inventário de Ativos, Service Desk (Tickets), Manutenções Preventivas e Módulo de Compras (Procurement).
- **Interface Neo-Brutalista:** Widget global, rápido e persistente no canto inferior com feedback visual em animações (ping/radar).

---

## 🎛️ Controle de Módulos e Acessos (RBAC Dinâmico)

- **Feature Toggles:** Ativação ou desativação em tempo real dos módulos de Compras e Manutenção Preventiva.
- **Matriz de Permissões de Menu:** Painel visual que permite ao administrador customizar quais perfis de acesso visualizam cada seção de menu no sistema.
- **Trava de Segurança:** Acesso irrestrito do Administrador é mantido de forma nativa para evitar bloqueios acidentais.

---

## 🔌 Webhooks e Integrações

- **Cadastro de Webhooks:** Administradores configuram integrações externas com nome, URL, eventos e status.
- **Teste de Envio:** Webhooks podem ser testados pela interface administrativa.
- **Logs de Entrega:** Histórico de execuções, respostas e falhas por webhook.
- **Eventos Operacionais:** Estrutura pronta para integração com chamados, ativos, compras e demais módulos.

---

## 💾 Backup, Restore e Logs

- **Backup Manual:** Administradores geram backups da base e arquivos da aplicação.
- **Download e Exclusão:** Backups podem ser baixados ou removidos pela interface.
- **Restore:** Restauração controlada a partir de arquivo de backup.
- **Status do Backup:** Consulta do estado atual do processo de geração/restauração.
- **Logs de E-mail:** Administradores consultam registros de envio de e-mails do sistema.

---

## 🚀 Atualização do Sistema (Git & Docker)

- **Painel de Atualização (Admin Only):** Exclusivo para usuários com papel `admin` na tela de Configurações (`/configuracoes`).
- **Inspeção de Versão:** Consulta imediata da branch ativa, commit hash e data do último commit local.
- **Checagem Remota (`git fetch`):** Verificação de novidades no repositório upstream com listagem detalhada de novos commits (autor, data e mensagem).
- **Deploy com Rebuild Integrado:** Disparo assíncrono de `git pull` e recompilação/recriação dos containers da aplicação (`update_docker.sh`).
- **Terminal de Logs em Tempo Real:** Modal interativo que exibe a saída do terminal linha a linha durante o processo.
- **Reconexão Automática:** Monitoramento do endpoint `/health` pós-restart com sugestão de recarga automática da página.
- Documentação detalhada em [`docs/ATUALIZACAO_SISTEMA_GIT.md`](./ATUALIZACAO_SISTEMA_GIT.md).

---

## 🎨 Design System: Industrial Technical

- Interface limpa e objetiva com navegação estruturada em módulos e sub-menus organizados (Dropdowns), maximizando o espaço útil da tela e garantindo a padronização.
- Bordas retas e sombras sólidas (Estilo Neo-Brutalism / Industrial).
- Tipografia técnica otimizada para leitura de dados.
- Totalmente responsivo para uso em tablets e smartphones.

---

## 🔧 Stack Tecnológica

- **Backend:** Go 1.21+ (Gin Web Framework + GORM).
- **Frontend:** React 18+ (Vite, TypeScript, Zustand, Tailwind CSS v4, Lucide).
- **Banco de Dados:** PostgreSQL (Dockerizado).
- **Infra:** Docker & Docker Compose.

---

## 🆕 Manual visual e monitoramento para TV

- **Central de Manual:** Rota `/manual` com landing page técnica, ilustrações em SVG/CSS, atalhos operacionais e conteúdo filtrado pelo perfil autenticado.
- **Separação por Perfil:** Usuário comum, técnico, gerentes, administrador, comprador e RH visualizam somente os módulos relevantes ao seu trabalho, com opção de consulta ampliada para perfis autorizados.
- **Sala de Monitoramento:** Rota `/monitoramento`, independente do layout comum, preparada para TV e uso em tela cheia.
- **Indicadores Operacionais:** Chamados abertos, prioridades altas, ativos em manutenção, alertas emergenciais, solicitações de ativos pendentes/aprovadas e fila de atendimento.
- **Status RH da Equipe:** A sala exibe os colaboradores escolhidos pelo RH, mostrando avatar, primeiro nome e status atual para acompanhamento visual da escala.
- **Status e Atribuição ao Vivo:** A fila exibe o status normalizado do chamado e o técnico/responsável atual, com atualização a cada 5 segundos.
- **Eventos Sonoros:** O arquivo `frontend/public/notificacao_alerta.mp3` é usado em emergências e em novidades operacionais detectadas no monitoramento.
- **Modal Emergencial Reutilizado:** Alertas recebidos na sala de monitoramento abrem o mesmo modal global, com alarme, dados do colaborador, equipamentos vinculados e confirmação de ciência.
- **Vínculo de Equipamentos:** Ativos em uso são identificados por `current_user_id` e status normalizado (`Em uso`/`EM_USO`), incluindo enriquecimento de alertas históricos.

---

## 🗺️ Mapa de Páginas

| Rota | Funcionalidade |
|------|----------------|
| `/` | Dashboard principal |
| `/login` | Login tradicional e configuração simples do endereço da aplicação |
| `/manual` | Manual visual online |
| `/monitoramento` | Sala de monitoramento para TV |
| `/users` | Gestão de usuários |
| `/assets` | Ativos, inventário, referências, filtros, importação/exportação e QR |
| `/badge` | Crachá digital e QR do usuário |
| `/servicos` | Central de suporte e Service Desk |
| `/manutencoes` | Manutenção corretiva |
| `/emprestimos` | Solicitações, empréstimos, entregas e devoluções |
| `/setores` | Setores/departamentos |
| `/manutencao-preventiva` | Planos e ordens de manutenção preventiva |
| `/kanban` | Projetos internos e tarefas |
| `/alertas` | Alertas emergenciais e comunicados oficiais |
| `/compras` | Compras, cotações, pedidos, estoque, contratos e pesquisas |
| `/compras/fornecedores` | Cadastro de fornecedores dentro do módulo de compras |
| `/rh` | Portal RH, termos, status da equipe e comunicados |
| `/webhooks` | Integrações via webhook |
| `/backups` | Backup e restore |
| `/profile` | Perfil, avatar, senha e portal RH pessoal |
| `/configuracoes` | Configurações, módulos e permissões |
| `/logs-email` | Logs administrativos de e-mail |

## Apresentação pública integrada

- Landing page com ilustração de equipamentos, animações com suporte a movimento reduzido e conteúdo dos módulos.
- Visitantes acessam `/` sem autenticação; `/apresentacao` está sempre disponível publicamente. Usuários autenticados continuam vendo o dashboard em `/`.
- Botão **Acessar aplicação** abre aviso com as opções Cancelar e Continuar para o login, direcionando para `/login` na própria origem.
- Incluída no frontend e no serviço web Docker/EasyPanel. Não requer informar IP ou domínio e não consulta registros operacionais.
