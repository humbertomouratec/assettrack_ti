// Utilitário central de datas para o AssetTrack TI
// Garante manipulação e exibição consistentes no fuso horário America/Sao_Paulo (UTC-3)

/**
 * Converte string ou Date para objeto Date seguro.
 * Se a string for apenas "YYYY-MM-DD", interpreta como meio-dia UTC
 * ou data pura sem recuar para o dia anterior devido ao UTC-3.
 */
export function parseDate(value?: string | Date | null): Date | null {
  if (!value) return null;
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }

  const str = String(value).trim();
  if (!str) return null;

  // Se for apenas formato data pura "YYYY-MM-DD"
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [year, month, day] = str.split('-').map(Number);
    // Cria usando construtor local para evitar shift de fuso horário
    return new Date(year, month - 1, day, 12, 0, 0);
  }

  const parsed = new Date(str);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Formata apenas a data no padrão brasileiro pt-BR (DD/MM/YYYY).
 * Seguro para datas puras (YYYY-MM-DD) e ISO timestamps.
 */
export function formatDate(value?: string | Date | null): string {
  if (!value) return '—';
  
  // Tratamento direto para strings no formato YYYY-MM-DD para evitar qualquer inconsistência
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    const [year, month, day] = value.trim().split('-');
    return `${day}/${month}/${year}`;
  }

  const d = parseDate(value);
  if (!d) return '—';

  return d.toLocaleDateString('pt-BR');
}

/**
 * Formata data e hora no padrão brasileiro pt-BR (DD/MM/YYYY, HH:mm).
 */
export function formatDateTime(value?: string | Date | null): string {
  if (!value) return '—';
  const d = parseDate(value);
  if (!d) return '—';

  return d.toLocaleString('pt-BR');
}

/**
 * Formata apenas a hora no padrão brasileiro pt-BR (HH:mm ou HH:mm:ss).
 */
export function formatTime(value?: string | Date | null, withSeconds: boolean = false): string {
  if (!value) return '—';
  const d = parseDate(value);
  if (!d) return '—';

  return d.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    ...(withSeconds ? { second: '2-digit' } : {}),
  });
}

/**
 * Extrai a data no formato YYYY-MM-DD para preencher campos <input type="date">.
 * Evita o bug de toISOString() que volta 1 dia ao subtrair o fuso UTC-3.
 */
export function toInputDate(value?: string | Date | null): string {
  if (!value) return '';

  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value.trim())) {
    return value.trim().slice(0, 10);
  }

  const d = parseDate(value);
  if (!d) return '';

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Retorna a data normalizada para início do dia (00:00:00) no fuso local.
 */
export function getLocalDateOnly(value?: string | Date | null): Date | null {
  const d = parseDate(value);
  if (!d) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

