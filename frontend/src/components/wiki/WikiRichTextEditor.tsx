import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Check,
  CheckCircle2,
  Code2,
  Columns,
  Expand,
  ExternalLink,
  Eye,
  FileCode,
  Film,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  Image as ImageIcon,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Loader2,
  Maximize2,
  Minimize2,
  Minus,
  Palette,
  Plus,
  Quote,
  Redo2,
  RemoveFormatting,
  Rows,
  SeparatorHorizontal,
  Shrink,
  Strikethrough,
  Table as TableIcon,
  Trash2,
  Type,
  Underline as UnderlineIcon,
  Undo2,
  Unlink,
  UploadCloud,
  X,
} from 'lucide-react';
import { toApiFileUrl } from '../../api/client';

export interface WikiUploadResponse {
  url: string;
  filename?: string;
  mime_type?: string;
  size_bytes?: number;
}

export interface ActiveMediaUpload {
  id: string;
  fileName: string;
  fileSize: number;
  mediaKind: 'image' | 'video';
  progress: number;
}

export interface WikiRichTextEditorProps {
  value: string;
  onChange: (nextHtml: string) => void;
  uploadEndpoint?: string;
  authToken?: string;
  placeholder?: string;
  disabled?: boolean;
  maxFileSizeBytes?: number;
}

const DEFAULT_MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]);

const ALLOWED_VIDEO_MIME_TYPES = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime', // .mov
]);

const ALLOWED_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.mp4',
  '.webm',
  '.mov',
]);

const FONT_FAMILIES: ReadonlyArray<{ label: string; value: string }> = [
  { label: 'Padrão (Inter / Sans)', value: 'Inter, system-ui, -apple-system, sans-serif' },
  { label: 'Arial / Helvetica', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Verdana / Técnica', value: 'Verdana, Geneva, sans-serif' },
  { label: 'Georgia (Editorial Serif)', value: 'Georgia, Cambria, serif' },
  { label: 'Times New Roman', value: '"Times New Roman", Times, serif' },
  { label: 'Monospace (Código / Terminal)', value: '"JetBrains Mono", "Fira Code", monospace' },
];

const FONT_SIZES: ReadonlyArray<{ label: string; value: string }> = [
  { label: '12px (Pequeno)', value: '12px' },
  { label: '14px (Compacto)', value: '14px' },
  { label: '16px (Normal)', value: '16px' },
  { label: '18px (Leitura)', value: '18px' },
  { label: '20px (Subtítulo)', value: '20px' },
  { label: '24px (Título Seção)', value: '24px' },
  { label: '30px (Destaque)', value: '30px' },
  { label: '36px (Manchete)', value: '36px' },
];

const TEXT_COLORS: ReadonlyArray<{ label: string; color: string; swatchClass: string }> = [
  { label: 'Padrão', color: 'inherit', swatchClass: 'bg-slate-900 dark:bg-slate-100' },
  { label: 'Azul Técnico', color: '#2563eb', swatchClass: 'bg-blue-600' },
  { label: 'Verde Operacional', color: '#059669', swatchClass: 'bg-emerald-600' },
  { label: 'Âmbar Alerta', color: '#d97706', swatchClass: 'bg-amber-600' },
  { label: 'Vermelho Crítico', color: '#dc2626', swatchClass: 'bg-red-600' },
  { label: 'Cinza Secundário', color: '#475569', swatchClass: 'bg-slate-600' },
];

const HIGHLIGHT_COLORS: ReadonlyArray<{ label: string; color: string; swatchClass: string }> = [
  { label: 'Sem fundo', color: 'transparent', swatchClass: 'bg-white border border-slate-300' },
  { label: 'Amarelo Nota', color: '#fef08a', swatchClass: 'bg-yellow-200' },
  { label: 'Azul Info', color: '#dbeafe', swatchClass: 'bg-blue-200' },
  { label: 'Verde OK', color: '#d1fae5', swatchClass: 'bg-emerald-200' },
  { label: 'Rosa Urgente', color: '#fee2e2', swatchClass: 'bg-red-200' },
];

function getFileExtension(fileName: string): string {
  const dotIdx = fileName.lastIndexOf('.');
  if (dotIdx === -1) return '';
  return fileName.slice(dotIdx).toLowerCase();
}

function classifyMediaFile(
  file: File,
  maxBytes: number
): { valid: true; kind: 'image' | 'video' } | { valid: false; reason: string } {
  if (file.size <= 0) {
    return { valid: false, reason: `O arquivo "${file.name}" está vazio.` };
  }

  if (file.size > maxBytes) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    const maxMb = (maxBytes / (1024 * 1024)).toFixed(0);
    return {
      valid: false,
      reason: `O arquivo "${file.name}" (${sizeMb} MB) excede o limite máximo de ${maxMb} MB.`,
    };
  }

  const ext = getFileExtension(file.name);
  const mime = file.type.toLowerCase();

  const isAllowedImage =
    ALLOWED_IMAGE_MIME_TYPES.has(mime) ||
    ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext);

  if (isAllowedImage && (ALLOWED_EXTENSIONS.has(ext) || ext === '')) {
    return { valid: true, kind: 'image' };
  }

  const isAllowedVideo =
    ALLOWED_VIDEO_MIME_TYPES.has(mime) || ['.mp4', '.webm', '.mov'].includes(ext);

  if (isAllowedVideo && (ALLOWED_EXTENSIONS.has(ext) || ext === '')) {
    return { valid: true, kind: 'video' };
  }

  return {
    valid: false,
    reason: `Formato não suportado para "${file.name}". Use imagens (.jpg, .png, .gif, .webp) ou vídeos (.mp4, .webm, .mov).`,
  };
}

function escapeHtmlAttribute(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildMediaHtmlSnippet(url: string, fileName: string, kind: 'image' | 'video'): string {
  const resolvedUrl = toApiFileUrl(url) || url;
  const safeUrl = escapeHtmlAttribute(resolvedUrl);
  const safeName = escapeHtmlAttribute(fileName);

  if (kind === 'video') {
    return `\n<figure class="wiki-media-figure my-4"><video controls preload="metadata" src="${safeUrl}" style="width: 100%; max-width: 100%; height: auto;" class="rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-950"></video><figcaption class="text-xs font-mono text-slate-500 mt-1">${safeName}</figcaption></figure><p><br/></p>\n`;
  }

  return `\n<figure class="wiki-media-figure my-4"><img src="${safeUrl}" alt="${safeName}" loading="lazy" style="width: 75%; max-width: 100%; height: auto;" class="rounded-lg border border-slate-300 dark:border-slate-700" /><figcaption class="text-xs font-mono text-slate-500 mt-1">${safeName}</figcaption></figure><p><br/></p>\n`;
}

/**
 * Strips any temporary editor UI artifacts (such as `data-wiki-selected="true"` or leftover
 * inline `outline` styles) and unsafe script/event attributes from the HTML string before emitting
 * it to the parent form/database.
 */
export function sanitizeEditorOutputHtml(rawHtml: string): string {
  if (!rawHtml) return '';
  return rawHtml
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<(iframe|object|embed)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s*data-wiki-selected="[^"]*"/gi, '')
    .replace(/outline:\s*2px\s+solid\s+#2563eb;?\s*/gi, '')
    .replace(/outline-offset:\s*2px;?\s*/gi, '');
}

export const WikiRichTextEditor: React.FC<WikiRichTextEditorProps> = ({
  value,
  onChange,
  uploadEndpoint = '/api/v1/wiki/upload',
  authToken,
  placeholder = 'Selecione qualquer trecho de texto para formatar (Negrito, Itálico, Sublinhado, Fonte, Tamanho, Tabelas) ou arraste imagens/vídeos...',
  disabled = false,
  maxFileSizeBytes = DEFAULT_MAX_FILE_SIZE_BYTES,
}) => {
  const editorHeadingId = useId();
  const fileInputId = useId();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editableRef = useRef<HTMLDivElement | null>(null);
  const filePickerRef = useRef<HTMLInputElement | null>(null);
  const savedRangeRef = useRef<Range | null>(null);

  const [viewMode, setViewMode] = useState<'visual' | 'source'>('visual');
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);
  const [activeUploads, setActiveUploads] = useState<ActiveMediaUpload[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [lastUploadedUrl, setLastUploadedUrl] = useState<string | null>(null);

  // Active formatting states for current selection
  const [activeStyles, setActiveStyles] = useState({
    bold: false,
    italic: false,
    underline: false,
    strikeThrough: false,
    unorderedList: false,
    orderedList: false,
    alignLeft: true,
    alignCenter: false,
    alignRight: false,
    alignJustify: false,
  });
  const [selectedFontFamily, setSelectedFontFamily] = useState<string>(FONT_FAMILIES[0].value);
  const [selectedFontSize, setSelectedFontSize] = useState<string>('16px');

  // Floating Bubble Menu when text is selected
  const [bubbleMenu, setBubbleMenu] = useState<{
    visible: boolean;
    top: number;
    left: number;
    selectedText: string;
  }>({ visible: false, top: 0, left: 0, selectedText: '' });

  // Popover menus (Table Grid Picker, Color Picker, Link Popover)
  const [showTablePicker, setShowTablePicker] = useState<boolean>(false);
  const [hoverTableGrid, setHoverTableGrid] = useState<{ rows: number; cols: number }>({
    rows: 3,
    cols: 3,
  });
  const [customTableRows, setCustomTableRows] = useState<number>(3);
  const [customTableCols, setCustomTableCols] = useState<number>(3);
  const [tableWithHeader, setTableWithHeader] = useState<boolean>(true);
  const [showColorMenu, setShowColorMenu] = useState<boolean>(false);

  // Inline Link Popover State (replaces blocking window.prompt)
  const [showLinkPopover, setShowLinkPopover] = useState<boolean>(false);
  const [linkUrlInput, setLinkUrlInput] = useState<string>('https://');
  const [linkTextInput, setLinkTextInput] = useState<string>('');
  const [activeAnchorEl, setActiveAnchorEl] = useState<HTMLAnchorElement | null>(null);

  // Active Table cell detection (for contextual table row/column controls)
  const [activeTableCell, setActiveTableCell] = useState<HTMLTableCellElement | null>(null);

  // Active Media (`<img>` or `<video>`) selection & resizing
  const [selectedMediaEl, setSelectedMediaEl] = useState<HTMLElement | null>(null);
  const [mediaWidthPercent, setMediaWidthPercent] = useState<number>(75);
  const [mediaPixelDims, setMediaPixelDims] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });
  const isResizingMediaRef = useRef<boolean>(false);
  const resizeStartRef = useRef<{ startX: number; startWidth: number; containerWidth: number }>({
    startX: 0,
    startWidth: 0,
    containerWidth: 1,
  });

  // Word & character counter for technical footer
  const textMetrics = useMemo(() => {
    const plain = value
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const chars = plain.length;
    const words = chars === 0 ? 0 : plain.split(/\s+/).length;
    const readMin = Math.max(1, Math.ceil(words / 200));
    return { words, chars, readMin };
  }, [value]);

  const emitHtmlChange = useCallback(() => {
    const node = editableRef.current;
    if (!node) return;
    onChange(sanitizeEditorOutputHtml(node.innerHTML));
  }, [onChange]);

  const syncVisualEditorIfNeeded = useCallback((nextHtml: string) => {
    const node = editableRef.current;
    if (!node) return;
    const cleaned = sanitizeEditorOutputHtml(nextHtml);
    if (sanitizeEditorOutputHtml(node.innerHTML) !== cleaned) {
      node.innerHTML = cleaned;
    }
  }, []);

  // Sync external `value` changes (e.g. switching between articles or starting new article)
  useEffect(() => {
    const node = editableRef.current;
    if (!node || viewMode !== 'visual') return;
    if (document.activeElement !== node) {
      const cleaned = sanitizeEditorOutputHtml(value);
      if (sanitizeEditorOutputHtml(node.innerHTML) !== cleaned) {
        node.innerHTML = cleaned;
      }
    }
  }, [value, viewMode]);

  // Save current user selection inside the editor so toolbar clicks never lose selection
  const saveCurrentSelection = useCallback(() => {
    const editor = editableRef.current;
    const sel = window.getSelection();
    if (!editor || !sel || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) {
      return;
    }

    savedRangeRef.current = range.cloneRange();

    // Query active command states
    try {
      setActiveStyles({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
        strikeThrough: document.queryCommandState('strikeThrough'),
        unorderedList: document.queryCommandState('insertUnorderedList'),
        orderedList: document.queryCommandState('insertOrderedList'),
        alignLeft: document.queryCommandState('justifyLeft'),
        alignCenter: document.queryCommandState('justifyCenter'),
        alignRight: document.queryCommandState('justifyRight'),
        alignJustify: document.queryCommandState('justifyFull'),
      });
    } catch {
      // Ignore queryCommandState errors
    }

    // Check if cursor is inside a table cell or an anchor link
    let curr: Node | null = range.startContainer;
    let foundCell: HTMLTableCellElement | null = null;
    let foundAnchor: HTMLAnchorElement | null = null;
    while (curr && curr !== editor) {
      if (curr.nodeType === Node.ELEMENT_NODE) {
        const tag = (curr as HTMLElement).tagName;
        if (!foundCell && (tag === 'TD' || tag === 'TH')) {
          foundCell = curr as HTMLTableCellElement;
        }
        if (!foundAnchor && tag === 'A') {
          foundAnchor = curr as HTMLAnchorElement;
        }
      }
      curr = curr.parentNode;
    }
    setActiveTableCell(foundCell);
    setActiveAnchorEl(foundAnchor);

    // Inspect computed font size / family at cursor
    const anchorEl =
      range.startContainer.nodeType === Node.ELEMENT_NODE
        ? (range.startContainer as HTMLElement)
        : range.startContainer.parentElement;
    if (anchorEl && editor.contains(anchorEl)) {
      const computed = window.getComputedStyle(anchorEl);
      if (computed.fontSize) {
        const matchedSize = FONT_SIZES.find((s) => s.value === computed.fontSize);
        if (matchedSize) {
          setSelectedFontSize(matchedSize.value);
        }
      }
    }

    // Show floating Bubble Menu if non-empty text is selected
    const selectedText = sel.toString().trim();
    if (!range.collapsed && selectedText.length > 0) {
      const rect = range.getBoundingClientRect();
      const editorRect = editor.getBoundingClientRect();
      const top = Math.max(8, rect.top - editorRect.top + editor.scrollTop - 48);
      const left = Math.min(
        Math.max(12, rect.left - editorRect.left + rect.width / 2 - 160),
        Math.max(12, editorRect.width - 340)
      );
      setBubbleMenu({
        visible: true,
        top,
        left,
        selectedText,
      });
    } else {
      setBubbleMenu((prev) => (prev.visible ? { ...prev, visible: false } : prev));
    }
  }, []);

  const restoreSavedSelection = useCallback((): Range | null => {
    const editor = editableRef.current;
    if (!editor) return null;
    editor.focus();

    const sel = window.getSelection();
    if (!sel) return null;

    if (savedRangeRef.current && editor.contains(savedRangeRef.current.commonAncestorContainer)) {
      sel.removeAllRanges();
      sel.addRange(savedRangeRef.current);
      return savedRangeRef.current;
    }

    if (sel.rangeCount > 0 && editor.contains(sel.getRangeAt(0).commonAncestorContainer)) {
      return sel.getRangeAt(0);
    }

    // Fallback: place cursor at the end of editor
    const fallbackRange = document.createRange();
    fallbackRange.selectNodeContents(editor);
    fallbackRange.collapse(false);
    sel.removeAllRanges();
    sel.addRange(fallbackRange);
    savedRangeRef.current = fallbackRange.cloneRange();
    return fallbackRange;
  }, []);

  // Close popovers on outside click or Escape key
  useEffect(() => {
    const handleOutsideMouseDown = (event: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) {
        setShowColorMenu(false);
        setShowTablePicker(false);
        setShowLinkPopover(false);
        setBubbleMenu((prev) => (prev.visible ? { ...prev, visible: false } : prev));
      }
    };

    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowColorMenu(false);
        setShowTablePicker(false);
        setShowLinkPopover(false);
        setBubbleMenu((prev) => (prev.visible ? { ...prev, visible: false } : prev));
        if (selectedMediaEl) {
          selectedMediaEl.removeAttribute('data-wiki-selected');
          setSelectedMediaEl(null);
        }
      }
    };

    document.addEventListener('mousedown', handleOutsideMouseDown);
    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutsideMouseDown);
      document.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [selectedMediaEl]);

  // Execute standard rich-text command on the active selection
  const runCommand = useCallback(
    (command: string, commandValue?: string) => {
      if (disabled || viewMode === 'source') return;

      restoreSavedSelection();
      document.execCommand('styleWithCSS', false, 'true');
      document.execCommand(command, false, commandValue);
      saveCurrentSelection();
      emitHtmlChange();
    },
    [disabled, emitHtmlChange, restoreSavedSelection, saveCurrentSelection, viewMode]
  );

  // Apply exact CSS style (font-size, font-family, color, highlight) safely across single or multi-block selections
  const applyInlineStyleToSelection = useCallback(
    (styles: Partial<CSSStyleDeclaration>) => {
      if (disabled || viewMode !== 'visual') return;

      const editor = editableRef.current;
      const range = restoreSavedSelection();
      if (!editor || !range) return;

      const sel = window.getSelection();
      if (!sel) return;

      if (range.collapsed) {
        // If cursor is inside an existing styled span, update it in place instead of nesting
        const parentEl =
          range.startContainer.nodeType === Node.ELEMENT_NODE
            ? (range.startContainer as HTMLElement)
            : range.startContainer.parentElement;

        if (parentEl && parentEl !== editor && parentEl.tagName === 'SPAN' && parentEl.textContent?.length === 0) {
          Object.assign(parentEl.style, styles);
        } else {
          const span = document.createElement('span');
          Object.assign(span.style, styles);
          span.innerHTML = '&#8203;';
          range.insertNode(span);

          const nextRange = document.createRange();
          nextRange.setStart(span.firstChild || span, 1);
          nextRange.collapse(true);
          sel.removeAllRanges();
          sel.addRange(nextRange);
          savedRangeRef.current = nextRange.cloneRange();
        }
      } else {
        // If the entire selection is already inside a single <span> with identical text, update its style directly
        const commonEl =
          range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
            ? (range.commonAncestorContainer as HTMLElement)
            : range.commonAncestorContainer.parentElement;

        if (
          commonEl &&
          commonEl !== editor &&
          commonEl.tagName === 'SPAN' &&
          commonEl.textContent === range.toString()
        ) {
          Object.assign(commonEl.style, styles);
          const nextRange = document.createRange();
          nextRange.selectNodeContents(commonEl);
          sel.removeAllRanges();
          sel.addRange(nextRange);
          savedRangeRef.current = nextRange.cloneRange();
        } else {
          const span = document.createElement('span');
          Object.assign(span.style, styles);

          try {
            const contents = range.extractContents();
            // Flatten redundant nested spans for the same style properties inside extracted fragment
            const innerSpans = contents.querySelectorAll('span');
            innerSpans.forEach((inner) => {
              if (styles.fontSize) inner.style.fontSize = '';
              if (styles.fontFamily) inner.style.fontFamily = '';
              if (styles.color) inner.style.color = '';
              if (styles.backgroundColor) inner.style.backgroundColor = '';
              if (!inner.getAttribute('style')?.trim()) {
                inner.removeAttribute('style');
              }
            });

            span.appendChild(contents);
            range.insertNode(span);

            const nextRange = document.createRange();
            nextRange.selectNodeContents(span);
            sel.removeAllRanges();
            sel.addRange(nextRange);
            savedRangeRef.current = nextRange.cloneRange();
          } catch {
            // Fallback for complex multi-block selections
            if (styles.fontFamily) {
              document.execCommand('fontName', false, styles.fontFamily);
            }
            if (styles.color) {
              document.execCommand('foreColor', false, styles.color);
            }
            if (styles.backgroundColor) {
              document.execCommand('hiliteColor', false, styles.backgroundColor);
            }
          }
        }
      }

      saveCurrentSelection();
      emitHtmlChange();
    },
    [disabled, emitHtmlChange, restoreSavedSelection, saveCurrentSelection, viewMode]
  );

  const handleFontSizeChange = useCallback(
    (nextSize: string) => {
      setSelectedFontSize(nextSize);
      applyInlineStyleToSelection({ fontSize: nextSize, lineHeight: '1.6' });
    },
    [applyInlineStyleToSelection]
  );

  const handleFontFamilyChange = useCallback(
    (nextFamily: string) => {
      setSelectedFontFamily(nextFamily);
      applyInlineStyleToSelection({ fontFamily: nextFamily });
    },
    [applyInlineStyleToSelection]
  );

  const insertHtmlAtCursorOrAppend = useCallback(
    (snippet: string) => {
      if (viewMode === 'visual' && editableRef.current) {
        const range = restoreSavedSelection();
        const sel = window.getSelection();

        if (range && sel) {
          range.deleteContents();
          const tempContainer = document.createElement('div');
          tempContainer.innerHTML = snippet;

          const frag = document.createDocumentFragment();
          let lastNode: Node | null = null;
          while (tempContainer.firstChild) {
            lastNode = frag.appendChild(tempContainer.firstChild);
          }

          range.insertNode(frag);
          if (lastNode) {
            const afterRange = document.createRange();
            afterRange.setStartAfter(lastNode);
            afterRange.collapse(true);
            sel.removeAllRanges();
            sel.addRange(afterRange);
            savedRangeRef.current = afterRange.cloneRange();
          }

          emitHtmlChange();
          return;
        }
      }

      const nextValue = `${value}${snippet}`;
      onChange(sanitizeEditorOutputHtml(nextValue));
      syncVisualEditorIfNeeded(nextValue);
    },
    [emitHtmlChange, onChange, restoreSavedSelection, syncVisualEditorIfNeeded, value, viewMode]
  );

  // Format Block (H1, H2, H3, Paragraph, Blockquote, Codeblock, Callout, Horizontal Rule)
  const applyBlockFormat = useCallback(
    (blockType: 'P' | 'H1' | 'H2' | 'H3' | 'BLOCKQUOTE' | 'CODEBLOCK' | 'CALLOUT' | 'HR') => {
      if (disabled) return;

      const range = restoreSavedSelection();
      const selectedText = range ? range.toString().trim() : '';

      if (blockType === 'HR') {
        insertHtmlAtCursorOrAppend(
          '\n<hr class="my-5 border-t border-slate-300 dark:border-slate-700" /><p><br/></p>\n'
        );
        return;
      }

      if (blockType === 'CODEBLOCK') {
        const codeContent = escapeHtmlAttribute(
          selectedText || '# Digite o comando ou script aqui\nsystemctl status assettrack.service'
        );
        insertHtmlAtCursorOrAppend(
          `\n<pre class="bg-slate-950 text-slate-100 p-4 rounded-lg font-mono text-xs whitespace-pre-wrap break-words max-w-full border border-slate-700 my-3"><code>${codeContent}</code></pre><p><br/></p>\n`
        );
        return;
      }

      if (blockType === 'CALLOUT') {
        const noteText =
          selectedText || 'Descreva o alerta técnico ou requisito obrigatório aqui.';
        insertHtmlAtCursorOrAppend(
          `\n<aside class="my-3 p-3.5 rounded-r-lg border-l-4 border-blue-600 bg-blue-50 dark:bg-blue-950/50 text-slate-800 dark:text-slate-100 text-sm"><strong>NOTA OPERACIONAL:</strong> ${noteText}</aside><p><br/></p>\n`
        );
        return;
      }

      runCommand('formatBlock', `<${blockType}>`);
    },
    [disabled, insertHtmlAtCursorOrAppend, restoreSavedSelection, runCommand]
  );

  // Open Inline Link Popover instead of blocking window.prompt
  const openLinkPopover = useCallback(() => {
    if (disabled || viewMode !== 'visual') return;
    saveCurrentSelection();

    const range = savedRangeRef.current;
    const selectedText = range ? range.toString().trim() : '';

    if (activeAnchorEl) {
      setLinkUrlInput(activeAnchorEl.getAttribute('href') || 'https://');
      setLinkTextInput(activeAnchorEl.textContent || selectedText);
    } else {
      setLinkUrlInput('https://');
      setLinkTextInput(selectedText);
    }

    setShowLinkPopover((prev) => !prev);
    setShowColorMenu(false);
    setShowTablePicker(false);
  }, [activeAnchorEl, disabled, saveCurrentSelection, viewMode]);

  const handleConfirmInsertLink = useCallback(
    (e?: React.FormEvent) => {
      if (e) e.preventDefault();
      if (disabled) return;

      const rawUrl = linkUrlInput.trim();
      if (!rawUrl) {
        setShowLinkPopover(false);
        return;
      }

      const normalizedUrl =
        /^(https?:\/\/|mailto:|tel:|\/|#)/i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
      const safeUrl = escapeHtmlAttribute(normalizedUrl);
      const displayLabel = escapeHtmlAttribute(linkTextInput.trim() || normalizedUrl);

      if (activeAnchorEl && editableRef.current?.contains(activeAnchorEl)) {
        activeAnchorEl.setAttribute('href', normalizedUrl);
        activeAnchorEl.setAttribute('target', '_blank');
        activeAnchorEl.setAttribute('rel', 'noopener noreferrer');
        activeAnchorEl.className = 'text-blue-600 underline hover:text-blue-700';
        if (linkTextInput.trim()) {
          activeAnchorEl.textContent = linkTextInput.trim();
        }
        emitHtmlChange();
      } else {
        insertHtmlAtCursorOrAppend(
          `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="text-blue-600 underline hover:text-blue-700">${displayLabel}</a>`
        );
      }

      setShowLinkPopover(false);
    },
    [activeAnchorEl, disabled, emitHtmlChange, insertHtmlAtCursorOrAppend, linkTextInput, linkUrlInput]
  );

  const handleRemoveLink = useCallback(() => {
    if (activeAnchorEl && editableRef.current?.contains(activeAnchorEl)) {
      const textNode = document.createTextNode(activeAnchorEl.textContent || '');
      activeAnchorEl.replaceWith(textNode);
      setActiveAnchorEl(null);
      setShowLinkPopover(false);
      emitHtmlChange();
      return;
    }
    runCommand('unlink');
    setShowLinkPopover(false);
  }, [activeAnchorEl, emitHtmlChange, runCommand]);

  // Insert Interactive Table (Rows x Cols)
  const handleInsertTable = useCallback(
    (rows: number, cols: number, withHeader: boolean) => {
      const rCount = Math.max(1, Math.min(20, rows));
      const cCount = Math.max(1, Math.min(12, cols));

      let html =
        '\n<div class="wiki-table-wrapper my-4 w-full overflow-x-auto"><table class="w-full border-collapse border border-slate-300 dark:border-slate-700 text-sm">';

      if (withHeader) {
        html += '<thead class="bg-slate-100 dark:bg-slate-800"><tr>';
        for (let c = 1; c <= cCount; c += 1) {
          html += `<th class="border border-slate-300 dark:border-slate-700 px-3 py-2 text-left font-bold text-slate-900 dark:text-slate-100">Coluna ${c}</th>`;
        }
        html += '</tr></thead>';
      }

      html += '<tbody>';
      for (let r = 1; r <= rCount; r += 1) {
        html += '<tr class="even:bg-slate-50/60 dark:even:bg-slate-900/40">';
        for (let c = 1; c <= cCount; c += 1) {
          html += `<td class="border border-slate-300 dark:border-slate-700 px-3 py-2 text-slate-800 dark:text-slate-200">Item ${r}.${c}</td>`;
        }
        html += '</tr>';
      }
      html += '</tbody></table></div><p><br/></p>\n';

      insertHtmlAtCursorOrAppend(html);
      setShowTablePicker(false);
    },
    [insertHtmlAtCursorOrAppend]
  );

  // Contextual Table Manipulation (Add/Remove Row/Col, Delete Table)
  const manipulateActiveTable = useCallback(
    (
      action:
        | 'addRowBelow'
        | 'addRowAbove'
        | 'deleteRow'
        | 'addColRight'
        | 'addColLeft'
        | 'deleteCol'
        | 'deleteTable'
    ) => {
      if (!activeTableCell) return;
      const row = activeTableCell.closest('tr');
      const table = activeTableCell.closest('table');
      if (!row || !table) return;

      const cellIndex = activeTableCell.cellIndex;

      if (action === 'deleteTable') {
        const wrapper = table.closest('.wiki-table-wrapper') || table;
        wrapper.remove();
        setActiveTableCell(null);
        emitHtmlChange();
        return;
      }

      if (action === 'addRowBelow' || action === 'addRowAbove') {
        const newRow = document.createElement('tr');
        newRow.className = 'even:bg-slate-50/60 dark:even:bg-slate-900/40';
        const colCount = row.cells.length;
        for (let i = 0; i < colCount; i += 1) {
          const td = document.createElement('td');
          td.className =
            'border border-slate-300 dark:border-slate-700 px-3 py-2 text-slate-800 dark:text-slate-200';
          td.innerHTML = '&nbsp;';
          newRow.appendChild(td);
        }
        if (action === 'addRowBelow') {
          row.after(newRow);
        } else {
          row.before(newRow);
        }
        emitHtmlChange();
        return;
      }

      if (action === 'deleteRow') {
        const allRows = table.querySelectorAll('tr');
        if (allRows.length <= 1) {
          const wrapper = table.closest('.wiki-table-wrapper') || table;
          wrapper.remove();
          setActiveTableCell(null);
        } else {
          row.remove();
          setActiveTableCell(null);
        }
        emitHtmlChange();
        return;
      }

      if (action === 'addColRight' || action === 'addColLeft') {
        const allRows = Array.from(table.rows);
        for (const r of allRows) {
          const refCell = r.cells[Math.min(cellIndex, r.cells.length - 1)];
          if (!refCell) continue;
          const isHeader = refCell.tagName === 'TH';
          const newCell = document.createElement(isHeader ? 'th' : 'td');
          newCell.className = isHeader
            ? 'border border-slate-300 dark:border-slate-700 px-3 py-2 text-left font-bold text-slate-900 dark:text-slate-100'
            : 'border border-slate-300 dark:border-slate-700 px-3 py-2 text-slate-800 dark:text-slate-200';
          newCell.innerHTML = isHeader ? 'Nova Coluna' : '&nbsp;';
          if (action === 'addColRight') {
            refCell.after(newCell);
          } else {
            refCell.before(newCell);
          }
        }
        emitHtmlChange();
        return;
      }

      if (action === 'deleteCol') {
        const allRows = Array.from(table.rows);
        if (allRows[0] && allRows[0].cells.length <= 1) {
          const wrapper = table.closest('.wiki-table-wrapper') || table;
          wrapper.remove();
          setActiveTableCell(null);
        } else {
          for (const r of allRows) {
            if (r.cells[cellIndex]) {
              r.deleteCell(cellIndex);
            }
          }
          setActiveTableCell(null);
        }
        emitHtmlChange();
      }
    },
    [activeTableCell, emitHtmlChange]
  );

  // Detect clicks on images or videos inside the editor to enable resizing controls
  // Uses `data-wiki-selected="true"` attribute (stripped on save) instead of mutating inline `style.outline`
  const handleEditorClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      saveCurrentSelection();

      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'IMG' || target.tagName === 'VIDEO')) {
        if (selectedMediaEl && selectedMediaEl !== target) {
          selectedMediaEl.removeAttribute('data-wiki-selected');
        }
        target.setAttribute('data-wiki-selected', 'true');
        setSelectedMediaEl(target);

        const editorWidth = editableRef.current?.clientWidth || 800;
        const rect = target.getBoundingClientRect();
        const computedPct = Math.round(
          Math.min(100, Math.max(10, (rect.width / editorWidth) * 100))
        );
        setMediaWidthPercent(computedPct);
        setMediaPixelDims({
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        });
      } else if (selectedMediaEl) {
        selectedMediaEl.removeAttribute('data-wiki-selected');
        setSelectedMediaEl(null);
      }
    },
    [saveCurrentSelection, selectedMediaEl]
  );

  // Resize selected image/video by percentage
  const applySelectedMediaSize = useCallback(
    (nextPercent: number) => {
      if (!selectedMediaEl) return;
      const clamped = Math.max(10, Math.min(100, Math.round(nextPercent)));
      selectedMediaEl.style.width = `${clamped}%`;
      selectedMediaEl.style.maxWidth = '100%';
      selectedMediaEl.style.height = 'auto';
      selectedMediaEl.removeAttribute('width');
      selectedMediaEl.removeAttribute('height');
      setMediaWidthPercent(clamped);

      const rect = selectedMediaEl.getBoundingClientRect();
      setMediaPixelDims({
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      });
      emitHtmlChange();
    },
    [emitHtmlChange, selectedMediaEl]
  );

  const applySelectedMediaAlignment = useCallback(
    (align: 'left' | 'center' | 'right') => {
      if (!selectedMediaEl) return;
      const figure = selectedMediaEl.closest('figure') as HTMLElement | null;
      const targetBox = figure || selectedMediaEl;

      if (align === 'center') {
        targetBox.style.marginLeft = 'auto';
        targetBox.style.marginRight = 'auto';
        targetBox.style.textAlign = 'center';
        selectedMediaEl.style.display = 'block';
        selectedMediaEl.style.marginLeft = 'auto';
        selectedMediaEl.style.marginRight = 'auto';
      } else if (align === 'right') {
        targetBox.style.marginLeft = 'auto';
        targetBox.style.marginRight = '0';
        targetBox.style.textAlign = 'right';
        selectedMediaEl.style.display = 'block';
        selectedMediaEl.style.marginLeft = 'auto';
        selectedMediaEl.style.marginRight = '0';
      } else {
        targetBox.style.marginLeft = '0';
        targetBox.style.marginRight = 'auto';
        targetBox.style.textAlign = 'left';
        selectedMediaEl.style.display = 'block';
        selectedMediaEl.style.marginLeft = '0';
        selectedMediaEl.style.marginRight = 'auto';
      }
      emitHtmlChange();
    },
    [emitHtmlChange, selectedMediaEl]
  );

  const removeSelectedMedia = useCallback(() => {
    if (!selectedMediaEl) return;
    const figure = selectedMediaEl.closest('figure');
    if (figure) {
      figure.remove();
    } else {
      selectedMediaEl.remove();
    }
    setSelectedMediaEl(null);
    emitHtmlChange();
  }, [emitHtmlChange, selectedMediaEl]);

  // Interactive Mouse Drag Resize Handle for selected image/video
  const startMediaDragResize = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!selectedMediaEl || !editableRef.current) return;

      isResizingMediaRef.current = true;
      const rect = selectedMediaEl.getBoundingClientRect();
      const editorWidth = editableRef.current.clientWidth || 800;
      resizeStartRef.current = {
        startX: e.clientX,
        startWidth: rect.width,
        containerWidth: editorWidth,
      };

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!isResizingMediaRef.current || !selectedMediaEl) return;
        const deltaX = moveEvent.clientX - resizeStartRef.current.startX;
        const newWidthPx = Math.max(80, resizeStartRef.current.startWidth + deltaX);
        const pct = Math.max(
          10,
          Math.min(100, Math.round((newWidthPx / resizeStartRef.current.containerWidth) * 100))
        );
        selectedMediaEl.style.width = `${pct}%`;
        selectedMediaEl.style.maxWidth = '100%';
        selectedMediaEl.style.height = 'auto';
        setMediaWidthPercent(pct);
        const updatedRect = selectedMediaEl.getBoundingClientRect();
        setMediaPixelDims({
          width: Math.round(updatedRect.width),
          height: Math.round(updatedRect.height),
        });
      };

      const handleMouseUp = () => {
        if (isResizingMediaRef.current) {
          isResizingMediaRef.current = false;
          emitHtmlChange();
        }
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [emitHtmlChange, selectedMediaEl]
  );

  // Clean up media selection attribute before unmounting
  useEffect(() => {
    return () => {
      if (selectedMediaEl) {
        selectedMediaEl.removeAttribute('data-wiki-selected');
      }
    };
  }, [selectedMediaEl]);

  const uploadSingleMediaFile = useCallback(
    (file: File, mediaKind: 'image' | 'video'): Promise<void> => {
      return new Promise((resolve) => {
        const uploadId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        setActiveUploads((prev) => [
          ...prev,
          {
            id: uploadId,
            fileName: file.name,
            fileSize: file.size,
            mediaKind,
            progress: 5,
          },
        ]);

        const formData = new FormData();
        formData.append('file', file);

        const xhr = new XMLHttpRequest();
        xhr.open('POST', uploadEndpoint, true);

        const token =
          authToken ??
          (typeof window !== 'undefined'
            ? window.localStorage.getItem('token') ?? undefined
            : undefined);
        if (token) {
          xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        }

        xhr.upload.onprogress = (event) => {
          if (!event.lengthComputable) return;
          const pct = Math.min(95, Math.max(10, Math.round((event.loaded / event.total) * 100)));
          setActiveUploads((prev) =>
            prev.map((item) => (item.id === uploadId ? { ...item, progress: pct } : item))
          );
        };

        xhr.onload = () => {
          setActiveUploads((prev) => prev.filter((item) => item.id !== uploadId));

          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const parsed = JSON.parse(xhr.responseText) as WikiUploadResponse;
              if (parsed && typeof parsed.url === 'string' && parsed.url.trim().length > 0) {
                const snippet = buildMediaHtmlSnippet(parsed.url, file.name, mediaKind);
                insertHtmlAtCursorOrAppend(snippet);
                setLastUploadedUrl(toApiFileUrl(parsed.url) || parsed.url);
                setUploadError(null);
                resolve();
                return;
              }
            } catch {
              // Fall through
            }
          }

          let serverMsg = `Falha no upload de "${file.name}" (HTTP ${xhr.status}).`;
          try {
            const errJson = JSON.parse(xhr.responseText) as { error?: string; message?: string };
            if (errJson.error || errJson.message) {
              serverMsg = errJson.error ?? errJson.message ?? serverMsg;
            }
          } catch {
            // Keep default message
          }
          setUploadError(serverMsg);
          resolve();
        };

        xhr.onerror = () => {
          setActiveUploads((prev) => prev.filter((item) => item.id !== uploadId));
          setUploadError(
            `Erro de rede ao enviar "${file.name}" para o servidor Go (${uploadEndpoint}).`
          );
          resolve();
        };

        xhr.send(formData);
      });
    },
    [authToken, insertHtmlAtCursorOrAppend, uploadEndpoint]
  );

  const processIncomingFiles = useCallback(
    async (fileList: FileList | File[]) => {
      if (disabled) return;
      const files = Array.from(fileList);
      if (files.length === 0) return;

      setUploadError(null);
      setLastUploadedUrl(null);

      for (const file of files) {
        const validation = classifyMediaFile(file, maxFileSizeBytes);
        if (!validation.valid) {
          setUploadError(validation.reason);
          continue;
        }
        await uploadSingleMediaFile(file, validation.kind);
      }
    },
    [disabled, maxFileSizeBytes, uploadSingleMediaFile]
  );

  // Drag & Drop handlers on the editor surface
  const handleDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (!disabled && !isDraggingOver) {
        setIsDraggingOver(true);
      }
    },
    [disabled, isDraggingOver]
  );

  const handleDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDraggingOver(false);
  }, []);

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDraggingOver(false);

      if (disabled) return;
      const droppedFiles = event.dataTransfer?.files;
      if (droppedFiles && droppedFiles.length > 0) {
        void processIncomingFiles(droppedFiles);
      }
    },
    [disabled, processIncomingFiles]
  );

  // Clipboard Paste handler (intercepts pasted image/video files)
  const handlePaste = useCallback(
    (event: React.ClipboardEvent<HTMLDivElement | HTMLTextAreaElement>) => {
      if (disabled) return;

      const clipboardItems = event.clipboardData?.items;
      const extractedFiles: File[] = [];

      if (clipboardItems) {
        for (let i = 0; i < clipboardItems.length; i += 1) {
          const item = clipboardItems[i];
          if (item.kind === 'file') {
            const file = item.getAsFile();
            if (file) {
              extractedFiles.push(file);
            }
          }
        }
      }

      if (extractedFiles.length === 0 && event.clipboardData?.files?.length) {
        extractedFiles.push(...Array.from(event.clipboardData.files));
      }

      if (extractedFiles.length > 0) {
        event.preventDefault();
        void processIncomingFiles(extractedFiles);
      }
    },
    [disabled, processIncomingFiles]
  );

  // Keyboard shortcuts inside visual editor (Ctrl+B, Ctrl+I, Ctrl+U, Ctrl+K, Tab in tables/lists)
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Tab') {
        if (activeTableCell) {
          e.preventDefault();
          const table = activeTableCell.closest('table');
          if (table) {
            const cells = Array.from(table.querySelectorAll<HTMLTableCellElement>('th, td'));
            const idx = cells.indexOf(activeTableCell);
            if (idx !== -1) {
              const nextIdx = e.shiftKey ? idx - 1 : idx + 1;
              const targetCell = cells[nextIdx];
              if (targetCell) {
                const range = document.createRange();
                range.selectNodeContents(targetCell);
                range.collapse(false);
                const sel = window.getSelection();
                sel?.removeAllRanges();
                sel?.addRange(range);
                saveCurrentSelection();
              }
            }
          }
          return;
        }

        e.preventDefault();
        runCommand(e.shiftKey ? 'outdent' : 'indent');
        return;
      }

      if (e.ctrlKey || e.metaKey) {
        const key = e.key.toLowerCase();
        if (key === 'b') {
          e.preventDefault();
          runCommand('bold');
        } else if (key === 'i') {
          e.preventDefault();
          runCommand('italic');
        } else if (key === 'u') {
          e.preventDefault();
          runCommand('underline');
        } else if (key === 'k') {
          e.preventDefault();
          openLinkPopover();
        }
      }
    },
    [activeTableCell, openLinkPopover, runCommand, saveCurrentSelection]
  );

  return (
    <div
      ref={containerRef}
      aria-labelledby={editorHeadingId}
      className={
        isFullscreen
          ? 'fixed inset-0 z-50 flex flex-col w-screen h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 shadow-2xl overflow-hidden'
          : 'w-full max-w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 shadow-xs'
      }
    >
      {/* Hidden File Input for manual upload button */}
      <input
        ref={filePickerRef}
        id={fileInputId}
        type="file"
        multiple
        accept=".jpg,.jpeg,.png,.gif,.webp,.mp4,.webm,.mov,image/*,video/mp4,video/webm,video/quicktime"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            void processIncomingFiles(e.target.files);
            e.target.value = '';
          }
        }}
        className="sr-only"
      />

      {/* PRIMARY MODERN WYSIWYG TOOLBAR */}
      <div
        className={`border-b border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 px-3 py-2.5 space-y-2 ${
          isFullscreen ? '' : 'rounded-t-xl'
        }`}
      >
        {/* Row 1: Font Family, Font Size, Headings, Undo/Redo, Fullscreen & Mode Switcher */}
        <div
          className="flex flex-wrap items-center justify-between gap-2"
          role="toolbar"
          aria-label="Tipografia e Estrutura do Artigo"
        >
          <span id={editorHeadingId} className="sr-only">
            Editor Rich Text Completo da Wiki Técnica
          </span>

          <div className="flex flex-wrap items-center gap-1.5">
            {/* Undo / Redo */}
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => runCommand('undo')}
              disabled={disabled || viewMode !== 'visual'}
              title="Desfazer (Ctrl+Z)"
              className="p-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50"
            >
              <Undo2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => runCommand('redo')}
              disabled={disabled || viewMode !== 'visual'}
              title="Refazer (Ctrl+Y)"
              className="p-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50"
            >
              <Redo2 className="w-4 h-4" />
            </button>

            <span className="h-5 w-px bg-slate-300 dark:bg-slate-700 mx-0.5" />

            {/* Font Family Selector */}
            <div className="inline-flex items-center gap-1 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1">
              <Type className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <select
                aria-label="Selecionar Tipo de Fonte"
                value={selectedFontFamily}
                disabled={disabled || viewMode !== 'visual'}
                onFocus={saveCurrentSelection}
                onChange={(e) => handleFontFamilyChange(e.target.value)}
                className="bg-transparent text-xs font-medium text-slate-800 dark:text-slate-100 focus:outline-none cursor-pointer max-w-[175px]"
              >
                {FONT_FAMILIES.map((f) => (
                  <option
                    key={f.label}
                    value={f.value}
                    style={{ fontFamily: f.value }}
                    className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                  >
                    {f.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Font Size Selector */}
            <div className="inline-flex items-center gap-1 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1">
              <span className="text-[10px] font-bold uppercase text-slate-400">Tam:</span>
              <select
                aria-label="Selecionar Tamanho da Fonte"
                value={selectedFontSize}
                disabled={disabled || viewMode !== 'visual'}
                onFocus={saveCurrentSelection}
                onChange={(e) => handleFontSizeChange(e.target.value)}
                className="bg-transparent text-xs font-semibold text-slate-800 dark:text-slate-100 focus:outline-none cursor-pointer"
              >
                {FONT_SIZES.map((s) => (
                  <option
                    key={s.value}
                    value={s.value}
                    className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                  >
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            <span className="h-5 w-px bg-slate-300 dark:bg-slate-700 mx-0.5" />

            {/* Headings H1, H2, H3, Paragraph */}
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyBlockFormat('P')}
              disabled={disabled || viewMode !== 'visual'}
              title="Parágrafo Normal"
              className="px-2 py-1.5 rounded-md text-xs font-semibold border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer"
            >
              Normal
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyBlockFormat('H1')}
              disabled={disabled || viewMode !== 'visual'}
              title="Título Principal H1"
              className="p-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer"
            >
              <Heading1 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyBlockFormat('H2')}
              disabled={disabled || viewMode !== 'visual'}
              title="Título de Seção H2"
              className="p-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer"
            >
              <Heading2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyBlockFormat('H3')}
              disabled={disabled || viewMode !== 'visual'}
              title="Subtítulo H3"
              className="p-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer"
            >
              <Heading3 className="w-4 h-4" />
            </button>
          </div>

          {/* Right Controls: Fullscreen Toggle & Visual/HTML Mode Switcher */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsFullscreen((prev) => !prev)}
              title={isFullscreen ? 'Sair da Tela Cheia' : 'Expandir Editor em Tela Cheia'}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer"
            >
              {isFullscreen ? (
                <>
                  <Shrink className="w-3.5 h-3.5 text-blue-600" />
                  <span>Reduzir</span>
                </>
              ) : (
                <>
                  <Expand className="w-3.5 h-3.5 text-blue-600" />
                  <span>Tela Cheia</span>
                </>
              )}
            </button>

            <div className="flex items-center rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 overflow-hidden">
              <button
                type="button"
                onClick={() => {
                  setViewMode('visual');
                  setTimeout(() => syncVisualEditorIfNeeded(value), 0);
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono uppercase cursor-pointer ${
                  viewMode === 'visual'
                    ? 'bg-slate-800 text-white dark:bg-blue-500 dark:text-slate-950 font-bold'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Visual</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('source')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono uppercase cursor-pointer ${
                  viewMode === 'source'
                    ? 'bg-slate-800 text-white dark:bg-blue-500 dark:text-slate-950 font-bold'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                <Code2 className="w-3.5 h-3.5" />
                <span>HTML</span>
              </button>
            </div>
          </div>
        </div>

        {/* Row 2: Selection Styles (Bold, Italic, Underline, Strike, Colors), Alignment, Lists, Link, Table Builder, Code & Media */}
        <div
          className="flex flex-wrap items-center gap-1.5 border-t border-slate-200 dark:border-slate-800 pt-2"
          role="toolbar"
          aria-label="Estilos de Texto, Tabelas e Mídia"
        >
          {/* Bold / Italic / Underline / Strikethrough */}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => runCommand('bold')}
            disabled={disabled || viewMode !== 'visual'}
            title="Negrito (Selecione o texto ou Ctrl+B)"
            className={`p-2 rounded-md border cursor-pointer transition-colors ${
              activeStyles.bold
                ? 'border-blue-600 bg-blue-600 text-white'
                : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 hover:bg-slate-200 dark:hover:bg-slate-800'
            }`}
          >
            <Bold className="w-4 h-4" />
          </button>

          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => runCommand('italic')}
            disabled={disabled || viewMode !== 'visual'}
            title="Itálico (Selecione o texto ou Ctrl+I)"
            className={`p-2 rounded-md border cursor-pointer transition-colors ${
              activeStyles.italic
                ? 'border-blue-600 bg-blue-600 text-white'
                : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 hover:bg-slate-200 dark:hover:bg-slate-800'
            }`}
          >
            <Italic className="w-4 h-4" />
          </button>

          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => runCommand('underline')}
            disabled={disabled || viewMode !== 'visual'}
            title="Sublinhado (Selecione o texto ou Ctrl+U)"
            className={`p-2 rounded-md border cursor-pointer transition-colors ${
              activeStyles.underline
                ? 'border-blue-600 bg-blue-600 text-white'
                : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 hover:bg-slate-200 dark:hover:bg-slate-800'
            }`}
          >
            <UnderlineIcon className="w-4 h-4" />
          </button>

          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => runCommand('strikeThrough')}
            disabled={disabled || viewMode !== 'visual'}
            title="Tachado / Riscado"
            className={`p-2 rounded-md border cursor-pointer transition-colors ${
              activeStyles.strikeThrough
                ? 'border-blue-600 bg-blue-600 text-white'
                : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 hover:bg-slate-200 dark:hover:bg-slate-800'
            }`}
          >
            <Strikethrough className="w-4 h-4" />
          </button>

          {/* Text Color & Highlight Popover */}
          <div className="relative">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setShowColorMenu((prev) => !prev);
                setShowTablePicker(false);
                setShowLinkPopover(false);
              }}
              disabled={disabled || viewMode !== 'visual'}
              title="Cor do Texto e Marca-Texto"
              className="inline-flex items-center gap-1 px-2.5 py-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 hover:bg-slate-200 dark:hover:bg-slate-800 text-xs font-semibold cursor-pointer"
            >
              <Palette className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <Highlighter className="w-3.5 h-3.5 text-amber-500" />
            </button>

            {showColorMenu && (
              <div className="absolute left-0 top-full z-40 mt-1.5 w-64 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 shadow-xl space-y-3">
                <div>
                  <span className="block text-[10px] font-bold uppercase text-slate-500 mb-1.5">
                    Cor da Fonte (Texto Selecionado)
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {TEXT_COLORS.map((tc) => (
                      <button
                        key={tc.label}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          applyInlineStyleToSelection({ color: tc.color });
                          setShowColorMenu(false);
                        }}
                        title={tc.label}
                        className="flex items-center gap-1.5 rounded-md border border-slate-200 dark:border-slate-700 px-2 py-1 text-[11px] hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        <span className={`w-3 h-3 rounded-full ${tc.swatchClass}`} />
                        <span>{tc.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="border-t border-slate-200 dark:border-slate-800 pt-2">
                  <span className="block text-[10px] font-bold uppercase text-slate-500 mb-1.5">
                    Marca-Texto (Fundo)
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {HIGHLIGHT_COLORS.map((hc) => (
                      <button
                        key={hc.label}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          applyInlineStyleToSelection({
                            backgroundColor: hc.color,
                            padding: hc.color === 'transparent' ? '0' : '0 3px',
                            borderRadius: '3px',
                          });
                          setShowColorMenu(false);
                        }}
                        title={hc.label}
                        className="flex items-center gap-1.5 rounded-md border border-slate-200 dark:border-slate-700 px-2 py-1 text-[11px] hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        <span className={`w-3 h-3 rounded-sm ${hc.swatchClass}`} />
                        <span>{hc.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => runCommand('removeFormat')}
            disabled={disabled || viewMode !== 'visual'}
            title="Limpar Formatação do Texto Selecionado"
            className="p-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer"
          >
            <RemoveFormatting className="w-4 h-4" />
          </button>

          <span className="h-5 w-px bg-slate-300 dark:bg-slate-700 mx-0.5" />

          {/* Text Alignment */}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => runCommand('justifyLeft')}
            disabled={disabled || viewMode !== 'visual'}
            title="Alinhar à Esquerda"
            className={`p-2 rounded-md border cursor-pointer ${
              activeStyles.alignLeft
                ? 'border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 hover:bg-slate-200 dark:hover:bg-slate-800'
            }`}
          >
            <AlignLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => runCommand('justifyCenter')}
            disabled={disabled || viewMode !== 'visual'}
            title="Centralizar"
            className={`p-2 rounded-md border cursor-pointer ${
              activeStyles.alignCenter
                ? 'border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 hover:bg-slate-200 dark:hover:bg-slate-800'
            }`}
          >
            <AlignCenter className="w-4 h-4" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => runCommand('justifyRight')}
            disabled={disabled || viewMode !== 'visual'}
            title="Alinhar à Direita"
            className={`p-2 rounded-md border cursor-pointer ${
              activeStyles.alignRight
                ? 'border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 hover:bg-slate-200 dark:hover:bg-slate-800'
            }`}
          >
            <AlignRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => runCommand('justifyFull')}
            disabled={disabled || viewMode !== 'visual'}
            title="Justificar Texto"
            className={`p-2 rounded-md border cursor-pointer ${
              activeStyles.alignJustify
                ? 'border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 hover:bg-slate-200 dark:hover:bg-slate-800'
            }`}
          >
            <AlignJustify className="w-4 h-4" />
          </button>

          <span className="h-5 w-px bg-slate-300 dark:bg-slate-700 mx-0.5" />

          {/* Lists & Links */}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => runCommand('insertUnorderedList')}
            disabled={disabled || viewMode !== 'visual'}
            title="Lista com Marcadores"
            className={`p-2 rounded-md border cursor-pointer ${
              activeStyles.unorderedList
                ? 'border-blue-600 bg-blue-600 text-white'
                : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 hover:bg-slate-200 dark:hover:bg-slate-800'
            }`}
          >
            <List className="w-4 h-4" />
          </button>

          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => runCommand('insertOrderedList')}
            disabled={disabled || viewMode !== 'visual'}
            title="Lista Numerada"
            className={`p-2 rounded-md border cursor-pointer ${
              activeStyles.orderedList
                ? 'border-blue-600 bg-blue-600 text-white'
                : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 hover:bg-slate-200 dark:hover:bg-slate-800'
            }`}
          >
            <ListOrdered className="w-4 h-4" />
          </button>

          {/* Inline Link Popover Button */}
          <div className="relative">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={openLinkPopover}
              disabled={disabled || viewMode !== 'visual'}
              title="Inserir ou Editar Link (Ctrl+K)"
              className={`p-2 rounded-md border cursor-pointer ${
                activeAnchorEl || showLinkPopover
                  ? 'border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                  : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 hover:bg-slate-200 dark:hover:bg-slate-800'
              }`}
            >
              <LinkIcon className="w-4 h-4" />
            </button>

            {showLinkPopover && (
              <div className="absolute left-0 top-full z-40 mt-1.5 w-80 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-3.5 shadow-xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                    {activeAnchorEl ? 'Editar Link Selecionado' : 'Inserir Link'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowLinkPopover(false)}
                    className="rounded p-0.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                    Texto Exibido
                  </label>
                  <input
                    type="text"
                    value={linkTextInput}
                    onChange={(e) => setLinkTextInput(e.target.value)}
                    placeholder="Ex: Documentação Oficial"
                    className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:border-blue-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                    URL de Destino
                  </label>
                  <input
                    type="url"
                    value={linkUrlInput}
                    onChange={(e) => setLinkUrlInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleConfirmInsertLink();
                      }
                    }}
                    placeholder="https://..."
                    className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs font-mono text-slate-900 dark:text-slate-100 focus:border-blue-600 focus:outline-none"
                  />
                </div>

                <div className="flex items-center justify-between pt-1">
                  {activeAnchorEl ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={handleRemoveLink}
                        className="inline-flex items-center gap-1 rounded-md border border-rose-200 dark:border-rose-800 px-2 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                      >
                        <Unlink className="w-3 h-3" /> Remover
                      </button>
                      <a
                        href={activeAnchorEl.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 px-2 py-1 text-[11px] text-slate-600 dark:text-slate-300 hover:bg-slate-100"
                      >
                        <ExternalLink className="w-3 h-3" /> Abrir
                      </a>
                    </div>
                  ) : (
                    <span />
                  )}

                  <button
                    type="button"
                    onClick={() => handleConfirmInsertLink()}
                    className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" /> Aplicar
                  </button>
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyBlockFormat('CALLOUT')}
            disabled={disabled}
            title="Inserir Nota Operacional"
            className="p-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer"
          >
            <Quote className="w-4 h-4" />
          </button>

          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyBlockFormat('HR')}
            disabled={disabled}
            title="Inserir Divisor Horizontal"
            className="p-2 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer"
          >
            <SeparatorHorizontal className="w-4 h-4" />
          </button>

          <span className="h-5 w-px bg-slate-300 dark:bg-slate-700 mx-0.5" />

          {/* INTERACTIVE TABLE BUILDER BUTTON + POPOVER */}
          <div className="relative">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setShowTablePicker((prev) => !prev);
                setShowColorMenu(false);
                setShowLinkPopover(false);
              }}
              disabled={disabled}
              title="Criar Tabela Personalizada"
              className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-md text-xs font-semibold border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer"
            >
              <TableIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Tabela</span>
            </button>

            {showTablePicker && (
              <div className="absolute left-0 top-full z-40 mt-1.5 w-72 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                    Inserir Tabela ({hoverTableGrid.rows} x {hoverTableGrid.cols})
                  </span>
                  <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={tableWithHeader}
                      onChange={(e) => setTableWithHeader(e.target.checked)}
                      className="rounded border-slate-300"
                    />
                    Cabeçalho
                  </label>
                </div>

                {/* Visual 6x6 Grid Selector */}
                <div className="grid grid-cols-6 gap-1 bg-slate-50 dark:bg-slate-950 p-2 rounded-lg border border-slate-200 dark:border-slate-800">
                  {Array.from({ length: 6 }).map((_, rIdx) =>
                    Array.from({ length: 6 }).map((__, cIdx) => {
                      const r = rIdx + 1;
                      const c = cIdx + 1;
                      const isHighlighted =
                        r <= hoverTableGrid.rows && c <= hoverTableGrid.cols;
                      return (
                        <button
                          key={`${r}-${c}`}
                          type="button"
                          onMouseEnter={() => {
                            setHoverTableGrid({ rows: r, cols: c });
                            setCustomTableRows(r);
                            setCustomTableCols(c);
                          }}
                          onClick={() => handleInsertTable(r, c, tableWithHeader)}
                          className={`h-6 w-full rounded-xs border transition-colors cursor-pointer ${
                            isHighlighted
                              ? 'border-blue-600 bg-blue-500/30 dark:bg-blue-500/40'
                              : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900'
                          }`}
                          title={`Inserir tabela ${r} linhas x ${c} colunas`}
                        />
                      );
                    })
                  )}
                </div>

                {/* Custom Dimensions Input */}
                <div className="flex items-center gap-2 pt-1 border-t border-slate-200 dark:border-slate-800">
                  <div className="flex-1">
                    <label className="block text-[10px] font-bold uppercase text-slate-400">
                      Linhas
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={customTableRows}
                      onChange={(e) => setCustomTableRows(Number(e.target.value))}
                      className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1 text-xs"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-[10px] font-bold uppercase text-slate-400">
                      Colunas
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={12}
                      value={customTableCols}
                      onChange={(e) => setCustomTableCols(Number(e.target.value))}
                      className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1 text-xs"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      handleInsertTable(customTableRows, customTableCols, tableWithHeader)
                    }
                    className="mt-3.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 cursor-pointer"
                  >
                    Criar
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Code Block */}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyBlockFormat('CODEBLOCK')}
            disabled={disabled}
            title="Bloco de Código Formatado"
            className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-md text-xs font-mono border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer"
          >
            <FileCode className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span>Código</span>
          </button>

          {/* Upload Media Button */}
          <button
            type="button"
            onClick={() => filePickerRef.current?.click()}
            disabled={disabled}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-semibold uppercase tracking-wider bg-blue-600 hover:bg-blue-700 text-white border border-blue-700 cursor-pointer ml-auto"
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <Film className="w-3.5 h-3.5" />
            <span>Inserir Imagem / Vídeo (50MB)</span>
          </button>
        </div>
      </div>

      {/* CONTEXTUAL BAR 1: ACTIVE TABLE ROW/COLUMN CONTROLS */}
      {activeTableCell && viewMode === 'visual' && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/80 dark:bg-emerald-950/40 px-4 py-2 text-xs">
          <span className="inline-flex items-center gap-1.5 font-bold text-emerald-900 dark:text-emerald-200">
            <TableIcon className="w-4 h-4 text-emerald-600" />
            Tabela Selecionada (Use Tab para navegar entre células):
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => manipulateActiveTable('addRowAbove')}
              className="inline-flex items-center gap-1 rounded border border-emerald-300 dark:border-emerald-800 bg-white dark:bg-slate-900 px-2 py-1 font-medium text-slate-700 dark:text-slate-200 hover:bg-emerald-100 cursor-pointer"
            >
              <Rows className="w-3.5 h-3.5" /> + Linha Acima
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => manipulateActiveTable('addRowBelow')}
              className="inline-flex items-center gap-1 rounded border border-emerald-300 dark:border-emerald-800 bg-white dark:bg-slate-900 px-2 py-1 font-medium text-slate-700 dark:text-slate-200 hover:bg-emerald-100 cursor-pointer"
            >
              <Rows className="w-3.5 h-3.5" /> + Linha Abaixo
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => manipulateActiveTable('deleteRow')}
              className="inline-flex items-center gap-1 rounded border border-rose-200 dark:border-rose-800 bg-white dark:bg-slate-900 px-2 py-1 font-medium text-rose-700 dark:text-rose-300 hover:bg-rose-50 cursor-pointer"
            >
              - Excluir Linha
            </button>

            <span className="h-4 w-px bg-emerald-300 dark:bg-emerald-800 mx-1" />

            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => manipulateActiveTable('addColLeft')}
              className="inline-flex items-center gap-1 rounded border border-emerald-300 dark:border-emerald-800 bg-white dark:bg-slate-900 px-2 py-1 font-medium text-slate-700 dark:text-slate-200 hover:bg-emerald-100 cursor-pointer"
            >
              <Columns className="w-3.5 h-3.5" /> + Coluna Esq.
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => manipulateActiveTable('addColRight')}
              className="inline-flex items-center gap-1 rounded border border-emerald-300 dark:border-emerald-800 bg-white dark:bg-slate-900 px-2 py-1 font-medium text-slate-700 dark:text-slate-200 hover:bg-emerald-100 cursor-pointer"
            >
              <Columns className="w-3.5 h-3.5" /> + Coluna Dir.
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => manipulateActiveTable('deleteCol')}
              className="inline-flex items-center gap-1 rounded border border-rose-200 dark:border-rose-800 bg-white dark:bg-slate-900 px-2 py-1 font-medium text-rose-700 dark:text-rose-300 hover:bg-rose-50 cursor-pointer"
            >
              - Excluir Coluna
            </button>

            <span className="h-4 w-px bg-emerald-300 dark:bg-emerald-800 mx-1" />

            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => manipulateActiveTable('deleteTable')}
              className="inline-flex items-center gap-1 rounded bg-rose-600 px-2.5 py-1 font-semibold text-white hover:bg-rose-700 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" /> Remover Tabela
            </button>
          </div>
        </div>
      )}

      {/* CONTEXTUAL BAR 2: INTERACTIVE IMAGE / VIDEO RESIZE & ALIGNMENT CONTROLS */}
      {selectedMediaEl && viewMode === 'visual' && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-blue-200 dark:border-blue-900/60 bg-blue-50/90 dark:bg-blue-950/50 px-4 py-2.5 text-xs">
          <div className="flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span className="font-bold text-slate-900 dark:text-slate-100">
              Redimensionar Mídia Selecionada:
            </span>
            <span className="rounded bg-blue-600 px-2 py-0.5 font-mono text-[11px] font-bold text-white">
              {mediaWidthPercent}% ({mediaPixelDims.width}px × {mediaPixelDims.height}px)
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {/* Step Decrease / Slider / Step Increase */}
            <button
              type="button"
              onClick={() => applySelectedMediaSize(mediaWidthPercent - 10)}
              title="Diminuir imagem em 10%"
              className="inline-flex items-center gap-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 font-semibold hover:bg-slate-100 cursor-pointer"
            >
              <Minimize2 className="w-3.5 h-3.5" />
              <Minus className="w-3 h-3" /> 10%
            </button>

            <input
              type="range"
              min={15}
              max={100}
              step={5}
              value={mediaWidthPercent}
              onChange={(e) => applySelectedMediaSize(Number(e.target.value))}
              aria-label="Controle deslizante de tamanho da imagem"
              className="w-28 accent-blue-600 cursor-pointer"
            />

            <button
              type="button"
              onClick={() => applySelectedMediaSize(mediaWidthPercent + 10)}
              title="Aumentar imagem em 10%"
              className="inline-flex items-center gap-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 font-semibold hover:bg-slate-100 cursor-pointer"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <Plus className="w-3 h-3" /> 10%
            </button>

            <span className="h-4 w-px bg-blue-200 dark:bg-blue-800 mx-1" />

            {/* Preset Percentages */}
            {[25, 50, 75, 100].map((pct) => (
              <button
                key={pct}
                type="button"
                onClick={() => applySelectedMediaSize(pct)}
                className={`rounded px-2 py-1 font-mono font-bold transition-colors cursor-pointer ${
                  mediaWidthPercent === pct
                    ? 'bg-blue-600 text-white'
                    : 'border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-100'
                }`}
              >
                {pct}%
              </button>
            ))}

            <span className="h-4 w-px bg-blue-200 dark:bg-blue-800 mx-1" />

            {/* Media Alignment */}
            <button
              type="button"
              onClick={() => applySelectedMediaAlignment('left')}
              title="Alinhar imagem à esquerda"
              className="p-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 cursor-pointer"
            >
              <AlignLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => applySelectedMediaAlignment('center')}
              title="Centralizar imagem"
              className="p-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 cursor-pointer"
            >
              <AlignCenter className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => applySelectedMediaAlignment('right')}
              title="Alinhar imagem à direita"
              className="p-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 cursor-pointer"
            >
              <AlignRight className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={removeSelectedMedia}
              title="Remover imagem/vídeo"
              className="inline-flex items-center gap-1 rounded bg-rose-600 px-2.5 py-1 font-semibold text-white hover:bg-rose-700 cursor-pointer ml-1"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Excluir
            </button>
          </div>
        </div>
      )}

      {/* Active Upload Progress Bars */}
      {activeUploads.length > 0 && (
        <div
          role="status"
          aria-live="polite"
          className="border-b border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-4 py-3 space-y-2"
        >
          {activeUploads.map((item) => (
            <div key={item.id} className="space-y-1">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="inline-flex items-center gap-2 text-slate-700 dark:text-slate-200">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
                  Enviando {item.mediaKind === 'video' ? 'vídeo' : 'imagem'}:{' '}
                  <strong>{item.fileName}</strong>
                </span>
                <span className="text-blue-600 dark:text-blue-400 font-bold">
                  {item.progress}%
                </span>
              </div>
              <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-blue-600 transition-all duration-150"
                  style={{ width: `${item.progress}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload Error or Success Notification */}
      {uploadError && (
        <div
          role="alert"
          className="border-b border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/50 px-4 py-2.5 flex items-center justify-between gap-2 text-xs text-red-900 dark:text-red-200"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{uploadError}</span>
          </div>
          <button
            type="button"
            onClick={() => setUploadError(null)}
            className="rounded p-0.5 hover:bg-red-100 dark:hover:bg-red-900/50"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {lastUploadedUrl && !uploadError && activeUploads.length === 0 && (
        <div
          role="status"
          className="border-b border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 px-4 py-2 flex items-center justify-between text-xs text-emerald-900 dark:text-emerald-200 font-mono"
        >
          <span className="inline-flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            Mídia inserida (clique na imagem/vídeo para aumentar ou diminuir): {lastUploadedUrl}
          </span>
          <button
            type="button"
            onClick={() => setLastUploadedUrl(null)}
            className="rounded p-0.5 hover:bg-emerald-100 dark:hover:bg-emerald-900/50"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* MAIN EDITOR SURFACE WITH FLOATING SELECTION BUBBLE MENU & MEDIA RESIZE HANDLE */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative w-full max-w-full overflow-x-hidden ${
          isFullscreen ? 'flex-1 overflow-y-auto' : 'min-h-[580px] lg:min-h-[680px]'
        }`}
      >
        {/* FLOATING BUBBLE TOOLBAR WHEN TEXT IS SELECTED */}
        {bubbleMenu.visible && viewMode === 'visual' && (
          <div
            style={{ top: `${bubbleMenu.top}px`, left: `${bubbleMenu.left}px` }}
            onMouseDown={(e) => e.preventDefault()}
            className="absolute z-30 flex flex-wrap items-center gap-1 rounded-lg border border-slate-700 bg-slate-900/95 px-2.5 py-1.5 text-white shadow-xl backdrop-blur-xs"
          >
            <button
              type="button"
              onClick={() => runCommand('bold')}
              className={`p-1.5 rounded hover:bg-slate-700 cursor-pointer ${
                activeStyles.bold ? 'bg-blue-600 text-white' : ''
              }`}
              title="Negrito"
            >
              <Bold className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => runCommand('italic')}
              className={`p-1.5 rounded hover:bg-slate-700 cursor-pointer ${
                activeStyles.italic ? 'bg-blue-600 text-white' : ''
              }`}
              title="Itálico"
            >
              <Italic className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => runCommand('underline')}
              className={`p-1.5 rounded hover:bg-slate-700 cursor-pointer ${
                activeStyles.underline ? 'bg-blue-600 text-white' : ''
              }`}
              title="Sublinhado"
            >
              <UnderlineIcon className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => runCommand('strikeThrough')}
              className={`p-1.5 rounded hover:bg-slate-700 cursor-pointer ${
                activeStyles.strikeThrough ? 'bg-blue-600 text-white' : ''
              }`}
              title="Tachado"
            >
              <Strikethrough className="w-3.5 h-3.5" />
            </button>

            <span className="h-4 w-px bg-slate-700 mx-0.5" />

            <select
              aria-label="Tamanho rápido da fonte"
              value={selectedFontSize}
              onFocus={saveCurrentSelection}
              onChange={(e) => handleFontSizeChange(e.target.value)}
              className="bg-slate-800 text-white text-[11px] rounded px-1.5 py-1 border border-slate-700 cursor-pointer"
            >
              {FONT_SIZES.map((s) => (
                <option key={s.value} value={s.value} className="bg-slate-900 text-white">
                  {s.value}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() =>
                applyInlineStyleToSelection({
                  backgroundColor: '#fef08a',
                  color: '#0f172a',
                  padding: '0 3px',
                  borderRadius: '3px',
                })
              }
              className="p-1.5 rounded hover:bg-slate-700 text-yellow-300 cursor-pointer"
              title="Destacar texto selecionado (Marca-Texto)"
            >
              <Highlighter className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={openLinkPopover}
              className="p-1.5 rounded hover:bg-slate-700 cursor-pointer"
              title="Transformar seleção em Link (Ctrl+K)"
            >
              <LinkIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* DRAG HANDLE OVERLAY WHEN IMAGE/VIDEO IS SELECTED */}
        {selectedMediaEl && viewMode === 'visual' && (
          <div className="sticky top-2 right-4 z-20 float-right mr-4 mt-2 inline-flex items-center gap-2 rounded-lg bg-slate-900/90 px-3 py-1.5 text-[11px] font-mono text-white shadow-lg">
            <span>Largura: {mediaWidthPercent}%</span>
            <button
              type="button"
              onMouseDown={startMediaDragResize}
              className="rounded bg-blue-600 px-2 py-0.5 font-sans font-bold text-white cursor-ew-resize"
              title="Clique e arraste para os lados para aumentar ou diminuir a imagem"
            >
              ↔ Arrastar Tamanho
            </button>
          </div>
        )}

        {isDraggingOver && (
          <div className="absolute inset-0 z-20 bg-blue-600/10 dark:bg-blue-500/20 border-2 border-dashed border-blue-600 flex flex-col items-center justify-center gap-2 pointer-events-none backdrop-blur-[1px]">
            <UploadCloud className="w-10 h-10 text-blue-600 dark:text-blue-400" />
            <p className="text-sm font-bold uppercase tracking-wider text-blue-900 dark:text-blue-100">
              Solte imagens ou vídeos (.mp4, .webm, .mov) para fazer upload imediato
            </p>
            <p className="text-xs font-mono text-blue-700 dark:text-blue-300">
              Limite máximo: 50MB por arquivo • Redimensionamento interativo após inserção
            </p>
          </div>
        )}

        {viewMode === 'visual' ? (
          <div
            ref={(node) => {
              editableRef.current = node;
              if (node && document.activeElement !== node) {
                const cleaned = sanitizeEditorOutputHtml(value);
                if (sanitizeEditorOutputHtml(node.innerHTML) !== cleaned) {
                  node.innerHTML = cleaned;
                }
              }
            }}
            contentEditable={!disabled}
            suppressContentEditableWarning
            role="textbox"
            aria-multiline="true"
            aria-label="Conteúdo do artigo da Wiki"
            data-placeholder={placeholder}
            onClick={handleEditorClick}
            onMouseUp={saveCurrentSelection}
            onKeyUp={saveCurrentSelection}
            onKeyDown={handleKeyDown}
            onInput={(e) => onChange(sanitizeEditorOutputHtml(e.currentTarget.innerHTML))}
            onPaste={handlePaste}
            style={{
              overflowWrap: 'anywhere',
              wordBreak: 'break-word',
              whiteSpace: 'pre-wrap',
            }}
            className={`w-full min-h-[580px] lg:min-h-[680px] ${
              isFullscreen ? 'h-full max-h-none' : 'max-h-[82vh] resize-y'
            } overflow-y-auto overflow-x-hidden p-6 lg:p-8 text-base leading-relaxed text-slate-800 dark:text-slate-100 break-words whitespace-pre-wrap focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600 prose prose-slate dark:prose-invert max-w-none [&_pre]:whitespace-pre-wrap [&_pre]:break-words [&_pre]:max-w-full [&_code]:break-words [&_p]:break-words [&_a]:break-all [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-slate-300 [&_td]:p-2 [&_th]:border [&_th]:border-slate-300 [&_th]:p-2 [&_th]:bg-slate-100 dark:[&_th]:bg-slate-800 [&_img]:cursor-pointer [&_img]:transition-all [&_video]:cursor-pointer [&_[data-wiki-selected=true]]:ring-2 [&_[data-wiki-selected=true]]:ring-blue-600 [&_[data-wiki-selected=true]]:ring-offset-2 empty:before:content-[attr(data-placeholder)] empty:before:text-slate-400`}
          />
        ) : (
          <textarea
            value={value}
            disabled={disabled}
            wrap="soft"
            onChange={(e) => onChange(sanitizeEditorOutputHtml(e.target.value))}
            onPaste={handlePaste}
            placeholder={placeholder}
            aria-label="Código HTML do artigo da Wiki"
            style={{
              overflowWrap: 'anywhere',
              wordBreak: 'break-word',
              whiteSpace: 'pre-wrap',
            }}
            className={`w-full min-h-[580px] lg:min-h-[680px] ${
              isFullscreen ? 'h-full' : 'resize-y'
            } p-6 font-mono text-sm leading-relaxed bg-slate-950 text-slate-100 break-words whitespace-pre-wrap overflow-x-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600`}
          />
        )}
      </div>

      {/* Technical Footer with Live Metrics */}
      <div
        className={`border-t border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-600 dark:text-slate-400 ${
          isFullscreen ? '' : 'rounded-b-xl'
        }`}
      >
        <span>
          Dica: Selecione texto para formatar, use Tab em tabelas/listas ou clique em imagens/vídeos para redimensionar.
        </span>
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded bg-slate-200/80 dark:bg-slate-800 px-2 py-0.5 text-slate-700 dark:text-slate-300">
            {textMetrics.words} palavras • {textMetrics.chars} caracteres (~{textMetrics.readMin} min leitura)
          </span>
          <span>Upload até 50MB</span>
        </div>
      </div>
    </div>
  );
};

export default WikiRichTextEditor;
