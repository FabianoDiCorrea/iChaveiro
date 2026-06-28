import re

with open('src/pages/Pos.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

def replace_sale_receipt(c):
    start = c.find('const printReceipt = () => {')
    # Find the closing brace of printReceipt
    # It ends with:
    #       if (window.confirm("Corte a 1ª via (Cliente) e clique em OK para imprimir a 2ª via (Chaveiro).")) {
    #         ipcRenderer.send('print-html', html);
    #       }
    #     }
    #   };
    end = c.find('};\n', start) + 2
    if end < start: return c
    
    new_func = """const printReceipt = () => {
    if (items.length === 0) return;
    const rmAcc = (s) => s ? s.normalize('NFD').replace(/[\u0300-\u036f]/g, '') : '';
    const pad = (s, l, a='left') => { s=s.toString(); if(s.length>l) s=s.substring(0,l); if(a==='left') return s.padEnd(l, ' '); if(a==='right') return s.padStart(l, ' '); return s.padStart(Math.floor((l+s.length)/2), ' ').padEnd(l, ' '); };
    let text = pad('Chaveiro & Cutelaria', 32, 'center') + '\\n' + pad('do Lidio e Fabiano', 32, 'center') + '\\n' + pad('Rua Cardoso de Morais, F. 302', 32, 'center') + '\\n' + pad('Bonsucesso - RJ', 32, 'center') + '\\n' + pad('Tel: (21) 98601-6721', 32, 'center') + '\\n';
    text += '-'.repeat(32) + '\\n';
    text += `Data: ${new Date().toLocaleString('pt-BR')}\\nVenda: #${Date.now().toString().slice(-6)}\\nOperador: ${rmAcc(currentProfile)}\\n`;
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
  };"""
    return c[:start] + new_func + c[end:]


def replace_close_receipt(c):
    # Find the closing receipt block
    # It's inside handleCloseRegister
    # We look for "let html = `\n          <html>\n          <head>\n            <title>Fechamento de Caixa</title>"
    start = c.find('let html = `\n          <html>\n          <head>\n            <title>Fechamento de Caixa</title>')
    if start == -1: return c
    
    # We want to replace from here until `ipcRenderer.send('print-html', html);`
    end = c.find("ipcRenderer.send('print-html', html);", start) + 37
    if end < start: return c
    
    new_func = """const rmAcc = (s) => s ? s.normalize('NFD').replace(/[\u0300-\u036f]/g, '') : '';
        const pad = (s, l, a='left') => { s=s.toString(); if(s.length>l) s=s.substring(0,l); if(a==='left') return s.padEnd(l, ' '); if(a==='right') return s.padStart(l, ' '); return s.padStart(Math.floor((l+s.length)/2), ' ').padEnd(l, ' '); };
        let text = pad('FECHAMENTO DE CAIXA', 32, 'center') + '\\n' + '-'.repeat(32) + '\\n';
        text += `Data: ${new Date().toLocaleString('pt-BR')}\\nOperador: ${rmAcc(activeSession.profile)}\\n`;
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
        ipcRenderer.send('print-text', text);"""
        
    return c[:start] + new_func + c[end:]

content = replace_sale_receipt(content)
content = replace_close_receipt(content)

with open('src/pages/Pos.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
