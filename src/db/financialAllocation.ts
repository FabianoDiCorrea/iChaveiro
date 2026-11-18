import type { PaymentMethod, Profile, Transaction, TransactionItem } from './db';

const cents = (value: number) => Math.round((value || 0) * 100);
const money = (value: number) => value / 100;

export const itemFinancialProfile = (item: TransactionItem, cashProfile: Profile): Profile =>
  item.financialProfile || cashProfile;

// New cart items inherit the sale profile until the operator pins them to the other profile.
// A second toggle clears that pin, even if the sale profile changed in the meantime.
export function toggleItemFinancialProfile(item: TransactionItem, saleProfile: Profile): TransactionItem {
  if (item.financialProfile) {
    const defaultItem = { ...item };
    delete defaultItem.financialProfile;
    return defaultItem;
  }
  return { ...item, financialProfile: saleProfile === 'chaveiro' ? 'fabiano' : 'chaveiro' };
}

export const hasFinancialDistribution = (transaction: Transaction): boolean =>
  transaction.items.some(item => itemFinancialProfile(item, transaction.profile) !== transaction.profile);

export const itemDiscountCents = (item: TransactionItem): number =>
  item.originalPrice !== undefined
    ? Math.max(0, cents(item.originalPrice * item.quantity) - cents(item.total)) : 0;

const itemDiscountTotal = (transaction: Transaction): number =>
  transaction.type === 'sale' ? transaction.items.reduce((sum, item) => sum + itemDiscountCents(item), 0) : 0;

// Allocate whole cents by the largest remainder. The sorted profile order makes ties stable.
export function allocateCents(total: number, weights: Record<string, number>): Record<string, number> {
  const keys = Object.keys(weights).sort();
  const result: Record<string, number> = Object.fromEntries(keys.map(key => [key, 0]));
  if (keys.length === 0 || total === 0) return result;
  const weightSum = keys.reduce((sum, key) => sum + Math.max(0, weights[key] || 0), 0);
  if (weightSum === 0) { result[keys[0]] = total; return result; }
  const sign = Math.sign(total);
  const magnitude = Math.abs(total);
  const shares = keys.map(key => {
    const exact = magnitude * Math.max(0, weights[key] || 0) / weightSum;
    const whole = Math.floor(exact);
    result[key] = whole * sign;
    return { key, remainder: exact - whole };
  });
  let remaining = magnitude - shares.reduce((sum, share) => sum + Math.abs(result[share.key]), 0);
  shares.sort((a, b) => b.remainder - a.remainder || a.key.localeCompare(b.key));
  for (let index = 0; remaining > 0; index++, remaining--) result[shares[index % shares.length].key] += sign;
  return result;
}

export interface FinancialShare {
  profile: Profile;
  items: TransactionItem[];
  gross: number;
  discount: number;
  total: number;
  machineFee: number;
  splitPayments?: { method: PaymentMethod; amount: number }[];
}

export function getFinancialShares(transaction: Transaction): FinancialShare[] {
  const individualDiscounts = itemDiscountTotal(transaction);
  if (!hasFinancialDistribution(transaction)) return [{
    profile: transaction.profile, items: transaction.items, gross: transaction.total + (transaction.discount || 0) + money(individualDiscounts),
    discount: (transaction.discount || 0) + money(individualDiscounts), total: transaction.total, machineFee: transaction.machineFee || 0,
    splitPayments: transaction.splitPayments
  }];

  const grouped = new Map<Profile, TransactionItem[]>();
  for (const item of transaction.items) {
    const profile = itemFinancialProfile(item, transaction.profile);
    grouped.set(profile, [...(grouped.get(profile) || []), item]);
  }
  const profiles = [...grouped.keys()].sort();
  const weights: Record<string, number> = Object.fromEntries(profiles.map(profile => [profile, grouped.get(profile)!.reduce((sum, item) => sum + Math.max(0, cents(item.total)), 0)]));
  const net = allocateCents(cents(transaction.total), weights);
  const generalDiscounts = allocateCents(cents(transaction.discount || 0), weights);
  const discounts = Object.fromEntries(profiles.map(profile => [profile,
    generalDiscounts[profile] + (transaction.type === 'sale' ? grouped.get(profile)!.reduce((sum, item) => sum + itemDiscountCents(item), 0) : 0)
  ]));
  const fees = allocateCents(cents(transaction.machineFee || 0), net);
  const payments: Record<string, { method: PaymentMethod; amount: number }[]> = Object.fromEntries(profiles.map(profile => [profile, []]));

  if (transaction.paymentMethod === 'split' && transaction.splitPayments?.length) {
    const remaining = { ...net };
    transaction.splitPayments.forEach((payment, index) => {
      const part = index === transaction.splitPayments!.length - 1
        ? { ...remaining }
        : allocateCents(cents(payment.amount), remaining);
      for (const profile of profiles) {
        remaining[profile] -= part[profile];
        if (part[profile]) payments[profile].push({ method: payment.method, amount: money(part[profile]) });
      }
    });
  }

  return profiles.map(profile => ({
    profile,
    items: grouped.get(profile)!,
    gross: money(net[profile] + discounts[profile]),
    discount: money(discounts[profile]),
    total: money(net[profile]),
    machineFee: money(fees[profile]),
    splitPayments: transaction.paymentMethod === 'split' ? payments[profile] : undefined
  }));
}

// A projected transaction is only for financial views. The database retains one physical sale.
export function financialTransaction(transaction: Transaction, profile: Profile | 'todos'): Transaction | null {
  if (profile === 'todos') return itemDiscountTotal(transaction)
    ? { ...transaction, discount: money(cents(transaction.discount || 0) + itemDiscountTotal(transaction)) }
    : transaction;
  const share = getFinancialShares(transaction).find(entry => entry.profile === profile);
  if (!share) return null;
  if (!hasFinancialDistribution(transaction) && !itemDiscountTotal(transaction)) return transaction;
  const machineWeights = Object.fromEntries(getFinancialShares(transaction).map(row => [row.profile, Math.max(0, Math.round(row.total * 100))]));
  return {
    ...transaction,
    profile: share.profile,
    cashProfile: transaction.profile,
    items: share.items,
    total: share.total,
    discount: share.discount,
    machineFee: share.machineFee,
    splitPayments: share.splitPayments,
    machinePayments: transaction.machinePayments?.flatMap(payment => {
      const gross = allocateCents(payment.grossCents, machineWeights)[share.profile] || 0;
      const fee = allocateCents(payment.feeCents || 0, machineWeights)[share.profile] || 0;
      return gross || fee ? [{ ...payment, grossCents: gross, feeCents: fee, netCents: gross - fee }] : [];
    })
  };
}
