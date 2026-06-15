import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Client } from '../db/db';
import { Search, Plus, Edit2, Trash2 } from 'lucide-react';

export const Clients = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    address: '',
    code: ''
  });

  const clients = useLiveQuery(
    () => {
      if (searchTerm) {
        return db.clients.filter(c => 
          c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
          c.code.toLowerCase().includes(searchTerm.toLowerCase())
        ).toArray();
      }
      return db.clients.toArray();
    },
    [searchTerm]
  );

  const handleOpenModal = (client?: Client) => {
    if (client) {
      setEditingClient(client);
      setFormData({ name: client.name, phone: client.phone, address: client.address, code: client.code });
    } else {
      setEditingClient(null);
      setFormData({ name: '', phone: '', address: '', code: '' });
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) return alert('Nome é obrigatório');

    try {
      if (editingClient?.id) {
        await db.clients.update(editingClient.id, { ...formData });
      } else {
        await db.clients.add({ ...formData, createdAt: new Date() });
      }
      setIsModalOpen(false);
    } catch (error) {
      console.error(error);
      alert('Erro ao salvar cliente.');
    }
  };

  const handleDelete = async (id: number) => {
    if (window.confirm('Tem certeza que deseja excluir este cliente?')) {
      await db.clients.delete(id);
    }
  };

  return (
    <div className="flex flex-col h-full animate-fade-in">
      <div className="page-header flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Clientes</h1>
          <p className="text-muted">Gerencie o cadastro de clientes e códigos (Pacotes)</p>
        </div>
        <button className="btn btn-primary" onClick={() => handleOpenModal()}>
          <Plus size={20} /> Novo Cliente
        </button>
      </div>

      <div className="glass-panel p-6 flex-1 flex flex-col min-h-0">
        <div className="mb-4 flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={20} />
            <input 
              type="text" 
              className="input pl-10" 
              placeholder="Buscar por nome ou código..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-[var(--bg-surface)] sticky top-0">
              <tr className="border-b border-[var(--border)] text-muted text-sm">
                <th className="py-3 px-4 font-medium">Código</th>
                <th className="py-3 px-4 font-medium">Nome</th>
                <th className="py-3 px-4 font-medium">Telefone/WhatsApp</th>
                <th className="py-3 px-4 font-medium">Endereço (Entrega)</th>
                <th className="py-3 px-4 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {clients?.map((client) => (
                <tr key={client.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-surface-hover)]">
                  <td className="py-3 px-4 font-bold text-accent">{client.code || '-'}</td>
                  <td className="py-3 px-4 font-medium">{client.name}</td>
                  <td className="py-3 px-4 text-sm text-muted">{client.phone || '-'}</td>
                  <td className="py-3 px-4 text-sm text-muted">{client.address || '-'}</td>
                  <td className="py-3 px-4 text-right">
                    <button className="p-2 text-muted hover:text-primary transition-colors" onClick={() => handleOpenModal(client)}>
                      <Edit2 size={18} />
                    </button>
                    <button className="p-2 text-muted hover:text-danger transition-colors ml-2" onClick={() => client.id && handleDelete(client.id)}>
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
              ))}
              {clients?.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-muted">Nenhum cliente encontrado.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in p-4">
          <div className="glass-panel w-full max-w-md p-6">
            <h2 className="text-xl font-bold mb-4">{editingClient ? 'Editar Cliente' : 'Novo Cliente'}</h2>
            <form onSubmit={handleSave} className="flex flex-col gap-4">
              <div>
                <label className="label">Nome Completo *</label>
                <input 
                  type="text" 
                  className="input" 
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Código (Pacote)</label>
                  <input 
                    type="text" 
                    className="input" 
                    placeholder="Ex: A12"
                    value={formData.code}
                    onChange={e => setFormData({ ...formData, code: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label">Telefone/WhatsApp</label>
                  <input 
                    type="text" 
                    className="input" 
                    value={formData.phone}
                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="label">Endereço (Para entrega)</label>
                <textarea 
                  className="input resize-none h-24" 
                  value={formData.address}
                  onChange={e => setFormData({ ...formData, address: e.target.value })}
                />
              </div>
              <div className="flex gap-2 justify-end mt-4">
                <button type="button" className="btn btn-outline" onClick={() => setIsModalOpen(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Salvar</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
