import Dexie from 'dexie';
import { importDB } from 'dexie-export-import';

export type RestoreErrorKind = 'authentication' | 'download' | 'format' | 'import';

export class BackupRestoreError extends Error {
  kind: RestoreErrorKind;

  constructor(kind: RestoreErrorKind, message: string) {
    super(message);
    this.name = 'BackupRestoreError';
    this.kind = kind;
  }
}

type ExportTable = { name: string; schema: string; rowCount: number };

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const parseBackup = async (downloaded: Blob): Promise<{ blob: Blob; value: unknown }> => {
  let value: unknown;
  try {
    value = JSON.parse(await downloaded.text());
  } catch {
    throw new BackupRestoreError('format', 'O arquivo baixado não contém JSON válido. Os dados locais foram preservados.');
  }

  if (isObject(value) && value.type === 'file' && value.encoding === 'none') {
    throw new BackupRestoreError('download', 'O GitHub não enviou o conteúdo RAW do backup. Os dados locais foram preservados.');
  }

  // Also accept the older GitHub Contents response for backups below 1 MB.
  if (isObject(value) && value.encoding === 'base64' && typeof value.content === 'string') {
    if (!value.content.trim()) {
      throw new BackupRestoreError('download', 'O GitHub retornou o backup sem conteúdo. Tente baixar novamente.');
    }
    try {
      const decoded = atob(value.content.replace(/\s/g, ''));
      const bytes = Uint8Array.from(decoded, character => character.charCodeAt(0));
      const blob = new Blob([bytes], { type: 'application/json' });
      return { blob, value: JSON.parse(await blob.text()) };
    } catch {
      throw new BackupRestoreError('format', 'O conteúdo Base64 do backup é inválido. Os dados locais foram preservados.');
    }
  }

  return { blob: downloaded, value };
};

export async function downloadBackupFromGitHub(
  repository: string,
  token: string,
  onProgress?: (percent: number) => void
): Promise<Blob> {
  const parts = repository.split('/');
  if (parts.length !== 2 || parts.some(part => !/^[\w.-]+$/.test(part))) {
    throw new BackupRestoreError('download', 'Informe o repositório no formato usuário/nome.');
  }

  const url = `https://api.github.com/repos/${parts.map(encodeURIComponent).join('/')}/contents/ichaveiro_backup.json`;
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.raw+json'
      },
      cache: 'no-store'
    });
  } catch {
    throw new BackupRestoreError('download', 'Falha de rede ao baixar o backup do GitHub. Os dados locais foram preservados.');
  }

  if (response.status === 401 || response.status === 403) {
    throw new BackupRestoreError('authentication', 'Falha de autenticação no GitHub. Verifique o token e a permissão de leitura do repositório.');
  }
  if (response.status === 404) {
    throw new BackupRestoreError('authentication', 'Backup não encontrado ou token sem acesso ao repositório privado. Os dados locais foram preservados.');
  }
  if (!response.ok) {
    throw new BackupRestoreError('download', `Falha ao baixar o backup do GitHub (HTTP ${response.status}). Os dados locais foram preservados.`);
  }

  try {
    if (!response.body) {
      const blob = await response.blob();
      if (blob.size === 0) throw new Error('empty');
      return blob;
    }

    const total = Number(response.headers.get('content-length'));
    const reader = response.body.getReader();
    const chunks: ArrayBuffer[] = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const copy = new Uint8Array(value.byteLength);
      copy.set(value);
      chunks.push(copy.buffer);
      received += value.byteLength;
      if (total > 0) onProgress?.(Math.min(99, Math.round(received / total * 100)));
    }
    if (received === 0) throw new Error('empty');
    return new Blob(chunks, { type: 'application/json' });
  } catch {
    throw new BackupRestoreError('download', 'O download do backup foi interrompido ou veio vazio. Os dados locais foram preservados.');
  }
}

export async function validateDexieBackup(downloaded: Blob, db: Dexie): Promise<{ blob: Blob; rowCounts: Map<string, number> }> {
  const { blob, value } = await parseBackup(downloaded);
  if (!isObject(value) || value.formatName !== 'dexie' || value.formatVersion !== 1 || !isObject(value.data)) {
    throw new BackupRestoreError('format', 'O arquivo não é um export Dexie compatível. Os dados locais foram preservados.');
  }

  const data = value.data;
  if (data.databaseName !== db.name || !Number.isInteger(data.databaseVersion) ||
      (data.databaseVersion as number) < 1 || (data.databaseVersion as number) > db.verno ||
      !Array.isArray(data.tables) || data.tables.length === 0 || !Array.isArray(data.data)) {
    throw new BackupRestoreError('format', 'O nome, a versão ou a estrutura do banco no backup é incompatível. Os dados locais foram preservados.');
  }

  const counts = new Map<string, number>();
  for (const candidate of data.tables) {
    if (!isObject(candidate) || typeof candidate.name !== 'string' || typeof candidate.schema !== 'string' ||
        !Number.isSafeInteger(candidate.rowCount) || (candidate.rowCount as number) < 0 || counts.has(candidate.name)) {
      throw new BackupRestoreError('format', 'A descrição das tabelas do backup é inválida. Os dados locais foram preservados.');
    }
    const destination = db.tables.find(table => table.name === candidate.name);
    if (!destination || candidate.schema.split(',')[0] !== destination.schema.primKey.src) {
      throw new BackupRestoreError('format', `A tabela ${candidate.name} é incompatível com este aplicativo. Os dados locais foram preservados.`);
    }
    counts.set(candidate.name, 0);
  }

  for (const candidate of data.data) {
    if (!isObject(candidate) || typeof candidate.tableName !== 'string' ||
        !counts.has(candidate.tableName) || candidate.inbound !== true || !Array.isArray(candidate.rows)) {
      throw new BackupRestoreError('format', 'Os registros do backup têm estrutura inválida. Os dados locais foram preservados.');
    }
    counts.set(candidate.tableName, counts.get(candidate.tableName)! + candidate.rows.length);
  }

  for (const candidate of data.tables as ExportTable[]) {
    if (counts.get(candidate.name) !== candidate.rowCount) {
      throw new BackupRestoreError('format', `A contagem de registros da tabela ${candidate.name} não confere. Os dados locais foram preservados.`);
    }
  }

  return { blob, rowCounts: new Map((data.tables as ExportTable[]).map(table => [table.name, table.rowCount])) };
}

export async function restoreDexieBackup(db: Dexie, blob: Blob): Promise<{ cleanupFailed: boolean }> {
  const validated = await validateDexieBackup(blob, db);
  const stagingName = `${db.name}-restore-${crypto.randomUUID()}`;
  let staging: Dexie | undefined;
  let cleanupFailed = false;
  try {
    try {
      staging = await importDB(validated.blob, { name: stagingName });
    } catch {
      throw new BackupRestoreError('format', 'Falha ao validar os registros Dexie do backup. Os dados locais foram preservados.');
    }

    const stagedRows = new Map<string, unknown[]>();
    try {
      for (const table of db.tables) {
        const source = staging.tables.find(candidate => candidate.name === table.name);
        const rows = source ? await source.toArray() : [];
        if (validated.rowCounts.has(table.name) && rows.length !== validated.rowCounts.get(table.name)) {
          throw new Error('staged row count differs');
        }
        stagedRows.set(table.name, rows);
      }
    } catch {
      throw new BackupRestoreError('format', 'Falha ao ler os registros do backup validado. Os dados locais foram preservados.');
    }

    try {
      await db.transaction('rw', db.tables, async () => {
        for (const table of db.tables) {
          await table.clear();
          const rows = stagedRows.get(table.name)!;
          if (rows.length > 0) await table.bulkAdd(rows);
        }
      });
    } catch {
      throw new BackupRestoreError('import', 'Falha na importação. A transação foi cancelada e os dados locais foram preservados.');
    }
  } finally {
    staging?.close();
    try {
      await Dexie.delete(stagingName);
    } catch {
      cleanupFailed = true;
    }
  }
  return { cleanupFailed };
}
