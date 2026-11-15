import type { Product, TransactionItem } from './db';

export type CommercialActivity = 'service' | 'merchandise';
export type CommercialActivityFilter = 'all' | CommercialActivity;

export interface CommercialClassification {
  activity?: CommercialActivity;
  group: string;
  groupKey: string;
}

export interface CommercialGroupOption {
  activity?: CommercialActivity;
  group: string;
  groupKey: string;
}

export const normalizeCommercialText = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('pt-BR')
  .replace(/\s+/g, ' ')
  .trim();

export const commercialItemKey = (item: Pick<TransactionItem, 'productId' | 'service' | 'name'>) => item.productId
  ? `product:${item.productId}`
  : `manual:${item.service}:${normalizeCommercialText(item.name)}`;

const canonicalGroups: CommercialGroupOption[] = [
  { activity: 'service', group: 'Afiação de alicates', groupKey: 'service:Afiação de alicates' },
  { activity: 'service', group: 'Cópias de chaves comuns', groupKey: 'service:Cópias de chaves comuns' },
  { activity: 'service', group: 'Cópias de chaves tetra', groupKey: 'service:Cópias de chaves tetra' },
  { activity: 'service', group: 'Afiação de facas', groupKey: 'service:Afiação de facas' },
  { activity: 'service', group: 'Afiação de tesouras', groupKey: 'service:Afiação de tesouras' },
  { activity: 'service', group: 'Afiação de espátulas', groupKey: 'service:Afiação de espátulas' },
  { activity: 'merchandise', group: 'Venda de alicates', groupKey: 'merchandise:Venda de alicates' },
  { activity: 'merchandise', group: 'Venda de espátulas', groupKey: 'merchandise:Venda de espátulas' },
  { activity: 'merchandise', group: 'Venda de cadeados', groupKey: 'merchandise:Venda de cadeados' },
  { activity: 'merchandise', group: 'Venda de chaveiros', groupKey: 'merchandise:Venda de chaveiros' }
];

const canonicalGroup = (group: string) => canonicalGroups.find(option => normalizeCommercialText(option.group) === normalizeCommercialText(group));
const commercialGroupKey = (activity: CommercialActivity | undefined, group: string) => {
  const canonical = canonicalGroup(group);
  return `${activity || 'review'}:${canonical?.group || normalizeCommercialText(group)}`;
};

function classifyByDescription(description: string, serviceType?: string) {
  const hasKey = /\bchaves?\b/.test(description);
  const hasTetra = /\btetras?\b/.test(description);
  const hasCommonKey = hasKey && /\b(?:comum|comuns)\b/.test(description);
  const explicitSharpening = /\bafiac(?:ao|oes)\b|\bafiar\b|\bafiamento\b/.test(description);
  const sharpeningFor = (tool: string) => explicitSharpening && new RegExp(`\\b${tool}s?\\b`).test(description);

  if (hasKey && hasTetra) return { activity: 'service' as const, group: 'Cópias de chaves tetra' };
  if (hasCommonKey) return { activity: 'service' as const, group: 'Cópias de chaves comuns' };
  if (sharpeningFor('alicate')) return { activity: 'service' as const, group: 'Afiação de alicates' };
  if (sharpeningFor('faca') || sharpeningFor('facas')) return { activity: 'service' as const, group: 'Afiação de facas' };
  if (sharpeningFor('tesoura') || sharpeningFor('tesouras')) return { activity: 'service' as const, group: 'Afiação de tesouras' };
  if (sharpeningFor('espatula') || sharpeningFor('espatulas')) return { activity: 'service' as const, group: 'Afiação de espátulas' };

  // Key blanks are stock items in the catalog, but the common and tetra key
  // copies above remain service revenue even when their legacy flag says sale.
  const keyCopy = serviceType === 'key' && hasKey && !/\bcadeado\b|\bmiolo\b|\bchaveiro\b/.test(description);
  if (keyCopy) return { activity: 'service' as const, group: 'Outros serviços' };

  return undefined;
}

const genericGroups = new Set([
  'outros', 'outras mercadorias', 'outros servicos', 'servicos', 'mercadorias',
  'precisa classificar', 'sem classificacao'
]);

export function classifyCommercialItem(item: Pick<TransactionItem, 'service' | 'name' | 'isService'>, product?: Product): CommercialClassification {
  const description = normalizeCommercialText(`${product?.name || item.name} ${item.name} ${product?.customCategory || ''}`);
  const serviceType = product?.serviceType || item.service;
  const semantic = classifyByDescription(description, serviceType);

  // A recognized copy/sharpening service is stronger evidence than legacy
  // inventory flags. For all other items, keep explicit activity and valid
  // manually selected groups intact.
  const declaredActivity = product?.commercialActivity
    || (product?.isService !== undefined ? (product.isService ? 'service' : 'merchandise') : item.isService !== undefined ? (item.isService ? 'service' : 'merchandise') : undefined);
  const activity = semantic?.activity || declaredActivity
    || (serviceType === 'key' && /\bchave\b/.test(description) && !/\bcadeado\b|\bmiolo\b|\bchaveiro\b/.test(description) ? 'service' : undefined);
  const storedGroup = product?.commercialGroup?.trim();
  const normalizedStored = storedGroup ? normalizeCommercialText(storedGroup) : '';
  const storedIsGeneric = genericGroups.has(normalizedStored);
  const storedCanonical = storedGroup ? canonicalGroup(storedGroup) : undefined;
  const storedConflictsWithActivity = storedCanonical && activity && storedCanonical.activity !== activity;
  const preserveManualGroup = storedGroup && !storedIsGeneric && !storedConflictsWithActivity
    && (!semantic || !storedCanonical);

  const inferredGroup = semantic?.group
    || (activity === 'merchandise' && /\balicate\b/.test(description) ? 'Venda de alicates'
      : activity === 'merchandise' && /\bespatula\b/.test(description) ? 'Venda de espátulas'
      : activity === 'merchandise' && /\bcadeado\b/.test(description) ? 'Venda de cadeados'
      : activity === 'merchandise' && /\bchaveiro\b/.test(description) ? 'Venda de chaveiros'
      : activity === 'service' ? 'Outros serviços'
      : activity === 'merchandise' ? 'Outras mercadorias'
      : 'Precisa classificar');
  const group = preserveManualGroup ? storedGroup : inferredGroup;

  return { activity, group, groupKey: commercialGroupKey(activity, group) };
}

export function commercialGroupOptions(groups: CommercialGroupOption[] = []): CommercialGroupOption[] {
  const unique = new Map<string, CommercialGroupOption>();
  for (const option of [...canonicalGroups, ...groups]) {
    const canonical = canonicalGroup(option.group);
    const normalized = canonical?.group || option.group.trim().replace(/\s+/g, ' ');
    const activity = canonical?.activity || option.activity;
    const groupKey = commercialGroupKey(activity, normalized);
    if (!unique.has(groupKey)) unique.set(groupKey, { activity, group: normalized, groupKey });
  }
  return [...unique.values()].sort((a, b) => a.group.localeCompare(b.group, 'pt-BR'));
}

export function commercialGoalItemMatches(
  item: Pick<TransactionItem, 'service' | 'name' | 'isService'>,
  product: Product | undefined,
  goalKind: 'services' | 'key_copies' | 'plier_sharpening' | 'category',
  category?: string
) {
  const classification = classifyCommercialItem(item, product);
  if (goalKind === 'services') return classification.activity === 'service';
  if (goalKind === 'key_copies') return classification.activity === 'service' && item.service === 'key';
  if (goalKind === 'plier_sharpening') return classification.group === 'Afiação de alicates';
  if (!category?.startsWith('group:')) return item.service === category;
  const selectedGroup = category.slice(6);
  return selectedGroup.startsWith('service:') || selectedGroup.startsWith('merchandise:')
    ? classification.groupKey === selectedGroup
    : normalizeCommercialText(classification.group) === normalizeCommercialText(selectedGroup);
}
