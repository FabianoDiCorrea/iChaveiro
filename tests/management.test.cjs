const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
require('fake-indexeddb/auto');
global.self = globalThis;
const Dexie = require('dexie');

function load(relativePath, dependencies = {}) {
  const source = fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => dependencies[name] || require(name), module, module.exports);
  return module.exports;
}

const { db } = load('src/db/db.ts');
const math = load('src/db/managementMath.ts');
const service = load('src/db/managementService.ts', { './db': { db }, './managementMath': math });
const finance = load('src/db/financialAllocation.ts');
const summary = load('src/db/managementSummary.ts', { './financialAllocation': finance, './managementMath': math });
const restore = load('src/db/restore.ts');
const machines = load('src/db/machineService.ts', { './db': { db } });
const purchases = load('src/db/inventoryPurchaseService.ts', { './db': { db } });
const restock = load('src/db/restockSuggestion.ts', { './financialAllocation': finance });
const { exportDB } = require('dexie-export-import');
global.FileReader = class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then(result => { this.result = result; this.onload?.({ target: this }); }, error => { this.error = error; this.onerror?.({ target: this }); }); }
};
const account = (firstDueDate, extra = {}) => ({
  name: 'Internet', category: 'internet', profile: 'chaveiro', amountCents: 13000, variable: false,
  startDate: '2026-11-02', firstDueDate, recurrence: 'monthly', provisionEnabled: true,
  provisionDays: 26, provisionMode: 'fixed', workingDays: [1,2,3,4,5,6], excludedDates: [], includedDates: [],
  noticeDays: 3, status: 'active', ...extra
});

test('migração aditiva preserva venda antiga e cria tabelas gerenciais', async () => {
  const legacy = new Dexie('iChaveiroDB');
  legacy.version(10).stores({
    transactions: '++id, profile, type, paymentMethod, date, clientId', clients: '++id, name, phone, code',
    products: '++id, profile, name, code, brand, serviceType, hasStock', cashSessions: '++id, profile, status, openedAt, closedAt',
    losses: '++id, date, productId, type, operator', pendingSales: '++id, profile, date, clientName', employees: '++id, name, active'
  });
  await legacy.open();
  const id = await legacy.table('transactions').add({ profile: 'chaveiro', type: 'sale', items: [], total: 12, paymentMethod: 'cash', date: new Date() });
  legacy.close();
  await db.open();
  assert.equal(db.verno, 13);
  assert.equal((await db.transactions.get(id)).total, 12);
  assert.equal(await db.managementAccounts.count(), 0);
  assert.equal(await db.paymentMachines.count(), 2);
  assert.equal((await db.paymentMachines.get(1)).rates.find(row => row.method === 'pix').percent, 0);
  assert.equal((await db.paymentMachines.get(2)).rates.find(row => row.method === 'pix').percent, 0.5);
  await db.delete();
});

test('recorrência mensal gera ocorrências independentes, idempotentes e edição futura não altera paga', async () => {
  await db.open();
  const id = await service.saveAccount(account('2026-11-30'));
  const plan = await db.managementAccounts.get(id);
  await service.ensureOccurrences(plan, '2027-03-31');
  const before = (await db.managementOccurrences.where('accountId').equals(id).toArray()).sort((a,b)=>a.dueDate.localeCompare(b.dueDate));
  assert.deepEqual(before.slice(0,3).map(row=>row.dueDate), ['2026-11-30','2026-12-30','2027-01-30']);
  await service.ensureOccurrences(plan, '2027-03-31');
  assert.equal(await db.managementOccurrences.where('accountId').equals(id).count(), before.length);
  await service.payOccurrence(before[0].id, 13000, 'pix');
  await service.editOccurrence(before[1].id, { amountCents: 15000, dueDate: '2026-12-29' }, true);
  assert.equal((await db.managementOccurrences.get(before[0].id)).amountCents, 13000);
  assert.equal((await db.managementOccurrences.get(before[1].id)).amountCents, 15000);
  await assert.rejects(() => service.editOccurrence(before[0].id, { amountCents: 14000, dueDate: '2026-11-29' }), /já paga/);
  await db.delete();
});

test('provisionamento de R$ 5 reproduz atraso, compensação e adiantamento em centavos', () => {
  const plan = { ...account('2026-12-31', { startDate: '2026-11-02', provisionDays: 26, amountCents: 13000, recurrence: 'once' }), id: 1 };
  const occurrence = { id: 1, accountId: 1, key: '1:0', profile: 'chaveiro', name: 'Internet', category: 'internet', amountCents: 13000, periodStart: '2026-11-02', dueDate: '2026-12-31', status: 'open' };
  const entries = [];
  const reserve = (day, amount) => entries.push({ occurrenceId: 1, kind: 'reserve', amountCents: amount, date: new Date(`${day}T12:00:00Z`) });
  assert.equal(math.provisionStatus(plan, occurrence, entries, '2026-11-02').suggested, 500);
  reserve('2026-11-02',500);
  assert.equal(math.provisionStatus(plan, occurrence, entries, '2026-11-03').pending,500);
  reserve('2026-11-04',500);
  assert.equal(math.provisionStatus(plan, occurrence, entries, '2026-11-04').pending,500);
  reserve('2026-11-05',1000);
  assert.equal(math.provisionStatus(plan, occurrence, entries, '2026-11-05').pending,0);
  reserve('2026-11-06',1500);
  assert.equal(math.provisionStatus(plan, occurrence, entries, '2026-11-06').ahead,1000);
  assert.equal(math.provisionStatus(plan, occurrence, entries, '2026-11-06').suggested,0);
});

test('reservas, pagamento parcial, fundo, transferência, estorno e caixa conhecido conciliam', async () => {
  await db.open();
  const accountId = await service.saveAccount(account('2026-11-30'));
  const occurrence = (await db.managementOccurrences.where('accountId').equals(accountId).first());
  assert.equal(await service.reserveForOccurrence(occurrence.id, 500, 'cash', { key: 'fechamento:1:conta:1' }), true);
  assert.equal(await service.reserveForOccurrence(occurrence.id, 500, 'cash', { key: 'fechamento:1:conta:1' }), false);
  await service.payOccurrence(occurrence.id, 700, 'cash', 500);
  let entries = await db.managementEntries.toArray();
  let plan = await db.managementAccounts.get(accountId);
  let state = math.provisionStatus(plan, occurrence, entries, '2026-11-15');
  assert.equal(state.paid,700);
  assert.equal(state.reserved,0);
  assert.equal(state.remaining,12300);
  const fundA = await service.saveFund({ name:'Emergência', profile:'chaveiro', status:'active' });
  const fundB = await service.saveFund({ name:'Máquinas', profile:'fabiano', status:'active' });
  await service.moveFund(fundA,1000,'deposit','pix','Depósito');
  await service.moveFund(fundA,400,'transfer','pix','Transferência entre perfis',fundB);
  entries=await db.managementEntries.toArray();
  assert.equal(service.fundBalance(fundA,entries),600);
  assert.equal(service.fundBalance(fundB,entries),400);
  const transfer = entries.find(row=>row.kind==='fund-transfer-out');
  await service.reverseEntry(transfer.id);
  entries=await db.managementEntries.toArray();
  assert.equal(service.fundBalance(fundA,entries),1000);
  assert.equal(service.fundBalance(fundB,entries),0);
  await assert.rejects(()=>service.reverseEntry(transfer.id),/já estornada/);
  await service.recordOpeningBalance('chaveiro',10000,'cash','Saldo contado');
  await service.recordWithdrawal('chaveiro',1000,'cash','Sócio','retirada_pessoal','Teste');
  entries=await db.managementEntries.toArray();
  assert.equal(summary.knownFreeBalance([],entries,'chaveiro','cash'),9000);
  await db.delete();
});

test('backup novo inclui Gerência e backup antigo restaura sem novas tabelas', async () => {
  await db.open();
  const accountId = await service.saveAccount(account('2026-11-30'));
  const modern = await exportDB(db);
  const parsed = JSON.parse(await modern.text());
  assert.ok(parsed.data.tables.some(table => table.name === 'managementAccounts' && table.rowCount === 1));
  await restore.validateDexieBackup(modern, db);
  await db.managementAccounts.clear();
  await restore.restoreDexieBackup(db, modern);
  assert.equal((await db.managementAccounts.get(accountId)).name, 'Internet');
  await assert.rejects(() => restore.restoreDexieBackup(db, new Blob(['{invalid'])), /JSON válido/);
  assert.equal(await db.managementAccounts.count(), 1);
  await db.delete();

  const legacy = new Dexie('iChaveiroDB');
  legacy.version(10).stores({
    transactions: '++id, profile, type, paymentMethod, date, clientId', clients: '++id, name, phone, code',
    products: '++id, profile, name, code, brand, serviceType, hasStock', cashSessions: '++id, profile, status, openedAt, closedAt',
    losses: '++id, date, productId, type, operator', pendingSales: '++id, profile, date, clientName', employees: '++id, name, active'
  });
  await legacy.open();
  await legacy.table('transactions').add({ profile: 'chaveiro', type: 'sale', items: [], total: 27, paymentMethod: 'cash', date: new Date() });
  const oldBackup = await exportDB(legacy);
  legacy.close();
  await db.open();
  await restore.validateDexieBackup(oldBackup, db);
  await restore.restoreDexieBackup(db, oldBackup);
  assert.equal((await db.transactions.toArray())[0].total, 27);
  assert.equal(await db.managementAccounts.count(), 0);
  await db.delete();
});

test('compra de estoque vinculada sai do lucro gerencial sem apagar a despesa original', async () => {
  await db.open();
  const day = new Date('2026-11-15T12:00:00');
  const expenseId = await db.transactions.add({ profile: 'chaveiro', type: 'expense', items: [{ service: 'other', name: 'Mercadorias', quantity: 1, price: 100, cost: 0, total: 100 }], total: 100, paymentMethod: 'pix', date: day });
  const before = summary.managementSummary(await db.transactions.toArray(), [], [], 'chaveiro', '2026-11-01', '2026-11-30');
  assert.equal(before.operatingExpenses, 100);
  const accountId = await service.saveAccount(account('2026-11-30', { category: 'estoque', amountCents: 10000 }));
  const occurrence = await db.managementOccurrences.where('accountId').equals(accountId).first();
  await service.payOccurrence(occurrence.id, 5000, 'pix', 0, expenseId);
  const entries = await db.managementEntries.toArray();
  const transactions = await db.transactions.toArray();
  assert.equal(transactions.length, 1);
  const after = summary.managementSummary(transactions, entries, await db.managementOccurrences.toArray(), 'chaveiro', '2026-11-01', '2026-11-30');
  assert.equal(after.operatingExpenses, 0);
  assert.equal(summary.managementSummary(transactions, entries, [], 'todos', '2026-11-01', '2026-11-30').operatingExpenses, 0);
  assert.equal(summary.managementSummary(transactions, entries, [], 'fabiano', '2026-11-01', '2026-11-30').operatingExpenses, 0);
  await assert.rejects(() => service.payOccurrence(occurrence.id, 100, 'pix', 0, expenseId), /já vinculada/);
  await db.delete();
});

test('tarifas por modalidade e parcela preservam o histórico e a desativação da maquininha', async () => {
  await db.open();
  const machineId = await machines.saveMachine({ name: 'Teste', ownerProfile: 'chaveiro', active: true, rates: [
    { method: 'pix', percent: 0, configured: true },
    { method: 'credit', installment: 1, percent: 3, configured: true },
    { method: 'credit', installment: 3, percent: 6, configured: true }
  ] });
  await machines.setDefaultMachine('chaveiro', machineId);
  const machine = await db.paymentMachines.get(machineId);
  assert.equal(machines.rateFor(machine, 'pix').percent, 0);
  assert.equal(machines.rateFor(machine, 'credit', 3).percent, 6);
  assert.equal(machines.rateFor(machine, 'credit', 6), undefined);
  assert.equal(machines.feeCents(10000, machines.rateFor(machine, 'credit', 3)), 600);
  const transactionId = await db.transactions.add({ profile: 'chaveiro', type: 'sale', items: [], total: 100, paymentMethod: 'credit', date: new Date('2026-11-15T12:00:00Z'), machinePayments: [{ method: 'credit', installments: 3, machineId, machineName: 'Teste', ownerProfile: 'chaveiro', ratePercent: 6, grossCents: 10000, feeCents: 600, netCents: 9400 }] });
  await machines.saveMachine({ ...machine, rates: [{ method: 'credit', installment: 3, percent: 9, configured: true }] }, machineId);
  await machines.deactivateMachine(machineId);
  assert.equal((await db.transactions.get(transactionId)).machinePayments[0].ratePercent, 6);
  assert.equal((await db.transactions.get(transactionId)).machinePayments[0].feeCents, 600);
  assert.equal((await db.paymentMachines.get(machineId)).active, false);
  assert.equal(await db.managementSettings.get('defaultMachine:chaveiro'), undefined);
  await db.delete();
});

test('compra pondera o custo real, custo padrão não reescreve venda e reserva subtrai devoluções', async () => {
  await db.open();
  const productId = await db.products.add({ profile: 'chaveiro', name: 'Chave de teste', price: 12, costPrice: 1.7, replacementCostCents: 250, reserveForRestock: true, stock: 10, hasStock: true, serviceType: 'key' });
  await purchases.recordInventoryPurchase(productId, 30, 250, { date: new Date('2026-11-15T12:00:00Z'), profile: 'chaveiro', supplier: 'Fornecedor sintético', reference: 'TESTE-1' });
  const product = await db.products.get(productId);
  assert.equal(product.stock, 40);
  assert.equal(product.costPrice, 2.3);
  const saleItem = { service: 'key', name: product.name, productId, quantity: 3, price: 12, cost: product.costPrice, replacementCost: 2.5, total: 36, financialProfile: 'chaveiro' };
  const saleId = await db.transactions.add({ profile: 'chaveiro', type: 'sale', items: [saleItem], total: 12, paymentMethod: 'cash', date: new Date('2026-11-15T13:00:00Z') });
  await purchases.updateReplacementCost(productId, 300);
  assert.equal((await db.products.get(productId)).replacementCostCents, 300);
  assert.equal((await db.transactions.get(saleId)).items[0].replacementCost, 2.5);
  const sale = { profile: 'chaveiro', type: 'sale', items: [saleItem], total: 36, paymentMethod: 'cash', date: new Date() };
  const returned = { ...sale, type: 'return', items: [{ ...saleItem, quantity: 1, total: 12, financialProfile: 'chaveiro' }] };
  const otherProfile = { ...saleItem, quantity: 10, replacementCost: 9, financialProfile: 'fabiano' };
  assert.equal(restock.restockSuggestionCents([sale, returned, { ...sale, items: [otherProfile] }], [product], { profile: 'chaveiro' }), 500);
  assert.equal((await db.inventoryPurchases.toArray())[0].totalCents, 7500);
  assert.equal(await db.productCostHistory.count(), 2);
  await db.delete();
});

test('composição de diárias e indicador usam os mesmos lançamentos projetados por período e perfil', () => {
  const transactions = [
    { id: 1, profile: 'chaveiro', type: 'expense', items: [{ service: 'other', name: 'Diária: Funcionário A', quantity: 1, price: 0, cost: 0, total: 1400 }], total: 1400, paymentMethod: 'cash', date: new Date('2026-11-10T12:00:00') },
    { id: 2, profile: 'chaveiro', type: 'expense', items: [{ service: 'other', name: 'Diaria: Funcionário B', quantity: 1, price: 0, cost: 0, total: 1020 }], total: 1020, paymentMethod: 'pix', date: new Date('2026-11-11T12:00:00') },
    { id: 3, profile: 'fabiano', type: 'expense', items: [{ service: 'other', name: 'Diária: Fora do filtro', quantity: 1, price: 0, cost: 0, total: 500 }], total: 500, paymentMethod: 'cash', date: new Date('2026-11-11T12:00:00') }
  ];
  const details = summary.managementWageDetails(transactions, 'chaveiro', '2026-11-01', '2026-11-30');
  const totals = summary.managementSummary(transactions, [], [], 'chaveiro', '2026-11-01', '2026-11-30');
  assert.deepEqual(details.map(row => row.item.total), [1400, 1020]);
  assert.equal(details.reduce((sum, row) => sum + row.item.total, 0), totals.wages);
  assert.equal(totals.wages, 2420);
});
