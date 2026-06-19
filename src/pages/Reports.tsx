import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { Profile } from '../db/db';
import { format, startOfDay, endOfDay, startOfMonth, endOfMonth, startOfYear, endOfYear, subDays } from 'date-fns';
import { Download, Calendar, Printer } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export const Reports = () => {
  const [viewProfile, setViewProfile] = React.useState<Profile | 'todos'>('todos');
  const [dateRange, setDateRange] = useState<'today' | 'week' | 'month' | 'year' | 'custom'>('today');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  const [printModalMode, setPrintModalMode] = useState<'thermal' | 'pdf' | null>(null);
  const [printModalDetailed, setPrintModalDetailed] = useState(false);

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
    () => {
      let query = db.transactions.where('date').between(start, end);
      if (viewProfile !== 'todos') {
        return query.filter(t => t.profile === viewProfile).toArray();
      }
      return query.toArray();
    },
    [start, end, viewProfile]
  );

  // Always receives a specific profile (never 'todos') and detail level
  const printThermalReport = async (profileToPrint: Profile, isDetailed: boolean) => {
    // Filter transactions for this specific profile
    const allTx = await db.transactions.where('date').between(start, end).toArray();
    const txForProfile = allTx.filter(t => t.profile === profileToPrint);

    if (txForProfile.length === 0) return alert(`Nenhuma transação de ${profileToPrint === 'chaveiro' ? 'Chaveiro' : 'Fabiano'} no período.`);

    const printWindow = window.open('', '_blank', 'width=400,height=600');
    if (!printWindow) return alert('Erro ao abrir janela de impressão. Verifique se o bloqueador de pop-ups está ativo.');

    const sales = txForProfile.filter(t => t.type === 'sale');
    const returns = txForProfile.filter(t => t.type === 'return');
    const expenses = txForProfile.filter(t => t.type === 'expense');

    const serviceTotals = { key: 0, plier: 0, scissor: 0, knife: 0, spring: 0, screw: 0, other: 0 };
    const serviceQtys  = { key: 0, plier: 0, scissor: 0, knife: 0, spring: 0, screw: 0, other: 0 };
    let totalSales = 0;
    let totalCosts = 0;
    let totalDiscounts = 0;
    let totalMachineFees = 0;

    sales.forEach(t => {
      totalSales += t.total + (t.discount || 0);
      totalDiscounts += t.discount || 0;
      totalMachineFees += t.machineFee || 0;
      t.items.forEach(item => {
        const svc = item.service;
        if (svc in serviceTotals) {
          serviceTotals[svc as keyof typeof serviceTotals] += item.total;
          serviceQtys[svc as keyof typeof serviceQtys] += item.quantity;
        } else {
          serviceTotals.other += item.total;
          serviceQtys.other += item.quantity;
        }
        totalCosts += (item.cost || 0) * item.quantity;
      });
    });

    const totalReturns = returns.reduce((sum, t) => sum + t.total, 0);
    const totalExpenses = expenses.reduce((sum, t) => sum + t.total, 0);
    const netTotal = totalSales - totalReturns - totalDiscounts;
    const realProfit = netTotal - totalCosts - totalExpenses - totalMachineFees;

    const dateStr = new Date().toLocaleString('pt-BR');
    const periodStr = `${format(start, 'dd/MM/yyyy')} a ${format(end, 'dd/MM/yyyy')}`;
    const operatorName = profileToPrint === 'chaveiro' ? 'CHAVEIRO' : 'FABIANO';

    const sortedTransactions = [...txForProfile].sort((a, b) => b.date.getTime() - a.date.getTime());

    const html = `
      <html>
      <head>
        <title>Relatório Financeiro</title>
        <style>
          body { font-family: monospace; font-size: 11px; max-width: 300px; margin: 0 auto; padding: 10px; color: black; line-height: 1.2; }
          .text-center { text-align: center; }
          .text-right { text-align: right; }
          .bold { font-weight: bold; }
          .divider { border-bottom: 1px dashed #000; margin: 6px 0; }
          .mini-divider { border-bottom: 1px dotted #555; margin: 4px 0; }
          table { width: 100%; border-collapse: collapse; font-size: 11px; }
          th, td { padding: 1px 0; }
          .header-title { font-size: 14px; font-weight: bold; margin-bottom: 3px; text-transform: uppercase; }
        </style>
      </head>
      <body>
        <div class="text-center header-title">RELATÓRIO FINANCEIRO</div>
        <div class="text-center bold">${operatorName}</div>
        <div class="text-center bold">Chaveiro & Cutelaria</div>
        <div class="divider"></div>
        <table>
          <tr><td>PERÍODO:</td><td class="text-right bold">${periodStr}</td></tr>
          <tr><td>IMPRESSO EM:</td><td class="text-right">${dateStr}</td></tr>
        </table>
        
        <div class="divider"></div>
        <div class="bold text-center">RESUMO POR CATEGORIA</div>
        <div class="mini-divider"></div>
        <table>
          ${serviceQtys.key > 0 ? `<tr><td>Chaves (${serviceQtys.key} un):</td><td class="text-right font-mono">R$ ${serviceTotals.key.toFixed(2).replace('.', ',')}</td></tr>` : ''}
          ${serviceQtys.spring > 0 ? `<tr><td>Molinhas (${serviceQtys.spring} un):</td><td class="text-right font-mono">R$ ${serviceTotals.spring.toFixed(2).replace('.', ',')}</td></tr>` : ''}
          ${serviceQtys.screw > 0 ? `<tr><td>Parafusos (${serviceQtys.screw} un):</td><td class="text-right font-mono">R$ ${serviceTotals.screw.toFixed(2).replace('.', ',')}</td></tr>` : ''}
          ${serviceQtys.plier > 0 ? `<tr><td>Alicates (${serviceQtys.plier}):</td><td class="text-right font-mono">R$ ${serviceTotals.plier.toFixed(2).replace('.', ',')}</td></tr>` : ''}
          ${serviceQtys.scissor > 0 ? `<tr><td>Tesouras (${serviceQtys.scissor}):</td><td class="text-right font-mono">R$ ${serviceTotals.scissor.toFixed(2).replace('.', ',')}</td></tr>` : ''}
          ${serviceQtys.knife > 0 ? `<tr><td>Facas (${serviceQtys.knife}):</td><td class="text-right font-mono">R$ ${serviceTotals.knife.toFixed(2).replace('.', ',')}</td></tr>` : ''}
          ${serviceQtys.other > 0 ? `<tr><td>Outros (${serviceQtys.other}):</td><td class="text-right font-mono">R$ ${serviceTotals.other.toFixed(2).replace('.', ',')}</td></tr>` : ''}
        </table>

        <div class="divider"></div>
        <div class="bold text-center">RESUMO FINANCEIRO</div>
        <div class="mini-divider"></div>
        <table>
          <tr><td>Vendas Brutas:</td><td class="text-right font-mono">R$ ${totalSales.toFixed(2).replace('.', ',')}</td></tr>
          <tr><td>Descontos:</td><td class="text-right font-mono">- R$ ${totalDiscounts.toFixed(2).replace('.', ',')}</td></tr>
          <tr><td>Devoluções (-):</td><td class="text-right font-mono">- R$ ${totalReturns.toFixed(2).replace('.', ',')}</td></tr>
          <tr><td>Despesas (-):</td><td class="text-right font-mono">- R$ ${totalExpenses.toFixed(2).replace('.', ',')}</td></tr>
          <tr><td>Taxas Maquininha (-):</td><td class="text-right font-mono">- R$ ${totalMachineFees.toFixed(2).replace('.', ',')}</td></tr>
          <tr><td>Custo de Produtos:</td><td class="text-right font-mono">- R$ ${totalCosts.toFixed(2).replace('.', ',')}</td></tr>
          <tr class="bold" style="font-size: 12px; border-top: 1px dashed black;">
            <td>LUCRO REAL:</td>
            <td class="text-right font-mono">R$ ${realProfit.toFixed(2).replace('.', ',')}</td>
          </tr>
        </table>

        ${isDetailed ? `
        <div class="divider"></div>
        <div class="bold text-center">DETALHE DAS TRANSAÇÕES (${txForProfile.length})</div>
        <div class="divider"></div>
        
        ${sortedTransactions.map((t, idx) => {
          let typeStr = '';
          if (t.type === 'sale') typeStr = 'Venda';
          else if (t.type === 'return') typeStr = 'Devolução';
          else if (t.type === 'expense') typeStr = 'Despesa';

          let rowCost = 0;
          let rowFee = t.machineFee || 0;
          if (t.type === 'sale') {
            rowCost = t.items.reduce((sum, item) => sum + ((item.cost || 0) * item.quantity), 0);
          }
          
          let rowProfit = 0;
          if (t.type === 'sale') rowProfit = t.total - rowCost - rowFee;
          else rowProfit = -t.total;

          const timeStr = format(t.date, 'dd/MM HH:mm');
          const itemsStr = t.items.map(i => `${i.quantity}x ${i.name}`).join(', ');

          return `
            <div style="margin-bottom: 6px;">
              <div class="bold">${idx + 1}. ${typeStr} (${timeStr})</div>
              <div style="color: #444; font-size: 10px; word-break: break-all;">Itens: ${itemsStr}</div>
              <div style="display: flex; justify-content: space-between; font-size: 9px; margin-top: 2px;">
                <span>Pg: ${t.paymentMethod.toUpperCase()}</span>
                <span>Taxa: R$ ${rowFee.toFixed(2).replace('.', ',')}</span>
                <span>Custo: R$ ${rowCost.toFixed(2).replace('.', ',')}</span>
              </div>
              <div style="display: flex; justify-content: space-between; font-size: 10px; font-weight: bold; margin-top: 2px;">
                <span>Líq: R$ ${t.total.toFixed(2).replace('.', ',')}</span>
                <span>Lucro: R$ ${rowProfit.toFixed(2).replace('.', ',')}</span>
              </div>
            </div>
            <div class="mini-divider"></div>
          `;
        }).join('')}
        ` : ''}
        
        <div class="divider"></div>
        <div class="text-center" style="font-size: 9px; margin-top: 5px;">iChaveiro - Gestão Chaveiro & Cutelaria</div>
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
  };

  // Always receives a specific profile (never 'todos')
  const generatePDF = async (profileToPrint: Profile, isDetailed: boolean) => {
    const allTx = await db.transactions.where('date').between(start, end).toArray();
    const txForProfile = allTx.filter(t => t.profile === profileToPrint);

    if (txForProfile.length === 0) return alert(`Nenhuma transação de ${profileToPrint === 'chaveiro' ? 'Chaveiro' : 'Fabiano'} no período.`);

    const operatorName = profileToPrint === 'chaveiro' ? 'Chaveiro' : 'Fabiano';
    const doc = new jsPDF();
    const title = `Relatorio de Faturamento - ${operatorName.toUpperCase()}`;
    const period = `Periodo: ${format(start, 'dd/MM/yyyy')} a ${format(end, 'dd/MM/yyyy')}`;

    doc.setFontSize(14);
    doc.text(title, 14, 15);
    doc.setFontSize(9);
    doc.text(period, 14, 21);

    const sales = txForProfile.filter(t => t.type === 'sale');
    const returns = txForProfile.filter(t => t.type === 'return');
    const expenses = txForProfile.filter(t => t.type === 'expense');

    // Calculate totals by service
    const serviceTotals = { key: 0, plier: 0, scissor: 0, knife: 0, spring: 0, screw: 0, other: 0 };
    let totalSales = 0;
    let totalCosts = 0;
    let totalDiscounts = 0;
    let totalMachineFees = 0;

    sales.forEach(t => {
      totalSales += t.total + (t.discount || 0);
      totalDiscounts += t.discount || 0;
      totalMachineFees += t.machineFee || 0;
      t.items.forEach(item => {
        const svc = item.service;
        if (svc in serviceTotals) {
          serviceTotals[svc as keyof typeof serviceTotals] += item.total;
        } else {
          serviceTotals.other += item.total;
        }
        totalCosts += (item.cost || 0) * item.quantity;
      });
    });

    const totalReturns = returns.reduce((sum, t) => sum + t.total, 0);
    const totalExpenses = expenses.reduce((sum, t) => sum + t.total, 0);
    const netTotal = totalSales - totalReturns - totalDiscounts;
    const realProfit = netTotal - totalCosts - totalExpenses - totalMachineFees;

    const summaryData = [
      ['Chaves', `R$ ${serviceTotals.key.toFixed(2).replace('.', ',')}`],
      ['Molinhas de Alicate', `R$ ${serviceTotals.spring.toFixed(2).replace('.', ',')}`],
      ['Parafusos de Alicate', `R$ ${serviceTotals.screw.toFixed(2).replace('.', ',')}`],
      ['Alicates', `R$ ${serviceTotals.plier.toFixed(2).replace('.', ',')}`],
      ['Tesouras', `R$ ${serviceTotals.scissor.toFixed(2).replace('.', ',')}`],
      ['Facas', `R$ ${serviceTotals.knife.toFixed(2).replace('.', ',')}`],
      ['Outros', `R$ ${serviceTotals.other.toFixed(2).replace('.', ',')}`],
      ['---', '---'],
      ['Vendas Brutas (Subtotal)', `R$ ${totalSales.toFixed(2).replace('.', ',')}`],
      ['Descontos', `- R$ ${totalDiscounts.toFixed(2).replace('.', ',')}`],
      ['Devolucoes (-)', `- R$ ${totalReturns.toFixed(2).replace('.', ',')}`],
      ['Despesas/Retiradas (-)', `- R$ ${totalExpenses.toFixed(2).replace('.', ',')}`],
      ['Taxas Maquininha (-)', `- R$ ${totalMachineFees.toFixed(2).replace('.', ',')}`],
      ['Faturamento Liquido', `R$ ${netTotal.toFixed(2).replace('.', ',')}`],
      ['Custo de Insumos', `- R$ ${totalCosts.toFixed(2).replace('.', ',')}`],
      ['Lucro Real', `R$ ${realProfit.toFixed(2).replace('.', ',')}`],
    ];

    autoTable(doc, {
      startY: 26,
      head: [['Resumo por Categoria', 'Valor']],
      body: summaryData,
      theme: 'grid',
      headStyles: { fillColor: [59, 130, 246], fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      styles: { cellPadding: 1.5 }
    });

    if (isDetailed) {
      const transactionsData = txForProfile.sort((a, b) => b.date.getTime() - a.date.getTime()).map(t => {
        let typeStr = '';
        if (t.type === 'sale') typeStr = 'Venda';
        else if (t.type === 'return') typeStr = 'Devolucao';
        else if (t.type === 'expense') typeStr = 'Despesa';

        let rowCost = 0;
        let rowFee = t.machineFee || 0;
        if (t.type === 'sale') {
          rowCost = t.items.reduce((sum, item) => sum + ((item.cost || 0) * item.quantity), 0);
        }
        
        let rowProfit = 0;
        if (t.type === 'sale') rowProfit = t.total - rowCost - rowFee;
        else if (t.type === 'expense') rowProfit = -t.total;
        else if (t.type === 'return') rowProfit = -t.total;

        return [
          format(t.date, 'dd/MM/yyyy HH:mm'),
          typeStr,
          t.items.map(i => `${i.quantity}x ${i.name}`).join(', '),
          t.paymentMethod.toUpperCase(),
          `R$ ${t.total.toFixed(2).replace('.', ',')}`,
          `R$ ${rowFee.toFixed(2).replace('.', ',')}`,
          `R$ ${rowCost.toFixed(2).replace('.', ',')}`,
          `R$ ${rowProfit.toFixed(2).replace('.', ',')}`
        ];
      });

      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 8,
        head: [['Data/Hora', 'Tipo', 'Itens/Descricao', 'Pgto', 'Liquido', 'Taxa', 'Custo', 'Lucro']],
        body: transactionsData,
        theme: 'striped',
        headStyles: { fillColor: [30, 41, 59], fontSize: 7.5 },
        bodyStyles: { fontSize: 7 },
        styles: { cellPadding: 1.2 }
      });
    }

    doc.save(`Relatorio_${operatorName}_${format(start, 'dd-MM-yyyy')}.pdf`);
  };

  if (!transactions) return <div className="p-4 text-center">Carregando...</div>;

  const sales = transactions.filter(t => t.type === 'sale');
  const returns = transactions.filter(t => t.type === 'return');
  const expenses = transactions.filter(t => t.type === 'expense');
  
  const serviceTotals = { key: 0, plier: 0, scissor: 0, knife: 0, spring: 0, screw: 0, other: 0 };
  const serviceQtys   = { key: 0, plier: 0, scissor: 0, knife: 0, spring: 0, screw: 0, other: 0 };
  let totalGrossSales = 0;
  let totalCosts = 0;
  let totalDiscounts = 0;
  let totalMachineFees = 0;
  
  sales.forEach(t => {
    totalGrossSales += t.total + (t.discount || 0);
    totalDiscounts += t.discount || 0;
    totalMachineFees += t.machineFee || 0;
    t.items.forEach(item => {
      const svc = item.service;
      if (svc in serviceTotals) {
        serviceTotals[svc as keyof typeof serviceTotals] += item.total;
        serviceQtys[svc as keyof typeof serviceQtys] += item.quantity;
      } else {
        serviceTotals.other += item.total;
        serviceQtys.other += item.quantity;
      }
      totalCosts += (item.cost || 0) * item.quantity;
    });
  });

  const totalReturns = returns.reduce((sum, t) => sum + t.total, 0);
  const totalExpenses = expenses.reduce((sum, t) => sum + t.total, 0);
  const netTotal = totalGrossSales - totalReturns - totalDiscounts;
  const realProfit = netTotal - totalCosts - totalExpenses - totalMachineFees;

  return (
    <div className="flex flex-col h-full animate-fade-in">
      <div className="page-header flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Relatórios</h1>
          <p className="text-muted">Acompanhe seu faturamento, custos e lucros reais</p>
        </div>
        <div className="flex gap-4 items-center">
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted">Operador:</label>
            <select 
              className="input py-1 px-2 text-sm font-bold w-auto"
              value={viewProfile}
              onChange={e => setViewProfile(e.target.value as any)}
            >
              <option value="todos">Todos (Geral)</option>
              <option value="chaveiro">Chaveiro</option>
              <option value="fabiano">Fabiano</option>
            </select>
          </div>
          <button className="btn btn-success" onClick={() => setPrintModalMode('thermal')} disabled={transactions.length === 0}>
            <Printer size={20} /> Imprimir Relatório
          </button>
          <button className="btn btn-primary" onClick={() => setPrintModalMode('pdf')} disabled={transactions.length === 0}>
            <Download size={20} /> Baixar PDF
          </button>
        </div>
      </div>

      <div className="glass-panel p-6 mb-6">
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2"><Calendar size={20}/> Filtro de Período</h2>
        <div className="flex gap-4 items-end">
          <div>
            <label className="label">Período</label>
            <select className="input min-w-[200px]" value={dateRange} onChange={e => setDateRange(e.target.value as any)}>
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

      {/* Row of Categories Totals */}
      <div className="grid grid-cols-2 md:grid-cols-7 gap-3 mb-6">
        {serviceTotals.key > 0 && (
          <div className="glass-panel p-3 text-center">
            <p className="text-[11px] text-muted mb-1 font-bold uppercase">Chaves <span className="font-normal normal-case">({serviceQtys.key} un)</span></p>
            <p className="text-lg font-black text-orange-500">R$ {serviceTotals.key.toFixed(2).replace('.', ',')}</p>
          </div>
        )}
        {serviceTotals.spring > 0 && (
          <div className="glass-panel p-3 text-center">
            <p className="text-[11px] text-muted mb-1 font-bold uppercase">Molinhas <span className="font-normal normal-case">({serviceQtys.spring} un)</span></p>
            <p className="text-lg font-black text-yellow-500">R$ {serviceTotals.spring.toFixed(2).replace('.', ',')}</p>
          </div>
        )}
        {serviceTotals.screw > 0 && (
          <div className="glass-panel p-3 text-center">
            <p className="text-[11px] text-muted mb-1 font-bold uppercase">Parafusos <span className="font-normal normal-case">({serviceQtys.screw} un)</span></p>
            <p className="text-lg font-black text-amber-500">R$ {serviceTotals.screw.toFixed(2).replace('.', ',')}</p>
          </div>
        )}
        {serviceTotals.plier > 0 && (
          <div className="glass-panel p-3 text-center">
            <p className="text-[11px] text-muted mb-1 font-bold uppercase">Alicates <span className="font-normal normal-case">({serviceQtys.plier})</span></p>
            <p className="text-lg font-black text-blue-500">R$ {serviceTotals.plier.toFixed(2).replace('.', ',')}</p>
          </div>
        )}
        {serviceTotals.scissor > 0 && (
          <div className="glass-panel p-3 text-center">
            <p className="text-[11px] text-muted mb-1 font-bold uppercase">Tesouras <span className="font-normal normal-case">({serviceQtys.scissor})</span></p>
            <p className="text-lg font-black text-purple-500">R$ {serviceTotals.scissor.toFixed(2).replace('.', ',')}</p>
          </div>
        )}
        {serviceTotals.knife > 0 && (
          <div className="glass-panel p-3 text-center">
            <p className="text-[11px] text-muted mb-1 font-bold uppercase">Facas <span className="font-normal normal-case">({serviceQtys.knife})</span></p>
            <p className="text-lg font-black text-red-500">R$ {serviceTotals.knife.toFixed(2).replace('.', ',')}</p>
          </div>
        )}
        {serviceTotals.other > 0 && (
          <div className="glass-panel p-3 text-center">
            <p className="text-[11px] text-muted mb-1 font-bold uppercase">Outros <span className="font-normal normal-case">({serviceQtys.other} un)</span></p>
            <p className="text-lg font-black text-gray-400">R$ {serviceTotals.other.toFixed(2).replace('.', ',')}</p>
          </div>
        )}
        {Object.values(serviceTotals).every(v => v === 0) && (
          <div className="col-span-7 text-center text-muted py-4">Nenhuma venda no período.</div>
        )}
      </div>

      {/* Row of Financial Totals */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
        <div className="glass-panel p-4 border-l-4 border-primary">
          <p className="text-xs text-muted font-bold uppercase">Vendas Brutas</p>
          <p className="text-xl font-extrabold">R$ {totalGrossSales.toFixed(2).replace('.', ',')}</p>
        </div>
        <div className="glass-panel p-4 border-l-4 border-orange-500">
          <p className="text-xs text-muted font-bold uppercase">Descontos</p>
          <p className="text-xl font-extrabold text-orange-500">R$ {totalDiscounts.toFixed(2).replace('.', ',')}</p>
        </div>
        <div className="glass-panel p-4 border-l-4 border-red-500">
          <p className="text-xs text-muted font-bold uppercase">Devoluções (-)</p>
          <p className="text-xl font-extrabold text-red-500">R$ {totalReturns.toFixed(2).replace('.', ',')}</p>
        </div>
        <div className="glass-panel p-4 border-l-4 border-amber-600">
          <p className="text-xs text-muted font-bold uppercase">Despesas (-)</p>
          <p className="text-xl font-extrabold text-amber-500">R$ {totalExpenses.toFixed(2).replace('.', ',')}</p>
        </div>
        <div className="glass-panel p-4 border-l-4 border-purple-500">
          <p className="text-xs text-muted font-bold uppercase">Taxas Maquininha (-)</p>
          <p className="text-xl font-extrabold text-purple-400">R$ {totalMachineFees.toFixed(2).replace('.', ',')}</p>
        </div>
        <div className="glass-panel p-4 border-l-4 border-danger">
          <p className="text-xs text-muted font-bold uppercase">Custo Produtos</p>
          <p className="text-xl font-extrabold text-danger">R$ {totalCosts.toFixed(2).replace('.', ',')}</p>
        </div>
        <div className="glass-panel p-4 bg-success/15 border border-success/30 border-l-4 border-success">
          <p className="text-xs text-success font-black uppercase">Lucro Real</p>
          <p className="text-2xl font-black text-success">R$ {realProfit.toFixed(2).replace('.', ',')}</p>
        </div>
      </div>

      {/* Main List Table */}
      <div className="glass-panel flex-1 flex flex-col min-h-0">
        <div className="p-4 border-b border-[var(--border)]">
          <h2 className="text-lg font-bold">Transações do Período ({transactions.length})</h2>
        </div>
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-[var(--bg-surface)] sticky top-0">
              <tr className="border-b border-[var(--border)] text-muted text-[11px] uppercase tracking-wider">
                <th className="py-3 px-4 font-bold">Data/Hora</th>
                <th className="py-3 px-4 font-bold">Operador</th>
                <th className="py-3 px-4 font-bold">Tipo</th>
                <th className="py-3 px-4 font-bold">Itens / Descrição</th>
                <th className="py-3 px-4 font-bold">Pagto</th>
                <th className="py-3 px-4 font-bold text-right">Subtotal</th>
                <th className="py-3 px-4 font-bold text-right">Desconto</th>
                <th className="py-3 px-4 font-bold text-right">Líquido</th>
                <th className="py-3 px-4 font-bold text-right">Taxa</th>
                <th className="py-3 px-4 font-bold text-right">Custo</th>
                <th className="py-3 px-4 font-bold text-right">Lucro Real</th>
              </tr>
            </thead>
            <tbody>
              {transactions.sort((a, b) => b.date.getTime() - a.date.getTime()).map((t, i) => {
                let typeBadge = null;
                if (t.type === 'sale') {
                  typeBadge = <span className="bg-success/20 text-success border border-success/30 px-2 py-0.5 rounded text-[10px] font-bold uppercase">Venda</span>;
                } else if (t.type === 'return') {
                  typeBadge = <span className="bg-danger/20 text-danger border border-danger/30 px-2 py-0.5 rounded text-[10px] font-bold uppercase">Devolução</span>;
                } else if (t.type === 'expense') {
                  typeBadge = <span className="bg-amber-500/20 text-amber-500 border border-amber-500/30 px-2 py-0.5 rounded text-[10px] font-bold uppercase text-amber-400">Despesa</span>;
                }

                let rowGross = 0;
                let rowDiscount = 0;
                let rowNet = 0;
                let rowCost = 0;
                let rowFee = t.machineFee || 0;
                let rowProfit = 0;

                if (t.type === 'sale') {
                  rowGross = t.total + (t.discount || 0);
                  rowDiscount = t.discount || 0;
                  rowNet = t.total;
                  rowCost = t.items.reduce((sum, item) => sum + ((item.cost || 0) * item.quantity), 0);
                  rowProfit = rowNet - rowCost - rowFee;
                } else {
                  rowGross = t.total;
                  rowDiscount = 0;
                  rowNet = t.total;
                  rowCost = 0;
                  rowProfit = -t.total;
                }

                return (
                  <tr key={t.id || i} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-surface-hover)]">
                    <td className="py-3 px-4 text-xs font-mono whitespace-nowrap">{format(t.date, 'dd/MM/yyyy HH:mm')}</td>
                    <td className="py-3 px-4 text-xs font-bold uppercase text-yellow-500">{t.profile}</td>
                    <td className="py-3 px-4">{typeBadge}</td>
                    <td className="py-3 px-4 text-xs font-medium max-w-[220px] truncate" title={t.items.map(item => `${item.quantity}x ${item.name}`).join(', ')}>
                      {t.items.map(item => `${item.quantity}x ${item.name}`).join(', ')}
                    </td>
                    <td className="py-3 px-4 text-xs font-bold uppercase text-muted whitespace-nowrap">{t.paymentMethod}</td>
                    <td className="py-3 px-4 text-xs font-mono text-right text-muted">R$ {rowGross.toFixed(2).replace('.', ',')}</td>
                    <td className="py-3 px-4 text-xs font-mono text-right text-orange-500">{rowDiscount > 0 ? `- R$ ${rowDiscount.toFixed(2).replace('.', ',')}` : '-'}</td>
                    <td className={`py-3 px-4 text-xs font-mono text-right font-bold ${t.type === 'sale' ? 'text-success' : 'text-danger'}`}>
                      {t.type === 'sale' ? '+' : '-'} R$ {rowNet.toFixed(2).replace('.', ',')}
                    </td>
                    <td className="py-3 px-4 text-xs font-mono text-right text-purple-400">{rowFee > 0 ? `- R$ ${rowFee.toFixed(2).replace('.', ',')}` : '-'}</td>
                    <td className="py-3 px-4 text-xs font-mono text-right text-danger">{rowCost > 0 ? `R$ ${rowCost.toFixed(2).replace('.', ',')}` : '-'}</td>
                    <td className={`py-3 px-4 text-xs font-mono text-right font-black ${rowProfit > 0 ? 'text-success' : rowProfit < 0 ? 'text-danger' : 'text-muted'}`}>
                      {rowProfit > 0 ? '+' : ''} R$ {rowProfit.toFixed(2).replace('.', ',')}
                    </td>
                  </tr>
                );
              })}
              {transactions.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-muted">Nenhuma transação no período.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {/* Operator selection modal */}
      {printModalMode !== null && (
        <div
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
            backgroundColor: 'rgba(0,0,0,0.80)', backdropFilter: 'blur(4px)'
          }}
          onClick={() => setPrintModalMode(null)}
        >
          <div
            style={{
              backgroundColor: '#1e293b',
              border: `4px solid ${printModalMode === 'thermal' ? '#22c55e' : '#3b82f6'}`,
              borderRadius: '16px', padding: '32px', maxWidth: '420px', width: '95%',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.7)', textAlign: 'center',
              display: 'flex', flexDirection: 'column', gap: '20px', color: '#fff'
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ fontSize: '2rem' }}>{printModalMode === 'thermal' ? '🖨️' : '📄'}</div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 900, textTransform: 'uppercase', margin: 0, color: printModalMode === 'thermal' ? '#4ade80' : '#60a5fa' }}>
              {printModalMode === 'thermal' ? 'Imprimir Relatório' : 'Baixar PDF'}
            </h2>
            <p style={{ color: '#94a3b8', margin: 0, fontSize: '0.95rem' }}>
              Escolha o formato e o operador para gerar o relatório.
            </p>
            
            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
              <button
                onClick={() => setPrintModalDetailed(false)}
                style={{
                  flex: 1, padding: '10px', fontSize: '1rem', fontWeight: 'bold',
                  borderRadius: '6px', border: '1px solid #475569',
                  backgroundColor: !printModalDetailed ? '#334155' : 'transparent',
                  color: !printModalDetailed ? '#fff' : '#94a3b8', cursor: 'pointer'
                }}
              >
                📄 Resumido
              </button>
              <button
                onClick={() => setPrintModalDetailed(true)}
                style={{
                  flex: 1, padding: '10px', fontSize: '1rem', fontWeight: 'bold',
                  borderRadius: '6px', border: '1px solid #475569',
                  backgroundColor: printModalDetailed ? '#334155' : 'transparent',
                  color: printModalDetailed ? '#fff' : '#94a3b8', cursor: 'pointer'
                }}
              >
                📋 Detalhado
              </button>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => {
                  setPrintModalMode(null);
                  if (printModalMode === 'thermal') printThermalReport('chaveiro', printModalDetailed);
                  else generatePDF('chaveiro', printModalDetailed);
                }}
                style={{
                  flex: 1, padding: '16px', fontSize: '1.2rem', fontWeight: 900,
                  borderRadius: '8px', textTransform: 'uppercase', border: 'none',
                  cursor: 'pointer', backgroundColor: '#dc2626', color: '#fff',
                  boxShadow: '0 4px 6px rgba(0,0,0,0.2)'
                }}
              >
                🔑 Chaveiro
              </button>
              <button
                onClick={() => {
                  setPrintModalMode(null);
                  if (printModalMode === 'thermal') printThermalReport('fabiano', printModalDetailed);
                  else generatePDF('fabiano', printModalDetailed);
                }}
                style={{
                  flex: 1, padding: '16px', fontSize: '1.2rem', fontWeight: 900,
                  borderRadius: '8px', textTransform: 'uppercase', border: 'none',
                  cursor: 'pointer', backgroundColor: '#2563eb', color: '#fff',
                  boxShadow: '0 4px 6px rgba(0,0,0,0.2)'
                }}
              >
                ✂️ Fabiano
              </button>
            </div>
            <button
              onClick={() => setPrintModalMode(null)}
              style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '0.85rem' }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
