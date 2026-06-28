const fs = require('fs');
const file = 'src/pages/Pos.tsx';
let content = fs.readFileSync(file, 'utf8');

const start = content.indexOf('const printClosingReceipt = () => {');
const end = content.indexOf('};', start) + 2;

const newFunc = `const printClosingReceipt = () => {
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
  text += pad("FECHAMENTO DE CAIXA", 32, 'center') + "\\n";
  text += "-".repeat(32) + "\\n";
  text += \`Data: \${new Date().toLocaleString('pt-BR')}\\n\`;
  text += \`Operador: \${removeAccents(currentProfile)}\\n\`;
  text += "-".repeat(32) + "\\n";
  
  text += pad("Fundo de Caixa:", 20) + pad(formatCurrency(openingBalance), 12, 'right') + "\\n";
  text += "\\n";
  text += pad("Vendas (Dinheiro):", 20) + pad(formatCurrency(salesCash), 12, 'right') + "\\n";
  text += pad("Vendas (Pix):", 20) + pad(formatCurrency(salesPix), 12, 'right') + "\\n";
  text += pad("Vendas (Debito):", 20) + pad(formatCurrency(salesDebit), 12, 'right') + "\\n";
  text += pad("Vendas (Credito):", 20) + pad(formatCurrency(salesCredit), 12, 'right') + "\\n";
  text += "-".repeat(32) + "\\n";
  
  text += pad("Total Entradas:", 20) + pad(formatCurrency(totalEntradas), 12, 'right') + "\\n";
  text += pad("Total Retiradas:", 20) + pad(formatCurrency(totalRetiradas), 12, 'right') + "\\n";
  text += pad("Total Perdas:", 20) + pad(formatCurrency(totalPerdas), 12, 'right') + "\\n";
  text += pad("Lucro do Dia:", 20) + pad(formatCurrency(lucro), 12, 'right') + "\\n";
  text += "-".repeat(32) + "\\n";
  
  text += pad("TOTAL CAIXA ESPERADO:", 22) + pad(formatCurrency(totalEsperado), 10, 'right') + "\\n";
  text += pad("TOTAL CAIXA REAL:", 22) + pad(formatCurrency(closingBalance), 10, 'right') + "\\n";
  
  text += "-".repeat(32) + "\\n";
  text += pad("Diferenca:", 20) + pad(formatCurrency(closingBalance - totalEsperado), 12, 'right') + "\\n";
  
  text += "\\n\\n\\n\\n\\n\\n.\\n";
  
  const { ipcRenderer } = (window as any).require('electron');
  ipcRenderer.send('print-text', text);
};`;

content = content.substring(0, start) + newFunc + content.substring(end);
fs.writeFileSync(file, content);
