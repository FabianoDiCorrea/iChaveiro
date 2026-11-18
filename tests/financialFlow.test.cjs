const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const typescript = require('typescript');
require('fake-indexeddb/auto');
const { liveQuery } = require('dexie');
global.self = globalThis;

function loadTs(relativePath, dependencies = {}) {
  const source = fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
  const code = typescript.transpileModule(source, { compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)((name) => dependencies[name] || require(name), module, module.exports);
  return module.exports;
}

const { db } = loadTs('src/db/db.ts');
const finance = loadTs('src/db/financialAllocation.ts');
const pending = loadTs('src/db/pendingSales.ts');
const details = loadTs('src/pages/reportDetails.ts', { '../db/financialAllocation': finance });
const history = loadTs('src/pages/salesHistoryData.ts', { '../db/financialAllocation': finance });
const returns = loadTs('src/db/saleReturns.ts', { './db': { db }, './financialAllocation': finance });
const cash = loadTs('src/db/cashTotals.ts');
const restore = loadTs('src/db/restore.ts');
const item = (name, profile, total, cost = 0, productId) => ({ service: 'other', name, quantity: 1, price: total, cost, total, financialProfile: profile, productId });
const sale = (profile, items, total, extra = {}) => ({ profile, type: 'sale', items, total, paymentMethod: 'cash', date: new Date('2026-11-15T12:00:00Z'), ...extra });
const sum = (rows, field) => Math.round(rows.reduce((total, row) => total + row[field], 0) * 100) / 100;
const within = (promise, message) => new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error(message)), 3000);
  promise.then(value => { clearTimeout(timeout); resolve(value); }, error => { clearTimeout(timeout); reject(error); });
});

test('pendentes novos primeiro e edição preserva identidade, data, itens, pagamentos e perfil', async () => {
  await db.open();
  const creationDate = new Date('2026-11-10T10:00:00Z');
  const pendingItem = item('Chave', 'fabiano', 12, 2);
  const ordinaryPendingItem = { service: 'other', name: 'Afiação', quantity: 1, price: 10, cost: 0, total: 10 };
  const id = await db.pendingSales.add({ profile: 'chaveiro', clientName: 'Nome incorreto', receiptName: 'Salão', clientPhone: '111', items: [pendingItem, ordinaryPendingItem], total: 18, discount: 2, paymentMethod: 'split', splitPayments: [{ method: 'cash', amount: 9 }, { method: 'pix', amount: 9 }], date: creationDate });
  const olderId = await db.pendingSales.add({ profile: 'chaveiro', clientName: 'Antigo', items: [], total: 0, date: new Date('2026-11-01T10:00:00Z') });
  await db.pendingSales.update(id, pending.pendingSaleChanges({ clientName: 'Nome corrigido', receiptName: 'Cupom atualizado', clientPhone: '222', items: [pendingItem, ordinaryPendingItem], total: 18, discount: 2, paymentMethod: 'split', splitPayments: [{ method: 'cash', amount: 9 }, { method: 'pix', amount: 9 }] }));
  db.close();
  await db.open();
  const restored = await db.pendingSales.get(id);
  assert.equal(restored.id, id);
  assert.equal(restored.date.getTime(), creationDate.getTime());
  assert.equal(restored.profile, 'chaveiro');
  assert.equal(restored.clientName, 'Nome corrigido');
  assert.equal(restored.receiptName, 'Cupom atualizado');
  assert.equal(restored.clientPhone, '222');
  assert.equal(restored.items[0].financialProfile, 'fabiano');
  assert.equal(Object.hasOwn(restored.items[1], 'financialProfile'), false);
  assert.equal(restored.discount, 2);
  assert.deepEqual(restored.splitPayments, [{ method: 'cash', amount: 9 }, { method: 'pix', amount: 9 }]);
  assert.deepEqual((await db.pendingSales.toArray()).sort(pending.newestPendingFirst).map(row => row.id), [id, olderId]);
  await db.pendingSales.clear();
});

test('correção apenas do nome em pendência antiga não regrava informações financeiras', async () => {
  await db.open();
  const old = { profile: 'chaveiro', clientName: 'Nome antigo', items: [item('Chave', 'chaveiro', 12)], total: 9, date: new Date('2026-11-01T10:00:00Z') };
  const id = await db.pendingSales.add(old);
  assert.equal(pending.pendingNameOnly(old, { items: old.items, discount: 0, paymentMethod: 'cash', splitPayments: [] }), true);
  await db.pendingSales.update(id, { clientName: 'Nome corrigido' });
  const updated = await db.pendingSales.get(id);
  assert.equal(updated.total, 9);
  assert.equal(updated.discount, undefined);
  assert.equal(updated.paymentMethod, undefined);
  assert.equal(updated.date.getTime(), old.date.getTime());
  assert.equal(updated.clientName, 'Nome corrigido');
  await db.pendingSales.clear();
});

test('vendas antigas continuam com o perfil original sem redistribuição', () => {
  const old = sale('chaveiro', [{ service: 'key', name: 'Chave antiga', quantity: 1, price: 12, cost: 2, total: 12 }], 12);
  assert.equal(finance.financialTransaction(old, 'chaveiro'), old);
  assert.equal(finance.financialTransaction(old, 'fabiano'), null);
  assert.equal(finance.financialTransaction(old, 'todos'), old);
});

test('vendas exclusivas e compartilhadas conciliam Geral e perfis, em ambos os caixas', () => {
  const shared = sale('chaveiro', [item('Chave', 'chaveiro', 12, 2), item('Afiação', 'chaveiro', 12), item('Espátula', 'fabiano', 5, 1)], 29);
  const reverse = sale('fabiano', [item('Espátula', 'fabiano', 5, 1), item('Chave', 'chaveiro', 12, 2)], 17);
  const exclusive = sale('fabiano', [item('Espátula', 'fabiano', 5, 1)], 5);
  for (const [transaction, expected] of [[shared, [24, 5]], [reverse, [12, 5]]]) {
    const chaveiro = finance.financialTransaction(transaction, 'chaveiro');
    const fabiano = finance.financialTransaction(transaction, 'fabiano');
    assert.equal(chaveiro.total, expected[0]);
    assert.equal(fabiano.total, expected[1]);
    assert.equal(chaveiro.total + fabiano.total, finance.financialTransaction(transaction, 'todos').total);
    assert.equal(chaveiro.cashProfile, transaction.profile);
    assert.equal(finance.financialTransaction(transaction, 'todos').profile, transaction.profile);
  }
  assert.equal(finance.financialTransaction(exclusive, 'fabiano'), exclusive);
  assert.equal(finance.financialTransaction(exclusive, 'chaveiro'), null);
});

test('atribuição explícita da seta pode ser removida sem fixar o perfil geral', () => {
  const ordinary = { service: 'other', name: 'Produto padrão', quantity: 1, price: 12, cost: 2, total: 12 };
  const pinned = finance.toggleItemFinancialProfile(ordinary, 'chaveiro');
  assert.equal(pinned.financialProfile, 'fabiano');
  assert.equal(finance.itemFinancialProfile(pinned, 'chaveiro'), 'fabiano');
  const unpinned = finance.toggleItemFinancialProfile(pinned, 'fabiano');
  assert.equal(Object.hasOwn(unpinned, 'financialProfile'), false);
  assert.equal(finance.itemFinancialProfile(unpinned, 'chaveiro'), 'chaveiro');
  assert.equal(finance.itemFinancialProfile(unpinned, 'fabiano'), 'fabiano');
});

test('itens sem pin acompanham o perfil escolhido no fechamento e preservam desconto individual', () => {
  const ordinary = { service: 'other', name: 'Produto padrão', quantity: 1, price: 12, cost: 2, total: 12, originalPrice: 15 };
  const saleAtFabiano = sale('fabiano', [ordinary], 12);
  assert.equal(finance.financialTransaction(saleAtFabiano, 'fabiano').total, 12);
  assert.equal(finance.financialTransaction(saleAtFabiano, 'chaveiro'), null);
  const detail = finance.financialTransaction(saleAtFabiano, 'fabiano');
  assert.equal(detail.discount, 3);
  assert.equal(details.getReportDetailRows([detail], 'gross').reduce((sum, row) => sum + row.value, 0), 15);
});

test('Histórico projeta vendas compartilhadas nos dois perfis com o ID físico e atualiza a consulta', async () => {
  await db.open();
  await db.transactions.clear();
  const date4444 = new Date('2026-11-17T14:33:15-03:00');
  const date4413 = new Date('2026-11-16T16:35:39-03:00');
  const dateReverse = new Date('2026-11-17T15:00:00-03:00');
  await db.transactions.bulkAdd([
    { ...sale('chaveiro', [item('Afiação Alicate Cutícula', 'chaveiro', 24), item('Mola de silicone', 'fabiano', 5, 2.03)], 29, { date: date4444 }), id: 4444 },
    { ...sale('fabiano', [item('Afiação Alicate Cutícula', 'chaveiro', 48), item('Alicate 777', 'fabiano', 45)], 93, { date: date4413 }), id: 4413 },
    { ...sale('fabiano', [item('Chave comum', 'chaveiro', 12), item('Alicate', 'fabiano', 45)], 57, { date: dateReverse }), id: 4500 }
  ]);
  const start = new Date('2026-11-16T00:00:00-03:00');
  const end = new Date('2026-11-17T23:59:59.999-03:00');
  const load = async profile => history.projectSalesHistoryRows(
    await db.transactions.where('date').between(start, end).reverse().toArray(), profile, ''
  );
  const chaveiro = await load('chaveiro');
  const fabiano = await load('fabiano');
  const geral = await load('todos');
  const physicalSnapshot = await db.transactions.where('date').between(start, end).reverse().toArray();
  assert.equal(history.projectSalesHistoryRows(physicalSnapshot, 'chaveiro', '').find(row => row.id === 4444).total, 24);
  assert.equal(history.projectSalesHistoryRows(physicalSnapshot, 'fabiano', '').find(row => row.id === 4444).total, 5);
  assert.equal(history.projectSalesHistoryRows(physicalSnapshot, 'todos', '').find(row => row.id === 4444).total, 29);
  const find = (rows, id) => rows.find(transaction => transaction.id === id);
  assert.equal(find(chaveiro, 4444).total, 24);
  assert.equal(find(fabiano, 4444).total, 5);
  assert.equal(find(geral, 4444).total, 29);
  assert.deepEqual(find(fabiano, 4444).items.map(row => row.name), ['Mola de silicone']);
  assert.equal(find(chaveiro, 4413).total, 48);
  assert.equal(find(fabiano, 4413).total, 45);
  assert.equal(find(geral, 4413).total, 93);
  assert.equal(find(chaveiro, 4500).total, 12);
  assert.equal(find(fabiano, 4500).total, 45);
  assert.equal([4444, 4413].reduce((sum, id) => sum + find(chaveiro, id).total, 0), 72);
  assert.equal([4444, 4413].reduce((sum, id) => sum + find(fabiano, id).total, 0), 50);
  assert.equal([4444, 4413].reduce((sum, id) => sum + find(geral, id).total, 0), 122);
  assert.equal(await db.transactions.count(), 3);
  for (const id of [4444, 4413]) {
    assert.equal(chaveiro.filter(transaction => transaction.id === id).length, 1);
    assert.equal(fabiano.filter(transaction => transaction.id === id).length, 1);
    assert.equal(geral.filter(transaction => transaction.id === id).length, 1);
    assert.equal(find(chaveiro, id).id, find(fabiano, id).id);
  }
  assert.deepEqual(history.projectSalesHistoryRows(physicalSnapshot, 'fabiano', 'mola').map(transaction => transaction.id), [4444]);
  assert.deepEqual(history.projectSalesHistoryRows(physicalSnapshot, 'chaveiro', 'mola').map(transaction => transaction.id), []);
  let emissions = 0;
  let resolveInitial;
  let resolveUpdated;
  let rejectLiveQuery;
  const initialEmission = new Promise((resolve, reject) => { resolveInitial = resolve; rejectLiveQuery = reject; });
  const updatedEmission = new Promise((resolve, reject) => { resolveUpdated = resolve; rejectLiveQuery = reject; });
  const subscription = liveQuery(() => db.transactions.where('date').between(start, end).reverse().toArray()
    .then(rows => history.projectSalesHistoryRows(rows, 'fabiano', ''))).subscribe({
    next: rows => {
      emissions++;
      if (emissions === 1) resolveInitial(rows);
      if (emissions === 2) resolveUpdated(rows);
    },
    error: rejectLiveQuery
  });
  try {
    await within(initialEmission, 'Histórico não emitiu estado inicial');
    await db.transactions.add({ ...sale('chaveiro', [item('Chave tetra', 'fabiano', 18)], 18, { date: dateReverse }), id: 4501 });
    const updated = await within(updatedEmission, 'Histórico não atualizou após a venda');
    assert.equal(find(updated, 4501).total, 18);
  } finally {
    subscription.unsubscribe();
  }
  assert.equal(await db.transactions.count(), 4);
  await db.delete();
});

test('itens iguais em perfis diferentes permanecem separados, inclusive custo', () => {
  const shared = sale('chaveiro', [item('Chave comum', 'chaveiro', 12, 2, 7), item('Chave comum', 'fabiano', 12, 2, 7)], 24);
  const allocations = finance.getFinancialShares(shared);
  assert.equal(allocations.length, 2);
  assert.equal(allocations[0].items.length, 1);
  assert.equal(allocations[1].items.length, 1);
  assert.equal(allocations[0].items[0].financialProfile, 'chaveiro');
  assert.equal(allocations[1].items[0].financialProfile, 'fabiano');
  assert.equal(sum(allocations, 'total'), 24);
});

test('desconto geral, taxa e pagamento misto fecham em centavos por perfil e por método', () => {
  const transaction = sale('chaveiro', [item('Chave', 'chaveiro', 12, 2), item('Afiação', 'chaveiro', 12), item('Espátula', 'fabiano', 5, 1)], 26, {
    discount: 3, machineFee: 1.29, paymentMethod: 'split', splitPayments: [{ method: 'cash', amount: 10 }, { method: 'credit', amount: 16 }]
  });
  const shares = finance.getFinancialShares(transaction);
  assert.equal(sum(shares, 'total'), 26);
  assert.equal(sum(shares, 'discount'), 3);
  assert.equal(sum(shares, 'machineFee'), 1.29);
  assert.equal(shares.reduce((value, share) => value + share.splitPayments.reduce((paid, payment) => paid + payment.amount, 0), 0), 26);
  assert.equal(Math.round(shares.reduce((value, share) => value + share.splitPayments.filter(payment => payment.method === 'cash').reduce((paid, payment) => paid + payment.amount, 0), 0) * 100), 1000);
  assert.equal(Math.round(shares.reduce((value, share) => value + share.splitPayments.filter(payment => payment.method === 'credit').reduce((paid, payment) => paid + payment.amount, 0), 0) * 100), 1600);
  for (const share of shares) assert.equal(Math.round(share.splitPayments.reduce((value, payment) => value + payment.amount, 0) * 100), Math.round(share.total * 100));
  const views = shares.map(share => finance.financialTransaction(transaction, share.profile));
  for (const kind of ['gross', 'discounts', 'fees', 'costs']) {
    const total = views.reduce((value, view) => value + details.getReportDetailRows([view], kind).reduce((subtotal, row) => subtotal + row.value, 0), 0);
    const general = details.getReportDetailRows([transaction], kind).reduce((value, row) => value + row.value, 0);
    assert.ok(Math.abs(total - general) < 0.00001, kind);
  }
});

test('detalhamento de taxas distribui bruto, tarifa e líquido por perfil sem duplicar o recebimento', () => {
  const transaction = sale('chaveiro', [item('Serviço', 'chaveiro', 50), item('Produto', 'fabiano', 50)], 100, {
    paymentMethod: 'split', machineFee: 5, machineFeeCents: 500,
    machinePayments: [
      { method: 'credit', installments: 3, machineId: 1, machineName: 'Ton', ownerProfile: 'fabiano', ratePercent: 10, grossCents: 5000, feeCents: 500, netCents: 4500 },
      { method: 'pix', machineId: 2, machineName: 'Mercado Pago', ownerProfile: 'chaveiro', ratePercent: 0, grossCents: 5000, feeCents: 0, netCents: 5000 }
    ]
  });
  const chaveiro = finance.financialTransaction(transaction, 'chaveiro');
  const fabiano = finance.financialTransaction(transaction, 'fabiano');
  assert.equal(chaveiro.machinePayments.reduce((sum, row) => sum + row.grossCents, 0), 5000);
  assert.equal(fabiano.machinePayments.reduce((sum, row) => sum + row.grossCents, 0), 5000);
  assert.equal(chaveiro.machinePayments.reduce((sum, row) => sum + row.feeCents, 0), 250);
  assert.equal(fabiano.machinePayments.reduce((sum, row) => sum + row.feeCents, 0), 250);
  assert.equal(chaveiro.machinePayments[0].installments, 3);
  const feeRows = details.getReportDetailRows([chaveiro, fabiano], 'fees');
  assert.equal(sum(feeRows, 'value'), 5);
});

test('desconto do item aparece no perfil correto e concilia com o Geral', () => {
  const transaction = sale('chaveiro', [
    { ...item('Chave', 'chaveiro', 9, 2), originalPrice: 12 },
    { ...item('Espátula', 'fabiano', 5, 1), originalPrice: 7 }
  ], 12, { discount: 2 });
  const general = finance.financialTransaction(transaction, 'todos');
  const chaveiro = finance.financialTransaction(transaction, 'chaveiro');
  const fabiano = finance.financialTransaction(transaction, 'fabiano');
  assert.equal(general.total, 12);
  assert.equal(general.discount, 7);
  assert.equal(chaveiro.discount + fabiano.discount, 7);
  assert.equal(chaveiro.total + fabiano.total, 12);
  assert.equal(sum(details.getReportDetailRows([general], 'gross'), 'value'), 19);
  assert.equal(sum(details.getReportDetailRows([chaveiro, fabiano], 'gross'), 'value'), 19);
  assert.deepEqual(details.getReportDetailRows([general], 'discounts').map(row => row.category).sort(), ['Desconto da venda', 'Desconto do item', 'Desconto do item']);
  assert.equal(sum(details.getReportDetailRows([general], 'discounts'), 'value'), 7);
});

test('caixa físico recebe uma vez e devolução reduz apenas o caixa que a executou', () => {
  const transaction = sale('chaveiro', [item('Chave', 'chaveiro', 12), item('Espátula', 'fabiano', 5)], 17, {
    paymentMethod: 'split', splitPayments: [{ method: 'cash', amount: 10 }, { method: 'pix', amount: 7 }]
  });
  const refund = { ...sale('fabiano', [item('Espátula', 'fabiano', 5)], 5), type: 'return' };
  assert.deepEqual(cash.getCashSessionTotals([transaction, refund], 'chaveiro'), { cash: 10, pix: 7, debit: 0, credit: 0, totalSales: 17, expenses: 0 });
  assert.deepEqual(cash.getCashSessionTotals([transaction, refund], 'fabiano'), { cash: -5, pix: 0, debit: 0, credit: 0, totalSales: -5, expenses: 0 });
});

test('devolução parcial e integral recompõem estoque uma vez, mantêm perfis e não excedem a venda', async () => {
  await db.open();
  const productId = await db.products.add({ profile: 'chaveiro', name: 'Chave', price: 12, costPrice: 2, stock: 8, hasStock: true, serviceType: 'key' });
  const original = sale('chaveiro', [
    { ...item('Chave', 'chaveiro', 12, 2, productId), service: 'key' },
    { ...item('Chave', 'fabiano', 12, 2, productId), service: 'key' }
  ], 22, { discount: 2 });
  const saleId = await db.transactions.add(original);
  const firstReturnId = await returns.returnSaleItems(saleId, [0, 1], 'cash');
  assert.equal((await db.products.get(productId)).stock, 9);
  const firstReturn = await db.transactions.get(firstReturnId);
  assert.equal(firstReturn.returnOfTransactionId, saleId);
  assert.equal(finance.financialTransaction(firstReturn, 'fabiano').total, 11);
  assert.equal(finance.financialTransaction(firstReturn, 'chaveiro'), null);
  assert.deepEqual(returns.remainingQuantities({ ...original, id: saleId }, [firstReturn]), [1, 0]);
  const secondReturnId = await returns.returnSaleItems(saleId, [1, 0], 'pix');
  assert.equal((await db.products.get(productId)).stock, 10);
  const secondReturn = await db.transactions.get(secondReturnId);
  assert.equal(finance.financialTransaction(secondReturn, 'chaveiro').total, 11);
  await assert.rejects(() => returns.returnSaleItems(saleId, [1, 0], 'cash'), /Quantidade/);
  assert.equal((await db.products.get(productId)).stock, 10);
  const costRows = details.getReportDetailRows([original, firstReturn, secondReturn], 'costs');
  assert.equal(costRows.reduce((value, row) => value + row.value, 0), 0);
  await assert.rejects(() => returns.deleteTransactionSafely(saleId), /devoluções vinculadas/);
  assert.equal((await db.products.get(productId)).stock, 10);
  await returns.deleteTransactionSafely(firstReturnId);
  await returns.deleteTransactionSafely(secondReturnId);
  assert.equal((await db.products.get(productId)).stock, 8);
  await returns.deleteTransactionSafely(saleId);
  assert.equal((await db.products.get(productId)).stock, 10);
  assert.equal(await db.transactions.count(), 0);
  await db.delete();
});

test('download RAW autenticado acima de 1 MB e validação antes de tocar no banco', async () => {
  await db.open();
  const id = await db.transactions.add(sale('chaveiro', [item('Chave', 'chaveiro', 12)], 12));
  const base = {
    formatName: 'dexie', formatVersion: 1,
    data: {
      databaseName: db.name, databaseVersion: db.verno,
      tables: db.tables.map(table => ({ name: table.name, schema: table.schema.primKey.src, rowCount: 0 })),
      data: []
    }, padding: ''
  };
  base.padding = 'x'.repeat(2298211 - Buffer.byteLength(JSON.stringify(base)));
  const backup = new Blob([JSON.stringify(base)], { type: 'application/json' });
  assert.equal(backup.size, 2298211);
  const originalFetch = global.fetch;
  let request;
  global.fetch = async (url, options) => {
    request = { url, options };
    return new Response(backup, { status: 200, headers: { 'content-length': String(backup.size) } });
  };
  try {
    const downloaded = await restore.downloadBackupFromGitHub('Conta/BackupPrivado', 'token-sintetico');
    assert.equal(downloaded.size, 2298211);
    assert.equal(request.options.headers.Accept, 'application/vnd.github.raw+json');
    assert.equal(request.options.headers.Authorization, 'Bearer token-sintetico');
    const validated = await restore.validateDexieBackup(downloaded, db);
    assert.equal(validated.rowCounts.size, db.tables.length);
    await assert.rejects(() => restore.restoreDexieBackup(db, new Blob(['{"erro":"não é Dexie"}'])), error => error.kind === 'format');
    assert.equal((await db.transactions.get(id)).total, 12);
  } finally {
    global.fetch = originalFetch;
    await db.delete();
  }
});

test('fechamento contabiliza dinheiro, pix, debito, credito e estorno uma vez no caixa fisico', () => {
  const split = sale('chaveiro', [item('Servico compartilhado', 'chaveiro', 60)], 60, {
    paymentMethod: 'split', splitPayments: [
      { method: 'cash', amount: 15 }, { method: 'pix', amount: 10 },
      { method: 'debit', amount: 20 }, { method: 'credit', amount: 15 }
    ]
  });
  const cashSale = sale('chaveiro', [item('Mercadoria compartilhada', 'fabiano', 10)], 10);
  const reverseProfileSale = sale('fabiano', [item('Venda do outro caixa', 'chaveiro', 20)], 20);
  const reverseRefund = { ...sale('fabiano', [item('Devolucao', 'chaveiro', 5)], 5), type: 'return' };
  const cashExpense = { ...sale('chaveiro', [], 4), type: 'expense' };
  const transactions = [split, cashSale, reverseProfileSale, reverseRefund, cashExpense];
  const chaveiro = cash.getCashSessionTotals(transactions, 'chaveiro');
  const fabiano = cash.getCashSessionTotals(transactions, 'fabiano');
  assert.deepEqual(chaveiro, { cash: 25, pix: 10, debit: 20, credit: 15, totalSales: 70, expenses: 4 });
  assert.deepEqual(fabiano, { cash: 15, pix: 0, debit: 0, credit: 0, totalSales: 15, expenses: 0 });
  assert.equal(50 + chaveiro.cash - chaveiro.expenses, 71);
  assert.equal(chaveiro.totalSales + fabiano.totalSales, 85);
});

test('venda compartilhada de 57 reais fica na gaveta de origem sem duplicar a receita', () => {
  const physical = sale('chaveiro', [
    { ...item('Cópia de chave', 'chaveiro', 12), service: 'key' },
    item('Serviço do Fabiano', 'fabiano', 45)
  ], 57, { paymentMethod: 'cash' });
  const chaveiro = finance.financialTransaction(physical, 'chaveiro');
  const fabiano = finance.financialTransaction(physical, 'fabiano');
  const geral = finance.financialTransaction(physical, 'todos');
  assert.equal(chaveiro.total, 12);
  assert.equal(fabiano.total, 45);
  assert.equal(geral.total, 57);
  assert.equal(chaveiro.total + fabiano.total, geral.total);
  assert.equal(chaveiro.profile, 'chaveiro');
  assert.equal(cash.getCashSessionTotals([physical], 'chaveiro').cash, 57);
  assert.equal(cash.getCashSessionTotals([physical], 'fabiano').cash, 0);
  assert.equal(100 + cash.getCashSessionTotals([physical], 'chaveiro').cash, 157);
  const reverse = { ...physical, profile: 'fabiano' };
  assert.equal(finance.financialTransaction(reverse, 'chaveiro').total, 12);
  assert.equal(finance.financialTransaction(reverse, 'fabiano').total, 45);
  assert.equal(cash.getCashSessionTotals([reverse], 'chaveiro').cash, 0);
  assert.equal(cash.getCashSessionTotals([reverse], 'fabiano').cash, 57);
});
