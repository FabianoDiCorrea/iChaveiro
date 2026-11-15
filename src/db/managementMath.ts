import type { AccountOccurrence, AccountPlan, ManagementEntry } from './managementTypes';

export const cents = (amount: number) => Math.round(amount * 100);
export const reais = (amountCents: number) => amountCents / 100;
export const money = (amountCents: number) => reais(amountCents).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const utcDate = (key: string) => new Date(`${key}T12:00:00Z`);
export const addDateDays = (key: string, days: number) => {
  const date = utcDate(key);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
const addAnchoredMonths = (first: string, count: number) => {
  const anchor = utcDate(first);
  const year = anchor.getUTCFullYear();
  const month = anchor.getUTCMonth() + count;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(anchor.getUTCDate(), lastDay), 12)).toISOString().slice(0, 10);
};

export function planOccurrences(plan: AccountPlan, throughDate: string): Pick<AccountOccurrence, 'key' | 'accountId' | 'profile' | 'name' | 'category' | 'amountCents' | 'dueDate' | 'periodStart' | 'status'>[] {
  if (!plan.id || plan.status !== 'active') return [];
  const result: ReturnType<typeof planOccurrences> = [];
  let previousDue = '';
  for (let index = 0; index < 600; index++) {
    const dueDate = plan.recurrence === 'once' ? plan.firstDueDate
      : plan.recurrence === 'weekly' ? addDateDays(plan.firstDueDate, index * 7)
      : plan.recurrence === 'monthly' ? addAnchoredMonths(plan.firstDueDate, index)
      : plan.recurrence === 'annual' ? addAnchoredMonths(plan.firstDueDate, index * 12)
      : addDateDays(plan.firstDueDate, index * Math.max(1, plan.intervalDays || 1));
    if (dueDate > throughDate) break;
    if (dueDate >= plan.startDate) result.push({
      key: `${plan.id}:${index}`, accountId: plan.id, profile: plan.profile, name: plan.name,
      category: plan.category, amountCents: plan.amountCents, dueDate,
      periodStart: index === 0 ? plan.startDate : addDateDays(previousDue, 1), status: 'open'
    });
    previousDue = dueDate;
    if (plan.recurrence === 'once') break;
  }
  return result;
}

export function workingDates(plan: AccountPlan, occurrence: AccountOccurrence): string[] {
  const dates: string[] = [];
  for (let day = occurrence.periodStart, count = 0; day <= occurrence.dueDate && count < 370; day = addDateDays(day, 1), count++) {
    const weekday = utcDate(day).getUTCDay();
    if (plan.includedDates.includes(day) || (plan.workingDays.includes(weekday) && !plan.excludedDates.includes(day))) dates.push(day);
  }
  return dates.length ? dates.slice(0, Math.max(1, plan.provisionDays)) : [occurrence.dueDate];
}

export function provisionStatus(plan: AccountPlan, occurrence: AccountOccurrence, entries: ManagementEntry[], today: string) {
  const dates = workingDates(plan, occurrence);
  const target = Math.max(0, occurrence.amountCents);
  const base = Math.floor(target / dates.length);
  const extra = target % dates.length;
  const daily = dates.map((date, index) => ({ date, amountCents: base + (index < extra ? 1 : 0) }));
  const plannedToDate = daily.filter(item => item.date <= today).reduce((sum, item) => sum + item.amountCents, 0);
  const reserved = entries.filter(entry => entry.occurrenceId === occurrence.id && (entry.kind === 'reserve' || entry.kind === 'reserve-use')).reduce((sum, entry) => sum + entry.amountCents, 0);
  const paid = entries.filter(entry => entry.occurrenceId === occurrence.id && entry.kind === 'payment').reduce((sum, entry) => sum + entry.amountCents, 0);
  const remaining = Math.max(0, target - paid);
  const toFund = Math.max(0, remaining - reserved);
  const pending = Math.max(0, plannedToDate - reserved - paid);
  const ahead = Math.max(0, reserved + paid - plannedToDate);
  const todayAmount = daily.find(item => item.date === today)?.amountCents || 0;
  const todayReserved = entries.filter(entry => entry.occurrenceId === occurrence.id && entry.kind === 'reserve' && dateKey(new Date(entry.date)) === today).reduce((sum, entry) => sum + entry.amountCents, 0);
  const remainingDays = Math.max(1, daily.filter(item => item.date >= today).length);
  const suggested = occurrence.status !== 'open' || !plan.provisionEnabled || toFund === 0 ? 0
    : Math.min(toFund, plan.provisionMode === 'recalculate' ? Math.max(pending, Math.ceil(toFund / remainingDays) - todayReserved) : pending);
  return { daily, dailyCents: todayAmount || base, plannedToDate, reserved, paid, remaining, toFund, pending, ahead, suggested, percent: target ? Math.min(100, Math.round(reserved / target * 100)) : 100 };
}
