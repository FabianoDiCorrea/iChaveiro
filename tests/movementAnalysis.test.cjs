const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function load(relativePath, dependencies = {}) {
  const source = fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => dependencies[name] || require(name), module, module.exports);
  return module.exports;
}

const finance = load('src/db/financialAllocation.ts');
const classification = load('src/db/commercialClassification.ts');
const math = load('src/db/managementMath.ts');
const movement = load('src/db/movementAnalysis.ts', {
  './financialAllocation': finance,
  './commercialClassification': classification,
  './managementMath': math
});

const products = [
  { id: 1, profile: 'chaveiro', name: 'Chave comum ', code: '799', price: 12, costPrice: 2, stock: 10, hasStock: true, isService: false, serviceType: 'key', commercialGroup: 'Outros serviços' },
  { id: 2, profile: 'chaveiro', name: 'Afiação Alicate Cutícula', code: '1', price: 15, costPrice: 0, stock: 0, hasStock: false, serviceType: 'plier', commercialGroup: 'Precisa classificar' },
  { id: 3, profile: 'chaveiro', name: 'Chave TETRA', code: '04', price: 20, costPrice: 4, stock: 5, hasStock: true, isService: false, serviceType: 'key', commercialActivity: 'merchandise', commercialGroup: 'Outras mercadorias' },
  { id: 4, profile: 'chaveiro', name: 'Alicate 722 Profissional Novo já Afiado', code: '722', price: 55, costPrice: 25, stock: 3, hasStock: true, isService: false, serviceType: 'plier', commercialActivity: 'merchandise', commercialGroup: 'Venda de alicates' },
  { id: 5, profile: 'chaveiro', name: 'Afiação de espátula de cutícula', code: '7', price: 10, costPrice: 0, stock: 0, hasStock: false, isService: true, serviceType: 'plier' },
  { id: 6, profile: 'chaveiro', name: 'Cadeado STAM com 2 chaves', code: '20MM', price: 30, costPrice: 10, stock: 3, hasStock: true, isService: false, serviceType: 'key' }
];

function sale(items, extra = {}) {
  return {
    id: 10, profile: 'chaveiro', type: 'sale', items, total: items.reduce((sum, item) => sum + item.total, 0),
    discount: 6, paymentMethod: 'split', splitPayments: [{ method: 'cash', amount: 40 }, { method: 'debit', amount: 45 }],
    date: new Date('2026-11-05T15:20:00-03:00'), ...extra
  };
}

const item = (productId, name, service, quantity, total, extra = {}) => ({ service, name, productId, quantity, price: total / quantity, total, cost: 2, ...extra });
const keyItem = (quantity, total, extra = {}) => item(1, 'Chave comum 799', 'key', quantity, total, { isService: false, ...extra });
const sharpenItem = (quantity, total, extra = {}) => item(2, 'Afiação Alicate Cutícula', 'plier', quantity, total, extra);
const merchandiseItem = (quantity, total, extra = {}) => item(4, 'Alicate 722 Profissional Novo já Afiado', 'plier', quantity, total, { isService: false, ...extra });
const filters = (extra = {}) => ({ activity: 'all', groupKey: '', itemKey: '', query: '', ...extra });
const totalsForGroup = (rows, groupKey) => movement.movementTotals(movement.movementRows(rows, products, 'todos', filters({ groupKey })));

test('classifica catálogo antigo mesmo quando usa sinalizador ou grupo genérico incorreto', () => {
  const common = classification.classifyCommercialItem({ service: 'key', name: 'Chave comum', isService: false }, products[0]);
  const tetra = classification.classifyCommercialItem({ service: 'key', name: 'Chave TETRA', isService: false }, products[2]);
  const sharpen = classification.classifyCommercialItem({ service: 'plier', name: products[1].name }, products[1]);
  assert.deepEqual([common.activity, common.group], ['service', 'Cópias de chaves comuns']);
  assert.deepEqual([tetra.activity, tetra.group], ['service', 'Cópias de chaves tetra']);
  assert.deepEqual([sharpen.activity, sharpen.group], ['service', 'Afiação de alicates']);
  assert.equal(classification.classifyCommercialItem({ service: 'key', name: 'Cópias de Chaves Comuns' }).group, 'Cópias de chaves comuns');
  assert.equal(classification.classifyCommercialItem({ service: 'key', name: 'Cópia de chave tetra' }).group, 'Cópias de chaves tetra');
  assert.equal(classification.classifyCommercialItem({ service: 'plier', name: 'Afiações de alicates' }).group, 'Afiação de alicates');
});

test('todos os grupos principais aparecem mesmo sem produto ou venda no período', () => {
  const options = classification.commercialGroupOptions();
  for (const label of ['Afiação de alicates', 'Cópias de chaves comuns', 'Cópias de chaves tetra']) {
    assert.equal(options.filter(option => option.group === label).length, 1);
  }
  assert.deepEqual(totalsForGroup([], 'service:Afiação de alicates'), { sales: 0, units: 0, revenueCents: 0, averageSaleCents: 0, transactionCount: 0 });
});

test('normaliza acentos, caixa e espaços e preserva grupo manual válido', () => {
  assert.equal(classification.normalizeCommercialText('  CÓPIAS   DE Chaves TÉTRA  '), 'copias de chaves tetra');
  const manual = { ...products[0], commercialGroup: 'Chaves residenciais especiais' };
  assert.equal(classification.classifyCommercialItem({ service: 'key', name: manual.name, isService: false }, manual).group, 'Chaves residenciais especiais');
  assert.equal(classification.commercialGroupOptions([{ activity: 'service', group: 'CÓPIAS   DE CHAVES COMUNS', groupKey: 'service:CÓPIAS   DE CHAVES COMUNS' }]).filter(option => option.group === 'Cópias de chaves comuns').length, 1);
});

test('Metas consultam o mesmo classificador compartilhado de Movimento e Rentabilidade', () => {
  const commonItem = { service: 'key', name: 'Chave comum 799', isService: false };
  const sharpenItemData = { service: 'plier', name: 'Afiação Alicate Cutícula' };
  assert.equal(classification.commercialGoalItemMatches(commonItem, products[0], 'services'), true);
  assert.equal(classification.commercialGoalItemMatches(commonItem, products[0], 'key_copies'), true);
  assert.equal(classification.commercialGoalItemMatches(commonItem, products[0], 'category', 'group:service:Cópias de chaves comuns'), true);
  assert.equal(classification.commercialGoalItemMatches(sharpenItemData, products[1], 'plier_sharpening'), true);
  assert.equal(classification.commercialGoalItemMatches({ service: 'plier', name: products[3].name, isService: false }, products[3], 'plier_sharpening'), false);
});

test('não mistura afiação de alicate com venda de alicate novo já afiado', () => {
  const sold = classification.classifyCommercialItem({ service: 'plier', name: products[3].name, isService: false }, products[3]);
  assert.deepEqual([sold.activity, sold.group], ['merchandise', 'Venda de alicates']);
  assert.equal(classification.classifyCommercialItem({ service: 'plier', name: products[4].name, isService: true }, products[4]).group, 'Afiação de espátulas');
  assert.equal(classification.classifyCommercialItem({ service: 'key', name: products[5].name, isService: false }, products[5]).activity, 'merchandise');
});

test('venda com grupos distintos conta uma venda e distribui desconto proporcionalmente', () => {
  const transaction = sale([keyItem(3, 36), sharpenItem(2, 30), merchandiseItem(1, 55)], { total: 115 });
  const rows = movement.movementRows([transaction], products, 'todos', filters());
  const all = movement.movementTotals(rows);
  assert.deepEqual([all.sales, all.units, all.revenueCents], [1, 6, 11500]);
  const keys = totalsForGroup([transaction], 'service:Cópias de chaves comuns');
  const sharpening = totalsForGroup([transaction], 'service:Afiação de alicates');
  const pliers = totalsForGroup([transaction], 'merchandise:Venda de alicates');
  assert.deepEqual([keys.units, keys.revenueCents], [3, 3422]);
  assert.deepEqual([sharpening.units, sharpening.revenueCents], [2, 2851]);
  assert.deepEqual([pliers.units, pliers.revenueCents], [1, 5227]);
  assert.equal(keys.revenueCents + sharpening.revenueCents + pliers.revenueCents, all.revenueCents);
});

test('tetra e grupos comerciais filtram receita e unidades dos itens correspondentes', () => {
  const tetra = item(3, 'Chave TETRA 04', 'key', 2, 40, { isService: false });
  const transaction = sale([tetra, sharpenItem(1, 15), merchandiseItem(1, 55)], { total: 110, discount: 0 });
  assert.deepEqual(Object.values(totalsForGroup([transaction], 'service:Cópias de chaves tetra')).slice(0, 3), [1, 2, 4000]);
  assert.deepEqual(Object.values(totalsForGroup([transaction], 'service:Afiação de alicates')).slice(0, 3), [1, 1, 1500]);
  assert.deepEqual(Object.values(totalsForGroup([transaction], 'merchandise:Venda de alicates')).slice(0, 3), [1, 1, 5500]);
});

test('pesquisa por código e descrição ignora acentos e maiúsculas', () => {
  const transaction = sale([keyItem(1, 12), sharpenItem(1, 15), merchandiseItem(1, 55)], { total: 82 });
  const codeMatch = movement.movementTotals(movement.movementRows([transaction], products, 'todos', filters({ query: '799' })));
  const accentMatch = movement.movementTotals(movement.movementRows([transaction], products, 'todos', filters({ query: 'AFIAÇÃO ALICATE' })));
  assert.deepEqual([codeMatch.sales, codeMatch.units], [1, 1]);
  assert.deepEqual([accentMatch.sales, accentMatch.units], [1, 1]);
});

test('itens repetidos somam unidades sem duplicar a contagem de vendas', () => {
  const transaction = sale([keyItem(1, 12), keyItem(2, 24)], { total: 36, discount: 0 });
  const rows = movement.movementRows([transaction], products, 'todos', filters({ groupKey: 'service:Cópias de chaves comuns' }));
  assert.equal(rows.length, 1);
  assert.deepEqual([movement.movementTotals(rows).sales, movement.movementTotals(rows).units], [1, 3]);
  assert.equal(rows[0].items.length, 2);
});

test('filtro de perfil mantém divisão financeira por item e não duplica a venda física', () => {
  const shared = sale([
    keyItem(2, 24, { financialProfile: 'chaveiro' }),
    item(6, products[5].name, 'key', 1, 40, { isService: false, financialProfile: 'fabiano' })
  ], { total: 64, discount: 0 });
  const chaveiro = movement.movementTotals(movement.movementRows([shared], products, 'chaveiro', filters()));
  const fabiano = movement.movementTotals(movement.movementRows([shared], products, 'fabiano', filters()));
  assert.deepEqual([chaveiro.sales, chaveiro.units, chaveiro.revenueCents], [1, 2, 2400]);
  assert.deepEqual([fabiano.sales, fabiano.units, fabiano.revenueCents], [1, 1, 4000]);
  assert.equal(movement.movementTotals(movement.movementRows([shared], products, 'todos', filters())).sales, 1);
});

test('devoluções reduzem unidades e receita dos mesmos grupos', () => {
  const original = sale([keyItem(3, 36)], { total: 36, discount: 0 });
  const returned = { id: 11, profile: 'chaveiro', type: 'return', returnOfTransactionId: original.id, items: [keyItem(1, 12)], total: 12, paymentMethod: 'cash', date: new Date('2026-11-06T10:00:00-03:00') };
  const result = totalsForGroup([original, returned], 'service:Cópias de chaves comuns');
  assert.deepEqual([result.sales, result.units, result.revenueCents], [1, 2, 2400]);
});

test('horários, calendário e períodos do mês usam a mesma classificação e os mesmos itens', () => {
  const rows = [
    sale([keyItem(1, 12)], { id: 20, date: new Date('2026-11-05T15:30:00-03:00'), discount: 0 }),
    sale([keyItem(1, 12)], { id: 21, date: new Date('2026-11-05T16:00:00-03:00'), discount: 0 }),
    sale([keyItem(1, 12)], { id: 22, date: new Date('2026-11-12T15:45:00-03:00'), discount: 0 })
  ];
  const filtered = movement.movementRows(rows, products, 'todos', filters({ groupKey: 'service:Cópias de chaves comuns' }));
  assert.equal(movement.movementTotals(movement.movementRowsForHour(filtered, 15, 16, 4)).sales, 2);
  assert.equal(movement.movementTotals(movement.movementRowsForDate(filtered, '2026-11-05')).sales, 2);
  assert.equal(movement.movementTotals(movement.movementRowsForDayBand(filtered, 1, 5)).sales, 2);
});
