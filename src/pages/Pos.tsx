import React, { useState, useEffect, useRef } from 'react';
import { db, type ServiceType, type PaymentMethod, type TransactionItem } from '../db/db';
import type { Profile } from '../db/db';
import { CheckCircle, Trash2, Banknote, CreditCard, Smartphone, Search, Plus, Tag } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';

export const Pos = () => {
  const [transactionProfile, setTransactionProfile] = useState<Profile>('chaveiro');
  const [items, setItems] = useState<TransactionItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [clientCode, setClientCode] = useState('');
  const [searchProduct, setSearchProduct] = useState('');
  const [discount, setDiscount] = useState<string>('');
  const [cashReceived, setCashReceived] = useState<string>('');
  const [customUnitPrice, setCustomUnitPrice] = useState<string>('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);

  // Cash Register (Caixa) Session states
  const [openRegisterCash, setOpenRegisterCash] = useState<string>('50,00'); // Fundo padrão inicial sugerido
  const [showCloseRegisterModal, setShowCloseRegisterModal] = useState(false);
  const [closeRegisterCash, setCloseRegisterCash] = useState<string>('');
  const [closeLeftInDrawer, setCloseLeftInDrawer] = useState<string>('50,00'); // Fundo padrão para deixar no dia seguinte

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
      if (t.paymentMethod === 'cash') cash += t.total;
      else if (t.paymentMethod === 'pix') pix += t.total;
      else if (t.paymentMethod === 'debit') debit += t.total;
      else if (t.paymentMethod === 'credit') credit += t.total;
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
    () => db.products.where('profile').equals(transactionProfile).toArray(),
    [transactionProfile]
  );

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
      productId: product.id
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
    setShowConfirmModal(true);
  };

  const completeCheckout = async (shouldPrint: boolean) => {
    try {
      await db.transaction('rw', db.transactions, db.products, async () => {
        // Decrement stock for products (Only for keys, springs and screws)
        for (const item of items) {
          if (item.productId) {
            const product = await db.products.get(item.productId);
            if (product && (product.serviceType === 'key' || product.serviceType === 'spring' || product.serviceType === 'screw')) {
              await db.products.update(product.id!, { stock: product.stock - item.quantity });
            }
          }
        }

        await db.transactions.add({
          profile: transactionProfile,
          type: 'sale',
          items,
          total: totalAmount,
          discount: discountValue > 0 ? discountValue : undefined,
          paymentMethod,
          clientCode: clientCode || undefined,
          date: new Date()
        });
      }); // End transaction

      // Imprimir Cupom
      if (shouldPrint) {
        const printWindow = window.open('', '_blank', 'width=400,height=600');
        if (printWindow) {
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
              <title>Cupom Não Fiscal</title>
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
              <div class="text-center header-title">Chaveiro & Cutelaria<br>do Lidio e Fabiano</div>
              <div class="text-center" style="font-size: 10px; margin-top: 3px;">Rua Cardoso de Morais, Frente ao 202</div>
              <div class="text-center" style="font-size: 10px;">Bonsucesso - RJ (Frente ao Caçula)</div>
              <div class="text-center" style="font-size: 10px; margin-bottom: 5px;">Tel: (21) 98601-6721 (WhatsApp)</div>
              <div class="text-center" style="font-size: 11px;">Data: ${dateStr}</div>
              ${clientCode ? `<div class="divider"></div><div class="bold">Cliente: ${clientCode}</div>` : ''}
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
                          ${i.name}<br>
                          ${(i.originalPrice !== undefined && i.originalPrice > i.price) ? `
                            <span style="font-size: 10px; color: #555;">
                              De: <span style="text-decoration: line-through;">R$ ${i.originalPrice.toFixed(2).replace('.', ',')}</span> 
                              Por: R$ ${i.price.toFixed(2).replace('.', ',')} (Desc: R$ ${(i.originalPrice - i.price).toFixed(2).replace('.', ',')}/un)
                            </span>
                          ` : `
                            <span style="font-size: 10px; color: #555;">Vlr. Unit: R$ ${i.price.toFixed(2).replace('.', ',')}</span>
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
                ` : `<tr><td class="bold">Forma de Pagto:</td><td class="text-right bold uppercase">${paymentMethod}</td></tr>`}
              </table>
              <div class="divider"></div>
              <div class="text-center">Obrigado pela preferencia!</div>
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
        }
      }

      setItems([]);
      setClientCode('');
      setDiscount('');
      setCashReceived('');
      setCustomUnitPrice('');
      if (searchInputRef.current) searchInputRef.current.focus();
    } catch (error) {
      console.error(error);
      alert('Erro ao finalizar venda.');
    }
  };

  const printCloseReport = (session: any, totals: any, closeCash: number, leftInDrawer: number) => {
    const printWindow = window.open('', '_blank', 'width=400,height=600');
    if (printWindow) {
      const openedStr = new Date(session.openedAt).toLocaleString('pt-BR');
      const closedStr = new Date().toLocaleString('pt-BR');
      const expectedCash = session.initialCash + totals.cash - (totals.expenses || 0);
      const difference = closeCash - expectedCash;
      const withdrawal = closeCash - leftInDrawer;

      const html = `
        <html>
        <head>
          <title>Fechamento de Caixa</title>
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
          <div class="text-center header-title">Chaveiro & Cutelaria<br>do Lidio e Fabiano</div>
          <div class="text-center bold" style="font-size: 13px; margin-top: 5px; text-transform: uppercase;">Fechamento de Caixa</div>
          <div class="divider"></div>
          <div><span class="bold">Operador:</span> <span style="text-transform: uppercase;">${session.profile}</span></div>
          <div><span class="bold">Abertura:</span> ${openedStr}</div>
          <div><span class="bold">Fechamento:</span> ${closedStr}</div>
          <div class="divider"></div>
          <table>
            <tr><td class="bold">Fundo de Abertura:</td><td class="text-right">R$ ${session.initialCash.toFixed(2).replace('.', ',')}</td></tr>
            <tr><td class="bold">Vendas Dinheiro (+):</td><td class="text-right">R$ ${totals.cash.toFixed(2).replace('.', ',')}</td></tr>
            ${(totals.expenses || 0) > 0 ? `<tr><td class="bold">Despesas/Retiradas (-):</td><td class="text-right">R$ ${(totals.expenses || 0).toFixed(2).replace('.', ',')}</td></tr>` : ''}
            <tr><td class="bold">Dinheiro Esperado:</td><td class="text-right font-black">R$ ${expectedCash.toFixed(2).replace('.', ',')}</td></tr>
            <tr><td class="bold">Dinheiro Contado:</td><td class="text-right">R$ ${closeCash.toFixed(2).replace('.', ',')}</td></tr>
            <tr style="color: ${difference >= 0 ? 'green' : 'red'};"><td class="bold">Diferença Dinheiro:</td><td class="text-right bold">R$ ${difference.toFixed(2).replace('.', ',')} (${difference >= 0 ? 'Sobrando' : 'Faltando'})</td></tr>
          </table>
          <div class="divider"></div>
          <table>
            <tr><td class="bold">Fundo p/ Amanhã:</td><td class="text-right">R$ ${leftInDrawer.toFixed(2).replace('.', ',')}</td></tr>
            <tr><td class="bold">Retirada (Sangria):</td><td class="text-right bold">R$ ${withdrawal.toFixed(2).replace('.', ',')}</td></tr>
          </table>
          <div class="divider"></div>
          <div class="bold text-center">OUTRAS FORMAS DE PAGAMENTO</div>
          <table>
            <tr><td>Vendas PIX:</td><td class="text-right">R$ ${totals.pix.toFixed(2).replace('.', ',')}</td></tr>
            <tr><td>Vendas Débito:</td><td class="text-right">R$ ${totals.debit.toFixed(2).replace('.', ',')}</td></tr>
            <tr><td>Vendas Crédito:</td><td class="text-right">R$ ${totals.credit.toFixed(2).replace('.', ',')}</td></tr>
            <tr class="bold"><td>Total Período:</td><td class="text-right">R$ ${totals.totalSales.toFixed(2).replace('.', ',')}</td></tr>
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
    }
  };

  const handleCloseRegister = async () => {
    if (!activeSession) return;
    const closeCashVal = parseCurrency(closeRegisterCash);
    const leftInDrawerVal = parseCurrency(closeLeftInDrawer);
    const expectedCashVal = activeSession.initialCash + sessionTotals.cash - sessionTotals.expenses;
    const diffVal = closeCashVal - expectedCashVal;

    try {
      await db.cashSessions.update(activeSession.id!, {
        closedAt: new Date(),
        expectedCash: expectedCashVal,
        actualCash: closeCashVal,
        leftInDrawer: leftInDrawerVal,
        difference: diffVal,
        status: 'closed',
        cashSales: sessionTotals.cash,
        pixSales: sessionTotals.pix,
        debitSales: sessionTotals.debit,
        creditSales: sessionTotals.credit
      });

      // Ask to print closure report
      const shouldPrint = window.confirm("Deseja imprimir o comprovante de fechamento de caixa?");
      if (shouldPrint) {
        printCloseReport(activeSession, sessionTotals, closeCashVal, leftInDrawerVal);
      }

      setShowCloseRegisterModal(false);
      setCloseRegisterCash('');
      setCloseLeftInDrawer('50,00');
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
              setOpenRegisterCash('50,00');
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
    <div className="flex flex-col h-full animate-fade-in font-sans">
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

      <div className="flex gap-6 flex-1 min-h-0">
        {/* Left column: Inputs and Info */}
        <div className="w-[500px] flex flex-col gap-5 border-r-4 border-red-600 pr-6">
          <form onSubmit={handleFastAdd} className="flex flex-col gap-2 mb-2">
            <label className="text-white font-bold px-1 uppercase text-lg">Código do Produto</label>
            <div className="flex gap-3 items-stretch w-full">
              <div className="bg-white rounded p-1 shadow-inner border-4 border-gray-300 focus-within:border-yellow-500 flex-shrink-0 flex items-center" style={{ width: '310px' }}>
                <input
                  type="text"
                  ref={searchInputRef}
                  autoFocus
                  className="w-full font-extrabold px-3 bg-transparent outline-none text-black tracking-widest text-center"
                  style={{ fontSize: '2.8rem', height: '75px' }}
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
            <div className="bg-[var(--bg-surface)] rounded-lg shadow-lg p-6 border-l-8 border-yellow-500 flex flex-col">
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
            <div className="bg-[var(--bg-surface)] rounded-lg shadow-lg p-6 border border-dashed border-[var(--border)] text-center text-gray-500 font-bold text-xl uppercase py-10">
              Nenhum produto selecionado
            </div>
          )}

          <div style={{ height: '80px' }} className="flex-shrink-0"></div>
          <div className="bg-[var(--bg-surface)] p-5 rounded shadow-lg border-l-4 border-red-600 flex flex-col gap-4">
            <div className="text-base font-bold uppercase mb-2 border-b border-[var(--border)] pb-2 text-white">Configurações da Venda</div>

            <div>
              <label className="text-sm mb-2 block font-bold text-muted uppercase tracking-wide">Forma de Pagamento</label>
              <div className="grid grid-cols-4 gap-3">
                <button
                  className={`btn py-3 font-bold flex flex-col items-center justify-center gap-2 payment-btn ${paymentMethod === 'cash' ? 'payment-active' : 'opacity-80'}`}
                  style={{ 
                    backgroundColor: '#16a34a', 
                    color: '#ffffff', 
                    border: paymentMethod === 'cash' ? '4px solid #ffffff' : 'none', 
                    borderRadius: '8px',
                    boxShadow: paymentMethod === 'cash' ? '0 0 15px rgba(22, 163, 74, 0.6)' : 'none'
                  }}
                  onClick={() => setPaymentMethod('cash')}
                >
                  <Banknote size={32} />
                  <span className="text-base uppercase font-extrabold">Dinheiro</span>
                </button>
                <button
                  className={`btn py-3 font-bold flex flex-col items-center justify-center gap-2 payment-btn ${paymentMethod === 'pix' ? 'payment-active' : 'opacity-80'}`}
                  style={{ 
                    backgroundColor: '#14b8a6', 
                    color: '#ffffff', 
                    border: paymentMethod === 'pix' ? '4px solid #ffffff' : 'none', 
                    borderRadius: '8px',
                    boxShadow: paymentMethod === 'pix' ? '0 0 15px rgba(20, 184, 166, 0.6)' : 'none'
                  }}
                  onClick={() => setPaymentMethod('pix')}
                >
                  <Smartphone size={32} />
                  <span className="text-base uppercase font-extrabold">PIX</span>
                </button>
                <button
                  className={`btn py-3 font-bold flex flex-col items-center justify-center gap-2 payment-btn ${paymentMethod === 'debit' ? 'payment-active' : 'opacity-80'}`}
                  style={{ 
                    backgroundColor: '#2563eb', 
                    color: '#ffffff', 
                    border: paymentMethod === 'debit' ? '4px solid #ffffff' : 'none', 
                    borderRadius: '8px',
                    boxShadow: paymentMethod === 'debit' ? '0 0 15px rgba(37, 99, 235, 0.6)' : 'none'
                  }}
                  onClick={() => setPaymentMethod('debit')}
                >
                  <CreditCard size={32} />
                  <span className="text-base uppercase font-extrabold">Débito</span>
                </button>
                <button
                  className={`btn py-3 font-bold flex flex-col items-center justify-center gap-2 payment-btn ${paymentMethod === 'credit' ? 'payment-active' : 'opacity-80'}`}
                  style={{ 
                    backgroundColor: '#9333ea', 
                    color: '#ffffff', 
                    border: paymentMethod === 'credit' ? '4px solid #ffffff' : 'none', 
                    borderRadius: '8px',
                    boxShadow: paymentMethod === 'credit' ? '0 0 15px rgba(147, 51, 234, 0.6)' : 'none'
                  }}
                  onClick={() => setPaymentMethod('credit')}
                >
                  <CreditCard size={32} />
                  <span className="text-base uppercase font-extrabold">Crédito</span>
                </button>
              </div>
            </div>

            <div>
              <label className="text-sm mb-1 block font-bold text-muted uppercase">Faturamento</label>
              <select
                className="w-full p-3 text-white text-lg font-bold rounded border border-[var(--border)] bg-black/30 outline-none focus:border-primary"
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
                  className="w-full p-3 text-white text-lg font-bold rounded border border-[var(--border)] bg-black/30 outline-none focus:border-primary"
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
                  className="w-full p-3 text-white text-lg font-bold rounded border border-[var(--border)] bg-black/30 outline-none focus:border-primary"
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
                className="w-full p-3 text-white text-lg font-bold rounded border border-[var(--border)] bg-black/30 outline-none focus:border-primary"
                placeholder=""
                value={clientCode}
                onChange={e => setClientCode(e.target.value)}
              />
            </div>

            <button
              className="w-full py-5 text-2xl font-extrabold rounded shadow transition-colors mt-4 flex justify-center items-center gap-3 uppercase hover:opacity-90 pos-checkout-btn"
              style={{ backgroundColor: '#16a34a', color: '#ffffff', border: 'none' }}
              onClick={handleCheckout}
            >
              <CheckCircle size={32} /> FINALIZAR VENDA
            </button>
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

          <div style={{ height: '160px' }} className="mt-6 flex-shrink-0">
            <div className="grid grid-cols-3 gap-6 h-full">
              {/* Subtotal Box */}
              <div 
                style={{ backgroundColor: '#1e293b', border: '3px solid #eab308', borderRadius: '12px', padding: '20px', height: '100%' }} 
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
                  <div style={{ fontSize: '3.5rem', fontWeight: 900, color: '#ffffff', lineHeight: 1.1 }} className="mt-2">
                    R$ {totalAmount.toFixed(2).replace('.', ',')}
                  </div>
                )}
                <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#eab308' }} className="mt-2 uppercase tracking-wide">
                  👉 {paymentMethod === 'cash' ? 'DINHEIRO' : paymentMethod === 'pix' ? 'PIX' : paymentMethod === 'debit' ? 'DÉBITO' : 'CRÉDITO'}
                </div>
              </div>

              {/* Total Recebido Box */}
              <div 
                style={{ 
                  backgroundColor: '#1e293b', 
                  border: '3px solid #22c55e', 
                  borderRadius: '12px', 
                  padding: '20px', 
                  height: '100%',
                  visibility: paymentMethod === 'cash' ? 'visible' : 'hidden'
                }} 
                className="flex flex-col justify-between shadow-2xl"
              >
                <div className="text-gray-400 font-bold uppercase text-xs tracking-wider">TOTAL RECEBIDO</div>
                <div className="relative flex items-center mt-3">
                  <span style={{ fontSize: '1.8rem', fontWeight: 900 }} className="absolute left-3 text-gray-400">R$</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    className="w-full text-right outline-none rounded pos-received-input py-2 pl-12 pr-3 transition-colors font-black"
                    style={{ fontSize: '2.5rem', height: '65px' }}
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
                  padding: '20px', 
                  height: '100%',
                  visibility: paymentMethod === 'cash' ? 'visible' : 'hidden'
                }} 
                className="flex flex-col justify-between shadow-2xl"
              >
                <div className="text-gray-400 font-bold uppercase text-xs tracking-wider">TROCO</div>
                <div style={{ fontSize: '3.5rem', fontWeight: 900, color: '#60a5fa', lineHeight: 1.1, textAlign: 'right' }} className="mt-2">
                  R$ {changeValue.toFixed(2).replace('.', ',')}
                </div>
                <div style={{ fontSize: '1.3rem', fontWeight: 900, color: changeValue > 0 ? '#4ade80' : '#94a3b8', textAlign: 'right' }} className="mt-2 uppercase">
                  {changeValue > 0 ? 'DEVOLVER TROCO' : 'SEM TROCO'}
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>

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

            <div style={{ display: 'flex', gap: '16px' }}>
              <button
                onClick={() => {
                  setShowPrintModal(false);
                  completeCheckout(false);
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
                  completeCheckout(true);
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

            <div style={{ backgroundColor: 'rgba(0,0,0,0.3)', padding: '16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.95rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#94a3b8' }}>Fundo de Abertura:</span>
                <span style={{ fontWeight: 'bold' }}>R$ {activeSession.initialCash.toFixed(2).replace('.', ',')}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#94a3b8' }}>Vendas em Dinheiro (+):</span>
                <span style={{ fontWeight: 'bold', color: '#4ade80' }}>+ R$ {sessionTotals.cash.toFixed(2).replace('.', ',')}</span>
              </div>
              {sessionTotals.expenses > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#f87171' }}>Despesas/Retiradas (-):</span>
                  <span style={{ fontWeight: 'bold', color: '#f87171' }}>- R$ {sessionTotals.expenses.toFixed(2).replace('.', ',')}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed rgba(255,255,255,0.1)', paddingTop: '6px', fontSize: '1.05rem' }}>
                <span style={{ color: '#ffffff', fontWeight: 'bold' }}>Dinheiro Esperado em Caixa:</span>
                <strong style={{ color: '#eab308' }}>R$ {(activeSession.initialCash + sessionTotals.cash - sessionTotals.expenses).toFixed(2).replace('.', ',')}</strong>
              </div>
              <div style={{ borderTop: '1px dashed rgba(255,255,255,0.1)', margin: '4px 0' }}></div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#94a3b8' }}>Vendas em PIX:</span>
                <span style={{ fontWeight: 'bold' }}>R$ {sessionTotals.pix.toFixed(2).replace('.', ',')}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#94a3b8' }}>Vendas Cartão (Débito/Crédito):</span>
                <span style={{ fontWeight: 'bold' }}>R$ {(sessionTotals.debit + sessionTotals.credit).toFixed(2).replace('.', ',')}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#38bdf8', fontWeight: 'bold' }}>
                <span>Total de Vendas do Período:</span>
                <span>R$ {sessionTotals.totalSales.toFixed(2).replace('.', ',')}</span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ color: '#ffffff', fontWeight: 'bold', fontSize: '1rem' }}>
                  DINHEIRO FÍSICO CONTADO NO CAIXA (R$):
                </label>
                <input
                  type="text"
                  placeholder="0,00"
                  style={{
                    width: '100%',
                    backgroundColor: 'rgba(0,0,0,0.5)',
                    border: '3px solid #dc2626',
                    borderRadius: '8px',
                    padding: '12px',
                    color: '#4ade80',
                    fontSize: '1.8rem',
                    fontWeight: '900',
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

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ color: '#94a3b8', fontWeight: 'bold', fontSize: '0.9rem' }}>
                  VALOR A DEIXAR NO CAIXA P/ AMANHÃ (FUNDO) (R$):
                </label>
                <input
                  type="text"
                  style={{
                    width: '100%',
                    backgroundColor: 'rgba(0,0,0,0.4)',
                    border: '2px solid #475569',
                    borderRadius: '6px',
                    padding: '8px 12px',
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

            {(() => {
              const expectedCash = activeSession.initialCash + sessionTotals.cash - sessionTotals.expenses;
              const closeCash = parseCurrency(closeRegisterCash);
              const leftInDrawer = parseCurrency(closeLeftInDrawer);
              const diff = closeCash - expectedCash;
              const withdrawal = closeCash - leftInDrawer;

              return (
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
    </div>
  );
};
