import React, { useState, useEffect, useRef } from 'react';
import { db, type ServiceType, type PaymentMethod, type TransactionItem } from '../db/db';
import type { Profile } from '../db/db';
import { CheckCircle, Trash2, Banknote, CreditCard, Smartphone, Search, Plus, Tag, Package, Printer } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { RegisterLossModal } from '../components/RegisterLossModal';
import { runAutoBackup } from '../db/sync';
import { StandaloneReceiptModal } from '../components/StandaloneReceiptModal';
import { StorageBoxModal } from '../components/StorageBoxModal';
import { differenceInDays } from 'date-fns';

export const Pos = () => {
  const [transactionProfile, setTransactionProfile] = useState<Profile>(() => {
    return (localStorage.getItem('ichaveiro_last_profile') as Profile) || 'chaveiro';
  });

  useEffect(() => {
    localStorage.setItem('ichaveiro_last_profile', transactionProfile);
  }, [transactionProfile]);
  const [items, setItems] = useState<TransactionItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [splitPayments, setSplitPayments] = useState<{ method: PaymentMethod, amount: number }[]>([]);
  const [currentSplitMethod, setCurrentSplitMethod] = useState<PaymentMethod>('pix');
  const [currentSplitAmount, setCurrentSplitAmount] = useState<string>('');
  const [clientCode, setClientCode] = useState('');
  const [searchProduct, setSearchProduct] = useState('');
  const [discount, setDiscount] = useState<string>('');
  const [cashReceived, setCashReceived] = useState<string>('');
  const [customUnitPrice, setCustomUnitPrice] = useState<string>('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printTwoCopies, setPrintTwoCopies] = useState(false);
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [showLossModal, setShowLossModal] = useState(false);
  const [showStandaloneModal, setShowStandaloneModal] = useState(false);
  const [showStorageBoxModal, setShowStorageBoxModal] = useState(false);
  const [updateProgress, setUpdateProgress] = useState<number | null>(null);

  useEffect(() => {
    // @ts-ignore
    if (window.require) {
      // @ts-ignore
      const { ipcRenderer } = window.require('electron');
      const handleProgress = (event: any, percent: number) => {
        setUpdateProgress(percent);
      };
      ipcRenderer.on('download-progress', handleProgress);
      return () => {
        ipcRenderer.removeListener('download-progress', handleProgress);
      };
    }
  }, []);

  // Pending Sales states
  const [activePendingSaleId, setActivePendingSaleId] = useState<number | null>(null);
  const [showPendingModal, setShowPendingModal] = useState(false);
  const [pendingClientName, setPendingClientName] = useState('');
  const [pendingClientPhone, setPendingClientPhone] = useState('');

  // Cash Register (Caixa) Session states
  const [openRegisterCash, setOpenRegisterCash] = useState<string>(() => localStorage.getItem('ichaveiro_last_drawer_left') || '0,00');
  const [showCloseRegisterModal, setShowCloseRegisterModal] = useState(false);
  const [closeRegisterCash, setCloseRegisterCash] = useState<string>('');
  const [selectedEmployeesToPay, setSelectedEmployeesToPay] = useState<number[]>([]);
  const [customWages, setCustomWages] = useState<Record<number, string>>({});
  const employees = useLiveQuery(() => db.employees?.toArray() || []);
  const [closeLeftInDrawer, setCloseLeftInDrawer] = useState<string>(() => localStorage.getItem('ichaveiro_last_drawer_left') || '0,00');

  // Expense states
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseDescription, setExpenseDescription] = useState('');

  const activeSession = useLiveQuery(
    async () => {
      const sess = await db.cashSessions.where('profile').equals(transactionProfile).filter(s => s.status === 'open').first();
      return sess || null;
    },
    [transactionProfile]
  );

  const sessionTransactions = useLiveQuery(async () => {
    if (!activeSession) return [];
    return await db.transactions
      .where('date')
      .aboveOrEqual(activeSession.openedAt)
      .toArray();
  }, [activeSession]);

  const sessionTotals = React.useMemo(() => {
    if (!sessionTransactions) return { cash: 0, pix: 0, debit: 0, credit: 0, totalSales: 0, expenses: 0 };
    const filteredSales = sessionTransactions.filter(t => t.profile === transactionProfile && t.type === 'sale');
    const filteredExpenses = sessionTransactions.filter(t => t.profile === transactionProfile && t.type === 'expense');
    
    let cash = 0;
    let pix = 0;
    let debit = 0;
    let credit = 0;

    for (const t of filteredSales) {
      if (t.paymentMethod === 'split' && t.splitPayments) {
        for (const p of t.splitPayments) {
          if (p.method === 'cash') cash += p.amount;
          else if (p.method === 'pix') pix += p.amount;
          else if (p.method === 'debit') debit += p.amount;
          else if (p.method === 'credit') credit += p.amount;
        }
      } else {
        if (t.paymentMethod === 'cash') cash += t.total;
        else if (t.paymentMethod === 'pix') pix += t.total;
        else if (t.paymentMethod === 'debit') debit += t.total;
        else if (t.paymentMethod === 'credit') credit += t.total;
      }
    }

    let expenses = 0;
    for (const t of filteredExpenses) {
      if (t.paymentMethod === 'cash') expenses += t.total;
    }

    return {
      cash,
      pix,
      debit,
      credit,
      totalSales: cash + pix + debit + credit,
      expenses
    };
  }, [sessionTransactions, transactionProfile]);

  const searchInputRef = useRef<HTMLInputElement>(null);

  const products = useLiveQuery(
    () => db.products.toArray(),
    [transactionProfile]
  );

  const pendingSalesQuery = useLiveQuery(
    () => db.pendingSales.where('profile').equals(transactionProfile).toArray(),
    [transactionProfile]
  );
  const pendingSales = pendingSalesQuery || [];
  
  const todayDate = new Date();
  const recentPendingSales = pendingSales.filter(s => differenceInDays(todayDate, s.date) <= 7);
  const archivedPendingSales = pendingSales.filter(s => differenceInDays(todayDate, s.date) > 7);

  const parseSearchInput = (input: string) => {
    const match = input.match(/^(.+?)(?:[xX*]\s*(\d+))?$/);
    if (!match) return { term: input.trim(), qty: 1 };
    return {
      term: match[1].trim(),
      qty: match[2] ? parseInt(match[2], 10) : 1
    };
  };

  let filteredProducts: any[] = [];
  let currentQty = 1;

  if (searchProduct.trim() !== '') {
    const parsed = parseSearchInput(searchProduct);
    currentQty = parsed.qty;
    const term = parsed.term.toLowerCase();

    const exactCodeMatches = products?.filter(p => p.code?.toLowerCase() === term) || [];
    const isNumeric = /^\d+$/.test(term);

    if (exactCodeMatches.length > 0) {
      filteredProducts = exactCodeMatches;
    } else if (!isNumeric) {
      // Se for número e não bateu exato, não faz fallback pra não poluir a tela.
      // Se tiver letras, faz busca por nome parcial.
      filteredProducts = products?.filter(p =>
        p.name.toLowerCase().includes(term) ||
        (p.brand?.toLowerCase() || '').includes(term)
      ) || [];
    }
  }

  const addProductToCart = (product: any, qty: number = 1) => {
    let displayName = product.name;
    if (product.code) displayName = `[${product.code}] ${displayName}`;
    if (product.brand) displayName = `${displayName} (${product.brand})`;

    setItems([...items, {
      service: product.serviceType,
      name: displayName,
      quantity: qty,
      price: product.price,
      originalPrice: product.price,
      cost: product.costPrice || 0,
      total: product.price * qty,
      productId: product.id,
      isService: product.isService
    } as any]);

    setSearchProduct('');
    setCustomUnitPrice('');
    if (searchInputRef.current) searchInputRef.current.focus();
  };

  const handleFastAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (filteredProducts.length > 0) {
      addProductToCart(filteredProducts[0], currentQty);
    } else if (searchProduct.trim() !== '') {
      // Manual add if not found
      const parsed = parseSearchInput(searchProduct);
      setItems([...items, {
        service: 'other',
        name: parsed.term,
        quantity: parsed.qty,
        price: 0,
        originalPrice: 0,
        cost: 0,
        total: 0
      } as any]);
      setSearchProduct('');
      setCustomUnitPrice('');
      if (searchInputRef.current) searchInputRef.current.focus();
    }
  };

  const updateItem = (index: number, field: keyof TransactionItem, value: any) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    if (field === 'quantity' || field === 'price') {
      const qty = Number(newItems[index].quantity) || 0;
      const prc = Number(newItems[index].price) || 0;
      newItems[index].total = qty * prc;
    }
    setItems(newItems);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleCustomUnitPriceChange = (val: string) => {
    setCustomUnitPrice(val);
    const parsedPrice = parseCurrency(val);
    if (items.length > 0) {
      const newItems = [...items];
      const lastIndex = newItems.length - 1;
      if (val === '') {
        const orig = (newItems[lastIndex] as any).originalPrice;
        newItems[lastIndex].price = orig !== undefined ? orig : newItems[lastIndex].price;
      } else {
        newItems[lastIndex].price = parsedPrice;
      }
      newItems[lastIndex].total = newItems[lastIndex].price * newItems[lastIndex].quantity;
      setItems(newItems);
    }
  };

  const parseCurrency = (val: string): number => {
    if (!val) return 0;
    const normalized = val.replace(',', '.');
    return Number(normalized) || 0;
  };

  const subtotal = items.reduce((sum, item) => sum + item.total, 0);
  const discountValue = parseCurrency(discount);
  const totalAmount = Math.max(0, subtotal - discountValue);
  const changeValue = Math.max(0, parseCurrency(cashReceived) - totalAmount);

  const handleCheckout = () => {
    if (items.length === 0) return alert('Adicione itens ao caixa.');
    if (items.some(i => i.price <= 0)) return alert('Verifique os preços dos itens. Nenhum item pode ter preço 0.');
    
    if (paymentMethod === 'split') {
      const splitTotal = splitPayments.reduce((sum, p) => sum + p.amount, 0);
      if (Math.abs(splitTotal - totalAmount) > 0.01) {
        return alert(`O total dos pagamentos (R$ ${splitTotal.toFixed(2).replace('.', ',')}) deve ser exatamente igual ao total da venda (R$ ${totalAmount.toFixed(2).replace('.', ',')}).`);
      }
    }
    
    setShowConfirmModal(true);
  };

  const handlePendingClick = () => {
    if (items.length === 0) return alert('Adicione itens para salvar a retirada.');
    setPendingClientName('');
    setPendingClientPhone('');
    setShowPendingModal(true);
  };

  const handleCancelCart = () => {
    setItems([]);
    setClientCode('');
    setDiscount('');
    setCashReceived('');
    setCustomUnitPrice('');
    setSplitPayments([]);
    setActivePendingSaleId(null);
    if (searchInputRef.current) searchInputRef.current.focus();
  };

  const savePendingSale = async () => {
    if (!pendingClientName.trim()) return alert('Informe o nome do cliente.');

    try {
      await db.transaction('rw', db.pendingSales, db.products, async () => {
        // Decrease stock if it hasn't been reserved yet
        if (!activePendingSaleId) {
          for (const item of items) {
            if (item.productId) {
              const product = await db.products.get(item.productId);
              if (product && product.hasStock) {
                await db.products.update(product.id!, { stock: product.stock - item.quantity });
              }
            }
          }
        }

        if (activePendingSaleId) {
          await db.pendingSales.update(activePendingSaleId, {
            clientName: pendingClientName,
            clientPhone: pendingClientPhone,
            items: items,
            total: totalAmount,
            date: new Date()
          });
        } else {
          await db.pendingSales.add({
            profile: transactionProfile,
            clientName: pendingClientName,
            clientPhone: pendingClientPhone,
            items: items,
            total: totalAmount,
            date: new Date()
          });
        }
      });

      setShowPendingModal(false);
      setItems([]);
      setClientCode('');
      setDiscount('');
      setActivePendingSaleId(null);
      if (searchInputRef.current) searchInputRef.current.focus();
    } catch (err) {
      console.error(err);
      alert('Erro ao salvar retirada pendente.');
    }
  };

  const loadPendingSale = (sale: any) => {
    setActivePendingSaleId(sale.id!);
    setItems(sale.items);
    setClientCode(sale.clientName);
    setDiscount('');
    setCashReceived('');
    setCustomUnitPrice('');
    setSplitPayments([]);
    if (searchInputRef.current) searchInputRef.current.focus();
  };

  const discardPendingSale = async (sale: any) => {
    if (!window.confirm(`Tem certeza que deseja excluir a retirada pendente de ${sale.clientName}? Os produtos serão devolvidos ao estoque.`)) return;
    
    try {
      await db.transaction('rw', db.pendingSales, db.products, async () => {
        // Return stock
        for (const item of sale.items) {
          if (item.productId) {
            const product = await db.products.get(item.productId);
            if (product && product.hasStock) {
              await db.products.update(product.id!, { stock: product.stock + item.quantity });
            }
          }
        }
        await db.pendingSales.delete(sale.id!);
      });
      if (activePendingSaleId === sale.id) {
        handleCancelCart(); // clear cart if it was the active one
      }
    } catch (err) {
      console.error(err);
      alert('Erro ao excluir retirada pendente.');
    }
  };

  const handleRescueStorageBox = (sale: any) => {
    setItems(sale.items);
    setActivePendingSaleId(sale.id!);
    setClientCode(sale.clientName);
    setShowStorageBoxModal(false);
  };

  const handleDeleteStorageBox = async (sale: any) => {
    if (window.confirm('Deseja DEVOLVER os itens deste pedido ao ESTOQUE? (Clique OK para devolver e apagar, ou CANCELAR para apagar sem devolver nada).')) {
      try {
        await db.transaction('rw', db.pendingSales, db.products, async () => {
          for (const item of sale.items) {
            if (item.productId) {
              const product = await db.products.get(item.productId);
              if (product && product.hasStock) {
                await db.products.update(item.productId, { stock: product.stock + item.quantity });
              }
            }
          }
          await db.pendingSales.delete(sale.id!);
        });
      } catch (err) {
        console.error("Erro ao devolver e deletar", err);
      }
    } else {
      await db.pendingSales.delete(sale.id!);
    }
  };

  const completeCheckout = async (shouldPrint: boolean, twoCopies: boolean = false) => {
    try {
      await db.transaction('rw', db.transactions, db.products, db.pendingSales, async () => {
        // Decrement stock for products (Only for keys, springs and screws)
        // Only decrement if NOT coming from a pending sale (because it was already decremented when reserved)
        if (!activePendingSaleId) {
          for (const item of items) {
            if (item.productId) {
              const product = await db.products.get(item.productId);
              if (product && product.hasStock) {
                await db.products.update(product.id!, { stock: product.stock - item.quantity });
              }
            }
          }
        }

        let calculatedFee = 0;
        if (paymentMethod === 'split') {
          for (const p of splitPayments) {
            if (transactionProfile === 'chaveiro') {
              if (p.method === 'debit') calculatedFee += p.amount * 0.0199;
              else if (p.method === 'credit') calculatedFee += p.amount * 0.0498;
            } else if (transactionProfile === 'fabiano') {
              if (p.method === 'pix') calculatedFee += p.amount * 0.0045;
              else if (p.method === 'debit') calculatedFee += p.amount * 0.0198;
              else if (p.method === 'credit') calculatedFee += p.amount * 0.0486;
            }
          }
        } else {
          if (transactionProfile === 'chaveiro') {
            if (paymentMethod === 'debit') calculatedFee = totalAmount * 0.0199;
            else if (paymentMethod === 'credit') calculatedFee = totalAmount * 0.0498;
          } else if (transactionProfile === 'fabiano') {
            if (paymentMethod === 'pix') calculatedFee = totalAmount * 0.0045;
            else if (paymentMethod === 'debit') calculatedFee = totalAmount * 0.0198;
            else if (paymentMethod === 'credit') calculatedFee = totalAmount * 0.0486;
          }
        }

        await db.transactions.add({
          profile: transactionProfile,
          type: 'sale',
          items,
          total: totalAmount,
          discount: discountValue > 0 ? discountValue : undefined,
          machineFee: calculatedFee > 0 ? calculatedFee : undefined,
          paymentMethod,
          splitPayments: paymentMethod === 'split' ? splitPayments : undefined,
          clientCode: clientCode || undefined,
          date: new Date()
        });

        if (activePendingSaleId) {
          await db.pendingSales.delete(activePendingSaleId);
        }
      }); // End transaction

      // Imprimir Cupom
      if (shouldPrint) {
          const dateStr = new Date().toLocaleString('pt-BR');
          const originalSubtotal = items.reduce((sum, i) => {
            const orig = i.originalPrice !== undefined ? i.originalPrice : i.price;
            return sum + (orig * i.quantity);
          }, 0);
          const quantityDiscount = items.reduce((sum, i) => {
            const orig = i.originalPrice !== undefined ? i.originalPrice : i.price;
            return sum + ((orig - i.price) * i.quantity);
          }, 0);

          const rmAcc = (s: string) => s ? s.normalize('NFD').replace(/[\u0300-\u036f]/g, '') : '';
          const pad = (s: string, l: number, a = 'left') => { s=s.toString(); if(s.length>l) s=s.substring(0,l); if(a==='left') return s.padEnd(l, ' '); if(a==='right') return s.padStart(l, ' '); return s.padStart(Math.floor((l+s.length)/2), ' ').padEnd(l, ' '); };
          
          let text = pad('Chaveiro & Cutelaria', 32, 'center') + '\n' + pad('do Lidio e Fabiano', 32, 'center') + '\n' + pad('Rua Cardoso de Morais, F. 302', 32, 'center') + '\n' + pad('Bonsucesso - RJ', 32, 'center') + '\n' + pad('Tel: (21) 98601-6721', 32, 'center') + '\n';
          text += '-'.repeat(32) + '\n';
          text += `Data: ${dateStr}\n`;
          if (clientCode) text += `Cliente: ${rmAcc(clientCode)}\n`;
          text += '-'.repeat(32) + '\n';
          text += pad('Qtd', 4) + ' ' + pad('Item', 17) + ' ' + pad('Total', 8, 'right') + '\n';
          
          items.forEach(i => {
            const orig = i.originalPrice !== undefined ? i.originalPrice : i.price;
            const itemOriginalTotal = orig * i.quantity;
            text += pad(i.quantity+'x', 4) + ' ' + pad(rmAcc(i.name), 17) + ' ' + pad(itemOriginalTotal.toFixed(2).replace('.', ','), 8, 'right') + '\n';
          });
          
          text += '-'.repeat(32) + '\n';
          text += pad('Subtotal Bruto:', 16) + pad(originalSubtotal.toFixed(2).replace('.', ','), 16, 'right') + '\n';
          if (quantityDiscount > 0) text += pad('Desc. Qtd:', 16) + pad('-' + quantityDiscount.toFixed(2).replace('.', ','), 16, 'right') + '\n';
          if (discountValue > 0) text += pad('Desc. Extra:', 16) + pad('-' + discountValue.toFixed(2).replace('.', ','), 16, 'right') + '\n';
          text += pad('TOTAL A PAGAR:', 16) + pad(totalAmount.toFixed(2).replace('.', ','), 16, 'right') + '\n';
          
          if (paymentMethod === 'cash') {
            text += pad('Recebido:', 16) + pad((parseCurrency(cashReceived) || totalAmount).toFixed(2).replace('.', ','), 16, 'right') + '\n';
            text += pad('Troco:', 16) + pad(changeValue.toFixed(2).replace('.', ','), 16, 'right') + '\n';
          } else if (paymentMethod === 'split') {
            text += pad('PAGAMENTO MULTIPLO', 32, 'center') + '\n';
            splitPayments.forEach(p => {
               const pMethod = p.method === 'cash' ? 'Dinheiro' : p.method === 'credit' ? 'Credito' : p.method === 'debit' ? 'Debito' : 'PIX';
               text += pad(pMethod + ':', 16) + pad(p.amount.toFixed(2).replace('.', ','), 16, 'right') + '\n';
            });
          } else {
            const mText = paymentMethod === 'credit' ? 'Credito' : paymentMethod === 'debit' ? 'Debito' : 'PIX';
            text += pad('Forma de Pagto:', 16) + pad(mText, 16, 'right') + '\n';
          }
          
          text += '\n' + pad('Obrigado pela preferencia!', 32, 'center') + '\n\n\n\n\n\n\n.\n';
          
          const { ipcRenderer } = (window as any).require('electron');
          ipcRenderer.send('print-text', text);
          
          if (twoCopies) {
            if (window.confirm("Corte a 1ª via (Cliente) e clique em OK para imprimir a 2ª via (Chaveiro).")) {
              ipcRenderer.send('print-text', text);
            }
          }
      }

      setItems([]);
      setClientCode('');
      setDiscount('');
      setPrintTwoCopies(false);
      setCashReceived('');
      setCustomUnitPrice('');
      setSplitPayments([]);
      setActivePendingSaleId(null);
      if (searchInputRef.current) searchInputRef.current.focus();
    } catch (error) {
      console.error(error);
      alert('Erro ao finalizar venda.');
    }
  };

  const printCloseReport = (session: any, totals: any, closeCash: number, leftInDrawer: number, wages: { name: string, amount: number }[] = []) => {
      const openedStr = new Date(session.openedAt).toLocaleString('pt-BR');
      const closedStr = new Date().toLocaleString('pt-BR');
      const expectedCash = session.initialCash + totals.cash - (totals.expenses || 0);
      const difference = closeCash - expectedCash;
      const withdrawal = closeCash - leftInDrawer;
      const totalWages = wages.reduce((sum, w) => sum + w.amount, 0);
      const pureExpenses = (totals.expenses || 0) - totalWages;

      const rmAcc = (s: string) => s ? s.normalize('NFD').replace(/[\u0300-\u036f]/g, '') : '';
      const pad = (s: string, l: number, a = 'left') => { s=s.toString(); if(s.length>l) s=s.substring(0,l); if(a==='left') return s.padEnd(l, ' '); if(a==='right') return s.padStart(l, ' '); return s.padStart(Math.floor((l+s.length)/2), ' ').padEnd(l, ' '); };
      
      let text = pad('Chaveiro & Cutelaria', 32, 'center') + '\n';
      text += pad('FECHAMENTO DE CAIXA', 32, 'center') + '\n';
      text += '-'.repeat(32) + '\n';
      text += `Operador: ${rmAcc(session.profile)}\n`;
      text += `Abertura: ${openedStr}\n`;
      text += `Fechamento: ${closedStr}\n`;
      text += '-'.repeat(32) + '\n';
      text += pad('Fundo de Abertura:', 20) + pad(session.initialCash.toFixed(2).replace('.', ','), 12, 'right') + '\n';
      text += pad('Vendas Dinheiro:', 20) + pad(totals.cash.toFixed(2).replace('.', ','), 12, 'right') + '\n';
      if (pureExpenses > 0) text += pad('Despesas (-):', 20) + pad(pureExpenses.toFixed(2).replace('.', ','), 12, 'right') + '\n';
      wages.forEach(w => text += pad(`Diaria (${w.name}) (-):`, 20) + pad(w.amount.toFixed(2).replace('.', ','), 12, 'right') + '\n');
      text += pad('Dinheiro Esperado:', 20) + pad(expectedCash.toFixed(2).replace('.', ','), 12, 'right') + '\n';
      text += pad('Dinheiro Contado:', 20) + pad(closeCash.toFixed(2).replace('.', ','), 12, 'right') + '\n';
      text += pad('Diferenca:', 20) + pad(difference.toFixed(2).replace('.', ',') + (difference >= 0 ? ' (Sobrando)' : ' (Faltando)'), 12, 'right') + '\n';
      text += '-'.repeat(32) + '\n';
      text += pad('Fundo p/ Amanha:', 20) + pad(leftInDrawer.toFixed(2).replace('.', ','), 12, 'right') + '\n';
      text += pad('Retirada(Sangria):', 20) + pad(withdrawal.toFixed(2).replace('.', ','), 12, 'right') + '\n';
      text += '-'.repeat(32) + '\n';
      text += pad('OUTRAS FORMAS PGTO', 32, 'center') + '\n';
      text += pad('Vendas PIX:', 20) + pad(totals.pix.toFixed(2).replace('.', ','), 12, 'right') + '\n';
      text += pad('Vendas Debito:', 20) + pad(totals.debit.toFixed(2).replace('.', ','), 12, 'right') + '\n';
      text += pad('Vendas Credito:', 20) + pad(totals.credit.toFixed(2).replace('.', ','), 12, 'right') + '\n';
      text += pad('Total Periodo:', 20) + pad(totals.totalSales.toFixed(2).replace('.', ','), 12, 'right') + '\n';
      text += '-'.repeat(32) + '\n';
      text += '\nAssinatura do Operador:\n\n';
      text += '_'.repeat(32) + '\n';
      text += '\n\n\n\n\n\n\n.\n';
      
      const { ipcRenderer } = (window as any).require('electron');
      ipcRenderer.send('print-text', text);
    };

  const handleCloseRegister = async () => {
    if (!activeSession) return;
    const closeCashVal = parseCurrency(closeRegisterCash);
    const leftInDrawerVal = parseCurrency(closeLeftInDrawer);
    
    let totalWagesToPay = 0;
    const wageDetails: { name: string, amount: number }[] = [];
    
    try {
      if (selectedEmployeesToPay.length > 0 && employees) {
        const empsToPay = employees.filter(e => selectedEmployeesToPay.includes(e.id!));
        for (const emp of empsToPay) {
          const wageStr = customWages[emp.id!] !== undefined ? customWages[emp.id!] : emp.dailyWage.toFixed(2).replace('.', ',');
          const wageVal = parseCurrency(wageStr);
          totalWagesToPay += wageVal;
          wageDetails.push({ name: emp.name, amount: wageVal });
          await db.transactions.add({
            profile: activeSession.profile,
            type: 'expense',
            items: [{
              service: 'other',
              name: `Pagamento de Diária: ${emp.name}`,
              quantity: 1,
              price: wageVal,
              cost: 0,
              total: wageVal
            }],
            total: wageVal,
            paymentMethod: 'cash',
            date: new Date()
          });
        }
      }

      // Expected gross cash BEFORE taking wages out
      const expectedGrossCash = activeSession.initialCash + sessionTotals.cash - sessionTotals.expenses;
      const expectedNetCash = expectedGrossCash - totalWagesToPay;

      // The user typed the GROSS physical cash they counted in the drawer (before taking wages out)
      const diffVal = closeCashVal - expectedGrossCash;

      await db.cashSessions.update(activeSession.id!, {
        closedAt: new Date(),
        expectedCash: expectedNetCash, // Save the final expected cash
        actualCash: closeCashVal - totalWagesToPay, // Actual cash left in drawer after paying
        leftInDrawer: leftInDrawerVal,
        difference: diffVal, // Use gross difference so history matches what they saw
        status: 'closed',
        cashSales: sessionTotals.cash,
        pixSales: sessionTotals.pix,
        debitSales: sessionTotals.debit,
        creditSales: sessionTotals.credit
      });

      const updatedTotals = { ...sessionTotals, expenses: sessionTotals.expenses + totalWagesToPay };
      const shouldPrint = window.confirm("Deseja imprimir o comprovante de fechamento de caixa?");
      if (shouldPrint) {
        printCloseReport(activeSession, updatedTotals, closeCashVal - totalWagesToPay, leftInDrawerVal, wageDetails);
      }

      localStorage.setItem('ichaveiro_last_drawer_left', closeLeftInDrawer);
      setOpenRegisterCash(closeLeftInDrawer);
      setShowCloseRegisterModal(false);
      setCloseRegisterCash('');
      
      runAutoBackup();
    } catch (err) {
      console.error(err);
      alert("Erro ao fechar caixa.");
    }
  };

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseCurrency(expenseAmount);
    if (amount <= 0) {
      alert("Informe um valor válido para a despesa.");
      return;
    }
    if (!expenseDescription.trim()) {
      alert("Informe uma descrição / motivo para a retirada.");
      return;
    }

    try {
      await db.transactions.add({
        profile: transactionProfile,
        type: 'expense',
        paymentMethod: 'cash',
        total: amount,
        date: new Date(),
        clientName: `Retirada: ${expenseDescription}`,
        items: [{
          service: 'other',
          name: expenseDescription,
          quantity: 1,
          price: amount,
          cost: amount,
          total: amount
        }]
      });

      alert("Despesa registrada e retirada do caixa com sucesso!");
      setShowExpenseModal(false);
      setExpenseAmount('');
      setExpenseDescription('');
    } catch (err) {
      console.error(err);
      alert("Erro ao registrar despesa.");
    }
  };

  const currentProduct = filteredProducts.length > 0 ? filteredProducts[0] : null;
  const currentUnitPrice = currentProduct ? currentProduct.price : 0;
  const currentItemTotal = currentUnitPrice * currentQty;

  const getStockColor = (product: any) => {
    if (product.serviceType !== 'key') return '';
    const ideal = product.idealStock || 0;
    if (ideal === 0) return 'text-primary';
    if (product.stock <= ideal * 0.3) return 'bg-danger/20 text-danger border-danger';
    if (product.stock <= ideal * 0.6) return 'bg-yellow-500/20 text-yellow-500 border-yellow-500';
    return 'bg-success/20 text-success border-success';
  };

  if (activeSession === undefined) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: 'var(--bg-app)', color: '#ffffff', fontSize: '1.5rem', fontWeight: 'bold' }}>
        Carregando dados do caixa...
      </div>
    );
  }

  if (!activeSession) {
    return (
      <div 
        style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          alignItems: 'center', 
          justifyContent: 'center', 
          minHeight: '80vh', 
          backgroundColor: 'var(--bg-app)', 
          padding: '24px',
          color: '#ffffff'
        }}
        className="animate-fade-in"
      >
        <div 
          style={{ 
            backgroundColor: '#1e293b', 
            border: '4px solid #eab308', 
            borderRadius: '16px', 
            padding: '40px', 
            maxWidth: '500px', 
            width: '100%', 
            textAlign: 'center', 
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
            display: 'flex',
            flexDirection: 'column',
            gap: '24px'
          }}
          className="animate-scale-in"
        >
          <div>
            <h1 style={{ fontSize: '2.5rem', fontWeight: 950, color: '#f87171', margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Caixa Fechado
            </h1>
            <p style={{ color: '#94a3b8', fontSize: '1.1rem', marginTop: '8px' }}>
              Inicie uma nova sessão de caixa para o perfil <strong style={{ color: '#eab308', textTransform: 'uppercase' }}>{transactionProfile === 'chaveiro' ? 'Chaveiro' : 'Fabiano'}</strong>.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', textAlign: 'left' }}>
            <label style={{ color: '#94a3b8', fontWeight: 'bold', fontSize: '0.9rem', textTransform: 'uppercase' }}>Alterar Operador / Perfil:</label>
            <select
              style={{
                width: '100%',
                backgroundColor: 'rgba(0,0,0,0.4)',
                border: '2px solid #475569',
                borderRadius: '8px',
                padding: '12px',
                color: '#ffffff',
                fontWeight: 'bold',
                fontSize: '1.1rem',
                outline: 'none',
                cursor: 'pointer'
              }}
              value={transactionProfile}
              onChange={e => setTransactionProfile(e.target.value as Profile)}
            >
              <option value="chaveiro">Chaveiro</option>
              <option value="fabiano">Fabiano</option>
            </select>
          </div>

          <div style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}></div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', textAlign: 'left' }}>
            <label style={{ color: '#ffffff', fontWeight: 'extrabold', fontSize: '1.2rem' }}>
              VALOR DE ABERTURA / FUNDO DE TROCO (R$):
            </label>
            <input
              type="text"
              style={{
                width: '100%',
                backgroundColor: 'rgba(0,0,0,0.5)',
                border: '3px solid #eab308',
                borderRadius: '8px',
                padding: '16px',
                color: '#4ade80',
                fontSize: '2.2rem',
                fontWeight: '900',
                textAlign: 'center',
                outline: 'none'
              }}
              value={openRegisterCash}
              onChange={e => {
                let val = e.target.value.replace(/\D/g, '');
                if (val === '') val = '0';
                const formatted = (parseFloat(val) / 100).toFixed(2).replace('.', ',');
                setOpenRegisterCash(formatted);
              }}
            />
          </div>

          <button
            onClick={async () => {
              const val = parseCurrency(openRegisterCash);
              await db.cashSessions.add({
                profile: transactionProfile,
                openedAt: new Date(),
                initialCash: val,
                status: 'open'
              });
            }}
            style={{
              backgroundColor: '#22c55e',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              padding: '18px',
              fontSize: '1.3rem',
              fontWeight: 'bold',
              cursor: 'pointer',
              transition: 'transform 0.15s, filter 0.15s',
              boxShadow: '0 10px 15px -3px rgba(34, 197, 94, 0.4)'
            }}
            onMouseOver={e => {
              e.currentTarget.style.filter = 'brightness(1.1)';
              e.currentTarget.style.transform = 'scale(1.02)';
            }}
            onMouseOut={e => {
              e.currentTarget.style.filter = 'brightness(1)';
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            ABRIR CAIXA E INICIAR VENDAS
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden animate-fade-in font-sans">
      <style>{`
        .pos-received-input {
          background-color: rgba(0, 0, 0, 0.4) !important;
          color: #4ade80 !important;
          border: 1px solid #4b5563 !important;
        }
        .pos-received-input:focus {
          border-color: #22c55e !important;
          outline: none !important;
        }
        .payment-btn {
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
          cursor: pointer !important;
        }
        .payment-btn:hover:not(.payment-active) {
          transform: translateY(-4px) scale(1.04) !important;
          filter: brightness(1.15) !important;
          box-shadow: 0 10px 20px rgba(0, 0, 0, 0.3) !important;
        }
        .payment-btn.payment-active {
          transform: scale(1.05) !important;
          filter: brightness(1) !important;
        }
        .payment-btn.payment-active:hover {
          transform: scale(1.07) translateY(-2px) !important;
          filter: brightness(1.05) !important;
        }
        .payment-btn:active {
          transform: translateY(1px) scale(0.97) !important;
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scaleIn {
          from { transform: scale(0.92); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        .animate-fade-in {
          animation: fadeIn 0.18s ease-out forwards;
        }
        .animate-scale-in {
          animation: scaleIn 0.22s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }
      `}</style>
      <div className="bg-[var(--bg-surface)] border-b-2 border-red-600 rounded p-4 mb-4 flex justify-between items-center shadow">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <span className="text-red-500">Caixa</span> Aberto
          </h1>
          <span className="text-sm font-bold text-muted uppercase">
            Operador: <strong className="text-yellow-500">{transactionProfile === 'chaveiro' ? 'Chaveiro' : 'Fabiano'}</strong> | Fundo Inicial: <strong className="text-green-400">R$ {activeSession.initialCash.toFixed(2).replace('.', ',')}</strong>
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#eab308', letterSpacing: '0.05em', marginRight: '8px' }} className="hidden md:inline">CHAVEIRO & CUTELARIA</span>
          <button
            onClick={() => {
              const expected = activeSession.initialCash + sessionTotals.cash - sessionTotals.expenses;
              alert(`💵 Dinheiro Físico Esperado na Gaveta:\n\nR$ ${expected.toFixed(2).replace('.', ',')}\n\n(Fundo Inicial + Vendas Dinheiro - Despesas)`);
            }}
            title="Ver total de dinheiro em caixa"
            style={{
              backgroundColor: 'transparent',
              color: '#94a3b8',
              border: '1px solid #475569',
              borderRadius: '6px',
              padding: '8px 12px',
              fontSize: '0.80rem',
              fontWeight: 'bold',
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
            onMouseOver={e => {
              e.currentTarget.style.color = '#eab308';
              e.currentTarget.style.borderColor = '#eab308';
            }}
            onMouseOut={e => {
              e.currentTarget.style.color = '#94a3b8';
              e.currentTarget.style.borderColor = '#475569';
            }}
          >
            $ VER CAIXA $
          </button>
          <button
            onClick={() => {
              setExpenseAmount('');
              setExpenseDescription('');
              setShowExpenseModal(true);
            }}
            style={{
              backgroundColor: '#eab308',
              color: '#0f172a',
              border: 'none',
              borderRadius: '6px',
              padding: '8px 16px',
              fontSize: '0.875rem',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              cursor: 'pointer',
              boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)',
              transition: 'all 0.15s ease'
            }}
            onMouseOver={e => e.currentTarget.style.filter = 'brightness(1.1)'}
            onMouseOut={e => e.currentTarget.style.filter = 'brightness(1)'}
          >
            Registrar Despesa
          </button>
          <button
            onClick={() => setShowStorageBoxModal(true)}
            style={{
              backgroundColor: '#a855f7',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              padding: '8px 16px',
              fontSize: '0.875rem',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)',
              transition: 'all 0.15s ease'
            }}
            onMouseOver={e => e.currentTarget.style.filter = 'brightness(1.1)'}
            onMouseOut={e => e.currentTarget.style.filter = 'brightness(1)'}
          >
            <Package size={18} /> {archivedPendingSales.length > 0 && <span style={{ backgroundColor: 'white', color: '#a855f7', borderRadius: '50%', padding: '2px 6px', fontSize: '10px' }}>{archivedPendingSales.length}</span>}
          </button>
          <button
            onClick={() => setShowStandaloneModal(true)}
            style={{
              backgroundColor: '#3b82f6',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              padding: '8px 16px',
              fontSize: '0.875rem',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)',
              transition: 'all 0.15s ease'
            }}
            onMouseOver={e => e.currentTarget.style.filter = 'brightness(1.1)'}
            onMouseOut={e => e.currentTarget.style.filter = 'brightness(1)'}
          >
            <Printer size={18} /> Cupom Avulso
          </button>
          <button
            onClick={() => setShowLossModal(true)}
            style={{
              backgroundColor: '#f97316',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              padding: '8px 16px',
              fontSize: '0.875rem',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              cursor: 'pointer',
              boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)',
              transition: 'all 0.15s ease'
            }}
            onMouseOver={e => e.currentTarget.style.filter = 'brightness(1.1)'}
            onMouseOut={e => e.currentTarget.style.filter = 'brightness(1)'}
          >
            Registrar Perda
          </button>
          <button
            onClick={() => {
              const expected = activeSession.initialCash + sessionTotals.cash - sessionTotals.expenses;
              setCloseRegisterCash(expected.toFixed(2).replace('.', ','));
              setCloseLeftInDrawer(activeSession.initialCash.toFixed(2).replace('.', ','));
              setShowCloseRegisterModal(true);
            }}
            style={{
              backgroundColor: '#dc2626',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              padding: '8px 16px',
              fontSize: '0.875rem',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              cursor: 'pointer',
              boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06)',
              transition: 'all 0.15s ease'
            }}
            onMouseOver={e => e.currentTarget.style.filter = 'brightness(1.1)'}
            onMouseOut={e => e.currentTarget.style.filter = 'brightness(1)'}
          >
            Fechar Caixa
          </button>
        </div>
      </div>

      <div className="flex gap-6 flex-1 min-h-0 overflow-hidden pb-4">
        {/* Left column: Inputs and Info */}
        <div className="w-[500px] flex flex-col gap-4 border-r-4 border-red-600 pr-6 overflow-y-auto custom-scrollbar">
          <form onSubmit={handleFastAdd} className="flex flex-col gap-2 mb-2">
            <label className="text-white font-bold px-1 uppercase text-lg">Código do Produto</label>
            <div className="flex gap-3 items-stretch w-full">
              <div className="bg-white rounded p-1 shadow-inner border-4 border-gray-300 focus-within:border-yellow-500 flex-shrink-0 flex items-center" style={{ width: '310px' }}>
                <input
                  type="text"
                  ref={searchInputRef}
                  autoFocus
                  className="w-full font-extrabold px-3 bg-transparent outline-none text-black tracking-widest text-center"
                  style={{ fontSize: '2.2rem', height: '55px' }}
                  value={searchProduct}
                  onChange={e => setSearchProduct(e.target.value)}
                />
              </div>
              <button
                type="submit"
                className="shadow hover:opacity-90 active:scale-95 transition-all uppercase flex-shrink-0 flex flex-col items-center justify-center text-center border-none font-black text-lg"
                style={{ width: '130px', backgroundColor: '#eab308', color: '#000000', borderRadius: '4px' }}
              >
                <span>LANÇAR</span>
                <span className="text-xs font-bold mt-0.5">(ENTER)</span>
              </button>
            </div>
          </form>

          {/* Product Preview Info Area */}
          {currentProduct ? (
            <div className="bg-[var(--bg-surface)] rounded-lg shadow-lg p-4 border-l-8 border-yellow-500 flex flex-col">
              <div 
                style={{ fontSize: '3.2rem', lineHeight: '1.2' }} 
                className="text-yellow-400 font-black uppercase tracking-wide break-words"
              >
                {currentProduct.name}
              </div>
              <div className="grid grid-cols-3 gap-3 mt-6 pt-3 border-t border-gray-700/50">
                <div className="flex flex-col">
                  <span className="text-xs text-muted font-bold uppercase">Unitário</span>
                  <span className="text-2xl font-extrabold text-white">
                    R$ {currentUnitPrice.toFixed(2).replace('.', ',')}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-xs text-muted font-bold uppercase">Qtd x Total</span>
                  <span className="text-2xl font-extrabold text-green-400">
                    R$ {currentItemTotal.toFixed(2).replace('.', ',')}
                  </span>
                </div>
                {currentProduct.serviceType === 'key' && (
                  <div className="flex flex-col">
                    <span className="text-xs text-muted font-bold uppercase">Estoque</span>
                    <span className={`text-xl font-extrabold px-2 py-0.5 rounded text-center self-start ${getStockColor(currentProduct)}`} style={{ minWidth: '60px' }}>
                      {currentProduct.stock} un
                    </span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-[var(--bg-surface)] rounded-lg shadow-lg p-4 border border-dashed border-[var(--border)] text-center text-gray-500 font-bold text-xl uppercase py-4">
              Nenhum produto selecionado
            </div>
          )}

          <div className="bg-[var(--bg-surface)] p-4 rounded shadow-lg border-l-4 border-red-600 flex flex-col gap-3">
            <div className="text-base font-bold uppercase mb-2 border-b border-[var(--border)] pb-2 text-white">Configurações da Venda</div>

            <div>
              <label className="text-sm mb-2 block font-bold text-muted uppercase tracking-wide">Forma de Pagamento</label>
              <div className="grid grid-cols-4 gap-2">
                <button
                  className={`btn py-2 font-bold flex flex-col items-center justify-center gap-1 payment-btn ${paymentMethod === 'cash' ? 'payment-active' : 'opacity-80'}`}
                  style={{ 
                    backgroundColor: '#16a34a', 
                    color: '#ffffff', 
                    border: paymentMethod === 'cash' ? '3px solid #ffffff' : 'none', 
                    borderRadius: '6px',
                    boxShadow: paymentMethod === 'cash' ? '0 0 10px rgba(22, 163, 74, 0.6)' : 'none'
                  }}
                  onClick={() => setPaymentMethod('cash')}
                >
                  <Banknote size={20} />
                  <span className="text-[10px] uppercase font-extrabold">Dinheiro</span>
                </button>
                <button
                  className={`btn py-2 font-bold flex flex-col items-center justify-center gap-1 payment-btn ${paymentMethod === 'pix' ? 'payment-active' : 'opacity-80'}`}
                  style={{ 
                    backgroundColor: '#14b8a6', 
                    color: '#ffffff', 
                    border: paymentMethod === 'pix' ? '3px solid #ffffff' : 'none', 
                    borderRadius: '6px',
                    boxShadow: paymentMethod === 'pix' ? '0 0 10px rgba(20, 184, 166, 0.6)' : 'none'
                  }}
                  onClick={() => setPaymentMethod('pix')}
                >
                  <Smartphone size={20} />
                  <span className="text-[10px] uppercase font-extrabold">PIX</span>
                </button>
                <button
                  className={`btn py-2 font-bold flex flex-col items-center justify-center gap-1 payment-btn ${paymentMethod === 'debit' ? 'payment-active' : 'opacity-80'}`}
                  style={{ 
                    backgroundColor: '#2563eb', 
                    color: '#ffffff', 
                    border: paymentMethod === 'debit' ? '3px solid #ffffff' : 'none', 
                    borderRadius: '6px',
                    boxShadow: paymentMethod === 'debit' ? '0 0 10px rgba(37, 99, 235, 0.6)' : 'none'
                  }}
                  onClick={() => setPaymentMethod('debit')}
                >
                  <CreditCard size={20} />
                  <span className="text-[10px] uppercase font-extrabold">Débito</span>
                </button>
                <button
                  className={`btn py-2 font-bold flex flex-col items-center justify-center gap-1 payment-btn ${paymentMethod === 'credit' ? 'payment-active' : 'opacity-80'}`}
                  style={{ 
                    backgroundColor: '#9333ea', 
                    color: '#ffffff', 
                    border: paymentMethod === 'credit' ? '3px solid #ffffff' : 'none', 
                    borderRadius: '6px',
                    boxShadow: paymentMethod === 'credit' ? '0 0 10px rgba(147, 51, 234, 0.6)' : 'none'
                  }}
                  onClick={() => setPaymentMethod('credit')}
                >
                  <CreditCard size={20} />
                  <span className="text-[10px] uppercase font-extrabold">Crédito</span>
                </button>
              </div>
              <button
                className={`btn mt-1 py-1.5 w-full font-bold flex items-center justify-center gap-2 payment-btn ${paymentMethod === 'split' ? 'payment-active' : 'opacity-80'}`}
                style={{ 
                  backgroundColor: '#f59e0b', 
                  color: '#ffffff', 
                  border: paymentMethod === 'split' ? '3px solid #ffffff' : 'none', 
                  borderRadius: '6px',
                  boxShadow: paymentMethod === 'split' ? '0 0 10px rgba(245, 158, 11, 0.6)' : 'none'
                }}
                onClick={() => {
                  setPaymentMethod('split');
                  setShowSplitModal(true);
                }}
              >
                <Tag size={24} />
                <span className="text-sm uppercase font-extrabold">Múltiplo</span>
              </button>

              {paymentMethod === 'split' && splitPayments.length > 0 && (
                <div className="mt-4 p-3 bg-black/30 rounded border border-yellow-500/50">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-yellow-500 font-bold uppercase text-xs">Pagamentos Parciais:</span>
                    <button onClick={() => setShowSplitModal(true)} className="text-blue-400 font-bold text-xs hover:underline uppercase">Editar</button>
                  </div>
                  {splitPayments.map((sp, idx) => (
                    <div key={idx} className="flex justify-between items-center text-sm mb-1 bg-gray-800/50 px-2 py-1 rounded">
                      <span className="uppercase font-bold text-gray-300">{sp.method === 'cash' ? 'Dinheiro' : sp.method === 'credit' ? 'Crédito' : sp.method === 'debit' ? 'Débito' : 'PIX'}</span>
                      <span className="font-mono text-green-400 font-bold">R$ {sp.amount.toFixed(2).replace('.', ',')}</span>
                    </div>
                  ))}
                  {totalAmount - splitPayments.reduce((s, p) => s + p.amount, 0) > 0 && (
                     <div className="text-red-400 font-bold text-xs mt-2 uppercase border-t border-gray-600/50 pt-2">
                       Falta: R$ {Math.max(0, totalAmount - splitPayments.reduce((s, p) => s + p.amount, 0)).toFixed(2).replace('.', ',')}
                     </div>
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="text-sm mb-1 block font-bold text-muted uppercase">Faturamento</label>
              <select
                className="w-full p-2 text-white text-lg font-bold rounded border border-[var(--border)] bg-black/30 outline-none focus:border-primary"
                value={transactionProfile}
                onChange={e => setTransactionProfile(e.target.value as Profile)}
              >
                <option value="chaveiro">Chaveiro</option>
                <option value="fabiano">Fabiano</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-1">
              <div>
                <label className="text-sm mb-1 block font-bold text-muted uppercase">Desconto (R$)</label>
                <input
                  type="text"
                  className="w-full p-2 text-white text-lg font-bold rounded border border-[var(--border)] bg-black/30 outline-none focus:border-primary"
                  placeholder="0,00"
                  value={discount}
                  onChange={e => setDiscount(e.target.value.replace(/[^0-9.,]/g, ''))}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      (e.target as HTMLInputElement).blur();
                      if (paymentMethod === 'cash') {
                        const rec = document.querySelector('.pos-received-input') as HTMLInputElement;
                        if (rec) rec.focus();
                      } else {
                        const chk = document.querySelector('.pos-checkout-btn') as HTMLButtonElement;
                        if (chk) chk.focus();
                      }
                    }
                  }}
                />
              </div>
              <div>
                <label className="text-sm mb-1 block font-bold text-muted uppercase">Vlr. Unit. c/ Desc</label>
                <input
                  type="text"
                  className="w-full p-2 text-white text-lg font-bold rounded border border-[var(--border)] bg-black/30 outline-none focus:border-primary"
                  placeholder="0,00"
                  value={customUnitPrice}
                  onChange={e => handleCustomUnitPriceChange(e.target.value.replace(/[^0-9.,]/g, ''))}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      (e.target as HTMLInputElement).blur();
                      if (paymentMethod === 'cash') {
                        const rec = document.querySelector('.pos-received-input') as HTMLInputElement;
                        if (rec) rec.focus();
                      } else {
                        const chk = document.querySelector('.pos-checkout-btn') as HTMLButtonElement;
                        if (chk) chk.focus();
                      }
                    }
                  }}
                  disabled={items.length === 0}
                />
              </div>
            </div>

            <div className="mt-2">
              <label className="text-sm mb-1 block font-bold text-muted uppercase">Cliente/Empresa (Opcional Cupom)</label>
              <input
                type="text"
                className="w-full p-2 text-white text-lg font-bold rounded border border-[var(--border)] bg-black/30 outline-none focus:border-primary"
                placeholder=""
                value={clientCode}
                onChange={e => setClientCode(e.target.value)}
              />
            </div>

            <button
              className="w-full py-3 text-xl font-extrabold rounded shadow transition-colors mt-4 flex justify-center items-center gap-3 uppercase hover:opacity-90 pos-checkout-btn"
              style={{ backgroundColor: '#16a34a', color: '#ffffff', border: 'none' }}
              onClick={handleCheckout}
            >
              <CheckCircle size={32} /> FINALIZAR VENDA
            </button>

            <div className="grid grid-cols-2 gap-3 mt-3">
              <button
                className="py-2 text-sm font-extrabold rounded shadow transition-colors uppercase flex justify-center items-center hover:opacity-90"
                style={{ backgroundColor: '#eab308', color: '#000000', border: 'none' }}
                onClick={handlePendingClick}
              >
                Deixar Pendente
              </button>
              <button
                className="py-2 text-sm font-extrabold rounded shadow transition-colors uppercase flex justify-center items-center hover:opacity-90"
                style={{ backgroundColor: '#dc2626', color: '#ffffff', border: 'none' }}
                onClick={handleCancelCart}
              >
                Limpar / Cancelar
              </button>
            </div>
          </div>
        </div>

        {/* Right column: List and Totals */}
        <div className="flex-1 flex flex-col gap-4 min-w-0">

          <div className="flex-1 rounded-lg shadow-lg border border-[var(--border)] flex flex-col min-h-0 overflow-hidden" style={{ backgroundColor: '#ffffff' }}>
            <div className="border-b border-gray-300 text-center font-bold py-3 uppercase tracking-widest text-xl" style={{ backgroundColor: '#f3f4f6', color: '#000000' }}>
              LISTA DE PRODUTOS
            </div>

            <div className="flex-1 overflow-y-auto" style={{ backgroundColor: '#ffffff' }}>
              <table className="w-full border-collapse" style={{ backgroundColor: '#ffffff', color: '#000000' }}>
                <thead className="sticky top-0 border-b-2 border-gray-300 shadow-sm" style={{ backgroundColor: '#f3f4f6', color: '#000000' }}>
                  <tr>
                    <th className="py-3 px-2 text-center w-16 font-extrabold text-lg">Nº</th>
                    <th className="py-3 px-2 text-left font-extrabold text-lg">Código / Descrição</th>
                    <th className="py-3 px-2 text-center w-24 font-extrabold text-lg">Qtd</th>
                    <th className="py-3 px-2 text-right w-32 font-extrabold text-lg">Vlr. Unit.</th>
                    <th className="py-3 px-2 text-right w-32 font-extrabold text-lg">Total</th>
                    <th className="py-3 px-2 w-12"></th>
                  </tr>
                </thead>
                <tbody style={{ backgroundColor: '#ffffff', color: '#000000' }}>
                  {items.map((item, index) => (
                    <tr key={index} className="border-b border-gray-200 last:border-0 hover:bg-gray-100" style={{ fontSize: '22px', color: '#000000' }}>
                      <td className="py-4 px-3 text-center font-mono font-black text-gray-700" style={{ fontSize: '22px' }}>{index + 1}</td>
                      <td className="py-4 px-3 font-black uppercase text-gray-900" style={{ fontSize: '22px' }}>{item.name}</td>
                      <td className="py-4 px-3 text-center font-black text-blue-800" style={{ fontSize: '22px' }}>{item.quantity}</td>
                      <td className="py-4 px-3 text-right font-black text-gray-800" style={{ fontSize: '22px' }}>{Number(item.price).toFixed(2).replace('.', ',')}</td>
                      <td className="py-4 px-3 text-right font-black text-green-700" style={{ fontSize: '22px' }}>{item.total.toFixed(2).replace('.', ',')}</td>
                      <td className="py-4 px-3 text-center">
                        <button onClick={() => removeItem(index)} className="p-2 rounded text-red-600 hover:bg-red-100" style={{ color: '#dc2626' }} title="Remover item">
                          <Trash2 size={24} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {discountValue > 0 && (
                    <tr className="bg-amber-50 border-t border-b border-amber-200" style={{ fontSize: '22px', color: '#b45309' }}>
                      <td className="py-4 px-3 text-center font-mono font-black text-amber-700">-</td>
                      <td className="py-4 px-3 font-black uppercase text-amber-700">DESCONTO</td>
                      <td className="py-4 px-3 text-center font-black text-amber-700">-</td>
                      <td className="py-4 px-3 text-right font-black text-amber-700">-</td>
                      <td className="py-4 px-3 text-right font-black text-red-600">- R$ {discountValue.toFixed(2).replace('.', ',')}</td>
                      <td className="py-4 px-3"></td>
                    </tr>
                  )}
                  {items.length === 0 && (
                    <tr style={{ backgroundColor: '#ffffff' }}>
                      <td colSpan={6} className="text-center py-32 text-gray-400 font-extrabold text-3xl uppercase">
                        Caixa Livre
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ height: '130px' }} className="mt-6 flex-shrink-0">
            <div className="grid grid-cols-3 gap-6 h-full">
              {/* Subtotal Box */}
              <div 
                style={{ backgroundColor: '#1e293b', border: '3px solid #eab308', borderRadius: '12px', padding: '16px', height: '100%' }} 
                className="flex flex-col justify-between shadow-2xl"
              >
                <div className="text-gray-400 font-bold uppercase text-xs tracking-wider">A PAGAR (TOTAL)</div>
                {discountValue > 0 ? (
                  <div className="flex flex-col gap-0.5 mt-1">
                    <div className="flex justify-between text-sm font-black text-gray-300">
                      <span>VALOR:</span>
                      <span>R$ {subtotal.toFixed(2).replace('.', ',')}</span>
                    </div>
                    <div className="flex justify-between text-sm font-black text-red-400">
                      <span>DESCONTO:</span>
                      <span>- R$ {discountValue.toFixed(2).replace('.', ',')}</span>
                    </div>
                    <div className="border-t border-gray-600/50 pt-1 mt-1 flex justify-between items-center text-white" style={{ fontSize: '2.3rem', fontWeight: 900, lineHeight: 1 }}>
                      <span className="text-xs text-yellow-400 font-black">TOTAL:</span>
                      <span>R$ {totalAmount.toFixed(2).replace('.', ',')}</span>
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: '2.4rem', fontWeight: 900, color: '#ffffff', lineHeight: 1.1 }} className="mt-2 whitespace-nowrap flex items-baseline gap-1">
                    <span className="text-[1.4rem] text-gray-400">R$</span> <span>{totalAmount.toFixed(2).replace('.', ',')}</span>
                  </div>
                )}
                {paymentMethod === 'split' ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {splitPayments.length > 0 ? splitPayments.map((sp, i) => (
                      <span key={i} className="bg-yellow-500 text-black px-2 py-0.5 rounded text-xs font-bold uppercase whitespace-nowrap">
                        {sp.method === 'cash' ? 'Din' : sp.method === 'pix' ? 'PIX' : sp.method === 'debit' ? 'Déb' : 'Cré'}: R$ {sp.amount.toFixed(2).replace('.', ',')}
                      </span>
                    )) : (
                      <span className="text-yellow-500 font-bold uppercase text-sm">MÚLTIPLO</span>
                    )}
                  </div>
                ) : (
                  <div style={{ fontSize: '1.3rem', fontWeight: 900, color: '#eab308' }} className="mt-2 uppercase tracking-wide">
                    👉 {paymentMethod === 'cash' ? 'DINHEIRO' : paymentMethod === 'pix' ? 'PIX' : paymentMethod === 'debit' ? 'DÉBITO' : 'CRÉDITO'}
                  </div>
                )}
              </div>

              {/* Total Recebido Box */}
              <div 
                style={{ 
                  backgroundColor: '#1e293b', 
                  border: '3px solid #22c55e', 
                  borderRadius: '12px', 
                  padding: '16px', 
                  height: '100%',
                  visibility: paymentMethod === 'cash' ? 'visible' : 'hidden'
                }} 
                className="flex flex-col justify-between shadow-2xl"
              >
                <div className="text-gray-400 font-bold uppercase text-xs tracking-wider">TOTAL RECEBIDO</div>
                <div className="relative flex items-center mt-3">
                  <span style={{ fontSize: '1.2rem', fontWeight: 900 }} className="absolute left-3 text-gray-400">R$</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    className="w-full text-right outline-none rounded pos-received-input py-2 pl-10 pr-3 transition-colors font-black"
                    style={{ fontSize: '1.8rem', height: '45px' }}
                    value={cashReceived}
                    onChange={e => setCashReceived(e.target.value.replace(/[^0-9.,]/g, ''))}
                  />
                </div>
              </div>

              {/* Troco Box */}
              <div 
                style={{ 
                  backgroundColor: '#1e293b', 
                  border: '3px solid #3b82f6', 
                  borderRadius: '12px', 
                  padding: '16px', 
                  height: '100%',
                  visibility: paymentMethod === 'cash' ? 'visible' : 'hidden'
                }} 
                className="flex flex-col justify-between shadow-2xl"
              >
                <div className="text-gray-400 font-bold uppercase text-xs tracking-wider">TROCO</div>
                <div style={{ fontSize: '2.4rem', fontWeight: 900, color: '#60a5fa', lineHeight: 1.1, textAlign: 'right' }} className="mt-2 whitespace-nowrap flex items-baseline justify-end gap-1">
                  <span className="text-[1.4rem] text-blue-300">R$</span> <span>{changeValue.toFixed(2).replace('.', ',')}</span>
                </div>
                <div style={{ fontSize: '1.3rem', fontWeight: 900, color: changeValue > 0 ? '#4ade80' : '#94a3b8', textAlign: 'right' }} className="mt-2 uppercase">
                  {changeValue > 0 ? 'DEVOLVER TROCO' : 'SEM TROCO'}
                </div>
              </div>
            </div>
          </div>

          {/* Pending Sales List */}
          {recentPendingSales.length > 0 && (
            <div style={{ marginTop: '16px', backgroundColor: '#1e293b', borderRadius: '12px', padding: '16px', border: '2px solid #eab308', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <h3 style={{ color: '#eab308', fontSize: '1rem', fontWeight: 900, textTransform: 'uppercase', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                ⏳ Pendentes para Retirada ({recentPendingSales.length})
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', paddingRight: '4px' }}>
                {recentPendingSales.slice().sort((a, b) => a.date.getTime() - b.date.getTime()).map(sale => (
                  <div 
                    key={sale.id}
                    style={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}
                  >
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
                        <div style={{ fontWeight: 900, color: '#ffffff', fontSize: '1rem', textTransform: 'uppercase' }}>{sale.clientName}</div>
                        <div style={{ color: '#94a3b8', fontSize: '0.8rem' }}>
                          {sale.date.toLocaleString('pt-BR')} {sale.clientPhone ? `- Tel: ${sale.clientPhone}` : ''}
                        </div>
                      </div>
                      <div style={{ color: '#64748b', fontSize: '0.8rem' }}>
                        {sale.items.length} iten(s): {sale.items.map(i => i.name).join(', ').substring(0, 50)}...
                      </div>
                    </div>
                    
                    <div style={{ color: '#22c55e', fontWeight: 900, fontSize: '1.2rem', whiteSpace: 'nowrap' }}>R$ {sale.total.toFixed(2).replace('.', ',')}</div>
                    
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <button 
                        style={{ backgroundColor: '#3b82f6', color: 'white', padding: '8px 16px', borderRadius: '6px', fontWeight: 'bold', border: 'none', cursor: 'pointer', textTransform: 'uppercase', fontSize: '0.8rem' }}
                        onClick={() => loadPendingSale(sale)}
                      >
                        Resgatar
                      </button>
                      <button 
                        style={{ backgroundColor: '#7f1d1d', color: 'white', padding: '8px', borderRadius: '6px', fontWeight: 'bold', border: 'none', cursor: 'pointer' }}
                        title="Descartar Venda Pendente"
                        onClick={() => discardPendingSale(sale)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>



      <RegisterLossModal
        isOpen={showLossModal}
        onClose={() => setShowLossModal(false)}
        activeProfile={transactionProfile}
      />

      <StorageBoxModal
        isOpen={showStorageBoxModal}
        onClose={() => setShowStorageBoxModal(false)}
        archivedSales={archivedPendingSales}
        onRescue={handleRescueStorageBox}
        onDelete={handleDeleteStorageBox}
      />

      <StandaloneReceiptModal 
        isOpen={showStandaloneModal} 
        onClose={() => setShowStandaloneModal(false)} 
      />

      {/* Pending Modal */}
      {showPendingModal && (
        <div 
          style={{ 
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, 
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backgroundColor: 'rgba(0, 0, 0, 0.85)', backdropFilter: 'blur(4px)' 
          }}
        >
          <div 
            style={{ 
              backgroundColor: '#1e293b', border: '4px solid #eab308', borderRadius: '16px', padding: '32px', 
              maxWidth: '450px', width: '90%', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)', 
              display: 'flex', flexDirection: 'column', gap: '20px' 
            }}
          >
            <h2 style={{ fontSize: '1.8rem', fontWeight: 900, color: '#ffffff', textTransform: 'uppercase', margin: 0, textAlign: 'center' }}>
              Deixar Venda Pendente
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ fontSize: '0.875rem', fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Nome do Cliente</label>
                <input 
                  type="text" autoFocus
                  style={{ width: '100%', boxSizing: 'border-box', backgroundColor: '#0f172a', border: '1px solid #475569', borderRadius: '8px', padding: '12px', fontSize: '1.25rem', fontWeight: 'bold', color: 'white', outline: 'none' }}
                  value={pendingClientName} onChange={e => setPendingClientName(e.target.value)}
                  placeholder="Nome para retirar"
                />
              </div>
              <div>
                <label style={{ fontSize: '0.875rem', fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Telefone (Opcional)</label>
                <input 
                  type="text" 
                  style={{ width: '100%', boxSizing: 'border-box', backgroundColor: '#0f172a', border: '1px solid #475569', borderRadius: '8px', padding: '12px', fontSize: '1.25rem', fontWeight: 'bold', color: 'white', outline: 'none' }}
                  value={pendingClientPhone} onChange={e => setPendingClientPhone(e.target.value)}
                  placeholder="(00) 00000-0000"
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
              <button 
                onClick={() => setShowPendingModal(false)}
                style={{ flex: 1, padding: '12px', backgroundColor: '#334155', color: 'white', fontWeight: 'bold', borderRadius: '8px', textTransform: 'uppercase', border: 'none', cursor: 'pointer' }}
              >
                Voltar
              </button>
              <button 
                onClick={savePendingSale}
                style={{ flex: 1, padding: '12px', backgroundColor: '#eab308', color: '#000000', fontWeight: 'bold', borderRadius: '8px', textTransform: 'uppercase', border: 'none', cursor: 'pointer' }}
              >
                Salvar Pendente
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modals for Confirmation Flow */}
      {showConfirmModal && (
        <div 
          style={{ 
            position: 'fixed', 
            top: 0, 
            left: 0, 
            right: 0, 
            bottom: 0, 
            zIndex: 9999, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            backgroundColor: 'rgba(0, 0, 0, 0.85)', 
            backdropFilter: 'blur(4px)' 
          }}
          className="animate-fade-in"
        >
          <div 
            style={{ 
              backgroundColor: '#1e293b', 
              border: '4px solid #eab308', 
              borderRadius: '16px', 
              padding: '32px', 
              maxWidth: '450px', 
              width: '90%', 
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)', 
              textAlign: 'center', 
              display: 'flex', 
              flexDirection: 'column', 
              gap: '20px' 
            }}
            className="animate-scale-in"
          >
            <h2 style={{ fontSize: '2.2rem', fontWeight: 900, color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
              Finalizar Venda?
            </h2>
            
            <div style={{ backgroundColor: 'rgba(0,0,0,0.3)', padding: '16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {discountValue > 0 ? (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '1.1rem', fontWeight: 'bold', color: '#94a3b8' }}>
                    <span>VALOR BRUTO:</span>
                    <span style={{ color: '#ffffff', fontSize: '1.3rem', fontWeight: 900 }}>
                      R$ {subtotal.toFixed(2).replace('.', ',')}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '1.1rem', fontWeight: 'bold', color: '#f87171' }}>
                    <span>DESCONTO:</span>
                    <span style={{ color: '#f87171', fontSize: '1.3rem', fontWeight: 900 }}>
                      - R$ {discountValue.toFixed(2).replace('.', ',')}
                    </span>
                  </div>
                </>
              ) : null}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '1.1rem', fontWeight: 'bold', color: '#94a3b8' }}>
                <span>TOTAL A PAGAR:</span>
                <span style={{ color: '#ffffff', fontSize: '1.6rem', fontWeight: 900 }}>
                  R$ {totalAmount.toFixed(2).replace('.', ',')}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '1.1rem', fontWeight: 'bold', color: '#94a3b8' }}>
                <span>MÉTODO:</span>
                <span style={{ color: '#eab308', fontSize: '1.5rem', fontWeight: 900, textTransform: 'uppercase' }}>
                  {paymentMethod === 'cash' ? 'Dinheiro' : paymentMethod === 'pix' ? 'PIX' : paymentMethod === 'debit' ? 'Débito' : 'Crédito'}
                </span>
              </div>
              {paymentMethod === 'cash' && changeValue > 0 ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '1.1rem', fontWeight: 'bold', color: '#60a5fa' }}>
                  <span>TROCO:</span>
                  <span style={{ color: '#60a5fa', fontSize: '1.6rem', fontWeight: 900 }}>
                    R$ {changeValue.toFixed(2).replace('.', ',')}
                  </span>
                </div>
              ) : null}
            </div>

            <div style={{ display: 'flex', gap: '16px' }}>
              <button
                onClick={() => setShowConfirmModal(false)}
                style={{ 
                  flex: 1, 
                  padding: '16px', 
                  fontSize: '1.4rem', 
                  fontWeight: 900, 
                  borderRadius: '8px', 
                  textTransform: 'uppercase', 
                  backgroundColor: '#dc2626', 
                  color: '#ffffff', 
                  border: 'none', 
                  cursor: 'pointer', 
                  boxShadow: '0 4px 6px rgba(0,0,0,0.2)',
                  transition: 'opacity 0.2s'
                }}
                onMouseOver={(e) => (e.currentTarget.style.opacity = '0.9')}
                onMouseOut={(e) => (e.currentTarget.style.opacity = '1')}
              >
                NÃO
              </button>
              <button
                onClick={() => {
                  setShowConfirmModal(false);
                  setShowPrintModal(true);
                }}
                style={{ 
                  flex: 1, 
                  padding: '16px', 
                  fontSize: '1.4rem', 
                  fontWeight: 900, 
                  borderRadius: '8px', 
                  textTransform: 'uppercase', 
                  backgroundColor: '#16a34a', 
                  color: '#ffffff', 
                  border: 'none', 
                  cursor: 'pointer', 
                  boxShadow: '0 4px 6px rgba(0,0,0,0.2)',
                  transition: 'opacity 0.2s'
                }}
                onMouseOver={(e) => (e.currentTarget.style.opacity = '0.9')}
                onMouseOut={(e) => (e.currentTarget.style.opacity = '1')}
              >
                SIM
              </button>
            </div>
          </div>
        </div>
      )}

      {showPrintModal && (
        <div 
          style={{ 
            position: 'fixed', 
            top: 0, 
            left: 0, 
            right: 0, 
            bottom: 0, 
            zIndex: 9999, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            backgroundColor: 'rgba(0, 0, 0, 0.85)', 
            backdropFilter: 'blur(4px)' 
          }}
          className="animate-fade-in"
        >
          <div 
            style={{ 
              backgroundColor: '#1e293b', 
              border: '4px solid #3b82f6', 
              borderRadius: '16px', 
              padding: '32px', 
              maxWidth: '450px', 
              width: '90%', 
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)', 
              textAlign: 'center', 
              display: 'flex', 
              flexDirection: 'column', 
              gap: '20px' 
            }}
            className="animate-scale-in"
          >
            <h2 style={{ fontSize: '2.2rem', fontWeight: 900, color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
              Imprimir Cupom?
            </h2>
            <p style={{ color: '#d1d5db', fontSize: '1.25rem', fontWeight: 'bold', margin: '0 0 10px 0' }}>
              Deseja imprimir o cupom não-fiscal desta venda?
            </p>

            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', color: '#fff', fontSize: '1.2rem', cursor: 'pointer', marginBottom: '10px' }}>
              <input 
                type="checkbox" 
                checked={printTwoCopies} 
                onChange={(e) => setPrintTwoCopies(e.target.checked)} 
                style={{ width: '24px', height: '24px', accentColor: '#3b82f6', cursor: 'pointer' }}
              />
              <span style={{ fontWeight: 'bold' }}>2 VIAS? (Cliente e Chaveiro)</span>
            </label>

            <div style={{ display: 'flex', gap: '16px' }}>
              <button
                onClick={() => {
                  setShowPrintModal(false);
                  completeCheckout(false, printTwoCopies);
                }}
                style={{ 
                  flex: 1, 
                  padding: '16px', 
                  fontSize: '1.4rem', 
                  fontWeight: 900, 
                  borderRadius: '8px', 
                  textTransform: 'uppercase', 
                  backgroundColor: '#64748b', 
                  color: '#ffffff', 
                  border: 'none', 
                  cursor: 'pointer', 
                  boxShadow: '0 4px 6px rgba(0,0,0,0.2)',
                  transition: 'opacity 0.2s'
                }}
                onMouseOver={(e) => (e.currentTarget.style.opacity = '0.9')}
                onMouseOut={(e) => (e.currentTarget.style.opacity = '1')}
              >
                NÃO
              </button>
              <button
                onClick={() => {
                  setShowPrintModal(false);
                  completeCheckout(true, printTwoCopies);
                }}
                style={{ 
                  flex: 1, 
                  padding: '16px', 
                  fontSize: '1.4rem', 
                  fontWeight: 900, 
                  borderRadius: '8px', 
                  textTransform: 'uppercase', 
                  backgroundColor: '#3b82f6', 
                  color: '#ffffff', 
                  border: 'none', 
                  cursor: 'pointer', 
                  boxShadow: '0 4px 6px rgba(0,0,0,0.2)',
                  transition: 'opacity 0.2s'
                }}
                onMouseOver={(e) => (e.currentTarget.style.opacity = '0.9')}
                onMouseOut={(e) => (e.currentTarget.style.opacity = '1')}
              >
                SIM
              </button>
            </div>
          </div>
        </div>
      )}

      {showCloseRegisterModal && activeSession && (
        <div 
          style={{ 
            position: 'fixed', 
            top: 0, 
            left: 0, 
            right: 0, 
            bottom: 0, 
            zIndex: 9999, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            backgroundColor: 'rgba(0, 0, 0, 0.85)', 
            backdropFilter: 'blur(4px)' 
          }}
          className="animate-fade-in"
        >
          <div 
            style={{ 
              backgroundColor: '#1e293b', 
              border: '4px solid #dc2626', 
              borderRadius: '16px', 
              padding: '28px', 
              maxWidth: '520px', 
              width: '95%', 
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)', 
              display: 'flex', 
              flexDirection: 'column', 
              gap: '16px',
              color: '#ffffff'
            }}
            className="animate-scale-in"
          >
            <h2 style={{ fontSize: '1.8rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0, color: '#f87171', textAlign: 'center' }}>
              Fechar Caixa (Turno)
            </h2>

            {(() => {
              const pendingWages = employees?.filter(e => selectedEmployeesToPay.includes(e.id!)).reduce((sum, e) => {
                const wageStr = customWages[e.id!] !== undefined ? customWages[e.id!] : e.dailyWage.toFixed(2).replace('.', ',');
                return sum + parseCurrency(wageStr);
              }, 0) || 0;
              const expectedGrossCash = activeSession.initialCash + sessionTotals.cash - sessionTotals.expenses;
              const expectedNetCash = expectedGrossCash - pendingWages;
              
              const closeCash = parseCurrency(closeRegisterCash);
              const leftInDrawer = parseCurrency(closeLeftInDrawer);
              const diff = closeCash - expectedGrossCash;
              const withdrawal = (closeCash - pendingWages) - leftInDrawer;

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  
                  {/* 1. Entradas e Saídas */}
                  <div style={{ backgroundColor: 'rgba(0,0,0,0.3)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.9rem' }}>
                    
                    <div style={{ color: '#38bdf8', fontWeight: 'bold', marginBottom: '4px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '4px' }}>RESUMO DE ENTRADAS</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#94a3b8' }}>Fundo de Abertura:</span>
                      <span style={{ fontWeight: 'bold' }}>R$ {activeSession.initialCash.toFixed(2).replace('.', ',')}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#94a3b8' }}>Vendas em Dinheiro:</span>
                      <span style={{ fontWeight: 'bold', color: '#4ade80' }}>+ R$ {sessionTotals.cash.toFixed(2).replace('.', ',')}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#94a3b8' }}>Vendas em PIX:</span>
                      <span style={{ fontWeight: 'bold' }}>R$ {sessionTotals.pix.toFixed(2).replace('.', ',')}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#94a3b8' }}>Vendas Cartão:</span>
                      <span style={{ fontWeight: 'bold' }}>R$ {(sessionTotals.debit + sessionTotals.credit).toFixed(2).replace('.', ',')}</span>
                    </div>
                    
                    <div style={{ color: '#f87171', fontWeight: 'bold', margin: '8px 0 4px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '4px' }}>RESUMO DE SAÍDAS (CUSTOS)</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#f87171' }}>Despesas / Retiradas:</span>
                      <span style={{ fontWeight: 'bold', color: '#f87171' }}>- R$ {sessionTotals.expenses.toFixed(2).replace('.', ',')}</span>
                    </div>
                    {pendingWages > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#f87171' }}>Pagamento de Diárias:</span>
                        <span style={{ fontWeight: 'bold', color: '#f87171' }}>- R$ {pendingWages.toFixed(2).replace('.', ',')}</span>
                      </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed rgba(255,255,255,0.1)', marginTop: '8px', paddingTop: '8px', fontSize: '1rem' }}>
                      <span style={{ color: '#ffffff', fontWeight: 'bold' }}>LUCRO BRUTO DO PERÍODO:</span>
                      <strong style={{ color: '#4ade80' }}>R$ {(sessionTotals.totalSales - sessionTotals.expenses - pendingWages).toFixed(2).replace('.', ',')}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1rem' }}>
                      <span style={{ color: '#ffffff', fontWeight: 'bold' }}>DINHEIRO ESPERADO NA GAVETA:</span>
                      <strong style={{ color: '#eab308' }}>R$ {expectedNetCash.toFixed(2).replace('.', ',')}</strong>
                    </div>
                  </div>

                  {/* 2. Diárias */}
                  {employees && employees.filter(e => e.active).length > 0 && activeSession.profile === 'chaveiro' && (
                    <div style={{ backgroundColor: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '6px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <span style={{ color: '#94a3b8', fontWeight: 'bold', fontSize: '0.85rem' }}>PAGAMENTO DE DIÁRIAS (MARQUE PARA ABATER DO CAIXA):</span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {employees.filter(e => e.active).map(emp => {
                          const isChecked = selectedEmployeesToPay.includes(emp.id!);
                          const currentWage = customWages[emp.id!] !== undefined ? customWages[emp.id!] : emp.dailyWage.toFixed(2).replace('.', ',');
                          
                          return (
                          <div key={emp.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: '#fff', flex: 1 }}>
                              <input 
                                type="checkbox" 
                                checked={isChecked}
                                onChange={(e) => {
                                  if (e.target.checked) setSelectedEmployeesToPay([...selectedEmployeesToPay, emp.id!]);
                                  else {
                                    setSelectedEmployeesToPay(selectedEmployeesToPay.filter(id => id !== emp.id!));
                                    const newWages = {...customWages};
                                    delete newWages[emp.id!];
                                    setCustomWages(newWages);
                                  }
                                }}
                                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                              />
                              <span style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{emp.name}</span>
                            </label>
                            {isChecked ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <span style={{ color: '#f87171', fontWeight: 'bold', fontSize: '0.9rem' }}>- R$</span>
                                <input 
                                  type="text"
                                  value={currentWage}
                                  onChange={e => {
                                    let val = e.target.value.replace(/\D/g, '');
                                    if (val === '') val = '0';
                                    const formatted = (parseFloat(val) / 100).toFixed(2).replace('.', ',');
                                    setCustomWages({...customWages, [emp.id!]: formatted});
                                  }}
                                  style={{
                                    width: '70px',
                                    backgroundColor: 'rgba(0,0,0,0.5)',
                                    border: '1px solid #dc2626',
                                    borderRadius: '4px',
                                    padding: '4px',
                                    color: '#f87171',
                                    fontSize: '0.9rem',
                                    fontWeight: 'bold',
                                    textAlign: 'center',
                                    outline: 'none'
                                  }}
                                />
                              </div>
                            ) : (
                              <span style={{ color: '#94a3b8', fontWeight: 'bold', fontSize: '0.9rem' }}>- R$ {emp.dailyWage.toFixed(2).replace('.', ',')}</span>
                            )}
                          </div>
                        )})}
                      </div>
                    </div>
                  )}

                  {/* 3. Inputs */}
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                      <label style={{ color: '#ffffff', fontWeight: 'bold', fontSize: '0.8rem' }}>
                        DINHEIRO FÍSICO CONTADO (R$):
                      </label>
                      <input
                        type="text"
                        placeholder="0,00"
                        style={{
                          width: '100%',
                          backgroundColor: 'rgba(0,0,0,0.5)',
                          border: '2px solid #dc2626',
                          borderRadius: '6px',
                          padding: '8px',
                          color: '#4ade80',
                          fontSize: '1.2rem',
                          fontWeight: 'bold',
                          textAlign: 'center',
                          outline: 'none'
                        }}
                        value={closeRegisterCash}
                        onChange={e => {
                          let val = e.target.value.replace(/\D/g, '');
                          if (val === '') val = '0';
                          const formatted = (parseFloat(val) / 100).toFixed(2).replace('.', ',');
                          setCloseRegisterCash(formatted);
                        }}
                      />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                      <label style={{ color: '#94a3b8', fontWeight: 'bold', fontSize: '0.8rem' }}>
                        FUNDO P/ AMANHÃ (R$):
                      </label>
                      <input
                        type="text"
                        style={{
                          width: '100%',
                          backgroundColor: 'rgba(0,0,0,0.4)',
                          border: '2px solid #475569',
                          borderRadius: '6px',
                          padding: '8px',
                          color: '#ffffff',
                          fontSize: '1.2rem',
                          fontWeight: 'bold',
                          textAlign: 'center',
                          outline: 'none'
                        }}
                        value={closeLeftInDrawer}
                        onChange={e => {
                          let val = e.target.value.replace(/\D/g, '');
                          if (val === '') val = '0';
                          const formatted = (parseFloat(val) / 100).toFixed(2).replace('.', ',');
                          setCloseLeftInDrawer(formatted);
                        }}
                      />
                    </div>
                  </div>

                  {/* 4. Resumo de Diferença */}
                  <div style={{ backgroundColor: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '6px', display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.9rem', textAlign: 'center' }}>
                    <div>
                      Diferença no Caixa: {' '}
                      {diff > 0 ? (
                        <span style={{ color: '#4ade80', fontWeight: 'bold' }}>+ R$ {diff.toFixed(2).replace('.', ',')} (Sobrando)</span>
                      ) : diff < 0 ? (
                        <span style={{ color: '#f87171', fontWeight: 'bold' }}>R$ {diff.toFixed(2).replace('.', ',')} (Faltando)</span>
                      ) : (
                        <span style={{ color: '#94a3b8', fontWeight: 'bold' }}>R$ 0,00 (Tudo Ok!)</span>
                      )}
                    </div>
                    {withdrawal > 0 ? (
                      <div style={{ color: '#38bdf8', fontWeight: 'bold', fontSize: '1rem', marginTop: '4px' }}>
                        Retirada / Sangria Sugerida: R$ {withdrawal.toFixed(2).replace('.', ',')}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })()}

            <div style={{ display: 'flex', gap: '12px', marginTop: '4px' }}>
              <button
                onClick={() => setShowCloseRegisterModal(false)}
                style={{ 
                  flex: 1, 
                  padding: '12px', 
                  fontSize: '1.1rem', 
                  fontWeight: 'bold', 
                  borderRadius: '6px', 
                  backgroundColor: '#64748b', 
                  color: '#ffffff', 
                  border: 'none', 
                  cursor: 'pointer' 
                }}
              >
                Voltar pro PDV
              </button>
              <button
                onClick={handleCloseRegister}
                style={{ 
                  flex: 1, 
                  padding: '12px', 
                  fontSize: '1.1rem', 
                  fontWeight: 'bold', 
                  borderRadius: '6px', 
                  backgroundColor: '#dc2626', 
                  color: '#ffffff', 
                  border: 'none', 
                  cursor: 'pointer' 
                }}
              >
                Confirmar Fechamento
              </button>
            </div>
          </div>
        </div>
      )}

      {showExpenseModal && activeSession && (
        <div 
          style={{ 
            position: 'fixed', 
            top: 0, 
            left: 0, 
            right: 0, 
            bottom: 0, 
            zIndex: 9999, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            backgroundColor: 'rgba(0, 0, 0, 0.85)', 
            backdropFilter: 'blur(4px)' 
          }}
          className="animate-fade-in"
        >
          <form 
            onSubmit={handleAddExpense}
            style={{ 
              backgroundColor: '#1e293b', 
              border: '4px solid #d97706', 
              borderRadius: '16px', 
              padding: '28px', 
              maxWidth: '450px', 
              width: '95%', 
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)', 
              display: 'flex', 
              flexDirection: 'column', 
              gap: '16px',
              color: '#ffffff'
            }}
            className="animate-scale-in"
          >
            <h2 style={{ fontSize: '1.8rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0, color: '#f59e0b', textAlign: 'center' }}>
              Registrar Despesa
            </h2>
            <p style={{ color: '#94a3b8', fontSize: '0.95rem', textAlign: 'center', margin: 0 }}>
              Retirada de dinheiro do caixa ativo do operador <strong style={{ color: '#eab308', textTransform: 'uppercase' }}>{transactionProfile}</strong>.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ color: '#ffffff', fontWeight: 'bold', fontSize: '1rem' }}>
                  VALOR DA RETIRADA (R$):
                </label>
                <input
                  type="text"
                  placeholder="0,00"
                  autoFocus
                  required
                  style={{
                    width: '100%',
                    backgroundColor: 'rgba(0,0,0,0.5)',
                    border: '3px solid #d97706',
                    borderRadius: '8px',
                    padding: '12px',
                    color: '#f59e0b',
                    fontSize: '1.8rem',
                    fontWeight: '900',
                    textAlign: 'center',
                    outline: 'none'
                  }}
                  value={expenseAmount}
                  onChange={e => {
                    let val = e.target.value.replace(/\D/g, '');
                    if (val === '') val = '0';
                    const formatted = (parseFloat(val) / 100).toFixed(2).replace('.', ',');
                    setExpenseAmount(formatted);
                  }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ color: '#94a3b8', fontWeight: 'bold', fontSize: '0.9rem' }}>
                  MOTIVO / INSUMO COMPRADO:
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Bobinas, Óleo WD40, Fita, Papel"
                  style={{
                    width: '100%',
                    backgroundColor: 'rgba(0,0,0,0.4)',
                    border: '2px solid #475569',
                    borderRadius: '6px',
                    padding: '10px 12px',
                    color: '#ffffff',
                    fontSize: '1.1rem',
                    fontWeight: 'bold',
                    outline: 'none'
                  }}
                  value={expenseDescription}
                  onChange={e => setExpenseDescription(e.target.value)}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
              <button
                type="button"
                onClick={() => setShowExpenseModal(false)}
                style={{ 
                  flex: 1, 
                  padding: '12px', 
                  fontSize: '1.1rem', 
                  fontWeight: 'bold', 
                  borderRadius: '6px', 
                  backgroundColor: '#64748b', 
                  color: '#ffffff', 
                  border: 'none', 
                  cursor: 'pointer' 
                }}
              >
                Cancelar
              </button>
              <button
                type="submit"
                style={{ 
                  flex: 1, 
                  padding: '12px', 
                  fontSize: '1.1rem', 
                  fontWeight: 'bold', 
                  borderRadius: '6px', 
                  backgroundColor: '#d97706', 
                  color: '#ffffff', 
                  border: 'none', 
                  cursor: 'pointer' 
                }}
              >
                Confirmar Retirada
              </button>
            </div>
          </form>
        </div>
      )}
      {showSplitModal && (
        <div 
          style={{ 
            position: 'fixed', 
            top: 0, 
            left: 0, 
            right: 0, 
            bottom: 0, 
            zIndex: 9999, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            backgroundColor: 'rgba(0, 0, 0, 0.85)', 
            backdropFilter: 'blur(4px)' 
          }}
          className="animate-fade-in"
        >
          <div 
            style={{ 
              backgroundColor: '#1e293b', 
              border: '4px solid #f59e0b', 
              borderRadius: '16px', 
              padding: '28px', 
              maxWidth: '450px', 
              width: '95%', 
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)', 
              display: 'flex', 
              flexDirection: 'column', 
              gap: '16px',
              color: '#ffffff'
            }}
            className="animate-scale-in"
          >
            <h2 style={{ fontSize: '1.8rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0, color: '#f59e0b', textAlign: 'center' }}>
              Pagamento Múltiplo
            </h2>
            <p style={{ color: '#94a3b8', fontSize: '0.95rem', textAlign: 'center', margin: 0 }}>
              Adicione as formas de pagamento parciais até atingir o total da venda.
            </p>

            <div style={{ backgroundColor: 'rgba(0,0,0,0.3)', padding: '16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '1.05rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#94a3b8', fontWeight: 'bold' }}>Total da Venda:</span>
                <span style={{ fontWeight: 'bold', color: '#ffffff' }}>R$ {totalAmount.toFixed(2).replace('.', ',')}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#94a3b8', fontWeight: 'bold' }}>Valor já lançado:</span>
                <span style={{ fontWeight: 'bold', color: '#4ade80' }}>R$ {splitPayments.reduce((s, p) => s + p.amount, 0).toFixed(2).replace('.', ',')}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed rgba(255,255,255,0.1)', paddingTop: '6px' }}>
                <span style={{ color: '#f87171', fontWeight: 'bold' }}>Falta Lançar:</span>
                <span style={{ fontWeight: 'bold', color: '#f87171' }}>R$ {Math.max(0, totalAmount - splitPayments.reduce((s, p) => s + p.amount, 0)).toFixed(2).replace('.', ',')}</span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <select
                  className="p-3 bg-black/50 text-white rounded border border-gray-600 outline-none flex-1 font-bold uppercase text-sm"
                  value={currentSplitMethod}
                  onChange={e => setCurrentSplitMethod(e.target.value as PaymentMethod)}
                >
                  <option value="cash">Dinheiro</option>
                  <option value="pix">PIX</option>
                  <option value="debit">Débito</option>
                  <option value="credit">Crédito</option>
                </select>
                <input
                  type="text"
                  className="p-3 w-1/3 text-right bg-black/50 text-white rounded border border-gray-600 outline-none font-bold text-sm"
                  placeholder="0,00"
                  value={currentSplitAmount}
                  onChange={e => setCurrentSplitAmount(e.target.value.replace(/[^0-9.,]/g, ''))}
                  onFocus={() => {
                     const falta = Math.max(0, totalAmount - splitPayments.reduce((s, p) => s + p.amount, 0));
                     if (!currentSplitAmount && falta > 0) {
                        setCurrentSplitAmount(falta.toFixed(2).replace('.', ','));
                     }
                  }}
                />
              </div>
              <button
                className="btn w-full py-3 uppercase font-bold text-sm"
                style={{ backgroundColor: '#3b82f6', color: 'white', border: 'none' }}
                onClick={() => {
                  const amt = parseCurrency(currentSplitAmount);
                  if (amt > 0) {
                    setSplitPayments([...splitPayments, { method: currentSplitMethod, amount: amt }]);
                    setCurrentSplitAmount('');
                  }
                }}
              >
                + Adicionar Parcial
              </button>
            </div>

            {splitPayments.length > 0 && (
              <div className="flex flex-col gap-2 mt-2 max-h-32 overflow-y-auto pr-2 custom-scrollbar">
                {splitPayments.map((sp, idx) => (
                  <div key={idx} className="flex justify-between items-center bg-gray-800/80 p-3 rounded border border-gray-600/50">
                    <span className="uppercase font-bold text-sm text-gray-300">
                      {sp.method === 'cash' ? 'Dinheiro' : sp.method === 'credit' ? 'Crédito' : sp.method === 'debit' ? 'Débito' : 'PIX'}
                    </span>
                    <div className="flex items-center gap-4">
                      <span className="font-mono text-green-400 font-bold text-sm">R$ {sp.amount.toFixed(2).replace('.', ',')}</span>
                      <button onClick={() => setSplitPayments(splitPayments.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-300">
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
              <button
                type="button"
                onClick={() => {
                   if (splitPayments.length === 0) setPaymentMethod('cash'); // fallback se cancelar sem nada
                   setShowSplitModal(false);
                }}
                style={{ flex: 1, padding: '12px', fontSize: '1rem', fontWeight: 'bold', borderRadius: '6px', backgroundColor: '#64748b', color: '#ffffff', border: 'none', cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={Math.max(0, totalAmount - splitPayments.reduce((s, p) => s + p.amount, 0)) > 0}
                onClick={() => setShowSplitModal(false)}
                style={{ flex: 2, padding: '12px', fontSize: '1rem', fontWeight: 'bold', borderRadius: '6px', backgroundColor: Math.max(0, totalAmount - splitPayments.reduce((s, p) => s + p.amount, 0)) > 0 ? '#4b5563' : '#22c55e', color: '#ffffff', border: 'none', cursor: Math.max(0, totalAmount - splitPayments.reduce((s, p) => s + p.amount, 0)) > 0 ? 'not-allowed' : 'pointer' }}
              >
                {Math.max(0, totalAmount - splitPayments.reduce((s, p) => s + p.amount, 0)) > 0 ? 'Falta Valor' : 'Concluir'}
              </button>
            </div>
          </div>
        </div>
      )}

      {updateProgress !== null && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ backgroundColor: '#1e293b', padding: '24px', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.5)', width: '400px', textAlign: 'center', border: '1px solid #334155' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginBottom: '16px', color: '#f8fafc' }}>Baixando Atualização...</h3>
            <div style={{ width: '100%', backgroundColor: '#334155', borderRadius: '9999px', height: '16px', marginBottom: '8px', overflow: 'hidden' }}>
              <div style={{ backgroundColor: '#22c55e', height: '100%', borderRadius: '9999px', transition: 'width 0.3s ease', width: `${updateProgress}%` }}></div>
            </div>
            <p style={{ fontSize: '0.875rem', color: '#94a3b8' }}>{Math.round(updateProgress)}% concluído</p>
            <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '12px' }}>O sistema pedirá para reiniciar em breve.</p>
          </div>
        </div>
      )}
    </div>
  );
};
