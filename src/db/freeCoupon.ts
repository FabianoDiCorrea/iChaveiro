export type PaperPreset = '58' | '80' | 'custom';

export interface FreeCouponSettings {
  preset: PaperPreset;
  paperWidthMm: number;
  printableWidthMm: number;
  marginLeftMm: number;
  marginRightMm: number;
  marginTopMm: number;
  marginBottomMm: number;
  copies: number;
  fontFamily: string;
  fontSizePx: number;
  lineSpacing: number;
}

export const FREE_COUPON_SETTINGS_KEY = 'ichaveiro.freeCoupon.settings.v1';
export const DEFAULT_FREE_COUPON_SETTINGS: FreeCouponSettings = {
  preset: '80', paperWidthMm: 80, printableWidthMm: 76,
  marginLeftMm: 2, marginRightMm: 2, marginTopMm: 5, marginBottomMm: 5,
  copies: 1, fontFamily: 'Arial', fontSizePx: 12, lineSpacing: 1.25
};
export const FREE_COUPON_FONTS = ['Arial', 'Tahoma', 'Verdana', 'Georgia', 'Times New Roman', 'Courier New'] as const;

const finite = (value: number) => Number.isFinite(value);
export function validateFreeCouponSettings(settings: FreeCouponSettings): string | undefined {
  if (!finite(settings.paperWidthMm) || settings.paperWidthMm < 40 || settings.paperWidthMm > 120) return 'A largura física deve ficar entre 40 e 120 mm.';
  if (!finite(settings.printableWidthMm) || settings.printableWidthMm < 20) return 'A largura imprimível deve ser de pelo menos 20 mm.';
  if (![settings.marginLeftMm, settings.marginRightMm, settings.marginTopMm, settings.marginBottomMm].every(value => finite(value) && value >= 0 && value <= 50)) return 'Cada margem deve ficar entre 0 e 50 mm.';
  if (settings.printableWidthMm + settings.marginLeftMm + settings.marginRightMm > settings.paperWidthMm + 0.001) return 'A largura imprimível e as margens laterais excedem a largura física do papel.';
  if (!Number.isInteger(settings.copies) || settings.copies < 1 || settings.copies > 20) return 'A quantidade de cópias deve ficar entre 1 e 20.';
  if (!(FREE_COUPON_FONTS as readonly string[]).includes(settings.fontFamily)) return 'Selecione uma família de fonte disponível.';
  if (!finite(settings.fontSizePx) || settings.fontSizePx < 8 || settings.fontSizePx > 48) return 'O tamanho padrão da fonte deve ficar entre 8 e 48 px.';
  if (!finite(settings.lineSpacing) || settings.lineSpacing < 1 || settings.lineSpacing > 3) return 'O espaçamento entre linhas deve ficar entre 1 e 3.';
  return undefined;
}

export function settingsForPaperPreset(preset: PaperPreset, current: FreeCouponSettings): FreeCouponSettings {
  if (preset === 'custom') return { ...current, preset };
  const width = Number(preset);
  const printable = preset === '58' ? 48 : 76;
  const side = (width - printable) / 2;
  return { ...current, preset, paperWidthMm: width, printableWidthMm: printable, marginLeftMm: side, marginRightMm: side };
}

const allowedTags = new Set(['p', 'div', 'br', 'b', 'strong', 'i', 'em', 'u', 'span', 'ul', 'ol', 'li', 'blockquote', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'font']);
const escapeAttribute = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const allowedFont = (value: string) => FREE_COUPON_FONTS.find(font => font.toLowerCase() === value.replace(/["']/g, '').trim().toLowerCase());

function safeInlineStyle(rawStyle: string, fontFace?: string, legacySize?: string): string {
  const values = new Map<string, string>();
  for (const declaration of rawStyle.split(';')) {
    const separator = declaration.indexOf(':');
    if (separator < 0) continue;
    const property = declaration.slice(0, separator).trim().toLowerCase();
    const value = declaration.slice(separator + 1).trim();
    if (!value || /url\s*\(|expression|javascript/i.test(value)) continue;
    if (property === 'font-family') {
      const font = allowedFont(value.split(',')[0]);
      if (font) values.set(property, font);
    } else if (property === 'font-size') {
      const pixels = Number.parseFloat(value);
      if (Number.isFinite(pixels)) values.set(property, `${Math.max(8, Math.min(48, pixels))}px`);
    } else if (property === 'line-height') {
      const lineHeight = Number.parseFloat(value);
      if (Number.isFinite(lineHeight)) values.set(property, String(Math.max(1, Math.min(3, lineHeight))));
    } else if (property === 'text-align' && ['left', 'right', 'center', 'justify', 'start', 'end'].includes(value.toLowerCase())) values.set(property, value.toLowerCase());
    else if (property === 'font-weight' && /^(normal|bold|[1-9]00)$/i.test(value)) values.set(property, value.toLowerCase());
    else if (property === 'font-style' && /^(normal|italic|oblique)$/i.test(value)) values.set(property, value.toLowerCase());
    else if (property === 'text-decoration' && /^(none|underline|line-through|overline)(\s+(underline|line-through|overline))*$/i.test(value)) values.set(property, value.toLowerCase());
  }
  const font = fontFace && allowedFont(fontFace);
  if (font) values.set('font-family', font);
  if (legacySize) {
    const size = Number(legacySize);
    if (Number.isFinite(size)) values.set('font-size', `${[8, 10, 12, 14, 18, 24, 32][Math.max(1, Math.min(7, size)) - 1]}px`);
  }
  return [...values.entries()].map(([property, value]) => `${property}:${value}`).join(';');
}

/** Whitelist-based sanitizer shared by the live preview and thermal print job. */
export function sanitizeFreeCouponHtml(input: string): string {
  const withoutActiveBlocks = input.replace(/<(script|style|iframe|object|embed|svg|math|form|input|button|textarea|select)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  const output: string[] = [];
  const tokens = /<\/?([a-z][\w-]*)\b([^>]*)>|([^<]+)|</gi;
  let match: RegExpExecArray | null;
  while ((match = tokens.exec(withoutActiveBlocks))) {
    if (match[3] !== undefined) { output.push(match[3]); continue; }
    const tag = match[1]?.toLowerCase();
    if (!tag || !allowedTags.has(tag)) continue;
    const closing = match[0].startsWith('</');
    if (closing) {
      if (tag !== 'br' && tag !== 'hr') output.push(`</${tag === 'font' ? 'span' : tag}>`);
      continue;
    }
    if (tag === 'hr' || tag === 'br') { output.push(`<${tag}>`); continue; }
    const styleAttribute = match[2].match(/\bstyle\s*=\s*(["'])(.*?)\1/i)?.[2] || '';
    const fontFace = tag === 'font' ? match[2].match(/\bface\s*=\s*(["']?)([^\s"'>]+(?:\s+[^\s"'>]+)*)\1/i)?.[2] : undefined;
    const legacySize = tag === 'font' ? match[2].match(/\bsize\s*=\s*["']?(\d+)["']?/i)?.[1] : undefined;
    const cleanStyle = safeInlineStyle(styleAttribute, fontFace, legacySize);
    const outputTag = tag === 'font' ? 'span' : tag;
    output.push(`<${outputTag}${cleanStyle ? ` style="${escapeAttribute(cleanStyle)}"` : ''}>`);
  }
  return output.join('');
}

export function freeCouponPrintHtml(contentHtml: string, settings: FreeCouponSettings): string {
  const error = validateFreeCouponSettings(settings);
  if (error) throw new Error(error);
  const safeHtml = sanitizeFreeCouponHtml(contentHtml);
  const family = settings.fontFamily;
  const spacing = settings.lineSpacing;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>Cupom Livre</title><style>
@page{margin:0}*{box-sizing:border-box}html,body{width:${settings.paperWidthMm}mm;margin:0;padding:0;background:#fff;color:#000}body{font-family:"${family}";font-size:${settings.fontSizePx}px;line-height:${spacing};font-weight:400;-webkit-print-color-adjust:exact;print-color-adjust:exact}.coupon-page{width:${settings.paperWidthMm}mm;padding:${settings.marginTopMm}mm ${settings.marginRightMm}mm ${settings.marginBottomMm}mm ${settings.marginLeftMm}mm}.coupon-content{width:${settings.printableWidthMm}mm;min-height:0;overflow-wrap:anywhere;word-break:normal;white-space:normal}.coupon-content p,.coupon-content div,.coupon-content blockquote{margin:0 0 .35em}.coupon-content ul,.coupon-content ol{margin:.2em 0;padding-left:1.5em}.coupon-content hr{border:0;border-top:1px solid #000;margin:.5em 0}.coupon-content img{display:none}</style></head><body><main class="coupon-page"><div class="coupon-content">${safeHtml}</div></main></body></html>`;
}

export function freeCouponPageSize(settings: FreeCouponSettings, measuredHeightPx: number) {
  const error = validateFreeCouponSettings(settings);
  if (error) throw new Error(error);
  if (!finite(measuredHeightPx) || measuredHeightPx <= 0) throw new Error('Não foi possível medir o comprimento do cupom.');
  return {
    width: Math.round(settings.paperWidthMm * 1000),
    height: Math.max(353, Math.ceil(measuredHeightPx * 25400 / 96)),
    copies: settings.copies
  };
}

export type EditorCommand = 'bold' | 'italic' | 'underline' | 'justifyLeft' | 'justifyCenter' | 'justifyRight' | 'justifyFull' | 'insertHorizontalRule' | 'insertUnorderedList' | 'insertOrderedList' | 'undo' | 'redo' | 'copy' | 'cut' | 'paste' | 'removeFormat' | 'fontName';
export function applyCouponFontSize(editor: HTMLElement, doc: Document, pixels: number): boolean {
  if (!finite(pixels) || pixels < 8 || pixels > 48) return false;
  const selection = doc.getSelection();
  if (!selection?.rangeCount) return false;
  const range = selection.getRangeAt(0);
  if (!editor.contains(range.commonAncestorContainer)) return false;
  const span = doc.createElement('span');
  span.style.fontSize = `${pixels}px`;
  if (range.collapsed) {
    const lineBreak = doc.createElement('br');
    span.appendChild(lineBreak);
    range.insertNode(span);
    const caret = doc.createRange();
    caret.setStart(span, 0);
    caret.collapse(true);
    selection.removeAllRanges();
    selection.addRange(caret);
    return true;
  }
  span.appendChild(range.extractContents());
  range.insertNode(span);
  const after = doc.createRange();
  after.selectNodeContents(span);
  after.collapse(false);
  selection.removeAllRanges();
  selection.addRange(after);
  return true;
}
export function applyCouponEditorCommand(editor: HTMLElement, doc: Document, command: EditorCommand, value?: string): boolean {
  editor.focus();
  if (command === 'fontName' && value && !(FREE_COUPON_FONTS as readonly string[]).includes(value)) return false;
  return doc.execCommand(command, false, value);
}

export function applyCouponLineSpacing(editor: HTMLElement, doc: Document, lineSpacing: number): boolean {
  if (!finite(lineSpacing) || lineSpacing < 1 || lineSpacing > 3) return false;
  const selection = doc.getSelection();
  if (!selection?.rangeCount) return false;
  const range = selection.getRangeAt(0);
  const blocks = Array.from(editor.querySelectorAll('p,div,li,blockquote,h1,h2,h3,h4,h5,h6'));
  const selected = blocks.filter(block => { try { return range.intersectsNode(block); } catch { return false; } });
  const caretBlock = selection.anchorNode?.nodeType === 1 ? (selection.anchorNode as Element).closest('p,div,li,blockquote,h1,h2,h3,h4,h5,h6') : selection.anchorNode?.parentElement?.closest('p,div,li,blockquote,h1,h2,h3,h4,h5,h6');
  const targets = selected.length ? selected : caretBlock && editor.contains(caretBlock) ? [caretBlock] : [];
  if (!targets.length) return false;
  targets.forEach(block => { (block as HTMLElement).style.lineHeight = String(lineSpacing); });
  return true;
}

export function clearCouponEditorFormatting(editor: HTMLElement, doc: Document): boolean {
  editor.focus();
  const didClear = doc.execCommand('removeFormat');
  const selection = doc.getSelection();
  if (!selection?.rangeCount) return didClear;
  const range = selection.getRangeAt(0);
  const blocks = Array.from(editor.querySelectorAll('p,div,li,blockquote,h1,h2,h3,h4,h5,h6'));
  const selected = blocks.filter(block => { try { return range.intersectsNode(block); } catch { return false; } });
  const targets = selected.length ? selected : selection.anchorNode?.parentElement?.closest('p,div,li,blockquote,h1,h2,h3,h4,h5,h6');
  (Array.isArray(targets) ? targets : targets ? [targets] : []).forEach(block => { (block as HTMLElement).removeAttribute('style'); });
  return didClear;
}
