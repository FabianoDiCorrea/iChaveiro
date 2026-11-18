import type { Product, Profile, Transaction } from './db';
import { financialTransaction } from './financialAllocation';
import { classifyCommercialItem, commercialItemKey, normalizeCommercialText } from './commercialClassification';
import { commercialItemRevenueCents } from './movementAnalysis';
import { dateKey } from './managementMath';

export type PrimaryActivityKey = 'key-copies' | 'plier-sharpening' | 'knife-sharpening' | 'scissor-sharpening' | 'merchandise' | 'other-services' | 'unclassified';
export type ActivityMetric = 'revenue' | 'units' | 'margin';

export const PRIMARY_ACTIVITIES: { key: PrimaryActivityKey; label: string; color: string }[] = [
  { key: 'key-copies', label: 'Cópias de chaves', color: '#38bdf8' },
  { key: 'plier-sharpening', label: 'Afiação de alicates', color: '#f59e0b' },
  { key: 'knife-sharpening', label: 'Afiação de facas', color: '#a78bfa' },
  { key: 'scissor-sharpening', label: 'Afiação de tesouras', color: '#fb7185' },
  { key: 'merchandise', label: 'Venda de mercadorias', color: '#34d399' },
  { key: 'other-services', label: 'Outros serviços', color: '#f472b6' },
  { key: 'unclassified', label: 'Sem classificação', color: '#94a3b8' }
];

export interface ActivityProfitabilityItem {
  key: string;
  name: string;
  code?: string;
  group: string;
  groupKey: string;
  quantity: number;
  revenueCents: number;
  costCents: number;
  costKnown: boolean;
}

export interface ActivityProfitabilityGroup {
  key: string;
  name: string;
  quantity: number;
  revenueCents: number;
  costCents: number;
  costKnown: boolean;
  items: ActivityProfitabilityItem[];
}

export interface ActivityProfitabilityRow {
  key: PrimaryActivityKey;
  label: string;
  color: string;
  quantity: number;
  revenueCents: number;
  costCents: number;
  costKnown: boolean;
  marginCents: number | null;
  groups: ActivityProfitabilityGroup[];
}

const activityKeyFor = (activity: string | undefined, group: string, itemService: string): PrimaryActivityKey => {
  const normalizedGroup = normalizeCommercialText(group);
  if (activity === 'merchandise') return 'merchandise';
  if (activity === 'service' && (itemService === 'key' || normalizedGroup.startsWith('copias de chave'))) return 'key-copies';
  if (normalizedGroup === 'afiacao de alicates') return 'plier-sharpening';
  if (normalizedGroup === 'afiacao de facas') return 'knife-sharpening';
  if (normalizedGroup === 'afiacao de tesouras') return 'scissor-sharpening';
  if (activity === 'service') return 'other-services';
  return 'unclassified';
};

const itemCode = (itemName: string, product?: Product) => product?.code || itemName.match(/^\[([^\]]+)\]/)?.[1];

export function activityProfitabilityRows(
  transactions: Transaction[],
  products: Product[],
  profile: Profile | 'todos',
  start: string,
  end: string
): ActivityProfitabilityRow[] {
  const totals = new Map<PrimaryActivityKey, { quantity: number; revenueCents: number; costCents: number; costKnown: boolean; groups: Map<string, { quantity: number; revenueCents: number; costCents: number; costKnown: boolean; items: Map<string, ActivityProfitabilityItem> }> }>();
  for (const activity of PRIMARY_ACTIVITIES) totals.set(activity.key, { quantity: 0, revenueCents: 0, costCents: 0, costKnown: true, groups: new Map() });

  for (const original of transactions) {
    const day = dateKey(new Date(original.date));
    if (day < start || day > end) continue;
    const transaction = financialTransaction(original, profile);
    if (!transaction || (transaction.type !== 'sale' && transaction.type !== 'return')) continue;
    const sign = transaction.type === 'sale' ? 1 : -1;
    const itemRevenue = commercialItemRevenueCents(transaction);

    transaction.items.forEach((item, index) => {
      const product = products.find(candidate => candidate.id === item.productId);
      const classification = classifyCommercialItem(item, product);
      const activityKey = activityKeyFor(classification.activity, classification.group, item.service);
      const activity = totals.get(activityKey)!;
      const groupKey = classification.groupKey;
      const itemKey = commercialItemKey(item);
      const costKnown = item.cost !== undefined && item.cost !== null
        && !(item.cost === 0 && (product?.hasStock || (item.productId !== undefined && !product)));
      const revenueCents = sign * (itemRevenue[index] || 0);
      const quantity = sign * item.quantity;
      const costCents = sign * Math.round((item.cost || 0) * item.quantity * 100);
      activity.quantity += quantity;
      activity.revenueCents += revenueCents;
      activity.costCents += costCents;
      activity.costKnown &&= costKnown;

      const group = activity.groups.get(groupKey) || { quantity: 0, revenueCents: 0, costCents: 0, costKnown: true, items: new Map<string, ActivityProfitabilityItem>() };
      group.quantity += quantity;
      group.revenueCents += revenueCents;
      group.costCents += costCents;
      group.costKnown &&= costKnown;
      const existingItem = group.items.get(itemKey) || {
        key: itemKey, name: product?.name || item.name, code: itemCode(item.name, product), group: classification.group,
        groupKey, quantity: 0, revenueCents: 0, costCents: 0, costKnown: true
      };
      existingItem.quantity += quantity;
      existingItem.revenueCents += revenueCents;
      existingItem.costCents += costCents;
      existingItem.costKnown &&= costKnown;
      group.items.set(itemKey, existingItem);
      activity.groups.set(groupKey, group);
    });
  }

  return PRIMARY_ACTIVITIES.map(({ key, label, color }) => {
    const activity = totals.get(key)!;
    const groups: ActivityProfitabilityGroup[] = [...activity.groups.entries()].map(([groupKey, group]) => ({
      key: groupKey,
      name: group.items.values().next().value?.group || groupKey,
      quantity: group.quantity,
      revenueCents: group.revenueCents,
      costCents: group.costCents,
      costKnown: group.costKnown,
      items: [...group.items.values()].sort((a, b) => b.revenueCents - a.revenueCents)
    })).sort((a, b) => b.revenueCents - a.revenueCents);
    return {
      key, label, color,
      quantity: activity.quantity,
      revenueCents: activity.revenueCents,
      costCents: activity.costCents,
      costKnown: activity.costKnown,
      marginCents: activity.costKnown ? activity.revenueCents - activity.costCents : null,
      groups
    };
  });
}

export const activityMetricValue = (row: ActivityProfitabilityRow, metric: ActivityMetric): number | null =>
  metric === 'revenue' ? row.revenueCents : metric === 'units' ? row.quantity : row.marginCents;

export const activityMetricTotal = (rows: ActivityProfitabilityRow[], metric: ActivityMetric): number | null => {
  if (metric === 'margin' && rows.some(row => row.revenueCents !== 0 && row.marginCents === null)) return null;
  return rows.reduce((sum, row) => sum + (activityMetricValue(row, metric) || 0), 0);
};

export const activityMetricCanUseDonut = (rows: ActivityProfitabilityRow[], metric: ActivityMetric): boolean => {
  const total = activityMetricTotal(rows, metric);
  if (total === null || total <= 0 || rows.some(row => (activityMetricValue(row, metric) || 0) < 0)) return false;
  return true;
};
