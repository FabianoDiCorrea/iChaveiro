import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, ShoppingCart, Users, FileText, Undo2, KeyRound, Package, History } from 'lucide-react';

export const Sidebar = () => {
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
      </nav>
    </div>
  );
};
