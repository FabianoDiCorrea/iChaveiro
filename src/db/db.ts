import Dexie, { type EntityTable } from 'dexie';

export type Profile = 'chaveiro' | 'fabiano';
export type PaymentMethod = 'cash' | 'debit' | 'credit' | 'pix';
export type ServiceType = 'key' | 'plier' | 'scissor' | 'knife' | 'spring' | 'screw' | 'other' | 'custom';

export interface TransactionItem {
  service: ServiceType;
  name: string;
  quantity: number;
  price: number;
  cost: number;
  total: number;
  productId?: number;
}

export interface Transaction {
  id?: number;
  profile: Profile;
  type: 'sale' | 'return' | 'expense';
  items: TransactionItem[];
  total: number;
  discount?: number;
  paymentMethod: PaymentMethod;
  clientId?: number;
  clientName?: string;
  clientCode?: string;
  date: Date;
}

export interface Client {
  id?: number;
  name: string;
  phone: string;
  address: string;
  code: string;
  createdAt: Date;
}

export interface Product {
  id?: number;
  profile: Profile;
  name: string;
  price: number;
  costPrice: number;
  stock: number;
  hasStock: boolean;     // whether to track inventory for this item
  serviceType: ServiceType;
  customCategory?: string; // label when serviceType === 'custom'
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

export { db };
