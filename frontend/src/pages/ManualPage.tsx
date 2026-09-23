import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BellRing,
  BookOpen,
  Box,
  Building2,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  Database,
  FileSignature,
  Headphones,
  Mail,
  Monitor,
  PackageCheck,
  QrCode,
  RotateCcw,
  Search,
  ShieldAlert,
  ShoppingCart,
  Sliders,
  Smartphone,
  Truck,
  Tv,
  User,
  UserCog,
  Users,
  Webhook,
  Wrench,
  X,
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';

export type ManualCategory =
  | 'todos'
  | 'essencial'
  | 'suporte_ativos'
  | 'manutencao'
  | 'projetos_compras'
  | 'pessoas_rh'
  | 'governanca_ti';

export type ManualSection = {
  id: string;
  title: string;
  eyebrow: string;
  category: ManualCategory;
  description: string;
  icon: React.ElementType;
  roles: string[];
  bullets: string[];
  action?: { label: string; to: string };
};

const roleLabels: Record<string, string> = {
  admin: 'Administrador',
  gerente_ti: 'Gerente de TI',
  gerente_infra: 'Gerente de Infraestrutura',
  tecnico: 'Técnico',
  comprador: 'Comprador',
  rh: 'Recursos Humanos',
  usuario_comum: 'Usuário Comum',
};

const roleGroupMapping: Record<string, string[]> = {
  admin: ['admin', 'manager', 'staff', 'purchases', 'rh', 'common'],
  gerente_ti: ['manager', 'staff', 'purchases', 'common'],
  gerente_infra: ['manager', 'staff', 'purchases', 'common'],
  tecnico: ['staff', 'common'],
  comprador: ['purchases', 'common'],
  rh: ['rh', 'common'],
  usuario_comum: ['common'],
};

const categoriesList: { id: ManualCategory; label: string }[] = [
  { id: 'todos', label: 'Todos os tópicos' },
  { id: 'essencial', label: 'Essencial & Acesso' },
  { id: 'suporte_ativos', label: 'Suporte & Patrimônio' },
  { id: 'manutencao', label: 'Manutenção & Preventiva' },
  { id: 'projetos_compras', label: 'Projetos & Compras' },
  { id: 'pessoas_rh', label: 'Pessoas & RH' },
  { id: 'governanca_ti', label: 'Governança & TI' },
];

const manualSections: ManualSection[] = [
  {
    id: 'primeiros-passos',
    title: 'Primeiros Passos & Autenticação',
    eyebrow: 'Acesso Seguro',
    category: 'essencial',
    description: 'Guia de entrada no sistema com credenciais convencionais ou crachá digital integrado.',
    icon: BookOpen,
    roles: ['common'],
    bullets: [
      'Login por e-mail e senha corporativos com proteção contra tentativas excessivas (Rate Limiter).',
      'Login instantâneo por Crachá Digital QR Code + PIN numérico de 4 a 6 dígitos.',
      'Menu lateral responsivo e retrátil, adaptando-se automaticamente a tablets e smartphones.',
      'Cabeçalho com monitor de conectividade online/offline, atalho de emergência e perfil.',
    ],
    action: { label: 'Acessar Dashboard', to: '/' },
  },
  {
    id: 'dashboard',
    title: 'Dashboard & Painel Geral',
    eyebrow: 'Visão Operacional',
    category: 'essencial',
    description: 'Centralização de métricas de patrimônio, tickets, manutenções pendentes e comunicados.',
    icon: Monitor,
    roles: ['common', 'staff', 'manager', 'purchases', 'rh', 'admin'],
    bullets: [
      'Usuários comuns visualizam seus ativos em uso, chamados abertos e avisos corporativos vigentes.',
      'Técnicos e gestores visualizam total de chamados abertos, chamados atribuídos a si, ativos disponíveis e manutenções em andamento.',
      'Compradores e gestores acompanham resumo de cotações em aberto e pedidos aguardando recebimento.',
      'Banner com carrossel dinâmico de avisos e comunicados com suporte a imagens, vídeos e links externos.',
    ],
    action: { label: 'Ir para o Dashboard', to: '/' },
  },
  {
    id: 'perfil',
    title: 'Meu Perfil & Portal Pessoal',
    eyebrow: 'Conta de Usuário',
    category: 'essencial',
    description: 'Gestão de dados cadastrais, alteração de senha de acesso, foto de perfil e portal de RH pessoal.',
    icon: User,
    roles: ['common'],
    bullets: [
      'Atualização de dados de contato e upload de foto de avatar (exibida em chamados e na Sala TV).',
      'Troca de senha segura com verificação de requisitos mínimos.',
      'Consulta ao seu histórico de status no RH (férias, folgas, banco de horas e atestados).',
      'Acesso a comunicados oficiais direcionados com confirmação de leitura.',
    ],
    action: { label: 'Editar Meu Perfil', to: '/profile' },
  },
  {
    id: 'cracha',
    title: 'Crachá Digital QR & PIN',
    eyebrow: 'Identificação Digital',
    category: 'essencial',
    description: 'Credencial eletrônica individual para autenticação e assinatura de entrega de ativos.',
    icon: QrCode,
    roles: ['common'],
    bullets: [
      'Exibição do QR Code pessoal exclusivo e identificação com matrícula e cargo.',
      'Configuração e redefinição do código PIN numérico de segurança.',
      'Regeneração instantânea do token QR em caso de suspeita de exposição.',
      'Validação de recebimento de equipamentos e devoluções através da leitura do crachá pela equipe de TI.',
    ],
    action: { label: 'Ver Meu Crachá', to: '/badge' },
  },
  {
    id: 'servicos',
    title: 'Central de Suporte (Service Desk)',
    eyebrow: 'Atendimento & Chamados',
    category: 'suporte_ativos',
    description: 'Abertura, acompanhamento em timeline, atribuição de técnicos e solução de chamados de TI.',
    icon: Headphones,
    roles: ['common', 'staff', 'manager'],
    bullets: [
      'Usuários abrem chamados selecionando serviço do catálogo, nível de urgência, descrição detalhada e fotos.',
      'Timeline em tempo real com mensagens, histórico de interações e anexos compartilhados.',
      'Técnicos e gestores podem atribuir chamados para si ou outros técnicos, atualizar status e registrar solução.',
      'Gestores e administradores podem criar novas categorias e definições de serviços no catálogo.',
      'Notificações internas e por e-mail configuráveis em cada mudança de etapa ou resposta no ticket.',
    ],
    action: { label: 'Abrir Central de Suporte', to: '/servicos' },
  },
  {
    id: 'ativos',
    title: 'Ativos & Inventário Patrimonial',
    eyebrow: 'Gestão de Patrimônio',
    category: 'suporte_ativos',
    description: 'Catálogo completo de equipamentos, etiquetas patrimoniais, especificações técnicas e histórico.',
    icon: Box,
    roles: ['staff', 'manager', 'purchases', 'admin'],
    bullets: [
      'Controle por E-Patrimônio, número de série, modelo, fabricante, categoria, local e status operacional.',
      'Geração e impressão de etiquetas com QR Code do ativo para inventário e auditoria rápida por leitor/câmera.',
      'Upload e download de datasheets técnicos em PDF vinculados à ficha do equipamento.',
      'Importação em lote via planilha CSV, exportação consolidada e duplicação em massa de ativos padronizados.',
      'Histórico completo de movimentações, manutenções, termos de responsabilidade e posseiros anteriores.',
    ],
    action: { label: 'Consultar Inventário', to: '/assets' },
  },
  {
    id: 'emprestimos',
    title: 'Empréstimos, Movimentações & Posse',
    eyebrow: 'Custódia de Equipamentos',
    category: 'suporte_ativos',
    description: 'Fluxo estruturado de requisição, autorização, entrega, transferência e devolução de bens.',
    icon: Truck,
    roles: ['common', 'staff', 'manager'],
    bullets: [
      'Colaboradores solicitam equipamentos informando justificativa e período necessário.',
      'Técnicos e gestores analisam, aprovam ou reprovam solicitações pendentes.',
      'Transferência de posse entre colaboradores ou alteração de local de armazenamento.',
      'Devolução de equipamentos ao estoque de TI com checagem de estado físico e liberação do termo.',
      'Confirmação de entrega física pelo escaneamento do crachá QR do colaborador no momento da retirada.',
    ],
    action: { label: 'Gerenciar Empréstimos', to: '/emprestimos' },
  },
  {
    id: 'manutencoes',
    title: 'Manutenção Corretiva',
    eyebrow: 'Reparos & Incidentes',
    category: 'manutencao',
    description: 'Registro de avarias, diagnóstico técnico, reparo em bancada e testes de retorno ao usuário.',
    icon: Wrench,
    roles: ['common', 'staff', 'manager'],
    bullets: [
      'Usuários abrem solicitação de reparo direto para o ativo que está sob sua responsabilidade.',
      'Técnicos assumem a ordem, alteram status para Em Diagnóstico / Em Reparo e descrevem ações tomadas.',
      'Integração direta com o módulo de Compras para solicitar peças de reposição necessárias para o conserto.',
      'Conclusão da manutenção com registro de laudo técnico e confirmação de entrega ao usuário por QR Code.',
    ],
    action: { label: 'Ver Manutenções Corretivas', to: '/manutencoes' },
  },
  {
    id: 'preventiva',
    title: 'Manutenção Preventiva Programada',
    eyebrow: 'Inspeções Periódicas',
    category: 'manutencao',
    description: 'Planos recorrentes de revisão, checklists normativos, registro de materiais e evidências fotográficas.',
    icon: RotateCcw,
    roles: ['staff', 'manager', 'admin'],
    bullets: [
      'Criação de Planos de Preventiva com periodicidade (diária, semanal, mensal, semestral ou anual) e vínculos a ativos.',
      'Montagem de checklists padronizados com itens de verificação obrigatórios e pontuação.',
      'Geração automática e manual de Ordens de Manutenção Preventiva para técnicos responsáveis.',
      'Execução com marcação de itens de checklist, registro de fotos de evidência antes/depois e baixa de materiais do estoque.',
      'Painel analítico com histórico, taxa de conformidade e integração direta com o Kanban.',
    ],
    action: { label: 'Acessar Prev. Programada', to: '/manutencao-preventiva' },
  },
  {
    id: 'kanban',
    title: 'Kanban de Projetos & Tarefas',
    eyebrow: 'Gestão Ágil',
    category: 'projetos_compras',
    description: 'Quadro interativo em tempo real para controle de projetos de TI, tarefas técnicas e automações.',
    icon: ClipboardCheck,
    roles: ['staff', 'manager', 'admin'],
    bullets: [
      'Criação de múltiplos projetos com colunas customizáveis, ordenação por arrastar e soltar (Drag & Drop).',
      'Cards com prazos, prioridades (Baixa, Média, Alta, Crítica), técnicos atribuídos, checklist e comentários.',
      'Sincronização em tempo real via Server-Sent Events (SSE) — alterações aparecem instantaneamente para toda a equipe.',
      'Vínculo direto de cards com requisições de compras e reserva de itens de estoque.',
      'Automação de geração de cards a partir de planos de manutenção preventiva programada.',
    ],
    action: { label: 'Abrir Kanban de Projetos', to: '/kanban' },
  },
  {
    id: 'compras',
    title: 'Compras, Cotações & Estoque',
    eyebrow: 'Suprimentos & Peças',
    category: 'projetos_compras',
    description: 'Gestão ponta a ponta do ciclo de aquisição de TI: da requisição ao recebimento e entrada em estoque.',
    icon: ShoppingCart,
    roles: ['purchases', 'manager', 'admin'],
    bullets: [
      'Solicitações de compra manuais ou automáticas originadas de chamados, manutenções ou cartões do Kanban.',
      'Criação de cotações com múltiplos fornecedores e seleção formal da proposta vencedora com aprovação de alçada.',
      'Emissão de Pedidos de Compra com acompanhamento de prazos de entrega e status financeiro.',
      'Recebimento físico de mercadorias com reconciliação patrimonial (conversão automática de produtos em ativos).',
      'Controle de estoque físico de peças, insumos e consumíveis com histórico de movimentações de entrada e saída.',
      'Gestão de contratos de serviços/fornecedores e pesquisas de mercado integradas.',
    ],
    action: { label: 'Abrir Módulo de Compras', to: '/compras' },
  },
  {
    id: 'fornecedores',
    title: 'Fornecedores & Importação de NF-e',
    eyebrow: 'Cadastros Fiscais',
    category: 'projetos_compras',
    description: 'Cadastro de parceiros comerciais, contatos, contratos e importação automática de XML de Notas Fiscais.',
    icon: PackageCheck,
    roles: ['purchases', 'manager', 'admin'],
    bullets: [
      'Cadastro detalhado de empresas com CNPJ, razão social, e-mail de faturamento, telefone e contatos chave.',
      'Upload e leitura de arquivos XML de NF-e (Nota Fiscal Eletrônica) com extração automática de itens e valores.',
      'Associação automática de notas fiscais a pedidos de compra e histórico patrimonial de ativos.',
      'Consulta centralizada de todos os documentos fiscais emitidos por fornecedor.',
    ],
    action: { label: 'Gerenciar Fornecedores', to: '/compras/fornecedores' },
  },
  {
    id: 'rh-termos',
    title: 'Portal RH: Termos de Responsabilidade',
    eyebrow: 'Governança Jurídica',
    category: 'pessoas_rh',
    description: 'Formalização legal de custódia de equipamentos de TI com geração de PDF e arquivo digital assinado.',
    icon: FileSignature,
    roles: ['rh', 'manager', 'admin'],
    bullets: [
      'Geração automática de Termos de Responsabilidade em formato PDF com dados do colaborador e lista de equipamentos.',
      'Upload do documento digitalizado com assinatura física ou inclusão de comprovante eletrônico.',
      'Controle de status do documento (Pendente de Assinatura, Assinado, Cancelado).',
      'Histórico perpétuo arquivado para auditorias trabalhistas e inventário patrimonial de saída.',
    ],
    action: { label: 'Acessar Portal RH', to: '/rh' },
  },
  {
    id: 'rh-pessoas',
    title: 'Portal RH: Status da Equipe & Escala',
    eyebrow: 'Gestão de Colaboradores',
    category: 'pessoas_rh',
    description: 'Acompanhamento do regime de trabalho, disponibilidade, atestados, banco de horas e offboarding.',
    icon: Users,
    roles: ['rh', 'manager', 'admin'],
    bullets: [
      'Registro de status de trabalho diário: Trabalhando, Home Office, Folga, Férias, Atestado Médico ou Licença.',
      'Controle de saldo de banco de horas por colaborador e exportação de relatório consolidado em CSV.',
      'Definição de quais colaboradores aparecem no painel da Sala de Monitoramento TV em tempo real.',
      'Publicação de comunicados e avisos internos exclusivos do RH com comprovação de leitura pelos colaboradores.',
      'Processo de desligamento (Offboarding) com bloqueio automático de acesso e conferência de devolução de ativos.',
    ],
    action: { label: 'Abrir Controle de RH', to: '/rh' },
  },
  {
    id: 'monitoramento',
    title: 'Sala de Monitoramento TV (NOC)',
    eyebrow: 'Tempo Real & Painel TV',
    category: 'governanca_ti',
    description: 'Painel operacional otimizado para TVs e monitores de parede na central de suporte de TI.',
    icon: Tv,
    roles: ['staff', 'manager', 'admin'],
    bullets: [
      'Visualização ao vivo de chamados abertos, técnicos atribuídos, ordens de manutenção e solicitações de ativos.',
      'Atualização automática dos dados a cada 5 segundos com sinalização sonora para novos eventos e chamados urgentes.',
      'Card visual dos colaboradores em plantão definidos pelo RH (com foto, nome, setor e status de trabalho).',
      'Transmissão prioritária de Alertas Emergenciais em modal vermelho com acionamento sonoro contínuo.',
    ],
    action: { label: 'Abrir Sala de Monitoramento', to: '/monitoramento' },
  },
  {
    id: 'emergencia',
    title: 'Alertas Emergenciais & Botão de Pânico',
    eyebrow: 'Incidentes Críticos',
    category: 'suporte_ativos',
    description: 'Mecanismo de acionamento imediato para incidentes de alta severidade com propagação em tempo real.',
    icon: ShieldAlert,
    roles: ['common', 'staff', 'manager', 'admin'],
    bullets: [
      'Qualquer colaborador pode acionar o botão de emergência informando uma descrição curta do problema.',
      'O sistema identifica automaticamente o colaborador, setor e o equipamento que está sob sua posse no momento.',
      'Disparo imediato de alarme visual e sonoro em todas as telas de técnicos e gestores conectados e na Sala TV.',
      'Botões operacionais para a equipe de TI registrar "Ciente" e "Marcar como Atendido", com log de horários.',
      'Disparo de webhook para sistemas externos e canais de incidentes configurados.',
    ],
    action: { label: 'Ver Histórico de Alertas', to: '/alertas' },
  },
  {
    id: 'comunicados',
    title: 'Comunicados & Avisos Oficiais',
    eyebrow: 'Comunicação Corporativa',
    category: 'essencial',
    description: 'Publicação de informativos gerais, manutenção programada, avisos de segurança e políticas da empresa.',
    icon: BellRing,
    roles: ['staff', 'manager', 'admin'],
    bullets: [
      'Criação de avisos com texto formatado, imagens de destaque, vídeos incorporados (MP4/WebM) ou links externos.',
      'Definição de vigência temporal (data de início e término) e ativação/desativação manual imediata.',
      'Exibição em destaque para os colaboradores na tela inicial do Dashboard em carrossel e modal completo.',
      'Segmentação para equipe interna ou visibilidade global de todos os usuários.',
    ],
    action: { label: 'Gerenciar Comunicados', to: '/alertas' },
  },
  {
    id: 'setores',
    title: 'Setores & Departamentos',
    eyebrow: 'Estrutura Organizacional',
    category: 'governanca_ti',
    description: 'Mapeamento das áreas da empresa para alocação de ativos, chamados e vinculação de colaboradores.',
    icon: Building2,
    roles: ['manager', 'admin'],
    bullets: [
      'Cadastro e organização dos setores e departamentos da empresa (ex: TI, Financeiro, Vendas, Operações).',
      'Vinculação estrutural de colaboradores aos seus respectivos departamentos.',
      'Rastreamento de ativos físicos e estoques alocados por setor para centros de responsabilidade.',
      'Filtros analíticos no inventário e relatórios operacionais por departamento.',
    ],
    action: { label: 'Acessar Setores', to: '/setores' },
  },
  {
    id: 'usuarios',
    title: 'Usuários & Permissões (RBAC)',
    eyebrow: 'Controle de Acessos',
    category: 'governanca_ti',
    description: 'Gestão de contas, definição de papéis de acesso, ativação/desativação e auditoria de usuários.',
    icon: UserCog,
    roles: ['manager', 'admin', 'rh'],
    bullets: [
      'Criação de novos usuários com definição obrigatória de perfil: Administrador, Gerente de TI, Gerente de Infraestrutura, Técnico, Comprador, RH ou Usuário.',
      'Ativação, desativação e redefinição de senhas administrativas.',
      'Relatório individual detalhado por usuário contendo histórico de chamados, manutenções, ativos em posse e termos.',
      'Controle granular de acesso a módulos administrativos e telas sensíveis via middleware seguro.',
    ],
    action: { label: 'Gerenciar Usuários', to: '/users' },
  },
  {
    id: 'webhooks',
    title: 'Webhooks & Integrações Externas',
    eyebrow: 'Conectividade',
    category: 'governanca_ti',
    description: 'Disparo de eventos HTTP em tempo real para Slack, Microsoft Teams, Discord, ERPs ou sistemas terceiros.',
    icon: Webhook,
    roles: ['admin'],
    bullets: [
      'Cadastro de endpoints com URL de destino, nome identificador e seleção de eventos acionadores.',
      'Disparo de payloads JSON em eventos de emergência, novos chamados, manutenções e alertas.',
      'Ferramenta integrada de disparo de teste para verificação instantânea da conexão.',
      'Painel de logs de execução com código de status HTTP retornado, tempo de resposta e detalhamento de erros.',
    ],
    action: { label: 'Configurar Webhooks', to: '/webhooks' },
  },
  {
    id: 'backup',
    title: 'Backup & Restore do Sistema',
    eyebrow: 'Segurança de Dados',
    category: 'governanca_ti',
    description: 'Rotinas completas de salvaguarda e recuperação do banco de dados PostgreSQL e arquivos anexos.',
    icon: Database,
    roles: ['manager', 'admin'],
    bullets: [
      'Geração de backups completos comprimidos (.ZIP) contendo dump SQL do banco de dados e diretório de uploads.',
      'Download seguro de cópias de segurança para armazenamento externo ou cofre digital.',
      'Processo de restauração direta pelo painel administrativo para recuperação rápida de desastres (Disaster Recovery).',
      'Monitoramento de integridade e histórico de rotinas de backup executadas.',
    ],
    action: { label: 'Acessar Backup & Restore', to: '/backups' },
  },
  {
    id: 'logs-email',
    title: 'Logs de E-mail & Auditoria SMTP',
    eyebrow: 'Auditoria de Mensagens',
    category: 'governanca_ti',
    description: 'Rastreamento completo de todas as notificações disparadas por e-mail pelo sistema.',
    icon: Mail,
    roles: ['admin'],
    bullets: [
      'Registro de destinatário, assunto, canal de origem, data/hora e status de entrega (Sucesso / Falha).',
      'Detalhes de erros de conexão SMTP ou rejeição de servidores para diagnóstico técnico rápido.',
      'Histórico de testes de envio disparados pelo painel de configurações.',
      'Auditoria de conformidade para garantir que colaboradores receberam avisos de chamados e termos.',
    ],
    action: { label: 'Ver Logs de E-mail', to: '/logs-email' },
  },
  {
    id: 'configuracoes',
    title: 'Configurações Globais & Assistente IA',
    eyebrow: 'Parâmetros Gerais',
    category: 'governanca_ti',
    description: 'Personalização de módulos ativos, servidor SMTP de e-mail e integração de inteligência artificial.',
    icon: Sliders,
    roles: ['manager', 'admin'],
    bullets: [
      'Habilitação/Desabilitação modular de recursos: Manutenção Preventiva, Compras, Kanban e Assistente IA.',
      'Configuração do servidor SMTP (host, porta 587 STARTTLS / 465 SSL, usuário, senha e remetente) com teste em tempo real.',
      'Controle fino de notificações por e-mail e internas por módulo (RH, Kanban, Manutenções, Compras, Service Desk).',
      'Configuração do Assistente IA: escolha de provedor (OpenAI, Google Gemini ou Ollama Local), modelo e chaves de API.',
    ],
    action: { label: 'Abrir Configurações', to: '/configuracoes' },
  },
  {
    id: 'apk-android',
    title: 'Aplicativo Móvel Android (APK)',
    eyebrow: 'Mobilidade & Campo',
    category: 'essencial',
    description: 'Distribuição oficial do aplicativo móvel para uso por técnicos de campo e colaboradores.',
    icon: Smartphone,
    roles: ['common', 'staff', 'manager', 'purchases', 'rh', 'admin'],
    bullets: [
      'Download direto do arquivo APK oficial atualizado disponibilizado no servidor.',
      'Apresentação de QR Code para escaneamento e download direto na câmera do smartphone.',
      'Instruções de instalação de fontes confiáveis no Android e histórico de versões/changelog.',
      'No primeiro acesso ao app, informe apenas a URL base da aplicação (a rota /api/v1 é tratada automaticamente).',
    ],
  },
];

export const ManualPage: React.FC = () => {
  const user = useAuthStore((state) => state.user);
  const userRole = user?.role?.toLowerCase() || 'usuario_comum';
  const isAdmin = userRole === 'admin';

  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>('meu_perfil');
  const [selectedCategory, setSelectedCategory] = useState<ManualCategory>('todos');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Non-admins are strictly locked to their own profile.
  const activeRole = !isAdmin || selectedRoleFilter === 'meu_perfil' ? userRole : selectedRoleFilter;
  const allowedGroups = useMemo(() => roleGroupMapping[activeRole] || ['common'], [activeRole]);

  // Available sections for the active role
  const roleSections = useMemo(() => {
    if (isAdmin && selectedRoleFilter === 'todos') {
      return manualSections;
    }
    return manualSections.filter((section) =>
      section.roles.some((role) => allowedGroups.includes(role))
    );
  }, [isAdmin, selectedRoleFilter, allowedGroups]);

  // Categories that actually contain modules for the current user
  const availableCategories = useMemo(() => {
    const presentCategories = new Set(roleSections.map((s) => s.category));
    return categoriesList.filter((cat) => cat.id === 'todos' || presentCategories.has(cat.id));
  }, [roleSections]);

  const filteredSections = useMemo(() => {
    return roleSections.filter((section) => {
      // 1. Filter by category
      if (selectedCategory !== 'todos' && section.category !== selectedCategory) {
        return false;
      }

      // 2. Filter by search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const inTitle = section.title.toLowerCase().includes(q);
        const inEyebrow = section.eyebrow.toLowerCase().includes(q);
        const inDescription = section.description.toLowerCase().includes(q);
        const inBullets = section.bullets.some((b) => b.toLowerCase().includes(q));
        if (!inTitle && !inEyebrow && !inDescription && !inBullets) {
          return false;
        }
      }

      return true;
    });
  }, [roleSections, selectedCategory, searchQuery]);

  return (
    <div className="mx-auto max-w-[1540px] space-y-8 pb-12">
      {/* Hero Section */}
      <section className="relative overflow-hidden rounded-[28px] border border-[#b8d7ef] bg-gradient-to-br from-[#0b2944] via-[#0e3b64] to-[#082036] px-6 py-9 text-white shadow-[0_20px_60px_rgba(9,30,66,.2)] sm:px-10 sm:py-12">
        <div className="pointer-events-none absolute -right-24 -top-28 h-96 w-96 rounded-full bg-cyan-400/20 blur-3xl" />
        <div className="pointer-events-none absolute -left-20 -bottom-28 h-80 w-80 rounded-full bg-blue-500/15 blur-3xl" />

        <div className="relative grid items-center gap-8 lg:grid-cols-[1fr_360px]">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3.5 py-1 text-[11px] font-bold uppercase tracking-[.2em] text-cyan-200 shadow-xs">
              <CircleHelp size={15} /> Manual do Usuário
            </div>
            <h1 className="max-w-2xl text-3xl font-extrabold tracking-tight sm:text-5xl">
              Operação clara. <span className="text-cyan-300">TI no controle total.</span>
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-200 sm:text-base">
              Guia oficial de operação e referência de funcionalidades do AssetTrack TI. Módulos e rotinas disponíveis para o seu perfil de acesso.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3.5 py-2 text-xs text-slate-100 backdrop-blur-sm border border-white/15">
                <User size={14} className="text-cyan-300" />
                Seu perfil: <strong className="text-cyan-200">{roleLabels[userRole] || userRole}</strong>
              </span>

              {isAdmin && selectedRoleFilter !== 'meu_perfil' && (
                <button
                  onClick={() => setSelectedRoleFilter('meu_perfil')}
                  className="rounded-xl border border-cyan-400/40 bg-cyan-500/20 px-3.5 py-2 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-500/30"
                >
                  Restaurar para meu perfil
                </button>
              )}
            </div>
          </div>

          <div className="hidden lg:block">
            <div className="rounded-2xl border border-cyan-400/30 bg-white/5 p-6 backdrop-blur-md shadow-inner">
              <p className="text-xs font-mono uppercase tracking-wider text-cyan-300">Navegação Rápida</p>
              <h3 className="mt-1 text-base font-bold text-white">Central de Conhecimento</h3>
              <p className="mt-2 text-xs leading-relaxed text-slate-300">
                Consulte permissões, instruções e caminhos de acesso aos recursos disponíveis no sistema.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2 text-[11px] font-medium text-slate-200">
                <div className="flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-2">
                  <CheckCircle2 size={13} className="text-emerald-400" /> {roleSections.length} Módulos Disponíveis
                </div>
                <div className="flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-2">
                  <CheckCircle2 size={13} className="text-emerald-400" /> Acesso Seguro
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Filter and Search Controls */}
      <section className="space-y-4 rounded-2xl border border-brand-border bg-white/80 p-5 shadow-sm backdrop-blur-sm">
        {/* Search Bar & (Admin-only) Role Select */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="relative flex-1">
            <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar no manual (ex: chamados, ativos, QR Code, reparo, devolução)..."
              className="w-full rounded-xl border border-brand-border bg-white pl-10 pr-10 py-2.5 text-sm text-brand-text placeholder-brand-muted/60 transition focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-muted hover:text-brand-text"
                title="Limpar busca"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {isAdmin && (
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs font-semibold text-brand-muted shrink-0">Auditar Perfil (Admin):</label>
              <select
                value={selectedRoleFilter}
                onChange={(e) => setSelectedRoleFilter(e.target.value)}
                className="rounded-xl border border-brand-border bg-white px-3.5 py-2 text-xs font-medium text-brand-text shadow-xs transition focus:border-brand-primary focus:outline-none"
              >
                <option value="meu_perfil">Meu Perfil ({roleLabels[userRole] || userRole})</option>
                <option value="todos">Todos os Perfis (Visão Global)</option>
                <option value="admin">Administrador (admin)</option>
                <option value="gerente_ti">Gerente de TI (gerente_ti)</option>
                <option value="gerente_infra">Gerente de Infra (gerente_infra)</option>
                <option value="tecnico">Técnico (tecnico)</option>
                <option value="comprador">Comprador (comprador)</option>
                <option value="rh">Recursos Humanos (rh)</option>
                <option value="usuario_comum">Usuário Comum (usuario_comum)</option>
              </select>
            </div>
          )}
        </div>

        {/* Category Pills */}
        <div className="flex flex-wrap gap-2 border-t border-brand-border/60 pt-4">
          {availableCategories.map((cat) => {
            const isActive = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`rounded-xl px-3.5 py-1.5 text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-brand-primary text-white shadow-xs font-semibold'
                    : 'bg-slate-100 text-brand-muted hover:bg-slate-200/80 hover:text-brand-text'
                }`}
              >
                {cat.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* Results Count Header */}
      <div className="flex items-center justify-between px-1">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.22em] text-brand-primary">Conteúdo do Manual</p>
          <h2 className="mt-1 text-2xl font-bold text-brand-text">
            {isAdmin && selectedRoleFilter === 'todos'
              ? 'Todos os Módulos do Sistema'
              : `Módulos disponíveis para: ${roleLabels[activeRole] || activeRole}`}
          </h2>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-brand-muted">
          {filteredSections.length} {filteredSections.length === 1 ? 'módulo exibido' : 'módulos exibidos'}
        </span>
      </div>

      {/* Modules Grid */}
      {filteredSections.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-brand-border bg-white/50 p-12 text-center">
          <CircleHelp size={36} className="mx-auto text-brand-muted/60" />
          <h3 className="mt-3 text-base font-bold text-brand-text">Nenhum módulo encontrado</h3>
          <p className="mt-1 text-xs text-brand-muted">
            Tente buscar com outro termo ou ajuste o filtro de categoria acima.
          </p>
          <button
            onClick={() => {
              setSearchQuery('');
              setSelectedCategory('todos');
            }}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand-primary px-4 py-2 text-xs font-bold text-white shadow-xs hover:brightness-105"
          >
            Limpar filtros
          </button>
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filteredSections.map((section, index) => {
            const Icon = section.icon;
            return (
              <article
                key={section.id}
                className="group flex flex-col justify-between rounded-2xl border border-brand-border bg-white/75 p-6 shadow-[0_8px_24px_rgba(9,30,66,.05)] backdrop-blur-xs transition hover:-translate-y-1 hover:border-brand-primary/40 hover:bg-white hover:shadow-md"
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div className="grid h-12 w-12 place-items-center rounded-xl bg-[#dff6fb] text-[#087e9a] transition group-hover:scale-105">
                      <Icon size={22} />
                    </div>
                    <span className="font-mono text-xs font-bold text-brand-muted/70">
                      #{String(index + 1).padStart(2, '0')}
                    </span>
                  </div>

                  <p className="mt-4 text-[10px] font-bold uppercase tracking-[.2em] text-brand-primary">
                    {section.eyebrow}
                  </p>
                  <h3 className="mt-1 text-lg font-bold text-brand-text">{section.title}</h3>
                  <p className="mt-2 text-xs leading-relaxed text-brand-muted">{section.description}</p>

                  <div className="mt-4 border-t border-brand-border/60 pt-3">
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      O que você pode fazer:
                    </p>
                    <ul className="space-y-2 text-xs leading-5 text-brand-text">
                      {section.bullets.map((bullet, bIdx) => (
                        <li key={bIdx} className="flex items-start gap-2">
                          <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-500" />
                          <span>{bullet}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="mt-6 border-t border-brand-border/60 pt-4 flex items-center justify-between">
                  {section.action ? (
                    <Link
                      to={section.action.to}
                      className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-brand-primary transition hover:gap-2.5"
                    >
                      <span>{section.action.label}</span>
                      <ArrowRight size={14} />
                    </Link>
                  ) : (
                    <span className="text-xs text-brand-muted italic">Módulo de sistema / informativo</span>
                  )}

                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-brand-muted uppercase">
                    {section.category.replace('_', ' ')}
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Role Permissions Matrix Section — ADMIN ONLY */}
      {isAdmin && (
        <section className="rounded-2xl border border-brand-border bg-white p-6 shadow-sm sm:p-8">
          <div className="border-b border-brand-border pb-4">
            <p className="text-xs font-bold uppercase tracking-[.2em] text-brand-primary">Área do Administrador</p>
            <h2 className="mt-1 text-xl font-bold text-brand-text">Matriz de Acessos e Permissões do Sistema</h2>
            <p className="mt-1 text-xs text-brand-muted">
              Esta seção é visível exclusivamente para Administradores para consulta da distribuição de privilégios.
            </p>
          </div>

          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-brand-border bg-slate-50 font-mono text-[11px] uppercase tracking-wider text-brand-muted">
                  <th className="p-3">Perfil (Role)</th>
                  <th className="p-3">Escopo Principal</th>
                  <th className="p-3">Módulos Acessíveis</th>
                  <th className="p-3 text-right">Nível de Alçada</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border/60">
                <tr className="hover:bg-slate-50/50">
                  <td className="p-3 font-bold text-brand-primary">Administrador (admin)</td>
                  <td className="p-3 text-brand-text">Governança total, segurança, integrações e parametrização.</td>
                  <td className="p-3 text-brand-muted">Todos os 22 módulos do sistema sem exceção.</td>
                  <td className="p-3 text-right font-mono font-bold text-emerald-600">Total (P0)</td>
                </tr>
                <tr className="hover:bg-slate-50/50">
                  <td className="p-3 font-bold text-brand-text">Gerente de TI (gerente_ti)</td>
                  <td className="p-3 text-brand-text">Gestão operacional, ativos, chamados, preventiva, kanban e compras.</td>
                  <td className="p-3 text-brand-muted">Ativos, Suporte, Manutenções, Preventivas, Kanban, Compras, Monitoramento, Setores, Backups.</td>
                  <td className="p-3 text-right font-mono font-bold text-blue-600">Gerencial (TI)</td>
                </tr>
                <tr className="hover:bg-slate-50/50">
                  <td className="p-3 font-bold text-brand-text">Gerente de Infra (gerente_infra)</td>
                  <td className="p-3 text-brand-text">Gestão de infraestrutura física, ativos de rede, preventivas e compras.</td>
                  <td className="p-3 text-brand-muted">Ativos, Suporte, Manutenções, Preventivas, Kanban, Compras, Monitoramento, Setores, Backups.</td>
                  <td className="p-3 text-right font-mono font-bold text-blue-600">Gerencial (Infra)</td>
                </tr>
                <tr className="hover:bg-slate-50/50">
                  <td className="p-3 font-bold text-brand-text">Técnico (tecnico)</td>
                  <td className="p-3 text-brand-text">Atendimento a chamados, execução de manutenções e ordens preventivas.</td>
                  <td className="p-3 text-brand-muted">Dashboard, Monitoramento TV, Chamados, Manutenções Corretivas, Preventivas, Kanban, Alertas, Ativos, Crachá.</td>
                  <td className="p-3 text-right font-mono font-bold text-slate-700">Operacional Técnico</td>
                </tr>
                <tr className="hover:bg-slate-50/50">
                  <td className="p-3 font-bold text-brand-text">Comprador (comprador)</td>
                  <td className="p-3 text-brand-text">Cotações, pedidos, fornecedores, notas fiscais (NF-e) e estoque.</td>
                  <td className="p-3 text-brand-muted">Dashboard, Compras, Cotações, Fornecedores, XML NF-e, Estoque, Contratos, Pesquisas, Ativos, Chamados.</td>
                  <td className="p-3 text-right font-mono font-bold text-amber-600">Suprimentos / Compras</td>
                </tr>
                <tr className="hover:bg-slate-50/50">
                  <td className="p-3 font-bold text-brand-text">Recursos Humanos (rh)</td>
                  <td className="p-3 text-brand-text">Termos de responsabilidade, status da equipe, comunicados e TV.</td>
                  <td className="p-3 text-brand-muted">Dashboard, Portal RH (Termos, Status, Offboarding), Usuários/Relatórios, Comunicados, Suporte, Crachá.</td>
                  <td className="p-3 text-right font-mono font-bold text-purple-600">Gestão de Pessoas</td>
                </tr>
                <tr className="hover:bg-slate-50/50">
                  <td className="p-3 font-bold text-brand-text">Usuário Comum (usuario_comum)</td>
                  <td className="p-3 text-brand-text">Uso diário de equipamentos, abertura de tickets e emergência.</td>
                  <td className="p-3 text-brand-muted">Dashboard, Central de Suporte, Solicitação/Devolução de Ativos, Solicitar Reparo, Alerta de Emergência, Crachá QR, Perfil.</td>
                  <td className="p-3 text-right font-mono font-bold text-slate-500">Colaborador / Solicitante</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Help Shortcuts Footer */}
      <section className="rounded-2xl border border-brand-border bg-[#f0f7fb] p-6 sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.2em] text-brand-primary">Suporte & Assistência</p>
            <h2 className="mt-1 text-xl font-bold text-brand-text">Dúvidas não listadas no manual?</h2>
            <p className="mt-1 text-xs text-brand-muted">
              Você pode conversar com nosso <strong>Assistente IA</strong> no botão azul flutuante ou abrir um ticket diretamente na Central de Suporte.
            </p>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <Link
              to="/servicos"
              className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-4 py-2.5 text-xs font-bold text-white shadow-xs transition hover:brightness-105"
            >
              <Headphones size={15} /> Abrir Chamado
            </Link>
            <Link
              to="/"
              className="inline-flex items-center gap-2 rounded-xl border border-brand-border bg-white px-4 py-2.5 text-xs font-bold text-brand-text transition hover:bg-white/80"
            >
              <ChevronRight size={15} /> Ir ao Dashboard
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};

