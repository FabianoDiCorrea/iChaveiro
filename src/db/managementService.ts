import { db, type Profile } from './db';
import { addDateDays, dateKey, planOccurrences, provisionStatus } from './managementMath';
import type { AccountPlan, AccountOccurrence, ManagementEntry, ManagementFund, ManagementGoal, ManagementScenario, ManagementCalendarEvent, MoneySource } from './managementTypes';

const newKey = () => crypto.randomUUID();
const today = () => dateKey(new Date());
const validCents = (value: number) => Number.isSafeInteger(value) && value >= 0;
const positive = (value: number) => Number.isSafeInteger(value) && value > 0;
const audit = (entity: string, entityId: number | undefined, action: string, before?: unknown, after?: unknown) =>
  db.managementAudit.add({ at: new Date(), entity, entityId, action, before, after });

export async function ensureOccurrences(plan: AccountPlan, throughDate = addDateDays(today(), 550)) {
  if (!plan.id || plan.status !== 'active') return;
  await db.transaction('rw', db.managementOccurrences, async () => {
    for (const candidate of planOccurrences(plan, throughDate)) {
      if (await db.managementOccurrences.where('key').equals(candidate.key).count()) continue;
      await db.managementOccurrences.add({ ...candidate, createdAt: new Date(), updatedAt: new Date() });
    }
  });
}

export async function saveAccount(input: Omit<AccountPlan, 'id' | 'createdAt' | 'updatedAt'>, id?: number) {
  if (!input.name.trim() || !validCents(input.amountCents) || !input.firstDueDate || !input.startDate || input.startDate > input.firstDueDate || input.provisionDays < 1 || input.workingDays.length === 0) throw new Error('Confira nome, valor, datas e dias de funcionamento.');
  const record = { ...input, name: input.name.trim(), updatedAt: new Date() };
  const savedId = await db.transaction('rw', db.managementAccounts, db.managementAudit, async () => {
    if (!id) {
      const created = { ...record, createdAt: new Date() };
      const nextId = await db.managementAccounts.add(created);
      await audit('conta', nextId, 'criar', undefined, created);
      return nextId;
    }
    const before = await db.managementAccounts.get(id);
    if (!before) throw new Error('Conta não encontrada.');
    await db.managementAccounts.update(id, record);
    await audit('conta', id, 'editar configuração futura', before, record);
    return id;
  });
  await ensureOccurrences({ ...record, id: savedId, createdAt: new Date() });
  return savedId;
}

export async function editOccurrence(id: number, change: { amountCents: number; dueDate: string }, future = false) {
  if (!validCents(change.amountCents) || !change.dueDate) throw new Error('Valor ou vencimento inválido.');
  await db.transaction('rw', db.managementOccurrences, db.managementAccounts, db.managementEntries, db.managementAudit, async () => {
    const current = await db.managementOccurrences.get(id);
    if (!current) throw new Error('Ocorrência não encontrada.');
    const plan = await db.managementAccounts.get(current.accountId);
    if (!plan) throw new Error('Conta não encontrada.');
    const entries = await db.managementEntries.where('occurrenceId').equals(id).toArray();
    if (entries.filter(entry => entry.kind === 'payment').reduce((sum, entry) => sum + entry.amountCents, 0) > 0) throw new Error('Ocorrência já paga: estorne o pagamento antes de alterar valor ou vencimento.');
    const reserved = entries.filter(entry => entry.kind === 'reserve' || entry.kind === 'reserve-use').reduce((sum, entry) => sum + entry.amountCents, 0);
    if (reserved > change.amountCents) throw new Error('Novo valor é menor que o total já reservado.');
    const targets = future ? await db.managementOccurrences.where('accountId').equals(current.accountId).filter(row => row.dueDate >= current.dueDate && row.status === 'open').toArray() : [current];
    const delta = Math.round((Date.parse(`${change.dueDate}T12:00:00Z`) - Date.parse(`${current.dueDate}T12:00:00Z`)) / 86400000);
    for (const target of targets) {
      const targetEntries = target.id === id ? entries : await db.managementEntries.where('occurrenceId').equals(target.id!).toArray();
      if (targetEntries.filter(entry => entry.kind === 'payment').reduce((sum, entry) => sum + entry.amountCents, 0) > 0) continue;
      if (targetEntries.filter(entry => entry.kind === 'reserve' || entry.kind === 'reserve-use').reduce((sum, entry) => sum + entry.amountCents, 0) > change.amountCents) continue;
      const after = { amountCents: change.amountCents, dueDate: target.id === id ? change.dueDate : addDateDays(target.dueDate, delta), updatedAt: new Date() };
      await db.managementOccurrences.update(target.id!, after);
      await audit('ocorrência', target.id, 'editar', target, after);
    }
    if (future) {
      const after = { amountCents: change.amountCents, firstDueDate: addDateDays(plan.firstDueDate, delta), updatedAt: new Date() };
      await db.managementAccounts.update(plan.id!, after);
      await audit('conta', plan.id, 'editar futuras', plan, after);
    }
  });
}

export async function setOccurrenceStatus(id: number, status: AccountOccurrence['status']) {
  await db.transaction('rw', db.managementOccurrences, db.managementEntries, db.managementAudit, async () => {
    const before = await db.managementOccurrences.get(id);
    if (!before) throw new Error('Ocorrência não encontrada.');
    if (status === 'cancelled') {
      const entries = await db.managementEntries.where('occurrenceId').equals(id).toArray();
      const reserved = entries.filter(entry => entry.kind === 'reserve' || entry.kind === 'reserve-use').reduce((sum, entry) => sum + entry.amountCents, 0);
      const paid = entries.filter(entry => entry.kind === 'payment').reduce((sum, entry) => sum + entry.amountCents, 0);
      if (reserved || paid) throw new Error('Estorne reservas e pagamentos antes de cancelar.');
    }
    await db.managementOccurrences.update(id, { status, updatedAt: new Date() });
    await audit('ocorrência', id, status, before, { status });
  });
}

export async function reserveForOccurrence(occurrenceId: number, amountCents: number, source: MoneySource, options: { cashSessionId?: number; key?: string; overflowFundId?: number; note?: string } = {}) {
  if (!positive(amountCents)) throw new Error('Informe um valor positivo em centavos.');
  return db.transaction('rw', [db.managementOccurrences, db.managementAccounts, db.managementEntries, db.managementFunds, db.managementAudit], async () => {
    if (options.key && await db.managementEntries.where('key').equals(options.key).count()) return false;
    const occurrence = await db.managementOccurrences.get(occurrenceId);
    if (!occurrence || occurrence.status !== 'open') throw new Error('Conta sem ocorrência ativa.');
    const plan = await db.managementAccounts.get(occurrence.accountId);
    if (!plan) throw new Error('Conta não encontrada.');
    const entries = await db.managementEntries.where('occurrenceId').equals(occurrenceId).toArray();
    const status = provisionStatus(plan, occurrence, entries, today());
    if (status.toFund <= 0 && !options.overflowFundId) throw new Error('A reserva da conta já está completa.');
    const toAccount = Math.min(status.toFund, amountCents);
    const overflow = amountCents - toAccount;
    if (overflow > 0 && !options.overflowFundId) throw new Error('Valor excedente: escolha explicitamente um fundo de destino.');
    if (overflow > 0) {
      const fund = await db.managementFunds.get(options.overflowFundId!);
      if (!fund || fund.status !== 'active' || fund.profile !== occurrence.profile) throw new Error('Fundo de destino incompatível.');
    }
    const groupKey = newKey();
    if (toAccount) await db.managementEntries.add({ key: options.key || newKey(), groupKey, kind: 'reserve', profile: occurrence.profile, amountCents: toAccount, source, date: new Date(), occurrenceId, cashSessionId: options.cashSessionId, note: options.note });
    if (overflow) await db.managementEntries.add({ key: newKey(), groupKey, kind: 'fund-deposit', profile: occurrence.profile, amountCents: overflow, source, date: new Date(), fundId: options.overflowFundId, cashSessionId: options.cashSessionId, note: 'Excedente transferido da reserva da conta' });
    await audit('reserva', occurrenceId, 'separar', undefined, { amountCents, source, toAccount, overflow });
    return true;
  });
}

export async function payOccurrence(occurrenceId: number, amountCents: number, source: MoneySource, reserveUsedCents = 0, linkedTransactionId?: number) {
  if (!positive(amountCents) || !validCents(reserveUsedCents) || reserveUsedCents > amountCents) throw new Error('Valor do pagamento inválido.');
  return db.transaction('rw', db.managementOccurrences, db.managementEntries, db.transactions, db.managementAudit, async () => {
    const occurrence = await db.managementOccurrences.get(occurrenceId);
    if (!occurrence || occurrence.status !== 'open') throw new Error('Ocorrência não está aberta.');
    const entries = await db.managementEntries.where('occurrenceId').equals(occurrenceId).toArray();
    const paid = entries.filter(entry => entry.kind === 'payment').reduce((sum, entry) => sum + entry.amountCents, 0);
    const reserved = entries.filter(entry => entry.kind === 'reserve' || entry.kind === 'reserve-use').reduce((sum, entry) => sum + entry.amountCents, 0);
    if (amountCents > occurrence.amountCents - paid || reserveUsedCents > reserved) throw new Error('Pagamento supera o saldo da conta ou da reserva.');
    const sourceReserved = entries.filter(entry => (entry.kind === 'reserve' || entry.kind === 'reserve-use') && entry.source === source).reduce((sum, entry) => sum + entry.amountCents, 0);
    if (reserveUsedCents > sourceReserved) throw new Error('A reserva utilizada pertence a outra origem financeira.');
    if (linkedTransactionId) {
      const linked = await db.transactions.get(linkedTransactionId);
      if (!linked || linked.type !== 'expense' || linked.profile !== occurrence.profile) throw new Error('Despesa existente incompatível.');
      const linkedEntries = await db.managementEntries.filter(entry => entry.kind === 'payment' && entry.linkedTransactionId === linkedTransactionId && !entry.reversalOfId).toArray();
      for (const prior of linkedEntries) if (!await db.managementEntries.filter(entry => entry.reversalOfId === prior.id).count()) throw new Error('Despesa já vinculada a outro pagamento.');
    }
    const groupKey = newKey();
    const paymentId = await db.managementEntries.add({ key: newKey(), groupKey, kind: 'payment', profile: occurrence.profile, amountCents, source, reserveUsedCents, date: new Date(), occurrenceId, linkedTransactionId, category: occurrence.category });
    if (reserveUsedCents) await db.managementEntries.add({ key: newKey(), groupKey, kind: 'reserve-use', profile: occurrence.profile, amountCents: -reserveUsedCents, source, date: new Date(), occurrenceId, note: 'Reserva utilizada no pagamento' });
    await audit('pagamento', paymentId, 'registrar', undefined, { occurrenceId, amountCents, reserveUsedCents, linkedTransactionId });
    return paymentId;
  });
}

export async function saveFund(input: Omit<ManagementFund, 'id' | 'createdAt' | 'updatedAt'>, id?: number) {
  if (!input.name.trim() || (input.targetCents !== undefined && !validCents(input.targetCents))) throw new Error('Nome ou meta do fundo inválida.');
  return db.transaction('rw', db.managementFunds, db.managementAudit, async () => {
    const after = { ...input, name: input.name.trim(), updatedAt: new Date() };
    if (!id) {
      const created = { ...after, createdAt: new Date() };
      const nextId = await db.managementFunds.add(created);
      await audit('fundo', nextId, 'criar', undefined, created);
      return nextId;
    }
    const before = await db.managementFunds.get(id);
    if (!before) throw new Error('Fundo não encontrado.');
    await db.managementFunds.update(id, after);
    await audit('fundo', id, 'editar', before, after);
    return id;
  });
}

export function fundBalance(fundId: number, entries: ManagementEntry[]) {
  return entries.filter(entry => entry.fundId === fundId && entry.kind.startsWith('fund-')).reduce((sum, entry) => sum + entry.amountCents, 0);
}

export async function moveFund(fundId: number, amountCents: number, action: 'deposit' | 'withdraw' | 'transfer', source: MoneySource, note: string, destinationFundId?: number, options: { cashSessionId?: number; key?: string } = {}) {
  if (!positive(amountCents)) throw new Error('Informe valor positivo.');
  if (action !== 'deposit' && !note.trim()) throw new Error('Informe o destino ou motivo da retirada.');
  return db.transaction('rw', db.managementFunds, db.managementEntries, db.managementAudit, async () => {
    if (options.key && await db.managementEntries.where('key').equals(options.key).count()) return;
    const fund = await db.managementFunds.get(fundId);
    if (!fund || fund.status !== 'active') throw new Error('Fundo indisponível.');
    const entries = await db.managementEntries.where('fundId').equals(fundId).toArray();
    if (action !== 'deposit' && fundBalance(fundId, entries) < amountCents) throw new Error('Saldo do fundo insuficiente.');
    const groupKey = newKey();
    if (action === 'transfer') {
      const destination = await db.managementFunds.get(destinationFundId!);
      if (!destination || destination.status !== 'active' || destination.id === fundId) throw new Error('Fundo de destino inválido.');
      await db.managementEntries.add({ key: options.key || newKey(), groupKey, kind: 'fund-transfer-out', profile: fund.profile, amountCents: -amountCents, source, date: new Date(), fundId, cashSessionId: options.cashSessionId, note });
      await db.managementEntries.add({ key: newKey(), groupKey, kind: 'fund-transfer-in', profile: destination.profile, amountCents, source, date: new Date(), fundId: destinationFundId, note: `${note} (de ${fund.name})` });
    } else {
      const kind = action === 'deposit' ? 'fund-deposit' : 'fund-withdrawal';
      const signed = action === 'deposit' ? amountCents : -amountCents;
      await db.managementEntries.add({ key: options.key || newKey(), groupKey, kind, profile: fund.profile, amountCents: signed, source, date: new Date(), fundId, cashSessionId: options.cashSessionId, note });
    }
    await audit('fundo', fundId, action, undefined, { amountCents, source, note, destinationFundId });
  });
}

export async function recordWithdrawal(profile: Profile, amountCents: number, source: MoneySource, beneficiary: string, category: string, note: string, date = new Date()) {
  if (!positive(amountCents) || !beneficiary.trim() || !category.trim()) throw new Error('Informe valor, beneficiário e categoria.');
  if (Number.isNaN(+date)) throw new Error('Data da retirada inválida.');
  return db.transaction('rw', db.managementEntries, db.managementAudit, async () => {
    const entry = { key: newKey(), kind: 'withdrawal' as const, profile, amountCents, source, beneficiary: beneficiary.trim(), category, note, date };
    const id = await db.managementEntries.add(entry);
    await audit('retirada', id, 'registrar', undefined, entry);
    return id;
  });
}

export async function recordOpeningBalance(profile: Profile, amountCents: number, source: MoneySource, note: string) {
  if (!validCents(amountCents)) throw new Error('Saldo inicial inválido.');
  return db.transaction('rw', db.managementEntries, db.managementAudit, async () => {
    const entry = { key: newKey(), kind: 'opening-balance' as const, profile, amountCents, source, date: new Date(), note };
    const id = await db.managementEntries.add(entry);
    await audit('saldo inicial', id, 'registrar', undefined, entry);
    return id;
  });
}

export async function reverseEntry(id: number) {
  await db.transaction('rw', db.managementEntries, db.managementAudit, async () => {
    const entry = await db.managementEntries.get(id);
    if (!entry || entry.reversalOfId) throw new Error('Movimentação não pode ser estornada.');
    const group = entry.groupKey ? await db.managementEntries.filter(row => row.groupKey === entry.groupKey && !row.reversalOfId).toArray() : [entry];
    for (const original of group) {
      if (await db.managementEntries.filter(row => row.reversalOfId === original.id).count()) throw new Error('Movimentação já estornada.');
    }
    for (const occurrenceId of new Set(group.map(row => row.occurrenceId).filter((value): value is number => value !== undefined))) {
      const current = await db.managementEntries.where('occurrenceId').equals(occurrenceId).toArray();
      const remaining = (kinds: string[]) => current.filter(row => kinds.includes(row.kind)).reduce((sum, row) => sum + row.amountCents, 0) - group.filter(row => row.occurrenceId === occurrenceId && kinds.includes(row.kind)).reduce((sum, row) => sum + row.amountCents, 0);
      if (remaining(['reserve', 'reserve-use']) < 0 || remaining(['payment']) < 0) throw new Error('Estorne primeiro as movimentações posteriores desta conta.');
    }
    for (const fundId of new Set(group.map(row => row.fundId).filter((value): value is number => value !== undefined))) {
      const current = await db.managementEntries.where('fundId').equals(fundId).toArray();
      const after = fundBalance(fundId, current) - group.filter(row => row.fundId === fundId && row.kind.startsWith('fund-')).reduce((sum, row) => sum + row.amountCents, 0);
      if (after < 0) throw new Error('Estorne primeiro as saídas posteriores deste fundo.');
    }
    for (const original of group) {
      const { id: _originalId, ...rest } = original;
      void _originalId;
      await db.managementEntries.add({ ...rest, key: newKey(), groupKey: newKey(), amountCents: -original.amountCents, date: new Date(), reversalOfId: original.id });
    }
    await audit('movimentação', id, 'estornar', entry, { group: group.map(row => row.id) });
  });
}

export async function saveGoal(input: Omit<ManagementGoal, 'id' | 'createdAt' | 'updatedAt'>, id?: number) {
  if (!input.name.trim() || !validCents(input.target)) throw new Error('Meta inválida.');
  return db.transaction('rw', db.managementGoals, db.managementAudit, async () => {
    const after = { ...input, updatedAt: new Date() };
    if (!id) {
      const created = { ...after, createdAt: new Date() };
      const nextId = await db.managementGoals.add(created);
      await audit('meta', nextId, 'criar', undefined, created);
      return nextId;
    }
    const before = await db.managementGoals.get(id);
    if (!before) throw new Error('Meta não encontrada.');
    await db.managementGoals.update(id, after);
    await audit('meta', id, 'editar', before, after);
    return id;
  });
}

export async function saveScenario(input: Omit<ManagementScenario, 'id' | 'createdAt' | 'updatedAt'>, id?: number) {
  if (!input.name.trim()) throw new Error('Informe o nome do cenário.');
  return db.transaction('rw', db.managementScenarios, db.managementAudit, async () => {
    const after = { ...input, updatedAt: new Date() };
    if (!id) {
      const created = { ...after, createdAt: new Date() };
      const nextId = await db.managementScenarios.add(created);
      await audit('cenário', nextId, 'criar', undefined, created);
      return nextId;
    }
    const before = await db.managementScenarios.get(id);
    if (!before) throw new Error('Cenário não encontrado.');
    await db.managementScenarios.update(id, after);
    await audit('cenário', id, 'editar', before, after);
    return id;
  });
}

export async function deleteScenario(id: number) {
  await db.transaction('rw', db.managementScenarios, db.managementAudit, async () => {
    const before = await db.managementScenarios.get(id);
    if (!before) throw new Error('Cenário não encontrado.');
    await db.managementScenarios.delete(id);
    await audit('cenário', id, 'excluir', before);
  });
}

export async function updateClientGroups(id: number, groups: string[], notes: string) {
  await db.transaction('rw', db.clients, db.managementAudit, async () => {
    const before = await db.clients.get(id);
    if (!before) throw new Error('Cliente não encontrado.');
    const after = { groups: [...new Set(groups.map(value => value.trim()).filter(Boolean))], notes };
    await db.clients.update(id, after);
    await audit('cliente', id, 'editar categorias', { groups: before.groups, notes: before.notes }, after);
  });
}

export async function saveManagementSetting(key: string, value: number | string | boolean) {
  await db.managementSettings.put({ key, value, updatedAt: new Date() });
}

export async function saveCalendarEvent(input: Omit<ManagementCalendarEvent, 'id' | 'createdAt'>) {
  if (!input.title.trim() || !input.date) throw new Error('Informe título e data.');
  return db.transaction('rw', db.managementEvents, db.managementAudit, async () => {
    const record = { ...input, createdAt: new Date() };
    const id = await db.managementEvents.add(record);
    await audit('evento', id, 'criar', undefined, record);
    return id;
  });
}
