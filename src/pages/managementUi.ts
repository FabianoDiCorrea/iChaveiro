import type { Client, Product, Transaction, CashSession, PaymentMachine, InventoryPurchase, ProductCostHistory } from '../db/db';
import type { AccountPlan, AccountOccurrence, ManagementEntry, ManagementFund, ManagementGoal, ManagementScenario, ManagementCalendarEvent, ManagementNoticeState, ManagementSetting } from '../db/managementTypes';

export interface ManagementData {
  accounts: AccountPlan[];
  occurrences: AccountOccurrence[];
  entries: ManagementEntry[];
  funds: ManagementFund[];
  goals: ManagementGoal[];
  scenarios: ManagementScenario[];
  events: ManagementCalendarEvent[];
  notices: ManagementNoticeState[];
  settings: ManagementSetting[];
  transactions: Transaction[];
  cashSessions: CashSession[];
  products: Product[];
  clients: Client[];
  machines: PaymentMachine[];
  purchases: InventoryPurchase[];
  costHistory: ProductCostHistory[];
}

export const formatDate = (key: string) => key ? key.split('-').reverse().join('/') : '—';
export const inputCents = (value: string) => Math.round((Number(value.replace(',', '.')) || 0) * 100);
export const centsInput = (value: number) => (value / 100).toFixed(2);
export const sourceNames = { cash: 'Dinheiro físico', pix: 'PIX', bank: 'Banco', other: 'Outra origem' } as const;
let actionPending = false;
export const runAction = async (action: () => Promise<unknown>, success = 'Registro salvo.') => {
  if (actionPending) return false;
  actionPending = true;
  try { await action(); alert(success); return true; }
  catch (error) { alert(error instanceof Error ? error.message : 'Não foi possível concluir a operação.'); return false; }
  finally { actionPending = false; }
};
