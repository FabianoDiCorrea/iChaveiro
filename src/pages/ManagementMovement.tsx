import { useEffect, useMemo, useState } from 'react';
import { ReportModal } from '../components/ReportModal';
import { itemFinancialProfile } from '../db/financialAllocation';
import { addDateDays, dateKey, money } from '../db/managementMath';
import { commercialItemOptions, movementMetricValue, movementRows, movementRowsForDate, movementRowsForDayBand, movementRowsForHour, movementTotals, type CommercialItemOption, type MovementCommercialFilters, type MovementDetailRow, type MovementMetric } from '../db/movementAnalysis';
import { commercialGroupOptions, normalizeCommercialText } from '../db/commercialClassification';
import type { Profile, Transaction } from '../db/db';
import type { ManagementData } from './managementUi';

const asMoney = (cents: number) => money(cents);
const profileLabel = (profile: Profile | 'todos') => profile === 'todos' ? 'Geral' : profile === 'chaveiro' ? 'Chaveiro' : 'Fabiano';
const activityLabel = (activity: 'service' | 'merchandise' | undefined) => activity === 'service' ? 'Serviços' : activity === 'merchandise' ? 'Mercadorias' : 'Sem classificação';
const weekdayNames = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const weekdayShort = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const colors = ['#E7AEA0', '#EFC17D', '#E2DF91', '#a6d68b', '#65BD8C'];

function formattedMetric(value: number, metric: MovementMetric) {
  if (metric === 'revenue' || metric === 'average') return asMoney(value);
  return `${value.toLocaleString('pt-BR')}${metric === 'units' ? ' un.' : ''}`;
}

function localDateRange(start: string, end: string) {
  const first = new Date(`${start}T12:00:00`);
  const last = new Date(`${end}T12:00:00`);
  const days: string[] = [];
  for (let offset = 0; offset < 4000; offset++) {
    const day = addDateDays(start, offset);
    if (day > end || day > dateKey(new Date())) break;
    days.push(day);
  }
  return { first, last, days };
}

function completeSaleItems(transaction: Transaction) {
  return transaction.items.map(item => ({
    item,
    profile: itemFinancialProfile(item, transaction.profile),
    totalCents: Math.round(item.total * 100)
  }));
}

export function ManagementMovement({ data, profile, start, end, setRange }: { data: ManagementData; profile: Profile | 'todos'; start: string; end: string; setRange: (start: string, end: string) => void }) {
  const [view, setView] = useState<'hours' | 'calendar' | 'bands'>('hours');
  const [rangePreset, setRangePreset] = useState('custom');
  const [interval, setInterval] = useState(1);
  const [fromHour, setFromHour] = useState(8);
  const [toHour, setToHour] = useState(20);
  const [metric, setMetric] = useState<MovementMetric>('sales');
  const [aggregation, setAggregation] = useState<'total' | 'average'>('total');
  const [calendarMonth, setCalendarMonth] = useState(start.slice(0, 7));
  const [filters, setFilters] = useState<MovementCommercialFilters>({ activity: 'all', groupKey: '', itemKey: '', query: '' });
  const [selected, setSelected] = useState<{ title: string; rows: MovementDetailRow[] } | null>(null);
  const [completeSale, setCompleteSale] = useState<MovementDetailRow | null>(null);
  const [page, setPage] = useState(1);

  const options = useMemo(() => commercialItemOptions(data.transactions, data.products), [data.transactions, data.products]);
  const groups = useMemo(() => {
    const byKey = new Map<string, CommercialItemOption>();
    options.forEach(option => byKey.set(option.groupKey, option));
    return commercialGroupOptions([...byKey.values()]);
  }, [options]);
  const visibleOptions = useMemo(() => {
    const query = normalizeCommercialText(filters.query);
    return options.filter(option => !query || option.searchText.includes(query));
  }, [options, filters.query]);

  useEffect(() => {
    if (calendarMonth !== start.slice(0, 7)) setCalendarMonth(start.slice(0, 7));
  }, [calendarMonth, start]);

  const inRange = data.transactions.filter(row => row.type === 'sale' || row.type === 'return').filter(row => {
    const key = dateKey(new Date(row.date));
    return key >= start && key <= end;
  });
  const filteredRows = useMemo(() => movementRows(inRange, data.products, profile, filters), [inRange, data.products, profile, filters]);
  const totals = movementTotals(filteredRows);
  const { first: startDate, last: endDate, days: eligibleDays } = localDateRange(start, end);
  const intervalCount = Math.ceil((toHour - fromHour) / interval);
  const weekdayBuckets = Array.from({ length: 7 }, (_, weekday) => Array.from({ length: intervalCount }, (_, bucket) => {
    const firstHour = fromHour + bucket * interval;
    const lastHour = Math.min(toHour, firstHour + interval);
    const matching = movementRowsForHour(filteredRows, firstHour, lastHour, weekday);
    const cellTotals = movementTotals(matching);
    const eligible = eligibleDays.filter(day => new Date(`${day}T12:00:00`).getDay() === weekday).length;
    const rawValue = movementMetricValue(cellTotals, metric);
    const value = aggregation === 'average' && metric !== 'average' ? rawValue / Math.max(1, eligible) : rawValue;
    return { matching, totals: cellTotals, value, eligible, firstHour, lastHour };
  }));
  const maxCell = Math.max(1, ...weekdayBuckets.flat().map(cell => Math.abs(cell.value)));

  const monthDate = new Date(`${calendarMonth}-01T12:00:00`);
  const monthDays = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
  const calendarDays = Array.from({ length: monthDays }, (_, index) => {
    const key = `${calendarMonth}-${String(index + 1).padStart(2, '0')}`;
    const inPeriod = key >= start && key <= end;
    const dayRows = inPeriod ? movementRowsForDate(filteredRows, key) : [];
    const dayTotals = movementTotals(dayRows);
    const value = movementMetricValue(dayTotals, metric);
    return { key, rows: dayRows, totals: dayTotals, value, inPeriod, future: key > dateKey(new Date()) };
  });
  const calendarMaximum = Math.max(1, ...calendarDays.map(day => Math.abs(day.value)));

  const bands = Array.from({ length: 6 }, (_, index) => {
    const low = index * 5 + 1;
    const high = index === 5 ? 31 : low + 4;
    const matching = movementRowsForDayBand(filteredRows, low, high);
    const consideredDays = eligibleDays.filter(day => {
      const number = Number(day.slice(8));
      return number >= low && number <= high;
    }).length;
    const bandTotals = movementTotals(matching);
    const raw = movementMetricValue(bandTotals, metric);
    const shown = aggregation === 'average' && metric !== 'average' ? (consideredDays ? raw / consideredDays : 0) : raw;
    return { low, high, label: `${String(low).padStart(2, '0')}–${index === 5 ? 'fim' : String(high).padStart(2, '0')}`, rows: matching, totals: bandTotals, consideredDays, shown };
  });
  const maxBand = Math.max(1, ...bands.map(band => Math.abs(band.shown)));

  const comparison = Array.from({ length: intervalCount }, (_, index) => {
    const firstHour = fromHour + index * interval;
    const lastHour = Math.min(toHour, firstHour + interval);
    const matching = movementRowsForHour(filteredRows, firstHour, lastHour);
    return { firstHour, lastHour, rows: matching, totals: movementTotals(matching) };
  });

  const summaryRank = (bucket: (row: MovementDetailRow) => string, label: (key: string) => string) => {
    if (totals.sales < 2) return 'Dados insuficientes';
    const grouped = new Map<string, MovementDetailRow[]>();
    filteredRows.forEach(row => {
      const key = bucket(row);
      if (!key) return;
      grouped.set(key, [...(grouped.get(key) || []), row]);
    });
    const ranks = [...grouped.entries()].map(([key, rows]) => ({ key, value: movementMetricValue(movementTotals(rows), metric) }))
      .filter(row => row.value > 0).sort((a, b) => b.value - a.value);
    return ranks.length ? label(ranks[0].key) : 'Dados insuficientes';
  };
  const bestWeekday = summaryRank(row => String(new Date(row.transaction.date).getDay()), key => weekdayNames[Number(key)]);
  const bestHour = summaryRank(row => {
    const hour = new Date(row.transaction.date).getHours();
    if (hour < fromHour || hour >= toHour) return '';
    return `${fromHour + Math.floor((hour - fromHour) / interval) * interval}`;
  }, key => `${String(Number(key)).padStart(2, '0')}h–${String(Math.min(toHour, Number(key) + interval)).padStart(2, '0')}h`);
  const bestDate = summaryRank(row => dateKey(new Date(row.transaction.date)), key => new Date(`${key}T12:00:00`).toLocaleDateString('pt-BR'));
  const averageDays = Math.max(1, eligibleDays.length);
  const intervalAverage = (value: number) => value / averageDays;
  const detailPageCount = selected ? Math.ceil(selected.rows.length / 20) : 0;
  const displayedDetails = selected?.rows.slice((page - 1) * 20, page * 20) || [];

  const clearCommercialFilters = () => {
    setFilters({ activity: 'all', groupKey: '', itemKey: '', query: '' });
    setPage(1);
    setSelected(null);
  };
  const changeFilter = (next: Partial<MovementCommercialFilters>) => {
    setFilters(previous => {
      const updated = { ...previous, ...next };
      if (next.activity && next.activity !== 'all') {
        const group = groups.find(option => option.groupKey === updated.groupKey);
        const item = options.find(option => option.key === updated.itemKey);
        if (group && group.activity !== next.activity) updated.groupKey = '';
        if (item && item.activity !== next.activity) updated.itemKey = '';
      }
      return updated;
    });
    setPage(1);
    setSelected(null);
  };
  const chooseRange = (preset: string) => {
    setRangePreset(preset);
    const now = new Date();
    const today = dateKey(now);
    let begin = today, finish = today;
    if (preset === 'week' || preset === 'lastWeek') {
      const monday = new Date(now); monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
      const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
      if (preset === 'lastWeek') { monday.setDate(monday.getDate() - 7); sunday.setDate(sunday.getDate() - 7); }
      begin = dateKey(monday); finish = preset === 'week' ? today : dateKey(sunday);
    } else if (preset === '15') begin = dateKey(addDateDays(today, -14));
    else if (preset === 'month' || preset === 'lastMonth') {
      const anchor = new Date(now.getFullYear(), now.getMonth() - (preset === 'lastMonth' ? 1 : 0), 1);
      begin = dateKey(anchor); finish = preset === 'month' ? today : dateKey(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0));
    } else if (preset === '3' || preset === '6') begin = dateKey(new Date(now.getFullYear(), now.getMonth() - Number(preset) + 1, 1));
    else if (preset === 'year') begin = `${now.getFullYear()}-01-01`;
    else return;
    setRange(begin, finish);
  };
  const setIntervalValue = (value: number) => {
    setInterval(value);
    if (toHour - fromHour < value) setToHour(Math.min(24, fromHour + value));
  };
  const openDetail = (title: string, rows: MovementDetailRow[]) => {
    setPage(1);
    setCompleteSale(null);
    setSelected({ title, rows: [...rows].sort((a, b) => +new Date(b.transaction.date) - +new Date(a.transaction.date)) });
  };
  const colorFor = (value: number, max: number) => value === 0 ? '#263244' : colors[Math.min(4, Math.floor(Math.abs(value) / max * 5))];
  const metricName = metric === 'sales' ? 'vendas' : metric === 'units' ? 'unidades líquidas' : metric === 'average' ? 'valor médio por venda' : 'faturamento líquido';
  const selectedItem = options.find(option => option.key === filters.itemKey);
  const selectedGroup = groups.find(option => option.groupKey === filters.groupKey);
  const hasCommercialFilters = filters.activity !== 'all' || !!filters.groupKey || !!filters.itemKey || !!filters.query;

  return <div className="mg-section">
    <div className="mg-heading"><div><h2>Análise de movimento</h2><p>Transações concluídas e devoluções no período. Os horários indicam a finalização da venda no sistema, não necessariamente o atendimento ou a execução do serviço.</p></div><div className="mg-movement-controls"><label>Período<select value={rangePreset} onChange={event => chooseRange(event.target.value)}><option value="custom">Personalizado</option><option value="today">Hoje</option><option value="week">Esta semana</option><option value="lastWeek">Semana passada</option><option value="15">Últimos 15 dias</option><option value="month">Este mês</option><option value="lastMonth">Mês passado</option><option value="3">Últimos 3 meses</option><option value="6">Últimos 6 meses</option><option value="year">Este ano</option></select></label><label>De<input type="date" value={start} onChange={event => { setRangePreset('custom'); setRange(event.target.value, end); }} /></label><label>Até<input type="date" value={end} onChange={event => { setRangePreset('custom'); setRange(start, event.target.value); }} /></label></div></div>

    <div className="mg-card mg-movement-filter-card">
      <div className="mg-movement-filter-grid">
        <label>Tipo de atividade<select value={filters.activity} onChange={event => changeFilter({ activity: event.target.value as MovementCommercialFilters['activity'] })}><option value="all">Todas as atividades</option><option value="service">Serviços</option><option value="merchandise">Venda de mercadorias</option></select></label>
        <label>Grupo comercial<select value={filters.groupKey} onChange={event => changeFilter({ groupKey: event.target.value })}><option value="">Todos os grupos</option>{groups.filter(group => filters.activity === 'all' || group.activity === filters.activity).map(group => <option key={group.groupKey} value={group.groupKey}>{group.group} · {activityLabel(group.activity)}</option>)}</select></label>
        <label className="mg-movement-search">Pesquisar por código ou descrição<input value={filters.query} onChange={event => changeFilter({ query: event.target.value, itemKey: '' })} placeholder="Ex.: 799 ou afiação de alicate" /></label>
        <label>Produto ou serviço específico<select value={filters.itemKey} onChange={event => changeFilter({ itemKey: event.target.value })}><option value="">Todos os itens</option>{visibleOptions.filter(option => filters.activity === 'all' || option.activity === filters.activity).map(option => <option key={option.key} value={option.key}>{option.code ? `${option.code} · ` : ''}{option.name} · {activityLabel(option.activity)}</option>)}</select></label>
        <label>Métrica<select value={metric} onChange={event => setMetric(event.target.value as MovementMetric)}><option value="sales">Quantidade de vendas</option><option value="units">Quantidade líquida de unidades</option><option value="revenue">Faturamento líquido</option><option value="average">Valor médio por venda</option></select></label>
        {metric !== 'average' && <label>Apresentação<select value={aggregation} onChange={event => setAggregation(event.target.value as typeof aggregation)}><option value="total">Total acumulado</option><option value="average">Média por dia do calendário</option></select></label>}
        {hasCommercialFilters && <button type="button" className="mg-clear-filters" onClick={clearCommercialFilters}>Limpar filtros comerciais</button>}
      </div>
      {hasCommercialFilters && <div className="mg-active-filters" aria-label="Filtros comerciais ativos"><strong>Filtros ativos:</strong>{filters.activity !== 'all' && <span>{activityLabel(filters.activity)}</span>}{selectedGroup && <span>{selectedGroup.group}</span>}{selectedItem && <span>{selectedItem.code ? `${selectedItem.code} · ` : ''}{selectedItem.name}</span>}{filters.query && <span>Pesquisa: {filters.query}</span>}</div>}
    </div>

    <div className="mg-grid mg-grid-four mg-movement-summary">
      <div className="mg-card"><small>Vendas com itens selecionados</small><strong>{totals.sales.toLocaleString('pt-BR')}</strong></div>
      <div className="mg-card"><small>Unidades líquidas</small><strong>{totals.units.toLocaleString('pt-BR')}</strong></div>
      <div className="mg-card"><small>Faturamento líquido filtrado</small><strong>{asMoney(totals.revenueCents)}</strong></div>
      <div className="mg-card"><small>Valor médio por venda</small><strong>{totals.sales ? asMoney(totals.averageSaleCents) : '—'}</strong></div>
      <div className="mg-card"><small>Dia da semana com maior movimento</small><strong>{bestWeekday}</strong></div>
      <div className="mg-card"><small>Faixa horária com maior movimento</small><strong>{bestHour}</strong></div>
      <div className="mg-card"><small>Data com maior movimento</small><strong>{bestDate}</strong></div>
      <div className="mg-card"><small>Média diária no período ({eligibleDays.length} dias corridos elegíveis)</small><strong>{(totals.sales / averageDays).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} venda(s) · {(totals.units / averageDays).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} un.</strong><small>{asMoney(Math.round(totals.revenueCents / averageDays))} por dia</small></div>
    </div>
    {totals.sales < 2 && <p className="mg-hint">Há poucos registros filtrados para apontar um padrão de dia ou horário. Os totais continuam disponíveis acima.</p>}

    <div className="mg-subtabs" aria-label="Visualização do movimento">{[['hours','Horários e dias'],['calendar','Calendário mensal'],['bands','Períodos do mês']].map(([key,label]) => <button key={key} className={view === key ? 'active' : ''} onClick={() => setView(key as typeof view)}>{label}</button>)}</div>

    {view === 'hours' && <>
      <div className="mg-movement-controls"><label>Intervalo<select value={interval} onChange={event => setIntervalValue(Number(event.target.value))}><option value={1}>1 hora</option><option value={2}>2 horas</option><option value={3}>3 horas</option></select></label><label>Início<select value={fromHour} onChange={event => setFromHour(Math.min(Number(event.target.value), toHour - interval))}>{Array.from({ length: 24 }, (_, hour) => <option key={hour} value={hour}>{String(hour).padStart(2, '0')}h</option>)}</select></label><label>Fim<select value={toHour} onChange={event => setToHour(Math.max(Number(event.target.value), fromHour + interval))}>{Array.from({ length: 24 }, (_, index) => index + 1).map(hour => <option key={hour} value={hour}>{String(hour).padStart(2, '0')}h</option>)}</select></label></div>
      <div className="mg-card"><h3>Movimento por dia da semana e horário</h3><p className="mg-hint">{new Date(`${start}T12:00:00`).toLocaleDateString('pt-BR')} a {new Date(`${end}T12:00:00`).toLocaleDateString('pt-BR')} · {aggregation === 'average' && metric !== 'average' ? 'média por ocorrência do dia, incluindo dias sem venda e excluindo datas futuras' : 'total acumulado'} · clique numa célula para detalhar.</p><div className="mg-movement-grid" style={{ gridTemplateColumns: `78px repeat(${intervalCount}, minmax(48px,1fr))` }}><strong />{Array.from({ length: intervalCount }, (_, index) => <strong key={index}>{String(fromHour + index * interval).padStart(2, '0')}–{String(Math.min(toHour, fromHour + (index + 1) * interval)).padStart(2, '0')}h</strong>)}{weekdayNames.map((day, weekday) => <div className="mg-movement-row" key={day}><strong>{weekdayShort[weekday]}</strong>{weekdayBuckets[weekday].map((cell, index) => <button key={index} className={cell.value === 0 ? 'mg-movement-zero' : ''} title={`${day}, ${cell.firstHour}h–${cell.lastHour}h · ${cell.totals.sales} venda(s) · ${cell.totals.units} unidade(s) líquidas · ${asMoney(cell.totals.revenueCents)} · ${cell.eligible} data(s) considerada(s)`} style={{ background: colorFor(cell.value, maxCell), color: cell.value === 0 ? '#f8fafc' : '#17212b' }} onClick={() => openDetail(`${day} · ${cell.firstHour}h–${cell.lastHour}h`, cell.matching)}>{formattedMetric(cell.value, metric)}</button>)}</div>)}</div><div className="mg-legend"><span>Menor movimento</span>{colors.map(color => <i key={color} style={{ background: color }} />)}<span>Maior movimento</span><span>Escala relativa ao maior valor deste filtro</span></div></div>
      <div className="mg-card mg-movement-comparison"><h3>Comparação entre horários</h3><p className="mg-hint">Totaliza o intervalo selecionado em todos os dias. A média diária usa {eligibleDays.length} dia(s) corridos elegíveis até hoje.</p><div className="mg-table-wrap"><table className="mg-table"><thead><tr><th>Faixa</th><th>Vendas</th><th>Unidades líquidas</th><th>Faturamento líquido</th><th>Valor médio por venda</th><th>{metric === 'average' ? 'Métrica selecionada' : `Média diária (${metricName})`}</th></tr></thead><tbody>{comparison.map(row => <tr key={row.firstHour}><td>{String(row.firstHour).padStart(2, '0')}h–{String(row.lastHour).padStart(2, '0')}h</td><td>{row.totals.sales}</td><td>{row.totals.units}</td><td>{asMoney(row.totals.revenueCents)}</td><td>{row.totals.sales ? asMoney(row.totals.averageSaleCents) : '—'}</td><td>{metric === 'average' ? (row.totals.sales ? asMoney(row.totals.averageSaleCents) : '—') : eligibleDays.length ? formattedMetric(intervalAverage(movementMetricValue(row.totals, metric)), metric) : '—'}</td></tr>)}</tbody></table></div></div>
    </>}

    {view === 'calendar' && <>
      <div className="mg-heading"><div><h3>{monthDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</h3><p>Os dias fora do período selecionado e as datas futuras não entram nos totais.</p></div><div className="mg-actions"><button onClick={() => { const date = new Date(monthDate.getFullYear(), monthDate.getMonth() - 1, 1); const next = dateKey(date).slice(0, 7); setCalendarMonth(next); setRange(`${next}-01`, dateKey(new Date(date.getFullYear(), date.getMonth() + 1, 0))); setRangePreset('custom'); }}>← Mês anterior</button><button onClick={() => { const date = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1); const next = dateKey(date).slice(0, 7); setCalendarMonth(next); setRange(`${next}-01`, dateKey(new Date(date.getFullYear(), date.getMonth() + 1, 0))); setRangePreset('custom'); }}>Próximo mês →</button></div></div>
      <div className="mg-grid mg-grid-four"><div className="mg-card"><small>Vendas com itens selecionados</small><strong>{movementTotals(filteredRows.filter(row => dateKey(new Date(row.transaction.date)).startsWith(calendarMonth))).sales}</strong></div><div className="mg-card"><small>Unidades líquidas no mês</small><strong>{movementTotals(filteredRows.filter(row => dateKey(new Date(row.transaction.date)).startsWith(calendarMonth))).units}</strong></div><div className="mg-card"><small>Faturamento líquido no mês</small><strong>{asMoney(movementTotals(filteredRows.filter(row => dateKey(new Date(row.transaction.date)).startsWith(calendarMonth))).revenueCents)}</strong></div><div className="mg-card"><small>Maior dia do mês ({metricName})</small><strong>{totals.sales >= 2 ? calendarDays.filter(day => day.inPeriod && !day.future).sort((a, b) => movementMetricValue(b.totals, metric) - movementMetricValue(a.totals, metric))[0]?.key.split('-').reverse().join('/') || '—' : 'Dados insuficientes'}</strong></div></div>
      <div className="mg-movement-controls"><label>Métrica do calendário<select value={metric} onChange={event => setMetric(event.target.value as MovementMetric)}><option value="sales">Quantidade de vendas</option><option value="units">Quantidade líquida de unidades</option><option value="revenue">Faturamento líquido</option><option value="average">Valor médio por venda</option></select></label></div>
      <div className="mg-movement-calendar"><div className="mg-calendar mg-card">{weekdayShort.map(day => <strong className="mg-calendar-weekday" key={day}>{day}</strong>)}{Array.from({ length: monthDate.getDay() }, (_, index) => <div className="mg-calendar-empty" key={`empty:${index}`} />)}{calendarDays.map(day => <button key={day.key} disabled={day.future || !day.inPeriod} className={`mg-calendar-day ${day.future || !day.inPeriod ? 'movement-future' : ''}`} style={{ background: day.future || !day.inPeriod ? '#1e293b' : colorFor(day.value, calendarMaximum) }} onClick={() => openDetail(day.key.split('-').reverse().join('/'), day.rows)}><strong>{Number(day.key.slice(-2))}</strong><span>{day.future ? 'Futuro' : !day.inPeriod ? 'Fora do período' : formattedMetric(day.value, metric)}</span>{!day.future && day.inPeriod && !day.totals.sales && <small>Sem venda registrada</small>}</button>)}</div><div className="mg-legend"><span>Escala relativa ao maior valor diário deste filtro</span><span>Futuro ou fora do período</span><i style={{ background: '#1e293b' }} /></div></div>
    </>}

    {view === 'bands' && <>
      <div className="mg-movement-controls"><label>Apresentação<select value={aggregation} onChange={event => setAggregation(event.target.value as typeof aggregation)}><option value="total">Total acumulado</option><option value="average">Média diária do calendário</option></select></label><label>Métrica das faixas<select value={metric} onChange={event => setMetric(event.target.value as MovementMetric)}><option value="sales">Quantidade de vendas</option><option value="units">Quantidade líquida de unidades</option><option value="revenue">Faturamento líquido</option><option value="average">Valor médio por venda</option></select></label></div>
      <p className="mg-hint">Faixas de dias do mês entre {new Date(`${start}T12:00:00`).toLocaleDateString('pt-BR')} e {new Date(`${end}T12:00:00`).toLocaleDateString('pt-BR')}. A média diária considera datas até hoje, inclusive dias sem venda; valor médio por venda não é dividido por dia.</p>
      <div className="mg-period-bands">{bands.map(band => <button className="mg-card mg-period-band" key={band.label} style={{ background: colorFor(band.shown, maxBand) }} onClick={() => openDetail(`Dias ${band.label} do mês`, band.rows)}><strong>{band.label}</strong><span>{formattedMetric(band.shown, metric)}</span><small>{band.totals.sales} venda(s) · {band.totals.units} unidade(s) líquidas · {asMoney(band.totals.revenueCents)} · {band.consideredDays} dia(s)</small></button>)}</div>
    </>}

    {selected && <ReportModal title={selected.title} subtitle={`${selected.rows.length} transação(ões) · ${movementTotals(selected.rows).sales} venda(s) · ${movementTotals(selected.rows).units} unidades líquidas · valor filtrado ${asMoney(movementTotals(selected.rows).revenueCents)}`} onClose={() => { setSelected(null); setCompleteSale(null); }} wide><div className="mg-table-wrap mg-movement-detail-scroll"><table className="mg-table"><thead><tr><th>Data e hora</th><th>Produto ou serviço filtrado</th><th>Código</th><th>Quantidade líquida</th><th>Valor filtrado</th><th>Perfil financeiro</th><th>Venda</th></tr></thead><tbody>{displayedDetails.map((row, index) => { const sale = row.transaction; const profiles = [...new Set(row.items.map(item => item.financialProfile))].map(profileLabel).join(', '); const hasOtherItems = row.sourceTransaction.items.length > row.items.length; return <tr key={`${sale.id ?? index}:${sale.date}`}><td>{new Date(sale.date).toLocaleString('pt-BR')}</td><td>{row.items.map(item => item.description).join(', ')}{sale.type === 'return' ? ' · devolução' : ''}</td><td>{row.items.map(item => item.code || '—').join(', ')}</td><td>{row.quantity}</td><td>{asMoney(row.revenueCents)}</td><td>{profiles}</td><td>{hasOtherItems && <button className="mg-link" onClick={() => setCompleteSale(row)}>Ver venda completa</button>}</td></tr>; })}{!displayedDetails.length && <tr><td colSpan={7}>Nenhum lançamento nesta seleção.</td></tr>}</tbody></table></div>{detailPageCount > 1 && <div className="mg-pagination"><button disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</button><span>{page} / {detailPageCount}</span><button disabled={page >= detailPageCount} onClick={() => setPage(page + 1)}>Próxima</button></div>}<p className="mg-hint">Os valores desta tabela correspondem somente aos itens filtrados. Quando houver outros itens na venda, eles aparecem no modal separado e não são somados ao filtro.</p></ReportModal>}
    {completeSale && <ReportModal title="Venda completa" subtitle={`Registro original · perfil ${profileLabel(completeSale.sourceTransaction.profile)} · ${completeSale.sourceTransaction.type === 'return' ? 'devolução' : 'venda concluída'}`} onClose={() => setCompleteSale(null)}><div className="mg-table-wrap"><table className="mg-table"><thead><tr><th>Item</th><th>Perfil</th><th>Quantidade</th><th>Valor</th></tr></thead><tbody>{completeSaleItems(completeSale.sourceTransaction).map((row, index) => <tr key={`${row.item.productId || row.item.service}:${index}`}><td>{row.item.name}</td><td>{profileLabel(row.profile)}</td><td>{row.item.quantity}</td><td>{asMoney(row.totalCents)}</td></tr>)}</tbody><tfoot><tr><th colSpan={3}>Total da venda completa (referência)</th><th>{asMoney(Math.round(completeSale.sourceTransaction.total * 100))}</th></tr></tfoot></table></div><p className="mg-hint">Este total é apenas uma consulta da venda inteira; não altera nem substitui o faturamento filtrado do relatório.</p></ReportModal>}

    <p className="mg-hint">Pedidos pendentes não são contados. A visualização Geral conta cada venda física uma vez; em perfis individuais, a distribuição segue os itens atribuídos ao perfil. Devoluções reduzem unidades e faturamento líquidos, mas não apagam a contagem histórica de vendas concluídas. Perfil ativo: {profileLabel(profile)}.</p>
  </div>;
}
