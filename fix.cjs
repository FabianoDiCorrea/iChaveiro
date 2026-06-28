const fs = require('fs');

const replaceInFile = (file, isModal) => {
  let c = fs.readFileSync(file, 'utf8');

  if (isModal) {
    const start = c.indexOf('const printReceipt = () => {');
    const end = c.indexOf('};', start) + 2;
    if (end > start) {
      const newFunc = `const printReceipt = () => {
      if (!sale) return;
      const rmAcc = (s) => s ? s.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '') : '';
      const pad = (s, l, a='left') => { s=s.toString(); if(s.length>l) s=s.substring(0,l); if(a==='left') return s.padEnd(l, ' '); if(a==='right') return s.padStart(l, ' '); return s.padStart(Math.floor((l+s.length)/2), ' ').padEnd(l, ' '); };
      let text = pad('Chaveiro & Cutelaria', 32, 'center') + '\\n' + pad('do Lidio e Fabiano', 32, 'center') + '\\n' + pad('Rua Cardoso de Morais, F. 302', 32, 'center') + '\\n' + pad('Bonsucesso - RJ', 32, 'center') + '\\n' + pad('Tel: (21) 98601-6721', 32, 'center') + '\\n';
      text += '-'.repeat(32) + '\\n';
      text += \`Data: \${new Date(sale.created_at).toLocaleString('pt-BR')}\\nVenda: #\${sale.id.toString().slice(-6)}\\nOperador: \${rmAcc(currentProfile || 'Padrao')}\\n\`;
      text += '-'.repeat(32) + '\\n';
      text += pad('Qtd', 4) + ' ' + pad('Item', 17) + ' ' + pad('Total', 8, 'right') + '\\n';
      JSON.parse(sale.items).forEach(i => { text += pad(i.quantity+'x', 4) + ' ' + pad(rmAcc(i.name), 17) + ' ' + pad(formatCurrency(i.quantity*(i.unitPrice||i.price)), 8, 'right') + '\\n'; });
      text += '-'.repeat(32) + '\\n';
      const sub = sale.subtotal_bruto || sale.total;
      text += pad('Subtotal:', 16) + pad(formatCurrency(sub), 16, 'right') + '\\n';
      const disc = sub - sale.total;
      if (disc > 0) text += pad('Desconto:', 16) + pad('-' + formatCurrency(disc), 16, 'right') + '\\n';
      text += pad('TOTAL A PAGAR:', 16) + pad(formatCurrency(sale.total), 16, 'right') + '\\n';
      if (sale.received_amount > 0) { text += pad('Recebido:', 16) + pad(formatCurrency(sale.received_amount), 16, 'right') + '\\n'; text += pad('Troco:', 16) + pad(formatCurrency(sale.change_amount||0), 16, 'right') + '\\n'; }
      if (sale.observations) text += '-'.repeat(32) + '\\nObs: ' + rmAcc(sale.observations) + '\\n';
      text += '\\n' + pad('Obrigado pela preferencia!', 32, 'center') + '\\n\\n\\n\\n\\n\\n\\n.\\n';
      const { ipcRenderer } = window.require('electron');
      ipcRenderer.send('print-text', text);
      if (twoCopies) { if (window.confirm('Corte a 1a via (Cliente) e clique OK.')) ipcRenderer.send('print-text', text); }
    };`;
      c = c.substring(0, start) + newFunc + c.substring(end);
    }
  } else {
    // POS.tsx
    const start = c.indexOf('const printReceipt = () => {');
    // Find the closing brace of printReceipt
    // We can search for: 
    // ipcRenderer.send('print-html', html);
    //       }
    //     }
    //   };
    const htmlEnd = c.indexOf("ipcRenderer.send('print-html', html);", start);
    let end = -1;
    if (htmlEnd !== -1) {
        end = c.indexOf('};', htmlEnd) + 2;
    }
    
    if (start !== -1 && end !== -1 && end > start) {
        const newFunc = `const printReceipt = () => {
    if (items.length === 0) return;
    const rmAcc = (s) => s ? s.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '') : '';
    const pad = (s, l, a='left') => { s=s.toString(); if(s.length>l) s=s.substring(0,l); if(a==='left') return s.padEnd(l, ' '); if(a==='right') return s.padStart(l, ' '); return s.padStart(Math.floor((l+s.length)/2), ' ').padEnd(l, ' '); };
    let text = pad('Chaveiro & Cutelaria', 32, 'center') + '\\n' + pad('do Lidio e Fabiano', 32, 'center') + '\\n' + pad('Rua Cardoso de Morais, F. 302', 32, 'center') + '\\n' + pad('Bonsucesso - RJ', 32, 'center') + '\\n' + pad('Tel: (21) 98601-6721', 32, 'center') + '\\n';
    text += '-'.repeat(32) + '\\n';
    text += \`Data: \${new Date().toLocaleString('pt-BR')}\\nVenda: #\${Date.now().toString().slice(-6)}\\nOperador: \${rmAcc(currentProfile)}\\n\`;
    text += '-'.repeat(32) + '\\n';
    text += pad('Qtd', 4) + ' ' + pad('Item', 17) + ' ' + pad('Total', 8, 'right') + '\\n';
    items.forEach(i => { text += pad(i.quantity+'x', 4) + ' ' + pad(rmAcc(i.name), 17) + ' ' + pad(formatCurrency(i.quantity*i.unitPrice), 8, 'right') + '\\n'; });
    text += '-'.repeat(32) + '\\n';
    text += pad('Subtotal:', 16) + pad(formatCurrency(subtotalBruto), 16, 'right') + '\\n';
    if (discountValue > 0) text += pad('Desconto:', 16) + pad('-' + formatCurrency(discountValue), 16, 'right') + '\\n';
    text += pad('TOTAL A PAGAR:', 16) + pad(formatCurrency(total), 16, 'right') + '\\n';
    if (receivedAmount > 0) { text += pad('Recebido:', 16) + pad(formatCurrency(receivedAmount), 16, 'right') + '\\n'; text += pad('Troco:', 16) + pad(formatCurrency(change), 16, 'right') + '\\n'; }
    if (observations) text += '-'.repeat(32) + '\\nObs: ' + rmAcc(observations) + '\\n';
    text += '\\n' + pad('Obrigado pela preferencia!', 32, 'center') + '\\n\\n\\n\\n\\n\\n\\n.\\n';
    const { ipcRenderer } = (window as any).require('electron');
    ipcRenderer.send('print-text', text);
    if (twoCopies) { if (window.confirm('Corte a 1a via e clique OK para a 2a via.')) ipcRenderer.send('print-text', text); }
  };`;
        c = c.substring(0, start) + newFunc + c.substring(end);
    }
    
    // Close receipt
    const closeStart = c.indexOf('let html = `\\n          <html>\\n          <head>\\n            <title>Fechamento de Caixa</title>');
    if (closeStart !== -1) {
        const closeEnd = c.indexOf("ipcRenderer.send('print-html', html);", closeStart) + 37;
        const newCloseFunc = `const rmAcc = (s) => s ? s.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '') : '';
        const pad = (s, l, a='left') => { s=s.toString(); if(s.length>l) s=s.substring(0,l); if(a==='left') return s.padEnd(l, ' '); if(a==='right') return s.padStart(l, ' '); return s.padStart(Math.floor((l+s.length)/2), ' ').padEnd(l, ' '); };
        let text = pad('FECHAMENTO DE CAIXA', 32, 'center') + '\\n' + '-'.repeat(32) + '\\n';
        text += \`Data: \${new Date().toLocaleString('pt-BR')}\\nOperador: \${rmAcc(activeSession.profile)}\\n\`;
        text += '-'.repeat(32) + '\\n';
        text += pad('Fundo de Caixa:', 20) + pad(formatCurrency(activeSession.initialCash), 12, 'right') + '\\n\\n';
        text += pad('Vendas (Dinheiro):', 20) + pad(formatCurrency(sessionTotals.cash), 12, 'right') + '\\n';
        text += pad('Vendas (Pix):', 20) + pad(formatCurrency(sessionTotals.pix), 12, 'right') + '\\n';
        text += pad('Vendas (Debito):', 20) + pad(formatCurrency(sessionTotals.debit), 12, 'right') + '\\n';
        text += pad('Vendas (Credito):', 20) + pad(formatCurrency(sessionTotals.credit), 12, 'right') + '\\n';
        text += '-'.repeat(32) + '\\n';
        text += pad('Dinheiro Esperado:', 20) + pad(formatCurrency(expectedNetCash), 12, 'right') + '\\n';
        text += pad('Dinheiro Real:', 20) + pad(formatCurrency(closeCashVal), 12, 'right') + '\\n';
        text += '-'.repeat(32) + '\\n';
        text += pad('Diferenca:', 20) + pad(formatCurrency(diffVal), 12, 'right') + '\\n';
        text += '\\n\\n\\n\\n\\n\\n\\n.\\n';
        const { ipcRenderer } = (window as any).require('electron');
        ipcRenderer.send('print-text', text);`;
        c = c.substring(0, closeStart) + newCloseFunc + c.substring(closeEnd);
    }
  }

  fs.writeFileSync(file, c);
};

replaceInFile('src/components/StandaloneReceiptModal.tsx', true);
replaceInFile('src/pages/Pos.tsx', false);
