import Dexie, { type EntityTable } from 'dexie';
import type { AccountPlan, AccountOccurrence, ManagementEntry, ManagementFund, ManagementGoal, ManagementScenario, ManagementCalendarEvent, ManagementNoticeState, ManagementAudit, ManagementSetting } from './managementTypes';

export const PROFILES = ['chaveiro', 'fabiano'] as const;
export type Profile = typeof PROFILES[number];
export type PaymentMethod = 'cash' | 'debit' | 'credit' | 'pix' | 'split';
export type ServiceType = 'key' | 'plier' | 'scissor' | 'knife' | 'spring' | 'screw' | 'other' | 'custom';

export interface Loss {
  id?: number;
  date: Date;
  productId: number;
  productCode: string;
  productName: string;
  quantity: number;
  type: 'return' | 'error';
  operator: Profile;
  notes?: string;
}

export interface TransactionItem {
  service: ServiceType;
  name: string;
  quantity: number;
  price: number;
  cost: number;
  replacementCost?: number;
  total: number;
  productId?: number;
  isService?: boolean;
  originalPrice?: number;
  financialProfile?: Profile;
  sourceItemIndex?: number;
}

export interface PendingSale {
  id?: number;
  profile: Profile;
  clientName: string;
  receiptName?: string;
  clientPhone?: string;
  items: TransactionItem[];
  total: number;
  date: Date;
  discount?: number;
  paymentMethod?: PaymentMethod;
  splitPayments?: { method: PaymentMethod; amount: number; installments?: number; machineId?: number; machineFee?: number; netAmount?: number }[];
}

export type MachineRate = { method: 'pix' | 'debit' | 'credit'; installment?: number; percent?: number; fixedCents?: number; configured: boolean };
export interface PaymentMachine { id?: number; name: string; brand?: string; alias?: string; ownerProfile: Profile; rates: MachineRate[]; receiveDays?: number; notes?: string; active: boolean }
export interface InventoryPurchase { id?: number; productId: number; quantity: number; unitCostCents: number; totalCents: number; date: Date; supplier?: string; reference?: string; notes?: string; profile: Profile }
export interface ProductCostHistory { id?: number; productId: number; acquisitionCostCents: number; replacementCostCents?: number; at: Date; note?: string }

export interface Transaction {
  id?: number;
  profile: Profile;
  type: 'sale' | 'return' | 'expense';
  items: TransactionItem[];
  total: number;
  discount?: number;
  machineFee?: number;
  machineId?: number;
  machineOwnerProfile?: Profile;
  machineFeeRate?: number;
  machineFeeCents?: number;
  machineNetCents?: number;
  machinePayments?: { method: PaymentMethod; installments?: number; machineId?: number; machineName?: string; ownerProfile?: Profile; ratePercent?: number; grossCents: number; feeCents?: number; netCents?: number }[];
  paymentMethod: PaymentMethod;
  splitPayments?: { method: PaymentMethod; amount: number; installments?: number; machineId?: number; machineFee?: number; netAmount?: number }[];
  clientId?: number;
  clientName?: string;
  clientCode?: string;
  date: Date;
  cashProfile?: Profile; // Only used by financial report projections; profile identifies the physical sale.
  returnOfTransactionId?: number;
}

export interface Client {
  id?: number;
  name: string;
  phone: string;
  address: string;
  code: string;
  createdAt: Date;
  groups?: string[];
  notes?: string;
}

export interface Employee {
  id?: number;
  name: string;
  dailyWage: number;
  active: boolean;
  createdAt: Date;
}

export interface Product {
  id?: number;
  profile: Profile;
  name: string;
  price: number;
  costPrice: number;
  replacementCostCents?: number;
  reserveForRestock?: boolean;
  stock: number;
  hasStock: boolean;     // whether to track inventory for this item
  isService?: boolean;   // explicitly mark as Service (true) or Venda (false)
  serviceType: ServiceType;
  customCategory?: string; // label when serviceType === 'custom'
  commercialActivity?: 'service' | 'merchandise';
  commercialGroup?: string;
  code?: string;
  brand?: string;
  idealStock?: number;
  lastPurchasedDate?: Date;
  lastPurchasedQty?: number;
}

export interface CashSession {
  id?: number;
  profile: Profile;
  openedAt: Date;
  closedAt?: Date;
  initialCash: number;
  expectedCash?: number;
  actualCash?: number;
  leftInDrawer?: number;
  difference?: number;
  status: 'open' | 'closed';
  pixSales?: number;
  debitSales?: number;
  creditSales?: number;
  cashSales?: number;
}

const db = new Dexie('iChaveiroDB') as Dexie & {
  transactions: EntityTable<Transaction, 'id'>;
  clients: EntityTable<Client, 'id'>;
  products: EntityTable<Product, 'id'>;
  cashSessions: EntityTable<CashSession, 'id'>;
  losses: EntityTable<Loss, 'id'>;
  pendingSales: EntityTable<PendingSale, 'id'>;
  employees: EntityTable<Employee, 'id'>;
  managementAccounts: EntityTable<AccountPlan, 'id'>;
  managementOccurrences: EntityTable<AccountOccurrence, 'id'>;
  managementEntries: EntityTable<ManagementEntry, 'id'>;
  managementFunds: EntityTable<ManagementFund, 'id'>;
  managementGoals: EntityTable<ManagementGoal, 'id'>;
  managementScenarios: EntityTable<ManagementScenario, 'id'>;
  managementEvents: EntityTable<ManagementCalendarEvent, 'id'>;
  managementNoticeStates: EntityTable<ManagementNoticeState, 'key'>;
  managementAudit: EntityTable<ManagementAudit, 'id'>;
  managementSettings: EntityTable<ManagementSetting, 'key'>;
  paymentMachines: EntityTable<PaymentMachine, 'id'>;
  inventoryPurchases: EntityTable<InventoryPurchase, 'id'>;
  productCostHistory: EntityTable<ProductCostHistory, 'id'>;
};

db.version(5).stores({
  transactions: '++id, profile, type, paymentMethod, date, clientId',
  clients: '++id, name, phone, code',
  products: '++id, profile, name, code, brand, serviceType'
}).upgrade(tx => {
  return tx.table('products').toCollection().modify(product => {
    if (product.costPrice === undefined) product.costPrice = 0;
  });
});

db.version(6).stores({
  transactions: '++id, profile, type, paymentMethod, date, clientId',
  clients: '++id, name, phone, code',
  products: '++id, profile, name, code, brand, serviceType',
  cashSessions: '++id, profile, status, openedAt, closedAt'
});

db.version(7).stores({
  transactions: '++id, profile, type, paymentMethod, date, clientId',
  clients: '++id, name, phone, code',
  products: '++id, profile, name, code, brand, serviceType, hasStock',
  cashSessions: '++id, profile, status, openedAt, closedAt'
}).upgrade(tx => {
  return tx.table('products').toCollection().modify(product => {
    // Existing products: keys/springs/screws have stock, others don't
    if (product.hasStock === undefined) {
      product.hasStock = (product.serviceType === 'key' || product.serviceType === 'spring' || product.serviceType === 'screw');
    }
    if (product.customCategory === undefined) product.customCategory = '';
  });
});

db.version(8).stores({
  transactions: '++id, profile, type, paymentMethod, date, clientId',
  clients: '++id, name, phone, code',
  products: '++id, profile, name, code, brand, serviceType, hasStock',
  cashSessions: '++id, profile, status, openedAt, closedAt',
  losses: '++id, date, productId, type, operator'
});

db.version(9).stores({
  transactions: '++id, profile, type, paymentMethod, date, clientId',
  clients: '++id, name, phone, code',
  products: '++id, profile, name, code, brand, serviceType, hasStock',
  cashSessions: '++id, profile, status, openedAt, closedAt',
  losses: '++id, date, productId, type, operator',
  pendingSales: '++id, profile, date, clientName'
});

db.version(10).stores({
  transactions: '++id, profile, type, paymentMethod, date, clientId',
  clients: '++id, name, phone, code',
  products: '++id, profile, name, code, brand, serviceType, hasStock',
  cashSessions: '++id, profile, status, openedAt, closedAt',
  losses: '++id, date, productId, type, operator',
  pendingSales: '++id, profile, date, clientName',
  employees: '++id, name, active'
});

// Additive migration: no legacy rows are rewritten or removed.
db.version(11).stores({
  transactions: '++id, profile, type, paymentMethod, date, clientId',
  clients: '++id, name, phone, code',
  products: '++id, profile, name, code, brand, serviceType, hasStock',
  cashSessions: '++id, profile, status, openedAt, closedAt',
  losses: '++id, date, productId, type, operator',
  pendingSales: '++id, profile, date, clientName',
  employees: '++id, name, active',
  managementAccounts: '++id, profile, status, name',
  managementOccurrences: '++id, &key, accountId, profile, dueDate, status',
  managementEntries: '++id, &key, kind, profile, occurrenceId, fundId, cashSessionId, date',
  managementFunds: '++id, profile, status, name',
  managementGoals: '++id, profile, status, kind',
  managementScenarios: '++id, profile, name',
  managementEvents: '++id, profile, date',
  managementNoticeStates: '&key',
  managementAudit: '++id, entity, entityId, at',
  managementSettings: '&key'
});

db.version(12).stores({
  transactions: '++id, profile, type, paymentMethod, date, clientId', clients: '++id, name, phone, code',
  products: '++id, profile, name, code, brand, serviceType, hasStock', cashSessions: '++id, profile, status, openedAt, closedAt',
  losses: '++id, date, productId, type, operator', pendingSales: '++id, profile, date, clientName', employees: '++id, name, active',
  managementAccounts: '++id, profile, status, name', managementOccurrences: '++id, &key, accountId, profile, dueDate, status',
  managementEntries: '++id, &key, kind, profile, occurrenceId, fundId, cashSessionId, date', managementFunds: '++id, profile, status, name',
  managementGoals: '++id, profile, status, kind', managementScenarios: '++id, profile, name', managementEvents: '++id, profile, date',
  managementNoticeStates: '&key', managementAudit: '++id, entity, entityId, at', managementSettings: '&key',
  paymentMachines: '++id, ownerProfile, active, name', inventoryPurchases: '++id, productId, date, profile', productCostHistory: '++id, productId, at'
}).upgrade(async tx => {
  const machines = tx.table('paymentMachines');
  if (await machines.count()) return;
  await machines.bulkAdd([
    { name: 'Mercado Pago', brand: 'Mercado Pago', alias: 'Chaveiro', ownerProfile: 'chaveiro', active: true, rates: [
      { method: 'pix', percent: 0, configured: true }, { method: 'debit', percent: 1.99, configured: true },
      { method: 'credit', percent: 4.98, configured: true }
    ], notes: 'Tarifas legadas identificadas no código; confira e ajuste conforme contrato vigente.' },
    { name: 'Ton', brand: 'Ton', alias: 'Fabiano', ownerProfile: 'fabiano', active: true, rates: [
      { method: 'pix', percent: 0.5, configured: true }, { method: 'debit', percent: 1.98, configured: true },
      { method: 'credit', percent: 4.86, configured: true }
    ], notes: 'Tarifas legadas identificadas no código; confira e ajuste conforme contrato vigente.' }
  ]);
  const settings = tx.table('managementSettings');
  await settings.put({ key: 'defaultMachine:chaveiro', value: 1, updatedAt: new Date() });
  await settings.put({ key: 'defaultMachine:fabiano', value: 2, updatedAt: new Date() });
});

// Additive commercial analysis metadata. Existing products and stock rows are untouched.
db.version(13).stores({
  transactions: '++id, profile, type, paymentMethod, date, clientId', clients: '++id, name, phone, code',
  products: '++id, profile, name, code, brand, serviceType, hasStock', cashSessions: '++id, profile, status, openedAt, closedAt',
  losses: '++id, date, productId, type, operator', pendingSales: '++id, profile, date, clientName', employees: '++id, name, active',
  managementAccounts: '++id, profile, status, name', managementOccurrences: '++id, &key, accountId, profile, dueDate, status',
  managementEntries: '++id, &key, kind, profile, occurrenceId, fundId, cashSessionId, date', managementFunds: '++id, profile, status, name',
  managementGoals: '++id, profile, status, kind', managementScenarios: '++id, profile, name', managementEvents: '++id, profile, date',
  managementNoticeStates: '&key', managementAudit: '++id, entity, entityId, at', managementSettings: '&key',
  paymentMachines: '++id, ownerProfile, active, name', inventoryPurchases: '++id, productId, date, profile', productCostHistory: '++id, productId, at'
});

export { db };
