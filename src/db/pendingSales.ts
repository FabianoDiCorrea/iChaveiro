import type { PendingSale } from './db';

export const newestPendingFirst = (a: PendingSale, b: PendingSale) =>
  new Date(b.date).getTime() - new Date(a.date).getTime() || (b.id || 0) - (a.id || 0);

export const pendingNameOnly = (original: PendingSale, changes: Pick<PendingSale, 'items' | 'discount' | 'paymentMethod' | 'splitPayments'>) =>
  JSON.stringify(original.items) === JSON.stringify(changes.items)
  && (original.discount || 0) === (changes.discount || 0)
  && (original.paymentMethod || 'cash') === (changes.paymentMethod || 'cash')
  && JSON.stringify(original.splitPayments || []) === JSON.stringify(changes.splitPayments || []);

// Only editable fields are returned; creation date, id and cash profile stay intact.
export const pendingSaleChanges = (sale: Pick<PendingSale, 'clientName' | 'receiptName' | 'clientPhone' | 'items' | 'total' | 'discount' | 'paymentMethod' | 'splitPayments'>) => ({
  clientName: sale.clientName,
  receiptName: sale.receiptName,
  clientPhone: sale.clientPhone,
  items: sale.items,
  total: sale.total,
  discount: sale.discount,
  paymentMethod: sale.paymentMethod,
  splitPayments: sale.splitPayments
});
