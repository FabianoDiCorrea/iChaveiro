import React from 'react';
import { type PendingSale } from '../db/db';
import { Package, Trash2, ArrowUpCircle, X, Calendar, User, Clock } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';

interface StorageBoxModalProps {
  isOpen: boolean;
  onClose: () => void;
  archivedSales: PendingSale[];
  onRescue: (sale: PendingSale) => void;
  onDelete: (sale: PendingSale) => void;
}

export const StorageBoxModal: React.FC<StorageBoxModalProps> = ({ 
  isOpen, onClose, archivedSales, onRescue, onDelete 
}) => {
  if (!isOpen) return null;

  const today = new Date();

  return (
    <div 
      style={{ 
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, 
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.85)', backdropFilter: 'blur(4px)' 
      }}
      className="animate-fade-in"
    >
      <div 
        style={{ 
          backgroundColor: '#1e293b', border: '4px solid #a855f7', borderRadius: '16px', padding: '24px', 
          maxWidth: '800px', width: '95%', maxHeight: '90vh', overflowY: 'hidden',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)', display: 'flex', flexDirection: 'column', gap: '20px', color: 'white'
        }}
        className="animate-scale-in"
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 900, color: '#a855f7', textTransform: 'uppercase', margin: 0, display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Package size={32} /> Caixa de Armazenamento
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
            <X size={28} />
          </button>
        </div>
        
        <p style={{ color: '#cbd5e1', fontSize: '1rem', margin: '-10px 0 0 0', fontWeight: 'bold' }}>
          Itens pendentes há mais de 7 dias. O prazo legal para guarda é de 90 dias.
        </p>

        <div style={{ overflowY: 'auto', flex: 1, paddingRight: '4px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {archivedSales.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#64748b', fontStyle: 'italic' }}>
              A caixa está vazia. Nenhum item pendente passou de 7 dias.
            </div>
          ) : archivedSales.map(sale => {
            const daysOld = differenceInDays(today, sale.date);
            
            // Determine color based on age
            let borderColor = '#22c55e'; // Green (7-30 days)
            let bgColor = 'rgba(34, 197, 94, 0.1)';
            let statusText = 'Dentro do prazo';
            
            if (daysOld > 60) {
              borderColor = '#ef4444'; // Red (>60 days)
              bgColor = 'rgba(239, 68, 68, 0.1)';
              statusText = 'Risco de vencimento (90 dias)';
            } else if (daysOld > 30) {
              borderColor = '#eab308'; // Yellow (31-60 days)
              bgColor = 'rgba(234, 179, 8, 0.1)';
              statusText = 'Atenção ao prazo';
            }

            return (
              <div key={sale.id} style={{ 
                border: `2px solid ${borderColor}`, borderRadius: '12px', padding: '16px', 
                backgroundColor: bgColor, display: 'flex', justifyContent: 'space-between', alignItems: 'center' 
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                    <span style={{ fontWeight: 900, fontSize: '1.2rem', color: borderColor }}>#{sale.id}</span>
                    <span style={{ fontWeight: 'bold', fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <User size={18} /> {sale.clientName || 'Cliente não informado'}
                    </span>
                  </div>
                  
                  <div style={{ display: 'flex', gap: '16px', color: '#cbd5e1', fontSize: '0.9rem', marginBottom: '12px' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Calendar size={14} /> Entrada: {format(sale.date, 'dd/MM/yyyy HH:mm')}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: borderColor, fontWeight: 'bold' }}>
                      <Clock size={14} /> {daysOld} dias na caixa ({statusText})
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', borderLeft: '2px solid #475569', paddingLeft: '12px' }}>
                    {sale.items.map((item, idx) => (
                      <div key={idx} style={{ fontSize: '0.95rem', fontWeight: 'bold' }}>
                        {item.quantity}x {item.name}
                      </div>
                    ))}
                    <div style={{ marginTop: '8px', fontWeight: 900, color: '#38bdf8' }}>
                      Total a Pagar: R$ {sale.total.toFixed(2).replace('.', ',')}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '140px' }}>
                  <button 
                    onClick={() => onRescue(sale)}
                    style={{ 
                      padding: '12px', backgroundColor: '#3b82f6', color: 'white', border: 'none', 
                      borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', textTransform: 'uppercase', fontSize: '0.9rem'
                    }}
                    className="hover:opacity-80 transition-opacity"
                  >
                    <ArrowUpCircle size={18} /> Resgatar
                  </button>
                  <button 
                    onClick={() => onDelete(sale)}
                    style={{ 
                      padding: '12px', backgroundColor: 'transparent', color: '#f87171', border: '2px solid #f87171', 
                      borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', textTransform: 'uppercase', fontSize: '0.9rem'
                    }}
                    className="hover:bg-red-500/10 transition-colors"
                  >
                    <Trash2 size={18} /> Destino
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <button 
          onClick={onClose}
          style={{ padding: '16px', backgroundColor: '#334155', color: 'white', fontWeight: 'bold', borderRadius: '8px', textTransform: 'uppercase', border: 'none', cursor: 'pointer', fontSize: '1.2rem', width: '100%' }}
        >
          Fechar Caixa
        </button>
      </div>
    </div>
  );
};
