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
const movement = load('src/db/movementAnalysis.ts', { './financialAllocation': finance, './commercialClassification': classification, './managementMath': math });
const activity = load('src/db/activityProfitability.ts', { './financialAllocation': finance, './commercialClassification': classification, './movementAnalysis': movement, './managementMath': math });
const product = (id, name, code, serviceType, options = {}) => ({ id, profile: 'chaveiro', name, code, price: options.price || 12, costPrice: options.cost || 2, stock: 10, hasStock: true, serviceType, ...options });
const products = [
  product(1, 'Chave comum', '799', 'key', { isService: false }),
  product(2, 'Chave tetra', '04', 'key', { isService: false }),
  product(3, 'Alicate novo', '722', 'plier', { isService: false, commercialActivity: 'merchandise', commercialGroup: 'Venda de alicates', costPrice: 25 }),
  product(4, 'Afiação alicate cutícula', 'A1', 'plier', { hasStock: false, isService: true, costPrice: 0 })
];
const item = (productId, name, service, quantity, price, cost, extra = {}) => ({ productId, name, service, quantity, price, total: quantity * price, cost, ...extra });
const transaction = (type, items, date) => ({ profile: 'chaveiro', type, items, total: items.reduce((sum, row) => sum + row.total, 0), discount: type === 'sale' ? 6 : 0, paymentMethod: 'cash', date: new Date(date) });
test('rentabilidade consolida grupos principais, desconto e devolucao conciliados', () => {
  const sold = transaction('sale', [
    item(1, 'Chave comum 799', 'key', 2, 12, 2, { isService: false }),
    item(2, 'Chave tetra 04', 'key', 1, 20, 4, { isService: false }),
    item(4, 'Afiação de alicate de cutícula', 'plier', 1, 15, 0, { isService: true }),
    item(3, 'Alicate novo 722', 'plier', 1, 55, 25, { isService: false })
  ], '2026-11-05T15:00:00-03:00');
  const returned = { ...transaction('return', [item(1, 'Chave comum 799', 'key', 1, 12, 2, { isService: false })], '2026-11-06T10:00:00-03:00'), total: 12 };
  const rows = activity.activityProfitabilityRows([sold, returned], products, 'todos', '2026-11-01', '2026-11-30');
  const keyCopies = rows.find(row => row.key === 'key-copies');
  assert.equal(keyCopies.quantity, 2);
  assert.equal(keyCopies.revenueCents, 2969);
  assert.equal(keyCopies.groups.flatMap(group => group.items).some(row => row.code === '799'), true);
  assert.equal(rows.find(row => row.key === 'plier-sharpening').revenueCents, 1421);
  assert.equal(rows.find(row => row.key === 'merchandise').revenueCents, 5210);
  assert.equal(rows.reduce((sum, row) => sum + row.revenueCents, 0), 9600);
  assert.equal(activity.activityMetricCanUseDonut(rows, 'revenue'), true);
  assert.equal(rows.find(row => row.key === 'plier-sharpening').marginCents, 1421);
});
test('rentabilidade respeita perfil financeiro e datas sem duplicar venda compartilhada', () => {
  const shared = {
    profile: 'chaveiro', type: 'sale', total: 30, discount: 3, paymentMethod: 'cash', date: new Date('2026-11-10T12:00:00-03:00'),
    items: [
      item(1, 'Chave comum 799', 'key', 1, 12, 2, { isService: false, financialProfile: 'chaveiro' }),
      item(3, 'Alicate novo 722', 'plier', 1, 18, 5, { isService: false, financialProfile: 'fabiano' })
    ]
  };
  const outside = { ...shared, date: new Date('2026-08-10T12:00:00-03:00') };
  const general = activity.activityProfitabilityRows([shared, outside], products, 'todos', '2026-11-01', '2026-11-30');
  const chaveiro = activity.activityProfitabilityRows([shared, outside], products, 'chaveiro', '2026-11-01', '2026-11-30');
  const fabiano = activity.activityProfitabilityRows([shared, outside], products, 'fabiano', '2026-11-01', '2026-11-30');
  const sum = rows => rows.reduce((total, row) => total + row.revenueCents, 0);
  assert.equal(sum(general), 2700);
  assert.equal(sum(chaveiro) + sum(fabiano), sum(general));
  assert.equal(chaveiro.find(row => row.key === 'merchandise').revenueCents, 0);
  assert.equal(fabiano.find(row => row.key === 'key-copies').revenueCents, 0);
});
