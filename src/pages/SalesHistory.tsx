import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, PROFILES, type Transaction, type Profile, type PaymentMethod, type TransactionItem } from '../db/db';
import { format, startOfDay, endOfDay, startOfMonth, endOfMonth, startOfYear, endOfYear, subDays } from 'date-fns';
import { Calendar, Printer, Undo2, Trash2, Search, Filter, Edit2, X, Plus, Receipt } from 'lucide-react';
import { deleteTransactionSafely, linkedReturnsFor, remainingQuantities, prepareReturn, returnSaleItems } from '../db/saleReturns';
import { ReportModal } from '../components/ReportModal';
import { projectSalesHistoryRows } from './salesHistoryData';

export const SalesHistory = () => {
  const [dateRange, setDateRange] = useState<'today' | 'week' | 'month' | 'year' | 'custom'>('today');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [viewProfile, setViewProfile] = useState<Profile | 'todos'>('chaveiro');
  const [searchTerm, setSearchTerm] = useState('');
  
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [fullTransaction, setFullTransaction] = useState<Transaction | null>(null);
  const [showFullTransaction, setShowFullTransaction] = useState(false);
  const [returningSale, setReturningSale] = useState<Transaction | null>(null);
  const [priorReturns, setPriorReturns] = useState<Transaction[]>([]);
  const [returnQuantities, setReturnQuantities] = useState<number[]>([]);
  const [returnPaymentMethod, setReturnPaymentMethod] = useState<PaymentMethod>('cash');
  const [returnCashProfile, setReturnCashProfile] = useState<Profile>('chaveiro');

  const getDates = () => {
    const now = new Date();
    switch (dateRange) {
      case 'today': return { start: startOfDay(now), end: endOfDay(now) };
      case 'week': return { start: startOfDay(subDays(now, 7)), end: endOfDay(now) };
      case 'month': return { start: startOfMonth(now), end: endOfMonth(now) };
      case 'year': return { start: startOfYear(now), end: endOfYear(now) };
      case 'custom': 
        return { 
          start: customStart ? startOfDay(new Date(customStart + 'T00:00:00')) : startOfDay(now), 
          end: customEnd ? endOfDay(new Date(customEnd + 'T23:59:59')) : endOfDay(now) 
        };
      default: return { start: startOfDay(now), end: endOfDay(now) };
    }
  };

  const { start, end } = getDates();

  const physicalTransactions = useLiveQuery(
    () => db.transactions.where('date').between(start, end).reverse().toArray(),
    [start, end]
  );
  const transactions = useMemo(
    () => physicalTransactions ? projectSalesHistoryRows(physicalTransactions, viewProfile, searchTerm) : undefined,
    [physicalTransactions, viewProfile, searchTerm]
  );

  const toggleFullTransaction = async () => {
    if (showFullTransaction) {
      setShowFullTransaction(false);
      return;
    }
    if (!selectedTx?.id) return;
    const original = await db.transactions.get(selectedTx.id);
    if (!original) return;
    setFullTransaction(original);
    setShowFullTransaction(true);
  };
  const detailTx = showFullTransaction ? fullTransaction || selectedTx : selectedTx;
  const closeSelectedTransaction = () => {
    setSelectedTx(null);
    setFullTransaction(null);
    setShowFullTransaction(false);
  };

  const handleDelete = async (id?: number) => {
    if (!id) return;
    if (window.confirm('Tem certeza que deseja EXCLUIR permanentemente esta transação? Isso afetará os relatórios e o caixa não fechará corretamente se já tiver sido contabilizado. (O estoque será restaurado)')) {
      try {
        await deleteTransactionSafely(id);
        alert('Transação excluída e estoque restaurado (se aplicável).');
      } catch (err) {
        console.error(err);
        alert(err instanceof Error ? err.message : 'Erro ao excluir transação.');
      }
    }
  };

  const handleReturn = async (sale: Transaction) => {
    if (!sale.id) return;
    const returns = await linkedReturnsFor(sale.id);
    const remaining = remainingQuantities(sale, returns);
    if (remaining.every(quantity => quantity <= 0)) return alert('Esta venda já foi devolvida integralmente.');
    setPriorReturns(returns);
    setReturnQuantities(remaining);
    setReturnPaymentMethod('cash');
    setReturnCashProfile(sale.profile);
    setReturningSale(sale);
  };

  const submitReturn = async () => {
    if (!returningSale?.id) return;
    try {
      await returnSaleItems(returningSale.id, returnQuantities, returnPaymentMethod, returnCashProfile);
      setReturningSale(null);
      alert('Devolução registrada e estoque reposto conforme os itens selecionados.');
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Erro ao registrar devolução.');
    }
  };

  const returnable = returningSale ? remainingQuantities(returningSale, priorReturns) : [];
  const refundPreview = returningSale ? (() => { try { return prepareReturn(returningSale, priorReturns, returnQuantities).total; } catch { return 0; } })() : 0;

  const printReceipt = (t: Transaction) => {
    const printWindow = window.open('', '_blank', 'width=400,height=600');
    if (!printWindow) return alert('Erro ao abrir janela de impressão.');

    const dateStr = format(t.date, 'dd/MM/yyyy HH:mm');
    const operatorName = t.profile === 'chaveiro' ? 'CHAVEIRO' : 'FABIANO';
    
    let typeTitle = 'Cupom Não Fiscal';
    if (t.type === 'return') typeTitle = 'Comprovante de Devolução';
    else if (t.type === 'expense') typeTitle = 'Recibo de Despesa';

    const getPaymentMethodName = (m: string) => {
      if (m === 'cash') return 'Dinheiro';
      if (m === 'pix') return 'Pix';
      if (m === 'credit') return 'Crédito';
      if (m === 'debit') return 'Débito';
      if (m === 'split') return 'Múltiplo';
      return m;
    };

    const originalSubtotal = t.items.reduce((sum, i) => sum + (i.price * i.quantity), 0);

    const html = `
      <html>
      <head>
        <title>${typeTitle}</title>
        <style>
          @page { margin: 10mm 2mm; }
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 12px; width: 76mm; margin: 0 auto; padding: 0; color: black; }
          .text-center { text-align: center; }
          .text-left { text-align: left; }
          .text-right { text-align: right; }
          .bold { font-weight: bold; }
          .divider { border-bottom: 1px dashed #000; margin: 5px 0; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th, td { padding: 2px 0; }
          .header-title { font-size: 18px; font-weight: 900; margin-bottom: 5px; line-height: 1.2; text-transform: uppercase; }
        </style>
      </head>
      <body>
        <div class="text-left" style="font-size: 10px; margin-left: 5px;">.</div>
        <div class="text-left" style="font-size: 10px; margin-left: 5px;">.</div>
        <div class="text-left" style="font-size: 10px; margin-left: 5px;">.</div>
        <div class="text-left" style="font-size: 10px; margin-left: 5px;">.</div>
        <div class="text-left" style="font-size: 10px; margin-left: 5px;">.</div>
        ${t.type !== 'sale' ? `<div class="text-center header-title">${typeTitle.toUpperCase()}</div><div class="divider"></div>` : ''}
        <div class="text-center header-title">Chaveiro & Cutelaria<br>do Lidio e Fabiano</div>
        <div class="text-center bold" style="font-size: 12px; margin-top: 5px;">Rua Cardoso de Morais, Frente ao 202</div>
        <div class="text-center bold" style="font-size: 12px;">Bonsucesso - RJ (Frente ao Caçula)</div>
        <div class="text-center bold" style="font-size: 13px; margin-top: 2px; margin-bottom: 5px;">Tel: (21) 96738-5841 (WhatsApp)</div>
        <div class="text-center" style="font-size: 11px;">Data: ${dateStr}</div>
        ${(t.clientName || t.clientCode) ? `<div class="divider"></div><div class="bold">Cliente: ${t.clientName || t.clientCode}</div>` : ''}
        <div class="divider"></div>
        <table>
          <thead>
            <tr>
              <th class="text-left" style="width: 15%">Qtd</th>
              <th class="text-left" style="width: 60%">Item</th>
              <th class="text-right" style="width: 25%">Total</th>
            </tr>
          </thead>
          <tbody>
            ${t.items.map(i => {
              const itemTotal = i.price * i.quantity;
              return `
                <tr>
                  <td class="text-left" valign="top">${i.quantity}x</td>
                  <td class="text-left" valign="top">
                    <strong>${i.name}</strong><br>
                    <span style="font-size: 10px; color: #000;">Vlr. Unit: R$ ${i.price.toFixed(2).replace('.', ',')}</span>
                  </td>
                  <td class="text-right" valign="top">R$ ${itemTotal.toFixed(2).replace('.', ',')}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
        <div class="divider"></div>
        <table>
          <tr><td class="bold">Subtotal Bruto:</td><td class="text-right">R$ ${originalSubtotal.toFixed(2).replace('.', ',')}</td></tr>
          ${t.discount && t.discount > 0 ? `<tr><td class="bold">Desconto Extra:</td><td class="text-right">-R$ ${t.discount.toFixed(2).replace('.', ',')}</td></tr>` : ''}
          <tr><td class="bold header-title">TOTAL A PAGAR:</td><td class="text-right header-title">R$ ${t.total.toFixed(2).replace('.', ',')}</td></tr>
          ${t.paymentMethod === 'split' && t.splitPayments ? `
            <tr><td colspan="2" class="bold text-center" style="padding-top: 5px;">PAGAMENTO MÚLTIPLO</td></tr>
            ${t.splitPayments.map(p => `<tr><td>Parcial (${getPaymentMethodName(p.method)}):</td><td class="text-right">R$ ${p.amount.toFixed(2).replace('.', ',')}</td></tr>`).join('')}
          ` : `<tr><td class="bold">Forma de Pagto:</td><td class="text-right bold uppercase">${getPaymentMethodName(t.paymentMethod)}</td></tr>`}
        </table>
        <div class="divider"></div>
        <div class="text-center" style="margin-bottom: 10px; font-weight: bold; font-size: 13px;">Obrigado pela preferência!</div>
        <div class="text-left" style="font-size: 10px; margin-left: 5px;">.</div>
        <div class="text-left" style="font-size: 10px; margin-left: 5px;">.</div>
        <div class="text-left" style="font-size: 10px; margin-left: 5px;">.</div>
        <div class="text-left" style="font-size: 10px; margin-left: 5px;">.</div>
        <div class="text-left" style="font-size: 10px; margin-left: 5px;">.</div>
        <div class="text-left" style="font-size: 10px; margin-left: 5px;">.</div>
        <div class="text-left" style="font-size: 10px; margin-left: 5px;">.</div>
        <div class="text-left" style="font-size: 10px; margin-left: 5px;">.</div>
      </body>
      </html>
    `;

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '300px';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    document.body.appendChild(iframe);
    iframe.contentDocument!.write(html);
    iframe.contentDocument!.close();
    
    setTimeout(() => {
      iframe.contentWindow!.print();
      setTimeout(() => document.body.removeChild(iframe), 2000);
    }, 500);
  };

  const handleSaveEdit = async () => {
    if (!editingTx || !editingTx.id) return;
    try {
      // Recalculate totals
      const subtotal = editingTx.items.reduce((sum, i) => sum + (i.price * i.quantity), 0);
      const total = subtotal - (editingTx.discount || 0);
      if (total < 0) throw new Error('O desconto não pode superar o valor dos itens.');
      if (editingTx.paymentMethod === 'split' && Math.round((editingTx.splitPayments || []).reduce((sum, payment) => sum + payment.amount, 0) * 100) !== Math.round(total * 100)) {
        throw new Error('O total dos pagamentos mistos deve corresponder ao total da venda.');
      }
      
      const updatedItems = editingTx.items.map(i => ({
        ...i,
        total: i.price * i.quantity
      }));

      let calculatedFee = editingTx.paymentMethod === 'split' ? (editingTx.machineFee || 0) : 0;
      if (editingTx.profile === 'chaveiro') {
        if (editingTx.paymentMethod === 'debit') calculatedFee = total * 0.0199;
        else if (editingTx.paymentMethod === 'credit') calculatedFee = total * 0.0498;
      } else if (editingTx.profile === 'fabiano') {
        if (editingTx.paymentMethod === 'pix') calculatedFee = total * 0.0045;
        else if (editingTx.paymentMethod === 'debit') calculatedFee = total * 0.0198;
        else if (editingTx.paymentMethod === 'credit') calculatedFee = total * 0.0486;
      }

      await db.transaction('rw', db.transactions, db.products, async () => {
        const original = await db.transactions.get(editingTx.id!);
        if (!original) throw new Error('Transação original não encontrada.');
        if (original.type === 'sale' && (await linkedReturnsFor(original.id!)).length) {
          const financialChange = total !== original.total || editingTx.profile !== original.profile || editingTx.paymentMethod !== original.paymentMethod || JSON.stringify(updatedItems) !== JSON.stringify(original.items);
          if (financialChange) throw new Error('Venda com devolução vinculada: edite apenas o nome do cliente.');
        }
        if (original.type === 'sale') {
          const oldQty = new Map<number, number>();
          const newQty = new Map<number, number>();
          for (const item of original.items) if (item.productId) oldQty.set(item.productId, (oldQty.get(item.productId) || 0) + item.quantity);
          for (const item of updatedItems) if (item.productId) newQty.set(item.productId, (newQty.get(item.productId) || 0) + item.quantity);
          for (const productId of new Set([...oldQty.keys(), ...newQty.keys()])) {
            const difference = (newQty.get(productId) || 0) - (oldQty.get(productId) || 0);
            if (!difference) continue;
            const product = await db.products.get(productId);
            if (product?.hasStock) await db.products.update(productId, { stock: product.stock - difference });
          }
        }
        await db.transactions.update(editingTx.id!, {
          profile: editingTx.profile,
          paymentMethod: editingTx.paymentMethod,
          clientName: editingTx.clientName ? editingTx.clientName.trim() : undefined,
          discount: editingTx.discount || 0,
          machineFee: calculatedFee > 0 ? calculatedFee : undefined,
          items: updatedItems,
          total
        });
      });
      alert('Transação atualizada com sucesso!');
      setEditingTx(null);
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : 'Erro ao atualizar transação.');
    }
  };

  return (
    <>
      <div className="flex flex-col h-full animate-fade-in">
        <div className="page-header flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Histórico de Transações</h1>
          <p className="text-muted">Consulte, imprima recibos, devolva ou exclua transações do sistema.</p>
        </div>
      </div>

      <div className="glass-panel p-6 mb-6">
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2"><Filter size={20}/> Filtros e Buscas</h2>
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="label">Busca rápida</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={18} />
              <input 
                type="text" 
                className="input pl-10 w-[250px]" 
                placeholder="Buscar por item, pagamento..." 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="label">Operador</label>
            <select className="input min-w-[150px]" value={viewProfile} onChange={e => setViewProfile(e.target.value as any)}>
              <option value="todos">Todos</option>
              <option value="chaveiro">Chaveiro</option>
              <option value="fabiano">Fabiano</option>
            </select>
          </div>
          <div>
            <label className="label">Período</label>
            <select className="input min-w-[150px]" value={dateRange} onChange={e => setDateRange(e.target.value as any)}>
              <option value="today">Hoje</option>
              <option value="week">Semana (7 dias)</option>
              <option value="month">Este Mês</option>
              <option value="year">Este Ano</option>
              <option value="custom">Personalizado</option>
            </select>
          </div>

          {dateRange === 'custom' && (
            <>
              <div>
                <label className="label">Data Inicial</label>
                <input type="date" className="input" value={customStart} onChange={e => setCustomStart(e.target.value)} />
              </div>
              <div>
                <label className="label">Data Final</label>
                <input type="date" className="input" value={customEnd} onChange={e => setCustomEnd(e.target.value)} />
              </div>
            </>
          )}
        </div>
      </div>

      <div className="glass-panel flex-1 overflow-hidden flex flex-col">
        <div className="p-4 border-b border-[var(--border)] flex justify-between items-center">
          <h2 className="font-bold">Lista de Transações ({transactions?.length || 0})</h2>
        </div>
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-[var(--bg-surface)]" style={{ position: 'sticky', top: 0, zIndex: 10 }}>
              <tr className="text-muted text-sm" style={{ borderBottom: '1px solid var(--border)' }}>
                <th className="font-medium" style={{ padding: '12px 8px', width: '120px' }}>Data/Hora</th>
                <th className="font-medium" style={{ padding: '12px 8px', width: '105px' }}>Caixa / destino</th>
                <th className="font-medium" style={{ padding: '12px 8px', width: '80px' }}>Tipo</th>
                <th className="font-medium" style={{ padding: '12px 8px' }}>Descrição / Itens</th>
                <th className="font-medium" style={{ padding: '12px 8px', width: '130px' }}>Cliente</th>
                <th className="font-medium" style={{ padding: '12px 8px', width: '100px' }}>Pgto</th>
                <th className="font-medium text-right" style={{ padding: '12px 8px', width: '110px' }}>Valor Total</th>
                <th className="font-medium text-center" style={{ padding: '12px 8px', width: '180px' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {transactions?.map((t) => {
                const isSale = t.type === 'sale';
                const isExpense = t.type === 'expense';
                const isReturn = t.type === 'return';
                
                return (
                  <tr 
                    key={t.id} 
                    className="table-row-hover" 
                    style={{ borderBottom: '1px solid var(--border)' }}
                    onClick={() => { setSelectedTx(t); setFullTransaction(null); setShowFullTransaction(false); }}
                    title="Clique para ver detalhes desta transação"
                  >
                    <td className="text-sm whitespace-nowrap" style={{ padding: '12px 8px' }}>{format(t.date, 'dd/MM/yyyy HH:mm')}</td>
                    <td className="text-sm font-bold uppercase" style={{ padding: '12px 8px', color: t.profile === 'chaveiro' ? '#ef4444' : '#3b82f6' }}>
                      {t.cashProfile || t.profile}{t.cashProfile && <small style={{ display: 'block', color: '#cbd5e1', fontSize: '11px' }}>→ {t.profile}</small>}
                    </td>
                    <td style={{ padding: '12px 8px' }}>
                      <span className={`px-2 py-1 rounded text-xs font-bold ${
                        isSale ? 'bg-success/20 text-success' : 
                        isExpense ? 'bg-warning/20 text-warning' : 
                        'bg-danger/20 text-danger'
                      }`}>
                        {isSale ? (() => {
                          const hasPhysicalProduct = t.items.some(item => {
                            if (item.isService !== undefined) return !item.isService;
                            if (item.service === 'key') return false;
                            if (item.service === 'plier' && (item.productId === 1 || item.name.toLowerCase().includes('afia'))) return false;
                            if (item.service === 'other' && item.name.toLowerCase().includes('serviço')) return false;
                            return true; 
                          });
                          return t.profile === 'chaveiro' ? 'Serviço' : (hasPhysicalProduct ? 'Venda' : 'Serviço');
                        })() : isExpense ? 'Despesa' : 'Devolução'}
                      </span>
                    </td>
                    <td className="text-sm" style={{ padding: '12px 8px' }}>
                      <div className="truncate" style={{ maxWidth: '200px' }} title={t.items.map(i => `${i.quantity}x ${i.name}`).join(', ')}>
                        {t.items.map(i => `${i.quantity}x ${i.name}`).join(', ')}
                      </div>
                    </td>
                    <td className="text-sm font-semibold" style={{ padding: '12px 8px' }}>
                      {t.clientName ? (
                        <span className="text-primary font-bold">{t.clientName}</span>
                      ) : (
                        <span className="text-muted font-normal">-</span>
                      )}
                    </td>
                    <td className="text-sm font-bold uppercase text-muted" style={{ padding: '12px 8px' }}>
                      {t.paymentMethod === 'cash' ? 'Dinheiro' : 
                       t.paymentMethod === 'credit' ? 'Crédito' : 
                       t.paymentMethod === 'debit' ? 'Débito' : 
                       t.paymentMethod === 'pix' ? 'Pix' : 
                       t.paymentMethod === 'split' ? 'Múltiplo' : t.paymentMethod}
                    </td>
                    <td className={`text-right font-bold whitespace-nowrap ${isSale ? 'text-success' : 'text-danger'}`} style={{ padding: '12px 8px' }}>
                      {isSale ? '+' : '-'} R$ {t.total.toFixed(2).replace('.', ',')}
                    </td>
                    <td className="text-center whitespace-nowrap" style={{ padding: '12px 8px' }}>
                      <div onClick={e => e.stopPropagation()}>
                        <button 
                          className="p-2 text-primary hover:bg-primary/20 rounded transition-colors cursor-pointer" 
                          style={{ margin: '0 4px' }}
                          title="Imprimir Cupom" 
                          onClick={async () => { const original = t.id ? await db.transactions.get(t.id) : undefined; if (original) printReceipt(original); }}
                        >
                          <Printer size={24} />
                        </button>
                        <button 
                          className="p-2 rounded transition-colors cursor-pointer" 
                          style={{ margin: '0 4px', color: '#10b981' }}
                          onMouseOver={e => e.currentTarget.style.backgroundColor = 'rgba(16, 185, 129, 0.2)'}
                          onMouseOut={e => e.currentTarget.style.backgroundColor = 'transparent'}
                          title="Editar Transação" 
                          onClick={async () => { const original = t.id ? await db.transactions.get(t.id) : undefined; if (original) setEditingTx(structuredClone(original)); }}
                        >
                          <Edit2 size={24} />
                        </button>
                        {isSale && (
                          <button 
                            className="p-2 rounded transition-colors cursor-pointer" 
                            style={{ margin: '0 4px', color: '#eab308' }}
                            onMouseOver={e => e.currentTarget.style.backgroundColor = 'rgba(234, 179, 8, 0.2)'}
                            onMouseOut={e => e.currentTarget.style.backgroundColor = 'transparent'}
                            title="Fazer Devolução Rápida" 
                            onClick={async () => { const original = t.id ? await db.transactions.get(t.id) : undefined; if (original) handleReturn(original); }}
                          >
                            <Undo2 size={24} />
                          </button>
                        )}
                        <button 
                          className="p-2 text-danger hover:bg-danger/20 rounded transition-colors cursor-pointer" 
                          style={{ margin: '0 0 0 4px' }}
                          title="Excluir Transação Permanentemente" 
                          onClick={() => handleDelete(t.id)}
                        >
                          <Trash2 size={24} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {transactions && transactions.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-muted">Nenhuma transação encontrada com os filtros selecionados.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      </div>

      {editingTx && (
        <div 
          style={{ 
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
            zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', 
            padding: '1rem', backgroundColor: 'rgba(0, 0, 0, 0.85)', backdropFilter: 'blur(4px)' 
          }}
          className="animate-fade-in"
        >
          <div 
            style={{ 
              backgroundColor: 'var(--bg-surface)', width: '100%', maxWidth: '700px', 
              borderRadius: '16px', border: '2px solid var(--primary)', 
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)', 
              overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '90vh' 
            }}
          >
            <div style={{ padding: '16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)' }}>
              <h2 className="text-xl font-bold flex items-center gap-2"><Edit2 size={24} className="text-primary"/> Editar Transação #{editingTx.id}</h2>
              <button className="p-1 hover:bg-white/10 rounded-full transition-colors" onClick={() => setEditingTx(null)}>
                <X size={24} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 custom-scrollbar space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="label">Operador</label>
                  <select 
                    className="input font-bold" 
                    value={editingTx.profile} 
                    onChange={e => setEditingTx({...editingTx, profile: e.target.value as Profile})}
                  >
                    <option value="chaveiro">Chaveiro</option>
                    <option value="fabiano">Fabiano</option>
                  </select>
                </div>
                <div>
                  <label className="label">Forma de Pagamento {editingTx.paymentMethod === 'split' ? '(Múltiplo)' : ''}</label>
                  <select 
                    className="input font-bold uppercase" 
                    value={editingTx.paymentMethod} 
                    onChange={e => setEditingTx({...editingTx, paymentMethod: e.target.value as PaymentMethod})}
                    disabled={editingTx.paymentMethod === 'split'}
                  >
                    <option value="cash">Dinheiro</option>
                    <option value="pix">PIX</option>
                    <option value="credit">Crédito</option>
                    <option value="debit">Débito</option>
                    <option value="split">Múltiplo</option>
                  </select>
                </div>
                <div>
                  <label className="label">Cliente</label>
                  <input 
                    type="text" 
                    className="input" 
                    placeholder="Nome do cliente"
                    value={editingTx.clientName || ''} 
                    onChange={e => setEditingTx({...editingTx, clientName: e.target.value})}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="label mb-0">Itens da Transação</label>
                  <button 
                    className="btn btn-sm btn-outline py-1 px-2 text-xs flex items-center gap-1"
                    onClick={() => {
                      const newItem: TransactionItem = { service: 'other', name: 'Novo Item', quantity: 1, price: 0, cost: 0, total: 0 };
                      setEditingTx({...editingTx, items: [...editingTx.items, newItem]});
                    }}
                  >
                    <Plus size={14}/> Adicionar Item
                  </button>
                </div>
                
                <div className="space-y-2">
                  {editingTx.items.map((item, idx) => (
                    <div key={idx} className="flex gap-2 items-start bg-black/20 p-2 rounded border border-[var(--border)]">
                      <div className="flex-1">
                        <input 
                          type="text" 
                          className="input w-full" 
                          value={item.name} 
                          placeholder="Descrição"
                          onChange={e => {
                            const newItems = [...editingTx.items];
                            newItems[idx].name = e.target.value;
                            setEditingTx({...editingTx, items: newItems});
                          }}
                        />
                      </div>
                      <div className="w-20">
                        <input 
                          type="number" 
                          className="input w-full" 
                          value={item.quantity} 
                          min="1"
                          title="Qtd"
                          onChange={e => {
                            const newItems = [...editingTx.items];
                            newItems[idx].quantity = Number(e.target.value);
                            setEditingTx({...editingTx, items: newItems});
                          }}
                        />
                      </div>
                      <div className="w-28">
                        <input 
                          type="number" 
                          className="input w-full" 
                          value={item.price} 
                          step="0.01"
                          title="Valor Unit."
                          onChange={e => {
                            const newItems = [...editingTx.items];
                            newItems[idx].price = Number(e.target.value);
                            setEditingTx({...editingTx, items: newItems});
                          }}
                        />
                      </div>
                      <button 
                        className="p-3 text-danger hover:bg-danger/20 rounded transition-colors"
                        onClick={() => {
                          if (editingTx.items.length === 1) return alert('A transação deve ter pelo menos 1 item.');
                          const newItems = editingTx.items.filter((_, i) => i !== idx);
                          setEditingTx({...editingTx, items: newItems});
                        }}
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="label">Desconto Total na Venda (R$)</label>
                <input 
                  type="number" 
                  className="input max-w-[200px]" 
                  value={editingTx.discount || 0} 
                  step="0.01"
                  min="0"
                  onChange={e => setEditingTx({...editingTx, discount: Number(e.target.value)})}
                />
              </div>

            </div>
            <div className="p-4 border-t border-[var(--border)] bg-black/30 flex justify-end gap-3">
              <button className="btn btn-outline" onClick={() => setEditingTx(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSaveEdit}>Salvar Alterações</button>
            </div>
          </div>
        </div>
      )}

      {returningSale && (
        <ReportModal
          title="Devolver itens da venda"
          subtitle={`Cliente: ${returningSale.clientName || 'não informado'} · ${format(returningSale.date, 'dd/MM/yyyy HH:mm')}`}
          onClose={() => setReturningSale(null)}
          footer={<div className="report-modal-footer-content"><strong className="report-modal-total">Total a devolver: R$ {refundPreview.toFixed(2).replace('.', ',')}</strong><button type="button" className="report-modal-action" disabled={refundPreview <= 0} onClick={submitReturn}>Confirmar devolução</button></div>}
        >
          <table className="report-modal-table"><thead><tr><th>Item</th><th>Disponível</th><th>Devolver</th></tr></thead><tbody>
            {returningSale.items.map((item, index) => <tr key={index}>
              <td>{item.name}</td><td>{returnable[index] || 0}</td>
              <td><input type="number" min="0" max={returnable[index] || 0} step="1" aria-label={`Quantidade a devolver de ${item.name}`} value={returnQuantities[index] || 0} onChange={e => setReturnQuantities(previous => previous.map((quantity, position) => position === index ? Math.max(0, Math.min(returnable[index] || 0, Math.trunc(Number(e.target.value) || 0))) : quantity))} style={{ width: '72px', padding: '5px', background: '#0f172a', color: '#ffffff', border: '1px solid #64748b', borderRadius: '5px' }} /></td>
            </tr>)}
          </tbody></table>
          <label className="label" style={{ display: 'block', marginTop: '16px' }}>Forma da devolução</label>
          <select className="input" value={returnPaymentMethod} onChange={e => setReturnPaymentMethod(e.target.value as PaymentMethod)}>
            <option value="cash">Dinheiro</option><option value="pix">PIX</option><option value="debit">Débito</option><option value="credit">Crédito</option>
          </select>
          <label className="label" style={{ display: 'block', marginTop: '16px' }}>Caixa que fará a devolução</label>
          <select className="input" value={returnCashProfile} onChange={e => setReturnCashProfile(e.target.value as Profile)}>
            {PROFILES.map(profile => <option key={profile} value={profile}>{profile.charAt(0).toUpperCase() + profile.slice(1)}</option>)}
          </select>
        </ReportModal>
      )}

      {detailTx && (
        <div 
          style={{ 
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
            zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', 
            padding: '1rem', backgroundColor: 'rgba(0, 0, 0, 0.85)', backdropFilter: 'blur(4px)' 
          }}
          className="animate-fade-in"
          onClick={closeSelectedTransaction}
        >
          <div 
            style={{ 
              backgroundColor: 'var(--bg-surface)', width: '100%', maxWidth: '500px', 
              borderRadius: '16px', border: '2px solid var(--primary)', 
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)', 
              overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '90vh' 
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ padding: '16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)' }}>
              <h2 className="text-xl font-bold flex items-center gap-2"><Receipt size={24} className="text-primary"/> {showFullTransaction ? 'Venda física completa' : viewProfile === 'todos' ? 'Transação completa' : `Parcela financeira — ${viewProfile}`} #{detailTx.id}</h2>
              <button className="p-1 hover:bg-white/10 rounded-full transition-colors cursor-pointer" onClick={closeSelectedTransaction}>
                <X size={24} />
              </button>
            </div>
            
            <div style={{ padding: '24px', overflowY: 'auto' }}>
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <p className="text-xs text-muted font-bold uppercase mb-1">Data / Hora</p>
                  <p className="font-mono">{format(detailTx.date, 'dd/MM/yyyy HH:mm')}</p>
                </div>
                <div>
                  <p className="text-xs text-muted font-bold uppercase mb-1">Caixa físico</p>
                  <p className="font-bold text-yellow-500 uppercase">{detailTx.cashProfile || detailTx.profile}</p>
                  {detailTx.cashProfile && <p className="text-xs text-muted">Perfil financeiro: {detailTx.profile}</p>}
                </div>
                <div>
                  <p className="text-xs text-muted font-bold uppercase mb-1">Pagamento</p>
                  <p className="font-bold uppercase text-muted">{detailTx.paymentMethod === 'cash' ? 'Dinheiro' : detailTx.paymentMethod === 'credit' ? 'Crédito' : detailTx.paymentMethod === 'debit' ? 'Débito' : detailTx.paymentMethod === 'pix' ? 'PIX' : 'Múltiplo'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted font-bold uppercase mb-1">Tipo</p>
                  <p className="font-bold">{detailTx.type === 'sale' ? 'Venda' : detailTx.type === 'expense' ? 'Despesa' : 'Devolução'}</p>
                </div>
              </div>

              {detailTx.clientName && (
                <div className="mb-6 p-3 bg-black/20 rounded-lg border border-[var(--border)]">
                  <p className="text-xs text-muted font-bold uppercase mb-1">Cliente</p>
                  <p className="font-bold">{detailTx.clientName}</p>
                  {/* @ts-ignore */}
                  {detailTx.clientPhone && <p className="text-sm text-muted">{detailTx.clientPhone}</p>}
                </div>
              )}

              <div className="mb-6">
                <p className="text-xs text-muted font-bold uppercase mb-2">{showFullTransaction ? 'Todos os itens da venda física' : viewProfile === 'todos' ? 'Todos os itens' : `Itens atribuídos a ${viewProfile}`}</p>
                <div className="flex flex-col gap-2">
                  {detailTx.items.map((item: any, i: number) => (
                    <div key={i} className="flex justify-between items-center p-2 bg-black/20 rounded border border-[var(--border)]">
                      <div>
                        <p className="font-bold text-sm">{item.quantity}x {item.name}</p>
                        <p className="text-[10px] text-muted">Custo Un: R$ {(item.cost || 0).toFixed(2).replace('.', ',')} | Venda Un: R$ {(item.price || 0).toFixed(2).replace('.', ',')}</p>
                      </div>
                      <p className="font-bold">R$ {item.total.toFixed(2).replace('.', ',')}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1 p-4 bg-black/30 rounded-lg border border-[var(--border)]">
                <div className="flex justify-between text-sm">
                  <span className="text-muted">Subtotal:</span>
                  <span>R$ {(detailTx.total + (detailTx.discount || 0)).toFixed(2).replace('.', ',')}</span>
                </div>
                {detailTx.discount && detailTx.discount > 0 ? (
                  <div className="flex justify-between text-sm text-orange-500">
                    <span>Desconto Extra:</span>
                    <span>- R$ {detailTx.discount.toFixed(2).replace('.', ',')}</span>
                  </div>
                ) : null}
                <div className="flex justify-between text-base font-bold mt-1 mb-2 pt-1 border-t border-[var(--border)/50]">
                  <span>{showFullTransaction || viewProfile === 'todos' ? 'Total da venda física:' : `Total atribuído a ${viewProfile}:`}</span>
                  <span>R$ {detailTx.total.toFixed(2).replace('.', ',')}</span>
                </div>
                
                {detailTx.machineFee && detailTx.machineFee > 0 ? (
                  <div className="flex justify-between text-sm text-purple-400">
                    <span>Taxa Maquininha:</span>
                    <span>- R$ {detailTx.machineFee.toFixed(2).replace('.', ',')}</span>
                  </div>
                ) : null}
                
                {(() => {
                  const totalCost = detailTx.items.reduce((sum: number, item: any) => sum + ((item.cost || 0) * item.quantity), 0);
                  const realProfit = detailTx.total - (detailTx.machineFee || 0) - totalCost;
                  return (
                    <>
                      {totalCost > 0 && (
                        <div className="flex justify-between text-sm text-danger">
                          <span>Custo de Produtos:</span>
                          <span>- R$ {totalCost.toFixed(2).replace('.', ',')}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-lg font-black mt-2 pt-2 border-t border-[var(--border)] text-success">
                        <span>LUCRO REAL:</span>
                        <span>R$ {realProfit.toFixed(2).replace('.', ',')}</span>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
            
            <div style={{ padding: '16px', borderTop: '1px solid var(--border)', backgroundColor: 'var(--bg-surface)' }}>
              {viewProfile !== 'todos' && <button className="btn btn-outline w-full mb-2" onClick={toggleFullTransaction}>
                {showFullTransaction ? `Voltar à parcela de ${viewProfile}` : 'Ver venda física completa'}
              </button>}
              <button 
                className="btn btn-primary w-full"
                onClick={closeSelectedTransaction}
              >
                Fechar Detalhes
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
