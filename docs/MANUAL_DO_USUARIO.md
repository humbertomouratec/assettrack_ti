# 📘 Manual do Usuário - AssetTrack TI

Bem-vindo ao manual do **AssetTrack TI**. Este guia ajudará você a navegar pelas principais funcionalidades do sistema.

---

## 🔐 1. Acesso ao Sistema

### Login Tradicional
Utilize seu email e senha cadastrados para acessar o dashboard principal.

### Login via QR Code (Crachá Digital)
1. Acesse a tela de login QR.
2. Escaneie seu QR Code pessoal (disponível em "Meu QR Code").
3. Digite seu PIN de segurança.

---

## 📊 2. Gestão de Ativos (E-Patrimônio)

### Consultar Equipamentos
No menu **Ativos**, você pode buscar por nome, modelo ou o número de **E-Patrimônio**.
- **E-Patrimônio:** É o número de identificação interna do ativo.
- **Número de Série:** É o serial original do fabricante.

### Scanner de Ativos
Utilize a câmera do seu celular para escanear a etiqueta de um ativo. Isso abrirá instantaneamente a ficha do equipamento com todo o seu histórico.

---

## 🛠️ 3. Solicitação de Manutenção

Se o seu equipamento apresentar defeito:
1. Vá em **Solicitar Manutenção**.
2. Selecione o ativo sob sua responsabilidade.
3. Descreva o problema e envie.
4. Quando o técnico concluir o reparo, você será notificado para confirmar o recebimento.

---

## 🎧 4. Service Desk (Chamados e Suporte)

Para solicitações de suporte que não envolvem reparo físico de hardware (ex: configuração de software, acessos, redes):

### Abertura de Novo Chamado
1. Acesse o menu **Service Desk**.
2. Clique em **Novo Chamado**.
3. Selecione o serviço, defina o nível de prioridade e descreva a solicitação.
4. **Anexo de Imagem (Opcional):** Você pode anexar um print ou foto do erro para facilitar o diagnóstico da equipe de TI.
5. Ao criar, o sistema gerará um código profissional estruturado único (Ex: `CH-2026-0001`).

### Acompanhamento e Timeline de Interações
* O chamado exibe um **histórico cronológico interativo** (Timeline).
* Tanto os usuários solicitantes quanto a equipe técnica podem enviar mensagens de texto e **anexar imagens complementares** (evidências físicas ou prints) no decorrer do atendimento.
* No topo do chamado, é exibido um **QR Code individual**. Aponte a câmera do seu smartphone para o QR Code para acessar o link direto do chamado de forma ágil (`/servicos/chamado/CH-2026-0001`).

### Painel Gerencial (Apenas Administradores e Gerentes)
* Administradores e Gerentes contam com um **Dashboard Gerencial Analítico** moderno no topo da página.
* O painel apresenta **gráficos dinâmicos (Chart.js)** da distribuição dos chamados por estágio, prioridades, principais categorias e ranking de usuários atendidos.
* **Filtros Avançados:** Posicionados de forma inteligente logo abaixo dos gráficos, permitem pesquisar e filtrar a lista de chamados instantaneamente por código, categoria, status, prioridade e intervalo de datas.

---

## 🚨 5. Chamados de Emergência (Alerta Crítico em Tempo Real)

Para incidentes de extrema gravidade em equipamentos ou infraestrutura que exigem parada total ou risco iminente:

### Como Acionar (Usuários Comuns):
1. No seu **Dashboard principal**, clique no botão vermelho **🚨 ACIONAR EMERGÊNCIA**.
2. No modal que se abrirá, confirme o setor e equipamento afetado (se houver).
3. Descreva brevemente o motivo da emergência e clique em **TRANSMITIR ALERTA EMERGENCIAIS**.
4. O chamado é enviado instantaneamente em tempo real para toda a equipe de TI.

### Como Atender e Acompanhar (Equipe Técnica e Gestores):
1. Quando uma emergência é acionada, um **alerta sonoro** é emitido no navegador e um modal popup vermelho aparece na tela.
2. No topo do seu Dashboard, um **Banner Vermelho** exibirá os contadores em tempo real (`Total Recebidos` e `Pendentes`).
3. Clique em **`[ 📋 VER HISTÓRICO DE ALERTAS ]`** para abrir a central de histórico de emergências.
4. Utilize os filtros (*Todos*, *Pendentes*, *Atendidos*) e clique em **`✓ Marcar Atendido`** para assumir e concluir o atendimento. O sistema registrará seu nome e horário no histórico.

---

## 📱 6. Meu QR Code

Seu **Crachá Digital** serve para:
- Identificação rápida perante a equipe de TI.
- Login sem senha (usando apenas o PIN).
- Validação de recebimento de equipamentos.
- Consulta do crachá pessoal na página **Meu QR Code**.

> **Dica:** Você pode regenerar seu token QR a qualquer momento caso sinta que a segurança foi comprometida.

---

## 📂 7. Categorias de Ativos

Os administradores podem organizar os ativos em categorias customizáveis para facilitar a gestão.

1. Acesse **Ativos > Categorias** (apenas Admin/Gerente).
2. Cadastre categorias como Notebook, Monitor, Switch, etc.
3. Ao cadastrar ou editar um ativo, selecione a categoria correspondente.

---

## 📊 8. Relatórios de Ativos

O sistema oferece relatórios gerenciais com filtros avançados.

1. Acesse o menu **Ativos & Inventário**.
2. Utilize o painel **Filtros & Relatórios** na própria página.
3. Filtre por data de aquisição, categoria, fornecedor, localização, nota fiscal ou E-Patrimônio.
4. Exporte o resultado atual para **CSV** quando necessário.
5. Use a importação CSV e a duplicação em lote quando precisar cadastrar muitos ativos semelhantes.

### Movimentações de Ativos

1. Use **Empréstimos/Movimentações** para aprovar solicitações, entregar, transferir ou devolver ativos.
2. Cada movimentação registra usuário, equipamento, data e responsável pela ação.
3. O histórico pode ser consultado diretamente na ficha do ativo.

---

## 🏢 9. Fornecedores

Mantenha o cadastro de fornecedores organizado e vinculado aos ativos.

1. Acesse o menu **Fornecedores** (Admin/Gerente).
2. Cadastre dados como CNPJ, contato, telefone e endereço.
3. **Auto-preenchimento via NF-e:** Faça upload de um arquivo XML de Nota Fiscal e o sistema preencherá automaticamente os campos do fornecedor.
4. Visualize o histórico de notas fiscais vinculadas a cada fornecedor.

---

## 👥 10. Perfis de Acesso

- **USUARIO:** Consulta seus ativos sob sua guarda, abre chamados de suporte e solicita manutenções.
- **TECNICO:** Atende chamados no Service Desk, gerencia ordens de manutenção e realiza a entrega/devolução física de ativos via scanner QR.
- **COMPRADOR:** Perfil focado em suprimentos. Realiza cotações, emite Pedidos de Compra (PO), gerencia fornecedores e faz o recebimento físico/estoque.
- **RH:** Perfil administrativo simplificado focado na emissão e gestão de aceite de Termos de Responsabilidade para os ativos entregues.
- **GERENTE_TI:** Aprova solicitações de ativos, gerencia o inventário técnico e administra usuários.
- **GERENTE_INFRA:** Gestão do inventário geral de infraestrutura, contratos de fornecedores e categorias.
- **ADMIN:** Controle absoluto e irrestrito sobre todas as configurações do sistema (System Owner).

---

## 🛒 11. Módulo de Compras (Procurement)

O ciclo de compras no sistema é completamente integrado e segue o fluxo abaixo:

1. **Solicitação de Compra (SC):** Qualquer usuário ou técnico pode abrir uma requisição de compra (inclusive como atalho direto dentro de um Chamado ou Ordem de Serviço).
2. **Aprovação de Orçamento:** O gestor ou administrador analisa a solicitação comparando-a com o orçamento do Centro de Custo definido.
3. **Cotação de Preços:** O comprador lança os valores cotados com diferentes fornecedores. O sistema gera automaticamente um comparativo de preços detalhado.
4. **Pedido de Compra (PO):** Após a seleção do vencedor, é gerado um Pedido de Compra estruturado (formato PDF) para envio ao fornecedor.
5. **Recebimento de Itens:** Ao receber a mercadoria, o Almoxarifado realiza o recebimento no sistema (parcial ou total). Itens de consumo entram no estoque de manutenção, enquanto equipamentos geram automaticamente um Ativo patrimonial no inventário de TI.
6. **Contratos:** O menu **Contratos** permite gerenciar a vigência de contratos com fornecedores, exibindo alertas visuais de vencimento a partir de 90 dias.
7. **Estoque:** Itens de consumo podem ser movimentados e consumidos em manutenções ou projetos.
8. **Pesquisas:** Pesquisas de compra registram alternativas, envio e decisão antes da aquisição.

---

## 🧰 12. Manutenção Preventiva

O módulo de manutenção preventiva controla rotinas planejadas para evitar falhas recorrentes.

1. **Planos:** Cadastre planos com periodicidade, ativos envolvidos e responsáveis.
2. **Checklists:** Configure itens de verificação para padronizar a execução.
3. **Ordens:** Inicie, pause, conclua ou cancele ordens de manutenção.
4. **Evidências:** Anexe fotos e registre materiais consumidos.
5. **Notificações:** Acompanhe pendências e atualizações pelo dashboard e pelo módulo.
6. **Kanban:** Quando necessário, sincronize a preventiva com projetos internos.

---

## 🎛️ 13. Configurações de Módulos e Acessos por Menu (RBAC)

Os administradores têm controle total sobre as seções de menu da aplicação através da tela **Configurações**:

1. Acesse **Configurações** no menu lateral ou a rota `/configuracoes`.
2. **Ativar/Desativar Módulos Globais:** Você pode ligar ou desligar funcionalidades inteiras, como Compras e Manutenção Preventiva.
3. **Permissões administrativas:** As alterações são persistidas pela API administrativa e refletidas no frontend conforme o perfil do usuário.
4. Clique em **Salvar Configurações** para aplicar as mudanças.
5. O perfil de administrador continua protegido para evitar bloqueio acidental do sistema.

---

## 🤝 14. Recursos Humanos (RH) e Termos de Responsabilidade

Para controle legal, o sistema oferece um módulo dedicado à emissão de **Termos de Responsabilidade**.

1. **Emissão (RH):** No menu **Recursos Humanos > Termos RH**, visualize as solicitações de entrega de ativos e emita o documento gerado automaticamente.
2. **Assinatura e Controle:** O colaborador assina o documento.
3. **Armazenamento Seguro:** O usuário de RH faz o upload do arquivo digitalizado (PDF ou Imagem) e altera o status para "Assinado", garantindo o histórico digital do aceite.
4. **Simplificação de Tela:** Usuários com o perfil `RH` acessam uma interface enxuta e objetiva, focando na sua atividade principal sem a complexidade dos módulos de Tecnologia da Informação.
5. **Status da Equipe:** Na área **Status atual da equipe**, o RH visualiza se cada colaborador está trabalhando, de folga, em férias, desligado ou com banco de horas.
6. **Exibir na Sala de Monitoramento:** Use o botão **Na sala/Oculto** para escolher quais colaboradores aparecem na tela `/monitoramento`. Os selecionados serão exibidos com avatar, primeiro nome, status atual e horas quando estiverem em banco de horas.
7. **Comunicados de RH:** Publique comunicados gerais ou direcionados e acompanhe a leitura pelo colaborador.
8. **Hierarquia:** Em **Hierarquia por setor**, RH ou administrador escolhe o gestor e marca os subordinados. O gestor só poderá consultar e registrar status da própria equipe.
9. **Comunicação privada:** No perfil, envie uma mensagem ao gestor direto ou ao RH. O destinatário confirma o recebimento e o retorno fica registrado.
8. **Exportação:** Exporte o controle de status da equipe em CSV para conferência ou arquivamento.

---

## 🆕 15. Manual visual e sala de monitoramento

O sistema possui uma central de manual visual em **Ajuda > Manual do Sistema** ou na rota `/manual`. O conteúdo é separado automaticamente conforme o perfil autenticado:

| Perfil | Conteúdo principal |
|---|---|
| Usuário comum | Dashboard, ativos sob sua guarda, chamados, manutenções e alertas emergenciais |
| Técnico | Operação do Service Desk, manutenções, ativos, alertas e sala de monitoramento |
| Gerente de TI / Infraestrutura | Todos os recursos operacionais, gestão, compras e monitoramento |
| Administrador | Todos os módulos, configurações, usuários, permissões, backups e integrações |
| Comprador | Ativos, solicitações, compras, fornecedores e recebimentos |
| RH | Portal RH, termos de responsabilidade e entregas |

### Sala de monitoramento para TV

Administradores, gerentes e técnicos podem acessar `/monitoramento` para acompanhar a operação em uma tela dedicada. O painel apresenta chamados ativos, prioridade, status, técnico/responsável atribuído, solicitações de ativos, manutenções e alertas.

- Os dados operacionais são atualizados automaticamente a cada 5 segundos.
- A seção **Status atual da equipe** mostra somente os colaboradores selecionados no módulo de RH, com avatar, primeiro nome, status e banco de horas quando aplicável.
- Alertas emergenciais chegam por transmissão ao vivo, tocam `notificacao_alerta.mp3` e abrem o modal emergencial padrão.
- A tela possui relógio, conexão ao vivo, logo centralizada e modo tela cheia para uso em TV.
- O campo de equipamentos do alerta usa os ativos vinculados ao usuário e também complementa alertas antigos que não tinham essa informação.

### Atualizações recentes

- Chamados relacionados em alertas abrem diretamente o ticket correspondente.
- O Kanban mantém seus comandos funcionais em tela cheia, incluindo modais.
- A logo oficial está presente no menu, no login e na sala de monitoramento.
- O APK Android é atualizado pelo fluxo de publicação e disponibilizado pelo botão **App Android**.

---

## 🔌 16. Webhooks, Backups, Perfil e IA

### Webhooks

Administradores podem cadastrar integrações externas em **Webhooks**, testar o envio e consultar logs de execução.

### Backup & Restore

Em **Backup**, administradores podem gerar backup, baixar arquivos, excluir backups antigos, consultar status e restaurar o ambiente quando necessário.

### Perfil

Em **Perfil**, o usuário pode atualizar dados pessoais, trocar senha, enviar avatar e consultar informações pessoais do RH.

### Logs de E-mail

Administradores podem consultar os registros de envio de e-mail em **Logs de e-mail**.

### Assistente de IA

Quando habilitado nas configurações, o assistente de IA permite consultar informações operacionais do sistema de forma conversacional.

---

## 📲 17. Instalação como PWA no smartphone

Ao acessar a aplicação pelo navegador do celular usando o endereço da rede, por exemplo `http://192.168.x.x:8000`, o sistema pode ser instalado como aplicativo web.

1. Abra a tela de login pelo QR Code exibido no computador ou digite o endereço no navegador do celular.
2. No Chrome/Android, toque no menu do navegador e escolha **Adicionar à tela inicial** ou **Instalar app**.
3. No Safari/iPhone, use o botão de compartilhamento e escolha **Adicionar à Tela de Início**.
4. Depois de instalado, o AssetTrack TI abre em modo aplicativo, mantendo o mesmo endereço da aplicação local.

---

## 📚 18. Wiki e Base de Conhecimento

Em **Wiki & Manuais** (`/wiki`), colaboradores, gestores e administradores acessam a documentação técnica e operacional da empresa:

1. **Navegação Superior e Catálogo de Manuais:**
   - Utilize o painel no topo da página para filtrar por **Categorias** (Globais ou do seu Departamento) e pesquisar manuais pelo título ou conteúdo.
   - Clique em qualquer card de manual para abrir a leitura completa logo abaixo, ou clique em **Novo Artigo** (caso possua permissão de escrita).
2. **Editor de Texto Completo (WYSIWYG):**
   - **Formatação ao Selecionar Texto:** Selecione qualquer trecho de texto para abrir o menu flutuante rápido (*Bubble Menu*) ou use a barra superior fixa para aplicar **Negrito**, *Itálico*, <u>Sublinhado</u>, Tachado, Cores de Texto, Marca-Texto, tipos de fonte e tamanhos de fonte (`12px` a `36px`).
   - **Tabelas Interativas:** Clique no botão **Tabela** para escolher a grade visual (ex.: `3x3`, `4x4`) ou definir linhas e colunas personalizadas. Ao clicar dentro de uma tabela, uma barra contextual permite adicionar/remover linhas e colunas a qualquer momento.
   - **Imagens e Vídeos (até 50MB):** Arraste e solte arquivos (*Drag & Drop*), cole prints diretamente com `Ctrl+V` ou use o botão **Mídia**. Clique sobre qualquer imagem ou vídeo inserido para redimensionar pelo controle deslizante (`15%` a `100%`), arrastar a alça lateral `↔ Arrastar Tamanho` ou alinhar à esquerda/centro/direita.
3. **Histórico de Revisões:**
   - No modo de leitura do manual, clique em **Revisões** para inspecionar quem editou o artigo, a data/hora e o conteúdo anterior de cada versão.
4. **Permissões por Equipe (Gestores e Administradores):**
   - Na aba **Permissões da Equipe (RBAC)**, o Gestor do Departamento define visualmente quem do seu setor possui acesso **Sem Acesso**, **Leitura** ou **Escrita** em cada categoria do departamento e salva todas as alterações em lote (*Salvar Alterações em Lote*).
   - Administradores também contam com o botão global no topo da página para **Ativar/Desativar o Módulo Wiki** em todo o sistema.
