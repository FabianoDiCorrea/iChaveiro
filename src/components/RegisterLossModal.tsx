import React, { useState, useEffect } from 'react';
import { db } from '../db/db';
import type { Profile } from '../db/db';
import { X, AlertTriangle, RefreshCcw } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  activeProfile: Profile;
}

export function RegisterLossModal({ isOpen, onClose, activeProfile }: Props) {
  const [code, setCode] = useState('');
  const [qty, setQty] = useState(1);
  const [lossType, setLossType] = useState<'error' | 'return'>('error');
  const [notes, setNotes] = useState('');
  
  const product = useLiveQuery(
    () => db.products.where('code').equals(code).and(p => p.profile === activeProfile).first(),
    [code, activeProfile]
  );

  useEffect(() => {
    if (isOpen) {
      setCode('');
      setQty(1);
      setLossType('error');
      setNotes('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleRegister = async () => {
    if (!product || !product.id) return;
    
    // Add loss record
    await db.losses.add({
      date: new Date(),
      productId: product.id,
      productCode: product.code || '',
      productName: product.name,
      quantity: qty,
      type: lossType,
      operator: activeProfile,
      notes: notes
    });
    
    // Decrease stock
    if (product.hasStock && product.stock !== undefined) {
      await db.products.update(product.id, {
        stock: product.stock - qty
      });
    }
    
    onClose();
  };

  return (
    <div 
      style={{ 
        position: 'fixed', 
        top: 0, 
        left: 0, 
        right: 0, 
        bottom: 0, 
        zIndex: 9999, 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.85)', 
        backdropFilter: 'blur(4px)',
        padding: '16px'
      }}
    >
      <div 
        style={{ 
          backgroundColor: '#1e293b', 
          border: '2px solid #ef4444', 
          borderRadius: '16px', 
          maxWidth: '450px', 
          width: '100%', 
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)', 
          display: 'flex', 
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        <div style={{ backgroundColor: '#dc2626', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'white' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 900, margin: 0, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={24} /> Registrar Perda
          </h2>
          <button onClick={onClose} style={{ color: 'white', background: 'transparent', border: 'none', cursor: 'pointer' }}>
            <X size={24} />
          </button>
        </div>
        
        {/* Body */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <label style={{ fontSize: '0.875rem', fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Código do Produto</label>
            <input 
              type="text" 
              autoFocus
              style={{ width: '100%', boxSizing: 'border-box', backgroundColor: '#0f172a', border: '1px solid #475569', borderRadius: '8px', padding: '12px', fontSize: '1.25rem', fontWeight: 'bold', color: 'white', outline: 'none' }}
              value={code}
              onChange={e => setCode(e.target.value)}
              placeholder="Ex: 543"
            />
          </div>

          {product && (
            <div style={{ backgroundColor: '#0f172a', border: '1px solid #334155', padding: '12px', borderRadius: '8px', display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 'bold' }}>Produto Encontrado:</span>
              <span style={{ fontSize: '1.125rem', fontWeight: 900, color: 'white' }}>{product.name}</span>
              <span style={{ fontSize: '0.875rem', fontWeight: 'bold', color: '#94a3b8' }}>Estoque Atual: {product.stock} un</span>
            </div>
          )}
          {!product && code.length > 0 && (
            <div style={{ color: '#f87171', fontWeight: 'bold', fontSize: '0.875rem' }}>Produto não encontrado.</div>
          )}

          <div>
            <label style={{ fontSize: '0.875rem', fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Quantidade</label>
            <input 
              type="number" 
              min="1"
              style={{ width: '100%', boxSizing: 'border-box', backgroundColor: '#0f172a', border: '1px solid #475569', borderRadius: '8px', padding: '12px', fontSize: '1.25rem', fontWeight: 'bold', color: 'white', outline: 'none' }}
              value={qty}
              onChange={e => setQty(Number(e.target.value))}
            />
          </div>

          <div>
            <label style={{ fontSize: '0.875rem', fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }}>Motivo da Baixa</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <button 
                onClick={() => setLossType('error')}
                style={{ 
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '12px', borderRadius: '8px', 
                  border: lossType === 'error' ? '2px solid #ef4444' : '2px solid #334155', 
                  backgroundColor: lossType === 'error' ? 'rgba(239, 68, 68, 0.2)' : '#0f172a', 
                  color: lossType === 'error' ? '#ef4444' : '#94a3b8',
                  cursor: 'pointer'
                }}
              >
                <AlertTriangle size={24} style={{ marginBottom: '4px' }} />
                <span style={{ fontSize: '0.75rem', fontWeight: 'bold', textTransform: 'uppercase', textAlign: 'center' }}>Erro de Corte</span>
              </button>
              <button 
                onClick={() => setLossType('return')}
                style={{ 
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '12px', borderRadius: '8px', 
                  border: lossType === 'return' ? '2px solid #f97316' : '2px solid #334155', 
                  backgroundColor: lossType === 'return' ? 'rgba(249, 115, 22, 0.2)' : '#0f172a', 
                  color: lossType === 'return' ? '#f97316' : '#94a3b8',
                  cursor: 'pointer'
                }}
              >
                <RefreshCcw size={24} style={{ marginBottom: '4px' }} />
                <span style={{ fontSize: '0.75rem', fontWeight: 'bold', textTransform: 'uppercase', textAlign: 'center' }}>Troca (Devolução)</span>
              </button>
            </div>
          </div>

          <div>
            <label style={{ fontSize: '0.875rem', fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Observações (Opcional)</label>
            <input 
              type="text" 
              style={{ width: '100%', boxSizing: 'border-box', backgroundColor: '#0f172a', border: '1px solid #475569', borderRadius: '8px', padding: '12px', color: 'white', outline: 'none' }}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Ex: Chave entortou na máquina"
            />
          </div>

        </div>

        {/* Footer */}
        <div style={{ backgroundColor: '#0f172a', padding: '16px', display: 'flex', gap: '12px' }}>
          <button 
            onClick={onClose}
            style={{ flex: 1, padding: '12px', backgroundColor: '#334155', color: 'white', fontWeight: 'bold', borderRadius: '8px', textTransform: 'uppercase', border: 'none', cursor: 'pointer' }}
          >
            Cancelar
          </button>
          <button 
            onClick={handleRegister}
            disabled={!product}
            style={{ flex: 1, padding: '12px', backgroundColor: !product ? '#7f1d1d' : '#dc2626', color: !product ? '#94a3b8' : 'white', fontWeight: 'bold', borderRadius: '8px', textTransform: 'uppercase', border: 'none', cursor: !product ? 'not-allowed' : 'pointer' }}
          >
            Registrar Baixa
          </button>
        </div>
      </div>
    </div>
  );
}
