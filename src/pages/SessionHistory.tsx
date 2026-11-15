import React, { useState } from 'react';
import { db } from '../db/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { Printer, Filter, Calendar, X } from 'lucide-react';
import { startOfDay, endOfDay, subDays, format } from 'date-fns';

export const SessionHistory = () => {
  const [filterProfile, setFilterProfile] = useState<'all' | 'chaveiro' | 'fabiano'>('chaveiro');
  const [filterPeriod, setFilterPeriod] = useState<'today' | 'yesterday' | 'week' | 'month' | 'all'>('week');
  const [viewReportHtml, setViewReportHtml] = useState<string | null>(null);

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

  const generateReportHtml = async (session: any) => {
    const closeReservations = (await db.managementEntries.where('cashSessionId').equals(session.id).toArray())
      .filter(entry => entry.source === 'cash' && (entry.kind === 'reserve' || entry.kind === 'fund-deposit'));
    const cashReserves = closeReservations.reduce((sum, entry) => sum + entry.amountCents, 0) / 100;
    // Obter as despesas e salários durante esta sessão para reconstruir o fechamento
    const sessionTxs = await db.transactions
      .where('date')
      .between(session.openedAt, session.closedAt || new Date())
      .toArray();
    
    const filteredExpenses = sessionTxs.filter(t => t.profile === session.profile && t.type === 'expense');
    
    let pendingCashWages = 0;
    let pendingPixWages = 0;
    const wageDetails: { name: string, amount: number, method: 'cash' | 'pix' | 'split', cashAmount: number, pixAmount: number }[] = [];
    let totalExpensesInCash = 0;

    // Group wages by employee name
    const employeeWages: Record<string, { cashAmount: number, pixAmount: number }> = {};
    
    for (const t of filteredExpenses) {
      if (t.items && t.items.length > 0) {
        const rawName = t.items[0].name || '';
        const nameLower = rawName.toLowerCase();
        if (nameLower.includes('diária') || nameLower.includes('diaria')) {
          const empName = rawName.includes(':') ? rawName.split(':')[1].trim() : rawName;
          if (!employeeWages[empName]) {
            employeeWages[empName] = { cashAmount: 0, pixAmount: 0 };
          }
          if (t.paymentMethod === 'cash') {
            employeeWages[empName].cashAmount += t.total;
            pendingCashWages += t.total;
          } else if (t.paymentMethod === 'pix') {
            employeeWages[empName].pixAmount += t.total;
            pendingPixWages += t.total;
          }
        } else {
           if (t.paymentMethod === 'cash') totalExpensesInCash += t.total;
        }
      }
    }

    for (const [name, amounts] of Object.entries(employeeWages)) {
      const method = (amounts.cashAmount > 0 && amounts.pixAmount > 0) ? 'split' : (amounts.cashAmount > 0 ? 'cash' : 'pix');
      wageDetails.push({
         name,
         amount: amounts.cashAmount + amounts.pixAmount,
         method,
         cashAmount: amounts.cashAmount,
         pixAmount: amounts.pixAmount
      });
    }

    const expectedGrossCash = session.initialCash + (session.cashSales || 0) - totalExpensesInCash;
    const closeCash = (session.actualCash || 0);
    
    const availableCashAfterWages = closeCash - pendingCashWages;
    const withdrawal = availableCashAfterWages - (session.leftInDrawer || 0) - cashReserves;
    const difference = closeCash - expectedGrossCash;

    const totalSales = (session.cashSales || 0) + (session.pixSales || 0) + (session.debitSales || 0) + (session.creditSales || 0);
    const resultadoTurno = totalSales - totalExpensesInCash - pendingCashWages - pendingPixWages;

    const openedStr = new Date(session.openedAt).toLocaleString('pt-BR');
    const closedStr = session.closedAt ? new Date(session.closedAt).toLocaleString('pt-BR') : '-';
    
    return `
      <html>
      <head>
        <title>Fechamento de Caixa</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 12px; width: 76mm; margin: 0 auto; padding: 10px; color: black; background: white; }
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
        <div class="text-center header-title">Chaveiro & Cutelaria<br>do Lidio e Fabiano</div>
        <div class="text-center bold" style="font-size: 14px; margin-top: 5px; text-transform: uppercase;">Fechamento de Caixa</div>
        <div class="divider"></div>
        <div><span class="bold">Operador:</span> <span style="text-transform: uppercase;">${session.profile}</span></div>
        <div><span class="bold">Abertura:</span> ${openedStr}</div>
        <div><span class="bold">Fechamento:</span> ${closedStr}</div>
        <div class="divider"></div>

        <div class="bold text-center" style="margin-bottom: 5px;">RESUMO DAS VENDAS</div>
        <table>
          <tr><td>Dinheiro:</td><td class="text-right">R$ ${(session.cashSales || 0).toFixed(2).replace('.', ',')}</td></tr>
          <tr><td>PIX:</td><td class="text-right">R$ ${(session.pixSales || 0).toFixed(2).replace('.', ',')}</td></tr>
          <tr><td>Débito:</td><td class="text-right">R$ ${(session.debitSales || 0).toFixed(2).replace('.', ',')}</td></tr>
          <tr><td>Crédito:</td><td class="text-right">R$ ${(session.creditSales || 0).toFixed(2).replace('.', ',')}</td></tr>
          <tr><td class="bold">Subtotal PIX + Cartões:</td><td class="text-right bold">R$ ${((session.pixSales || 0) + (session.debitSales || 0) + (session.creditSales || 0)).toFixed(2).replace('.', ',')}</td></tr>
          <tr style="border-top: 1px dashed #000;"><td class="bold">TOTAL VENDIDO:</td><td class="text-right bold">R$ ${totalSales.toFixed(2).replace('.', ',')}</td></tr>
        </table>
        <div class="divider"></div>

        <div class="bold text-center" style="margin-bottom: 5px;">CONFERÊNCIA DA GAVETA</div>
        <table>
          <tr><td>Fundo de Abertura:</td><td class="text-right">R$ ${session.initialCash.toFixed(2).replace('.', ',')}</td></tr>
          <tr><td>(+) Vendas Dinheiro:</td><td class="text-right">R$ ${(session.cashSales || 0).toFixed(2).replace('.', ',')}</td></tr>
          ${totalExpensesInCash > 0 ? `<tr><td>(-) Despesas Dinheiro:</td><td class="text-right">R$ ${totalExpensesInCash.toFixed(2).replace('.', ',')}</td></tr>` : ''}
          <tr style="border-top: 1px dashed #000;"><td class="bold">ESPERADO P/ CONFERÊNCIA:</td><td class="text-right bold">R$ ${expectedGrossCash.toFixed(2).replace('.', ',')}</td></tr>
          <tr><td class="bold">DINHEIRO CONTADO:</td><td class="text-right bold">R$ ${closeCash.toFixed(2).replace('.', ',')}</td></tr>
          <tr style="color: ${difference >= 0 ? 'green' : 'red'};"><td class="bold">DIFERENÇA DO CAIXA:</td><td class="text-right bold">R$ ${difference.toFixed(2).replace('.', ',')} (${difference >= 0 ? 'Sobrando' : 'Faltando'})</td></tr>
        </table>
        <div class="divider"></div>

        ${wageDetails.length > 0 ? `
        <div class="bold text-center" style="margin-bottom: 5px;">PAGAMENTO DAS DIÁRIAS</div>
        <table>
          ${wageDetails.map(w => `
            <tr><td colspan="2" class="bold" style="padding-top: 4px;">${w.name}</td></tr>
            <tr><td>Total:</td><td class="text-right">R$ ${w.amount.toFixed(2).replace('.', ',')}</td></tr>
            ${w.method === 'cash' ? `<tr><td>Dinheiro:</td><td class="text-right">R$ ${w.amount.toFixed(2).replace('.', ',')}</td></tr>` : 
              w.method === 'pix' ? `<tr><td>PIX:</td><td class="text-right">R$ ${w.amount.toFixed(2).replace('.', ',')}</td></tr>` :
              `<tr><td>Dinheiro:</td><td class="text-right">R$ ${w.cashAmount.toFixed(2).replace('.', ',')}</td></tr>
               <tr><td>PIX:</td><td class="text-right">R$ ${w.pixAmount.toFixed(2).replace('.', ',')}</td></tr>`
            }
          `).join('')}
        </table>
        <div class="divider"></div>
        ` : ''}

        <div class="bold text-center" style="margin-bottom: 5px;">DESTINO DO DINHEIRO</div>
        <table>
          ${pendingCashWages > 0 ? `<tr><td>Diárias pagas em dinheiro:</td><td class="text-right">R$ ${pendingCashWages.toFixed(2).replace('.', ',')}</td></tr>` : ''}
          ${cashReserves > 0 ? `<tr><td>Reservas separadas em dinheiro:</td><td class="text-right">R$ ${cashReserves.toFixed(2).replace('.', ',')}</td></tr>` : ''}
          <tr><td>Fundo para o próximo dia:</td><td class="text-right">R$ ${(session.leftInDrawer || 0).toFixed(2).replace('.', ',')}</td></tr>
          <tr><td class="bold">Sangria / Retirada:</td><td class="text-right bold">R$ ${withdrawal.toFixed(2).replace('.', ',')}</td></tr>
        </table>
        <div class="divider"></div>

        <table>
          <tr><td style="font-size: 11px;">Maquininha Líquido (PIX+Cartões):</td><td class="text-right">R$ ${((session.pixSales || 0) + (session.debitSales || 0) + (session.creditSales || 0) - pendingPixWages).toFixed(2).replace('.', ',')}</td></tr>
          <tr><td style="font-size: 11px;">Dinheiro Líquido:</td><td class="text-right">R$ ${((session.cashSales || 0) - totalExpensesInCash - pendingCashWages).toFixed(2).replace('.', ',')}</td></tr>
          <tr style="border-top: 1px dashed #000;"><td class="bold" style="font-size: 14px;">TOTAL DO DIA:</td><td class="text-right bold" style="font-size: 14px;">R$ ${resultadoTurno.toFixed(2).replace('.', ',')}</td></tr>
        </table>
        <div class="divider" style="margin-bottom: 20px;"></div>
      </body>
      </html>
    `;
  };

  const handlePrint = async (session: any, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      const html = await generateReportHtml(session);

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
    } catch (e) {
      console.error(e);
      alert('Erro ao gerar relatório.');
    }
  };

  const handleView = async (session: any) => {
    try {
      const html = await generateReportHtml(session);
      setViewReportHtml(html);
    } catch (e) {
      console.error(e);
      alert('Erro ao gerar visualização do relatório.');
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
                    <tr 
                      key={s.id} 
                      className="table-row-hover cursor-pointer" 
                      style={{ borderBottom: '1px solid var(--border)' }}
                      onClick={() => handleView(s)}
                    >
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
                          onClick={(e) => handlePrint(s, e)}
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

      {viewReportHtml && (
        <div 
          style={{ 
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, 
            zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', 
            padding: '1rem', backgroundColor: 'rgba(0, 0, 0, 0.85)', backdropFilter: 'blur(4px)' 
          }}
          className="animate-fade-in"
          onClick={() => setViewReportHtml(null)}
        >
          <div 
            style={{ 
              backgroundColor: 'white', 
              color: 'black',
              width: '100%', 
              maxWidth: '380px', 
              height: '85vh',
              borderRadius: '8px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)', 
              display: 'flex', 
              flexDirection: 'column', 
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ padding: '12px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f3f4f6', borderRadius: '8px 8px 0 0' }}>
              <h2 className="font-bold text-gray-800 flex items-center gap-2">Visualização do Relatório</h2>
              <button className="p-1 text-gray-500 hover:text-black rounded-full transition-colors" onClick={() => setViewReportHtml(null)}>
                <X size={20} />
              </button>
            </div>
            
            <div 
              style={{ padding: '0', flex: 1, backgroundColor: 'white', display: 'flex', flexDirection: 'column' }}
              className="custom-scrollbar"
            >
              <iframe 
                srcDoc={viewReportHtml}
                style={{ width: '100%', height: '100%', border: 'none', flex: 1 }}
                title="Visualização do Relatório"
              />
            </div>
            
            <div style={{ padding: '12px', borderTop: '1px solid #e5e7eb', backgroundColor: '#f3f4f6', borderRadius: '0 0 8px 8px', display: 'flex', justifyContent: 'center' }}>
              <button 
                className="btn btn-primary"
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                onClick={() => {
                  const iframe = document.createElement('iframe');
                  iframe.style.position = 'fixed';
                  iframe.style.right = '0';
                  iframe.style.bottom = '0';
                  iframe.style.width = '300px';
                  iframe.style.height = '0';
                  iframe.style.border = 'none';
                  document.body.appendChild(iframe);
                  iframe.contentDocument!.write(viewReportHtml);
                  iframe.contentDocument!.close();
                  setTimeout(() => {
                    iframe.contentWindow!.print();
                    setTimeout(() => document.body.removeChild(iframe), 2000);
                  }, 500);
                }}
              >
                <Printer size={18} /> Imprimir Este Relatório
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
