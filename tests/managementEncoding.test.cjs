const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('arquivos da Gerência estão em UTF-8 limpo e indicadores usam ícones Lucide', () => {
  const files = ['src/pages/Management.tsx', 'src/pages/ManagementAnalysis.tsx', 'src/pages/ManagementMovement.tsx', 'src/pages/ManagementFinance.tsx', 'src/pages/managementUi.ts', 'src/pages/management.css', 'src/db/managementSummary.ts', 'src/db/commercialClassification.ts', 'src/db/movementAnalysis.ts'];
  for (const file of files) {
    const contents = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    assert.doesNotMatch(contents, /(?:Ã.|Â.|â€|ï¿½|\uFFFD)/, `${file} contém sequência típica de mojibake`);
  }
  const dashboard = fs.readFileSync(path.join(__dirname, '..', 'src/pages/Management.tsx'), 'utf8');
  assert.match(dashboard, /Info, LayoutDashboard/);
  assert.doesNotMatch(dashboard, /ⓘ|â“˜/);
});
