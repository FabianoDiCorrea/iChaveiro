import { dateKey, provisionStatus } from './managementMath';
import type { AccountOccurrence, AccountPlan, ManagementEntry, ManagementNoticeState } from './managementTypes';

export interface ManagementNotice { key: string; occurrenceId: number; text: string; level: 'warning' | 'danger' | 'info'; dueDate: string; read: boolean; dismissed: boolean }

export function managementNotices(accounts: AccountPlan[], occurrences: AccountOccurrence[], entries: ManagementEntry[], states: ManagementNoticeState[], today = dateKey(new Date())): ManagementNotice[] {
  const result: ManagementNotice[] = [];
  for (const occurrence of occurrences) {
    if (occurrence.status !== 'open' || !occurrence.id) continue;
    const plan = accounts.find(row => row.id === occurrence.accountId);
    if (!plan || plan.status !== 'active') continue;
    const state = provisionStatus(plan, occurrence, entries, today);
    if (state.remaining <= 0) continue;
    const days = Math.round((Date.parse(`${occurrence.dueDate}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400000);
    const type = days < 0 ? 'atrasada' : days <= plan.noticeDays ? 'vence' : state.reserved >= state.remaining ? 'reserva-completa' : state.pending > 0 ? 'reserva-pendente' : null;
    if (!type) continue;
    const key = `${occurrence.id}:${type}`;
    const saved = states.find(row => row.key === key);
    result.push({ key, occurrenceId: occurrence.id, dueDate: occurrence.dueDate,
      text: type === 'atrasada' ? `${occurrence.name} está atrasada.` : type === 'vence' ? `${occurrence.name} vence em ${days} dia(s).` : type === 'reserva-completa' ? `${occurrence.name}: reserva completa, aguardando pagamento.` : `${occurrence.name}: reserva diária pendente.`,
      level: type === 'atrasada' ? 'danger' : type === 'vence' ? 'warning' : 'info', read: !!saved?.readAt, dismissed: !!saved?.dismissedAt });
  }
  return result.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}
