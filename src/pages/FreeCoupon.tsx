import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type ReactNode } from 'react';
import {
  AlignCenter, AlignJustify, AlignLeft, AlignRight, Bold, ClipboardPaste, Copy, Eraser,
  Italic, List, ListOrdered, Minus, Plus, Printer, Redo2, Scissors, Trash2, Underline, Undo2
} from 'lucide-react';
import {
  applyCouponEditorCommand, applyCouponFontSize, applyCouponLineSpacing,
  clearCouponEditorFormatting, DEFAULT_FREE_COUPON_SETTINGS, FREE_COUPON_FONTS,
  FREE_COUPON_SETTINGS_KEY, freeCouponPrintHtml, sanitizeFreeCouponHtml,
  settingsForPaperPreset, validateFreeCouponSettings, type FreeCouponSettings
} from '../db/freeCoupon';
import './freeCoupon.css';

function readSettings(): FreeCouponSettings {
  try {
    const saved = localStorage.getItem(FREE_COUPON_SETTINGS_KEY);
    if (saved) {
      const candidate = { ...DEFAULT_FREE_COUPON_SETTINGS, ...JSON.parse(saved) } as FreeCouponSettings;
      if (!validateFreeCouponSettings(candidate)) return candidate;
    }
  } catch { /* Retain defaults if saved preferences cannot be read. */ }
  return { ...DEFAULT_FREE_COUPON_SETTINGS };
}



export function FreeCoupon() {
  const editorRef = useRef<HTMLDivElement>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const [settings, setSettings] = useState<FreeCouponSettings>(readSettings);
  const [fontMenuSize, setFontMenuSize] = useState(settings.fontSizePx);
  const [lineSpacingMenu, setLineSpacingMenu] = useState(settings.lineSpacing);
  const [previewHtml, setPreviewHtml] = useState('');
  const [printing, setPrinting] = useState(false);
  const [status, setStatus] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const validationError = validateFreeCouponSettings(settings);
  const safeHtml = useMemo(() => sanitizeFreeCouponHtml(previewHtml), [previewHtml]);
  const hasText = Boolean(editorRef.current?.innerText.trim() || editorRef.current?.querySelector('hr'));

  useEffect(() => {
    if (validationError) return;
    const { preset, paperWidthMm, printableWidthMm, marginLeftMm, marginRightMm, marginTopMm, marginBottomMm, copies } = settings;
    try { localStorage.setItem(FREE_COUPON_SETTINGS_KEY, JSON.stringify({ preset, paperWidthMm, printableWidthMm, marginLeftMm, marginRightMm, marginTopMm, marginBottomMm, copies })); } catch { /* Preferences remain available for this session. */ }
  }, [settings, validationError]);

  const updateSetting = <K extends keyof FreeCouponSettings>(key: K, value: FreeCouponSettings[K]) => {
    setSettings(current => ({ ...current, [key]: value }));
    setStatus(null);
  };
  const saveSelection = () => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (editor.contains(range.commonAncestorContainer)) savedRangeRef.current = range.cloneRange();
  };
  const restoreSelection = () => {
    const editor = editorRef.current;
    const range = savedRangeRef.current;
    if (!editor || !range || !editor.contains(range.commonAncestorContainer)) return;
    editor.focus();
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  };
  const refreshPreview = () => {
    const editor = editorRef.current;
    if (!editor) return;
    setPreviewHtml(sanitizeFreeCouponHtml(editor.innerHTML));
    saveSelection();
    setStatus(null);
  };
  const runCommand = (command: Parameters<typeof applyCouponEditorCommand>[2], value?: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    restoreSelection();
    applyCouponEditorCommand(editor, document, command, value);
    refreshPreview();
  };
  const insertAtSelection = (html: string) => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) return;
    range.deleteContents();
    const fragment = range.createContextualFragment(html);
    const last = fragment.lastChild;
    range.insertNode(fragment);
    if (last) {
      range.setStartAfter(last);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  };
  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    const html = event.clipboardData.getData('text/html');
    if (html) insertAtSelection(sanitizeFreeCouponHtml(html));
    else {
      const text = event.clipboardData.getData('text/plain');
      const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r?\n/g, '<br>');
      insertAtSelection(escaped);
    }
    refreshPreview();
  };
  const pasteFromClipboard = async () => {
    restoreSelection();
    try {
      const text = await navigator.clipboard.readText();
      const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r?\n/g, '<br>');
      insertAtSelection(escaped);
      refreshPreview();
    } catch {
      setStatus({ kind: 'error', text: 'O Windows não permitiu acessar a área de transferência. Use Ctrl+V no editor.' });
    }
  };
  const changeFontSize = (value: number) => {
    const editor = editorRef.current;
    if (!editor) return;
    restoreSelection();
    applyCouponFontSize(editor, document, value);
    setFontMenuSize(value);
    refreshPreview();
  };
  const changeLineSpacing = (value: number) => {
    const editor = editorRef.current;
    if (!editor) return;
    restoreSelection();
    if (!applyCouponLineSpacing(editor, document, value)) {
      setStatus({ kind: 'error', text: 'Selecione um parágrafo ou posicione o cursor no parágrafo para alterar o espaçamento.' });
      return;
    }
    setLineSpacingMenu(value);
    refreshPreview();
  };
  const clearDocument = () => {
    if (editorRef.current?.innerText.trim() && !window.confirm('Limpar todo o texto deste Cupom Livre?')) return;
    if (editorRef.current) editorRef.current.innerHTML = '';
    setPreviewHtml('');
    savedRangeRef.current = null;
    setStatus(null);
  };
  const printDocument = async () => {
    if (!(editorRef.current?.innerText.trim() || editorRef.current?.querySelector('hr')) || validationError || printing) return;
    const electronWindow = window as Window & { require?: (name: string) => { ipcRenderer: { invoke: (channel: string, html: string, preferences: FreeCouponSettings) => Promise<{ success: boolean; error?: string }> } } };
    if (!electronWindow.require) {
      setStatus({ kind: 'error', text: 'A impressão silenciosa está disponível no aplicativo desktop do iChaveiro.' });
      return;
    }
    setPrinting(true);
    setStatus(null);
    try {
      const html = freeCouponPrintHtml(editorRef.current.innerHTML, settings);
      const result = await electronWindow.require('electron').ipcRenderer.invoke('print-free-coupon', html, settings);
      setStatus(result.success
        ? { kind: 'success', text: `${settings.copies} ${settings.copies === 1 ? 'cópia enviada' : 'cópias enviadas'} para a impressora padrão do Windows.` }
        : { kind: 'error', text: result.error || 'A impressora não aceitou o trabalho. Confira as medidas do papel e o driver.' });
    } catch (error) {
      setStatus({ kind: 'error', text: error instanceof Error ? error.message : 'Não foi possível preparar a impressão.' });
    } finally { setPrinting(false); }
  };
  const paperStyle = {
    width: `${settings.paperWidthMm}mm`,
    padding: `${settings.marginTopMm}mm ${settings.marginRightMm}mm ${settings.marginBottomMm}mm ${settings.marginLeftMm}mm`
  };
  const contentStyle = {
    width: `${settings.printableWidthMm}mm`,
    fontFamily: settings.fontFamily,
    fontSize: `${settings.fontSizePx}px`,
    lineHeight: settings.lineSpacing
  };
  const group = (...buttons: ReactNode[]) => <div className="free-coupon-tool-group">{buttons}</div>;
  const toolButton = (label: string, Icon: typeof Bold, action: () => void, disabled = false) => <button key={label} type="button" title={label} aria-label={label} disabled={disabled} onMouseDown={event => event.preventDefault()} onClick={action}><Icon size={16} /></button>;

  return <div className="free-coupon-page">
    <header className="free-coupon-heading"><div><h1>Cupom Livre</h1><p>Escreva e imprima avisos ou comunicados em papel térmico. O texto não é salvo.</p></div><div className="free-coupon-actions"><button type="button" className="free-coupon-clear" onClick={clearDocument}><Trash2 size={17} /> Limpar</button><button type="button" className="free-coupon-print" disabled={!hasText || !!validationError || printing} onClick={printDocument}><Printer size={17} /> {printing ? 'Enviando…' : 'Imprimir'}</button></div></header>
    <section className="free-coupon-settings" aria-label="Configurações do papel">
      <label>Largura física<select value={settings.preset} onChange={event => setSettings(current => settingsForPaperPreset(event.target.value as FreeCouponSettings['preset'], current))}><option value="58">58 mm</option><option value="80">80 mm</option><option value="custom">Personalizada</option></select></label>
      {settings.preset === 'custom' && <label>Papel (mm)<input type="number" min="40" max="120" step="1" value={settings.paperWidthMm} onChange={event => updateSetting('paperWidthMm', Number(event.target.value))} /></label>}
      <label>Área imprimível (mm)<input type="number" min="20" max={settings.paperWidthMm} step="0.5" value={settings.printableWidthMm} onChange={event => updateSetting('printableWidthMm', Number(event.target.value))} /></label>
      <label>Margem esquerda (mm)<input type="number" min="0" max="50" step="0.5" value={settings.marginLeftMm} onChange={event => updateSetting('marginLeftMm', Number(event.target.value))} /></label>
      <label>Margem direita (mm)<input type="number" min="0" max="50" step="0.5" value={settings.marginRightMm} onChange={event => updateSetting('marginRightMm', Number(event.target.value))} /></label>
      <label>Margem superior (mm)<input type="number" min="0" max="50" step="0.5" value={settings.marginTopMm} onChange={event => updateSetting('marginTopMm', Number(event.target.value))} /></label>
      <label>Margem inferior (mm)<input type="number" min="0" max="50" step="0.5" value={settings.marginBottomMm} onChange={event => updateSetting('marginBottomMm', Number(event.target.value))} /></label>
      <label>Cópias<input type="number" min="1" max="20" step="1" value={settings.copies} onChange={event => updateSetting('copies', Number(event.target.value))} /></label>
    </section>
    {validationError && <p role="alert" className="free-coupon-validation">{validationError}</p>}
    <div className="free-coupon-layout">
      <section className="free-coupon-editor-panel">
        <div className="free-coupon-toolbar" aria-label="Formatação do texto">
          {group(toolButton('Negrito', Bold, () => runCommand('bold')), toolButton('Itálico', Italic, () => runCommand('italic')), toolButton('Sublinhado', Underline, () => runCommand('underline')), toolButton('Diminuir fonte', Minus, () => changeFontSize(Math.max(8, fontMenuSize - 2))), toolButton('Aumentar fonte', Plus, () => changeFontSize(Math.min(48, fontMenuSize + 2))))}
          {group(toolButton('Alinhar à esquerda', AlignLeft, () => runCommand('justifyLeft')), toolButton('Centralizar', AlignCenter, () => runCommand('justifyCenter')), toolButton('Alinhar à direita', AlignRight, () => runCommand('justifyRight')), toolButton('Justificar', AlignJustify, () => runCommand('justifyFull')))}
          {group(toolButton('Lista com marcadores', List, () => runCommand('insertUnorderedList')), toolButton('Lista numerada', ListOrdered, () => runCommand('insertOrderedList')), toolButton('Linha divisória', Minus, () => runCommand('insertHorizontalRule')))}
          {group(toolButton('Desfazer', Undo2, () => runCommand('undo')), toolButton('Refazer', Redo2, () => runCommand('redo')), toolButton('Copiar', Copy, () => runCommand('copy')), toolButton('Recortar', Scissors, () => runCommand('cut')), toolButton('Colar texto', ClipboardPaste, () => void pasteFromClipboard()), toolButton('Limpar formatação da seleção', Eraser, () => { const editor = editorRef.current; if (editor) { restoreSelection(); clearCouponEditorFormatting(editor, document); refreshPreview(); } }))}
          <select aria-label="Família da fonte" defaultValue={settings.fontFamily} onMouseDown={saveSelection} onFocus={saveSelection} onChange={event => { restoreSelection(); runCommand('fontName', event.target.value); }}><option value="" disabled>Fonte</option>{FREE_COUPON_FONTS.map(font => <option value={font} key={font}>{font}</option>)}</select>
          <select aria-label="Tamanho da fonte" value={fontMenuSize} onMouseDown={saveSelection} onFocus={saveSelection} onChange={event => changeFontSize(Number(event.target.value))}>{[8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 42, 48].map(size => <option value={size} key={size}>{size} px</option>)}</select>
          <select aria-label="Espaçamento entre linhas" value={lineSpacingMenu} onMouseDown={saveSelection} onFocus={saveSelection} onChange={event => changeLineSpacing(Number(event.target.value))}><option value="1">Simples</option><option value="1.15">1,15</option><option value="1.25">1,25</option><option value="1.5">1,5</option><option value="2">Duplo</option><option value="2.5">2,5</option><option value="3">Triplo</option></select>
        </div>
        <div className="free-coupon-editor-scroll">
          <div ref={editorRef} className="free-coupon-editor" contentEditable suppressContentEditableWarning role="textbox" aria-label="Editor do Cupom Livre" aria-multiline="true" data-placeholder="Digite o texto do seu aviso…" style={{ fontFamily: settings.fontFamily, fontSize: `${settings.fontSizePx}px`, lineHeight: settings.lineSpacing }} onMouseUp={saveSelection} onKeyUp={saveSelection} onInput={refreshPreview} onPaste={handlePaste} />
        </div>
        <small className="free-coupon-hint">A seleção ativa recebe a formatação. Copiar, recortar e colar também funcionam pelos atalhos do Windows.</small>
      </section>
      <section className="free-coupon-preview-panel"><div className="free-coupon-preview-heading"><h2>Pré-visualização</h2><small>Papel térmico · impressora padrão do Windows</small></div><div className="free-coupon-preview-scroll"><div className="free-coupon-paper" style={paperStyle}><div className="free-coupon-paper-content" style={contentStyle} dangerouslySetInnerHTML={{ __html: safeHtml }} /></div>{!safeHtml && <div className="free-coupon-empty-hint">O papel está em branco.</div>}</div></section>
    </div>
    {status && <p role="status" className={`free-coupon-status ${status.kind}`}>{status.text}</p>}
    <p className="free-coupon-printer-note">Padrão baseado no cupom atual: 80 mm físicos, 76 mm imprimíveis e margens laterais de 2 mm. O aplicativo não possui seleção de impressora; este documento usa a impressora padrão configurada no Windows. O comprimento é ajustado ao conteúdo, sujeito aos limites do driver.</p>
  </div>;
}
