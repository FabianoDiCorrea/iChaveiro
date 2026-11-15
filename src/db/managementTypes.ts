import type { Profile } from './db';

export type ManagementProfile = Profile;
export type MoneySource = 'cash' | 'pix' | 'bank' | 'other';
export type Recurrence = 'once' | 'weekly' | 'monthly' | 'annual' | 'custom';
export type ProvisionMode = 'fixed' | 'recalculate';

export interface AccountPlan {
  id?: number;
  name: string;
  description?: string;
  category: string;
  profile: Profile;
  amountCents: number;
  variable: boolean;
  startDate: string;
  firstDueDate: string;
  recurrence: Recurrence;
  intervalDays?: number;
  provisionEnabled: boolean;
  provisionDays: number;
  provisionMode: ProvisionMode;
  workingDays: number[];
  excludedDates: string[];
  includedDates: string[];
  noticeDays: number;
  beneficiary?: string;
  notes?: string;
  status: 'active' | 'inactive' | 'archived';
  createdAt: Date;
  updatedAt: Date;
}

export interface AccountOccurrence {
  id?: number;
  key: string;
  accountId: number;
  profile: Profile;
  name: string;
  category: string;
  amountCents: number;
  dueDate: string;
  periodStart: string;
  status: 'open' | 'cancelled' | 'archived';
  createdAt: Date;
  updatedAt: Date;
}

export type ManagementEntryKind = 'reserve' | 'reserve-use' | 'payment' | 'fund-deposit' | 'fund-withdrawal' | 'fund-transfer-in' | 'fund-transfer-out' | 'withdrawal' | 'opening-balance';

export interface ManagementEntry {
  id?: number;
  key: string;
  groupKey?: string;
  kind: ManagementEntryKind;
  profile: Profile;
  amountCents: number; // Signed. Reversals are new entries with the opposite sign.
  source: MoneySource;
  date: Date;
  occurrenceId?: number;
  fundId?: number;
  cashSessionId?: number;
  linkedTransactionId?: number;
  reserveUsedCents?: number;
  beneficiary?: string;
  category?: string;
  note?: string;
  reversalOfId?: number;
}

export interface ManagementFund {
  id?: number;
  name: string;
  profile: Profile;
  description?: string;
  targetCents?: number;
  dailySuggestedCents?: number;
  status: 'active' | 'archived';
  createdAt: Date;
  updatedAt: Date;
}

export interface ManagementGoal {
  id?: number;
  name: string;
  profile: Profile;
  kind: 'revenue' | 'profit' | 'services' | 'category' | 'reserve' | 'sales_count' | 'item_count' | 'key_copies' | 'plier_sharpening';
  category?: string;
  target: number; // Cents for money targets; integer count for services.
  period: 'daily' | 'monthly' | 'custom';
  startDate?: string;
  endDate?: string;
  workingDays?: number[];
  status: 'active' | 'inactive' | 'archived';
  createdAt: Date;
  updatedAt: Date;
}

export interface ManagementScenario {
  id?: number;
  name: string;
  profile: Profile | 'todos';
  inputs: Record<string, number>;
  createdAt: Date;
  updatedAt: Date;
}

export interface ManagementCalendarEvent {
  id?: number;
  title: string;
  date: string;
  profile: Profile;
  notes?: string;
  createdAt: Date;
}

export interface ManagementNoticeState {
  key: string;
  readAt?: Date;
  dismissedAt?: Date;
}

export interface ManagementAudit {
  id?: number;
  at: Date;
  entity: string;
  entityId?: number;
  action: string;
  before?: unknown;
  after?: unknown;
}

export interface ManagementSetting {
  key: string;
  value: number | string | boolean;
  updatedAt: Date;
}
