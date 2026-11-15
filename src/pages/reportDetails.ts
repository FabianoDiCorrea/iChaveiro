import type { Transaction } from '../db/db';
import { itemDiscountCents } from '../db/financialAllocation';

export type DetailKind = 'gross' | 'discounts' | 'returns' | 'other' | 'wages' | 'fees' | 'costs';

export interface DetailRow {
  transactionId?: number;
  date: Date;
  profile: string;
  description: string;
  category: string;
  quantity: number;
  value: number;
  employee?: string;
  paymentMethod?: Transaction['paymentMethod'];
  machineName?: string;
  machineRate?: number;
  installments?: number;
  gross?: number;
  net?: number;
}

const isWage = (name: string) => {
  const lower = name.toLowerCase();
  return lower.includes('diária') || lower.includes('diaria');
};

const categoryNames: Record<string, string> = {
  key: 'Chaves', plier: 'Alicates', scissor: 'Tesouras', knife: 'Facas',
  spring: 'Molinhas', screw: 'Parafusos', other: 'Outros', custom: 'Personalizado'
};
const categoryName = (service: string) => categoryNames[service] || 'Produto';

export function getReportDetailRows(transactions: Transaction[], kind: DetailKind): DetailRow[] {
  const rows: DetailRow[] = [];
  for (const transaction of transactions) {
    const base = { transactionId: transaction.id, date: new Date(transaction.date), profile: transaction.profile, paymentMethod: transaction.paymentMethod };
    const items = transaction.items || [];
    if (transaction.type === 'sale') {
      if (kind === 'gross') rows.push({ ...base, description: items.map(item => item.name).join(', ') || 'Venda', category: 'Venda', quantity: items.reduce((sum, item) => sum + item.quantity, 0), value: transaction.total + (transaction.discount || 0) });
      if (kind === 'discounts' && transaction.discount) {
        const itemDiscount = items.reduce((sum, item) => sum + itemDiscountCents(item), 0) / 100;
        const generalDiscount = Math.round(transaction.discount * 100) / 100 - itemDiscount;
        if (generalDiscount > 0) rows.push({ ...base, description: items.map(item => item.name).join(', ') || 'Venda', category: 'Desconto da venda', quantity: items.reduce((sum, item) => sum + item.quantity, 0), value: generalDiscount });
        for (const item of items) {
          const value = itemDiscountCents(item) / 100;
          if (value) rows.push({ ...base, description: item.name, category: 'Desconto do item', quantity: item.quantity, value });
        }
      }
      if (kind === 'fees' && transaction.machinePayments?.length) for (const payment of transaction.machinePayments) {
        rows.push({ ...base, paymentMethod: payment.method, description: items.map(item => item.name).join(', ') || 'Venda', category: payment.machineId ? `Equipamento de ${payment.ownerProfile === 'fabiano' ? 'Fabiano' : 'Chaveiro'}` : 'PIX direto', machineName: payment.machineName || (payment.machineId ? 'Maquininha não informada' : 'PIX direto em conta'), machineRate: payment.ratePercent, installments: payment.installments, gross: payment.grossCents / 100, net: (payment.netCents ?? (payment.grossCents - (payment.feeCents || 0))) / 100, quantity: 1, value: (payment.feeCents || 0) / 100 });
      }
      else if (kind === 'fees' && transaction.machineFee) rows.push({ ...base, description: items.map(item => item.name).join(', ') || 'Venda', category: 'Histórico legado · maquininha não informada', machineName: 'Maquininha não informada', gross: transaction.total, net: transaction.total - transaction.machineFee, quantity: 1, value: transaction.machineFee });
      if (kind === 'costs') for (const item of items) {
        const value = (item.cost || 0) * item.quantity;
        if (value) rows.push({ ...base, description: item.name, category: categoryName(item.service), quantity: item.quantity, value });
      }
    } else if (transaction.type === 'return') {
      if (kind === 'returns') rows.push({ ...base, description: items.map(item => item.name).join(', ') || 'Devolução', category: 'Devolução', quantity: items.reduce((sum, item) => sum + item.quantity, 0), value: transaction.total });
      if (kind === 'costs' && transaction.returnOfTransactionId) for (const item of items) {
        const value = -(item.cost || 0) * item.quantity;
        if (value) rows.push({ ...base, description: `Devolução: ${item.name}`, category: categoryName(item.service), quantity: -item.quantity, value });
      }
    } else if (transaction.type === 'expense' && (kind === 'other' || kind === 'wages')) {
      for (const item of items) if (isWage(item.name || '') === (kind === 'wages')) {
        rows.push({ ...base, description: item.name || 'Despesa', category: kind === 'wages' ? 'Diária' : categoryName(item.service), quantity: item.quantity, value: item.total, employee: kind === 'wages' ? (item.name?.split(':').slice(1).join(':').trim() || item.name || 'Funcionário não informado') : undefined });
      }
    }
  }
  return rows.sort((a, b) => b.date.getTime() - a.date.getTime() || (b.transactionId || 0) - (a.transactionId || 0));
}
