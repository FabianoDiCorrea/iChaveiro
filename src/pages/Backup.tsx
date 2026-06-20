import React, { useState, useEffect } from 'react';
import { db } from '../db/db';
import { exportDB, importInto } from 'dexie-export-import';
import { Cloud, UploadCloud, DownloadCloud, CheckCircle, AlertCircle, Save, History } from 'lucide-react';

export const Backup = () => {
  const [token, setToken] = useState('');
  const [repo, setRepo] = useState('');
  const [status, setStatus] = useState<{ type: 'idle' | 'loading' | 'success' | 'error'; message: string }>({ type: 'idle', message: '' });
  const [progress, setProgress] = useState<number>(0);
  const [showConfig, setShowConfig] = useState(false);
  const [backupHistory, setBackupHistory] = useState<{ date: string, type: 'Enviado' | 'Restaurado' }[]>([]);

  useEffect(() => {
    const savedToken = localStorage.getItem('github_token') || '';
    const savedRepo = localStorage.getItem('github_repo') || '';
    setToken(savedToken);
    setRepo(savedRepo);

    const savedHistory = localStorage.getItem('ichaveiro_backup_history');
    if (savedHistory) {
      try {
        setBackupHistory(JSON.parse(savedHistory));
      } catch (e) {}
    }
  }, []);

  const addToHistory = (type: 'Enviado' | 'Restaurado') => {
    const newEntry = { date: new Date().toISOString(), type };
    setBackupHistory(prev => {
      const updated = [newEntry, ...prev].slice(0, 5);
      localStorage.setItem('ichaveiro_backup_history', JSON.stringify(updated));
      return updated;
    });
  };

  const saveConfig = () => {
    localStorage.setItem('github_token', token);
    localStorage.setItem('github_repo', repo);
    setStatus({ type: 'success', message: 'Configurações salvas com sucesso!' });
    setTimeout(() => setStatus({ type: 'idle', message: '' }), 3000);
  };

  const getCleanRepo = () => {
    let clean = repo.trim();
    if (clean.startsWith('https://github.com/')) {
      clean = clean.replace('https://github.com/', '');
    }
    if (clean.endsWith('/')) {
      clean = clean.slice(0, -1);
    }
    return clean;
  };

  const getFileSha = async (cleanRepo: string) => {
    try {
      const response = await fetch(`https://api.github.com/repos/${cleanRepo}/contents/ichaveiro_backup.json`, {
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });
      if (response.ok) {
        const data = await response.json();
        return data.sha;
      }
      return null;
    } catch (e) {
      return null;
    }
  };

  const uploadToGitHub = (base64data: string, sha: string | null, cleanRepo: string) => {
    return new Promise((resolve, reject) => {
      const body = JSON.stringify({
        message: `Backup iChaveiro - ${new Date().toLocaleString('pt-BR')}`,
        content: base64data,
        ...(sha ? { sha } : {})
      });

      const xhr = new XMLHttpRequest();
      xhr.open('PUT', `https://api.github.com/repos/${cleanRepo}/contents/ichaveiro_backup.json`);
      xhr.setRequestHeader('Authorization', `token ${token}`);
      xhr.setRequestHeader('Accept', 'application/vnd.github.v3+json');
      xhr.setRequestHeader('Content-Type', 'application/json');

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const percentComplete = Math.round((e.loaded / e.total) * 100);
          setProgress(percentComplete);
          setStatus({ type: 'loading', message: `Enviando para a Nuvem: ${percentComplete}%` });
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText));
        } else {
          try {
            reject(new Error(JSON.parse(xhr.responseText).message || 'Erro desconhecido'));
          } catch(e) {
            reject(new Error('Erro na resposta do servidor'));
          }
        }
      };

      xhr.onerror = () => reject(new Error('Erro de rede ao conectar com GitHub'));
      xhr.send(body);
    });
  };

  const downloadFromGitHub = (cleanRepo: string): Promise<any> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', `https://api.github.com/repos/${cleanRepo}/contents/ichaveiro_backup.json`);
      xhr.setRequestHeader('Authorization', `token ${token}`);
      xhr.setRequestHeader('Accept', 'application/vnd.github.v3+json');

      xhr.onprogress = (e) => {
        if (e.lengthComputable) {
          const percentComplete = Math.round((e.loaded / e.total) * 100);
          setProgress(percentComplete);
          setStatus({ type: 'loading', message: `Baixando da Nuvem: ${percentComplete}%` });
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText));
        } else {
          try {
            reject(new Error(JSON.parse(xhr.responseText).message || 'Erro desconhecido'));
          } catch(e) {
            reject(new Error('Erro na resposta do servidor'));
          }
        }
      };

      xhr.onerror = () => reject(new Error('Erro de rede ao conectar com GitHub'));
      xhr.send();
    });
  };

  const handleBackup = async () => {
    if (!token || !repo) {
      setStatus({ type: 'error', message: 'Preencha o Token e o Repositório antes de fazer o backup.' });
      return;
    }

    const cleanRepo = getCleanRepo();
    setProgress(0);
    setStatus({ type: 'loading', message: 'Exportando banco de dados local...' });
    
    try {
      const blob = await exportDB(db, {
        progressCallback: ({ totalRows, completedRows }) => {
          if (totalRows > 0) {
            const p = Math.round((completedRows / totalRows) * 100);
            setProgress(p);
            setStatus({ type: 'loading', message: `Preparando dados locais: ${p}%` });
          }
        }
      });
      
      setProgress(0);
      setStatus({ type: 'loading', message: 'Compactando dados...' });
      
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = async () => {
        const base64data = (reader.result as string).split(',')[1];
        
        setStatus({ type: 'loading', message: 'Verificando nuvem...' });
        const sha = await getFileSha(cleanRepo);
        
        setProgress(0);
        setStatus({ type: 'loading', message: 'Iniciando envio...' });
        
        await uploadToGitHub(base64data, sha, cleanRepo);
        
        addToHistory('Enviado');
        setProgress(100);
        setStatus({ type: 'success', message: 'Backup enviado para a Nuvem com sucesso!' });
      };
    } catch (error: any) {
      console.error(error);
      setProgress(0);
      setStatus({ type: 'error', message: `Erro ao exportar/salvar: ${error.message || 'Desconhecido'}` });
    }
  };

  const handleRestore = async () => {
    if (!token || !repo) {
      setStatus({ type: 'error', message: 'Preencha o Token e o Repositório antes de restaurar o backup.' });
      return;
    }

    if (!window.confirm('ATENÇÃO: A restauração vai APAGAR os dados atuais e substituir pelo backup da nuvem. Tem certeza?')) {
      return;
    }

    const cleanRepo = getCleanRepo();
    setProgress(0);
    setStatus({ type: 'loading', message: 'Conectando com GitHub...' });

    try {
      const data = await downloadFromGitHub(cleanRepo);
      const contentBase64 = data.content.replace(/\n/g, '');
      
      setProgress(0);
      setStatus({ type: 'loading', message: 'Descompactando banco de dados...' });
      
      const byteCharacters = atob(contentBase64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'application/json' });

      await db.delete();
      await db.open();

      setProgress(0);
      setStatus({ type: 'loading', message: 'Restaurando dados locais...' });
      
      await importInto(db, blob, {
        clearTablesBeforeImport: true,
        progressCallback: ({ totalRows, completedRows }) => {
          if (totalRows > 0) {
            const p = Math.round((completedRows / totalRows) * 100);
            setProgress(p);
            setStatus({ type: 'loading', message: `Restaurando dados: ${p}%` });
          }
        }
      });

      addToHistory('Restaurado');
      setProgress(100);
      setStatus({ type: 'success', message: 'Backup restaurado com sucesso! Seus dados estão sincronizados.' });
    } catch (error: any) {
      console.error(error);
      setProgress(0);
      setStatus({ type: 'error', message: `Erro ao restaurar dados: ${error.message || 'Desconhecido'}` });
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Sincronização na Nuvem</h1>
        <button 
          onClick={() => setShowConfig(!showConfig)}
          className="p-2 bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] rounded-full transition-colors"
          title="Configurações"
        >
          <Cloud className="h-6 w-6 text-primary" />
        </button>
      </div>

      {showConfig && (
        <div className="glass-panel p-6 animate-fade-in">
          <h2 className="text-lg font-bold mb-4">Configuração de Conexão</h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Token de Acesso (Personal Access Token)
            </label>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="w-full px-4 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Repositório (Usuário/NomeDoRepositorio)
            </label>
            <input
              type="text"
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
              className="w-full px-4 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="FabianoDiCorrea/iChaveiro-Backups"
            />
          </div>

          <button
            onClick={saveConfig}
            className="flex items-center px-4 py-2 bg-primary text-black font-bold rounded-lg hover:brightness-110 transition-colors"
          >
            <Save className="h-4 w-4 mr-2" />
            Salvar Credenciais
          </button>
        </div>
      </div>
      )}

      {status.type !== 'idle' && (
        <div className={`p-4 rounded-lg flex flex-col ${
          status.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' :
          status.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' :
          'bg-blue-50 text-blue-700 border border-blue-200'
        }`}>
          <div className="flex items-center">
            {status.type === 'error' ? <AlertCircle className="h-5 w-5 mr-2" /> : 
             status.type === 'success' ? <CheckCircle className="h-5 w-5 mr-2" /> : 
             <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-700 mr-2" />}
            <span className="font-medium">{status.message}</span>
          </div>
          
          {status.type === 'loading' && progress > 0 && (
            <div className="mt-3 w-full bg-blue-200 rounded-full h-2.5">
              <div 
                className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" 
                style={{ width: `${progress}%` }}
              ></div>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <button
          onClick={handleBackup}
          disabled={status.type === 'loading'}
          className="glass-panel p-8 flex flex-col items-center text-center transition-all cursor-pointer disabled:opacity-50"
          style={{ border: '2px solid transparent' }}
          onMouseOver={(e) => e.currentTarget.style.borderColor = 'var(--success)'}
          onMouseOut={(e) => e.currentTarget.style.borderColor = 'transparent'}
        >
          <div className="rounded-full flex items-center justify-center mb-6" style={{ width: '96px', height: '96px', backgroundColor: 'rgba(16, 185, 129, 0.15)' }}>
            <UploadCloud style={{ width: '48px', height: '48px', color: 'var(--success)' }} />
          </div>
          <h3 className="text-2xl font-bold mb-2 text-success" style={{ textTransform: 'uppercase' }}>Enviar para Nuvem</h3>
          <p className="text-muted text-sm" style={{ color: 'var(--text-main)' }}>
            Salva os dados de clientes, estoque e vendas.
          </p>
        </button>

        <button
          onClick={handleRestore}
          disabled={status.type === 'loading'}
          className="glass-panel p-8 flex flex-col items-center text-center transition-all cursor-pointer disabled:opacity-50"
          style={{ border: '2px solid transparent' }}
          onMouseOver={(e) => e.currentTarget.style.borderColor = 'var(--danger)'}
          onMouseOut={(e) => e.currentTarget.style.borderColor = 'transparent'}
        >
          <div className="rounded-full flex items-center justify-center mb-6" style={{ width: '96px', height: '96px', backgroundColor: 'rgba(239, 68, 68, 0.15)' }}>
            <DownloadCloud style={{ width: '48px', height: '48px', color: 'var(--danger)' }} />
          </div>
          <h3 className="text-2xl font-bold mb-2 text-danger" style={{ textTransform: 'uppercase' }}>Puxar da Nuvem</h3>
          <p className="text-muted text-sm" style={{ color: 'var(--text-main)' }}>
            Restaura o último backup salvo. (Apaga dados atuais).
          </p>
        </button>
      </div>

      {backupHistory.length > 0 && (
        <div className="glass-panel p-6 animate-fade-in mt-6">
          <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
            <History style={{ width: '24px', height: '24px', color: 'var(--primary)' }} />
            Últimos Backups (Histórico)
          </h3>
          <div className="flex-col" style={{ gap: '12px' }}>
            {backupHistory.map((h, i) => (
              <div key={i} className="flex items-center justify-between rounded p-3" style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)' }}>
                <div className="flex items-center gap-2">
                  {h.type === 'Enviado' ? (
                    <UploadCloud style={{ width: '20px', height: '20px', color: 'var(--success)' }} />
                  ) : (
                    <DownloadCloud style={{ width: '20px', height: '20px', color: 'var(--danger)' }} />
                  )}
                  <span className="font-semibold text-sm">
                    {h.type === 'Enviado' ? 'Backup Enviado (Salvo)' : 'Backup Restaurado (Puxado)'}
                  </span>
                </div>
                <span className="text-muted text-sm" style={{ fontFamily: 'monospace' }}>
                  {new Date(h.date).toLocaleString('pt-BR')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
