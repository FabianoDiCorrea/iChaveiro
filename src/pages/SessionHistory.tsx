import React, { useState } from 'react';
import { db } from '../db/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { Printer, Filter, Calendar } from 'lucide-react';
import { startOfDay, endOfDay, subDays, format } from 'date-fns';

export const SessionHistory = () => {
  const [filterProfile, setFilterProfile] = useState<'all' | 'chaveiro' | 'fabiano'>('chaveiro');
  const [filterPeriod, setFilterPeriod] = useState<'today' | 'yesterday' | 'week' | 'month' | 'all'>('week');

  const sessions = useLiveQuery(async () => {
    if (!db.cashSessions) return [];
    
    let collection = db.cashSessions.where('status').equals('closed');
    
    const now = new Date();
    let startDate: Date | null = null;
    let endDate: Date | null = null;
    
    if (filterPeriod === 'today') {
      startDate = startOfDay(now);
      endDate = endOfDay(now);
    } else if (filterPeriod === 'yesterday') {
      startDate = startOfDay(subDays(now, 1));
      endDate = endOfDay(subDays(now, 1));
    } else if (filterPeriod === 'week') {
      startDate = startOfDay(subDays(now, 7));
      endDate = endOfDay(now);
    } else if (filterPeriod === 'month') {
      startDate = startOfDay(subDays(now, 30));
      endDate = endOfDay(now);
    }

    let results = await collection.reverse().sortBy('openedAt');
    
    if (startDate && endDate) {
      results = results.filter(s => s.openedAt >= startDate! && s.openedAt <= endDate!);
    }
    
    if (filterProfile !== 'all') {
      results = results.filter(s => s.profile === filterProfile);
    }
    
    return results;
  }, [filterProfile, filterPeriod]);

  const handlePrint = async (session: any) => {
    try {
      // Obter as despesas e salários durante esta sessão para reconstruir o fechamento
      const sessionTxs = await db.transactions
        .where('date')
        .between(session.openedAt, session.closedAt || new Date())
        .toArray();
      
      const filteredExpenses = sessionTxs.filter(t => t.profile === session.profile && t.type === 'expense');
      
      let totalWagesToPay = 0;
      const wageDetails: { name: string, amount: number }[] = [];
      let totalExpenses = 0;
      
      for (const t of filteredExpenses) {
        totalExpenses += t.total;
        if (t.items && t.items.length > 0 && t.items[0].name.startsWith('Pagamento de Diária:')) {
          const empName = t.items[0].name.replace('Pagamento de Diária: ', '');
          wageDetails.push({ name: empName, amount: t.total });
          totalWagesToPay += t.total;
        }
      }

      const pureExpenses = totalExpenses - totalWagesToPay;
      const expectedCash = session.initialCash + (session.cashSales || 0) - pureExpenses;
      const closeCash = (session.actualCash || 0) + totalWagesToPay; // The gross cash before wages were taken out
      const withdrawal = closeCash - (session.leftInDrawer || 0);
      const difference = closeCash - expectedCash;

      const printWindow = window.open('', '_blank', 'width=400,height=600');
      if (!printWindow) return;

      const openedStr = new Date(session.openedAt).toLocaleString('pt-BR');
      const closedStr = new Date(session.closedAt).toLocaleString('pt-BR');

      const html = `
        <html>
        <head>
          <title>Fechamento de Caixa</title>
          <style>
            @page { margin: 10mm 0; }
            body { font-family: monospace; font-size: 12px; max-width: 300px; margin: 0 auto; padding: 0 10px; color: black; }
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
          <div class="text-center header-title">Chaveiro & Cutelaria<br>do Lidio e Fabiano</div>
          <div class="text-center bold" style="font-size: 13px; margin-top: 5px; text-transform: uppercase;">Fechamento de Caixa</div>
          <div class="divider"></div>
          <div><span class="bold">Operador:</span> <span style="text-transform: uppercase;">${session.profile}</span></div>
          <div><span class="bold">Abertura:</span> ${openedStr}</div>
          <div><span class="bold">Fechamento:</span> ${closedStr}</div>
          <div class="divider"></div>
          <table>
            <tr><td class="bold">Fundo de Abertura:</td><td class="text-right">R$ ${session.initialCash.toFixed(2).replace('.', ',')}</td></tr>
            <tr><td class="bold">Vendas Dinheiro (+):</td><td class="text-right">R$ ${(session.cashSales || 0).toFixed(2).replace('.', ',')}</td></tr>
            ${pureExpenses > 0 ? `<tr><td class="bold">Despesas (Insumos) (-):</td><td class="text-right">R$ ${pureExpenses.toFixed(2).replace('.', ',')}</td></tr>` : ''}
            ${wageDetails.map(w => `<tr><td class="bold">Diária (${w.name}) (-):</td><td class="text-right">R$ ${w.amount.toFixed(2).replace('.', ',')}</td></tr>`).join('')}
            <tr><td class="bold">Dinheiro Esperado:</td><td class="text-right font-black">R$ ${expectedCash.toFixed(2).replace('.', ',')}</td></tr>
            <tr><td class="bold">Dinheiro Contado:</td><td class="text-right">R$ ${closeCash.toFixed(2).replace('.', ',')}</td></tr>
            <tr style="color: ${difference >= 0 ? 'green' : 'red'};"><td class="bold">Diferença Dinheiro:</td><td class="text-right bold">R$ ${difference.toFixed(2).replace('.', ',')} (${difference >= 0 ? 'Sobrando' : 'Faltando'})</td></tr>
          </table>
          <div class="divider"></div>
          <table>
            <tr><td class="bold">Fundo p/ Amanhã:</td><td class="text-right">R$ ${(session.leftInDrawer || 0).toFixed(2).replace('.', ',')}</td></tr>
            <tr><td class="bold">Retirada (Sangria):</td><td class="text-right bold">R$ ${withdrawal.toFixed(2).replace('.', ',')}</td></tr>
          </table>
          <div class="divider"></div>
          <div class="bold text-center">OUTRAS FORMAS DE PAGAMENTO</div>
          <table>
            <tr><td>Vendas PIX:</td><td class="text-right">R$ ${(session.pixSales || 0).toFixed(2).replace('.', ',')}</td></tr>
            <tr><td>Vendas Débito:</td><td class="text-right">R$ ${(session.debitSales || 0).toFixed(2).replace('.', ',')}</td></tr>
            <tr><td>Vendas Crédito:</td><td class="text-right">R$ ${(session.creditSales || 0).toFixed(2).replace('.', ',')}</td></tr>
            <tr class="bold"><td>Total Período:</td><td class="text-right">R$ ${((session.cashSales || 0) + (session.pixSales || 0) + (session.debitSales || 0) + (session.creditSales || 0)).toFixed(2).replace('.', ',')}</td></tr>
          </table>
          <div class="divider"></div>
          <div class="text-center" style="margin-top: 10px;">Assinatura do Operador:</div>
          <div style="border-bottom: 1px solid #000; margin-top: 35px; width: 80%; margin-left: auto; margin-right: auto;"></div>
        </body>
        </html>
      `;

      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 250);
    } catch (e) {
      console.error(e);
      alert('Erro ao gerar relatório.');
    }
  };

  return (
    <div className="flex flex-col h-full animate-fade-in">
      <div className="page-header flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Histórico de Fechamentos</h1>
          <p className="text-muted">Consulte e reimprima o demonstrativo de fechamento de caixa.</p>
        </div>
      </div>

      <div className="glass-panel p-6 mb-6">
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2"><Filter size={20}/> Filtros</h2>
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="label">Perfil</label>
            <select
              className="input min-w-[150px]"
              value={filterProfile}
              onChange={e => setFilterProfile(e.target.value as any)}
            >
              <option value="all">Todos</option>
              <option value="chaveiro">Chaveiro</option>
              <option value="fabiano">Fabiano</option>
            </select>
          </div>
          <div>
            <label className="label">Período</label>
            <select
              className="input min-w-[150px]"
              value={filterPeriod}
              onChange={e => setFilterPeriod(e.target.value as any)}
            >
              <option value="today">Hoje</option>
              <option value="yesterday">Ontem</option>
              <option value="week">Últimos 7 Dias</option>
              <option value="month">Mês</option>
              <option value="all">Tudo</option>
            </select>
          </div>
        </div>
      </div>

      <div className="glass-panel flex-1 overflow-hidden flex flex-col">
        <div className="p-4 border-b border-[var(--border)] flex justify-between items-center">
          <h2 className="font-bold">Lista de Fechamentos ({sessions?.length || 0})</h2>
        </div>
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-[var(--bg-surface)]" style={{ position: 'sticky', top: 0, zIndex: 10 }}>
              <tr className="text-muted text-sm" style={{ borderBottom: '1px solid var(--border)' }}>
                <th className="font-medium" style={{ padding: '12px 8px', width: '150px' }}>Data/Hora</th>
                <th className="font-medium" style={{ padding: '12px 8px', width: '120px' }}>Operador</th>
                <th className="font-medium text-right" style={{ padding: '12px 8px' }}>Vendas Brutas</th>
                <th className="font-medium text-right" style={{ padding: '12px 8px' }}>Dinheiro Caixa</th>
                <th className="font-medium text-right" style={{ padding: '12px 8px', width: '150px' }}>Diferença</th>
                <th className="font-medium text-center" style={{ padding: '12px 8px', width: '100px' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {!sessions || sessions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted">
                    Nenhum fechamento encontrado neste período.
                  </td>
                </tr>
              ) : (
                sessions.map(s => {
                  const totalSales = (s.cashSales || 0) + (s.pixSales || 0) + (s.debitSales || 0) + (s.creditSales || 0);
                  const isPositive = (s.difference || 0) >= 0;
                  return (
                    <tr key={s.id} className="table-row-hover" style={{ borderBottom: '1px solid var(--border)' }}>
                      <td className="text-sm whitespace-nowrap" style={{ padding: '12px 8px' }}>
                        {s.closedAt ? format(new Date(s.closedAt), 'dd/MM/yyyy HH:mm') : '-'}
                      </td>
                      <td className="text-sm font-bold uppercase" style={{ padding: '12px 8px', color: s.profile === 'chaveiro' ? '#ef4444' : '#3b82f6' }}>
                        {s.profile}
                      </td>
                      <td className="font-bold text-right" style={{ padding: '12px 8px' }}>
                        R$ {totalSales.toFixed(2).replace('.', ',')}
                      </td>
                      <td className="font-bold text-right text-emerald-400" style={{ padding: '12px 8px' }}>
                        R$ {(s.actualCash || 0).toFixed(2).replace('.', ',')}
                      </td>
                      <td className={`text-right font-bold whitespace-nowrap ${isPositive ? 'text-success' : 'text-danger'}`} style={{ padding: '12px 8px' }}>
                        {isPositive ? '+' : '-'} R$ {Math.abs(s.difference || 0).toFixed(2).replace('.', ',')}
                      </td>
                      <td className="text-center whitespace-nowrap" style={{ padding: '12px 8px' }}>
                        <button 
                          onClick={() => handlePrint(s)}
                          className="p-1.5 bg-primary/20 text-primary rounded-lg hover:bg-primary/30 transition-colors"
                          title="Reimprimir Fechamento"
                        >
                          <Printer size={18} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
