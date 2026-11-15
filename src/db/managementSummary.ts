import type { Profile, Transaction } from './db';
import { financialTransaction } from './financialAllocation';
import { dateKey } from './managementMath';
import type { AccountOccurrence, ManagementEntry } from './managementTypes';

const inPeriod = (date: Date | string, start: string, end: string) => {
  const key = typeof date === 'string' ? date : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return key >= start && key <= end;
};
export const isWageName = (name: string) => /di[áa]ria/i.test(name);
export function managementWageDetails(transactions: Transaction[], profile: Profile | 'todos', start: string, end: string) {
  return transactions.filter(row => inPeriod(new Date(row.date), start, end))
    .map(transaction => financialTransaction(transaction, profile))
    .filter((transaction): transaction is Transaction => transaction?.type === 'expense')
    .flatMap(transaction => transaction.items.filter(item => isWageName(item.name || '')).map(item => ({ transaction, item })));
}
const operatingCategories = new Set(['estoque', 'retirada_pessoal', 'distribuicao_lucro', 'transferencia', 'aquisicao']);

export function managementSummary(transactions: Transaction[], entries: ManagementEntry[], occurrences: AccountOccurrence[], profile: Profile | 'todos', start: string, end: string) {
  const projected = transactions.filter(row => inPeriod(new Date(row.date), start, end))
    .map(row => financialTransaction(row, profile)).filter((row): row is Transaction => row !== null);
  const sales = projected.filter(row => row.type === 'sale');
  const returns = projected.filter(row => row.type === 'return');
  const expenses = projected.filter(row => row.type === 'expense');
  const selectedEntries = entries.filter(row => (profile === 'todos' || row.profile === profile) && inPeriod(new Date(row.date), start, end));
  const nonOperatingLinkedExpenses = new Set(entries.filter(row => row.kind === 'payment' && !row.reversalOfId && row.linkedTransactionId && operatingCategories.has(row.category || '') && !entries.some(reversal => reversal.reversalOfId === row.id)).map(row => row.linkedTransactionId));
  const gross = sales.reduce((sum, row) => sum + row.total + (row.discount || 0), 0);
  const discounts = sales.reduce((sum, row) => sum + (row.discount || 0), 0);
  const returnsTotal = returns.reduce((sum, row) => sum + row.total, 0);
  const revenue = gross - discounts - returnsTotal;
  const costs = sales.reduce((sum, row) => sum + row.items.reduce((value, item) => value + (item.cost || 0) * item.quantity, 0), 0)
    - returns.filter(row => row.returnOfTransactionId).reduce((sum, row) => sum + row.items.reduce((value, item) => value + (item.cost || 0) * item.quantity, 0), 0);
  const wages = managementWageDetails(transactions, profile, start, end).reduce((sum, row) => sum + row.item.total, 0);
  const oldExpenses = expenses.filter(row => !nonOperatingLinkedExpenses.has(row.id)).reduce((sum, row) => sum + row.items.filter(item => !isWageName(item.name)).reduce((value, item) => value + item.total, 0), 0);
  const newExpenses = selectedEntries.filter(row => row.kind === 'payment' && !row.linkedTransactionId && !operatingCategories.has(row.category || '')).reduce((sum, row) => sum + row.amountCents, 0) / 100;
  const operationalWithdrawals = selectedEntries.filter(row => row.kind === 'withdrawal' && row.category === 'despesa_operacional').reduce((sum, row) => sum + row.amountCents, 0) / 100;
  const operatingExpenses = oldExpenses + newExpenses + operationalWithdrawals;
  const fees = sales.reduce((sum, row) => sum + (row.machineFee || 0), 0);
  const profit = revenue - costs - operatingExpenses - wages - fees;
  const reserved = entries.filter(row => profile === 'todos' || row.profile === profile).filter(row => row.kind === 'reserve' || row.kind === 'reserve-use' || row.kind.startsWith('fund-')).reduce((sum, row) => sum + row.amountCents, 0) / 100;
  const unpaid = occurrences.filter(row => (profile === 'todos' || row.profile === profile) && row.status === 'open').map(row => {
    const paid = entries.filter(entry => entry.occurrenceId === row.id && entry.kind === 'payment').reduce((sum, entry) => sum + entry.amountCents, 0);
    return { ...row, remainingCents: Math.max(0, row.amountCents - paid) };
  }).filter(row => row.remainingCents > 0);
  const today = dateKey(new Date());
  const due = unpaid.filter(row => row.dueDate >= today);
  const overdue = unpaid.filter(row => row.dueDate < today);
  const withdrawals = selectedEntries.filter(row => row.kind === 'withdrawal').reduce((sum, row) => sum + row.amountCents, 0) / 100;
  const fabianoWages = transactions.filter(row => row.type === 'expense' && inPeriod(new Date(row.date), start, end)).reduce((sum, row) => sum + row.items.filter(item => isWageName(item.name) && /fabiano/i.test(item.name)).reduce((value, item) => value + item.total, 0), 0);
  return { gross, discounts, returns: returnsTotal, revenue, costs, operatingExpenses, wages, fees, profit, margin: revenue ? profit / revenue * 100 : 0, reserved,
    due, overdue, withdrawals, salesCount: sales.length, itemCount: sales.reduce((sum, row) => sum + row.items.reduce((value, item) => value + item.quantity, 0), 0),
    ticket: sales.length ? revenue / sales.length : 0, fabianoWages };
}

export function knownFreeBalance(transactions: Transaction[], entries: ManagementEntry[], profile: Profile, source: 'cash' | 'pix' | 'bank') {
  const openings = entries.filter(row => row.kind === 'opening-balance' && row.profile === profile && row.source === source && row.amountCents >= 0 && !entries.some(reversal => reversal.reversalOfId === row.id));
  const opening = openings.sort((a, b) => +new Date(b.date) - +new Date(a.date) || (b.id || 0) - (a.id || 0))[0];
  if (!opening) return undefined;
  const afterOpening = (date: Date | string, id?: number) => +new Date(date) > +new Date(opening.date) || (+new Date(date) === +new Date(opening.date) && (id || 0) > (opening.id || 0));
  let balance = opening.amountCents;
  for (const transaction of transactions) {
    if (transaction.profile !== profile || !afterOpening(transaction.date)) continue;
    const sign = transaction.type === 'sale' ? 1 : -1;
    if (transaction.paymentMethod === 'split') {
      for (const part of transaction.splitPayments || []) if (part.method === source) balance += sign * Math.round(part.amount * 100);
    } else if (transaction.paymentMethod === source) balance += sign * Math.round(transaction.total * 100);
  }
  for (const entry of entries) {
    if (entry.profile !== profile || entry.source !== source || !afterOpening(entry.date, entry.id)) continue;
    if (entry.kind === 'reserve' || entry.kind === 'fund-deposit' || entry.kind === 'withdrawal') balance -= entry.amountCents;
    else if (entry.kind === 'fund-withdrawal') balance -= entry.amountCents;
    else if (entry.kind === 'payment') {
      const freeOutflow = entry.linkedTransactionId ? -(entry.reserveUsedCents || 0) : entry.amountCents - (entry.reserveUsedCents || 0);
      balance -= freeOutflow;
    }
  }
  return balance;
}
