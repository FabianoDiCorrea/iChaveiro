import type { Profile, Transaction } from '../db/db';
import { financialTransaction } from '../db/financialAllocation';

/** Project a physical result set for the currently selected History profile. */
export function projectSalesHistoryRows(
  physicalRows: Transaction[],
  profile: Profile | 'todos',
  searchTerm: string
): Transaction[] {
  let rows = physicalRows
    .map(transaction => financialTransaction(transaction, profile))
    .filter((transaction): transaction is Transaction => transaction !== null);

  const normalizedSearch = searchTerm.trim().toLocaleLowerCase('pt-BR');
  if (normalizedSearch) {
    rows = rows.filter(transaction =>
      transaction.items.some(item => item.name.toLocaleLowerCase('pt-BR').includes(normalizedSearch))
      || transaction.paymentMethod.toLocaleLowerCase('pt-BR').includes(normalizedSearch)
      || (transaction.clientName && transaction.clientName.toLocaleLowerCase('pt-BR').includes(normalizedSearch))
    );
  }

  return rows;
}
