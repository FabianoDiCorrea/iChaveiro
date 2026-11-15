import { useState } from 'react';
import { CalendarDays, CreditCard, HandCoins, PiggyBank } from 'lucide-react';
import { ReportModal } from '../components/ReportModal';
import { PROFILES, type Profile } from '../db/db';
import { addDateDays, dateKey, money, provisionStatus } from '../db/managementMath';
import { editOccurrence, moveFund, payOccurrence, recordOpeningBalance, recordWithdrawal, reserveForOccurrence, reverseEntry, saveAccount, saveFund, setOccurrenceStatus } from '../db/managementService';
import type { AccountOccurrence, AccountPlan, ManagementFund, MoneySource } from '../db/managementTypes';
import type { PaymentMachine, MachineRate } from '../db/db';
import { deactivateMachine, saveMachine, setDefaultMachine } from '../db/machineService';
import { allocateCents, getFinancialShares } from '../db/financialAllocation';
import { centsInput, formatDate, inputCents, runAction, sourceNames, type ManagementData } from './managementUi';

const categoryOptions = [
  ['internet', 'Internet'], ['energia', 'Energia elétrica'], ['fornecedor', 'Fornecedor'], ['manutencao', 'Manutenção'],
  ['impostos', 'Impostos'], ['aluguel', 'Aluguel'], ['parcelamento', 'Parcelamento'], ['estoque', 'Compra para estoque'], ['outros', 'Outros']
];
const initialAccount = (profile: Profile): AccountPlan => ({
  name: '', category: 'outros', profile, amountCents: 0, variable: false, startDate: dateKey(new Date()),
  firstDueDate: addDateDays(dateKey(new Date()), 30), recurrence: 'once', provisionEnabled: false, provisionDays: 26,
  provisionMode: 'fixed', workingDays: [1, 2, 3, 4, 5, 6], excludedDates: [], includedDates: [], noticeDays: 3,
  status: 'active', createdAt: new Date(), updatedAt: new Date()
});
const profileName = (profile: Profile) => profile.charAt(0).toUpperCase() + profile.slice(1);
const entryNames: Record<string, string> = { reserve: 'Reserva de conta', 'reserve-use': 'Reserva usada', payment: 'Pagamento de conta', 'fund-deposit': 'Depósito em fundo', 'fund-withdrawal': 'Saída de fundo', 'fund-transfer-out': 'Transferência de fundo', 'fund-transfer-in': 'Entrada por transferência', withdrawal: 'Retirada', 'opening-balance': 'Saldo inicial' };
const methodName = { pix: 'PIX', debit: 'Débito', credit: 'Crédito' } as const;
const setMachineRate = (machine: PaymentMachine, set: (value: PaymentMachine) => void, method: MachineRate['method'], change: Partial<MachineRate>, installment = 1) => {
  const old = machine.rates.find(rate => rate.method === method && (rate.installment || 1) === installment) || { method, installment: installment === 1 ? undefined : installment, configured: true };
  set({ ...machine, rates: [...machine.rates.filter(rate => !(rate.method === method && (rate.installment || 1) === installment)), { ...old, ...change, configured: true }] });
};

export function ManagementFinance({ data, profile, start, end }: { data: ManagementData; profile: Profile | 'todos'; start: string; end: string }) {
  const [section, setSection] = useState<'accounts' | 'funds' | 'withdrawals' | 'machines'>('accounts');
  const [accountForm, setAccountForm] = useState<AccountPlan | null>(null);
  const [occurrenceDialog, setOccurrenceDialog] = useState<{ mode: 'reserve' | 'pay' | 'edit'; occurrence: AccountOccurrence } | null>(null);
  const [amount, setAmount] = useState('');
  const [source, setSource] = useState<MoneySource>('cash');
  const [reserveUsed, setReserveUsed] = useState('0');
  const [linkedExpenseId, setLinkedExpenseId] = useState('');
  const [overflowFundId, setOverflowFundId] = useState('');
  const [future, setFuture] = useState(false);
  const [dueDate, setDueDate] = useState('');
  const [fundForm, setFundForm] = useState<ManagementFund | null>(null);
  const [fundDialog, setFundDialog] = useState<{ action: 'deposit' | 'withdraw' | 'transfer'; fund: ManagementFund } | null>(null);
  const [fundDestination, setFundDestination] = useState('');
  const [note, setNote] = useState('');
  const [withdrawalForm, setWithdrawalForm] = useState(false);
  const [beneficiary, setBeneficiary] = useState('');
  const [withdrawalCategory, setWithdrawalCategory] = useState('retirada_pessoal');
  const [withdrawalDate, setWithdrawalDate] = useState(dateKey(new Date()));
  const [entryPage, setEntryPage] = useState(1);
  const [occurrencePage, setOccurrencePage] = useState(1);
  const [openingForm, setOpeningForm] = useState(false);
  const [machineForm, setMachineForm] = useState<PaymentMachine | null>(null);
  const [machineFilter, setMachineFilter] = useState('');

  const visibleAccounts = data.accounts.filter(row => profile === 'todos' || row.profile === profile);
  const visibleOccurrences = data.occurrences.filter(row => profile === 'todos' || row.profile === profile).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const openOccurrences = visibleOccurrences.filter(row => row.status === 'open');
  const visibleFunds = data.funds.filter(row => profile === 'todos' || row.profile === profile);
  const visibleEntries = [...data.entries].filter(row => profile === 'todos' || row.profile === profile).sort((a, b) => +new Date(b.date) - +new Date(a.date));
  const visibleMachines = data.machines.filter(row => profile === 'todos' || row.ownerProfile === profile);
  const visibleMachineProfiles = profile === 'todos' ? PROFILES : [profile];
  const machineRows = new Map<string, {key:string;name:string;owner:string;seller:string;method:string;count:number;gross:number;fee:number}>();
  for(const transaction of data.transactions){
    const day=dateKey(new Date(transaction.date)); if(day<start || day>end || transaction.type!=='sale') continue;
    const shares=getFinancialShares(transaction);
    const weights=Object.fromEntries(shares.map(share=>[share.profile,Math.max(0,Math.round(share.total*100))]));
    const addPayment=(machineId:number|undefined,machineName:string|undefined,ownerProfile:Profile|undefined,method:string,grossCents:number,feeCents:number,installments?:number)=>{
      const grossByProfile=allocateCents(grossCents,weights);const feeByProfile=allocateCents(feeCents,weights);
      for(const share of shares){if(profile!=='todos'&&share.profile!==profile)continue;const gross=grossByProfile[share.profile]||0;const fee=feeByProfile[share.profile]||0;if(!gross&&!fee)continue;
        const machine=machineId?data.machines.find(row=>row.id===machineId):undefined;const key=`${machineId||'legacy'}:${method}:${installments||1}:${share.profile}`;
        const methodLabel=methodName[method as keyof typeof methodName]||method;
        const row=machineRows.get(key)||{key,name:machineName||(method==='pix'&&!machineId?'PIX direto em conta':machine?.name)||'Histórico legado · maquininha não informada',owner:ownerProfile?profileName(ownerProfile):machine?profileName(machine.ownerProfile):'Não informado',seller:profileName(share.profile),method:method==='credit'&&installments&&installments>1?`${methodLabel} ${installments}x`:methodLabel,count:0,gross:0,fee:0};
        row.count++;row.gross+=gross;row.fee+=fee;machineRows.set(key,row);
      }
    };
    const payments=transaction.machinePayments;
    if(payments?.length){ for(const payment of payments){ if(!payment.machineId&&payment.method!=='pix') continue; addPayment(payment.machineId,payment.machineName,payment.ownerProfile,payment.method,payment.grossCents,payment.feeCents||0,payment.installments); } }
    else if(transaction.machineId){const machine=data.machines.find(row=>row.id===transaction.machineId);const method=transaction.paymentMethod==='split'?'split':transaction.paymentMethod;addPayment(transaction.machineId,machine?.name,machine?.ownerProfile,method,Math.round(transaction.total*100),transaction.machineFeeCents??Math.round((transaction.machineFee||0)*100));}
    else if(transaction.machineFee){addPayment(undefined,undefined,undefined,transaction.paymentMethod,Math.round(transaction.total*100),Math.round(transaction.machineFee*100));}
  }
  const machineReportRows=[...machineRows.values()].filter(row=>!machineFilter||row.key.startsWith(`${machineFilter}:`));
  const selectedPlan = occurrenceDialog && data.accounts.find(row => row.id === occurrenceDialog.occurrence.accountId);
  const selectedStatus = selectedPlan && occurrenceDialog ? provisionStatus(selectedPlan, occurrenceDialog.occurrence, data.entries, dateKey(new Date())) : null;

  const openOccurrence = (mode: 'reserve' | 'pay' | 'edit', occurrence: AccountOccurrence) => {
    const plan = data.accounts.find(row => row.id === occurrence.accountId);
    const status = plan ? provisionStatus(plan, occurrence, data.entries, dateKey(new Date())) : null;
    setAmount(centsInput(mode === 'reserve' ? status?.suggested || 0 : mode === 'pay' ? status?.remaining || 0 : occurrence.amountCents));
    setDueDate(occurrence.dueDate);
    setSource('cash'); setReserveUsed('0'); setLinkedExpenseId(''); setOverflowFundId(''); setFuture(false);
    setOccurrenceDialog({ mode, occurrence });
  };

  const submitAccount = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!accountForm) return;
    const { id, createdAt, updatedAt, ...input } = accountForm;
    void createdAt; void updatedAt;
    if (await runAction(() => saveAccount(input, id), 'Conta salva. Ocorrências futuras geradas sem alterar as já pagas.')) setAccountForm(null);
  };

  const submitOccurrence = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!occurrenceDialog?.occurrence.id) return;
    const id = occurrenceDialog.occurrence.id;
    const value = inputCents(amount);
    const success = await runAction(async () => {
      if (occurrenceDialog.mode === 'reserve') await reserveForOccurrence(id, value, source, { overflowFundId: overflowFundId ? Number(overflowFundId) : undefined, note });
      else if (occurrenceDialog.mode === 'pay') await payOccurrence(id, value, source, inputCents(reserveUsed), linkedExpenseId ? Number(linkedExpenseId) : undefined);
      else await editOccurrence(id, { amountCents: value, dueDate }, future);
    });
    if (success) { setOccurrenceDialog(null); setNote(''); }
  };

  const submitFund = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!fundForm) return;
    const { id, createdAt, updatedAt, ...input } = fundForm;
    void createdAt; void updatedAt;
    if (await runAction(() => saveFund(input, id))) setFundForm(null);
  };

  const submitFundMovement = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!fundDialog?.fund.id) return;
    const success = await runAction(() => moveFund(fundDialog.fund.id!, inputCents(amount), fundDialog.action, source, note, fundDestination ? Number(fundDestination) : undefined));
    if (success) { setFundDialog(null); setNote(''); }
  };

  return <div className="mg-section">
    <div className="mg-subtabs">
      <button className={section === 'accounts' ? 'active' : ''} onClick={() => setSection('accounts')}><CalendarDays size={15}/> Contas e provisionamento</button>
      <button className={section === 'funds' ? 'active' : ''} onClick={() => setSection('funds')}><PiggyBank size={15}/> Fundos livres</button>
      <button className={section === 'withdrawals' ? 'active' : ''} onClick={() => setSection('withdrawals')}><HandCoins size={15}/> Retiradas e saldos</button>
      <button className={section === 'machines' ? 'active' : ''} onClick={() => setSection('machines')}><CreditCard size={15}/> Maquininhas</button>
    </div>

    {section === 'accounts' && <>
      <div className="mg-heading"><div><h2>Contas e compromissos</h2><p>Reservar é separar dinheiro; somente registrar o pagamento quita uma conta.</p></div><button className="btn btn-primary" onClick={() => setAccountForm(initialAccount(profile === 'todos' ? 'chaveiro' : profile))}>Nova conta</button></div>
      <div className="mg-card mg-table-wrap"><table className="mg-table"><thead><tr><th>Conta</th><th>Perfil</th><th>Frequência</th><th>Valor</th><th>Situação</th><th></th></tr></thead><tbody>
        {visibleAccounts.map(row => <tr key={row.id}><td><strong>{row.name}</strong><small>{row.beneficiary || row.description || row.category}</small></td><td>{profileName(row.profile)}</td><td>{({ once: 'Avulsa', weekly: 'Semanal', monthly: 'Mensal', annual: 'Anual', custom: `A cada ${row.intervalDays || 1} dias` })[row.recurrence]}</td><td>{money(row.amountCents)}{row.variable && <small>Valor variável</small>}</td><td>{row.status === 'active' ? 'Ativa' : row.status === 'inactive' ? 'Inativa' : 'Arquivada'}</td><td><button className="mg-link" onClick={() => setAccountForm({ ...row })}>Editar</button></td></tr>)}
        {!visibleAccounts.length && <tr><td colSpan={6}>Nenhuma conta cadastrada.</td></tr>}
      </tbody></table></div>
      <div className="mg-heading"><div><h2>Ocorrências</h2><p>Cada vencimento possui reserva e pagamento próprios.</p></div></div>
      <div className="mg-card mg-table-wrap"><table className="mg-table"><thead><tr><th>Vencimento / Conta</th><th>Valor</th><th>Reservado</th><th>Planejamento</th><th>Pago</th><th>Ações</th></tr></thead><tbody>
        {openOccurrences.slice((occurrencePage - 1) * 20, occurrencePage * 20).map(row => {
          const plan = data.accounts.find(candidate => candidate.id === row.accountId);
          const state = plan ? provisionStatus(plan, row, data.entries, dateKey(new Date())) : null;
          return <tr key={row.id}><td><strong>{row.name}</strong><small>{formatDate(row.dueDate)} · {profileName(row.profile)}</small></td><td>{money(row.amountCents)}</td><td><strong>{money(state?.reserved || 0)}</strong><div className="mg-progress"><span style={{ width: `${state?.percent || 0}%` }} /></div><small>{state?.percent || 0}% reservado</small></td><td>{state?.pending ? <span className="mg-warning">Pendente {money(state.pending)}</span> : state?.ahead ? <span className="mg-success">Adiantado {money(state.ahead)}</span> : 'Em dia'}<small>Sugestão hoje: {money(state?.suggested || 0)}</small></td><td>{money(state?.paid || 0)}<small>Falta quitar {money(state?.remaining || 0)}</small></td><td className="mg-actions"><button onClick={() => openOccurrence('reserve', row)}>Separar</button><button onClick={() => openOccurrence('pay', row)}>Pagar</button><button onClick={() => openOccurrence('edit', row)}>Editar</button><button onClick={() => runAction(() => setOccurrenceStatus(row.id!, 'cancelled'), 'Ocorrência cancelada.')}>Cancelar</button></td></tr>;
        })}
        {!openOccurrences.length && <tr><td colSpan={6}>Nenhuma ocorrência aberta.</td></tr>}
      </tbody></table></div>
      {openOccurrences.length > 20 && <div className="mg-pagination"><button disabled={occurrencePage === 1} onClick={() => setOccurrencePage(value => value - 1)}>Anterior</button><span>Página {occurrencePage} de {Math.ceil(openOccurrences.length / 20)}</span><button disabled={occurrencePage >= Math.ceil(openOccurrences.length / 20)} onClick={() => setOccurrencePage(value => value + 1)}>Próxima</button></div>}
      {visibleOccurrences.filter(row => row.status !== 'open').length > 0 && <details className="mg-card"><summary>Ocorrências canceladas ou arquivadas ({visibleOccurrences.filter(row => row.status !== 'open').length})</summary><div className="mg-list">{visibleOccurrences.filter(row => row.status !== 'open').map(row => <div key={row.id}>{row.name} · {formatDate(row.dueDate)} · {row.status === 'cancelled' ? 'Cancelada' : 'Arquivada'} <button className="mg-link" onClick={() => runAction(() => setOccurrenceStatus(row.id!, 'open'))}>Reabrir</button></div>)}</div></details>}
    </>}

    {section === 'funds' && <>
      <div className="mg-heading"><div><h2>Fundos e reservas livres</h2><p>O histórico permanece após movimentações e estornos.</p></div><button className="btn btn-primary" onClick={() => setFundForm({ name: '', profile: profile === 'todos' ? 'chaveiro' : profile, status: 'active', createdAt: new Date(), updatedAt: new Date() })}>Novo fundo</button></div>
      <div className="mg-grid">{visibleFunds.map(fund => {
        const balance = data.entries.filter(row => row.fundId === fund.id && row.kind.startsWith('fund-')).reduce((sum, row) => sum + row.amountCents, 0);
        return <div className="mg-card" key={fund.id}><div className="mg-heading"><h3>{fund.name}</h3><button className="mg-link" onClick={() => setFundForm({ ...fund })}>Editar</button></div><small>{profileName(fund.profile)} · {fund.status === 'active' ? 'Ativo' : 'Arquivado'}</small><strong className="mg-value">{money(balance)}</strong>{fund.targetCents !== undefined && <><div className="mg-progress"><span style={{ width: `${Math.min(100, Math.round(balance / Math.max(1, fund.targetCents) * 100))}%` }} /></div><small>Meta: {money(fund.targetCents)}</small></>}<div className="mg-actions">{(['deposit', 'withdraw', 'transfer'] as const).map(action => <button key={action} disabled={fund.status !== 'active'} onClick={() => { setFundDialog({ action, fund }); setAmount('0.00'); setSource('cash'); setNote(''); }}>{({ deposit: 'Depositar', withdraw: 'Retirar', transfer: 'Transferir' })[action]}</button>)}</div></div>;
      })}</div>{!visibleFunds.length && <div className="mg-card">Nenhum fundo cadastrado.</div>}
    </>}

    {section === 'withdrawals' && <>
      <div className="mg-heading"><div><h2>Retiradas e saldos informados</h2><p>Saldo disponível só aparece quando houver um saldo inicial identificado. Não inclui cartões ainda não liquidados.</p></div><div className="mg-actions"><button className="btn btn-primary" onClick={() => { setWithdrawalForm(true); setAmount('0.00'); setSource('cash'); }}>Nova retirada</button><button className="btn btn-outline" onClick={() => { setOpeningForm(true); setAmount('0.00'); setSource('cash'); }}>Informar saldo inicial</button></div></div>
      <div className="mg-card mg-table-wrap"><table className="mg-table"><thead><tr><th>Data</th><th>Perfil / Origem</th><th>Tipo</th><th>Beneficiário / Motivo</th><th>Valor</th><th></th></tr></thead><tbody>{visibleEntries.slice((entryPage - 1) * 20, entryPage * 20).map(row => <tr key={row.id}><td>{new Date(row.date).toLocaleString('pt-BR')}</td><td>{profileName(row.profile)}<small>{sourceNames[row.source]}</small></td><td>{entryNames[row.kind] || 'Movimentação'}{row.reversalOfId && <small>Estorno</small>}</td><td>{row.beneficiary || row.note || '—'}<small>{row.category || ''}</small></td><td>{money(row.amountCents)}</td><td>{!row.reversalOfId && <button className="mg-link" onClick={() => runAction(() => reverseEntry(row.id!), 'Estorno registrado no histórico.')}>Estornar</button>}</td></tr>)}{!visibleEntries.length && <tr><td colSpan={6}>Nenhuma movimentação gerencial.</td></tr>}</tbody></table></div>
      {visibleEntries.length > 20 && <div className="mg-pagination"><button disabled={entryPage === 1} onClick={() => setEntryPage(value => value - 1)}>Anterior</button><span>Página {entryPage} de {Math.ceil(visibleEntries.length / 20)}</span><button disabled={entryPage >= Math.ceil(visibleEntries.length / 20)} onClick={() => setEntryPage(value => value + 1)}>Próxima</button></div>}
    </>}

    {section === 'machines' && <>
      <div className="mg-heading"><div><h2>Maquininhas e tarifas</h2><p>As novas tarifas valem para novas vendas. Histórico legado não recebe identificação retroativa.</p></div><button className="btn btn-primary" onClick={() => setMachineForm({ name: '', ownerProfile: profile === 'todos' ? 'chaveiro' : profile, active: true, rates: [{ method: 'pix', configured: false }, { method: 'debit', configured: false }, { method: 'credit', configured: false }] })}>Cadastrar maquininha</button></div>
      <div className="mg-grid">{visibleMachineProfiles.map(owner => { const preferred = Number(data.settings.find(row => row.key === `defaultMachine:${owner}`)?.value); return <div className="mg-card" key={owner}><h3>Padrão · {profileName(owner)}</h3><select aria-label={`Maquininha padrão de ${profileName(owner)}`} value={preferred || ''} onChange={event => runAction(() => setDefaultMachine(owner, event.target.value ? Number(event.target.value) : undefined), 'Maquininha padrão atualizada.')}><option value="">Sem padrão</option>{data.machines.filter(row => row.ownerProfile === owner && row.active).map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></div>; })}</div>
      <div className="mg-grid">{visibleMachines.map(machine => <div className="mg-card" key={machine.id}><div className="mg-heading"><h3>{machine.name}</h3><button className="mg-link" onClick={() => setMachineForm({ ...machine })}>Editar</button></div><small>{profileName(machine.ownerProfile)} · {machine.brand || 'Marca não informada'} · {machine.alias || 'Sem apelido'} · {machine.active ? 'Ativa' : 'Inativa'}</small><div className="mg-list">{machine.rates.map(rate => <div key={rate.method}>{methodName[rate.method]}: {rate.configured ? `${rate.percent?.toFixed(2)}% + ${money(rate.fixedCents || 0)}` : 'Precisa configurar'}</div>)}</div>{machine.receiveDays !== undefined && <small>Prazo: {machine.receiveDays} dia(s)</small>}{machine.notes && <small>{machine.notes}</small>}{machine.active && <button className="mg-link" onClick={() => runAction(() => deactivateMachine(machine.id!), 'Maquininha desativada; histórico preservado.')}>Desativar</button>}</div>)}</div>
      <div className="mg-heading"><h3>Relatório de recebimentos por maquininha · {formatDate(start)} a {formatDate(end)}</h3><label>Equipamento<select value={machineFilter} onChange={event=>setMachineFilter(event.target.value)}><option value="">Todas</option>{data.machines.map(machine=><option key={machine.id} value={machine.id}>{machine.name} · {profileName(machine.ownerProfile)}</option>)}</select></label></div>
      <div className="mg-card mg-table-wrap"><table className="mg-table"><thead><tr><th>Equipamento</th><th>Perfil do equipamento</th><th>Perfil financeiro da venda</th><th>Modalidade</th><th>Pagamentos</th><th>Bruto</th><th>Tarifas</th><th>Taxa efetiva</th><th>Líquido previsto</th></tr></thead><tbody>{machineReportRows.map(row => <tr key={row.key}><td>{row.name}</td><td>{row.owner}</td><td>{row.seller}</td><td>{row.method}</td><td>{row.count}</td><td>{money(row.gross)}</td><td>{money(row.fee)}</td><td>{row.gross ? `${(row.fee/row.gross*100).toFixed(2)}%` : "—"}</td><td>{money(row.gross-row.fee)}</td></tr>)}{!machineReportRows.length && <tr><td colSpan={9}>Nenhum recebimento por maquininha no período.</td></tr>}</tbody></table><p className="mg-hint">O líquido é uma estimativa calculada pelo valor bruto e pelas tarifas registradas. Não há conciliação bancária automática nem valor de liquidação importado.</p></div>
      {machineForm && <ReportModal title={machineForm.id ? 'Editar maquininha' : 'Cadastrar maquininha'} onClose={() => setMachineForm(null)}><form className="mg-form" onSubmit={async event => { event.preventDefault(); const id=machineForm.id; const {id:_id,...form}=machineForm; void _id; if(await runAction(()=>saveMachine(form,id),'Maquininha salva.')) setMachineForm(null); }}>
        <label>Nome<input required value={machineForm.name} onChange={e=>setMachineForm({...machineForm,name:e.target.value})}/></label><label>Marca<input value={machineForm.brand||''} onChange={e=>setMachineForm({...machineForm,brand:e.target.value})}/></label><label>Apelido/identificação<input value={machineForm.alias||''} onChange={e=>setMachineForm({...machineForm,alias:e.target.value})}/></label><label>Perfil proprietário<select value={machineForm.ownerProfile} onChange={e=>setMachineForm({...machineForm,ownerProfile:e.target.value as Profile})}>{PROFILES.map(row=><option key={row} value={row}>{profileName(row)}</option>)}</select></label>
        {[...(["pix","debit"] as const).map(method=>({method,installment:1})),...Array.from({length:12},(_,index)=>({method:"credit" as const,installment:index+1}))].map(({method,installment})=>{const rate=machineForm.rates.find(row=>row.method===method&&(row.installment||1)===installment)||{method,installment:installment===1?undefined:installment,configured:false};const label=method==="credit"?`Crédito · ${installment===1?"à vista":`${installment}x`}`:methodName[method];return <div className="mg-card mg-full" key={`${method}:${installment}`}><label className="mg-check"><input type="checkbox" checked={rate.configured} onChange={event=>setMachineForm({...machineForm,rates:[...machineForm.rates.filter(row=>!(row.method===method&&(row.installment||1)===installment)),{...rate,configured:event.target.checked}]})}/>{label} configurado</label>{rate.configured&&<div className="mg-form"><label>Taxa (%)<input type="number" min="0" step="0.01" value={rate.percent??""} onChange={event=>setMachineRate(machineForm,setMachineForm,method,{percent:Number(event.target.value)},installment)}/></label><label>Tarifa fixa (R$)<input type="number" min="0" step="0.01" value={((rate.fixedCents||0)/100).toFixed(2)} onChange={event=>setMachineRate(machineForm,setMachineForm,method,{fixedCents:inputCents(event.target.value)},installment)}/></label></div>}</div>;})}
        <label>Prazo de recebimento (dias)<input type="number" min="0" value={machineForm.receiveDays??''} onChange={e=>setMachineForm({...machineForm,receiveDays:e.target.value===''?undefined:Number(e.target.value)})}/></label><label className="mg-check"><input type="checkbox" checked={machineForm.active} onChange={e=>setMachineForm({...machineForm,active:e.target.checked})}/>Ativa</label><label className="mg-full">Observações<textarea value={machineForm.notes||''} onChange={e=>setMachineForm({...machineForm,notes:e.target.value})}/></label><div className="mg-full mg-actions"><button className="btn btn-primary">Salvar</button></div></form></ReportModal>}
    </>}

    {accountForm && <ReportModal title={accountForm.id ? 'Editar conta' : 'Nova conta'} onClose={() => setAccountForm(null)} wide><form className="mg-form" onSubmit={submitAccount}>
      <label>Nome<input required value={accountForm.name} onChange={e => setAccountForm({ ...accountForm, name: e.target.value })} /></label>
      <label>Descrição<input value={accountForm.description || ''} onChange={e => setAccountForm({ ...accountForm, description: e.target.value })} /></label>
      <label>Categoria<select value={accountForm.category} onChange={e => setAccountForm({ ...accountForm, category: e.target.value })}>{categoryOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label>Perfil<select value={accountForm.profile} onChange={e => setAccountForm({ ...accountForm, profile: e.target.value as Profile })}>{PROFILES.map(row => <option key={row} value={row}>{profileName(row)}</option>)}</select></label>
      <label>Valor (R$)<input type="number" min="0" step="0.01" defaultValue={centsInput(accountForm.amountCents)} onChange={e => setAccountForm({ ...accountForm, amountCents: inputCents(e.target.value) })} /></label>
      <label className="mg-check"><input type="checkbox" checked={accountForm.variable} onChange={e => setAccountForm({ ...accountForm, variable: e.target.checked })} /> Valor variável</label>
      <label>Data inicial<input type="date" value={accountForm.startDate} onChange={e => setAccountForm({ ...accountForm, startDate: e.target.value })} /></label>
      <label>Primeiro vencimento<input type="date" value={accountForm.firstDueDate} onChange={e => setAccountForm({ ...accountForm, firstDueDate: e.target.value })} /></label>
      <label>Recorrência<select value={accountForm.recurrence} onChange={e => setAccountForm({ ...accountForm, recurrence: e.target.value as AccountPlan['recurrence'] })}><option value="once">Avulsa</option><option value="weekly">Semanal</option><option value="monthly">Mensal</option><option value="annual">Anual</option><option value="custom">Personalizada</option></select></label>
      {accountForm.recurrence === 'custom' && <label>Intervalo em dias<input type="number" min="1" value={accountForm.intervalDays || 1} onChange={e => setAccountForm({ ...accountForm, intervalDays: Number(e.target.value) })} /></label>}
      <label className="mg-check"><input type="checkbox" checked={accountForm.provisionEnabled} onChange={e => setAccountForm({ ...accountForm, provisionEnabled: e.target.checked })} /> Provisionamento diário</label>
      {accountForm.provisionEnabled && <><label>Dias considerados<input type="number" min="1" value={accountForm.provisionDays} onChange={e => setAccountForm({ ...accountForm, provisionDays: Number(e.target.value) })} /></label><label>Sugestão<select value={accountForm.provisionMode} onChange={e => setAccountForm({ ...accountForm, provisionMode: e.target.value as AccountPlan['provisionMode'] })}><option value="fixed">Valor diário fixo</option><option value="recalculate">Recalcular pelo restante</option></select></label><div className="mg-full"><strong>Dias de funcionamento</strong><div className="mg-weekdays">{['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((label, day) => <label key={day} className="mg-check"><input type="checkbox" checked={accountForm.workingDays.includes(day)} onChange={e => setAccountForm({ ...accountForm, workingDays: e.target.checked ? [...accountForm.workingDays, day] : accountForm.workingDays.filter(value => value !== day) })} /> {label}</label>)}</div></div><label>Folgas/feriados (AAAA-MM-DD, separados por vírgula)<input value={accountForm.excludedDates.join(', ')} onChange={e => setAccountForm({ ...accountForm, excludedDates: e.target.value.split(',').map(value => value.trim()).filter(Boolean) })} /></label><label>Dias excepcionais abertos<input value={accountForm.includedDates.join(', ')} onChange={e => setAccountForm({ ...accountForm, includedDates: e.target.value.split(',').map(value => value.trim()).filter(Boolean) })} /></label></>}
      <label>Avisar quantos dias antes<input type="number" min="0" value={accountForm.noticeDays} onChange={e => setAccountForm({ ...accountForm, noticeDays: Number(e.target.value) })} /></label>
      <label>Fornecedor ou beneficiário<input value={accountForm.beneficiary || ''} onChange={e => setAccountForm({ ...accountForm, beneficiary: e.target.value })} /></label>
      <label>Situação<select value={accountForm.status} onChange={e => setAccountForm({ ...accountForm, status: e.target.value as AccountPlan['status'] })}><option value="active">Ativa</option><option value="inactive">Inativa</option><option value="archived">Arquivada</option></select></label>
      <label className="mg-full">Observações<textarea value={accountForm.notes || ''} onChange={e => setAccountForm({ ...accountForm, notes: e.target.value })} /></label>
      {accountForm.id && <p className="mg-full mg-hint">Mudanças no cadastro valem para novas ocorrências. Para alterar um vencimento já gerado, use Editar na ocorrência e escolha o alcance.</p>}
      <div className="mg-full mg-actions"><button type="submit" className="btn btn-primary">Salvar conta</button></div>
    </form></ReportModal>}

    {occurrenceDialog && selectedStatus && <ReportModal title={({ reserve: 'Separar para a conta', pay: 'Registrar pagamento', edit: 'Editar ocorrência' })[occurrenceDialog.mode]} subtitle={`${occurrenceDialog.occurrence.name} · vence ${formatDate(occurrenceDialog.occurrence.dueDate)}`} onClose={() => setOccurrenceDialog(null)}><form className="mg-form" onSubmit={submitOccurrence}>
      <div className="mg-full mg-card"><strong>Valor da conta: {money(occurrenceDialog.occurrence.amountCents)}</strong><small>Reservado {money(selectedStatus.reserved)} · Pago {money(selectedStatus.paid)} · Falta quitar {money(selectedStatus.remaining)}</small></div>
      <label>Valor (R$)<input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} /></label>
      {occurrenceDialog.mode === 'edit' ? <><label>Novo vencimento<input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} /></label><label className="mg-full mg-check"><input type="checkbox" checked={future} onChange={e => setFuture(e.target.checked)} /> Aplicar também às ocorrências futuras ainda não pagas</label></> : <><label>Origem<select value={source} onChange={e => setSource(e.target.value as MoneySource)}>{Object.entries(sourceNames).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>{occurrenceDialog.mode === 'reserve' ? <><label>Destino para eventual excedente<select value={overflowFundId} onChange={e => setOverflowFundId(e.target.value)}><option value="">Não permitir excedente</option>{data.funds.filter(row => row.profile === occurrenceDialog.occurrence.profile && row.status === 'active').map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label><label className="mg-full">Observação<input value={note} onChange={e => setNote(e.target.value)} /></label><p className="mg-full mg-hint">Sugestão hoje: {money(selectedStatus.suggested)} · Pendente do planejamento: {money(selectedStatus.pending)}. Você pode separar qualquer valor.</p></> : <><label>Usar da reserva (R$)<input type="number" min="0" step="0.01" value={reserveUsed} onChange={e => setReserveUsed(e.target.value)} /></label><label>Vincular despesa já registrada (opcional)<select value={linkedExpenseId} onChange={e => setLinkedExpenseId(e.target.value)}><option value="">Novo pagamento gerencial</option>{data.transactions.filter(row => row.type === 'expense' && row.profile === occurrenceDialog.occurrence.profile).slice(-100).reverse().map(row => <option key={row.id} value={row.id}>{new Date(row.date).toLocaleDateString('pt-BR')} · {row.items[0]?.name || 'Despesa'} · R$ {row.total.toFixed(2)}</option>)}</select></label><p className="mg-full mg-hint">A reserva não quita a conta. O pagamento registra a saída uma única vez; vincular uma despesa existente evita duplicidade no lucro gerencial.</p></>}</>}
      <div className="mg-full mg-actions"><button type="submit" className="btn btn-primary">Confirmar</button></div>
    </form></ReportModal>}

    {fundForm && <ReportModal title={fundForm.id ? 'Editar fundo' : 'Novo fundo'} onClose={() => setFundForm(null)}><form className="mg-form" onSubmit={submitFund}><label>Nome<input required value={fundForm.name} onChange={e => setFundForm({ ...fundForm, name: e.target.value })} /></label><label>Perfil<select value={fundForm.profile} onChange={e => setFundForm({ ...fundForm, profile: e.target.value as Profile })}>{PROFILES.map(row => <option key={row} value={row}>{profileName(row)}</option>)}</select></label><label>Meta (R$)<input type="number" min="0" step="0.01" defaultValue={fundForm.targetCents === undefined ? '' : centsInput(fundForm.targetCents)} onChange={e => setFundForm({ ...fundForm, targetCents: e.target.value ? inputCents(e.target.value) : undefined })} /></label><label>Sugestão diária (R$)<input type="number" min="0" step="0.01" defaultValue={fundForm.dailySuggestedCents === undefined ? '' : centsInput(fundForm.dailySuggestedCents)} onChange={e => setFundForm({ ...fundForm, dailySuggestedCents: e.target.value ? inputCents(e.target.value) : undefined })} /></label><label>Situação<select value={fundForm.status} onChange={e => setFundForm({ ...fundForm, status: e.target.value as ManagementFund['status'] })}><option value="active">Ativo</option><option value="archived">Arquivado</option></select></label><label className="mg-full">Descrição<textarea value={fundForm.description || ''} onChange={e => setFundForm({ ...fundForm, description: e.target.value })} /></label><div className="mg-full mg-actions"><button className="btn btn-primary">Salvar fundo</button></div></form></ReportModal>}

    {fundDialog && <ReportModal title={({ deposit: 'Depositar no fundo', withdraw: 'Retirar do fundo', transfer: 'Transferir entre fundos' })[fundDialog.action]} subtitle={fundDialog.fund.name} onClose={() => setFundDialog(null)}><form className="mg-form" onSubmit={submitFundMovement}><label>Valor (R$)<input type="number" min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} /></label><label>Origem financeira<select value={source} onChange={e => setSource(e.target.value as MoneySource)}>{Object.entries(sourceNames).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>{fundDialog.action === 'transfer' && <label className="mg-full">Fundo de destino<select required value={fundDestination} onChange={e => setFundDestination(e.target.value)}><option value="">Selecione</option>{data.funds.filter(row => row.id !== fundDialog.fund.id && row.status === 'active').map(row => <option key={row.id} value={row.id}>{row.name} · {profileName(row.profile)}</option>)}</select></label>}<label className="mg-full">{fundDialog.action === 'deposit' ? 'Observação' : 'Destino ou motivo'}<input required={fundDialog.action !== 'deposit'} value={note} onChange={e => setNote(e.target.value)} /></label><div className="mg-full mg-actions"><button className="btn btn-primary">Confirmar</button></div></form></ReportModal>}

    {(withdrawalForm || openingForm) && <ReportModal title={openingForm ? 'Informar saldo inicial' : 'Registrar retirada'} onClose={() => { setWithdrawalForm(false); setOpeningForm(false); }}><form className="mg-form" onSubmit={async event => { event.preventDefault(); const selectedProfile = (event.currentTarget.elements.namedItem('profile') as HTMLSelectElement).value as Profile; const success = await runAction(() => openingForm ? recordOpeningBalance(selectedProfile, inputCents(amount), source, note) : recordWithdrawal(selectedProfile, inputCents(amount), source, beneficiary, withdrawalCategory, note, new Date(`${withdrawalDate}T12:00:00`))); if (success) { setWithdrawalForm(false); setOpeningForm(false); setNote(''); } }}><label>Perfil<select name="profile" defaultValue={profile === 'todos' ? 'chaveiro' : profile}>{PROFILES.map(row => <option key={row} value={row}>{profileName(row)}</option>)}</select></label><label>Origem<select value={source} onChange={e => setSource(e.target.value as MoneySource)}>{Object.entries(sourceNames).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>Valor (R$)<input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} /></label>{!openingForm && <><label>Data da retirada<input required type="date" value={withdrawalDate} onChange={e => setWithdrawalDate(e.target.value)} /></label><label>Beneficiário<input required value={beneficiary} onChange={e => setBeneficiary(e.target.value)} /></label><label>Categoria<select value={withdrawalCategory} onChange={e => setWithdrawalCategory(e.target.value)}><option value="retirada_pessoal">Retirada pessoal</option><option value="distribuicao_lucro">Distribuição de lucro</option><option value="proprietario">Pagamento a proprietário</option><option value="transferencia">Transferência</option><option value="despesa_operacional">Despesa operacional</option><option value="aquisicao">Parcela de aquisição</option><option value="outros">Outros</option></select></label></>}<label className="mg-full">Motivo ou observação<input value={note} onChange={e => setNote(e.target.value)} /></label><p className="mg-full mg-hint">{openingForm ? 'O saldo informado terá data e histórico. Não é calculado automaticamente a partir de períodos anteriores.' : 'Retirada pessoal não é lançada automaticamente como despesa operacional.'}</p><div className="mg-full mg-actions"><button className="btn btn-primary">Registrar</button></div></form></ReportModal>}
  </div>;
}
