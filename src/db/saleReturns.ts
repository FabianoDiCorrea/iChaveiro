import { db, type PaymentMethod, type Transaction, type TransactionItem } from './db';
import { allocateCents } from './financialAllocation';

export const linkedReturnsFor = async (saleId: number) =>
  db.transactions.where('type').equals('return').filter(transaction => transaction.returnOfTransactionId === saleId).toArray();

export function remainingQuantities(sale: Transaction, returns: Transaction[]): number[] {
  return sale.items.map((item, index) => item.quantity - returns.reduce((sum, transaction) =>
    sum + transaction.items.filter(returned => returned.sourceItemIndex === index).reduce((amount, returned) => amount + returned.quantity, 0), 0));
}

export function prepareReturn(sale: Transaction, returns: Transaction[], quantities: number[]): { items: TransactionItem[]; total: number } {
  if (sale.type !== 'sale' || !sale.id) throw new Error('Venda original inválida.');
  const remaining = remainingQuantities(sale, returns);
  const weights = Object.fromEntries(sale.items.map((item, index) => [String(index), Math.max(0, Math.round(item.total * 100))]));
  const originalNet = allocateCents(Math.round(sale.total * 100), weights);
  const items: TransactionItem[] = [];
  for (let index = 0; index < sale.items.length; index++) {
    const quantity = quantities[index] || 0;
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > remaining[index]) throw new Error('Quantidade de devolução inválida.');
    if (!quantity) continue;
    const source = sale.items[index];
    const alreadyRefunded = returns.reduce((sum, transaction) => sum + transaction.items.filter(item => item.sourceItemIndex === index).reduce((value, item) => value + Math.round(item.total * 100), 0), 0);
    const amount = quantity === remaining[index]
      ? originalNet[String(index)] - alreadyRefunded
      : Math.min(originalNet[String(index)] - alreadyRefunded, Math.round(originalNet[String(index)] * quantity / source.quantity));
    items.push({ ...source, sourceItemIndex: index, quantity, price: amount / 100 / quantity, total: amount / 100 });
  }
  if (!items.length) throw new Error('Selecione ao menos um item para devolver.');
  return { items, total: items.reduce((sum, item) => sum + item.total, 0) };
}

export async function returnSaleItems(saleId: number, quantities: number[], paymentMethod: PaymentMethod, cashProfile?: Transaction['profile']): Promise<number> {
  return db.transaction('rw', db.transactions, db.products, async () => {
    const sale = await db.transactions.get(saleId);
    if (!sale) throw new Error('Venda original não encontrada.');
    const returns = await linkedReturnsFor(saleId);
    const prepared = prepareReturn(sale, returns, quantities);
    for (const item of prepared.items) {
      if (!item.productId) continue;
      const product = await db.products.get(item.productId);
      if (product?.hasStock) await db.products.update(item.productId, { stock: product.stock + item.quantity });
    }
    const returnId = await db.transactions.add({
      profile: cashProfile || sale.profile,
      type: 'return',
      returnOfTransactionId: saleId,
      items: prepared.items,
      total: Math.round(prepared.total * 100) / 100,
      paymentMethod,
      clientName: sale.clientName,
      date: new Date()
    });
    if (returnId === undefined) throw new Error('Não foi possível registrar a devolução.');
    return returnId;
  });
}

export async function deleteTransactionSafely(id: number): Promise<void> {
  await db.transaction('rw', db.transactions, db.products, async () => {
    const transaction = await db.transactions.get(id);
    if (!transaction) throw new Error('Transação não encontrada.');
    if (transaction.type === 'sale' && (await linkedReturnsFor(id)).length) {
      throw new Error('Esta venda possui devoluções vinculadas. Exclua ou estorne as devoluções antes de cancelar a venda.');
    }
    if (transaction.type === 'sale' || (transaction.type === 'return' && transaction.returnOfTransactionId)) {
      const direction = transaction.type === 'sale' ? 1 : -1;
      for (const item of transaction.items) {
        if (!item.productId) continue;
        const product = await db.products.get(item.productId);
        if (product?.hasStock) await db.products.update(item.productId, { stock: product.stock + direction * item.quantity });
      }
    }
    await db.transactions.delete(id);
  });
}
