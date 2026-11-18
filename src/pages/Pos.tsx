import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { db, type PaymentMethod, type TransactionItem } from '../db/db';
import type { Profile } from '../db/db';
import { CheckCircle, Trash2, Banknote, CreditCard, Smartphone, Tag, Package, Printer, ArrowLeftRight, CircleDollarSign, Power, TriangleAlert } from 'lucide-react';
import { getFinancialShares, itemFinancialProfile, toggleItemFinancialProfile } from '../db/financialAllocation';
import { printedCustomerName } from '../db/receiptIdentity.cjs';
import { newestPendingFirst, pendingNameOnly, pendingSaleChanges } from '../db/pendingSales';
import { getCashSessionTotals } from '../db/cashTotals';
import { dateKey, money, provisionStatus } from '../db/managementMath';
import { moveFund, reserveForOccurrence, saveFund } from '../db/managementService';
import type { MoneySource } from '../db/managementTypes';
import { useLiveQuery } from 'dexie-react-hooks';
import { RegisterLossModal } from '../components/RegisterLossModal';
import { runAutoBackup } from '../db/sync';
import { StandaloneReceiptModal } from '../components/StandaloneReceiptModal';
import { StorageBoxModal } from '../components/StorageBoxModal';
import { differenceInDays } from 'date-fns';
import { feeCents, rateFor } from '../db/machineService';
import { restockSuggestionCents } from '../db/restockSuggestion';

export const Pos = () => {
  const [selectedMachineId, setSelectedMachineId] = useState<number | null | undefined>(undefined);
  const [transactionProfile, setTransactionProfile] = useState<Profile>(() => {
    return (localStorage.getItem('ichaveiro_last_profile') as Profile) || 'chaveiro';
  });

  useEffect(() => {
    localStorage.setItem('ichaveiro_last_profile', transactionProfile);
    const savedDrawerLeft = localStorage.getItem(`ichaveiro_last_drawer_left_${transactionProfile}`) || '0,00';
    setOpenRegisterCash(savedDrawerLeft);
    setSelectedMachineId(undefined);
  }, [transactionProfile]);
  const [items, setItems] = useState<TransactionItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [splitPayments, setSplitPayments] = useState<{ method: PaymentMethod, amount: number; installments?: number; machineId?: number; machineFee?: number; netAmount?: number }[]>([]);
  const [currentSplitMethod, setCurrentSplitMethod] = useState<PaymentMethod>('pix');
  const [currentSplitInstallments, setCurrentSplitInstallments] = useState(1);
  const [creditInstallments, setCreditInstallments] = useState(1);
  const [currentSplitMachineId, setCurrentSplitMachineId] = useState<number | null | undefined>(undefined);
  const [currentSplitAmount, setCurrentSplitAmount] = useState<string>('');
  const [clientCode, setClientCode] = useState('');
  const [searchProduct, setSearchProduct] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchSelectedIndex, setSearchSelectedIndex] = useState(0);
  const [searchOverlayStyle, setSearchOverlayStyle] = useState<React.CSSProperties>({});
  const [discount, setDiscount] = useState<string>('');
  const [cashReceived, setCashReceived] = useState<string>('');
  const [customUnitPrice, setCustomUnitPrice] = useState<string>('');
  const machineData = useLiveQuery(async () => ({ machines: await db.paymentMachines.toArray(), settings: await db.managementSettings.toArray() }));
  const defaultMachineId = Number(machineData?.settings.find(row => row.key === `defaultMachine:${transactionProfile}`)?.value) || undefined;
  const activeMachines = machineData?.machines.filter(machine => machine.active) || [];
  const effectiveMachineId = selectedMachineId === undefined ? defaultMachineId : selectedMachineId || undefined;
  const activeMachine = activeMachines.find(machine => machine.id === effectiveMachineId);
  const paymentRate = (method: PaymentMethod, machineId: number | null | undefined = effectiveMachineId, installments = creditInstallments) => method === 'cash' || (method === 'pix' && !machineId) ? undefined : rateFor(activeMachines.find(machine => machine.id === machineId), method as 'pix'|'debit'|'credit', method === 'credit' ? installments : 1);
  const paymentFeeCents = (method: PaymentMethod, grossCents: number, machineId = effectiveMachineId, installments = creditInstallments) => { const rate = paymentRate(method, machineId, installments); return rate ? feeCents(grossCents, rate) : 0; };
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printTwoCopies, setPrintTwoCopies] = useState(false);
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [showLossModal, setShowLossModal] = useState(false);
  const [showStandaloneModal, setShowStandaloneModal] = useState(false);
  const [showStorageBoxModal, setShowStorageBoxModal] = useState(false);

  // Pending Sales states
  const [activePendingSaleId, setActivePendingSaleId] = useState<number | null>(null);
  const [pickupName, setPickupName] = useState('');
  const [pickupPhone, setPickupPhone] = useState('');
  const [pickupNameError, setPickupNameError] = useState(false);
  const pickupNameRef = useRef<HTMLInputElement>(null);

  // Cash Register (Caixa) Session states
  const [openRegisterCash, setOpenRegisterCash] = useState<string>('0,00');
  const [showCloseRegisterModal, setShowCloseRegisterModal] = useState(false);
  const [closeRegisterCash, setCloseRegisterCash] = useState<string>('');
  const [selectedEmployeesToPay, setSelectedEmployeesToPay] = useState<number[]>([]);
  const [customWages, setCustomWages] = useState<Record<number, string>>({});
  const [employeePaymentMethods, setEmployeePaymentMethods] = useState<Record<number, 'cash' | 'pix' | 'split'>>({});
  const [employeeSplitCash, setEmployeeSplitCash] = useState<Record<number, string>>({});
  const employees = useLiveQuery(() => db.employees?.toArray() || []);
  const [closeLeftInDrawer, setCloseLeftInDrawer] = useState<string>('0,00');
  const [closeReservations, setCloseReservations] = useState<Record<string, { selected: boolean; amount: string; source: MoneySource }>>({});
  const [restockSelected, setRestockSelected] = useState(false);
  const [restockAmount, setRestockAmount] = useState('');
  const [restockSource, setRestockSource] = useState<MoneySource>('cash');
  const [restockFundId, setRestockFundId] = useState<number | null>(null);
  const [restockFundName, setRestockFundName] = useState('');
  const [creatingRestockFund, setCreatingRestockFund] = useState(false);
  const closeInProgress = useRef(false);

  const managementAtClose = useLiveQuery(async () => ({
    accounts: await db.managementAccounts.toArray(),
    occurrences: await db.managementOccurrences.toArray(),
    entries: await db.managementEntries.toArray(),
    funds: await db.managementFunds.toArray(),
    products: await db.products.toArray()
  }));

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

  const closeReserveLines = activeSession && managementAtClose ? [
    ...managementAtClose.occurrences.filter(row => row.profile === activeSession.profile && row.status === 'open').flatMap(row => {
      const plan = managementAtClose.accounts.find(candidate => candidate.id === row.accountId);
      if (!plan?.provisionEnabled || plan.status !== 'active') return [];
      const status = provisionStatus(plan, row, managementAtClose.entries, dateKey(new Date()));
      return status.toFund > 0 && (status.suggested > 0 || status.pending > 0) ? [{ key: `account:${row.id}`, kind: 'account' as const, id: row.id!, name: row.name, daily: status.dailyCents, pending: status.pending, suggested: status.suggested }] : [];
    }),
    ...managementAtClose.funds.filter(row => row.profile === activeSession.profile && row.status === 'active' && (row.dailySuggestedCents || 0) > 0).map(row => ({ key: `fund:${row.id}`, kind: 'fund' as const, id: row.id!, name: row.name, daily: row.dailySuggestedCents || 0, pending: 0, suggested: row.dailySuggestedCents || 0 }))
  ] : [];
  const selectedCloseReservations = closeReserveLines.map(line => ({ ...line, choice: closeReservations[line.key] })).filter(line => line.choice?.selected).map(line => ({ ...line, amountCents: Math.round(Number(line.choice!.amount.replace(',', '.')) * 100) }));
  const restockSuggestedCents = activeSession && managementAtClose ? restockSuggestionCents(sessionTransactions || [], managementAtClose.products || [], activeSession) : 0;
  const activeRestockFunds = activeSession ? (managementAtClose?.funds || []).filter(fund => fund.profile === activeSession.profile && fund.status === 'active') : [];
  const restockCents = restockSelected ? Math.round(Number(restockAmount.replace(',', '.')) * 100) : 0;
  const closeCashReserves = (selectedCloseReservations.filter(line => line.choice!.source === 'cash').reduce((sum, line) => sum + line.amountCents, 0) + (restockSource === 'cash' ? restockCents : 0)) / 100;

  const sessionTotals = React.useMemo(() => {
    return getCashSessionTotals(sessionTransactions || [], transactionProfile);
  }, [sessionTransactions, transactionProfile]);

  const searchInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!searchFocused || !searchProduct.trim() || !searchInputRef.current) return;
    const update = () => {
      const rect = searchInputRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(440, window.innerWidth - 16);
      const height = Math.min(290, Math.max(120, window.innerHeight - 16));
      const below = window.innerHeight - rect.bottom - 8;
      const above = rect.top - 8;
      const openAbove = below < 190 && above > below;
      const maxHeight = Math.max(120, Math.min(height, openAbove ? above : below));
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
      setSearchOverlayStyle({ position: 'fixed', left, top: openAbove ? Math.max(8, rect.top - maxHeight) : rect.bottom, width, maxHeight, zIndex: 10000 });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => { window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true); };
  }, [searchFocused, searchProduct]);

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
  const recentPendingSales = pendingSales.filter(s => differenceInDays(todayDate, s.date) <= 7).sort(newestPendingFirst);
  const archivedPendingSales = pendingSales.filter(s => differenceInDays(todayDate, s.date) > 7).sort(newestPendingFirst);
  const profileLabel = (profile: Profile) => profile.charAt(0).toUpperCase() + profile.slice(1);

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
  const normalizeSearch = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim().replace(/\s+/g, ' ');
  if (searchProduct.trim()) {
    const parsed = parseSearchInput(searchProduct);
    currentQty = parsed.qty;
    const term = normalizeSearch(parsed.term);
    const tokens = term.split(' ').filter(Boolean);
    filteredProducts = (products || []).map(product => {
      const code = normalizeSearch(product.code || '');
      const description = normalizeSearch(`${product.name} ${product.brand || ''} ${product.customCategory || ''}`);
      const expanded = tokens.map(token => token === 'mola' || token === 'molinha' ? ['mola', 'molinha'] : [token]);
      const textMatch = expanded.every(choices => choices.some(token => description.includes(token)));
      const numeric = /^\d+$/.test(term);
      if (!textMatch && !(numeric && code.includes(term))) return null;
      const score = code === term ? 0 : code.startsWith(term) ? 1 : numeric && code.includes(term) ? 2 : description.startsWith(term) ? 3 : 4;
      return { product, score };
    }).filter((entry): entry is { product: NonNullable<typeof products>[number]; score: number } => entry !== null)
      .sort((left, right) => left.score - right.score || left.product.name.localeCompare(right.product.name, 'pt-BR'))
      .map(entry => entry.product).slice(0, 6);
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
      replacementCost: product.replacementCostCents === undefined ? undefined : product.replacementCostCents / 100,
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
      const exactCode = filteredProducts.find(product => normalizeSearch(product.code || '') === normalizeSearch(parseSearchInput(searchProduct).term));
      if (!exactCode && filteredProducts.length > 1) {
        const selected = filteredProducts[Math.min(searchSelectedIndex, filteredProducts.length - 1)];
        addProductToCart(selected, currentQty);
        return;
      }
      addProductToCart(exactCode || filteredProducts[0], currentQty);
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

  const toggleItemProfile = (index: number) => {
    const nextItems = [...items];
    nextItems[index] = toggleItemFinancialProfile(nextItems[index], transactionProfile);
    setItems(nextItems);
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
  const hasOtherFinancialProfile = items.some(item => itemFinancialProfile(item, transactionProfile) !== transactionProfile);
  const financialShares = hasOtherFinancialProfile ? getFinancialShares({
    profile: transactionProfile, type: 'sale', items, total: totalAmount,
    discount: discountValue, paymentMethod, splitPayments, date: new Date()
  }) : [];

  const handleCheckout = () => {
    if (items.length === 0) return alert('Adicione itens ao caixa.');
    if (items.some(i => i.price <= 0)) return alert('Verifique os preços dos itens. Nenhum item pode ter preço 0.');
    if (discountValue > subtotal) return alert('O desconto não pode superar o valor dos itens.');
    
    if (paymentMethod === 'split') {
      const splitTotal = splitPayments.reduce((sum, p) => sum + p.amount, 0);
      if (Math.round(splitTotal * 100) !== Math.round(totalAmount * 100)) {
        return alert(`O total dos pagamentos (R$ ${splitTotal.toFixed(2).replace('.', ',')}) deve ser exatamente igual ao total da venda (R$ ${totalAmount.toFixed(2).replace('.', ',')}).`);
      }
    }

    const checkRate = (method: PaymentMethod, machineId?: number) => {
      if (method === 'cash' || (method === 'pix' && !machineId)) return true;
      return !!rateFor(activeMachines.find(machine => machine.id === machineId), method as 'pix'|'debit'|'credit', method === 'credit' ? creditInstallments : 1);
    };
    if (paymentMethod === 'split') {
        if (splitPayments.some(part => part.method !== 'cash' && !(part.method === 'pix' && !part.machineId) && !rateFor(activeMachines.find(machine => machine.id === part.machineId), part.method as 'pix'|'debit'|'credit', part.method === 'credit' ? part.installments || 1 : 1))) return alert('Configure a tarifa ou escolha uma maquininha com esta modalidade antes de finalizar.');
    } else if (!checkRate(paymentMethod, effectiveMachineId)) return alert('A tarifa desta modalidade precisa ser configurada na maquininha selecionada.');
    
    setShowConfirmModal(true);
  };

  const handlePendingClick = () => {
    if (items.length === 0) return alert('Adicione itens para salvar a retirada.');
    if (!pickupName.trim()) { setPickupNameError(true); pickupNameRef.current?.focus(); return; }
    void savePendingSale();
  };

  const handleCancelCart = () => {
    setItems([]);
    setClientCode('');
    setDiscount('');
    setCashReceived('');
    setCustomUnitPrice('');
    setSplitPayments([]);
    setPickupName('');
    setPickupPhone('');
    setPickupNameError(false);
    setActivePendingSaleId(null);
    if (searchInputRef.current) searchInputRef.current.focus();
  };

  const savePendingSale = async () => {
    const finalClientName = pickupName.trim();
    if (!finalClientName) { setPickupNameError(true); pickupNameRef.current?.focus(); return; }
    if (discountValue > subtotal) return alert('O desconto não pode superar o valor dos itens.');

    try {
      await db.transaction('rw', db.pendingSales, db.products, async () => {
        if (!activePendingSaleId) {
          // Decrease stock if it hasn't been reserved yet
          for (const item of items) {
            if (item.productId) {
              const product = await db.products.get(item.productId);
              if (product && product.hasStock) {
                await db.products.update(product.id!, { stock: product.stock - item.quantity });
              }
            }
          }
        } else {
          // Calculate stock difference for updated items
          const oldSale = await db.pendingSales.get(activePendingSaleId);
          if (!oldSale) throw new Error('Pedido pendente original não encontrado.');
          {
            const oldQtyMap: Record<number, number> = {};
            for (const item of oldSale.items) {
              if (item.productId) oldQtyMap[item.productId] = (oldQtyMap[item.productId] || 0) + item.quantity;
            }
            const newQtyMap: Record<number, number> = {};
            for (const item of items) {
              if (item.productId) newQtyMap[item.productId] = (newQtyMap[item.productId] || 0) + item.quantity;
            }
            const allProdIds = new Set([...Object.keys(oldQtyMap), ...Object.keys(newQtyMap)].map(Number));
            for (const pId of allProdIds) {
              const oldQ = oldQtyMap[pId] || 0;
              const newQ = newQtyMap[pId] || 0;
              const diff = newQ - oldQ;
              if (diff !== 0) {
                const product = await db.products.get(pId);
                if (product && product.hasStock) {
                  await db.products.update(pId, { stock: product.stock - diff });
                }
              }
            }
          }
        }

        if (activePendingSaleId) {
          const oldSale = await db.pendingSales.get(activePendingSaleId);
          if (!oldSale) throw new Error('Pedido pendente original não encontrado.');
          const nameOnly = pendingNameOnly(oldSale, { items, discount: discountValue, paymentMethod, splitPayments });
          await db.pendingSales.update(activePendingSaleId, nameOnly
          ? { clientName: finalClientName, receiptName: clientCode.trim() || undefined, clientPhone: pickupPhone }
            : pendingSaleChanges({
              clientName: finalClientName,
              receiptName: clientCode.trim() || undefined,
              clientPhone: pickupPhone,
              items,
              total: totalAmount,
              discount: discountValue,
              paymentMethod,
              splitPayments: paymentMethod === 'split' ? splitPayments : undefined
            }));
        } else {
          await db.pendingSales.add({
            profile: transactionProfile,
            clientName: finalClientName,
            receiptName: clientCode.trim() || undefined,
            clientPhone: pickupPhone,
            items: items,
            total: totalAmount,
            discount: discountValue,
            paymentMethod,
            splitPayments: paymentMethod === 'split' ? splitPayments : undefined,
            date: new Date()
          });
        }
      });

      setItems([]);
      setClientCode('');
      setDiscount('');
      setPickupName('');
      setPickupNameError(false);
      setPickupPhone('');
      setActivePendingSaleId(null);
      setPaymentMethod('cash');
      setSplitPayments([]);
      if (searchInputRef.current) searchInputRef.current.focus();
    } catch (err) {
      console.error(err);
      alert('Erro ao salvar retirada pendente.');
    }
  };

  const loadPendingSale = (sale: any) => {
    setActivePendingSaleId(sale.id!);
    setPickupName(sale.clientName || '');
    setPickupPhone(sale.clientPhone || '');
    setItems(sale.items);
    setClientCode(sale.receiptName || '');
    setDiscount(sale.discount ? sale.discount.toFixed(2).replace('.', ',') : '');
    setPaymentMethod(sale.paymentMethod || 'cash');
    setCashReceived('');
    setCustomUnitPrice('');
    setSplitPayments(sale.splitPayments || []);
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
    setClientCode(sale.receiptName || '');
    setPickupName(sale.clientName || '');
    setPickupPhone(sale.clientPhone || '');
    setDiscount(sale.discount ? sale.discount.toFixed(2).replace('.', ',') : '');
    setPaymentMethod(sale.paymentMethod || 'cash');
    setSplitPayments(sale.splitPayments || []);
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
      // Save the exact identity printed now so historical reprints never depend on changed form state.
      const printedClientName = printedCustomerName(clientCode, pickupName);
      await db.transaction('rw', db.transactions, db.products, db.pendingSales, async () => {
        // Decrement stock for products (Only for keys, springs and screws)
        if (!activePendingSaleId) {
          for (const item of items) {
            if (item.productId) {
              const product = await db.products.get(item.productId);
              if (product && product.hasStock) {
                await db.products.update(product.id!, { stock: product.stock - item.quantity });
              }
            }
          }
        } else {
          // Adjust stock for any difference between original pending sale items and final checkout items
          const oldSale = await db.pendingSales.get(activePendingSaleId);
          if (oldSale) {
            const oldQtyMap: Record<number, number> = {};
            for (const item of oldSale.items) {
              if (item.productId) oldQtyMap[item.productId] = (oldQtyMap[item.productId] || 0) + item.quantity;
            }
            const newQtyMap: Record<number, number> = {};
            for (const item of items) {
              if (item.productId) newQtyMap[item.productId] = (newQtyMap[item.productId] || 0) + item.quantity;
            }
            const allProdIds = new Set([...Object.keys(oldQtyMap), ...Object.keys(newQtyMap)].map(Number));
            for (const pId of allProdIds) {
              const oldQ = oldQtyMap[pId] || 0;
              const newQ = newQtyMap[pId] || 0;
              const diff = newQ - oldQ;
              if (diff !== 0) {
                const product = await db.products.get(pId);
                if (product && product.hasStock) {
                  await db.products.update(pId, { stock: product.stock - diff });
                }
              }
            }
          }
        }

        const machinePayments = paymentMethod === 'split'
          ? splitPayments.filter(part => part.method !== 'cash').map(part => {
            const machine = activeMachines.find(row => row.id === part.machineId);
            const grossCents = Math.round(part.amount * 100);
            const rate = paymentRate(part.method, part.machineId, part.installments || 1);
            const fee = rate ? feeCents(grossCents, rate) : 0;
            return { method: part.method, installments: part.installments, machineId: machine?.id, machineName: machine?.name || (part.method === 'pix' ? 'PIX direto em conta' : undefined), ownerProfile: machine?.ownerProfile, ratePercent: rate?.percent, grossCents, feeCents: fee, netCents: grossCents - fee };
          })
          : (() => { const machine = activeMachines.find(row => row.id === effectiveMachineId); const grossCents = Math.round(totalAmount * 100); const rate = paymentRate(paymentMethod, effectiveMachineId, creditInstallments); const fee = rate ? feeCents(grossCents, rate) : 0; return machine || paymentMethod === 'pix' ? [{ method: paymentMethod, installments: paymentMethod === 'credit' ? creditInstallments : undefined, machineId: machine?.id, machineName: machine?.name || (paymentMethod === 'pix' ? 'PIX direto em conta' : undefined), ownerProfile: machine?.ownerProfile, ratePercent: rate?.percent, grossCents, feeCents: fee, netCents: grossCents - fee }] : []; })();
        const calculatedFeeCents = machinePayments.reduce((sum, part) => sum + (part.feeCents || 0), 0);

        await db.transactions.add({
          profile: transactionProfile,
          type: 'sale',
          items,
          total: totalAmount,
          discount: discountValue > 0 ? discountValue : undefined,
          machineFee: calculatedFeeCents > 0 ? calculatedFeeCents / 100 : undefined,
          machineFeeCents: calculatedFeeCents || undefined,
          machinePayments: machinePayments.length ? machinePayments : undefined,
          machineId: paymentMethod !== 'split' ? effectiveMachineId : undefined,
          machineOwnerProfile: paymentMethod !== 'split' ? activeMachines.find(machine => machine.id === effectiveMachineId)?.ownerProfile : undefined,
          machineFeeRate: paymentMethod !== 'split' ? paymentRate(paymentMethod, effectiveMachineId, creditInstallments)?.percent : undefined,
          machineNetCents: machinePayments.length ? machinePayments.reduce((sum, part) => sum + (part.netCents || 0), 0) : undefined,
          paymentMethod,
          splitPayments: paymentMethod === 'split' ? splitPayments : undefined,
          clientName: printedClientName || undefined,
          clientCode: clientCode ? clientCode.trim() : undefined,
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

        const html = `
          <html>
          <head>
            <title>Cupom</title>
            <style>
              @page { margin: 5mm 2mm; }
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
            <div class="text-center header-title">Chaveiro & Cutelaria<br>do Lidio e Fabiano</div>
              <div class="text-center bold" style="font-size: 12px; margin-top: 5px;">Rua Cardoso de Morais, Frente ao 202</div>
              <div class="text-center bold" style="font-size: 12px;">Bonsucesso - RJ (Frente ao Caçula)</div>
              <div class="text-center bold" style="font-size: 13px; margin-top: 2px; margin-bottom: 5px;">Tel: (21) 96738-5841 (WhatsApp)</div>
              <div class="text-center" style="font-size: 11px;">Data: ${dateStr}</div>
              ${printedClientName ? `<div class="divider"></div><div class="bold">Cliente: ${printedClientName}</div>` : ''}
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
                  ${items.map(i => {
                    const orig = i.originalPrice !== undefined ? i.originalPrice : i.price;
                    const itemOriginalTotal = orig * i.quantity;
                    return `
                      <tr>
                        <td class="text-left" valign="top">${i.quantity}x</td>
                        <td class="text-left" valign="top">
                          <strong>${i.name}</strong><br>
                          ${(i.originalPrice !== undefined && i.originalPrice > i.price) ? `
                            <div style="font-size: 12px; color: #000;">
                              De: <span style="text-decoration: line-through;">R$ ${i.originalPrice.toFixed(2).replace('.', ',')}</span> 
                              Por: R$ ${i.price.toFixed(2).replace('.', ',')} (Desc: R$ ${(i.originalPrice - i.price).toFixed(2).replace('.', ',')}/un)
                            </div>
                          ` : `
                            <div style="font-size: 12px; color: #000;">Vlr. Unit: R$ ${i.price.toFixed(2).replace('.', ',')}</div>
                          `}
                        </td>
                        <td class="text-right" valign="top">R$ ${itemOriginalTotal.toFixed(2).replace('.', ',')}</td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
              <div class="divider"></div>
              <table>
                <tr><td class="bold">Subtotal Bruto:</td><td class="text-right">R$ ${originalSubtotal.toFixed(2).replace('.', ',')}</td></tr>
                ${quantityDiscount > 0 ? `<tr><td class="bold">Desc. Quantidade:</td><td class="text-right">-R$ ${quantityDiscount.toFixed(2).replace('.', ',')}</td></tr>` : ''}
                ${discountValue > 0 ? `<tr><td class="bold">Desconto Extra:</td><td class="text-right">-R$ ${discountValue.toFixed(2).replace('.', ',')}</td></tr>` : ''}
                <tr><td class="bold header-title">TOTAL A PAGAR:</td><td class="text-right header-title">R$ ${totalAmount.toFixed(2).replace('.', ',')}</td></tr>
                ${paymentMethod === 'cash' ? `
                  <tr><td>Recebido:</td><td class="text-right">R$ ${(parseCurrency(cashReceived) || totalAmount).toFixed(2).replace('.', ',')}</td></tr>
                  <tr><td class="bold">Troco:</td><td class="text-right bold">R$ ${changeValue.toFixed(2).replace('.', ',')}</td></tr>
                ` : paymentMethod === 'split' ? `
                  <tr><td colspan="2" class="bold text-center" style="padding-top: 5px;">PAGAMENTO MÚLTIPLO</td></tr>
                  ${splitPayments.map(p => `<tr><td>Parcial (${p.method === 'cash' ? 'Dinheiro' : p.method === 'credit' ? 'Crédito' : p.method === 'debit' ? 'Débito' : 'PIX'}):</td><td class="text-right">R$ ${p.amount.toFixed(2).replace('.', ',')}</td></tr>`).join('')}
                ` : `<tr><td class="bold">Forma de Pagto:</td><td class="text-right bold uppercase">${paymentMethod === 'cash' ? 'Dinheiro' : paymentMethod === 'credit' ? 'Crédito' : paymentMethod === 'debit' ? 'Débito' : 'PIX'}</td></tr>`}
                </table>
                <div class="divider"></div>
                <div class="text-center" style="margin-bottom: 10px; font-weight: bold; font-size: 13px;">Obrigado pela preferência!</div>
                <div class="text-center" style="font-size: 11px; font-weight: bold; margin-bottom: 3px;">Insta - @chaveiroecutelaria.lidio.rj</div>
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
          if (twoCopies) {
            setTimeout(() => {
              iframe.contentWindow!.print();
              setTimeout(() => document.body.removeChild(iframe), 2000);
            }, 1500);
          } else {
            setTimeout(() => document.body.removeChild(iframe), 2000);
          }
        }, 500);
      }

      setItems([]);
      setClientCode('');
      setDiscount('');
      setCashReceived('');
      setCustomUnitPrice('');
      setSplitPayments([]);
      setPickupName('');
      setPickupPhone('');
      setPickupNameError(false);
      setActivePendingSaleId(null);
      setPrintTwoCopies(false);
      if (searchInputRef.current) searchInputRef.current.focus();
    } catch (error) {
      console.error(error);
      alert('Erro ao finalizar venda.');
    }
  };

  const printCloseReport = (session: any, totals: any, closeCash: number, leftInDrawer: number, wages: { name: string, amount: number, method: 'cash' | 'pix' | 'split', cashAmount: number, pixAmount: number }[] = [], cashReserves = 0) => {
    const openedStr = new Date(session.openedAt).toLocaleString('pt-BR');
    const closedStr = new Date().toLocaleString('pt-BR');
    
    let pendingCashWages = 0;
    let pendingPixWages = 0;
    wages.forEach(w => {
      pendingCashWages += w.cashAmount;
      pendingPixWages += w.pixAmount;
    });

    const expectedGrossCash = session.initialCash + totals.cash - (totals.expenses || 0);
    const difference = closeCash - expectedGrossCash;
    
    const availableCashAfterWages = closeCash - pendingCashWages;
    const withdrawal = availableCashAfterWages - leftInDrawer - cashReserves;

    const resultadoTurno = totals.totalSales - (totals.expenses || 0) - pendingCashWages - pendingPixWages;

    const html = `
      <html>
      <head>
        <title>Fechamento de Caixa</title>
        <style>
          @page { margin: 5mm 2mm; }
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
        <div class="text-center header-title">Chaveiro & Cutelaria<br>do Lidio e Fabiano</div>
        <div class="text-center bold" style="font-size: 14px; margin-top: 5px; text-transform: uppercase;">Fechamento de Caixa</div>
        <div class="divider"></div>
        <div><span class="bold">Operador:</span> <span style="text-transform: uppercase;">${session.profile}</span></div>
        <div><span class="bold">Abertura:</span> ${openedStr}</div>
        <div><span class="bold">Fechamento:</span> ${closedStr}</div>
        <div class="divider"></div>

        <div class="bold text-center" style="margin-bottom: 5px;">RESUMO DAS VENDAS</div>
        <table>
          <tr><td>Dinheiro:</td><td class="text-right">R$ ${totals.cash.toFixed(2).replace('.', ',')}</td></tr>
          <tr><td>PIX:</td><td class="text-right">R$ ${totals.pix.toFixed(2).replace('.', ',')}</td></tr>
          <tr><td>Débito:</td><td class="text-right">R$ ${totals.debit.toFixed(2).replace('.', ',')}</td></tr>
          <tr><td>Crédito:</td><td class="text-right">R$ ${totals.credit.toFixed(2).replace('.', ',')}</td></tr>
          <tr><td class="bold">Subtotal PIX + Cartões:</td><td class="text-right bold">R$ ${(totals.pix + totals.debit + totals.credit).toFixed(2).replace('.', ',')}</td></tr>
          <tr style="border-top: 1px dashed #000;"><td class="bold">TOTAL VENDIDO:</td><td class="text-right bold">R$ ${totals.totalSales.toFixed(2).replace('.', ',')}</td></tr>
        </table>
        <div class="divider"></div>

        <div class="bold text-center" style="margin-bottom: 5px;">CONFERÊNCIA DA GAVETA</div>
        <table>
          <tr><td>Fundo de Abertura:</td><td class="text-right">R$ ${session.initialCash.toFixed(2).replace('.', ',')}</td></tr>
          <tr><td>(+) Vendas Dinheiro:</td><td class="text-right">R$ ${totals.cash.toFixed(2).replace('.', ',')}</td></tr>
          ${(totals.expenses || 0) > 0 ? `<tr><td>(-) Despesas Dinheiro:</td><td class="text-right">R$ ${totals.expenses.toFixed(2).replace('.', ',')}</td></tr>` : ''}
          <tr style="border-top: 1px dashed #000;"><td class="bold">ESPERADO P/ CONFERÊNCIA:</td><td class="text-right bold">R$ ${expectedGrossCash.toFixed(2).replace('.', ',')}</td></tr>
          <tr><td class="bold">DINHEIRO CONTADO:</td><td class="text-right bold">R$ ${closeCash.toFixed(2).replace('.', ',')}</td></tr>
          <tr style="color: ${difference >= 0 ? 'green' : 'red'};"><td class="bold">DIFERENÇA DO CAIXA:</td><td class="text-right bold">R$ ${difference.toFixed(2).replace('.', ',')} (${difference >= 0 ? 'Sobrando' : 'Faltando'})</td></tr>
        </table>
        <div class="divider"></div>

        ${wages.length > 0 ? `
        <div class="bold text-center" style="margin-bottom: 5px;">PAGAMENTO DAS DIÁRIAS</div>
        <table>
          ${wages.map(w => `
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
          <tr><td>Fundo para o próximo dia:</td><td class="text-right">R$ ${leftInDrawer.toFixed(2).replace('.', ',')}</td></tr>
          <tr><td class="bold">Sangria / Retirada:</td><td class="text-right bold">R$ ${withdrawal.toFixed(2).replace('.', ',')}</td></tr>
        </table>
        <div class="divider"></div>

        <table>
          <tr><td style="font-size: 11px;">Maquininha Líquido (PIX+Cartões):</td><td class="text-right">R$ ${(totals.pix + totals.debit + totals.credit - pendingPixWages).toFixed(2).replace('.', ',')}</td></tr>
          <tr><td style="font-size: 11px;">Dinheiro Líquido:</td><td class="text-right">R$ ${(totals.cash - (totals.expenses || 0) - pendingCashWages).toFixed(2).replace('.', ',')}</td></tr>
          <tr style="border-top: 1px dashed #000;"><td class="bold" style="font-size: 14px;">TOTAL DO DIA:</td><td class="text-right bold" style="font-size: 14px;">R$ ${resultadoTurno.toFixed(2).replace('.', ',')}</td></tr>
        </table>
        <div class="divider" style="margin-bottom: 20px;"></div>
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

  const handleCloseRegister = async (shouldPrint: boolean = false) => {
    if (!activeSession || closeInProgress.current) return;
    closeInProgress.current = true;
    const closeCashVal = parseCurrency(closeRegisterCash);
    const leftInDrawerVal = parseCurrency(closeLeftInDrawer);
    
    let pendingCashWages = 0;
    const wageDetails: { name: string, amount: number, method: 'cash' | 'pix' | 'split', cashAmount: number, pixAmount: number }[] = [];
    
    try {
      if (!Number.isFinite(closeCashVal) || !Number.isFinite(leftInDrawerVal) || closeCashVal < 0 || leftInDrawerVal < 0) throw new Error('Informe valores válidos para o fechamento.');
      if (selectedCloseReservations.some(line => !Number.isSafeInteger(line.amountCents) || line.amountCents <= 0)) throw new Error('Informe um valor válido para cada reserva selecionada.');
      if (restockSelected && (!Number.isSafeInteger(restockCents) || restockCents <= 0)) throw new Error('Informe um valor válido para a reserva de reposição.');
      await db.transaction('rw', [db.transactions, db.cashSessions, db.managementAccounts, db.managementOccurrences, db.managementEntries, db.managementFunds, db.managementAudit], async () => {
      const currentSession = await db.cashSessions.get(activeSession.id!);
      if (currentSession?.status !== 'open') throw new Error('Este caixa já foi fechado.');
      if (activeSession.profile === 'chaveiro' && selectedEmployeesToPay.length > 0 && employees) {
        const empsToPay = employees.filter(e => selectedEmployeesToPay.includes(e.id!));
        for (const emp of empsToPay) {
          const wageStr = customWages[emp.id!] !== undefined ? customWages[emp.id!] : emp.dailyWage.toFixed(2).replace('.', ',');
          const totalWageVal = parseCurrency(wageStr);
          if (!Number.isFinite(totalWageVal) || totalWageVal < 0) throw new Error(`Diária inválida para ${emp.name}.`);
          const method = employeePaymentMethods[emp.id!] || 'cash';
          
          let cashWage = 0;
          let pixWage = 0;

          if (method === 'cash') {
            cashWage = totalWageVal;
          } else if (method === 'pix') {
            pixWage = totalWageVal;
          } else if (method === 'split') {
            const cashStr = employeeSplitCash[emp.id!] !== undefined ? employeeSplitCash[emp.id!] : (totalWageVal / 2).toFixed(2).replace('.', ',');
            cashWage = parseCurrency(cashStr);
            if (cashWage > totalWageVal) cashWage = totalWageVal;
            pixWage = totalWageVal - cashWage;
          }

          pendingCashWages += cashWage;

          wageDetails.push({ name: emp.name, amount: totalWageVal, method, cashAmount: cashWage, pixAmount: pixWage });

          if (cashWage > 0) {
            await db.transactions.add({
              profile: activeSession.profile,
              type: 'expense',
              items: [{
                service: 'other',
                name: `Diária (Dinheiro): ${emp.name}`,
                quantity: 1,
                price: cashWage,
                cost: 0,
                total: cashWage
              }],
              total: cashWage,
              paymentMethod: 'cash',
              date: new Date()
            });
          }

          if (pixWage > 0) {
            await db.transactions.add({
              profile: activeSession.profile,
              type: 'expense',
              items: [{
                service: 'other',
                name: `Diária (PIX): ${emp.name}`,
                quantity: 1,
                price: pixWage,
                cost: 0,
                total: pixWage
              }],
              total: pixWage,
              paymentMethod: 'pix',
              date: new Date()
            });
          }
        }
      }

      // Expected gross cash BEFORE taking cash wages out
      const expectedGrossCash = activeSession.initialCash + sessionTotals.cash - sessionTotals.expenses;
      if (Math.round((pendingCashWages + closeCashReserves + leftInDrawerVal) * 100) > Math.round(closeCashVal * 100)) throw new Error('Diárias, reservas em dinheiro e fundo do próximo dia ultrapassam o dinheiro contado.');
      
      // The user typed the GROSS physical cash they counted in the drawer (before taking wages out)
      const diffVal = closeCashVal - expectedGrossCash;

      for (const line of selectedCloseReservations) {
        if (line.kind === 'account') {
          await reserveForOccurrence(line.id, line.amountCents, line.choice!.source, { cashSessionId: activeSession.id, key: `close:${activeSession.id}:${line.key}` });
        } else {
          await moveFund(line.id, line.amountCents, 'deposit', line.choice!.source, 'Reserva no fechamento do caixa', undefined, { cashSessionId: activeSession.id, key: `close:${activeSession.id}:${line.key}` });
        }
      }
      if (restockSelected && restockCents > 0) {
        if (!restockFundId || !activeRestockFunds.some(fund => fund.id === restockFundId)) throw new Error('Escolha um fundo de reposição ativo deste perfil.');
        await moveFund(restockFundId, restockCents, 'deposit', restockSource, 'Reserva de reposição no fechamento do caixa', undefined, { cashSessionId: activeSession.id, key: `close:${activeSession.id}:reposição` });
      }

      await db.cashSessions.update(activeSession.id!, {
        closedAt: new Date(),
        expectedCash: expectedGrossCash,
        actualCash: closeCashVal,
        leftInDrawer: leftInDrawerVal,
        difference: diffVal,
        status: 'closed',
        cashSales: sessionTotals.cash,
        pixSales: sessionTotals.pix,
        debitSales: sessionTotals.debit,
        creditSales: sessionTotals.credit
      });
      });

      if (shouldPrint) printCloseReport(activeSession, sessionTotals, closeCashVal, leftInDrawerVal, wageDetails, closeCashReserves);

      localStorage.setItem(`ichaveiro_last_drawer_left_${transactionProfile}`, closeLeftInDrawer);
      setOpenRegisterCash(closeLeftInDrawer);
      setShowCloseRegisterModal(false);
      setCloseRegisterCash('');
      setSelectedEmployeesToPay([]);
      setCustomWages({});
      setEmployeePaymentMethods({});
      setEmployeeSplitCash({});
      setCloseReservations({});
      setRestockSelected(false);
      setRestockAmount('');
      setRestockFundId(null);
      setRestockFundName('');
      setCreatingRestockFund(false);
      
      runAutoBackup();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Erro ao fechar caixa.');
    } finally {
      closeInProgress.current = false;
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
    <div className="pos-root flex flex-col h-full overflow-hidden animate-fade-in font-sans">
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
      <div className="pos-register-header bg-[var(--bg-surface)] border-b-2 border-red-600 rounded p-4 mb-4 flex justify-between items-center shadow">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <span className="text-red-500">Caixa</span> Aberto
          </h1>
          <span className="text-sm font-bold text-muted uppercase">
            Operador: <strong className="text-yellow-500">{transactionProfile === 'chaveiro' ? 'Chaveiro' : 'Fabiano'}</strong> | Fundo Inicial: <strong className="text-green-400">R$ {activeSession.initialCash.toFixed(2).replace('.', ',')}</strong>
          </span>
        </div>
        <div className="pos-register-actions" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
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
            <Banknote size={15} /> Ver caixa
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
            <CircleDollarSign size={15} /> Registrar despesa
          </button>
          <button
            onClick={() => setShowStorageBoxModal(true)}
            title="Arquivo de pedidos pendentes"
            aria-label="Arquivo de pedidos pendentes"
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
            <TriangleAlert size={15} /> Registrar perda
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
            <Power size={15} /> Fechar caixa
          </button>
        </div>
      </div>

      <div className="flex gap-6 flex-1 min-h-0 overflow-hidden pb-4">
        {/* Left column: Inputs and Info */}
        <div className="w-[500px] flex flex-col gap-4 border-r-4 border-red-600 pr-6 overflow-y-auto custom-scrollbar">
          <form onSubmit={handleFastAdd} className="flex flex-col gap-2 mb-2" style={{ position: 'relative', zIndex: searchFocused && filteredProducts.length ? 50 : 'auto' }} onKeyDown={event => {
            if (event.key === 'ArrowDown' && filteredProducts.length) { event.preventDefault(); setSearchSelectedIndex(index => (index + 1) % filteredProducts.length); }
            if (event.key === 'ArrowUp' && filteredProducts.length) { event.preventDefault(); setSearchSelectedIndex(index => (index + filteredProducts.length - 1) % filteredProducts.length); }
            if (event.key === 'Escape') { setSearchFocused(false); setSearchProduct(''); }
          }}>
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
                  onChange={e => { setSearchProduct(e.target.value); setSearchSelectedIndex(0); }}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
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
            {searchFocused && searchProduct.trim() && filteredProducts.length > 0 && createPortal(<div role="listbox" aria-label={`Resultados encontrados: ${filteredProducts.length}`} style={{ ...searchOverlayStyle, overflowY: "auto", background: "#0f172a", color: "#f8fafc", border: "1px solid #475569", borderRadius: "8px", boxShadow: "0 14px 30px rgba(0,0,0,.55)" }}>
              <div style={{ padding: "8px 11px", position: "sticky", top: 0, background: "#1e293b", color: "#cbd5e1", fontWeight: 700, fontSize: "12px", zIndex: 1 }}>{filteredProducts.length} sugestão(ões) · use ↑ ↓ e Enter</div>
              {filteredProducts.map((product, index) => <button type="button" role="option" aria-selected={index === searchSelectedIndex} key={product.id} onMouseEnter={() => setSearchSelectedIndex(index)} onMouseDown={event => event.preventDefault()} onClick={() => { addProductToCart(product, currentQty); setSearchFocused(false); }} style={{ display: "grid", gridTemplateColumns: "60px 1fr auto", alignItems: "center", gap: "8px", width: "100%", border: 0, borderBottom: "1px solid #334155", textAlign: "left", padding: "10px 11px", background: index === searchSelectedIndex ? "#1d4ed8" : "#0f172a", color: "#f8fafc", cursor: "pointer" }}><strong>{product.code || "—"}</strong><span>{product.name}{product.brand ? ` · ${product.brand}` : ""}</span><strong>{money(Math.round(product.price * 100))}</strong></button>)}
            </div>, document.body)}
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

              {paymentMethod !== 'cash' && paymentMethod !== 'split' && <div className="mt-2 rounded border border-slate-600 p-2">
                <label className="text-xs font-bold text-muted uppercase">Maquininha / Taxa</label>
                <select className="w-full p-2 text-white rounded border border-slate-600 bg-slate-900" value={selectedMachineId === undefined ? (defaultMachineId || '') : (selectedMachineId || '')} onChange={event=>setSelectedMachineId(event.target.value ? Number(event.target.value) : null)}>
                  {paymentMethod==='pix'&&<option value="">PIX direto em conta (sem tarifa de maquininha)</option>}
                  {activeMachines.map(machine=><option key={machine.id} value={machine.id}>{machine.name} · {machine.ownerProfile==='chaveiro'?'Chaveiro':'Fabiano'}</option>)}
                </select>
                {paymentMethod === 'credit' && <label className="mt-2 block text-xs font-bold text-muted uppercase">Parcelas<select className="w-full p-2 text-white rounded border border-slate-600 bg-slate-900" value={creditInstallments} onChange={event=>setCreditInstallments(Number(event.target.value))}>{Array.from({length:12},(_,index)=>index+1).map(count=><option key={count} value={count}>{count === 1 ? 'À vista' : `${count}x`}</option>)}</select></label>}
                {paymentRate(paymentMethod) ? <small className="block text-teal-300">{activeMachine?.name}: {paymentRate(paymentMethod)?.percent?.toFixed(2)}% · tarifa prevista {money(paymentFeeCents(paymentMethod,Math.round(totalAmount*100)))} · líquido previsto {money(Math.round(totalAmount*100)-paymentFeeCents(paymentMethod,Math.round(totalAmount*100)))}</small> : paymentMethod==='pix'&&!effectiveMachineId ? <small className="block text-teal-300">PIX direto em conta · sem tarifa de maquininha</small> : <small className="block text-amber-300">Tarifa desta modalidade precisa ser cadastrada.</small>}
              </div>}
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
              <label className="text-sm mb-1 block font-bold text-muted uppercase">Nome/Empresa impresso no cupom (opcional)</label>
              <input
                type="text"
                className="w-full p-2 text-white text-lg font-bold rounded border border-[var(--border)] bg-black/30 outline-none focus:border-primary"
                placeholder=""
                value={clientCode}
                onChange={e => setClientCode(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-2 mt-2">
              <label className={`text-sm font-bold uppercase ${pickupNameError ? 'text-red-400' : 'text-muted'}`}>Cliente para retirada<input ref={pickupNameRef} aria-label="Cliente para retirada" aria-invalid={pickupNameError} value={pickupName} onChange={e => { setPickupName(e.target.value); if(e.target.value.trim()) setPickupNameError(false); }} className={`w-full mt-1 p-2 text-white normal-case rounded border ${pickupNameError ? 'border-red-500 ring-1 ring-red-500' : 'border-[var(--border)]'} bg-black/30`} placeholder={pickupNameError ? 'Informe o nome para retirada' : 'Nome para retirada'} /></label>
              <label className="text-sm font-bold text-muted uppercase">Telefone (opcional)<input aria-label="Telefone para retirada" value={pickupPhone} onChange={e => setPickupPhone(e.target.value)} className="w-full mt-1 p-2 text-white normal-case rounded border border-[var(--border)] bg-black/30" placeholder="(00) 00000-0000" /></label>
            </div>

            <button
              className="w-full py-3 text-xl font-extrabold rounded shadow transition-colors mt-4 flex justify-center items-center gap-3 uppercase hover:opacity-90 pos-checkout-btn"
              style={{ backgroundColor: '#16a34a', color: '#ffffff', border: 'none' }}
              onClick={handleCheckout}
            >
              <CheckCircle size={32} /> FINALIZAR VENDA
            </button>

            <div className="grid grid-cols-2 gap-3 mt-3">
              {activePendingSaleId ? (
                <button
                  className="py-2.5 text-sm font-extrabold rounded shadow transition-all uppercase flex justify-center items-center gap-1.5 hover:opacity-90 cursor-pointer"
                  style={{ backgroundColor: '#eab308', color: '#000000', border: 'none' }}
                  onClick={savePendingSale}
                >
                  💾 Salvar Pendência
                </button>
              ) : (
                <button
                  className="py-2 text-sm font-extrabold rounded shadow transition-colors uppercase flex justify-center items-center hover:opacity-90"
                  style={{ backgroundColor: '#eab308', color: '#000000', border: 'none' }}
                  onClick={handlePendingClick}
                >
                  Deixar Pendente
                </button>
              )}
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
                      <td className="py-4 px-3 font-black uppercase text-gray-900" style={{ fontSize: '22px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span>{item.name}</span>
                          <button type="button" title={item.financialProfile ? `Remover destino individual (${profileLabel(item.financialProfile)})` : `Destinar individualmente ao ${profileLabel(transactionProfile === 'chaveiro' ? 'fabiano' : 'chaveiro')}`} aria-label={`Alternar perfil financeiro de ${item.name}`} onClick={() => toggleItemProfile(index)} style={{ display: 'inline-flex', alignItems: 'center', padding: '3px', borderRadius: '5px', color: '#1d4ed8', background: '#eff6ff', border: 0, cursor: 'pointer' }}><ArrowLeftRight size={15} /></button>
                          {itemFinancialProfile(item, transactionProfile) !== transactionProfile && <span style={{ fontSize: '12px', color: '#1d4ed8', fontWeight: 700 }}>{profileLabel(itemFinancialProfile(item, transactionProfile))}</span>}
                        </div>
                      </td>
                      <td className="py-4 px-3 text-center font-black text-blue-800" style={{ fontSize: '22px' }}><input aria-label={`Quantidade de ${item.name}`} type="number" min="1" step="1" value={item.quantity} onChange={e => updateItem(index, 'quantity', Math.max(1, Math.trunc(Number(e.target.value) || 1)))} style={{ width: '64px', textAlign: 'center', border: '1px solid #cbd5e1', borderRadius: '5px', color: '#1e3a8a', background: '#ffffff', fontSize: '20px', fontWeight: 800 }} /></td>
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

          {hasOtherFinancialProfile && (
            <div style={{ background: '#1e293b', border: '1px solid #475569', borderRadius: '8px', padding: '8px 12px', color: '#e2e8f0', fontSize: '0.8rem' }}>
              <strong>Distribuição financeira interna:</strong>{' '}
              {financialShares.map(share => `${profileLabel(share.profile)} R$ ${share.total.toFixed(2).replace('.', ',')}`).join(' · ')}
            </div>
          )}

          {/* Pending Sales List */}
          {recentPendingSales.length > 0 && (
            <div style={{ marginTop: '16px', backgroundColor: '#1e293b', borderRadius: '12px', padding: '16px', border: '2px solid #eab308', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <h3 style={{ color: '#eab308', fontSize: '1rem', fontWeight: 900, textTransform: 'uppercase', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                ⏳ Pendentes para Retirada ({recentPendingSales.length})
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', paddingRight: '4px' }}>
                {recentPendingSales.map(sale => (
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
              maxHeight: '95vh',
              overflowY: 'auto',
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
              const { pendingCashWages, pendingPixWages, totalPendingWages } = (() => {
                if (activeSession.profile !== 'chaveiro' || !employees || selectedEmployeesToPay.length === 0) {
                  return { pendingCashWages: 0, pendingPixWages: 0, totalPendingWages: 0 };
                }
                let cWages = 0;
                let pWages = 0;
                const empsToPay = employees.filter(e => selectedEmployeesToPay.includes(e.id!));
                for (const emp of empsToPay) {
                  const wageStr = customWages[emp.id!] !== undefined ? customWages[emp.id!] : emp.dailyWage.toFixed(2).replace('.', ',');
                  const totalWageVal = parseCurrency(wageStr);
                  const method = employeePaymentMethods[emp.id!] || 'cash';
                  if (method === 'cash') {
                    cWages += totalWageVal;
                  } else if (method === 'pix') {
                    pWages += totalWageVal;
                  } else if (method === 'split') {
                    const cashStr = employeeSplitCash[emp.id!] !== undefined ? employeeSplitCash[emp.id!] : (totalWageVal / 2).toFixed(2).replace('.', ',');
                    let cVal = parseCurrency(cashStr);
                    if (cVal > totalWageVal) cVal = totalWageVal;
                    cWages += cVal;
                    pWages += (totalWageVal - cVal);
                  }
                }
                return { pendingCashWages: cWages, pendingPixWages: pWages, totalPendingWages: cWages + pWages };
              })();

              const expectedGrossCash = activeSession.initialCash + sessionTotals.cash - sessionTotals.expenses;
              
              const closeCash = parseCurrency(closeRegisterCash);
              const leftInDrawer = parseCurrency(closeLeftInDrawer);
              const diff = closeCash - expectedGrossCash;
              const withdrawal = (closeCash - pendingCashWages) - leftInDrawer - closeCashReserves;

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  
                  {/* 1. Entradas e Saídas */}
                  <div style={{ backgroundColor: 'rgba(0,0,0,0.3)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.9rem' }}>
                    
                    <div style={{ color: '#38bdf8', fontWeight: 'bold', marginBottom: '4px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '4px' }}>RESUMO DAS VENDAS</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#94a3b8' }}>Dinheiro:</span>
                      <span style={{ fontWeight: 'bold' }}>R$ {sessionTotals.cash.toFixed(2).replace('.', ',')}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#94a3b8' }}>PIX:</span>
                      <span style={{ fontWeight: 'bold' }}>R$ {sessionTotals.pix.toFixed(2).replace('.', ',')}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#94a3b8' }}>Débito:</span>
                      <span style={{ fontWeight: 'bold' }}>R$ {sessionTotals.debit.toFixed(2).replace('.', ',')}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#94a3b8' }}>Crédito:</span>
                      <span style={{ fontWeight: 'bold' }}>R$ {sessionTotals.credit.toFixed(2).replace('.', ',')}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed rgba(255,255,255,0.1)', marginTop: '4px', paddingTop: '4px' }}>
                      <span style={{ color: '#ffffff', fontWeight: 'bold' }}>Subtotal PIX + Cartões:</span>
                      <span style={{ fontWeight: 'bold' }}>R$ {(sessionTotals.pix + sessionTotals.debit + sessionTotals.credit).toFixed(2).replace('.', ',')}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.1)', marginTop: '4px', paddingTop: '4px', fontSize: '1rem' }}>
                      <span style={{ color: '#ffffff', fontWeight: 'bold' }}>TOTAL VENDIDO:</span>
                      <strong style={{ color: '#4ade80' }}>R$ {sessionTotals.totalSales.toFixed(2).replace('.', ',')}</strong>
                    </div>

                    <div style={{ color: '#f87171', fontWeight: 'bold', margin: '8px 0 4px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '4px' }}>CONFERÊNCIA DA GAVETA</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#94a3b8' }}>Fundo de Abertura:</span>
                      <span style={{ fontWeight: 'bold' }}>R$ {activeSession.initialCash.toFixed(2).replace('.', ',')}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#94a3b8' }}>(+) Vendas em Dinheiro:</span>
                      <span style={{ fontWeight: 'bold', color: '#4ade80' }}>R$ {sessionTotals.cash.toFixed(2).replace('.', ',')}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#f87171' }}>(-) Despesas em Dinheiro:</span>
                      <span style={{ fontWeight: 'bold', color: '#f87171' }}>R$ {sessionTotals.expenses.toFixed(2).replace('.', ',')}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed rgba(255,255,255,0.1)', marginTop: '8px', paddingTop: '8px', fontSize: '1rem' }}>
                      <span style={{ color: '#ffffff', fontWeight: 'bold' }}>ESPERADO PARA CONFERÊNCIA:</span>
                      <strong style={{ color: '#eab308' }}>R$ {expectedGrossCash.toFixed(2).replace('.', ',')}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginTop: '12px', color: '#cbd5e1' }}>
                      <span>PIX + Cartões Líquido (Pós-Diárias):</span>
                      <span>R$ {(sessionTotals.pix + sessionTotals.credit + sessionTotals.debit - pendingPixWages).toFixed(2).replace('.', ',')}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', marginTop: '4px', color: '#cbd5e1' }}>
                      <span>Dinheiro Líquido (Pós-Despesas/Diárias):</span>
                      <span>R$ {(sessionTotals.cash - sessionTotals.expenses - pendingCashWages).toFixed(2).replace('.', ',')}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1rem', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                      <span style={{ color: '#ffffff', fontWeight: 'bold' }}>TOTAL DO DIA:</span>
                      <strong style={{ color: '#4ade80' }}>R$ {(sessionTotals.totalSales - sessionTotals.expenses - totalPendingWages).toFixed(2).replace('.', ',')}</strong>
                    </div>
                  </div>

                  {/* 2. Diárias */}
                  {employees && employees.filter(e => e.active).length > 0 && activeSession.profile === 'chaveiro' && (
                    <div style={{ backgroundColor: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '6px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <span style={{ color: '#94a3b8', fontWeight: 'bold', fontSize: '0.85rem' }}>PAGAMENTO DE DIÁRIAS (ESCOLHA O MÉTODO):</span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {employees.filter(e => e.active).map(emp => {
                          const isChecked = selectedEmployeesToPay.includes(emp.id!);
                          const currentWage = customWages[emp.id!] !== undefined ? customWages[emp.id!] : emp.dailyWage.toFixed(2).replace('.', ',');
                          const totalWageVal = parseCurrency(currentWage);
                          const currentMethod = employeePaymentMethods[emp.id!] || 'cash';
                          const cashSplitStr = employeeSplitCash[emp.id!] !== undefined ? employeeSplitCash[emp.id!] : (totalWageVal / 2).toFixed(2).replace('.', ',');
                          const cashSplitVal = parseCurrency(cashSplitStr);
                          const pixSplitVal = Math.max(0, totalWageVal - cashSplitVal);

                          return (
                          <div key={emp.id} style={{ backgroundColor: isChecked ? 'rgba(255,255,255,0.05)' : 'transparent', padding: '8px 10px', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '8px', border: isChecked ? '1px solid rgba(255,255,255,0.15)' : '1px solid transparent' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: '#fff' }}>
                                <input 
                                  type="checkbox" 
                                  checked={isChecked}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedEmployeesToPay([...selectedEmployeesToPay, emp.id!]);
                                      if (!employeePaymentMethods[emp.id!]) {
                                        setEmployeePaymentMethods({ ...employeePaymentMethods, [emp.id!]: 'cash' });
                                      }
                                    } else {
                                      setSelectedEmployeesToPay(selectedEmployeesToPay.filter(id => id !== emp.id!));
                                      const newWages = {...customWages};
                                      delete newWages[emp.id!];
                                      setCustomWages(newWages);
                                    }
                                  }}
                                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                                />
                                <span style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>{emp.name}</span>
                              </label>

                              {isChecked ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <span style={{ color: '#f87171', fontWeight: 'bold', fontSize: '0.9rem' }}>Total: R$</span>
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
                                      width: '75px',
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
                                <span style={{ color: '#94a3b8', fontWeight: 'bold', fontSize: '0.85rem' }}>- R$ {emp.dailyWage.toFixed(2).replace('.', ',')}</span>
                              )}
                            </div>

                            {isChecked && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', backgroundColor: 'rgba(0,0,0,0.3)', padding: '6px 8px', borderRadius: '6px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                                  <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase' }}>Forma de Pagamento:</span>
                                  <div style={{ display: 'flex', backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: '6px', padding: '2px', border: '1px solid #475569' }}>
                                    <button
                                      type="button"
                                      onClick={() => setEmployeePaymentMethods({ ...employeePaymentMethods, [emp.id!]: 'cash' })}
                                      style={{
                                        backgroundColor: currentMethod === 'cash' ? '#16a34a' : 'transparent',
                                        color: '#ffffff',
                                        border: 'none',
                                        borderRadius: '4px',
                                        padding: '2px 8px',
                                        fontSize: '0.75rem',
                                        fontWeight: 'bold',
                                        cursor: 'pointer'
                                      }}
                                    >
                                      💵 Dinheiro
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setEmployeePaymentMethods({ ...employeePaymentMethods, [emp.id!]: 'pix' })}
                                      style={{
                                        backgroundColor: currentMethod === 'pix' ? '#14b8a6' : 'transparent',
                                        color: '#ffffff',
                                        border: 'none',
                                        borderRadius: '4px',
                                        padding: '2px 8px',
                                        fontSize: '0.75rem',
                                        fontWeight: 'bold',
                                        cursor: 'pointer'
                                      }}
                                    >
                                      📱 PIX
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setEmployeePaymentMethods({ ...employeePaymentMethods, [emp.id!]: 'split' })}
                                      style={{
                                        backgroundColor: currentMethod === 'split' ? '#eab308' : 'transparent',
                                        color: currentMethod === 'split' ? '#000000' : '#ffffff',
                                        border: 'none',
                                        borderRadius: '4px',
                                        padding: '2px 8px',
                                        fontSize: '0.75rem',
                                        fontWeight: 'bold',
                                        cursor: 'pointer'
                                      }}
                                    >
                                      🔀 Misto
                                    </button>
                                  </div>
                                </div>

                                {currentMethod === 'split' && (
                                  <div style={{ display: 'flex', gap: '8px', borderTop: '1px dashed rgba(255,255,255,0.1)', paddingTop: '6px', marginTop: '2px' }}>
                                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                      <span style={{ fontSize: '0.75rem', color: '#4ade80', fontWeight: 'bold' }}>💵 Dinheiro:</span>
                                      <input 
                                        type="text"
                                        value={cashSplitStr}
                                        onChange={e => {
                                          let val = e.target.value.replace(/\D/g, '');
                                          if (val === '') val = '0';
                                          const formatted = (parseFloat(val) / 100).toFixed(2).replace('.', ',');
                                          setEmployeeSplitCash({ ...employeeSplitCash, [emp.id!]: formatted });
                                        }}
                                        style={{
                                          width: '65px',
                                          backgroundColor: 'rgba(0,0,0,0.6)',
                                          border: '1px solid #16a34a',
                                          borderRadius: '4px',
                                          padding: '2px 4px',
                                          color: '#4ade80',
                                          fontSize: '0.85rem',
                                          fontWeight: 'bold',
                                          textAlign: 'center',
                                          outline: 'none'
                                        }}
                                      />
                                    </div>
                                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
                                      <span style={{ fontSize: '0.75rem', color: '#38bdf8', fontWeight: 'bold' }}>📱 PIX:</span>
                                      <span style={{ fontSize: '0.85rem', color: '#38bdf8', fontWeight: 900 }}>
                                        R$ {pixSplitVal.toFixed(2).replace('.', ',')}
                                      </span>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )})}
                      </div>
                    </div>
                  )}

                  {closeReserveLines.length > 0 && (
                    <div style={{ backgroundColor: 'rgba(12, 74, 80, 0.28)', border: '1px solid #0f766e', borderRadius: '8px', padding: '12px', display: 'grid', gap: '10px' }}>
                      <strong style={{ color: '#ccfbf1' }}>Reservas opcionais da Gerência</strong>
                      <small style={{ color: '#cbd5e1' }}>Selecione apenas o que foi separado de fato. Fechar sem selecionar não registra reservas.</small>
                      {closeReserveLines.map(line => {
                        const choice = closeReservations[line.key];
                        return <div key={line.key} style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px', color: '#fff' }}>
                          <label style={{ flex: 1, minWidth: '180px', cursor: 'pointer' }}>
                            <input type="checkbox" checked={!!choice?.selected} onChange={event => setCloseReservations(previous => ({ ...previous, [line.key]: { selected: event.target.checked, amount: previous[line.key]?.amount || (line.suggested / 100).toFixed(2).replace('.', ','), source: previous[line.key]?.source || 'cash' } }))} />{' '}
                            {line.name}
                            <small style={{ display: 'block', color: '#99f6e4' }}>Por dia: {money(line.daily)} · Pendente: {money(line.pending)} · Sugerido: {money(line.suggested)}</small>
                          </label>
                          {choice?.selected && <>
                            <label>Valor <input aria-label={`Valor da reserva de ${line.name}`} value={choice.amount} onChange={event => setCloseReservations(previous => ({ ...previous, [line.key]: { ...previous[line.key], amount: event.target.value } }))} style={{ width: '90px', color: '#fff', background: '#0f172a', border: '1px solid #14b8a6', padding: '5px' }} /></label>
                            <select aria-label={`Origem da reserva de ${line.name}`} value={choice.source} onChange={event => setCloseReservations(previous => ({ ...previous, [line.key]: { ...previous[line.key], source: event.target.value as MoneySource } }))} style={{ color: '#fff', background: '#0f172a', border: '1px solid #14b8a6', padding: '5px' }}>
                              <option value="cash">Dinheiro</option><option value="pix">PIX</option><option value="bank">Banco</option><option value="other">Outro</option>
                            </select>
                          </>}
                        </div>;
                      })}
                      <strong style={{ color: '#99f6e4' }}>Selecionado em dinheiro: {money(Math.round(closeCashReserves * 100))}</strong>
                    </div>
                  )}

                  {restockSuggestedCents > 0 && <div style={{ backgroundColor:'rgba(30,64,175,.2)',border:'1px solid #3b82f6',borderRadius:'8px',padding:'12px',display:'grid',gap:'8px',color:'#fff' }}>
                    <label style={{fontWeight:800,color:'#bfdbfe'}}><input type="checkbox" checked={restockSelected} onChange={event=>{setRestockSelected(event.target.checked);if(event.target.checked&&!restockAmount)setRestockAmount((restockSuggestedCents/100).toFixed(2).replace('.',','));}}/> Reserva opcional para reposição</label>
                    <small>Vendas do turno de produtos selecionados, pelo custo padrão salvo no momento da venda: {money(restockSuggestedCents)}. Não altera o lucro operacional.</small>
                    {restockSelected&&<div style={{display:'flex',gap:'8px',flexWrap:'wrap'}}>
                      <label>Valor <input aria-label="Valor da reserva de reposição" value={restockAmount} onChange={e=>setRestockAmount(e.target.value)} style={{width:'95px',color:'#fff',background:'#0f172a',padding:'5px'}}/></label>
                      <label>Fundo de destino <select value={restockFundId||''} onChange={e=>setRestockFundId(e.target.value?Number(e.target.value):null)} style={{color:'#fff',background:'#0f172a',padding:'5px'}}><option value="">Selecione fundo</option>{activeRestockFunds.map(fund=><option key={fund.id} value={fund.id}>{fund.name}</option>)}</select></label>
                      {!creatingRestockFund ? <button type="button" onClick={()=>setCreatingRestockFund(true)} style={{color:'#bfdbfe',background:'transparent',border:'1px solid #3b82f6',borderRadius:6,padding:'5px 8px'}}>Cadastrar fundo</button> : <div style={{display:'flex',gap:6,alignItems:'center'}}><input aria-label="Nome do novo fundo de reposição" placeholder="Nome do fundo" value={restockFundName} onChange={event=>setRestockFundName(event.target.value)} style={{width:150,color:'#fff',background:'#0f172a',padding:'5px'}}/><button type="button" onClick={async()=>{if(!activeSession||!restockFundName.trim())return alert('Informe o nome do fundo.');try{const id=await saveFund({name:restockFundName.trim(),profile:activeSession.profile,status:'active'});setRestockFundId(id);setRestockFundName('');setCreatingRestockFund(false);}catch(error){alert(error instanceof Error?error.message:'Não foi possível cadastrar o fundo.');}}} style={{color:'#fff',background:'#2563eb',border:0,borderRadius:6,padding:'5px 8px'}}>Criar e selecionar</button></div>}
                      <label>Origem <select value={restockSource} onChange={e=>setRestockSource(e.target.value as MoneySource)} style={{color:'#fff',background:'#0f172a',padding:'5px'}}><option value="cash">Dinheiro</option><option value="pix">PIX</option><option value="bank">Banco</option><option value="other">Outro</option></select></label>
                      {!activeRestockFunds.length&&<small>Cadastre um fundo ativo deste perfil em Gerência → Financeiro → Fundos livres.</small>}
                    </div>}
                  </div>}

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
                  fontSize: '1rem', 
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
                onClick={() => handleCloseRegister(false)}
                style={{ 
                  flex: 1, 
                  padding: '12px', 
                  fontSize: '1rem', 
                  fontWeight: 'bold', 
                  borderRadius: '6px', 
                  backgroundColor: '#dc2626', 
                  color: '#ffffff', 
                  border: 'none', 
                  cursor: 'pointer' 
                }}
              >
                Só Fechar
              </button>
              <button
                onClick={() => handleCloseRegister(true)}
                style={{ 
                  flex: 1, 
                  padding: '12px', 
                  fontSize: '1rem', 
                  fontWeight: 'bold', 
                  borderRadius: '6px', 
                  backgroundColor: '#3b82f6', 
                  color: '#ffffff', 
                  border: 'none', 
                  cursor: 'pointer' 
                }}
              >
                Fechar e Imprimir
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
                  onChange={e => { setCurrentSplitMethod(e.target.value as PaymentMethod); setCurrentSplitInstallments(1); }}
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
              {currentSplitMethod !== 'cash' && <label style={{ color:'#cbd5e1', fontSize:'0.8rem', fontWeight:700 }}>Maquininha desta parcela
                <select className="w-full p-2 text-white rounded border border-slate-600 bg-slate-900" value={currentSplitMachineId===undefined?(defaultMachineId||''):currentSplitMachineId||''} onChange={e=>setCurrentSplitMachineId(e.target.value?Number(e.target.value):null)}>
                  {currentSplitMethod==='pix'&&<option value="">PIX direto em conta</option>}{activeMachines.map(machine=><option key={machine.id} value={machine.id}>{machine.name}</option>)}
                </select>
                {currentSplitMethod === 'credit' && <><span className="block mt-2">Parcelas</span><select className="w-full p-2 text-white rounded border border-slate-600 bg-slate-900" value={currentSplitInstallments} onChange={event=>setCurrentSplitInstallments(Number(event.target.value))}>{Array.from({length:12},(_,index)=>index+1).map(count=><option key={count} value={count}>{count === 1 ? 'À vista' : `${count}x`}</option>)}</select></>}
                {(()=>{const mid=currentSplitMachineId===undefined?defaultMachineId:currentSplitMachineId;const rate=paymentRate(currentSplitMethod,mid,currentSplitInstallments);const cents=Math.round(parseCurrency(currentSplitAmount)*100);return rate?<small className="block text-teal-300">Taxa estimada {money(feeCents(cents,rate))} · líquido {money(cents-feeCents(cents,rate))}</small>:currentSplitMethod==='pix'&&!mid?<small className="block text-teal-300">PIX direto em conta · sem tarifa de maquininha</small>:<small className="block text-amber-300">Configure esta modalidade.</small>;})()}
              </label>}
              <button
                className="btn w-full py-3 uppercase font-bold text-sm"
                style={{ backgroundColor: '#3b82f6', color: 'white', border: 'none' }}
                onClick={() => {
                  const amt = parseCurrency(currentSplitAmount);
                  if (amt > 0) {
                    const machineId=currentSplitMachineId===undefined?defaultMachineId:currentSplitMachineId;
                    const rate=paymentRate(currentSplitMethod,machineId,currentSplitInstallments);
                    if(currentSplitMethod!=='cash'&&!(currentSplitMethod==='pix'&&!machineId)&&!rate){alert('Configure a tarifa desta modalidade ou escolha outra maquininha.');return;}
                    const grossCents=Math.round(amt*100);const fee=rate?feeCents(grossCents,rate):0;
                    setSplitPayments([...splitPayments, { method: currentSplitMethod, amount: amt, installments:currentSplitMethod==='credit'?currentSplitInstallments:undefined, machineId: machineId||undefined, machineFee: fee/100, netAmount:(grossCents-fee)/100 }]);
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
    </div>
  );
};
