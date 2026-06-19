import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Transaction, type Profile, type PaymentMethod, type TransactionItem } from '../db/db';
import { format, startOfDay, endOfDay, startOfMonth, endOfMonth, startOfYear, endOfYear, subDays } from 'date-fns';
import { Calendar, Printer, Undo2, Trash2, Search, Filter, Edit2, X, Plus } from 'lucide-react';

export const SalesHistory = () => {
  const [dateRange, setDateRange] = useState<'today' | 'week' | 'month' | 'year' | 'custom'>('today');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [viewProfile, setViewProfile] = useState<Profile | 'todos'>('todos');
  const [searchTerm, setSearchTerm] = useState('');
  
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);

  const getDates = () => {
    const now = new Date();
    switch (dateRange) {
      case 'today': return { start: startOfDay(now), end: endOfDay(now) };
      case 'week': return { start: startOfDay(subDays(now, 7)), end: endOfDay(now) };
      case 'month': return { start: startOfMonth(now), end: endOfMonth(now) };
      case 'year': return { start: startOfYear(now), end: endOfYear(now) };
      case 'custom': 
        return { 
          start: customStart ? startOfDay(new Date(customStart)) : startOfDay(now), 
          end: customEnd ? endOfDay(new Date(customEnd)) : endOfDay(now) 
        };
      default: return { start: startOfDay(now), end: endOfDay(now) };
    }
  };

  const { start, end } = getDates();

  const transactions = useLiveQuery(
    async () => {
      let query = await db.transactions
        .where('date')
        .between(start, end)
        .reverse()
        .toArray();
      
      if (viewProfile !== 'todos') {
        query = query.filter(t => t.profile === viewProfile);
      }

      if (searchTerm) {
        const lowerSearch = searchTerm.toLowerCase();
        query = query.filter(t => 
          t.items.some(i => i.name.toLowerCase().includes(lowerSearch)) ||
          t.paymentMethod.toLowerCase().includes(lowerSearch) ||
          (t.clientName && t.clientName.toLowerCase().includes(lowerSearch))
        );
      }

      return query;
    },
    [start, end, viewProfile, searchTerm]
  );

  const handleDelete = async (id?: number) => {
    if (!id) return;
    if (window.confirm('Tem certeza que deseja EXCLUIR permanentemente esta transação? Isso afetará os relatórios e o caixa não fechará corretamente se já tiver sido contabilizado.')) {
      await db.transactions.delete(id);
    }
  };

  const handleReturn = (t: Transaction) => {
    // Navigate to returns or just tell them to use Returns page
    // Actually, we can prefill the Returns via a simple confirm, but we don't have routing state passing set up cleanly.
    // Let's do a simple quick return here if they want, or alert them.
    if (window.confirm(`Deseja registrar uma devolução automática no valor de R$ ${t.total.toFixed(2).replace('.', ',')} para a transação do dia ${format(t.date, 'dd/MM/yyyy')}?`)) {
      db.transactions.add({
        profile: t.profile,
        type: 'return',
        items: [{ service: 'other', name: `Devolução Ref. Venda ${t.id}`, quantity: 1, price: t.total, cost: 0, total: t.total }],
        total: t.total,
        paymentMethod: 'cash',
        date: new Date()
      }).then(() => alert('Devolução registrada com sucesso no caixa de hoje!'));
    }
  };

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
      return m;
    };

    const originalSubtotal = t.items.reduce((sum, i) => sum + (i.price * i.quantity), 0);

    const html = `
      <html>
      <head>
        <title>${typeTitle}</title>
        <style>
          body { font-family: monospace; font-size: 12px; max-width: 300px; margin: 0 auto; padding: 10px; color: black; }
          .text-center { text-align: center; }
          .text-right { text-align: right; }
          .bold { font-weight: bold; }
          .divider { border-bottom: 1px dashed #000; margin: 5px 0; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th, td { padding: 2px 0; }
          .header-title { font-size: 16px; font-weight: bold; margin-bottom: 5px; }
        </style>
      </head>
      <body>
        ${t.type !== 'sale' ? `<div class="text-center header-title">${typeTitle.toUpperCase()}</div><div class="divider"></div>` : ''}
        <div class="text-center header-title">Chaveiro & Cutelaria<br>do Lidio e Fabiano</div>
        <div class="text-center" style="font-size: 10px; margin-top: 3px;">Rua Cardoso de Morais, Frente ao 202</div>
        <div class="text-center" style="font-size: 10px;">Bonsucesso - RJ (Frente ao Caçula)</div>
        <div class="text-center" style="font-size: 10px; margin-bottom: 5px;">Tel: (21) 98601-6721 (WhatsApp)</div>
        <div class="text-center" style="font-size: 11px;">Data: ${dateStr}</div>
        ${t.clientName ? `<div class="divider"></div><div class="bold">Cliente: ${t.clientName}</div>` : ''}
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
                    ${i.name}<br>
                    <span style="font-size: 10px; color: #555;">Vlr. Unit: R$ ${i.price.toFixed(2).replace('.', ',')}</span>
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
          <tr><td class="bold">Forma de Pagto:</td><td class="text-right bold uppercase">${getPaymentMethodName(t.paymentMethod)}</td></tr>
        </table>
        <div class="divider"></div>
        <div class="text-center">Obrigado pela preferência!</div>
      </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
    
    // Auto print
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 250);
  };

  const handleSaveEdit = async () => {
    if (!editingTx || !editingTx.id) return;
    try {
      // Recalculate totals
      const subtotal = editingTx.items.reduce((sum, i) => sum + (i.price * i.quantity), 0);
      const total = subtotal - (editingTx.discount || 0);
      
      const updatedItems = editingTx.items.map(i => ({
        ...i,
        total: i.price * i.quantity
      }));

      let calculatedFee = 0;
      if (editingTx.profile === 'chaveiro') {
        if (editingTx.paymentMethod === 'debit') calculatedFee = total * 0.0199;
        else if (editingTx.paymentMethod === 'credit') calculatedFee = total * 0.0498;
      } else if (editingTx.profile === 'fabiano') {
        if (editingTx.paymentMethod === 'pix') calculatedFee = total * 0.0045;
        else if (editingTx.paymentMethod === 'debit') calculatedFee = total * 0.0198;
        else if (editingTx.paymentMethod === 'credit') calculatedFee = total * 0.0486;
      }

      await db.transactions.update(editingTx.id, {
        profile: editingTx.profile,
        paymentMethod: editingTx.paymentMethod,
        discount: editingTx.discount || 0,
        machineFee: calculatedFee > 0 ? calculatedFee : undefined,
        items: updatedItems,
        total: total
      });
      alert('Transação atualizada com sucesso!');
      setEditingTx(null);
    } catch (e) {
      console.error(e);
      alert('Erro ao atualizar transação.');
    }
  };

  return (
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
            <thead className="bg-[var(--bg-surface)] sticky top-0 z-10">
              <tr className="border-b border-[var(--border)] text-muted text-sm">
                <th className="py-3 px-4 font-medium">Data/Hora</th>
                <th className="py-3 px-4 font-medium">Operador</th>
                <th className="py-3 px-4 font-medium">Tipo</th>
                <th className="py-3 px-4 font-medium">Descrição / Itens</th>
                <th className="py-3 px-4 font-medium">Pgto</th>
                <th className="py-3 px-4 font-medium text-right">Valor Total</th>
                <th className="py-3 px-4 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {transactions?.map((t) => {
                const isSale = t.type === 'sale';
                const isExpense = t.type === 'expense';
                const isReturn = t.type === 'return';
                
                return (
                  <tr key={t.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-surface-hover)]">
                    <td className="py-3 px-4 text-sm whitespace-nowrap">{format(t.date, 'dd/MM/yyyy HH:mm')}</td>
                    <td className="py-3 px-4 text-sm font-bold uppercase" style={{ color: t.profile === 'chaveiro' ? '#ef4444' : '#3b82f6' }}>
                      {t.profile}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-1 rounded text-xs font-bold ${
                        isSale ? 'bg-success/20 text-success' : 
                        isExpense ? 'bg-warning/20 text-warning' : 
                        'bg-danger/20 text-danger'
                      }`}>
                        {isSale ? 'Venda' : isExpense ? 'Despesa' : 'Devolução'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm">
                      <div className="truncate max-w-[300px]" title={t.items.map(i => `${i.quantity}x ${i.name}`).join(', ')}>
                        {t.items.map(i => `${i.quantity}x ${i.name}`).join(', ')}
                      </div>
                      {t.clientName && <div className="text-xs text-muted mt-0.5">Cliente: {t.clientName}</div>}
                    </td>
                    <td className="py-3 px-4 text-sm font-bold uppercase text-muted">
                      {t.paymentMethod === 'cash' ? 'Dinheiro' : 
                       t.paymentMethod === 'credit' ? 'Crédito' : 
                       t.paymentMethod === 'debit' ? 'Débito' : 
                       t.paymentMethod === 'pix' ? 'Pix' : t.paymentMethod}
                    </td>
                    <td className={`py-3 px-4 text-right font-bold ${isSale ? 'text-success' : 'text-danger'}`}>
                      {isSale ? '+' : '-'} R$ {t.total.toFixed(2).replace('.', ',')}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <button 
                        className="p-1.5 text-primary hover:bg-primary/20 rounded transition-colors cursor-pointer mr-1" 
                        title="Imprimir Cupom" 
                        onClick={() => printReceipt(t)}
                      >
                        <Printer size={18} />
                      </button>
                      <button 
                        className="p-1.5 text-blue-400 hover:bg-blue-400/20 rounded transition-colors cursor-pointer mr-1" 
                        title="Editar Transação" 
                        onClick={() => setEditingTx(JSON.parse(JSON.stringify(t)))}
                      >
                        <Edit2 size={18} />
                      </button>
                      {isSale && (
                        <button 
                          className="p-1.5 text-warning hover:bg-warning/20 rounded transition-colors cursor-pointer mr-1" 
                          title="Fazer Devolução Rápida" 
                          onClick={() => handleReturn(t)}
                        >
                          <Undo2 size={18} />
                        </button>
                      )}
                      <button 
                        className="p-1.5 text-danger hover:bg-danger/20 rounded transition-colors cursor-pointer" 
                        title="Excluir Transação Permanentemente" 
                        onClick={() => handleDelete(t.id)}
                      >
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {transactions && transactions.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-muted">Nenhuma transação encontrada com os filtros selecionados.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editingTx && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--bg-surface)] w-full max-w-2xl rounded-xl shadow-2xl border border-[var(--border)] overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-[var(--border)] flex justify-between items-center bg-black/20">
              <h2 className="text-xl font-bold flex items-center gap-2"><Edit2 size={24} className="text-primary"/> Editar Transação #{editingTx.id}</h2>
              <button className="p-1 hover:bg-white/10 rounded-full transition-colors" onClick={() => setEditingTx(null)}>
                <X size={24} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 custom-scrollbar space-y-6">
              <div className="grid grid-cols-2 gap-4">
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
                  <label className="label">Forma de Pagamento</label>
                  <select 
                    className="input font-bold uppercase" 
                    value={editingTx.paymentMethod} 
                    onChange={e => setEditingTx({...editingTx, paymentMethod: e.target.value as PaymentMethod})}
                  >
                    <option value="cash">Dinheiro</option>
                    <option value="pix">PIX</option>
                    <option value="credit">Crédito</option>
                    <option value="debit">Débito</option>
                  </select>
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

    </div>
  );
};
