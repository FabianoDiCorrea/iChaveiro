const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { printedCustomerName } = require('../src/db/receiptIdentity.cjs');

test('nome impresso prioriza nome/empresa, usa retirada como alternativa e ignora espaços', () => {
  assert.equal(printedCustomerName('', ''), undefined);
  assert.equal(printedCustomerName('Empresa', ''), 'Empresa');
  assert.equal(printedCustomerName('', 'Cliente'), 'Cliente');
  assert.equal(printedCustomerName('Empresa', 'Cliente'), 'Empresa');
  assert.equal(printedCustomerName('   ', '  Cliente  '), 'Cliente');
  assert.equal(printedCustomerName('  Empresa  ', '  Cliente  '), 'Empresa');
});

test('cupom preserva a identidade impressa e posiciona o instagram após o agradecimento', () => {
  const source = fs.readFileSync(require.resolve('../src/pages/Pos.tsx'), 'utf8');
  assert.match(source, /clientName: printedClientName \|\| undefined/);
  const receiptStart = source.indexOf('const html = `', source.indexOf('// Imprimir Cupom'));
  const receipt = source.slice(receiptStart, source.indexOf('</body>', receiptStart));
  assert.match(receipt, /Insta - @chaveiroecutelaria\.lidio\.rj/);
  assert.match(receipt, /Obrigado pela preferência!<\/div>\s*<div class="text-center"[^>]*>Insta - @chaveiroecutelaria\.lidio\.rj<\/div>\s*<div class="text-left"[^>]*>\.<\/div>/);
  assert.match(source, /printedClientName \? `<div class="divider"><\/div><div class="bold">Cliente: \$\{printedClientName\}<\/div>`/);
  const beforeHeader = receipt.slice(0, receipt.indexOf('Chaveiro & Cutelaria'));
  const afterThanks = receipt.slice(receipt.indexOf('Obrigado pela preferência!'));
  assert.ok(!beforeHeader.includes('Insta - @chaveiroecutelaria.lidio.rj'));
  assert.equal((beforeHeader.match(/font-size: 10px; margin-left: 5px;">\.<\/div>/g) || []).length, 5);
  assert.equal((afterThanks.match(/font-size: 10px; margin-left: 5px;">\.<\/div>/g) || []).length, 8);
});
