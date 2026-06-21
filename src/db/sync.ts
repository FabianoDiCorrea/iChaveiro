import { db } from './db';
import { exportDB } from 'dexie-export-import';

export const runAutoBackup = async () => {
  const token = localStorage.getItem('github_token') || '';
  const repo = localStorage.getItem('github_repo') || '';
  
  if (!token || !repo) {
    console.log("Backup automático ignorado: token ou repo não configurados.");
    return false;
  }

  let cleanRepo = repo.trim();
  if (cleanRepo.startsWith('https://github.com/')) {
    cleanRepo = cleanRepo.replace('https://github.com/', '');
  }
  if (cleanRepo.endsWith('/')) {
    cleanRepo = cleanRepo.slice(0, -1);
  }

  try {
    const blob = await exportDB(db, {
      progressCallback: () => {}
    });
    
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    
    return new Promise((resolve) => {
      reader.onloadend = async () => {
        const base64data = (reader.result as string).split(',')[1];
        
        let sha = null;
        try {
          const res = await fetch(`https://api.github.com/repos/${cleanRepo}/contents/ichaveiro_backup.json`, {
            headers: {
              'Authorization': `token ${token}`,
              'Accept': 'application/vnd.github.v3+json'
            }
          });
          if (res.ok) {
            const data = await res.json();
            sha = data.sha;
          }
        } catch (e) {}

        const body = JSON.stringify({
          message: `Auto Backup iChaveiro - Fechamento de Caixa - ${new Date().toLocaleString('pt-BR')}`,
          content: base64data,
          ...(sha ? { sha } : {})
        });

        try {
          const uploadRes = await fetch(`https://api.github.com/repos/${cleanRepo}/contents/ichaveiro_backup.json`, {
            method: 'PUT',
            headers: {
              'Authorization': `token ${token}`,
              'Accept': 'application/vnd.github.v3+json',
              'Content-Type': 'application/json'
            },
            body
          });
          
          if (uploadRes.ok) {
            const newEntry = { date: new Date().toISOString(), type: 'Enviado' };
            const savedHistory = localStorage.getItem('ichaveiro_backup_history');
            let history = [];
            if (savedHistory) {
              try { history = JSON.parse(savedHistory); } catch (e) {}
            }
            const updated = [newEntry, ...history].slice(0, 5);
            localStorage.setItem('ichaveiro_backup_history', JSON.stringify(updated));
            console.log("Backup automático realizado com sucesso.");
            resolve(true);
          } else {
            console.error("Backup automático falhou ao enviar para o GitHub.");
            resolve(false);
          }
        } catch (e) {
          console.error("Backup automático erro de rede.");
          resolve(false);
        }
      };
    });
  } catch (error) {
    console.error("Auto backup failed to export db:", error);
    return false;
  }
};
