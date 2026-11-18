const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function load(relativePath) {
  const source = fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(require, module, module.exports);
  return module.exports;
}
const coupon = load('src/db/freeCoupon.ts');
const settings = { ...coupon.DEFAULT_FREE_COUPON_SETTINGS };

test('formatação aplica-se ao trecho selecionado e respeita tamanho exato da fonte', () => {
  let inserted;
  const editor = { contains: () => true, focus() {} };
  const selectedText = { textContent: 'AVISO IMPORTANTE' };
  const range = {
    collapsed: false, commonAncestorContainer: editor,
    extractContents: () => selectedText,
    insertNode: node => { inserted = node; }
  };
  let activeRange = range;
  const selection = { rangeCount: 1, getRangeAt: () => activeRange, removeAllRanges() {}, addRange: value => { activeRange = value; } };
  const doc = {
    getSelection: () => selection,
    createElement: tag => ({ tagName: tag, style: {}, children: [], appendChild(node) { this.children.push(node); } }),
    createRange: () => ({ selectNodeContents(node) { this.node = node; }, collapse() {} })
  };
  assert.equal(coupon.applyCouponFontSize(editor, doc, 32), true);
  assert.equal(inserted.style.fontSize, '32px');
  assert.equal(inserted.children[0], selectedText);
  assert.equal(coupon.applyCouponFontSize(editor, doc, 49), false);
});

test('comandos ricos mantêm o editor focado para formatar a seleção ativa', () => {
  let focused = false;
  let command;
  const editor = { focus() { focused = true; } };
  const doc = { execCommand: (...args) => { command = args; return true; } };
  assert.equal(coupon.applyCouponEditorCommand(editor, doc, 'bold'), true);
  assert.equal(focused, true);
  assert.deepEqual(command, ['bold', false, undefined]);
  assert.equal(coupon.applyCouponEditorCommand(editor, doc, 'fontName', 'Comic Sans'), false);
});

test('espaçamento de linha afeta apenas os parágrafos selecionados', () => {
  const first = { style: {}, id: 1 };
  const second = { style: {}, id: 2 };
  const third = { style: {}, id: 3 };
  const range = { intersectsNode: block => block.id < 3 };
  const doc = { getSelection: () => ({ rangeCount: 1, getRangeAt: () => range, anchorNode: null }) };
  const editor = { querySelectorAll: () => [first, second, third], contains: () => true };
  assert.equal(coupon.applyCouponLineSpacing(editor, doc, 2), true);
  assert.equal(first.style.lineHeight, '2');
  assert.equal(second.style.lineHeight, '2');
  assert.equal(third.style.lineHeight, undefined);
});

test('largura física e imprimível validam margens e presets de 58 e 80 mm', () => {
  assert.equal(coupon.validateFreeCouponSettings(settings), undefined);
  assert.deepEqual(
    [coupon.settingsForPaperPreset('58', settings).paperWidthMm, coupon.settingsForPaperPreset('58', settings).printableWidthMm],
    [58, 48]
  );
  assert.deepEqual(
    [coupon.settingsForPaperPreset('80', settings).paperWidthMm, coupon.settingsForPaperPreset('80', settings).printableWidthMm],
    [80, 76]
  );
  assert.match(coupon.validateFreeCouponSettings({ ...settings, printableWidthMm: 77 }), /excedem a largura física/);
  assert.match(coupon.validateFreeCouponSettings({ ...settings, paperWidthMm: 39 }), /entre 40 e 120/);
});

test('prévia e impressão usam a mesma largura, quebra automática e margens físicas em branco', () => {
  const html = coupon.freeCouponPrintHtml('<p>AVISO em português</p>', settings);
  assert.match(html, /width:80mm/);
  assert.match(html, /width:76mm/);
  assert.match(html, /padding:5mm 2mm 5mm 2mm/);
  assert.match(html, /overflow-wrap:anywhere/);
  assert.match(html, /@page\{margin:0\}/);
  assert.doesNotMatch(html, /\.\s*<\/div>|<div[^>]*>\s*\.<\/div>/);
  assert.match(html, /AVISO em português/);
});

test('sanitização preserva formatação permitida e acentos, removendo eventos, cores e scripts', () => {
  const html = coupon.sanitizeFreeCouponHtml('<p onclick="alert(1)"><strong style="font-size:18px;color:red">Ação</strong><img src=x onerror=alert(2)></p><script>alert(3)</script>');
  assert.equal(html, '<p><strong style="font-size:18px">Ação</strong></p>');
  assert.doesNotMatch(html, /onclick|onerror|script|color|img/i);
});

test('comprimento de impressão varia com o conteúdo e respeita cópias e largura personalizadas', () => {
  const threeLines = coupon.freeCouponPageSize({ ...settings, copies: 3, preset: 'custom', paperWidthMm: 72, printableWidthMm: 68, marginLeftMm: 2, marginRightMm: 2 }, 180);
  const hundredsLines = coupon.freeCouponPageSize(settings, 8000);
  assert.equal(threeLines.width, 72000);
  assert.equal(threeLines.copies, 3);
  assert.ok(threeLines.height < hundredsLines.height);
  assert.equal(hundredsLines.width, 80000);
  const longDocument = coupon.freeCouponPrintHtml('<p>Ação com acentuação</p>'.repeat(500), settings);
  assert.equal((longDocument.match(/Ação com acentuação/g) || []).length, 500);
  assert.doesNotMatch(longDocument, /page-break|height:\\s*\d+px/);
  assert.match(coupon.validateFreeCouponSettings({ ...settings, copies: 21 }), /cópias deve ficar/);
});

test('Cupom Livre é independente do banco, caixa, estoque, históricos e cupom de venda', () => {
  const page = fs.readFileSync(path.join(__dirname, '..', 'src/pages/FreeCoupon.tsx'), 'utf8');
  const app = fs.readFileSync(path.join(__dirname, '..', 'src/App.tsx'), 'utf8');
  const sidebar = fs.readFileSync(path.join(__dirname, '..', 'src/components/Sidebar.tsx'), 'utf8');
  const main = fs.readFileSync(path.join(__dirname, '..', 'electron/main.cjs'), 'utf8');
  const pos = fs.readFileSync(path.join(__dirname, '..', 'src/pages/Pos.tsx'), 'utf8');
  assert.match(app, /cupom-livre.*FreeCoupon/);
  assert.match(sidebar, /to="\/cupom-livre"[\s\S]*?Printer[\s\S]*?Cupom Livre/);
  assert.doesNotMatch(page, /from ['"].*db\/db|db\.transactions|db\.products|registerSale|stock/i);
  assert.doesNotMatch(page, /Salvar documento|Exportar PDF|modelo salvo|Histórico de documentos/i);
  assert.match(page, /localStorage\.setItem\(FREE_COUPON_SETTINGS_KEY, JSON\.stringify\(\{ preset, paperWidthMm, printableWidthMm, marginLeftMm, marginRightMm, marginTopMm, marginBottomMm, copies \}\)\)/);
  assert.doesNotMatch(main, /print-free-coupon[\s\S]{0,2200}db\.transactions|print-free-coupon[\s\S]{0,2200}db\.products/i);
  assert.match(main, /ipcMain\.on\('print-receipt'/);
  assert.match(main, /ipcMain\.handle\('print-free-coupon'/);
  assert.match(main, /silent: true,[\s\S]*?color: false,[\s\S]*?copies: settings\.copies,[\s\S]*?pageSize,[\s\S]*?margins: \{ marginType: 'none' \}/);
  assert.match(pos, /<div class="text-left" style="font-size: 10px; margin-left: 5px;">\.<\/div>\s*<div class="text-left" style="font-size: 10px; margin-left: 5px;">\.<\/div>\s*<div class="text-left" style="font-size: 10px; margin-left: 5px;">\.<\/div>\s*<div class="text-left" style="font-size: 10px; margin-left: 5px;">\.<\/div>\s*<div class="text-left" style="font-size: 10px; margin-left: 5px;">\.<\/div>\s*<div class="text-center header-title">/);
  assert.match(pos, /Insta - @chaveiroecutelaria\.lidio\.rj/);
});
