import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, ShoppingCart, Users, FileText, Undo2, KeyRound, Package, History, Cloud, Download } from 'lucide-react';
import packageJson from '../../package.json';

export const Sidebar = () => {
  const [updateAvailable, setUpdateAvailable] = React.useState<{ version: string, url: string } | null>(null);

  React.useEffect(() => {
    const checkUpdate = async () => {
      try {
        const token = localStorage.getItem('github_token') || '';
        const headers: any = { 'Accept': 'application/vnd.github.v3+json' };
        if (token) headers['Authorization'] = `token ${token}`;

        const response = await fetch('https://api.github.com/repos/FabianoDiCorrea/iChaveiro/releases/latest', { headers });
        if (response.ok) {
          const data = await response.json();
          const latestVersion = data.tag_name.replace('v', '');
          const currentVersion = packageJson.version;
          
          if (latestVersion !== currentVersion && data.html_url) {
            const isNewer = (latest: string, current: string) => {
              const l = latest.split('.').map(Number);
              const c = current.split('.').map(Number);
              for (let i = 0; i < Math.max(l.length, c.length); i++) {
                const numL = l[i] || 0;
                const numC = c[i] || 0;
                if (numL > numC) return true;
                if (numL < numC) return false;
              }
              return false;
            };
            
            if (isNewer(latestVersion, currentVersion)) {
              setUpdateAvailable({ version: data.tag_name, url: data.html_url });
            }
          }
        }
      } catch (e) {
        console.error("Update check failed", e);
      }
    };
    checkUpdate();
  }, []);

  return (
    <div className="sidebar">
      <div className="p-6 flex items-center gap-2 border-b border-[var(--border)]">
        <KeyRound className="text-primary" size={32} />
        <div>
          <h1 className="font-bold text-xl text-primary leading-tight">iChaveiro</h1>
          <span className="text-xs text-muted tracking-wider">Gestão e Caixa</span>
        </div>
      </div>
      
      <nav className="flex-col flex mt-6 flex-1">
        <NavLink to="/" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} end>
          <LayoutDashboard size={20} />
          <span>Dashboard</span>
        </NavLink>
        <NavLink to="/caixa" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <ShoppingCart size={20} />
          <span>Caixa / PDV</span>
        </NavLink>
        <NavLink to="/estoque" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <Package size={20} />
          <span>Estoque</span>
        </NavLink>
        <NavLink to="/clientes" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <Users size={20} />
          <span>Clientes</span>
        </NavLink>
        <NavLink to="/relatorios" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <FileText size={20} />
          <span>Relatórios</span>
        </NavLink>
        <NavLink to="/historico" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <History size={20} />
          <span>Histórico de Vendas</span>
        </NavLink>
        <NavLink to="/devolucoes" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <Undo2 size={20} />
          <span>Devoluções</span>
        </NavLink>
        <NavLink to="/nuvem" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <Cloud size={20} />
          <span>Sincronizar Nuvem</span>
        </NavLink>
      </nav>

      <div className="p-4 border-t border-[var(--border)] text-center text-xs text-muted flex flex-col gap-2">
        {updateAvailable ? (
          <button 
            onClick={() => window.open(updateAvailable.url, '_blank')}
            className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 px-3 rounded-lg w-full transition-all"
            title="Baixar Nova Versão"
          >
            <Download size={16} />
            Baixar Atualização ({updateAvailable.version})
          </button>
        ) : (
          <div>v{packageJson.version}</div>
        )}
      </div>
    </div>
  );
};
