import React, { useState } from 'react';
import { type TransactionItem } from '../db/db';
import { Plus, Trash2, Printer, X } from 'lucide-react';

interface StandaloneReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PREDEFINED_SERVICES = [
  'CHAVE COMUM',
  'AFIAÇÃO DE ALICATE',
  'AFIAÇÃO DE FACA',
  'AFIAÇÃO DE TESOURA COMUM',
  'AFIAÇÃO DE TESOURA GRANDE',
  'AFIAÇÃO DE TESOURINHA',
  'OUTROS / SERVIÇO DE RUA'
];

export const StandaloneReceiptModal: React.FC<StandaloneReceiptModalProps> = ({ isOpen, onClose }) => {
  const [items, setItems] = useState<TransactionItem[]>([]);
  const [clientName, setClientName] = useState('');
  
  // Data e hora padrão: agora
  const [receiptDate, setReceiptDate] = useState(() => {
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;
    const localISOTime = (new Date(now.getTime() - offset)).toISOString().slice(0, 16);
    return localISOTime;
  });

  const [selectedService, setSelectedService] = useState(PREDEFINED_SERVICES[0]);
  const [customServiceInfo, setCustomServiceInfo] = useState('');
  const [servicePrice, setServicePrice] = useState('');
  const [serviceQty, setServiceQty] = useState('1');

  if (!isOpen) return null;

  const handleAddService = (e: React.FormEvent) => {
    e.preventDefault();
    const qty = parseInt(serviceQty) || 1;
    const price = Number(servicePrice.replace(',', '.')) || 0;
    
    let name = selectedService;
    if (selectedService === 'OUTROS / SERVIÇO DE RUA') {
      name = customServiceInfo.trim() || 'Serviço Personalizado';
    }

    setItems([...items, {
      service: 'other',
      name: name,
      quantity: qty,
      price: price,
      originalPrice: price,
      cost: 0,
      total: price * qty
    } as any]);

    setServicePrice('');
    setServiceQty('1');
    setCustomServiceInfo('');
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItemPrice = (index: number, val: string) => {
    const parsedPrice = Number(val.replace(',', '.')) || 0;
    const newItems = [...items];
    newItems[index].price = parsedPrice;
    newItems[index].total = parsedPrice * newItems[index].quantity;
    setItems(newItems);
  };

  const totalAmount = items.reduce((sum, item) => sum + item.total, 0);

  const handlePrint = () => {
    if (items.length === 0) return alert('Adicione itens ao cupom avulso.');

    const dateObj = new Date(receiptDate);
      const dateStr = dateObj.toLocaleString('pt-BR');
      
      const originalSubtotal = items.reduce((sum, i) => {
        const orig = i.originalPrice !== undefined ? i.originalPrice : i.price;
        return sum + (orig * i.quantity);
      }, 0);
      const quantityDiscount = items.reduce((sum, i) => {
        const orig = i.originalPrice !== undefined ? i.originalPrice : i.price;
        return sum + ((orig - i.price) * i.quantity);
      }, 0);

      let html = `
        <html>
        <head>
          <title>Cupom Não Fiscal</title>
          <style>
            @page { margin: 10mm 0; }
            body { font-family: monospace; font-size: 12px; max-width: 300px; margin: 0 auto; padding: 0 10px; color: black; }
            .text-center { text-align: center; }
            .text-right { text-align: right; }
            .bold { font-weight: bold; }
            .divider { border-bottom: 1px dashed #000; margin: 5px 0; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { padding: 2px 0; }
            .header-title { font-size: 16px; font-weight: bold; margin-bottom: 5px; }
          </style>
        </head>
        <body>
          <div class="text-center header-title">Chaveiro & Cutelaria<br>do Lidio e Fabiano</div>
          <div class="text-center" style="font-size: 10px; margin-top: 3px;">Rua Cardoso de Morais, Frente ao 202</div>
          <div class="text-center" style="font-size: 10px;">Bonsucesso - RJ (Frente ao Caçula)</div>
          <div class="text-center" style="font-size: 10px; margin-bottom: 5px;">Tel: (21) 98601-6721 (WhatsApp)</div>
          <div class="text-center" style="font-size: 11px;">Data: ${dateStr}</div>
          ${clientName ? `<div class="divider"></div><div class="bold">Cliente: ${clientName}</div>` : ''}
          <div class="divider"></div>
          <table>
            <thead>
              <tr>
                <th class="text-left" style="width: 15%">Qtd</th>
                <th class="text-left" style="width: 60%">Item</th>
                <th class="text-right" style="width: 25%">Total</th>
              </tr>
            </thead>
            <tbody>
              ${items.map(i => {
                const orig = i.originalPrice !== undefined ? i.originalPrice : i.price;
                const itemOriginalTotal = orig * i.quantity;
                return `
                  <tr>
                    <td class="text-left" valign="top">${i.quantity}x</td>
                    <td class="text-left" valign="top">
                      ${i.name}<br>
                      ${(i.originalPrice !== undefined && i.originalPrice > i.price) ? `
                        <div style="font-size: 12px; color: #000;">
                          <strong>De: <span style="text-decoration: line-through;">R$ ${i.originalPrice.toFixed(2).replace('.', ',')}</span> 
                          Por: R$ ${i.price.toFixed(2).replace('.', ',')} (Desc: R$ ${(i.originalPrice - i.price).toFixed(2).replace('.', ',')}/un)</strong>
                        </div>
                      ` : `
                        <div style="font-size: 12px; color: #000;"><strong>Vlr. Unit: R$ ${i.price.toFixed(2).replace('.', ',')}</strong></div>
                      `}
                    </td>
                    <td class="text-right" valign="top">R$ ${itemOriginalTotal.toFixed(2).replace('.', ',')}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
          <div class="divider"></div>
          <table>
            <tr><td class="bold">Subtotal Bruto:</td><td class="text-right">R$ ${originalSubtotal.toFixed(2).replace('.', ',')}</td></tr>
            ${quantityDiscount > 0 ? `<tr><td class="bold">Desc. Quantidade:</td><td class="text-right">-R$ ${quantityDiscount.toFixed(2).replace('.', ',')}</td></tr>` : ''}
            <tr><td class="bold header-title">TOTAL A PAGAR:</td><td class="text-right header-title">R$ ${totalAmount.toFixed(2).replace('.', ',')}</td></tr>
            <tr><td>Recebido:</td><td class="text-right">R$ ${totalAmount.toFixed(2).replace('.', ',')}</td></tr>
            <tr><td class="bold">Troco:</td><td class="text-right bold">R$ 0,00</td></tr>
          </table>
          <div class="divider"></div>
          <div class="text-center">Obrigado pela preferencia!</div>
          <br><br><br>
        </body>
        </html>
      `;
      
      // Add extra margin for thermal printers
      html += '<br><br><br><br><br><br><div style="visibility: hidden;">.</div>';
      
      const printRoot = document.getElementById('print-root');
      if (printRoot) {
        printRoot.innerHTML = html;
        setTimeout(() => {
          window.print();
          setTimeout(() => {
            printRoot.innerHTML = '';
          }, 500);
        }, 500);
      }
      
      setItems([]);
      setClientName('');
      onClose();
  };

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
          backgroundColor: '#1e293b', border: '4px solid #38bdf8', borderRadius: '16px', padding: '24px', 
          maxWidth: '800px', width: '95%', maxHeight: '90vh', overflowY: 'auto',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)', display: 'flex', flexDirection: 'column', gap: '20px', color: 'white'
        }}
        className="animate-scale-in"
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 900, color: '#38bdf8', textTransform: 'uppercase', margin: 0 }}>
            Gerar Cupom Avulso
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
            <X size={28} />
          </button>
        </div>
        
        <p style={{ color: '#94a3b8', fontSize: '0.9rem', margin: '-10px 0 10px 0' }}>
          Imprima um comprovante sem registrar a venda no sistema e sem baixar estoque.
        </p>

        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ flex: 2, minWidth: '200px' }}>
            <label style={{ fontSize: '0.875rem', fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
              Cliente / Empresa
            </label>
            <input 
              type="text" 
              style={{ width: '100%', boxSizing: 'border-box', backgroundColor: '#0f172a', border: '1px solid #475569', borderRadius: '8px', padding: '12px', fontSize: '1rem', color: 'white', outline: 'none' }}
              value={clientName} onChange={e => setClientName(e.target.value)}
              placeholder="Nome (Opcional)"
            />
          </div>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <label style={{ fontSize: '0.875rem', fontWeight: 'bold', color: '#94a3b8', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
              Data e Hora do Cupom
            </label>
            <input 
              type="datetime-local" 
              style={{ width: '100%', boxSizing: 'border-box', backgroundColor: '#0f172a', border: '1px solid #475569', borderRadius: '8px', padding: '12px', fontSize: '1rem', color: 'white', outline: 'none' }}
              value={receiptDate} onChange={e => setReceiptDate(e.target.value)}
            />
          </div>
        </div>

        {/* Service Addition Form */}
        <div style={{ backgroundColor: '#0f172a', border: '1px solid #475569', borderRadius: '12px', padding: '16px' }}>
          <form onSubmit={handleAddService} style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <div style={{ flex: 2, minWidth: '200px' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Serviço / Item</label>
              <select 
                className="w-full pl-3 pr-3 py-3 bg-black/40 text-white rounded outline-none border border-gray-600 focus:border-blue-400 font-bold uppercase"
                value={selectedService}
                onChange={e => setSelectedService(e.target.value)}
              >
                {PREDEFINED_SERVICES.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            
            {selectedService === 'OUTROS / SERVIÇO DE RUA' && (
              <div style={{ flex: 2, minWidth: '150px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Descrição do Serviço</label>
                <input 
                  type="text"
                  required
                  className="w-full px-3 py-3 bg-black/40 text-white rounded outline-none border border-gray-600 focus:border-blue-400 font-bold"
                  placeholder="Descreva..."
                  value={customServiceInfo}
                  onChange={e => setCustomServiceInfo(e.target.value)}
                />
              </div>
            )}

            <div style={{ width: '120px' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Valor (R$)</label>
              <input 
                type="text"
                required
                className="w-full px-3 py-3 bg-black/40 text-white rounded outline-none border border-gray-600 focus:border-blue-400 font-bold text-right"
                placeholder="0,00"
                value={servicePrice}
                onChange={e => setServicePrice(e.target.value.replace(/[^0-9,]/g, ''))}
              />
            </div>
            
            <div style={{ width: '80px' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Qtd</label>
              <input 
                type="number"
                min="1"
                required
                className="w-full px-3 py-3 bg-black/40 text-white rounded outline-none border border-gray-600 focus:border-blue-400 font-bold text-center"
                value={serviceQty}
                onChange={e => setServiceQty(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button type="submit" style={{ height: '48px', backgroundColor: '#3b82f6', color: 'white', border: 'none', padding: '0 20px', borderRadius: '8px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <Plus size={20} /> Adicionar
              </button>
            </div>
          </form>
        </div>

        {/* Cart Items */}
        <div style={{ flex: 1, minHeight: '150px', backgroundColor: '#0f172a', borderRadius: '12px', border: '1px solid #475569', overflow: 'hidden', display: 'flex', flexDirection: 'column', marginTop: '16px' }}>
          <div style={{ display: 'flex', padding: '12px', backgroundColor: '#1e293b', borderBottom: '1px solid #475569', fontWeight: 'bold', color: '#94a3b8' }}>
            <div style={{ width: '60px', textAlign: 'center' }}>Qtd</div>
            <div style={{ flex: 1 }}>Item</div>
            <div style={{ width: '100px', textAlign: 'right' }}>Unitário</div>
            <div style={{ width: '100px', textAlign: 'right' }}>Total</div>
            <div style={{ width: '40px' }}></div>
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {items.length === 0 ? (
              <div style={{ padding: '30px', textAlign: 'center', color: '#64748b', fontStyle: 'italic' }}>
                Nenhum item adicionado.
              </div>
            ) : items.map((item, idx) => (
              <div key={idx} style={{ display: 'flex', padding: '12px', borderBottom: '1px solid #334155', alignItems: 'center' }}>
                <div style={{ width: '60px', textAlign: 'center', fontWeight: 'bold', fontSize: '1.1rem' }}>{item.quantity}</div>
                <div style={{ flex: 1, fontWeight: 'bold', textTransform: 'uppercase' }}>{item.name}</div>
                <div style={{ width: '100px', textAlign: 'right' }}>
                  <input 
                    type="text"
                    style={{ width: '80px', backgroundColor: 'transparent', border: '1px dashed #64748b', color: 'white', textAlign: 'right', outline: 'none' }}
                    value={item.price > 0 ? item.price.toString().replace('.', ',') : ''}
                    placeholder="0,00"
                    onChange={e => updateItemPrice(idx, e.target.value.replace(/[^0-9,]/g, ''))}
                  />
                </div>
                <div style={{ width: '100px', textAlign: 'right', color: '#4ade80', fontWeight: 'bold' }}>
                  R$ {item.total.toFixed(2).replace('.', ',')}
                </div>
                <div style={{ width: '40px', textAlign: 'right' }}>
                  <button onClick={() => removeItem(idx)} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer' }}>
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', backgroundColor: '#1e293b', borderRadius: '12px', border: '2px dashed #38bdf8', marginTop: '16px' }}>
          <span style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#94a3b8' }}>TOTAL DO CUPOM:</span>
          <span style={{ fontSize: '2rem', fontWeight: 900, color: '#38bdf8' }}>R$ {totalAmount.toFixed(2).replace('.', ',')}</span>
        </div>

        <div style={{ display: 'flex', gap: '16px', marginTop: '16px' }}>
          <button 
            onClick={onClose}
            style={{ flex: 1, padding: '16px', backgroundColor: '#334155', color: 'white', fontWeight: 'bold', borderRadius: '8px', textTransform: 'uppercase', border: 'none', cursor: 'pointer', fontSize: '1.2rem' }}
          >
            Cancelar
          </button>
          <button 
            onClick={handlePrint}
            style={{ flex: 2, padding: '16px', backgroundColor: '#38bdf8', color: '#000000', fontWeight: 'bold', borderRadius: '8px', textTransform: 'uppercase', border: 'none', cursor: 'pointer', fontSize: '1.2rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '10px' }}
          >
            <Printer size={24} /> Imprimir Avulso
          </button>
        </div>
      </div>
    </div>
  );
};
