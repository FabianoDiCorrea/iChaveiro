import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Employee } from '../db/db';
import { Users, Plus, Trash2, Edit2, X, UserCheck, UserMinus } from 'lucide-react';

export const Employees = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  
  const [name, setName] = useState('');
  const [dailyWage, setDailyWage] = useState('');
  const [active, setActive] = useState(true);

  const employees = useLiveQuery(() => db.employees.toArray());

  const resetForm = () => {
    setName('');
    setDailyWage('');
    setActive(true);
    setEditingId(null);
    setIsModalOpen(false);
  };

  const handleSave = async () => {
    if (!name.trim() || !dailyWage) {
      alert("Preencha o nome e o valor da diária.");
      return;
    }

    const wage = parseFloat(dailyWage.replace(',', '.'));
    
    if (editingId) {
      await db.employees.update(editingId, { name, dailyWage: wage, active });
    } else {
      await db.employees.add({ name, dailyWage: wage, active, createdAt: new Date() });
    }
    resetForm();
  };

  const handleEdit = (emp: Employee) => {
    setEditingId(emp.id!);
    setName(emp.name);
    setDailyWage(emp.dailyWage.toString().replace('.', ','));
    setActive(emp.active);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (window.confirm("Deseja mesmo excluir este funcionário?")) {
      await db.employees.delete(id);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Funcionários / Diárias</h1>
          <p className="text-muted">Gerencie os pagamentos diários da equipe.</p>
        </div>
        <button 
          onClick={() => { resetForm(); setIsModalOpen(true); }}
          className="btn btn-primary flex items-center gap-2"
        >
          <Plus size={20} /> Novo Funcionário
        </button>
      </div>

      <div className="glass-panel overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead className="bg-[var(--bg-surface)]">
            <tr className="text-muted text-sm border-b border-[var(--border)]">
              <th className="p-4 font-medium">Nome</th>
              <th className="p-4 font-medium">Valor da Diária</th>
              <th className="p-4 font-medium">Status</th>
              <th className="p-4 font-medium text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {employees?.map((emp) => (
              <tr key={emp.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-surface-hover)]">
                <td className="p-4 font-bold" style={{ color: 'white' }}>{emp.name}</td>
                <td className="p-4 font-bold" style={{ color: 'var(--success)' }}>R$ {emp.dailyWage.toFixed(2).replace('.', ',')}</td>
                <td className="p-4">
                  {emp.active ? (
                    <span className="flex items-center gap-1 text-xs font-bold" style={{ color: 'var(--success)' }}><UserCheck size={14}/> Ativo</span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs font-bold" style={{ color: 'var(--danger)' }}><UserMinus size={14}/> Inativo</span>
                  )}
                </td>
                <td className="p-4 text-right">
                  <button onClick={() => handleEdit(emp)} className="p-2 rounded mr-2" style={{ color: '#3b82f6' }} title="Editar"><Edit2 size={18}/></button>
                  <button onClick={() => handleDelete(emp.id!)} className="p-2 rounded" style={{ color: '#ef4444' }} title="Excluir"><Trash2 size={18}/></button>
                </td>
              </tr>
            ))}
            {employees?.length === 0 && (
              <tr><td colSpan={4} className="p-8 text-center text-muted">Nenhum funcionário cadastrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div 
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0, 0, 0, 0.85)', backdropFilter: 'blur(4px)' }}
          className="p-4"
        >
          <div className="bg-[var(--bg-surface)] w-full max-w-md rounded-2xl border-2 border-[var(--primary)] shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-[var(--border)] flex justify-between items-center bg-black/40">
              <h2 className="font-bold text-lg flex items-center gap-2" style={{ color: 'white' }}><Users style={{ color: 'var(--primary)' }}/> {editingId ? 'Editar Funcionário' : 'Novo Funcionário'}</h2>
              <button onClick={resetForm} className="p-1 hover:bg-white/10 rounded-full" style={{ color: 'white' }}><X size={20}/></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="label" style={{ color: 'white' }}>Nome</label>
                <input type="text" className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Fabiano Jr" style={{ color: 'white' }} />
              </div>
              <div>
                <label className="label" style={{ color: 'white' }}>Valor da Diária (R$)</label>
                <input type="number" className="input" value={dailyWage} onChange={e => setDailyWage(e.target.value)} placeholder="0.00" step="0.01" min="0" style={{ color: 'white', fontWeight: 'bold' }} />
              </div>
              <div className="flex items-center gap-2 mt-4" style={{ cursor: 'pointer' }} onClick={() => setActive(!active)}>
                <input type="checkbox" id="active" checked={active} onChange={() => {}} className="w-5 h-5" />
                <label className="font-bold cursor-pointer" style={{ color: 'white' }}>Funcionário Ativo (Aparece no fechamento)</label>
              </div>
            </div>
            <div className="p-4 border-t border-[var(--border)] bg-black/30 flex justify-end gap-3">
              <button onClick={resetForm} className="btn btn-outline">Cancelar</button>
              <button onClick={handleSave} className="btn btn-primary">Salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
