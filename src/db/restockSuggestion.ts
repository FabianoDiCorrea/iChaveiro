import type { CashSession, Product, Transaction } from './db';
import { itemFinancialProfile } from './financialAllocation';

export function restockSuggestionCents(transactions: Transaction[], products: Product[], session: Pick<CashSession, 'profile'>): number {
  const eligible = new Set(products.filter(product => product.reserveForRestock && product.replacementCostCents !== undefined).map(product => product.id));
  return transactions.reduce((sum, transaction) => {
    if (transaction.type !== 'sale' && transaction.type !== 'return') return sum;
    const sign = transaction.type === 'sale' ? 1 : -1;
    return sum + transaction.items.filter(item => item.productId && eligible.has(item.productId) && item.replacementCost !== undefined && itemFinancialProfile(item, session.profile) === session.profile)
      .reduce((total, item) => total + sign * Math.round(item.replacementCost! * item.quantity * 100), 0);
  }, 0);
}
