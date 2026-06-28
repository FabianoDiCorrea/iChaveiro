const fs = require('fs');
const file = 'src/components/StandaloneReceiptModal.tsx';
let content = fs.readFileSync(file, 'utf8');

const start = content.indexOf('const printReceipt = () => {');
const end = content.indexOf('};', start) + 2;

const newFunc = `const printReceipt = () => {
  if (!sale) return;

  const removeAccents = (str) => {
    return str ? str.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '') : '';
  };

  const pad = (str, length, align = 'left') => {
    str = str.toString();
    if (str.length > length) str = str.substring(0, length);
    if (align === 'left') return str.padEnd(length, ' ');
    if (align === 'right') return str.padStart(length, ' ');
    return str.padStart(Math.floor((length + str.length) / 2), ' ').padEnd(length, ' ');
  };

  let text = "";
  text += pad("Chaveiro & Cutelaria", 32, 'center') + "\\n";
  text += pad("do Lidio e Fabiano", 32, 'center') + "\\n";
  text += pad("Rua Cardoso de Morais, F. 302", 32, 'center') + "\\n";
  text += pad("Bonsucesso - RJ", 32, 'center') + "\\n";
  text += pad("Tel: (21) 98601-6721", 32, 'center') + "\\n";
  text += "-".repeat(32) + "\\n";
  text += \`Data: \${new Date(sale.created_at).toLocaleString('pt-BR')}\\n\`;
  text += \`Venda: #\${sale.id.toString().slice(-6)}\\n\`;
  text += \`Operador: \${removeAccents(currentProfile || 'Padrao')}\\n\`;
  text += "-".repeat(32) + "\\n";
  text += pad("Qtd", 4) + " " + pad("Item", 17) + " " + pad("Total", 8, 'right') + "\\n";
  
  const parsedItems = JSON.parse(sale.items);
  parsedItems.forEach((item) => {
    const q = \`\${item.quantity}x\`;
    const n = removeAccents(item.name);
    const t = formatCurrency(item.quantity * item.unitPrice);
    text += pad(q, 4) + " " + pad(n, 17) + " " + pad(t, 8, 'right') + "\\n";
  });
  
  text += "-".repeat(32) + "\\n";
  const sub = sale.subtotal_bruto || sale.total;
  text += pad("Subtotal:", 16) + pad(formatCurrency(sub), 16, 'right') + "\\n";
  
  const disc = sub - sale.total;
  if (disc > 0) {
    text += pad("Desconto:", 16) + pad("-" + formatCurrency(disc), 16, 'right') + "\\n";
  }
  text += pad("TOTAL A PAGAR:", 16) + pad(formatCurrency(sale.total), 16, 'right') + "\\n";
  
  if (sale.received_amount && sale.received_amount > 0) {
    text += pad("Recebido:", 16) + pad(formatCurrency(sale.received_amount), 16, 'right') + "\\n";
    text += pad("Troco:", 16) + pad(formatCurrency(sale.change_amount || 0), 16, 'right') + "\\n";
  }
  
  if (sale.observations) {
    text += "-".repeat(32) + "\\n";
    text += \`Obs: \${removeAccents(sale.observations)}\\n\`;
  }
  
  text += "\\n" + pad("Obrigado pela preferencia!", 32, 'center') + "\\n";
  text += "\\n\\n\\n\\n\\n\\n.\\n";
  
  const { ipcRenderer } = (window as any).require('electron');
  ipcRenderer.send('print-text', text);
  
  if (twoCopies) {
    if (window.confirm("Corte a 1ª via (Cliente) e clique em OK para imprimir a 2ª via (Chaveiro).")) {
      ipcRenderer.send('print-text', text);
    }
  }
};`;

content = content.substring(0, start) + newFunc + content.substring(end);
fs.writeFileSync(file, content);
