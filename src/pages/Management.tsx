import React, { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeftRight, CalendarDays, Calculator, Goal, Info, LayoutDashboard, Package, TrendingUp, Users, Wallet } from 'lucide-react';
import { ReportModal } from '../components/ReportModal';
import { db, PROFILES, type Profile } from '../db/db';
import { addDateDays, dateKey, money, provisionStatus } from '../db/managementMath';
import { managementNotices } from '../db/managementNotices';
import { ensureOccurrences, saveAccount, saveCalendarEvent } from '../db/managementService';
import { knownFreeBalance, managementSummary, managementWageDetails } from '../db/managementSummary';
import type { AccountPlan } from '../db/managementTypes';
import { ManagementFinance } from './ManagementFinance';
import { ManagementSimulator, ManagementRentability, ManagementMovement, ManagementInventory, ManagementClients, ManagementGoals } from './ManagementAnalysis';
import { formatDate, inputCents, runAction, type ManagementData } from './managementUi';
import './management.css';

type Module = 'overview' | 'finance' | 'calendar' | 'simulator' | 'profitability' | 'movement' | 'inventory' | 'clients' | 'goals';
const modules: { key: Module; label: string; icon: React.ReactNode }[] = [
  { key: 'overview', label: 'Visão Geral', icon: <LayoutDashboard size={16} /> },
  { key: 'finance', label: 'Financeiro', icon: <Wallet size={16} /> },
  { key: 'calendar', label: 'Calendário', icon: <CalendarDays size={16} /> },
  { key: 'simulator', label: 'Simulador', icon: <Calculator size={16} /> },
  { key: 'profitability', label: 'Rentabilidade', icon: <TrendingUp size={16} /> },
  { key: 'movement', label: 'Movimento', icon: <ArrowLeftRight size={16} /> },
  { key: 'inventory', label: 'Estoque', icon: <Package size={16} /> },
  { key: 'clients', label: 'Clientes', icon: <Users size={16} /> },
  { key: 'goals', label: 'Metas', icon: <Goal size={16} /> }
];

const card = (label: string, value: string, note?: string, tone?: string, help?: string) => <div className={`mg-card mg-stat ${tone || ''}`} key={label}><small>{label} {help && <Info size={14} role="img" aria-label={help} title={help} />}</small><strong className="mg-value">{value}</strong>{note && <small>{note}</small>}</div>;

function Overview({ data, profile, start, end, onFinance }: { data: ManagementData; profile: Profile | 'todos'; start: string; end: string; onFinance: () => void }) {
  const [wagesOpen, setWagesOpen] = useState(false);
  const report = managementSummary(data.transactions, data.entries, data.occurrences, profile, start, end);
  const begin = new Date(`${start}T12:00:00`);
  const finish = new Date(`${end}T12:00:00`);
  const days = Math.max(1, Math.round((+finish - +begin) / 86400000) + 1);
  const previousEnd = addDateDays(start, -1);
  const previousStart = addDateDays(previousEnd, 1 - days);
  const previous = managementSummary(data.transactions, data.entries, data.occurrences, profile, previousStart, previousEnd);
  const trend = Array.from({ length: 6 }, (_, offset) => {
    const month = new Date(new Date().getFullYear(), new Date().getMonth() - 5 + offset, 1);
    const first = dateKey(month);
    const isPartial = offset === 5;
    const last = isPartial ? dateKey(new Date()) : dateKey(new Date(month.getFullYear(), month.getMonth() + 1, 0));
    return { label: month.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }), partial: isPartial, value: managementSummary(data.transactions, data.entries, data.occurrences, profile, first, last).revenue };
  });
  const maxTrend = Math.max(1, ...trend.map(row => row.value));
  const fabiano = managementSummary(data.transactions, data.entries, data.occurrences, 'fabiano', start, end);
  const alerts = managementNotices(data.accounts, data.occurrences, data.entries, data.notices).filter(row => !row.dismissed && (profile === 'todos' || data.occurrences.find(occ => occ.id === row.occurrenceId)?.profile === profile));
  const updateNotice = async (key: string, field: 'readAt' | 'dismissedAt') => {
    const old = await db.managementNoticeStates.get(key);
    await db.managementNoticeStates.put({ ...old, key, [field]: new Date() });
  };
  const balanceProfiles = profile === 'todos' ? PROFILES : [profile];
  const wageDetails = managementWageDetails(data.transactions, profile, start, end).map(({ transaction, item }) => ({ date: transaction.date, employee: item.name.split(':').slice(1).join(':').trim() || 'Funcionário não identificado', payment: ({ cash: 'Dinheiro', pix: 'PIX', debit: 'Débito', credit: 'Crédito', split: 'Pagamento dividido' })[transaction.paymentMethod], amount: item.total }));
  const wageDetailTotal = wageDetails.reduce((sum, row) => sum + row.amount, 0);
  return <div className="mg-section">
    <div className="mg-heading"><div><h2>Painel gerencial</h2><p>Lucro, recebimentos e reservas possuem significados diferentes. Dados não conciliados são identificados.</p></div></div>
    <div className="mg-grid mg-grid-four">
      {card('Faturamento bruto', money(Math.round(report.gross * 100)), undefined, undefined, 'Vendas concluídas antes dos descontos e devoluções.')}
      {card('Receita após descontos e devoluções', money(Math.round(report.revenue * 100)), `Descontos ${money(Math.round(report.discounts * 100))} · Devoluções ${money(Math.round(report.returns * 100))}`, undefined, 'Faturamento bruto menos descontos e valores de devoluções registradas.')}
      {card('Lucro operacional', money(Math.round(report.profit * 100)), `Margem ${report.margin.toFixed(1)}%`, report.profit < 0 ? 'mg-negative' : 'mg-positive', 'Receita menos custos dos produtos, despesas operacionais, diárias e taxas. Não representa saldo de caixa nem retiradas.')}
      {card('Valores reservados', money(Math.round(report.reserved * 100)), 'Contas e fundos; não são despesa')}
      {card('Custo dos produtos vendidos', money(Math.round(report.costs * 100)), undefined, undefined, 'Custo registrado nos itens vendidos, abatendo devoluções vinculadas.')}
      {card('Despesas operacionais', money(Math.round(report.operatingExpenses * 100)), undefined, undefined, 'Despesas operacionais do período; aquisições, transferências e retiradas são tratadas separadamente.')}
      <button className="mg-card mg-stat mg-wage-card" key="Diárias" onClick={() => setWagesOpen(true)} title="Ver composição das diárias por funcionário; os valores são conciliados com o indicador."><small>Diárias <Info size={14} aria-label="Composição das diárias" /></small><strong className="mg-value">{money(Math.round(report.wages * 100))}</strong><small>Ver por funcionário · total detalhado {money(Math.round(wageDetailTotal * 100))}</small></button>
      {card('Taxas de pagamento', money(Math.round(report.fees * 100)), undefined, undefined, 'Taxas de pagamento registradas nas operações do período.')}
      {card('Contas a vencer', `${report.due.length}`, money(report.due.reduce((sum, row) => sum + row.remainingCents, 0)))}
      {card('Contas atrasadas', `${report.overdue.length}`, money(report.overdue.reduce((sum, row) => sum + row.remainingCents, 0)), report.overdue.length ? 'mg-negative' : '')}
      {card('Retiradas registradas', money(Math.round(report.withdrawals * 100)))}
      {card('Valor médio por venda', money(Math.round(report.ticket * 100)), `${report.salesCount} venda(s), ${report.itemCount} item(ns)`, undefined, 'Receita líquida do período dividida pela quantidade de vendas concluídas.')}
    </div>
    <div className="mg-grid mg-grid-two"><div className="mg-card"><h3>Comparação com período anterior</h3><p>Receita atual {money(Math.round(report.revenue * 100))} · anterior {money(Math.round(previous.revenue * 100))}</p><p>Variação {previous.revenue ? ((report.revenue / previous.revenue - 1) * 100).toFixed(1) + '%' : 'sem base anterior'}</p></div>{profile !== 'chaveiro' && <div className="mg-card"><h3>Renda pessoal do Fabiano</h3><strong className="mg-value">{money(Math.round((fabiano.profit + report.fabianoWages) * 100))}</strong><small>Diárias registradas para Fabiano {money(Math.round(report.fabianoWages * 100))} + resultado líquido do perfil Fabiano {money(Math.round(fabiano.profit * 100))}</small></div>}</div>
<div className="mg-grid mg-grid-two"><div className="mg-card"><h3>Evolução mensal da receita</h3><p className="mg-hint">Valores visíveis; o mês atual é parcial até hoje.</p><div className="mg-bars">{trend.map(row => <div key={row.label}><strong className="mg-chart-value">{money(Math.round(row.value * 100))}</strong><div className="mg-bar" style={{ height: Math.max(4, row.value / maxTrend * 95) + 'px' }} title={money(Math.round(row.value * 100))} /><small>{row.label}{row.partial ? ' · parcial' : ''}</small></div>)}</div></div><div className="mg-card"><h3>Saldo disponível conhecido</h3><p className="mg-hint">Exige saldo inicial informado por perfil e origem. Cartão pendente de liquidação não entra no saldo.</p>{balanceProfiles.flatMap(person => (['cash', 'pix', 'bank'] as const).map(source => { const value = knownFreeBalance(data.transactions, data.entries, person, source); return <div className="mg-balance" key={`${person}:${source}`}><span>{person} · {({ cash: 'Dinheiro', pix: 'PIX', bank: 'Banco' })[source]}</span><strong>{value === undefined ? 'Não informado' : money(value)}</strong></div>; }))}<button className="mg-link" onClick={onFinance}>Informar ou consultar saldos</button></div></div>
    <div className="mg-card"><div className="mg-heading"><h3>Avisos financeiros</h3><small>{alerts.filter(row => !row.read).length} não lido(s)</small></div><div className="mg-list">{alerts.slice(0, 8).map(row => <div className={`mg-list-row mg-notice-${row.level}`} key={row.key}><span>{row.text}<small>{formatDate(row.dueDate)}</small></span><div className="mg-actions"><button onClick={() => updateNotice(row.key, 'readAt')}>Lido</button><button onClick={() => updateNotice(row.key, 'dismissedAt')}>Dispensar</button></div></div>)}{!alerts.length && <p>Sem avisos no momento.</p>}</div></div>
    {wagesOpen && <ReportModal title="Composição das diárias" subtitle={`${start} a ${end} · filtro ${profile === 'todos' ? 'Geral' : profile}`} onClose={() => setWagesOpen(false)} wide><div className="mg-table-wrap"><table className="mg-table"><thead><tr><th>Funcionário</th><th>Data</th><th>Forma registrada</th><th>Valor</th></tr></thead><tbody>{wageDetails.map((row, index) => <tr key={`${row.date}:${index}`}><td>{row.employee}</td><td>{new Date(row.date).toLocaleDateString('pt-BR')}</td><td>{row.payment}</td><td>{money(Math.round(row.amount * 100))}</td></tr>)}{!wageDetails.length && <tr><td colSpan={4}>Nenhuma diária identificada no período.</td></tr>}</tbody><tfoot><tr><th colSpan={3}>Total detalhado · indicador de diárias {money(Math.round(report.wages * 100))}</th><th>{money(Math.round(wageDetailTotal * 100))}</th></tr></tfoot></table></div></ReportModal>}
  </div>;
}

function Calendar({ data, profile, onFinance }: { data: ManagementData; profile: Profile | 'todos'; onFinance: () => void }) {
  const [month, setMonth] = useState(dateKey(new Date()).slice(0, 7));
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [quickAccount, setQuickAccount] = useState(false);
  const [eventForm, setEventForm] = useState(false);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('0.00');
  const [recurrence, setRecurrence] = useState<AccountPlan['recurrence']>('once');
  const [entryProfile, setEntryProfile] = useState<Profile>(profile === 'todos' ? 'chaveiro' : profile);
  const endMonth = dateKey(new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0));
  useEffect(() => { for (const plan of data.accounts) if (plan.status === 'active') void ensureOccurrences(plan, endMonth); }, [data.accounts, endMonth]);
  const year = Number(month.slice(0, 4));
  const monthIndex = Number(month.slice(5, 7)) - 1;
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const monthOccurrences = data.occurrences.filter(row => row.dueDate.startsWith(month) && (profile === 'todos' || row.profile === profile));
  const monthEvents = data.events.filter(row => row.date.startsWith(month) && (profile === 'todos' || row.profile === profile));
  const paid = (occurrenceId: number) => data.entries.filter(row => row.occurrenceId === occurrenceId && row.kind === 'payment').reduce((sum, row) => sum + row.amountCents, 0);
  const monthPaid = monthOccurrences.reduce((sum, row) => sum + Math.min(row.amountCents, paid(row.id!)), 0);
  const monthTotal = monthOccurrences.filter(row => row.status === 'open').reduce((sum, row) => sum + row.amountCents, 0);
  const reserved = monthOccurrences.reduce((sum, row) => sum + data.entries.filter(entry => entry.occurrenceId === row.id && (entry.kind === 'reserve' || entry.kind === 'reserve-use')).reduce((value, entry) => value + entry.amountCents, 0), 0);
  const changeMonth = (offset: number) => { const date = new Date(year, monthIndex + offset, 1); setMonth(dateKey(date).slice(0, 7)); };
  const quickSave = async (event: React.FormEvent) => {
    event.preventDefault(); if (!selectedDay) return;
    const input: Omit<AccountPlan, 'id' | 'createdAt' | 'updatedAt'> = { name: title, category: 'outros', profile: entryProfile, amountCents: inputCents(amount), variable: false, startDate: selectedDay, firstDueDate: selectedDay, recurrence, provisionEnabled: false, provisionDays: 1, provisionMode: 'fixed', workingDays: [0,1,2,3,4,5,6], excludedDates: [], includedDates: [], noticeDays: 3, status: 'active' };
    if (await runAction(() => saveAccount(input), 'Conta cadastrada no calendário.')) { setQuickAccount(false); setSelectedDay(null); setTitle(''); }
  };
  return <div className="mg-section"><div className="mg-heading"><div><h2>Calendário financeiro</h2><p>Vencimentos, pagamentos e eventos por mês.</p></div><div className="mg-actions"><button onClick={() => changeMonth(-1)}>← Anterior</button><strong>{new Date(year, monthIndex, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</strong><button onClick={() => changeMonth(1)}>Próximo →</button></div></div><div className="mg-grid mg-grid-four">{card('A pagar no mês', money(monthTotal))}{card('Pago', money(monthPaid))}{card('Ainda não pago', money(Math.max(0, monthTotal - monthPaid)))}{card('Reservado', money(reserved))}</div><div className="mg-calendar mg-card">{['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(day => <strong className="mg-calendar-weekday" key={day}>{day}</strong>)}{Array.from({ length: firstWeekday }, (_, index) => <div className="mg-calendar-empty" key={`empty:${index}`} />)}{Array.from({ length: daysInMonth }, (_, index) => { const day = `${month}-${String(index + 1).padStart(2, '0')}`; const rows = monthOccurrences.filter(row => row.dueDate === day); const events = monthEvents.filter(row => row.date === day); return <button className={`mg-calendar-day ${day === dateKey(new Date()) ? 'today' : ''}`} key={day} onClick={() => setSelectedDay(day)}><strong>{index + 1}</strong>{rows.slice(0, 2).map(row => <small className={paid(row.id!) >= row.amountCents ? 'paid' : day < dateKey(new Date()) ? 'late' : 'future'} key={row.id}>{row.name}</small>)}{events.slice(0, 1).map(row => <small className="event" key={`event:${row.id}`}>{row.title}</small>)}{rows.length + events.length > 3 && <small>+{rows.length + events.length - 3}</small>}</button>; })}</div><div className="mg-card mg-legend"><span>● Conta futura</span><span>● Atrasada</span><span>● Paga</span><span>● Evento</span><span>Reserva completa exige pagamento separado</span></div>
    {selectedDay && <ReportModal title={`Compromissos de ${formatDate(selectedDay)}`} onClose={() => setSelectedDay(null)}><div className="mg-list">{monthOccurrences.filter(row => row.dueDate === selectedDay).map(row => { const plan = data.accounts.find(account => account.id === row.accountId); const state = plan ? provisionStatus(plan, row, data.entries, selectedDay) : null; return <div className="mg-list-row" key={row.id}><span><strong>{row.name}</strong><small>{row.profile} · {money(row.amountCents)} · Pago {money(state?.paid || 0)} · Reservado {money(state?.reserved || 0)}</small></span></div>; })}{monthEvents.filter(row => row.date === selectedDay).map(row => <div className="mg-list-row" key={`event:${row.id}`}>{row.title} · {row.profile}</div>)}{!monthOccurrences.some(row => row.dueDate === selectedDay) && !monthEvents.some(row => row.date === selectedDay) && <p>Sem compromissos neste dia.</p>}</div><div className="mg-actions"><button onClick={() => { setQuickAccount(true); setTitle(''); }}>Cadastrar conta neste dia</button><button onClick={() => { setEventForm(true); setTitle(''); }}>Adicionar evento</button><button onClick={() => { setSelectedDay(null); onFinance(); }}>Ver Financeiro</button></div></ReportModal>}
    {quickAccount && selectedDay && <ReportModal title="Conta pelo calendário" subtitle={formatDate(selectedDay)} onClose={() => setQuickAccount(false)}><form className="mg-form" onSubmit={quickSave}><label>Nome<input required value={title} onChange={event => setTitle(event.target.value)} /></label><label>Valor (R$)<input type="number" min="0" step="0.01" value={amount} onChange={event => setAmount(event.target.value)} /></label><label>Perfil<select value={entryProfile} onChange={event => setEntryProfile(event.target.value as Profile)}>{PROFILES.map(row => <option key={row} value={row}>{row}</option>)}</select></label><label>Repetição<select value={recurrence} onChange={event => setRecurrence(event.target.value as AccountPlan['recurrence'])}><option value="once">Avulsa</option><option value="weekly">Semanal</option><option value="monthly">Mensal</option><option value="annual">Anual</option></select></label><p className="mg-full mg-hint">Para provisionamento e demais detalhes, edite a conta no Financeiro.</p><div className="mg-full mg-actions"><button className="btn btn-primary">Cadastrar</button></div></form></ReportModal>}
    {eventForm && selectedDay && <ReportModal title="Evento financeiro" subtitle={formatDate(selectedDay)} onClose={() => setEventForm(false)}><form className="mg-form" onSubmit={async event => { event.preventDefault(); if (await runAction(() => saveCalendarEvent({ title, date: selectedDay, profile: entryProfile }))) { setEventForm(false); setSelectedDay(null); } }}><label>Título<input required value={title} onChange={event => setTitle(event.target.value)} /></label><label>Perfil<select value={entryProfile} onChange={event => setEntryProfile(event.target.value as Profile)}>{PROFILES.map(row => <option key={row} value={row}>{row}</option>)}</select></label><div className="mg-full mg-actions"><button className="btn btn-primary">Salvar evento</button></div></form></ReportModal>}
  </div>;
}

export function Management() {
  const [module, setModule] = useState<Module>('overview');
  const [profile, setProfile] = useState<Profile | 'todos'>('todos');
  const [start, setStart] = useState(dateKey(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [end, setEnd] = useState(dateKey(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0)));
  const data = useLiveQuery(async (): Promise<ManagementData> => {
    const [accounts, occurrences, entries, funds, goals, scenarios, events, notices, settings, transactions, cashSessions, products, clients, machines, purchases, costHistory] = await Promise.all([
      db.managementAccounts.toArray(), db.managementOccurrences.toArray(), db.managementEntries.toArray(), db.managementFunds.toArray(),
      db.managementGoals.toArray(), db.managementScenarios.toArray(), db.managementEvents.toArray(), db.managementNoticeStates.toArray(), db.managementSettings.toArray(),
      db.transactions.toArray(), db.cashSessions.toArray(), db.products.toArray(), db.clients.toArray(), db.paymentMachines.toArray(), db.inventoryPurchases.toArray(), db.productCostHistory.toArray()
    ]);
    return { accounts, occurrences, entries, funds, goals, scenarios, events, notices, settings, transactions, cashSessions, products, clients, machines, purchases, costHistory };
  });
  const selected = useMemo(() => modules.find(row => row.key === module)!, [module]);
  if (!data) return <div className="p-6">Carregando Gerência...</div>;
  return <div className="mg-root"><header className="mg-header"><div><h1>Gerência</h1><p>Administração financeira diária · módulo independente</p></div><div className="mg-filters"><label>Perfil<select value={profile} onChange={event => setProfile(event.target.value as Profile | 'todos')}><option value="todos">Geral</option><option value="chaveiro">Chaveiro</option><option value="fabiano">Fabiano</option></select></label><label>De<input type="date" value={start} onChange={event => setStart(event.target.value)} /></label><label>Até<input type="date" value={end} onChange={event => setEnd(event.target.value)} /></label></div></header><nav className="mg-tabs" aria-label="Módulos da Gerência">{modules.map(row => <button key={row.key} className={module === row.key ? 'active' : ''} onClick={() => setModule(row.key)}>{row.icon}<span>{row.label}</span></button>)}</nav><main className="mg-content" aria-label={selected.label}>
    {module === 'overview' && <Overview data={data} profile={profile} start={start} end={end} onFinance={() => setModule('finance')} />}
    {module === 'finance' && <ManagementFinance key={profile} data={data} profile={profile} start={start} end={end} />}
    {module === 'calendar' && <Calendar data={data} profile={profile} onFinance={() => setModule('finance')} />}
    {module === 'simulator' && <ManagementSimulator data={data} profile={profile} start={start} end={end} />}
    {module === 'profitability' && <ManagementRentability data={data} profile={profile} start={start} end={end} />}
    {module === 'movement' && <ManagementMovement data={data} profile={profile} start={start} end={end} setRange={(from, to) => { setStart(from); setEnd(to); }} />}
    {module === 'inventory' && <ManagementInventory data={data} profile={profile} start={start} end={end} />}
    {module === 'clients' && <ManagementClients data={data} />}
    {module === 'goals' && <ManagementGoals data={data} profile={profile} start={start} end={end} />}
  </main></div>;
}
