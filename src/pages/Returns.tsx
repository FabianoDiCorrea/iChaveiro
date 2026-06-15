import React, { useState } from 'react';
import { db, type PaymentMethod } from '../db/db';
import type { Profile } from '../db/db';
import { Undo2, Banknote, CreditCard, Smartphone } from 'lucide-react';

export const Returns = () => {
  const [transactionProfile, setTransactionProfile] = useState<Profile>('chaveiro');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState<number | ''>('');
  const [returnMethod, setReturnMethod] = useState<PaymentMethod>('cash');
  const [originalMethod, setOriginalMethod] = useState<PaymentMethod | ''>('');

  const handleReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || amount <= 0) return alert('Insira um valor válido.');
    if (!description) return alert('Insira uma descrição para a devolução.');

    try {
      await db.transactions.add({
        profile: transactionProfile,
        type: 'return',
        items: [{ service: 'other', name: `Devolução: ${description}`, quantity: 1, price: Number(amount), cost: 0, total: Number(amount) }],
        total: Number(amount),
        paymentMethod: returnMethod, // How the money is being returned
        date: new Date()
      });
      alert('Devolução registrada com sucesso!');
      setDescription('');
      setAmount('');
      setReturnMethod('cash');
      setOriginalMethod('');
    } catch (error) {
      console.error(error);
      alert('Erro ao registrar devolução.');
    }
  };

  return (
    <div className="flex flex-col h-full animate-fade-in">
      <div className="page-header">
        <h1 className="text-2xl font-bold">Devoluções</h1>
        <p className="text-muted">Registre devoluções de dinheiro para clientes</p>
      </div>

      <div className="glass-panel p-8 max-w-xl mx-auto w-full mt-8">
        <div className="flex items-center gap-4 mb-6 pb-6 border-b border-[var(--border)]">
          <div className="bg-danger/20 p-4 rounded-full text-danger">
            <Undo2 size={32} />
          </div>
          <div>
            <h2 className="text-xl font-bold">Nova Devolução</h2>
            <p className="text-sm text-muted">O valor será subtraído do caixa do dia.</p>
          </div>
        </div>

        <form onSubmit={handleReturn} className="flex flex-col gap-5">
          <div>
            <label className="label">Perfil da Devolução (De quem será descontado)</label>
            <select 
              className="input font-bold text-primary"
              value={transactionProfile}
              onChange={e => setTransactionProfile(e.target.value as Profile)}
            >
              <option value="chaveiro">Chaveiro</option>
              <option value="fabiano">Fabiano</option>
            </select>
          </div>

          <div>
            <label className="label">Descrição do Motivo / Serviço</label>
            <input 
              type="text" 
              className="input" 
              placeholder="Ex: Alicate não ficou bom, Chave não abriu..." 
              value={description}
              onChange={e => setDescription(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="label">Valor a Devolver (R$)</label>
            <input 
              type="number" 
              step="0.01" 
              min="0.01"
              className="input text-lg font-bold" 
              placeholder="0.00"
              value={amount}
              onChange={e => setAmount(Number(e.target.value))}
              required
            />
          </div>

          <div>
            <label className="label">Forma que o cliente havia pago (Opcional - para controle)</label>
            <select 
              className="input text-sm" 
              value={originalMethod} 
              onChange={e => setOriginalMethod(e.target.value as PaymentMethod | '')}
            >
              <option value="">Não lembro / Não informar</option>
              <option value="cash">Dinheiro</option>
              <option value="debit">Débito</option>
              <option value="credit">Crédito</option>
              <option value="pix">PIX</option>
            </select>
          </div>

          <div>
            <label className="label">Como o dinheiro está sendo devolvido agora?</label>
            <div className="grid grid-cols-2 gap-2">
              <button 
                type="button"
                className={`btn py-2 text-sm ${returnMethod === 'cash' ? 'btn-primary' : 'btn-outline'}`}
                onClick={() => setReturnMethod('cash')}
              >
                <Banknote size={16} /> Dinheiro Caixa
              </button>
              <button 
                type="button"
                className={`btn py-2 text-sm ${returnMethod === 'pix' ? 'btn-success text-white border-none' : 'btn-outline'}`}
                onClick={() => setReturnMethod('pix')}
              >
                <Smartphone size={16} /> PIX (Transferência)
              </button>
            </div>
          </div>

          <button type="submit" className="btn btn-danger w-full text-lg py-3 mt-4">
            Confirmar Devolução
          </button>
        </form>
      </div>
    </div>
  );
};
