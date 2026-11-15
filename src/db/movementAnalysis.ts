import type { Product, Transaction, TransactionItem } from './db';
import { allocateCents, financialTransaction, itemDiscountCents, itemFinancialProfile } from './financialAllocation';
import { commercialItemKey, classifyCommercialItem, normalizeCommercialText, type CommercialActivityFilter } from './commercialClassification';
import { dateKey } from './managementMath';

export interface CommercialItemOption {
  key: string;
  productId?: number;
  name: string;
  code?: string;
  service: TransactionItem['service'];
  activity?: 'service' | 'merchandise';
  group: string;
  groupKey: string;
  searchText: string;
}

export interface MovementCommercialFilters {
  activity: CommercialActivityFilter;
  groupKey: string;
  itemKey: string;
  query: string;
}

export interface MovementMatchedItem {
  item: TransactionItem;
  index: number;
  description: string;
  code: string;
  activity?: 'service' | 'merchandise';
  group: string;
  groupKey: string;
  financialProfile: Transaction['profile'];
  quantity: number;
  revenueCents: number;
}

export interface MovementDetailRow {
  transaction: Transaction;
  sourceTransaction: Transaction;
  items: MovementMatchedItem[];
  quantity: number;
  revenueCents: number;
}

export interface MovementTotals {
  sales: number;
  units: number;
  revenueCents: number;
  averageSaleCents: number;
  transactionCount: number;
}

export type MovementMetric = 'sales' | 'units' | 'revenue' | 'average';

export function movementRowsForHour(rows: MovementDetailRow[], firstHour: number, lastHour: number, weekday?: number): MovementDetailRow[] {
  return rows.filter(row => {
    const date = new Date(row.transaction.date);
    return date.getHours() >= firstHour && date.getHours() < lastHour && (weekday === undefined || date.getDay() === weekday);
  });
}

export function movementRowsForDate(rows: MovementDetailRow[], day: string): MovementDetailRow[] {
  return rows.filter(row => dateKey(new Date(row.transaction.date)) === day);
}

export function movementRowsForDayBand(rows: MovementDetailRow[], low: number, high: number): MovementDetailRow[] {
  return rows.filter(row => {
    const day = Number(dateKey(new Date(row.transaction.date)).slice(8));
    return day >= low && day <= high;
  });
}

const codeFromName = (name: string) => name.match(/^\[([^\]]+)\]/)?.[1] || '';

export function commercialItemOptions(transactions: Transaction[], products: Product[]): CommercialItemOption[] {
  const options = new Map<string, CommercialItemOption>();
  const add = (item: TransactionItem, product?: Product) => {
    const classification = classifyCommercialItem(item, product);
    const key = commercialItemKey(item);
    const name = product?.name || item.name;
    const code = product?.code || codeFromName(item.name);
    const searchText = normalizeCommercialText(`${name} ${item.name} ${code} ${product?.customCategory || ''}`);
    const current = options.get(key);
    if (!current || (product && !current.productId)) options.set(key, {
      key, productId: item.productId, name, code: code || undefined, service: item.service,
      activity: classification.activity, group: classification.group, groupKey: classification.groupKey, searchText
    });
  };
  for (const product of products) add({ service: product.serviceType, name: product.name, productId: product.id, isService: product.isService, quantity: 0, price: 0, cost: 0, total: 0 }, product);
  for (const transaction of transactions) for (const item of transaction.items) add(item, products.find(product => product.id === item.productId));
  return [...options.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

/** Same per-item discount allocation used by Rentabilidade, in whole cents. */
export function commercialItemRevenueCents(transaction: Transaction): number[] {
  const itemDiscounts = transaction.type === 'sale'
    ? transaction.items.reduce((sum, item) => sum + itemDiscountCents(item), 0)
    : 0;
  const generalDiscount = transaction.type === 'sale'
    ? Math.max(0, Math.round((transaction.discount || 0) * 100) - itemDiscounts)
    : 0;
  const discounts = allocateCents(generalDiscount, Object.fromEntries(transaction.items.map((item, index) => [String(index), Math.round(item.total * 100)])));
  return transaction.items.map((item, index) => Math.round(item.total * 100) - (discounts[String(index)] || 0));
}

export function movementRows(transactions: Transaction[], products: Product[], profile: Parameters<typeof financialTransaction>[1], filters: MovementCommercialFilters): MovementDetailRow[] {
  const query = normalizeCommercialText(filters.query);
  return transactions.flatMap(original => {
    const transaction = financialTransaction(original, profile);
    if (!transaction || (transaction.type !== 'sale' && transaction.type !== 'return')) return [];
    const itemValues = commercialItemRevenueCents(transaction);
    const sign = transaction.type === 'sale' ? 1 : -1;
    const matching = transaction.items.flatMap((item, index) => {
      const product = products.find(candidate => candidate.id === item.productId);
      const classification = classifyCommercialItem(item, product);
      const key = commercialItemKey(item);
      const description = item.name;
      const code = product?.code || codeFromName(item.name);
      const searchText = normalizeCommercialText(`${item.name} ${product?.name || ''} ${product?.customCategory || ''} ${code}`);
      if (filters.activity !== 'all' && classification.activity !== filters.activity) return [];
      if (filters.groupKey && classification.groupKey !== filters.groupKey) return [];
      if (filters.itemKey && key !== filters.itemKey) return [];
      if (query && !searchText.includes(query)) return [];
      return [{
        item, index, description, code, activity: classification.activity, group: classification.group,
        groupKey: classification.groupKey, financialProfile: itemFinancialProfile(item, transaction.profile),
        quantity: sign * item.quantity, revenueCents: sign * (itemValues[index] || 0)
      }];
    });
    if (!matching.length) return [];
    return [{
      transaction,
      sourceTransaction: original,
      items: matching,
      quantity: matching.reduce((sum, item) => sum + item.quantity, 0),
      revenueCents: matching.reduce((sum, item) => sum + item.revenueCents, 0)
    }];
  });
}

export function movementTotals(rows: MovementDetailRow[]): MovementTotals {
  const sales = new Set(rows.filter(row => row.transaction.type === 'sale').map(row => row.transaction));
  const transactions = new Set(rows.map(row => row.transaction));
  const revenueCents = rows.reduce((sum, row) => sum + row.revenueCents, 0);
  return {
    sales: sales.size,
    units: rows.reduce((sum, row) => sum + row.quantity, 0),
    revenueCents,
    averageSaleCents: sales.size ? Math.round(revenueCents / sales.size) : 0,
    transactionCount: transactions.size
  };
}

export function movementMetricValue(totals: MovementTotals, metric: MovementMetric): number {
  if (metric === 'sales') return totals.sales;
  if (metric === 'units') return totals.units;
  if (metric === 'average') return totals.averageSaleCents;
  return totals.revenueCents;
}
