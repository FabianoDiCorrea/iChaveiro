import type { Profile, Transaction } from './db';

export function getCashSessionTotals(transactions: Transaction[], profile: Profile) {
  const totals = { cash: 0, pix: 0, debit: 0, credit: 0, totalSales: 0, expenses: 0 };
  for (const transaction of transactions) {
    // The stored profile is the physical cashier. Item destinations never create a second receipt.
    if (transaction.profile !== profile) continue;
    if (transaction.type === 'expense') {
      if (transaction.paymentMethod === 'cash') totals.expenses += transaction.total;
      continue;
    }
    const sign = transaction.type === 'return' ? -1 : 1;
    if (transaction.paymentMethod === 'split' && transaction.splitPayments) {
      for (const payment of transaction.splitPayments) {
        if (payment.method in totals && payment.method !== 'split') totals[payment.method] += sign * payment.amount;
      }
    } else if (transaction.paymentMethod !== 'split') {
      totals[transaction.paymentMethod] += sign * transaction.total;
    }
  }
  totals.totalSales = totals.cash + totals.pix + totals.debit + totals.credit;
  return totals;
}
