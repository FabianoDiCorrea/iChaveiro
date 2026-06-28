import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Transaction, type Profile, type PaymentMethod, type TransactionItem } from '../db/db';
import { format, startOfDay, endOfDay, startOfMonth, endOfMonth, startOfYear, endOfYear, subDays } from 'date-fns';
import { Calendar, Printer, Undo2, Trash2, Search, Filter, Edit2, X, Plus, Receipt } from 'lucide-react';

export const SalesHistory = () => {
  const [dateRange, setDateRange] = useState<'today' | 'week' | 'month' | 'year' | 'custom'>('today');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [viewProfile, setViewProfile] = useState<Profile | 'todos'>('chaveiro');
  const [searchTerm, setSearchTerm] = useState('');
  
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);

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
    if (window.confirm('Tem certeza que deseja EXCLUIR permanentemente esta transação? Isso afetará os relatórios e o caixa não fechará corretamente se já tiver sido contabilizado. (O estoque será restaurado)')) {
      try {
        await db.transaction('rw', db.transactions, db.products, async () => {
          const t = await db.transactions.get(id);
          if (t && t.type === 'sale') {
            for (const item of t.items) {
              if (item.productId) {
                const product = await db.products.get(item.productId);
                if (product && product.hasStock) {
                  await db.products.update(product.id!, { stock: product.stock + item.quantity });
                }
              }
            }
          }
          await db.transactions.delete(id);
        });
        alert('Transação excluída e estoque restaurado (se aplicável).');
      } catch (err) {
        console.error(err);
        alert('Erro ao excluir transação.');
      }
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
        <div class="text-center bold" style="font-size: 13px; margin-top: 2px; margin-bottom: 5px;">Tel: (21) 98601-6721 (WhatsApp)</div>
        <div class="text-center" style="font-size: 11px;">Data: ${dateStr}</div>
        ${t.clientCode ? `<div class="divider"></div><div class="bold">Cliente: ${t.clientCode}</div>` : ''}
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
                <th className="font-medium" style={{ padding: '12px 8px', width: '90px' }}>Operador</th>
                <th className="font-medium" style={{ padding: '12px 8px', width: '80px' }}>Tipo</th>
                <th className="font-medium" style={{ padding: '12px 8px' }}>Descrição / Itens</th>
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
                    onClick={() => setSelectedTx(t)}
                    title="Clique para ver detalhes desta transação"
                  >
                    <td className="text-sm whitespace-nowrap" style={{ padding: '12px 8px' }}>{format(t.date, 'dd/MM/yyyy HH:mm')}</td>
                    <td className="text-sm font-bold uppercase" style={{ padding: '12px 8px', color: t.profile === 'chaveiro' ? '#ef4444' : '#3b82f6' }}>
                      {t.profile}
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
                      {t.clientName && <div className="text-xs text-muted mt-0.5">Cliente: {t.clientName}</div>}
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
                          onClick={() => printReceipt(t)}
                        >
                          <Printer size={24} />
                        </button>
                        <button 
                          className="p-2 rounded transition-colors cursor-pointer" 
                          style={{ margin: '0 4px', color: '#10b981' }}
                          onMouseOver={e => e.currentTarget.style.backgroundColor = 'rgba(16, 185, 129, 0.2)'}
                          onMouseOut={e => e.currentTarget.style.backgroundColor = 'transparent'}
                          title="Editar Transação" 
                          onClick={() => setEditingTx(JSON.parse(JSON.stringify(t)))}
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
                            onClick={() => handleReturn(t)}
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
                  <td colSpan={7} className="py-8 text-center text-muted">Nenhuma transação encontrada com os filtros selecionados.</td>
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
                  <label className="label">Forma de Pagamento {editingTx.paymentMethod === 'split' ? '(Múltiplo - Não Editável)' : ''}</label>
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

      {selectedTx && (
        <div 
          style={{ 
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
            zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', 
            padding: '1rem', backgroundColor: 'rgba(0, 0, 0, 0.85)', backdropFilter: 'blur(4px)' 
          }}
          className="animate-fade-in"
          onClick={() => setSelectedTx(null)}
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
              <h2 className="text-xl font-bold flex items-center gap-2"><Receipt size={24} className="text-primary"/> Detalhes da Transação #{selectedTx.id}</h2>
              <button className="p-1 hover:bg-white/10 rounded-full transition-colors cursor-pointer" onClick={() => setSelectedTx(null)}>
                <X size={24} />
              </button>
            </div>
            
            <div style={{ padding: '24px', overflowY: 'auto' }}>
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <p className="text-xs text-muted font-bold uppercase mb-1">Data / Hora</p>
                  <p className="font-mono">{format(selectedTx.date, 'dd/MM/yyyy HH:mm')}</p>
                </div>
                <div>
                  <p className="text-xs text-muted font-bold uppercase mb-1">Operador</p>
                  <p className="font-bold text-yellow-500 uppercase">{selectedTx.profile}</p>
                </div>
                <div>
                  <p className="text-xs text-muted font-bold uppercase mb-1">Pagamento</p>
                  <p className="font-bold uppercase text-muted">{selectedTx.paymentMethod === 'cash' ? 'Dinheiro' : selectedTx.paymentMethod === 'credit' ? 'Crédito' : selectedTx.paymentMethod === 'debit' ? 'Débito' : selectedTx.paymentMethod === 'pix' ? 'PIX' : 'Múltiplo'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted font-bold uppercase mb-1">Tipo</p>
                  <p className="font-bold">{selectedTx.type === 'sale' ? 'Venda' : selectedTx.type === 'expense' ? 'Despesa' : 'Devolução'}</p>
                </div>
              </div>

              {selectedTx.clientName && (
                <div className="mb-6 p-3 bg-black/20 rounded-lg border border-[var(--border)]">
                  <p className="text-xs text-muted font-bold uppercase mb-1">Cliente</p>
                  <p className="font-bold">{selectedTx.clientName}</p>
                  {/* @ts-ignore */}
                  {selectedTx.clientPhone && <p className="text-sm text-muted">{selectedTx.clientPhone}</p>}
                </div>
              )}

              <div className="mb-6">
                <p className="text-xs text-muted font-bold uppercase mb-2">Itens da Transação</p>
                <div className="flex flex-col gap-2">
                  {selectedTx.items.map((item: any, i: number) => (
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
                  <span>R$ {(selectedTx.total + (selectedTx.discount || 0)).toFixed(2).replace('.', ',')}</span>
                </div>
                {selectedTx.discount && selectedTx.discount > 0 ? (
                  <div className="flex justify-between text-sm text-orange-500">
                    <span>Desconto Extra:</span>
                    <span>- R$ {selectedTx.discount.toFixed(2).replace('.', ',')}</span>
                  </div>
                ) : null}
                <div className="flex justify-between text-base font-bold mt-1 mb-2 pt-1 border-t border-[var(--border)/50]">
                  <span>Total Cobrado:</span>
                  <span>R$ {selectedTx.total.toFixed(2).replace('.', ',')}</span>
                </div>
                
                {selectedTx.machineFee && selectedTx.machineFee > 0 ? (
                  <div className="flex justify-between text-sm text-purple-400">
                    <span>Taxa Maquininha:</span>
                    <span>- R$ {selectedTx.machineFee.toFixed(2).replace('.', ',')}</span>
                  </div>
                ) : null}
                
                {(() => {
                  const totalCost = selectedTx.items.reduce((sum: number, item: any) => sum + ((item.cost || 0) * item.quantity), 0);
                  const realProfit = selectedTx.total - (selectedTx.machineFee || 0) - totalCost;
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
              <button 
                className="btn btn-primary w-full"
                onClick={() => setSelectedTx(null)}
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
