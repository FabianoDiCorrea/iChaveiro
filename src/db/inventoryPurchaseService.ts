import { db, type Profile } from './db';

export async function recordInventoryPurchase(productId: number, quantity: number, unitCostCents: number, details: { date: Date; supplier?: string; reference?: string; notes?: string; profile: Profile }) {
  if (!Number.isSafeInteger(quantity) || quantity <= 0 || !Number.isSafeInteger(unitCostCents) || unitCostCents < 0 || Number.isNaN(+details.date)) throw new Error('Confira quantidade, custo e data da compra.');
  return db.transaction('rw', db.products, db.inventoryPurchases, db.productCostHistory, db.managementAudit, async () => {
    const product = await db.products.get(productId);
    if (!product || !product.hasStock) throw new Error('Produto não encontrado ou sem controle de estoque.');
    const currentCents = Math.round((product.costPrice || 0) * 100);
    const nextStock = product.stock + quantity;
    const weighted = product.stock > 0 && nextStock > 0 ? Math.round((product.stock * currentCents + quantity * unitCostCents) / nextStock) : unitCostCents;
    const purchaseId = await db.inventoryPurchases.add({ productId, quantity, unitCostCents, totalCents: quantity * unitCostCents, date: details.date, supplier: details.supplier, reference: details.reference, notes: details.notes, profile: details.profile });
    await db.products.update(productId, { stock: nextStock, costPrice: weighted / 100, lastPurchasedDate: details.date, lastPurchasedQty: quantity });
    await db.productCostHistory.add({ productId, acquisitionCostCents: weighted, replacementCostCents: product.replacementCostCents, at: details.date, note: `Compra ${details.reference || purchaseId}` });
    await db.managementAudit.add({ at: new Date(), entity: 'compra de estoque', entityId: purchaseId, action: 'registrar entrada', before: { stock: product.stock, costPrice: product.costPrice }, after: { stock: nextStock, weightedCostCents: weighted, quantity, unitCostCents } });
    return purchaseId;
  });
}

export async function updateReplacementCost(productId: number, replacementCostCents?: number) {
  if (replacementCostCents !== undefined && (!Number.isSafeInteger(replacementCostCents) || replacementCostCents < 0)) throw new Error('Custo padrão de reposição inválido.');
  await db.transaction('rw', db.products, db.productCostHistory, db.managementAudit, async () => {
    const product = await db.products.get(productId);
    if (!product) throw new Error('Produto não encontrado.');
    const before = product.replacementCostCents;
    await db.products.update(productId, { replacementCostCents });
    await db.productCostHistory.add({ productId, acquisitionCostCents: Math.round(product.costPrice * 100), replacementCostCents, at: new Date(), note: 'Alteração de custo padrão de reposição' });
    await db.managementAudit.add({ at: new Date(), entity: 'produto', entityId: productId, action: 'alterar custo padrão de reposição', before: { replacementCostCents: before }, after: { replacementCostCents } });
  });
}
