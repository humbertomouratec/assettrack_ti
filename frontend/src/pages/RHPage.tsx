import React, { useState, useEffect, useMemo } from 'react';
import { rhApi } from '../api/rh';
import { apiClient as api, toApiFileUrl } from '../api/client';
import type { TermoResponsabilidade, RHControlResponse, RHStatusType, RHStatusRecord } from '../types/rh';
import type { Solicitacao } from '../types/transaction';
import type { User } from '../types/user';
import { FileSignature, Printer, CheckCircle2, XCircle, Edit2, Plus, UserMinus, CalendarDays, MessageSquareText, UsersRound, Clock3, Download, ClipboardPlus, Megaphone, LayoutDashboard, Eye, EyeOff, Search, Network, X, Filter } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const statusStyles: Record<string, string> = {
  Pendente: 'border-yellow-500/30 text-yellow-400',
  Assinado: 'border-green-500/30 text-green-400',
  Cancelado: 'border-red-500/30 text-red-400',
};

const employeeStatus: Record<RHStatusType, { label: string; className: string; calendarClassName: string }> = {
  trabalhando: { label: 'Trabalhando', className: 'border-emerald-500/30 text-emerald-600 bg-emerald-500/10', calendarClassName: 'border-emerald-300 border-l-emerald-600 bg-emerald-50 text-emerald-800' },
  folga: { label: 'Folga', className: 'border-sky-500/30 text-sky-600 bg-sky-500/10', calendarClassName: 'border-sky-300 border-l-sky-600 bg-sky-50 text-sky-800' },
  ferias: { label: 'Férias', className: 'border-violet-500/30 text-violet-600 bg-violet-500/10', calendarClassName: 'border-violet-300 border-l-violet-600 bg-violet-50 text-violet-800' },
  banco_horas: { label: 'Banco de horas', className: 'border-amber-500/30 text-amber-700 bg-amber-500/10', calendarClassName: 'border-amber-300 border-l-amber-600 bg-amber-50 text-amber-800' },
  desligado: { label: 'Desligado', className: 'border-red-500/30 text-red-600 bg-red-500/10', calendarClassName: 'border-red-300 border-l-red-600 bg-red-50 text-red-800' },
};

const dateInputValue = () => {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
};

const formatDate = (value?: string | null) => value ? new Date(value).toLocaleDateString('pt-BR') : '-';

const dateOnly = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const exportPeriodRange = (mode: 'week' | 'month', referenceValue: string) => {
  const reference = referenceValue ? new Date(`${referenceValue}T00:00:00`) : new Date();
  if (mode === 'month') {
    const start = new Date(reference.getFullYear(), reference.getMonth(), 1);
    const end = new Date(reference.getFullYear(), reference.getMonth() + 1, 0, 23, 59, 59);
    return { start, end, label: start.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) };
  }
  const start = dateOnly(reference);
  const day = start.getDay();
  const offset = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + offset);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end, label: `${formatDate(start.toISOString())} até ${formatDate(end.toISOString())}` };
};

const overlapsPeriod = (record: RHStatusRecord, start: Date, end: Date) => {
  const recordStart = new Date(record.inicio);
  const recordEnd = new Date(record.fim || record.inicio);
  return recordStart <= end && recordEnd >= start;
};

const RHMonthlyCalendar: React.FC<{ records: RHStatusRecord[]; sectorId: string }> = ({ records, sectorId }) => {
  const [reference, setReference] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const days = useMemo(() => {
    const first = new Date(reference.getFullYear(), reference.getMonth(), 1);
    const count = new Date(reference.getFullYear(), reference.getMonth() + 1, 0).getDate();
    const padding: Array<Date | null> = Array.from({ length: first.getDay() }, () => null);
    const dates: Array<Date | null> = Array.from({ length: count }, (_, index) => new Date(reference.getFullYear(), reference.getMonth(), index + 1));
    return padding.concat(dates);
  }, [reference]);
  const filteredRecords = sectorId ? records.filter(item => String(item.usuario?.departamento_id ?? '') === sectorId) : records;
  const eventsForDay = (date: Date) => filteredRecords.filter(item => {
    const start = new Date(item.inicio); const end = new Date(item.fim || item.inicio);
    const calendarDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    return calendarDate >= new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime() && calendarDate <= new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime();
  });
  return <div className="border border-brand-border bg-brand-card">
    <div className="p-4 border-b border-brand-border flex items-center gap-3"><CalendarDays size={16} className="text-brand-primary" /><span className="text-sm font-bold font-mono uppercase tracking-wider text-brand-text">Calendário de RH</span><div className="ml-auto flex gap-2"><button type="button" onClick={() => setReference(new Date(reference.getFullYear(), reference.getMonth() - 1, 1))} className="text-xs text-brand-primary">←</button><span className="text-xs text-brand-muted capitalize min-w-32 text-center">{reference.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</span><button type="button" onClick={() => setReference(new Date(reference.getFullYear(), reference.getMonth() + 1, 1))} className="text-xs text-brand-primary">→</button></div></div>
    <div className="grid grid-cols-7 overflow-hidden rounded-b-xl border-l border-brand-border">{['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(day => <div key={day} className="border-r border-b border-brand-border bg-brand-dark/40 p-2 text-center text-[10px] font-bold uppercase tracking-wide text-brand-muted">{day}</div>)}{days.map((date, index) => <div key={index} className="min-h-28 border-r border-b border-brand-border bg-white/35 p-2">{date && <><div className="flex justify-end"><span className="inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold text-brand-muted">{date.getDate()}</span></div><div className="mt-1.5 space-y-1.5">{eventsForDay(date).slice(0, 3).map(item => <div title={`${item.usuario?.nome || ''} · ${employeeStatus[item.tipo].label}`} key={item.id} className={`border border-l-4 rounded-md px-1.5 py-1 text-[10px] font-semibold leading-tight shadow-sm ${employeeStatus[item.tipo].calendarClassName}`}><span className="block truncate">{item.usuario?.nome || 'Colaborador'}</span><span className="block text-[9px] font-medium opacity-75">{employeeStatus[item.tipo].label}</span></div>)}</div></>}</div>)}</div>
  </div>;
};

export const RHPage: React.FC = () => {
  const { user: currentUser } = useAuthStore();
  const isRHAdmin = currentUser?.role === 'admin' || currentUser?.role === 'rh';
  const [termos, setTermos] = useState<TermoResponsabilidade[]>([]);
  const [pendentes, setPendentes] = useState<Solicitacao[]>([]);
  const [usuarios, setUsuarios] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal de criação/edição
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<TermoResponsabilidade | null>(null);
  const [solId, setSolId] = useState<number | null>(null);
  const [conteudo, setConteudo] = useState('');
  const [saving, setSaving] = useState(false);
  const [statusForm, setStatusForm] = useState({ usuario_id: '', tipo: 'folga', inicio: dateInputValue(), fim: '', horas: '', observacao: '' });
  const [statusSector, setStatusSector] = useState('');
  const [statusUserSearch, setStatusUserSearch] = useState('');
  const [statusDateMode, setStatusDateMode] = useState<'range' | 'multiple'>('range');
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [newDateInput, setNewDateInput] = useState(dateInputValue());
  const [noticeForm, setNoticeForm] = useState({ usuario_id: '', titulo: '', mensagem: '', inicio: dateInputValue(), fim: '' });
  const [calendarSector, setCalendarSector] = useState('');
  const [exportSector, setExportSector] = useState('');
  const [exportPeriod, setExportPeriod] = useState<'week' | 'month'>('week');
  const [exportReference, setExportReference] = useState(dateInputValue());
  const [hierarchy, setHierarchy] = useState<{ setores: Array<{ id: number; nome: string; responsavel_id?: number | null }>; usuarios: User[] } | null>(null);
  const [hierarchySector, setHierarchySector] = useState('');
  const [hierarchyManager, setHierarchyManager] = useState('');
  const [hierarchySearch, setHierarchySearch] = useState('');
  const [hierarchyMembers, setHierarchyMembers] = useState<number[]>([]);

  const statusSectorOptions = useMemo(() => {
    const sectors = new Map<string, string>();
    control?.colaboradores.forEach(({ usuario }) => {
      if (usuario.departamento) {
        sectors.set(String(usuario.departamento_id), usuario.departamento.nome);
      }
    });
    return Array.from(sectors.entries()).map(([id, name]) => ({ id, name }));
  }, [control]);

  const statusFilteredCollaborators = useMemo(() => {
    if (!control) return [];
    return control.colaboradores.filter(c => {
      if (!c.usuario.is_active) return false;
      if (statusSector && String(c.usuario.departamento_id ?? '') !== statusSector) return false;
      if (statusUserSearch.trim()) {
        const query = statusUserSearch.toLowerCase();
        const name = (c.usuario.nome || '').toLowerCase();
        const email = (c.usuario.email || '').toLowerCase();
        const matricula = (c.usuario.matricula || '').toLowerCase();
        const cargo = (c.usuario.cargo || '').toLowerCase();
        const dept = (c.usuario.departamento?.nome || '').toLowerCase();
        return name.includes(query) || email.includes(query) || matricula.includes(query) || cargo.includes(query) || dept.includes(query);
      }
      return true;
    });
  }, [control, statusSector, statusUserSearch]);

  const fetchData = async () => {
    try {
      if (isRHAdmin) {
        const data = await rhApi.list();
        setTermos(data.termos ?? []);
        setPendentes(data.pendentes ?? []);

        const res = await api.get<User[]>('/users');
        setUsuarios((res.data || []).filter(u => {
          if (!u.is_active) return false;
          if (u.role === 'admin') return false;
          const allowedRoles = ['usuario_comum', 'rh', 'comprador', 'gerente_ti', 'gerente_infra', 'tecnico'];
          return allowedRoles.includes(u.role);
        }));
      } else {
        setTermos([]);
        setPendentes([]);
        setUsuarios([]);
      }
      setControl(await rhApi.control());
      if (isRHAdmin) {
        const tree = await rhApi.hierarchy();
        setHierarchy(tree);
        if (!hierarchySector && tree.setores[0]) setHierarchySector(String(tree.setores[0].id));
      } else {
        setHierarchy(null);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = window.setInterval(fetchData, 30000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const sector = hierarchy?.setores.find(item => String(item.id) === hierarchySector);
    setHierarchyManager(sector?.responsavel_id ? String(sector.responsavel_id) : '');
    setHierarchyMembers(hierarchy?.usuarios.filter(item => String(item.departamento_id) === hierarchySector && item.gestor_id === (sector?.responsavel_id ?? -1)).map(item => item.id) ?? []);
  }, [hierarchySector, hierarchy]);

  const saveHierarchy = async () => {
    if (!hierarchySector) return;
    try {
      await rhApi.updateHierarchy({ departamento_id: Number(hierarchySector), gestor_id: hierarchyManager ? Number(hierarchyManager) : undefined, subordinado_ids: hierarchyMembers });
      alert('Hierarquia salva com sucesso.');
      const tree = await rhApi.hierarchy(); setHierarchy(tree);
    } catch (err: any) { alert(err.response?.data?.error || 'Não foi possível salvar a hierarquia.'); }
  };

  const saveStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!statusForm.usuario_id) {
      alert('Selecione um colaborador.');
      return;
    }
    try {
      if (statusDateMode === 'multiple') {
        if (selectedDates.length === 0) {
          alert('Selecione pelo menos uma data para registrar o status.');
          return;
        }
        const promises = selectedDates.map(date =>
          rhApi.createStatus({
            usuario_id: Number(statusForm.usuario_id),
            tipo: statusForm.tipo,
            inicio: date,
            fim: date,
            horas: statusForm.horas ? Number(statusForm.horas) : undefined,
            observacao: statusForm.observacao || undefined,
          })
        );
        await Promise.all(promises);
        setStatusForm({ usuario_id: '', tipo: 'folga', inicio: dateInputValue(), fim: '', horas: '', observacao: '' });
        setSelectedDates([]);
        alert(`${selectedDates.length} datas registradas no calendário com sucesso!`);
      } else {
        await rhApi.createStatus({
          usuario_id: Number(statusForm.usuario_id),
          tipo: statusForm.tipo,
          inicio: statusForm.inicio,
          fim: statusForm.fim || undefined,
          horas: statusForm.horas ? Number(statusForm.horas) : undefined,
          observacao: statusForm.observacao || undefined,
        });
        setStatusForm({ usuario_id: '', tipo: 'folga', inicio: dateInputValue(), fim: '', horas: '', observacao: '' });
        alert('Status registrado no calendário com sucesso!');
      }
      await fetchData();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Não foi possível registrar o status.');
    }
  };

  const saveNotice = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await rhApi.createComunicado({ usuario_id: noticeForm.usuario_id ? Number(noticeForm.usuario_id) : undefined, titulo: noticeForm.titulo, mensagem: noticeForm.mensagem, inicio: noticeForm.inicio || undefined, fim: noticeForm.fim || undefined });
      setNoticeForm({ usuario_id: '', titulo: '', mensagem: '', inicio: dateInputValue(), fim: '' });
      await fetchData();
    } catch (err: any) { alert(err.response?.data?.error || 'Não foi possível enviar o comunicado.'); }
  };

  const exportSectorOptions = useMemo(() => {
    const sectors = new Map<string, string>();
    control?.colaboradores.forEach(({ usuario }) => {
      sectors.set(String(usuario.departamento_id ?? 'sem-setor'), usuario.departamento?.nome || 'Sem setor');
    });
    return Array.from(sectors.entries()).map(([id, name]) => ({ id, name }));
  }, [control]);

  const getSectorManagerName = (sectorKey: string, users: User[]) => {
    if (!isRHAdmin) return currentUser?.nome || 'Gestor não informado';
    const numericSectorId = Number(sectorKey);
    if (!Number.isNaN(numericSectorId)) {
      const sector = hierarchy?.setores.find(item => item.id === numericSectorId);
      const manager = hierarchy?.usuarios.find(item => item.id === sector?.responsavel_id);
      if (manager?.nome) return manager.nome;
    }
    const managerFromUsers = users.find(item => item.gestor?.nome)?.gestor?.nome;
    return managerFromUsers || 'Gestor não definido';
  };

  const exportControl = async () => {
    if (!control) return;
    try {
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const now = new Date();
      const scopeLabel = isRHAdmin ? 'Portal RH' : 'Equipe do gestor';
      const period = exportPeriodRange(exportPeriod, exportReference);
      const selected = exportSector
        ? control.colaboradores.filter(({ usuario }) => String(usuario.departamento_id ?? 'sem-setor') === exportSector)
        : control.colaboradores;
      if (selected.length === 0) {
        alert('Nenhum colaborador encontrado para exportar.');
        return;
      }
      const grouped = selected.reduce((acc, item) => {
        const key = String(item.usuario.departamento_id ?? 'sem-setor');
        if (!acc.has(key)) acc.set(key, []);
        acc.get(key)!.push(item);
        return acc;
      }, new Map<string, typeof selected>());

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(15);
      doc.text('Relatório do Portal RH', 14, 16);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(`${scopeLabel} - ${exportPeriod === 'week' ? 'Semana' : 'Mês'}: ${period.label} - gerado em ${now.toLocaleString('pt-BR')}`, 14, 22);

      let startY = 34;
      Array.from(grouped.entries())
        .sort(([, a], [, b]) => (a[0]?.usuario.departamento?.nome || 'Sem setor').localeCompare(b[0]?.usuario.departamento?.nome || 'Sem setor'))
        .forEach(([sectorKey, items], index) => {
          if (index > 0 && startY > 150) {
            doc.addPage();
            startY = 18;
          }
          const sectorName = items[0]?.usuario.departamento?.nome || 'Sem setor';
          const managerName = getSectorManagerName(sectorKey, items.map(item => item.usuario));
          const selectedUserIds = new Set(items.map(item => item.usuario.id));
          const periodRecords = control.status
            .filter(record => selectedUserIds.has(record.usuario_id) && overlapsPeriod(record, period.start, period.end))
            .sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime());
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(11);
          doc.text(`Setor: ${sectorName}`, 14, startY);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(9);
          doc.text(`Gestor: ${managerName}`, 14, startY + 5);

          autoTable(doc, {
            startY: startY + 10,
            head: [['Colaborador', 'Setor', 'Cargo', 'Status atual', 'Banco de horas']],
            body: items.map(({ usuario, status_atual, horas }) => {
              return [
                usuario.nome,
                usuario.departamento?.nome || 'Sem setor',
                usuario.cargo || '-',
                employeeStatus[status_atual]?.label || status_atual,
                status_atual === 'banco_horas' && horas ? `${horas}h` : '-',
              ];
            }),
            styles: { fontSize: 8, cellPadding: 2 },
            headStyles: { fillColor: [12, 102, 228], textColor: 255 },
            columnStyles: {
              0: { cellWidth: 58 },
              1: { cellWidth: 42 },
              2: { cellWidth: 48 },
              3: { cellWidth: 34 },
              4: { cellWidth: 30 },
            },
          });

          startY = ((doc as any).lastAutoTable?.finalY || startY + 32) + 8;
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9);
          doc.text('Programação do período', 14, startY);

          autoTable(doc, {
            startY: startY + 4,
            head: [['Colaborador', 'Status programado', 'Início', 'Fim', 'Horas', 'Observação', 'Registrado por']],
            body: periodRecords.length > 0
              ? periodRecords.map(record => [
                  record.usuario?.nome || items.find(item => item.usuario.id === record.usuario_id)?.usuario.nome || 'Colaborador',
                  employeeStatus[record.tipo]?.label || record.tipo,
                  formatDate(record.inicio),
                  formatDate(record.fim),
                  record.horas ? `${record.horas}h` : '-',
                  record.observacao || '-',
                  record.criado_por?.nome || '-',
                ])
              : [['Sem programação registrada no período', '-', '-', '-', '-', '-', '-']],
            styles: { fontSize: 8, cellPadding: 2 },
            headStyles: { fillColor: [15, 23, 42], textColor: 255 },
            columnStyles: {
              0: { cellWidth: 48 },
              1: { cellWidth: 34 },
              2: { cellWidth: 24 },
              3: { cellWidth: 24 },
              4: { cellWidth: 18 },
              5: { cellWidth: 76 },
              6: { cellWidth: 36 },
            },
          });
          startY = ((doc as any).lastAutoTable?.finalY || startY + 32) + 14;
        });

      doc.save(`portal_rh_${now.toISOString().slice(0, 10)}.pdf`);
    } catch { alert('Não foi possível exportar o relatório em PDF.'); }
  };

  const toggleMonitoringVisibility = async (userId: number, current: boolean) => {
    try {
      await rhApi.updateMonitoringVisibility(userId, !current);
      await fetchData();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Não foi possível atualizar a exibição na sala de monitoramento.');
    }
  };

  const openCreate = async (solicitacao: Solicitacao) => {
    setEditing(null);
    setSolId(solicitacao.id);
    try {
      const tpl = await rhApi.generateTemplate(solicitacao.id);
      setConteudo(tpl.conteudo_termo);
    } catch {
      setConteudo('');
    }
    setModal(true);
  };

  const openEdit = (termo: TermoResponsabilidade) => {
    setEditing(termo);
    setSolId(null);
    setConteudo(termo.conteudo_termo);
    setModal(true);
  };

  const save = async () => {
    if (!conteudo.trim()) return;
    setSaving(true);
    try {
      if (editing) {
        await rhApi.update(editing.id, conteudo);
      } else {
        await rhApi.create({ solicitacao_id: solId ?? undefined, conteudo_termo: conteudo });
      }
      setModal(false);
      await fetchData();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const generatePdfFrontend = (termo: TermoResponsabilidade) => {
    try {
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.text('Termo de Responsabilidade', 105, 20, { align: 'center' });

      doc.setFont('courier', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(100, 100, 100);
      doc.text('NBAPARK // CONTROLE INTERNO DE ATIVOS DE TI', 105, 26, { align: 'center' });

      doc.setDrawColor(0);
      doc.setLineWidth(0.5);
      doc.line(20, 30, 190, 30);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      doc.setTextColor(17, 17, 17);

      const splitText = doc.splitTextToSize(termo.conteudo_termo, 170);
      doc.text(splitText, 20, 40);

      doc.setFont('courier', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(120, 120, 120);
      doc.setDrawColor(200);
      doc.line(20, 270, 190, 270);
      const dateStr = new Date().toLocaleString('pt-BR');
      const nome = termo.usuario?.nome || '-';
      const pat = termo.asset?.e_patrimonio || '-';
      doc.text(`Documento gerado eletronicamente em ${dateStr} pelo módulo RH Audit Workflow.`, 20, 275);
      doc.text(`Identificador do Termo: #${termo.id} · Ref: Patrimônio ${pat}`, 20, 280);

      doc.save(`termo_${termo.id}_${nome.replace(/\\s+/g, '_')}.pdf`);
    } catch (err) {
      console.error(err);
      alert('Erro ao gerar PDF no navegador.');
    }
  };

  const action = async (fn: () => Promise<unknown>, confirmMsg?: string) => {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    try {
      await fn();
      await fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) {
    return <div className="text-brand-muted font-mono text-sm">Carregando...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-8">
      <section className="relative overflow-hidden rounded-2xl border border-brand-border bg-brand-card shadow-sm">
        <div className="absolute inset-0 bg-gradient-to-r from-brand-dark via-brand-dark to-brand-primary opacity-95" />
        <div className="absolute -right-12 -top-20 h-64 w-64 rounded-full bg-white/10" />
        <div className="relative flex flex-col gap-5 p-6 text-white sm:flex-row sm:items-end sm:justify-between sm:p-8">
          <div><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/70"><LayoutDashboard size={15} /> Gestão de pessoas</div><h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Portal RH</h1><p className="mt-2 max-w-xl text-sm leading-relaxed text-white/80">Acompanhe a disponibilidade da equipe, mantenha o calendário atualizado e centralize as comunicações internas.</p></div>
          <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:min-w-64">
            <select value={exportSector} onChange={e => setExportSector(e.target.value)} className="rounded-xl border border-white/25 bg-white/95 px-3 py-2 text-xs font-semibold text-brand-text shadow-sm focus:outline-none focus:ring-2 focus:ring-white/60">
              <option value="">Todos os setores</option>
              {exportSectorOptions.map(sector => <option key={sector.id} value={sector.id}>{sector.name}</option>)}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <select value={exportPeriod} onChange={e => setExportPeriod(e.target.value as 'week' | 'month')} className="rounded-xl border border-white/25 bg-white/95 px-3 py-2 text-xs font-semibold text-brand-text shadow-sm focus:outline-none focus:ring-2 focus:ring-white/60">
                <option value="week">Semana</option>
                <option value="month">Mês inteiro</option>
              </select>
              <input type="date" value={exportReference} onChange={e => setExportReference(e.target.value)} className="rounded-xl border border-white/25 bg-white/95 px-3 py-2 text-xs font-semibold text-brand-text shadow-sm focus:outline-none focus:ring-2 focus:ring-white/60" title="Data de referência do relatório" />
            </div>
            <button type="button" onClick={exportControl} className="inline-flex items-center justify-center rounded-xl bg-white px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-brand-primary shadow-sm hover:bg-blue-50"><Download size={15} className="mr-2" />Exportar PDF</button>
          </div>
        </div>
      </section>

      {/* Controle de disponibilidade — refreshed every 30 seconds */}
      {control && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            {(Object.keys(employeeStatus) as RHStatusType[]).map((type) => {
              const meta = employeeStatus[type];
              const count = control.colaboradores.filter(c => c.status_atual === type).length;
              return <div key={type} className="border border-brand-border bg-brand-card p-4">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-brand-muted">{meta.label}</div>
                <div className={`mt-1 text-3xl font-bold tracking-tight ${meta.className.split(' ')[1]}`}>{count}</div>
              </div>;
            })}
          </div>

          {isRHAdmin && hierarchy && <section className="border border-brand-border bg-brand-card p-5 space-y-4">
            <div className="flex items-start gap-3"><div className="rounded-xl bg-brand-primary/10 p-2 text-brand-primary"><Network size={18} /></div><div><h2 className="text-base font-bold text-brand-text">Hierarquia por setor</h2><p className="mt-0.5 text-xs text-brand-muted">Defina o gestor e os subordinados que ele poderá acompanhar no Portal RH.</p></div></div>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              <select value={hierarchySector} onChange={e => setHierarchySector(e.target.value)} className="bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text"><option value="">Selecione o setor</option>{hierarchy.setores.map(setor => <option key={setor.id} value={setor.id}>{setor.nome}</option>)}</select>
              <select value={hierarchyManager} onChange={e => setHierarchyManager(e.target.value)} className="bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text"><option value="">Sem gestor atribuído</option>{hierarchy.usuarios.filter(item => item.is_active && item.role !== 'admin').map(item => <option key={item.id} value={item.id}>{item.nome} · {item.departamento?.nome || 'Sem setor'}</option>)}</select>
              <button type="button" onClick={saveHierarchy} className="inline-flex items-center justify-center gap-2 bg-brand-primary px-4 py-2 text-xs font-bold uppercase tracking-wide text-brand-dark"><CheckCircle2 size={15} />Salvar hierarquia</button>
            </div>
            <div className="relative"><Search size={15} className="absolute left-3 top-2.5 text-brand-muted" /><input value={hierarchySearch} onChange={e => setHierarchySearch(e.target.value)} placeholder="Buscar subordinado por nome ou setor" className="w-full bg-brand-dark border border-brand-border py-2 pl-9 pr-3 text-sm text-brand-text" /></div>
            <div className="grid max-h-56 grid-cols-1 gap-2 overflow-y-auto md:grid-cols-2">
              {hierarchy.usuarios.filter(item => item.is_active && item.id !== Number(hierarchyManager) && (String(item.departamento_id) === hierarchySector || item.gestor_id === Number(hierarchyManager)) && `${item.nome} ${item.departamento?.nome || ''}`.toLowerCase().includes(hierarchySearch.toLowerCase())).map(item => <label key={item.id} className="flex cursor-pointer items-center gap-3 border border-brand-border/70 px-3 py-2 text-sm text-brand-text"><input type="checkbox" checked={hierarchyMembers.includes(item.id)} onChange={e => setHierarchyMembers(current => e.target.checked ? [...new Set([...current, item.id])] : current.filter(id => id !== item.id))} /> <span>{item.nome}</span><span className="ml-auto text-[10px] text-brand-muted">{item.departamento?.nome || 'Sem setor'}</span></label>)}
            </div>
          </section>}

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <form onSubmit={saveStatus} className="border border-brand-border bg-brand-card p-5 space-y-4">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-brand-primary/10 p-2 text-brand-primary">
                  <ClipboardPlus size={18} />
                </div>
                <div>
                  <div className="text-base font-bold text-brand-text">Registrar status</div>
                  <p className="mt-0.5 text-xs text-brand-muted">
                    {isRHAdmin ? 'Inclua uma mudança de agenda no calendário do colaborador.' : 'Controle folgas, férias e banco de horas somente da sua equipe configurada.'}
                  </p>
                </div>
              </div>

              {/* Filtros: Setor e Busca por texto */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-brand-dark/30 border border-brand-border/60 rounded-lg">
                <div>
                  <label className="block text-[10px] font-mono uppercase text-brand-muted mb-1 flex items-center gap-1">
                    <Filter size={12} /> Filtrar por setor
                  </label>
                  <select
                    value={statusSector}
                    onChange={e => setStatusSector(e.target.value)}
                    className="w-full bg-brand-dark border border-brand-border px-3 py-1.5 text-xs text-brand-text rounded focus:outline-none focus:border-brand-primary"
                  >
                    <option value="">Todos os setores ({control.colaboradores.filter(c => c.usuario.is_active).length})</option>
                    {statusSectorOptions.map(sector => (
                      <option key={sector.id} value={sector.id}>{sector.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-mono uppercase text-brand-muted mb-1 flex items-center gap-1">
                    <Search size={12} /> Buscar colaborador
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Nome, matrícula, cargo..."
                      value={statusUserSearch}
                      onChange={e => setStatusUserSearch(e.target.value)}
                      className="w-full bg-brand-dark border border-brand-border py-1.5 pl-3 pr-7 text-xs text-brand-text rounded focus:outline-none focus:border-brand-primary"
                    />
                    {statusUserSearch && (
                      <button
                        type="button"
                        onClick={() => setStatusUserSearch('')}
                        className="absolute right-2 top-2 text-brand-muted hover:text-brand-text"
                        title="Limpar busca"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Seleção do colaborador */}
              <div>
                <label className="block text-[11px] font-mono uppercase text-brand-muted mb-1">
                  Colaborador <span className="text-red-400">*</span>
                  <span className="ml-1 text-[10px] text-brand-muted">
                    ({statusFilteredCollaborators.length} {statusFilteredCollaborators.length === 1 ? 'disponível' : 'disponíveis'})
                  </span>
                </label>
                <select
                  required
                  value={statusForm.usuario_id}
                  onChange={e => setStatusForm({ ...statusForm, usuario_id: e.target.value })}
                  className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text rounded focus:outline-none focus:border-brand-primary"
                >
                  <option value="">Selecione o colaborador...</option>
                  {statusFilteredCollaborators.map(c => (
                    <option key={c.usuario.id} value={c.usuario.id}>
                      {c.usuario.nome} {c.usuario.departamento?.nome ? `— ${c.usuario.departamento.nome}` : ''} {c.usuario.matricula ? `[Matrícula: ${c.usuario.matricula}]` : ''}
                    </option>
                  ))}
                </select>
                {statusFilteredCollaborators.length === 0 && (
                  <p className="mt-1 text-xs text-amber-500/90 font-mono m-0">Nenhum colaborador encontrado com os filtros aplicados.</p>
                )}
              </div>

              {/* Tipo de status e Modo de data */}
              <div className="space-y-3 border-t border-brand-border pt-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] font-mono uppercase text-brand-muted">Modo de seleção de datas:</span>
                  <div className="flex items-center gap-1.5 bg-brand-dark/50 p-1 border border-brand-border rounded">
                    <button
                      type="button"
                      onClick={() => setStatusDateMode('range')}
                      className={`px-2.5 py-1 text-[11px] font-mono uppercase rounded transition-colors ${statusDateMode === 'range' ? 'bg-brand-primary text-brand-dark font-bold' : 'text-brand-muted hover:text-brand-text'}`}
                    >
                      Período (De / Até)
                    </button>
                    <button
                      type="button"
                      onClick={() => setStatusDateMode('multiple')}
                      className={`px-2.5 py-1 text-[11px] font-mono uppercase rounded transition-colors ${statusDateMode === 'multiple' ? 'bg-brand-primary text-brand-dark font-bold' : 'text-brand-muted hover:text-brand-text'}`}
                    >
                      Múltiplas datas
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-mono uppercase text-brand-muted mb-1">Status</label>
                    <select
                      value={statusForm.tipo}
                      onChange={e => setStatusForm({ ...statusForm, tipo: e.target.value })}
                      className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text rounded"
                    >
                      <option value="trabalhando">Trabalhando</option>
                      <option value="folga">Folga</option>
                      <option value="ferias">Férias</option>
                      <option value="banco_horas">Banco de horas</option>
                    </select>
                  </div>

                  {statusDateMode === 'range' ? (
                    <>
                      <div>
                        <label className="block text-[10px] font-mono uppercase text-brand-muted mb-1">Início <span className="text-red-400">*</span></label>
                        <input
                          required
                          type="date"
                          value={statusForm.inicio}
                          onChange={e => setStatusForm({ ...statusForm, inicio: e.target.value })}
                          className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text rounded"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-mono uppercase text-brand-muted mb-1">Fim (opcional)</label>
                        <input
                          type="date"
                          value={statusForm.fim}
                          onChange={e => setStatusForm({ ...statusForm, fim: e.target.value })}
                          className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text rounded"
                          title="Fim (opcional)"
                        />
                      </div>
                    </>
                  ) : (
                    <div className="sm:col-span-2">
                      <label className="block text-[10px] font-mono uppercase text-brand-muted mb-1">Escolher data avulsa</label>
                      <div className="flex gap-2">
                        <input
                          type="date"
                          value={newDateInput}
                          onChange={e => setNewDateInput(e.target.value)}
                          className="flex-1 bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text rounded"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (newDateInput && !selectedDates.includes(newDateInput)) {
                              setSelectedDates([...selectedDates, newDateInput].sort());
                            }
                          }}
                          className="bg-brand-primary text-brand-dark font-bold font-mono px-3 py-2 text-xs uppercase tracking-wider rounded hover:bg-brand-primary/90 shrink-0"
                        >
                          + Incluir dia
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Exibição das múltiplas datas selecionadas */}
                {statusDateMode === 'multiple' && (
                  <div className="p-3 bg-brand-dark/40 border border-brand-border/70 rounded-lg space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono uppercase text-brand-muted">
                        Datas selecionadas ({selectedDates.length}):
                      </span>
                      {selectedDates.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setSelectedDates([])}
                          className="text-[11px] text-red-400 hover:underline"
                        >
                          Limpar todas
                        </button>
                      )}
                    </div>
                    {selectedDates.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                        {selectedDates.map(date => (
                          <span
                            key={date}
                            className="inline-flex items-center gap-1.5 bg-brand-primary/15 border border-brand-primary/40 text-brand-primary px-2.5 py-1 text-xs font-mono font-semibold rounded"
                          >
                            <CalendarDays size={12} />
                            {new Date(`${date}T00:00:00`).toLocaleDateString('pt-BR')}
                            <button
                              type="button"
                              onClick={() => setSelectedDates(selectedDates.filter(d => d !== date))}
                              className="text-brand-primary/70 hover:text-red-400 ml-0.5"
                              title="Remover data"
                            >
                              <X size={12} />
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-amber-500/90 font-mono m-0">
                        Escolha uma data no campo acima e clique em "+ Incluir dia" para adicionar cada data individualmente.
                      </p>
                    )}
                  </div>
                )}

                {statusForm.tipo === 'banco_horas' && (
                  <div>
                    <label className="block text-[10px] font-mono uppercase text-brand-muted mb-1">Quantidade de horas</label>
                    <input
                      type="number"
                      step="0.5"
                      placeholder="Quantidade de horas (ex: 4 ou 8)"
                      value={statusForm.horas}
                      onChange={e => setStatusForm({ ...statusForm, horas: e.target.value })}
                      className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text rounded"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-[10px] font-mono uppercase text-brand-muted mb-1">Observação para o histórico (opcional)</label>
                  <input
                    placeholder="Observação para o histórico (opcional)"
                    value={statusForm.observacao}
                    onChange={e => setStatusForm({ ...statusForm, observacao: e.target.value })}
                    className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text rounded"
                  />
                </div>
              </div>

              <button className="bg-brand-primary text-brand-dark font-bold font-mono px-4 py-2.5 uppercase tracking-wider text-xs rounded hover:bg-brand-primary/90">
                {statusDateMode === 'multiple' && selectedDates.length > 0
                  ? `Salvar ${selectedDates.length} data${selectedDates.length > 1 ? 's' : ''} no calendário`
                  : 'Salvar no calendário'}
              </button>
            </form>

            <form onSubmit={saveNotice} className="border border-brand-border bg-brand-card p-5 space-y-4">
              <div className="flex items-start gap-3"><div className="rounded-xl bg-brand-primary/10 p-2 text-brand-primary"><Megaphone size={18} /></div><div><div className="text-base font-bold text-brand-text">Novo comunicado</div><p className="mt-0.5 text-xs text-brand-muted">{isRHAdmin ? 'Envie uma mensagem individual ou para toda a empresa.' : 'Envie comunicado individual ou para todos os subordinados da sua equipe.'}</p></div></div>
              <select value={noticeForm.usuario_id} onChange={e => setNoticeForm({ ...noticeForm, usuario_id: e.target.value })} className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text">
                <option value="">{isRHAdmin ? 'Todos os colaboradores' : 'Todos da minha equipe'}</option>
                {control.colaboradores.filter(c => c.usuario.is_active).map(c => <option key={c.usuario.id} value={c.usuario.id}>{c.usuario.nome}</option>)}
              </select>
              <input required placeholder="Título do comunicado" value={noticeForm.titulo} onChange={e => setNoticeForm({ ...noticeForm, titulo: e.target.value })} className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text" />
              <textarea required placeholder="Mensagem para o colaborador" value={noticeForm.mensagem} onChange={e => setNoticeForm({ ...noticeForm, mensagem: e.target.value })} className="w-full min-h-20 bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text" />
              <div className="grid grid-cols-2 gap-3"><input type="date" value={noticeForm.inicio} onChange={e => setNoticeForm({ ...noticeForm, inicio: e.target.value })} className="bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text" /><input type="date" value={noticeForm.fim} onChange={e => setNoticeForm({ ...noticeForm, fim: e.target.value })} className="bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text" title="Expira em (opcional)" /></div>
              <button className="bg-brand-primary text-brand-dark font-bold font-mono px-4 py-2.5 uppercase tracking-wider text-xs">Enviar comunicado</button>
            </form>
          </div>

          <div className="space-y-3">
            <div className="flex justify-end items-center gap-2"><label className="text-xs font-mono uppercase text-brand-muted">Filtrar calendário por setor</label><select value={calendarSector} onChange={e => setCalendarSector(e.target.value)} className="bg-brand-dark border border-brand-border px-3 py-2 text-xs text-brand-text"><option value="">Todos os setores</option>{Array.from(new Map(control.colaboradores.filter(c => c.usuario.departamento).map(c => [c.usuario.departamento_id, c.usuario.departamento!.nome])).entries()).map(([id, name]) => <option key={String(id)} value={String(id)}>{name}</option>)}</select></div>
            <RHMonthlyCalendar records={control.status} sectorId={calendarSector} />
          </div>

          <div className="border border-brand-border bg-brand-card">
            <div className="p-4 border-b border-brand-border flex items-center gap-2 text-sm font-bold font-mono uppercase tracking-wider text-brand-text"><UsersRound size={16} className="text-brand-primary" /> Status atual da equipe <span className="ml-auto text-[10px] normal-case text-brand-muted font-normal">atualiza automaticamente</span></div>
            <div className="divide-y divide-brand-border/60 max-h-[340px] overflow-y-auto">
              {control.colaboradores.map(({ usuario, status_atual, horas }) => {
                const avatarUrl = toApiFileUrl(usuario.avatar_url);
                return <div key={usuario.id} className="p-3 flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-brand-border bg-brand-dark">
                      {avatarUrl ? <img src={avatarUrl} alt={usuario.nome} className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-xs font-bold text-brand-primary">{usuario.nome.slice(0, 2).toUpperCase()}</div>}
                    </div>
                    <div className="min-w-0">
                      <span className="font-medium text-brand-text">{usuario.nome}</span>
                      <span className="ml-2 text-xs text-brand-muted">{usuario.cargo || 'Cargo não definido'}</span>
                      {status_atual === 'banco_horas' && horas ? <p className="m-0 mt-0.5 text-xs text-amber-700">{horas}h em banco de horas</p> : null}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className={`text-[10px] font-mono uppercase px-2 py-1 border ${employeeStatus[status_atual].className}`}>{employeeStatus[status_atual].label}</span>
                    {isRHAdmin && <button
                      type="button"
                      onClick={() => toggleMonitoringVisibility(usuario.id, !!usuario.show_on_monitoring)}
                      title={usuario.show_on_monitoring ? 'Ocultar na sala de monitoramento' : 'Mostrar na sala de monitoramento'}
                      className={`inline-flex items-center gap-1 border px-2 py-1 text-[10px] font-mono uppercase ${usuario.show_on_monitoring ? 'border-emerald-500/30 text-emerald-600 bg-emerald-500/10' : 'border-brand-border text-brand-muted hover:text-brand-text'}`}
                    >
                      {usuario.show_on_monitoring ? <Eye size={13} /> : <EyeOff size={13} />}
                      {usuario.show_on_monitoring ? 'Na sala' : 'Oculto'}
                    </button>}
                  </div>
                </div>;
              })}
              {control.colaboradores.length === 0 && <div className="p-6 text-center text-sm text-brand-muted">Nenhum subordinado configurado para sua equipe.</div>}
            </div>
          </div>

          {(control.status.length > 0 || control.comunicados.length > 0) && <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="border border-brand-border bg-brand-card"><div className="p-4 border-b border-brand-border flex gap-2 text-sm font-bold font-mono uppercase tracking-wider text-brand-text"><Clock3 size={16} className="text-brand-primary" /> Agenda de RH</div><div className="divide-y divide-brand-border/60 max-h-72 overflow-y-auto">{control.status.slice(0, 20).map(s => <div className="p-3 flex justify-between gap-3" key={s.id}><div><span className="text-brand-text">{s.usuario?.nome || 'Colaborador'}</span><span className="ml-2 text-xs text-brand-muted">{new Date(s.inicio).toLocaleDateString('pt-BR')}{s.fim ? ` até ${new Date(s.fim).toLocaleDateString('pt-BR')}` : ''}</span><p className="text-xs text-brand-muted m-0 mt-1">{s.observacao || (s.horas ? `${s.horas}h registradas` : '')}</p></div><div className="flex gap-2 items-start"><span className={`text-[10px] font-mono uppercase px-2 py-1 border ${employeeStatus[s.tipo].className}`}>{employeeStatus[s.tipo].label}</span><button type="button" title="Remover registro" onClick={() => action(() => rhApi.deleteStatus(s.id), 'Remover este registro de calendário?')} className="text-red-400"><XCircle size={16} /></button></div></div>)}</div></div>
            <div className="border border-brand-border bg-brand-card"><div className="p-4 border-b border-brand-border flex gap-2 text-sm font-bold font-mono uppercase tracking-wider text-brand-text"><MessageSquareText size={16} className="text-brand-primary" /> Comunicados enviados</div><div className="divide-y divide-brand-border/60 max-h-72 overflow-y-auto">{control.comunicados.slice(0, 20).map(n => <div className="p-3 flex justify-between gap-3" key={n.id}><div><span className="text-brand-text">{n.titulo}</span><span className="ml-2 text-xs text-brand-muted">{n.usuario?.nome || 'Todos os colaboradores'}</span><p className="text-xs text-brand-muted m-0 mt-1">{n.mensagem}</p><span className="mt-1 block text-[10px] text-brand-muted">Enviado por {n.criado_por?.nome || 'RH'}</span></div><button type="button" title="Remover comunicado" onClick={() => action(() => rhApi.deleteComunicado(n.id), 'Remover este comunicado?')} className="text-red-400 h-fit"><XCircle size={16} /></button></div>)}</div></div>
          </div>}
        </>
      )}

      {/* Solicitações pendentes de termo */}
      {isRHAdmin && <div className="border border-brand-border bg-brand-card">
        <div className="p-4 border-b border-brand-border text-sm font-bold font-mono uppercase tracking-wider text-brand-text flex items-center">
          <FileSignature size={16} className="mr-2 text-yellow-400" /> Solicitações pendentes de termo
        </div>
        <div className="divide-y divide-brand-border/60">
          {pendentes.map((s) => (
            <div key={s.id} className="p-4 flex justify-between items-center gap-4">
              <div className="min-w-0">
                <span className="font-mono text-xs text-brand-primary">
                  #{s.id} — {s.solicitante?.nome ?? '—'}
                </span>
                <p className="text-sm text-brand-text mt-1 m-0">
                  {s.asset?.nome ?? '—'}{' '}
                  <span className="text-brand-muted font-mono text-xs">({s.asset?.e_patrimonio ?? 'sem patrimônio'})</span>
                </p>
                <span className="text-xs font-mono text-brand-muted">
                  {s.status} · {new Date(s.data_solicitacao).toLocaleDateString('pt-BR')}
                </span>
              </div>
              <button
                onClick={() => openCreate(s)}
                className="shrink-0 bg-brand-primary text-brand-dark font-bold font-mono px-3 py-2 uppercase tracking-wider text-xs flex items-center space-x-1.5"
              >
                <Plus size={14} />
                <span>Gerar Termo</span>
              </button>
            </div>
          ))}
          {pendentes.length === 0 && (
            <div className="p-6 text-center text-brand-muted font-mono text-xs">
              Nenhuma solicitação pendente de termo.
            </div>
          )}
        </div>
      </div>}

      {/* Termos */}
      {isRHAdmin && <div className="border border-brand-border bg-brand-card">
        <div className="p-4 border-b border-brand-border text-sm font-bold font-mono uppercase tracking-wider text-brand-text">
          Termos de Responsabilidade
        </div>
        <div className="divide-y divide-brand-border/60">
          {termos.map((t) => (
            <div key={t.id} className="p-4">
              <div className="flex justify-between items-start gap-4">
                <div className="min-w-0">
                  <div className="flex items-center space-x-2">
                    <span className="font-medium text-brand-text">
                      {t.usuario?.nome ?? '—'} — {t.asset?.nome ?? '—'}
                    </span>
                    <span className={`text-[10px] font-mono uppercase px-1.5 py-0.5 border ${statusStyles[t.status] ?? 'border-brand-border text-brand-muted'}`}>
                      {t.status}
                    </span>
                  </div>
                  <span className="text-xs font-mono text-brand-muted">
                    Termo #{t.id} · criado em {new Date(t.data_geracao).toLocaleDateString('pt-BR')}
                    {t.data_assinatura ? ` · assinado em ${new Date(t.data_assinatura).toLocaleDateString('pt-BR')}` : ''}
                  </span>
                </div>
                <div className="flex space-x-2 shrink-0">
                  <button
                    onClick={() => generatePdfFrontend(t)}
                    title="Imprimir / Gerar PDF"
                    className="text-brand-primary border border-brand-primary/30 px-2 py-1.5"
                  >
                    <Printer size={14} />
                  </button>
                  {t.status === 'Pendente' && (
                    <>
                      <button
                        onClick={() => openEdit(t)}
                        title="Editar conteúdo"
                        className="text-brand-muted border border-brand-border px-2 py-1.5 hover:text-brand-text"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => action(() => rhApi.sign(t.id), `Assinar o termo #${t.id}?`)}
                        title="Assinar"
                        className="text-green-400 border border-green-500/30 px-2 py-1.5"
                      >
                        <CheckCircle2 size={14} />
                      </button>
                    </>
                  )}
                  {t.status !== 'Cancelado' && (
                    <button
                      onClick={() => action(() => rhApi.cancel(t.id), `Cancelar o termo #${t.id}?`)}
                      title="Cancelar"
                      className="text-red-400 border border-red-500/30 px-2 py-1.5"
                    >
                      <XCircle size={14} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
          {termos.length === 0 && (
            <div className="p-6 text-center text-brand-muted font-mono text-xs">Nenhum termo cadastrado.</div>
          )}
        </div>
      </div>}

      {/* Desligamento de Colaborador */}
      {isRHAdmin && <div className="border border-brand-border bg-brand-card">
        <div className="p-4 border-b border-brand-border text-sm font-bold font-mono uppercase tracking-wider text-red-500 flex items-center">
          <UserMinus size={16} className="mr-2" /> Desligamento de Colaborador (Offboarding)
        </div>
        <div className="p-4 bg-brand-dark/50 border-b border-brand-border text-xs text-brand-muted font-mono leading-relaxed">
          Ao desligar um colaborador, o acesso ao sistema será imediatamente revogado. Um <strong>alerta emergencial</strong> será disparado automaticamente para a equipe técnica e administradores, informando os ativos em posse do usuário para que realizem a <strong>solicitação de devolução</strong> utilizando o fluxo padrão de Empréstimos/Inventário.
        </div>
        <div className="divide-y divide-brand-border/60 max-h-[300px] overflow-y-auto">
          {usuarios.map((u) => (
            <div key={u.id} className="p-4 flex justify-between items-center gap-4">
              <div className="min-w-0">
                <span className="font-bold text-brand-text block">{u.nome}</span>
                <span className="font-mono text-xs text-brand-muted block mt-0.5">
                  Matrícula: {u.matricula || 'N/A'} · Cargo: {u.cargo || 'N/A'} · Email: {u.email}
                </span>
              </div>
              <button
                onClick={() => action(() => rhApi.offboardUser(u.id), `Tem certeza que deseja processar o DESLIGAMENTO de ${u.nome}? Os acessos serão revogados e os ativos recolhidos.`)}
                className="shrink-0 text-red-500 border border-red-500/30 font-bold font-mono px-3 py-2 uppercase tracking-wider text-xs hover:bg-red-500/10"
              >
                Desligar
              </button>
            </div>
          ))}
          {usuarios.length === 0 && (
            <div className="p-6 text-center text-brand-muted font-mono text-xs">Nenhum colaborador ativo encontrado.</div>
          )}
        </div>
      </div>}

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-brand-card border border-brand-border w-full max-w-3xl max-h-[90vh] flex flex-col">
            <div className="p-4 border-b border-brand-border flex justify-between items-center">
              <h3 className="text-sm font-bold font-mono uppercase tracking-wider text-brand-text m-0">
                {editing ? `Editar Termo #${editing.id}` : 'Novo Termo de Responsabilidade'}
              </h3>
              <button onClick={() => setModal(false)} className="text-brand-muted hover:text-brand-text font-mono">
                Fechar
              </button>
            </div>
            <div className="p-4 flex-1 overflow-y-auto">
              <textarea
                value={conteudo}
                onChange={(e) => setConteudo(e.target.value)}
                rows={18}
                className="w-full bg-brand-dark border border-brand-border px-3 py-2 text-sm text-brand-text focus:outline-none focus:border-brand-primary/50 font-mono"
              />
            </div>
            <div className="p-4 border-t border-brand-border flex justify-end space-x-3">
              <button
                onClick={() => setModal(false)}
                className="border border-brand-border text-brand-muted px-4 py-2.5 font-mono uppercase tracking-wider text-xs hover:text-brand-text"
              >
                Cancelar
              </button>
              <button
                onClick={save}
                disabled={saving || !conteudo.trim()}
                className="bg-brand-primary text-brand-dark font-bold font-mono px-4 py-2.5 uppercase tracking-wider text-xs disabled:opacity-50"
              >
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
