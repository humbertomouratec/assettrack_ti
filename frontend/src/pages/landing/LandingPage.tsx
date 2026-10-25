import { useEffect } from 'react';
import { LoginAccess } from './LoginAccess';
import { AudioPresentation } from './AudioPresentation';
import './landing.css';
import {
  ArrowUpRight,
  ArrowRight,
  Boxes,
  ScanLine,
  Headphones,
  Wrench,
  ShoppingCart,
  Columns3,
  Users,
  ShieldCheck,
  Smartphone,
  Radio,
  Check,
  ChevronDown,
  Cpu,
  Trophy,
  Tv,
  RefreshCw,
  Zap,
} from 'lucide-react';

const modules = [
  {
    icon: Boxes,
    title: 'Cada ativo, uma história completa.',
    tag: '01 / PATRIMÔNIO',
    text: 'Do cadastro à baixa: E-Patrimônio, número de série, localização, responsável e histórico de movimentações.',
    items: ['Inventário com filtros', 'Etiquetas e leitura QR', 'Relatórios PDF e CSV'],
  },
  {
    icon: Headphones,
    title: 'Suporte que não perde o contexto.',
    tag: '02 / SERVICE DESK',
    text: 'Centralize chamados por categoria, setor e prioridade. Acompanhe responsáveis e interações com evidências em fotos.',
    items: ['Timeline de atendimento', 'Indicadores gerenciais', 'Alertas de emergência'],
  },
  {
    icon: Wrench,
    title: 'Manutenção com próximo passo.',
    tag: '03 / MANUTENÇÃO',
    text: 'Organize reparos e planos preventivos com periodicidade, checklists, requisição de peças e registro de materiais.',
    items: ['Corretiva e preventiva', 'Evidências fotográficas', 'Requisição de peças inline'],
  },
  {
    icon: ShoppingCart,
    title: 'Da necessidade ao recebimento.',
    tag: '04 / COMPRAS',
    text: 'Conecte solicitações, aprovações, cotações e pedidos. O recebimento de equipamentos alimenta o inventário.',
    items: ['Centros de custo', 'Estoque e fornecedores', 'Contratos e garantias'],
  },
  {
    icon: Columns3,
    title: 'Projetos que saem do quadro.',
    tag: '05 / KANBAN',
    text: 'Distribua tarefas em colunas flexíveis, defina prazos e responsáveis e conecte os cards aos ativos e às compras.',
    items: ['Movimentação por arraste', 'Anexos e prioridades', 'Progresso do projeto'],
  },
  {
    icon: Users,
    title: 'Pessoas também fazem parte.',
    tag: '06 / RH',
    text: 'Organize termos de responsabilidade, calendário, status e comunicados. Gestores acompanham a equipe do seu setor.',
    items: ['Termos em PDF', 'Folgas, férias e banco de horas', 'Comunicação com gestor e RH'],
  },
  {
    icon: Cpu,
    title: 'Infraestrutura inteligente sob vigilância.',
    tag: '07 / IOT & HOME ASSISTANT',
    text: 'Conecte sensores de data center, nobreaks e atuadores ao E-Patrimônio com telemetria em tempo real.',
    items: ['Telemetria ao vivo de sensores', 'Vínculo ativo-dispositivo', 'Acionamento de serviços IoT'],
  },
  {
    icon: Trophy,
    title: 'Reconhecimento para a equipe técnica.',
    tag: '08 / GAMIFICAÇÃO',
    text: 'Pontuação dinâmica por SLAs cumpridos, checklists executados e emergências resolvidas, com ranking e medalhas.',
    items: ['Pontos de XP e níveis', 'Badges por raridade', 'Leaderboard da equipe'],
  },
  {
    icon: Tv,
    title: 'Visão operacional em tempo real para TV.',
    tag: '09 / SALA DE MONITORAMENTO',
    text: 'Painel dedicado para telão no NOC com atualização ao vivo a cada 5s, alertas sonoros e escala da equipe.',
    items: ['Modo TV e tela cheia', 'Streaming SSE de emergências', 'Status da equipe em tempo real'],
  },
];

const seo = {
  title: 'AssetTrack TI | Gestão de ativos e operações de TI',
  description: 'AssetTrack TI reúne gestão de ativos, Service Desk, manutenção, compras, projetos Kanban, RH, automação IoT e Gamificação em uma única plataforma.',
};

function setMeta(selector: string, attribute: 'name' | 'property', key: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.content = content;
}

export function LandingPage() {
  useEffect(() => {
    const canonicalUrl = new URL('/', window.location.origin).href;
    document.title = seo.title;
    setMeta('meta[name="description"]', 'name', 'description', seo.description);
    setMeta('meta[property="og:title"]', 'property', 'og:title', seo.title);
    setMeta('meta[property="og:description"]', 'property', 'og:description', seo.description);
    setMeta('meta[property="og:url"]', 'property', 'og:url', canonicalUrl);
    setMeta('meta[property="og:image"]', 'property', 'og:image', new URL('/assettrack-hero.png', window.location.origin).href);
    setMeta('meta[name="twitter:title"]', 'name', 'twitter:title', seo.title);
    setMeta('meta[name="twitter:description"]', 'name', 'twitter:description', seo.description);
    setMeta('meta[name="twitter:image"]', 'name', 'twitter:image', new URL('/assettrack-hero.png', window.location.origin).href);

    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = canonicalUrl;
  }, []);

  return (
    <div className="public-landing">
      <a className="skip-link" href="#conteudo">Pular para o conteúdo</a>
      <header className="nav">
        <a className="brand" href="#inicio" aria-label="AssetTrack TI, início">
          <Boxes size={29} />
          <span>assettrack<span className="brand-ti">TI</span></span>
        </a>
        <nav aria-label="Navegação principal">
          <a href="#apresentacao">Apresentação</a>
          <a href="#plataforma">Plataforma</a>
          <a href="#fluxo">Como funciona</a>
          <a href="#mobilidade">Mobilidade</a>
          <a href="#operacoes">Operações</a>
        </nav>
        <LoginAccess />
      </header>
      <main id="conteudo">
        <section className="hero" id="inicio">
          <div className="hero-top">
            <span className="eyebrow"><span className="status-dot" /> GESTÃO DE TI, PONTA A PONTA</span>
            <span className="hero-index">PATRIMÔNIO · IOT · OPERAÇÃO</span>
          </div>
          <div className="hero-grid">
            <div className="hero-copy">
              <h1>Sua TI conectada.<br />Tudo sob <em>controle.</em></h1>
              <p>Ativos, suporte, IoT e equipes no mesmo lugar. Transforme informações dispersas em uma operação organizada, do primeiro cadastro à próxima decisão.</p>
              <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
                <a className="button lime" href="#plataforma">Conheça o AssetTrack <ArrowUpRight size={20} /></a>
                <a
                  className="button"
                  href="#apresentacao"
                  style={{ background: '#113a30', color: '#c1f45a', border: '1px solid #285e4f' }}
                >
                  Ouvir Áudio (1 min) <Headphones size={18} />
                </a>
              </div>
              <div className="hero-notes">
                <span><Check size={16} /> Rastreabilidade & QR</span>
                <span><Check size={16} /> IoT & Telemetria</span>
                <span><Check size={16} /> Gamificação</span>
                <span><Check size={16} /> Web, PWA e Android</span>
              </div>
            </div>
            <div className="hero-visual">
              <div className="visual-caption">
                <ScanLine size={22} />
                <span>IDENTIFIQUE. CONECTE. ACOMPANHE.</span>
              </div>
              <img
                className="hero-art"
                src="/assettrack-hero.png"
                alt="Ilustração de notebook, servidor, celular e etiquetas de patrimônio com leitura QR"
                width="1536"
                height="1024"
                fetchPriority="high"
              />
              <div className="asset-tag">
                <span className="tag-icon"><ShieldCheck size={23} /></span>
                <div>
                  <strong>Histórico em cada movimento</strong>
                  <span>Do equipamento ao responsável</span>
                </div>
                <ArrowUpRight size={20} />
              </div>
            </div>
          </div>
          <div className="hero-bottom">
            <span>MENOS INFORMAÇÃO DISPERSA. MAIS VISIBILIDADE.</span>
            <a href="#apresentacao">Ouça a apresentação em áudio com o avatar <ArrowRight size={17} /></a>
          </div>
        </section>

        <AudioPresentation />

        <section className="platform section" id="plataforma">
          <div className="section-heading">
            <div>
              <span className="eyebrow">UMA PLATAFORMA. VÁRIAS CONEXÕES.</span>
              <h2>A operação inteira.<br /><span>No mesmo fluxo.</span></h2>
            </div>
            <p>Os módulos acompanham o trabalho real da sua equipe — e mantêm o contexto entre uma etapa e outra.</p>
          </div>
          <div className="module-grid">
            {modules.map(({ icon: Icon, title, tag, text, items }) => (
              <article className="module" key={tag}>
                <div className="module-top">
                  <Icon size={27} strokeWidth={1.5} />
                  <span>{tag}</span>
                </div>
                <h3>{title}</h3>
                <p>{text}</p>
                <ul>
                  {items.map((item) => (
                    <li key={item}><Check size={15} />{item}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section className="flow section" id="fluxo">
          <div className="section-heading">
            <div>
              <span className="eyebrow">DO PEDIDO AO HISTÓRICO</span>
              <h2>Cada etapa deixa<br />um caminho claro.</h2>
            </div>
            <p>Um equipamento não é só um item na lista. Ele conecta uma compra, uma pessoa e toda uma rotina de cuidado.</p>
          </div>
          <ol className="steps">
            {[
              ['Solicite e aprove', 'Registre a necessidade, compare cotações e acompanhe o pedido de compra.'],
              ['Receba e identifique', 'Integre o recebimento ao inventário e identifique o ativo pelo E-Patrimônio.'],
              ['Entregue e monitore', 'Vincule o responsável via QR e conecte telemetria IoT do equipamento ao patrimônio.'],
              ['Cuide e evolua', 'Conecte chamados, preventivas, conquistas da equipe e histórico do ativo.'],
            ].map(([title, text], i) => (
              <li key={title}>
                <span className="step-number">0{i + 1}</span>
                <h3>{title}</h3>
                <p>{text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mobile section" id="mobilidade">
          <div className="mobile-symbol">
            <Smartphone size={70} strokeWidth={1} />
            <ScanLine size={40} strokeWidth={1.3} />
            <span>DA MESA AO INVENTÁRIO</span>
          </div>
          <div>
            <span className="eyebrow">A OPERAÇÃO VAI COM VOCÊ</span>
            <h2>Menos distância<br />entre ver e agir.</h2>
            <p>Acesse pelo navegador ou pelo aplicativo Android. Leia etiquetas QR, consulte equipamentos e acompanhe as demandas onde o trabalho acontece.</p>
            <div className="mobile-details">
              <span><ScanLine /> Leitura QR de ativos</span>
              <span><Smartphone /> Web, PWA e Android</span>
              <span><Zap /> Notificações nativas</span>
            </div>
            <p className="small-note">O APK é disponibilizado pelo portal da sua organização. O acesso depende do endereço e das permissões configurados pela equipe responsável.</p>
          </div>
        </section>

        <section className="operations section" id="operacoes">
          <div className="section-heading">
            <div>
              <span className="eyebrow">VISIBILIDADE COM RESPONSABILIDADE</span>
              <h2>A informação certa.<br />Para quem precisa.</h2>
            </div>
          </div>
          <div className="operations-grid">
            <article>
              <ShieldCheck />
              <h3>Acesso por perfil</h3>
              <p>Permissões por função e módulos configuráveis. No RH, gestores acompanham a equipe atribuída ao seu setor.</p>
            </article>
            <article>
              <Radio />
              <h3>Operação à vista & NOC</h3>
              <p>Dashboard, alertas sonoros e sala de monitoramento em tempo real para TV acompanhando filas e responsáveis.</p>
            </article>
            <article>
              <Cpu />
              <h3>IoT & Telemetria Integrada</h3>
              <p>Sensores Home Assistant vinculados aos ativos para monitoramento térmico, elétrico e acionamento inteligente.</p>
            </article>
            <article>
              <Trophy />
              <h3>Gamificação Operacional</h3>
              <p>Reconhecimento contínuo para técnicos com pontos de experiência (XP), medalhas por mérito e ranking da equipe.</p>
            </article>
            <article>
              <RefreshCw />
              <h3>Atualização Contínua</h3>
              <p>Atualizador Git & Docker Runner integrado em background com suporte a portas customizadas e alta disponibilidade.</p>
            </article>
            <article>
              <Boxes />
              <h3>Contexto para decidir</h3>
              <p>Relatórios, exportações e histórico ajudam a conferir o inventário e acompanhar a evolução da operação.</p>
            </article>
          </div>
        </section>

        <section className="faq section">
          <div>
            <span className="eyebrow">BOM SABER</span>
            <h2>Conecte os pontos.</h2>
          </div>
          <div className="faq-items">
            {[
              ['Para quais equipes o AssetTrack TI foi pensado?', 'Para gestores de TI e infraestrutura, técnicos, compradores, RH e colaboradores. Cada perfil acessa os recursos correspondentes às suas permissões.'],
              ['Como funciona a integração com Home Assistant?', 'O sistema permite sincronizar entidades e sensores inteligentes do seu Home Assistant e associá-los diretamente aos ativos cadastrados (E-Patrimônio), exibindo telemetria e permitindo acionamentos de serviços.'],
              ['O que é o módulo de Gamificação?', 'É uma central de reconhecimento onde a equipe técnica acumula pontos e níveis de experiência (XP) ao fechar chamados no prazo, concluir preventivas e atender emergências, desbloqueando conquistas e concorrendo no ranking.'],
              ['Preciso instalar um aplicativo?', 'A plataforma pode ser acessada pelo navegador. Também há suporte a PWA e aplicativo Android nativo, disponibilizado para download no próprio portal da organização.'],
              ['O que pode ser rastreado no inventário?', 'O cadastro reúne identificação por E-Patrimônio, número de série, categoria, localização, responsável, telemetria IoT e histórico de movimentações. Filtros e exportações apoiam a conferência.'],
              ['Esta página dá acesso aos dados da organização?', 'Esta é a apresentação pública do AssetTrack TI. Os dados operacionais ficam na aplicação da organização, com autenticação e controle de acesso. Para entrar, utilize o endereço informado pela sua equipe de TI.'],
            ].map(([q, a]) => (
              <details key={q}>
                <summary>{q}<ChevronDown size={20} /></summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="closing">
          <span className="eyebrow">ASSETTRACK TI</span>
          <h2>Mais conexão.<br /><em>Mais controle.</em></h2>
          <a className="button dark-button" href="#plataforma">Explore as funcionalidades <ArrowUpRight size={20} /></a>
          <p>Do patrimônio às pessoas e à infraestrutura inteligente. Uma operação que faz sentido.</p>
        </section>
      </main>
      <footer>
        <a className="brand" href="#inicio">
          <Boxes size={27} />
          <span>assettrack<span className="brand-ti">TI</span></span>
        </a>
        <p>Gestão de ativos, IoT e operações de TI.</p>
        <a href="#inicio">Voltar ao topo ↑</a>
      </footer>
    </div>
  );
}

