import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { Profile } from '../db/db';
import { format, startOfDay, endOfDay, startOfMonth, endOfMonth, startOfYear, endOfYear, subDays } from 'date-fns';
import { Download, Calendar, Printer, X, Receipt } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export const Reports = () => {
  const [viewProfile, setViewProfile] = React.useState<Profile | 'todos'>('chaveiro');
  const [activeTab, setActiveTab] = useState<'finance' | 'losses'>('finance');
  const [dateRange, setDateRange] = useState<'today' | 'week' | 'month' | 'year' | 'custom'>('today');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [selectedTx, setSelectedTx] = useState<any>(null);

  const [printModalMode, setPrintModalMode] = useState<'thermal' | 'pdf' | null>(null);
  const [printModalDetailed, setPrintModalDetailed] = useState(false);

  const getDates = React.useCallback(() => {
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
  }, [dateRange, customStart, customEnd]);

  const { start, end } = React.useMemo(() => getDates(), [getDates]);

  const transactions = useLiveQuery(
    () => {
      let query = db.transactions.where('date').between(start, end);
      if (viewProfile !== 'todos') {
        return query.filter(t => t.profile === viewProfile).toArray();
      }
      return query.toArray();
    },
    [start.getTime(), end.getTime(), viewProfile]
  );

  const losses = useLiveQuery(
    () => {
      let query = db.losses.where('date').between(start, end);
      if (viewProfile !== 'todos') {
        return query.filter(l => l.operator === viewProfile).toArray();
      }
      return query.toArray();
    },
    [start.getTime(), end.getTime(), viewProfile]
  ) || [];

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

    const serviceTotals = { key: 0, plier_sharp: 0, plier: 0, scissor: 0, knife: 0, spring: 0, screw: 0, other: 0 };
    const serviceQtys  = { key: 0, plier_sharp: 0, plier: 0, scissor: 0, knife: 0, spring: 0, screw: 0, other: 0 };
    let totalSales = 0;
    let totalCosts = 0;
    let totalDiscounts = 0;
    let totalMachineFees = 0;

    let totalDinheiro = 0;
    let totalPix = 0;
    let totalDebito = 0;
    let totalCredito = 0;

    sales.forEach(t => {
      totalSales += t.total + (t.discount || 0);
      totalDiscounts += t.discount || 0;
      totalMachineFees += t.machineFee || 0;

      if (t.paymentMethod === 'split' && t.splitPayments) {
        t.splitPayments.forEach(sp => {
          if (sp.method === 'cash') totalDinheiro += sp.amount;
          else if (sp.method === 'pix') totalPix += sp.amount;
          else if (sp.method === 'debit') totalDebito += sp.amount;
          else if (sp.method === 'credit') totalCredito += sp.amount;
        });
      } else {
        if (t.paymentMethod === 'cash') totalDinheiro += t.total;
        else if (t.paymentMethod === 'pix') totalPix += t.total;
        else if (t.paymentMethod === 'debit') totalDebito += t.total;
        else if (t.paymentMethod === 'credit') totalCredito += t.total;
      }

      t.items.forEach(item => {
        let svc = item.service;
        if (svc === 'plier') {
          const nameLower = item.name.toLowerCase();
          if (nameLower.includes('afiação') || nameLower.includes('afiacao') || nameLower.includes('afiaçao') || nameLower.includes('afiador') || t.profile === 'chaveiro' || item.productId === 1) {
            svc = 'plier_sharp' as any;
          }
        }
        
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

    const pureExpenses = expenses.filter(t => !t.items[0]?.name.startsWith('Pagamento de Diária:'));
    const wageExpenses = expenses.filter(t => t.items[0]?.name.startsWith('Pagamento de Diária:'));
    
    const totalPureExpenses = pureExpenses.reduce((sum, t) => sum + t.total, 0);
    const wageTotals: Record<string, number> = {};
    let totalWageExpenses = 0;
    
    wageExpenses.forEach(t => {
      const name = t.items[0].name.replace('Pagamento de Diária: ', '');
      wageTotals[name] = (wageTotals[name] || 0) + t.total;
      totalWageExpenses += t.total;
    });

    const totalReturns = returns.reduce((sum, t) => sum + t.total, 0);
    const netTotal = totalSales - totalReturns - totalDiscounts;
    const realProfit = netTotal - totalCosts - totalPureExpenses - totalWageExpenses - totalMachineFees;

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
          ${serviceQtys.plier_sharp > 0 ? `<tr><td>Afiações Alicate (${serviceQtys.plier_sharp}):</td><td class="text-right font-mono">R$ ${serviceTotals.plier_sharp.toFixed(2).replace('.', ',')}</td></tr>` : ''}
          ${serviceQtys.plier > 0 ? `<tr><td>Venda Alicates (${serviceQtys.plier}):</td><td class="text-right font-mono">R$ ${serviceTotals.plier.toFixed(2).replace('.', ',')}</td></tr>` : ''}
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
          <tr><td>Despesas (Insumos):</td><td class="text-right font-mono">- R$ ${totalPureExpenses.toFixed(2).replace('.', ',')}</td></tr>
          ${Object.entries(wageTotals).map(([name, amount]) => `<tr><td>Diária (${name}):</td><td class="text-right font-mono">- R$ ${amount.toFixed(2).replace('.', ',')}</td></tr>`).join('')}
          <tr><td>Taxas Maquininha (-):</td><td class="text-right font-mono">- R$ ${totalMachineFees.toFixed(2).replace('.', ',')}</td></tr>
          <tr><td>Custo de Produtos:</td><td class="text-right font-mono">- R$ ${totalCosts.toFixed(2).replace('.', ',')}</td></tr>
          <tr class="bold" style="font-size: 12px; border-top: 1px dashed black;">
            <td>LUCRO REAL:</td>
            <td class="text-right font-mono">R$ ${realProfit.toFixed(2).replace('.', ',')}</td>
          </tr>
        </table>

        <div class="divider"></div>
        <div class="bold text-center">MEIOS DE PAGAMENTO</div>
        <div class="mini-divider"></div>
        <table>
          <tr><td>Dinheiro:</td><td class="text-right font-mono">R$ ${totalDinheiro.toFixed(2).replace('.', ',')}</td></tr>
          <tr><td>PIX:</td><td class="text-right font-mono">R$ ${totalPix.toFixed(2).replace('.', ',')}</td></tr>
          <tr><td>Débito:</td><td class="text-right font-mono">R$ ${totalDebito.toFixed(2).replace('.', ',')}</td></tr>
          <tr><td>Crédito:</td><td class="text-right font-mono">R$ ${totalCredito.toFixed(2).replace('.', ',')}</td></tr>
        </table>

        ${isDetailed ? `
        <div class="divider"></div>
        <div class="bold text-center">DETALHE DAS TRANSAÇÕES (${txForProfile.length})</div>
        <div class="divider"></div>
        
        ${sortedTransactions.map((t, idx) => {
          let typeStr = '';
          if (t.type === 'sale') typeStr = t.profile === 'chaveiro' ? 'Serviço' : 'Venda';
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
                <span>Pg: ${t.paymentMethod === 'cash' ? 'DIN' : t.paymentMethod === 'credit' ? 'CRÉD' : t.paymentMethod === 'debit' ? 'DÉB' : t.paymentMethod === 'pix' ? 'PIX' : 'MÚLT'}</span>
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
    const serviceTotals = { key: 0, plier_sharp: 0, plier: 0, scissor: 0, knife: 0, spring: 0, screw: 0, other: 0 };
    let totalSales = 0;
    let totalCosts = 0;
    let totalDiscounts = 0;
    let totalMachineFees = 0;

    let totalDinheiro = 0;
    let totalPix = 0;
    let totalDebito = 0;
    let totalCredito = 0;

    sales.forEach(t => {
      totalSales += t.total + (t.discount || 0);
      totalDiscounts += t.discount || 0;
      totalMachineFees += t.machineFee || 0;

      if (t.paymentMethod === 'split' && t.splitPayments) {
        t.splitPayments.forEach(sp => {
          if (sp.method === 'cash') totalDinheiro += sp.amount;
          else if (sp.method === 'pix') totalPix += sp.amount;
          else if (sp.method === 'debit') totalDebito += sp.amount;
          else if (sp.method === 'credit') totalCredito += sp.amount;
        });
      } else {
        if (t.paymentMethod === 'cash') totalDinheiro += t.total;
        else if (t.paymentMethod === 'pix') totalPix += t.total;
        else if (t.paymentMethod === 'debit') totalDebito += t.total;
        else if (t.paymentMethod === 'credit') totalCredito += t.total;
      }

      t.items.forEach(item => {
        let svc = item.service;
        if (svc === 'plier') {
          const nameLower = item.name.toLowerCase();
          if (nameLower.includes('afiação') || nameLower.includes('afiacao') || nameLower.includes('afiaçao') || nameLower.includes('afiador') || t.profile === 'chaveiro' || item.productId === 1) {
            svc = 'plier_sharp' as any;
          }
        }
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
      ['Afiações Alicate', `R$ ${serviceTotals.plier_sharp.toFixed(2).replace('.', ',')}`],
      ['Venda Alicates', `R$ ${serviceTotals.plier.toFixed(2).replace('.', ',')}`],
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
      ['---', '---'],
      ['Vendas em Dinheiro', `R$ ${totalDinheiro.toFixed(2).replace('.', ',')}`],
      ['Vendas em PIX', `R$ ${totalPix.toFixed(2).replace('.', ',')}`],
      ['Vendas em Debito', `R$ ${totalDebito.toFixed(2).replace('.', ',')}`],
      ['Vendas em Credito', `R$ ${totalCredito.toFixed(2).replace('.', ',')}`],
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
        if (t.type === 'sale') typeStr = t.profile === 'chaveiro' ? 'Serviço' : 'Venda';
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
          t.paymentMethod === 'cash' ? 'DINHEIRO' : t.paymentMethod === 'credit' ? 'CRÉDITO' : t.paymentMethod === 'debit' ? 'DÉBITO' : t.paymentMethod === 'pix' ? 'PIX' : 'MÚLTIPLO',
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
  
  const serviceTotals = { key: 0, plier_sharp: 0, plier: 0, scissor: 0, knife: 0, spring: 0, screw: 0, other: 0 };
  const serviceQtys   = { key: 0, plier_sharp: 0, plier: 0, scissor: 0, knife: 0, spring: 0, screw: 0, other: 0 };
  let totalGrossSales = 0;
  let totalCosts = 0;
  let totalDiscounts = 0;
  let totalMachineFees = 0;
  
  let totalCash = 0;
  let totalPix = 0;
  let totalDebit = 0;
  let totalCredit = 0;

  sales.forEach(t => {
    totalGrossSales += t.total + (t.discount || 0);
    totalDiscounts += t.discount || 0;
    totalMachineFees += t.machineFee || 0;

    if (t.paymentMethod === 'split' && t.splitPayments) {
      t.splitPayments.forEach(sp => {
        if (sp.method === 'cash') totalCash += sp.amount;
        else if (sp.method === 'pix') totalPix += sp.amount;
        else if (sp.method === 'debit') totalDebit += sp.amount;
        else if (sp.method === 'credit') totalCredit += sp.amount;
      });
    } else {
      if (t.paymentMethod === 'cash') totalCash += t.total;
      else if (t.paymentMethod === 'pix') totalPix += t.total;
      else if (t.paymentMethod === 'debit') totalDebit += t.total;
      else if (t.paymentMethod === 'credit') totalCredit += t.total;
    }

    t.items.forEach(item => {
      let svc = item.service;
      if (svc === 'plier') {
        const nameLower = item.name.toLowerCase();
        if (nameLower.includes('afiação') || nameLower.includes('afiacao') || nameLower.includes('afiaçao') || nameLower.includes('afiador') || t.profile === 'chaveiro' || item.productId === 1) {
          svc = 'plier_sharp' as any;
        }
      }
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

  let totalWages = 0;
  let pureExpenses = 0;

  expenses.forEach(t => {
    t.items.forEach(item => {
      if (item.name.startsWith('Diária:')) {
        totalWages += item.total;
      } else {
        pureExpenses += item.total;
      }
    });
  });

  const totalReturns = returns.reduce((sum, t) => sum + t.total, 0);
  const totalExpenses = pureExpenses + totalWages;
  const netTotal = totalGrossSales - totalReturns - totalDiscounts;
  const realProfit = netTotal - totalCosts - totalExpenses - totalMachineFees;
  const totalPaymentMethods = totalCash + totalPix + totalDebit + totalCredit;

  return (
    <div className="flex flex-col h-full animate-fade-in">
      <div className="page-header flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Relatórios</h1>
          <p className="text-muted">Acompanhe seu faturamento, custos e perdas</p>
          <div className="flex gap-2 mt-4">
            <button 
              style={{
                padding: '8px 16px', fontWeight: 'bold', textTransform: 'uppercase', borderRadius: '12px', transition: 'background-color 0.2s',
                backgroundColor: activeTab === 'finance' ? '#3b82f6' : 'var(--bg-surface)',
                color: activeTab === 'finance' ? '#ffffff' : 'var(--text-muted)',
                border: 'none', cursor: 'pointer'
              }}
              onClick={() => setActiveTab('finance')}
            >
              Financeiro
            </button>
            <button 
              style={{
                padding: '8px 16px', fontWeight: 'bold', textTransform: 'uppercase', borderRadius: '12px', transition: 'background-color 0.2s',
                backgroundColor: activeTab === 'losses' ? '#dc2626' : 'var(--bg-surface)',
                color: activeTab === 'losses' ? '#ffffff' : 'var(--text-muted)',
                border: 'none', cursor: 'pointer'
              }}
              onClick={() => setActiveTab('losses')}
            >
              Perdas e Trocas
            </button>
          </div>
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
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2"><Calendar size={20} className="text-primary" /> Filtro de Período</h2>
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

      {activeTab === 'finance' && (
        <>
      {/* Dashboard Summary - Aligned to Left without stretching */}
      <div className="flex mb-6" style={{ flexWrap: 'wrap', gap: '24px' }}>
        
        {/* Column 1: Items List */}
        <div className="glass-panel p-6 flex flex-col" style={{ flex: 1, minWidth: '320px', maxWidth: '400px' }}>
          <h3 className="text-sm font-bold text-muted uppercase tracking-wider mb-4 border-b border-[var(--border)] pb-2">Serviços e Itens</h3>
          <div className="flex flex-col gap-2 overflow-y-auto custom-scrollbar" style={{ flex: 1, maxHeight: '250px', paddingRight: '8px' }}>
            {[
              { name: 'Chaves', qty: serviceQtys.key, val: serviceTotals.key },
              { name: 'Molinhas', qty: serviceQtys.spring, val: serviceTotals.spring },
              { name: 'Parafusos', qty: serviceQtys.screw, val: serviceTotals.screw },
              { name: 'Afiações Alicate', qty: serviceQtys.plier_sharp, val: serviceTotals.plier_sharp },
              { name: 'Venda Alicates', qty: serviceQtys.plier, val: serviceTotals.plier },
              { name: 'Tesouras', qty: serviceQtys.scissor, val: serviceTotals.scissor },
              { name: 'Facas', qty: serviceQtys.knife, val: serviceTotals.knife },
              { name: 'Outros', qty: serviceQtys.other, val: serviceTotals.other },
            ].filter(i => i.qty > 0).map((item, idx) => (
              <div key={idx} className="flex justify-between items-center rounded border border-[var(--border)]" style={{ backgroundColor: 'rgba(0,0,0,0.2)', padding: '10px' }}>
                <span className="text-sm font-bold">{item.name} <span className="text-muted text-xs font-normal">({item.qty} un)</span></span>
                <span className="font-bold text-primary">R$ {item.val.toFixed(2).replace('.', ',')}</span>
              </div>
            ))}
            {Object.values(serviceQtys).every(v => v === 0) && (
              <div className="text-center text-muted text-sm py-4">Nenhum item no período.</div>
            )}
          </div>
        </div>

        {/* Column 2: Payment Methods */}
        <div className="glass-panel p-6 flex flex-col" style={{ flex: 1, minWidth: '320px', maxWidth: '400px' }}>
          <h3 className="text-sm font-bold text-muted uppercase tracking-wider mb-4 border-b border-[var(--border)] pb-2">Pagamentos</h3>
          <div className="flex flex-col" style={{ gap: '12px' }}>
            <div className="flex justify-between items-center rounded" style={{ backgroundColor: 'rgba(0,0,0,0.2)', padding: '12px', borderLeft: '4px solid #16a34a' }}>
              <span className="text-sm font-bold uppercase text-muted">Dinheiro</span>
              <span className="font-black text-lg" style={{ color: '#16a34a' }}>R$ {totalCash.toFixed(2).replace('.', ',')}</span>
            </div>
            <div className="flex justify-between items-center rounded" style={{ backgroundColor: 'rgba(0,0,0,0.2)', padding: '12px', borderLeft: '4px solid #14b8a6' }}>
              <span className="text-sm font-bold uppercase text-muted">Pix</span>
              <span className="font-black text-lg" style={{ color: '#14b8a6' }}>R$ {totalPix.toFixed(2).replace('.', ',')}</span>
            </div>
            <div className="flex justify-between items-center rounded" style={{ backgroundColor: 'rgba(0,0,0,0.2)', padding: '12px', borderLeft: '4px solid #2563eb' }}>
              <span className="text-sm font-bold uppercase text-muted">Débito</span>
              <span className="font-black text-lg" style={{ color: '#2563eb' }}>R$ {totalDebit.toFixed(2).replace('.', ',')}</span>
            </div>
            <div className="flex justify-between items-center rounded" style={{ backgroundColor: 'rgba(0,0,0,0.2)', padding: '12px', borderLeft: '4px solid #9333ea' }}>
              <span className="text-sm font-bold uppercase text-muted">Crédito</span>
              <span className="font-black text-lg" style={{ color: '#9333ea' }}>R$ {totalCredit.toFixed(2).replace('.', ',')}</span>
            </div>
            <div className="flex justify-between items-center rounded" style={{ marginTop: 'auto', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
              <span className="font-bold uppercase text-sm text-muted">Total Recebido</span>
              <span className="font-black text-lg">R$ {totalPaymentMethods.toFixed(2).replace('.', ',')}</span>
            </div>
          </div>
        </div>

        {/* Column 3: Financial Breakdown */}
        <div className="glass-panel p-6 flex flex-col" style={{ flex: 1, minWidth: '320px', maxWidth: '400px' }}>
          <h3 className="text-sm font-bold text-muted uppercase tracking-wider mb-4 border-b border-[var(--border)] pb-2">Demonstrativo</h3>
          <div className="flex flex-col" style={{ gap: '10px' }}>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted font-medium">Vendas Brutas</span>
              <span className="font-bold">R$ {totalGrossSales.toFixed(2).replace('.', ',')}</span>
            </div>
            <div className="flex justify-between items-center" style={{ color: '#f97316' }}>
              <span className="text-sm font-medium">Descontos (-)</span>
              <span className="font-bold">R$ {totalDiscounts.toFixed(2).replace('.', ',')}</span>
            </div>
            <div className="flex justify-between items-center" style={{ color: '#ef4444' }}>
              <span className="text-sm font-medium">Devoluções (-)</span>
              <span className="font-bold">R$ {totalReturns.toFixed(2).replace('.', ',')}</span>
            </div>
            <div className="flex justify-between items-center" style={{ color: '#d97706' }}>
              <span className="text-sm font-medium">Insumos/Outros (-)</span>
              <span className="font-bold">R$ {pureExpenses.toFixed(2).replace('.', ',')}</span>
            </div>
            <div className="flex justify-between items-center" style={{ color: '#f59e0b' }}>
              <span className="text-sm font-medium">Pagamento Diárias (-)</span>
              <span className="font-bold">R$ {totalWages.toFixed(2).replace('.', ',')}</span>
            </div>
            <div className="flex justify-between items-center" style={{ color: '#c084fc' }}>
              <span className="text-sm font-medium">Taxas Maquininha (-)</span>
              <span className="font-bold">R$ {totalMachineFees.toFixed(2).replace('.', ',')}</span>
            </div>
            <div className="flex justify-between items-center" style={{ color: 'var(--danger)' }}>
              <span className="text-sm font-medium">Custo Produtos (-)</span>
              <span className="font-bold">R$ {totalCosts.toFixed(2).replace('.', ',')}</span>
            </div>
            <div className="flex justify-between items-center rounded" style={{ marginTop: 'auto', paddingTop: '12px', borderTop: '1px solid var(--border)', backgroundColor: 'rgba(16, 185, 129, 0.15)', padding: '12px', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
              <span className="font-black uppercase text-sm" style={{ color: 'var(--success)' }}>Lucro Real</span>
              <span className="text-xl font-black" style={{ color: 'var(--success)' }}>R$ {realProfit.toFixed(2).replace('.', ',')}</span>
            </div>
          </div>
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
                  const hasPhysicalProduct = t.items.some(item => {
                    if (item.isService !== undefined) return !item.isService;
                    if (item.service === 'key') return false;
                    if (item.service === 'plier' && (item.productId === 1 || item.name.toLowerCase().includes('afia'))) return false;
                    if (item.service === 'other' && item.name.toLowerCase().includes('serviço')) return false;
                    return true; 
                  });
                  const displayType = t.profile === 'chaveiro' ? 'Serviço' : (hasPhysicalProduct ? 'Venda' : 'Serviço');
                  
                  typeBadge = <span className="bg-success/20 text-success border border-success/30 px-2 py-0.5 rounded text-[10px] font-bold uppercase">{displayType}</span>;
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
                  <tr 
                    key={t.id || i} 
                    className="border-b border-[var(--border)] last:border-0 table-row-hover"
                    onClick={() => setSelectedTx(t)}
                    title="Clique para ver detalhes desta venda"
                  >
                    <td className="py-3 px-4 text-xs font-mono whitespace-nowrap">{format(t.date, 'dd/MM/yyyy HH:mm')}</td>
                    <td className="py-3 px-4 text-xs font-bold uppercase text-yellow-500">{t.profile}</td>
                    <td className="py-3 px-4">{typeBadge}</td>
                    <td className="py-3 px-4 text-xs font-medium max-w-[220px] truncate" title={t.items.map(item => `${item.quantity}x ${item.name}`).join(', ')}>
                      {t.items.map(item => `${item.quantity}x ${item.name}`).join(', ')}
                    </td>
                    <td className="py-3 px-4 text-xs font-bold uppercase text-muted whitespace-nowrap">{t.paymentMethod === 'cash' ? 'Dinheiro' : t.paymentMethod === 'credit' ? 'Crédito' : t.paymentMethod === 'debit' ? 'Débito' : t.paymentMethod === 'pix' ? 'PIX' : 'Múltiplo'}</td>
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
      </>
      )}

      {activeTab === 'losses' && (
        <div className="glass-panel flex-1 flex flex-col min-h-0 animate-fade-in">
          <div className="p-4 border-b border-[var(--border)]">
            <h2 className="text-lg font-bold">Registro de Perdas e Trocas ({losses.length})</h2>
          </div>
          <div className="flex-1 overflow-auto">
            <table className="w-full text-left border-collapse whitespace-nowrap">
              <thead className="bg-[var(--bg-surface)] sticky top-0">
                <tr className="border-b border-[var(--border)] text-muted text-[11px] uppercase tracking-wider">
                  <th className="py-3 px-4 font-bold text-left">Data/Hora</th>
                  <th className="py-3 px-4 font-bold text-left">Operador</th>
                  <th className="py-3 px-4 font-bold text-left">Motivo</th>
                  <th className="py-3 px-4 font-bold text-left">Produto</th>
                  <th className="py-3 px-4 font-bold text-center">Quantidade</th>
                  <th className="py-3 px-4 font-bold text-left">Observações</th>
                </tr>
              </thead>
              <tbody>
                {losses.sort((a, b) => b.date.getTime() - a.date.getTime()).map((l, i) => (
                  <tr key={l.id || i} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-surface-hover)]">
                    <td className="py-3 px-4 text-xs font-mono whitespace-nowrap">{format(l.date, 'dd/MM/yyyy HH:mm')}</td>
                    <td className="py-3 px-4 text-xs font-bold uppercase text-yellow-500">{l.operator}</td>
                    <td className="py-3 px-4">
                      {l.type === 'error' ? (
                        <span className="bg-red-500/20 text-red-500 border border-red-500/30 px-2 py-0.5 rounded text-[10px] font-bold uppercase">Erro de Corte</span>
                      ) : (
                        <span className="bg-orange-500/20 text-orange-500 border border-orange-500/30 px-2 py-0.5 rounded text-[10px] font-bold uppercase">Troca</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-sm font-medium">
                      <span className="text-gray-400 mr-2 text-xs">#{l.productCode}</span>
                      {l.productName}
                    </td>
                    <td className="py-3 px-4 text-sm font-bold text-center text-white">{l.quantity}</td>
                    <td className="py-3 px-4 text-xs text-muted max-w-[200px] truncate" title={l.notes}>{l.notes || '-'}</td>
                  </tr>
                ))}
                {losses.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-muted">Nenhum registro de perda neste período.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
                {selectedTx.discount > 0 && (
                  <div className="flex justify-between text-sm text-orange-500">
                    <span>Desconto Extra:</span>
                    <span>- R$ {selectedTx.discount.toFixed(2).replace('.', ',')}</span>
                  </div>
                )}
                <div className="flex justify-between text-base font-bold mt-1 mb-2 pt-1 border-t border-[var(--border)/50]">
                  <span>Total Cobrado:</span>
                  <span>R$ {selectedTx.total.toFixed(2).replace('.', ',')}</span>
                </div>
                
                {selectedTx.machineFee > 0 && (
                  <div className="flex justify-between text-sm text-purple-400">
                    <span>Taxa Maquininha:</span>
                    <span>- R$ {selectedTx.machineFee.toFixed(2).replace('.', ',')}</span>
                  </div>
                )}
                
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
    </div>
  );
};
