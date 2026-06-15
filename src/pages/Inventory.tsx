import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Product, type Profile, type ServiceType } from '../db/db';
import { Search, Plus, Edit2, Trash2, Package, TrendingUp } from 'lucide-react';
import { subDays } from 'date-fns';

export const Inventory = () => {
  // Helper: check if this product instance has stock tracking enabled
  const hasInventoryByProduct = (product: Product) => product.hasStock === true;
  const hasInventory = (type: ServiceType) => type === 'key' || type === 'spring' || type === 'screw';
  const [viewProfile, setViewProfile] = useState<Profile | 'todos'>('todos');
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const [isAddStockModalOpen, setIsAddStockModalOpen] = useState(false);
  const [stockEntry, setStockEntry] = useState({ qty: '', cost: '' });

  const [formData, setFormData] = useState({
    profile: 'chaveiro' as Profile,
    code: '',
    brand: '',
    name: '',
    price: '',
    costPrice: '',
    stock: '',
    idealStock: '',
    serviceType: 'key' as ServiceType,
    customCategory: '',
    hasStock: true,
  });

  const [salesPeriod, setSalesPeriod] = useState<'today' | 'week' | 'month' | 'year'>('month');
  const [sortOrder, setSortOrder] = useState<'name' | 'sales_desc' | 'sales_asc' | 'last_sold_desc' | 'last_sold_asc' | 'stock_asc'>('name');

  const allTransactions = useLiveQuery(
    () => db.transactions.toArray()
  );

  const productStats = React.useMemo(() => {
    const stats: Record<number, {
      lastSoldDate?: Date;
      salesToday: number;
      sales7d: number;
      sales30d: number;
      sales365d: number;
      currentPeriodSales: number;
    }> = {};

    if (!allTransactions) return stats;

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const sevenDaysAgo = subDays(now, 7);
    const thirtyDaysAgo = subDays(now, 30);
    const yearAgo = subDays(now, 365);

    const sortedTx = [...allTransactions].sort((a, b) => a.date.getTime() - b.date.getTime());

    sortedTx.forEach(t => {
      if (t.type !== 'sale') return;
      const txDate = new Date(t.date);

      t.items.forEach(item => {
        if (!item.productId) return;
        const id = item.productId;
        if (!stats[id]) {
          stats[id] = {
            salesToday: 0,
            sales7d: 0,
            sales30d: 0,
            sales365d: 0,
            currentPeriodSales: 0
          };
        }

        stats[id].lastSoldDate = txDate;

        if (txDate >= startOfToday) stats[id].salesToday += item.quantity;
        if (txDate >= sevenDaysAgo) stats[id].sales7d += item.quantity;
        if (txDate >= thirtyDaysAgo) stats[id].sales30d += item.quantity;
        if (txDate >= yearAgo) stats[id].sales365d += item.quantity;
      });
    });

    Object.keys(stats).forEach(key => {
      const id = Number(key);
      if (salesPeriod === 'today') stats[id].currentPeriodSales = stats[id].salesToday;
      else if (salesPeriod === 'week') stats[id].currentPeriodSales = stats[id].sales7d;
      else if (salesPeriod === 'month') stats[id].currentPeriodSales = stats[id].sales30d;
      else if (salesPeriod === 'year') stats[id].currentPeriodSales = stats[id].sales365d;
    });

    return stats;
  }, [allTransactions, salesPeriod]);

  const products = useLiveQuery(
    () => {
      let query = db.products.toCollection();
      if (viewProfile !== 'todos') {
        query = db.products.where('profile').equals(viewProfile);
      }
      return query.filter(p => {
        const term = searchTerm.toLowerCase();
        return p.name.toLowerCase().includes(term) || 
               (p.code?.toLowerCase() || '').includes(term) ||
               (p.brand?.toLowerCase() || '').includes(term);
      }).toArray();
    },
    [viewProfile, searchTerm]
  );

  const sortedProducts = React.useMemo(() => {
    if (!products) return [];
    const sorted = [...products];

    sorted.sort((a, b) => {
      if (sortOrder === 'stock_asc') {
        if (!hasInventory(a.serviceType) && hasInventory(b.serviceType)) return 1;
        if (hasInventory(a.serviceType) && !hasInventory(b.serviceType)) return -1;
        return a.stock - b.stock;
      }

      if (sortOrder === 'sales_desc' || sortOrder === 'sales_asc') {
        const salesA = productStats[a.id!]?.currentPeriodSales || 0;
        const salesB = productStats[b.id!]?.currentPeriodSales || 0;
        return sortOrder === 'sales_desc' ? salesB - salesA : salesA - salesB;
      }

      if (sortOrder === 'last_sold_desc' || sortOrder === 'last_sold_asc') {
        const dateA = productStats[a.id!]?.lastSoldDate;
        const dateB = productStats[b.id!]?.lastSoldDate;

        if (!dateA && !dateB) return 0;
        if (!dateA) return 1;
        if (!dateB) return -1;

        return sortOrder === 'last_sold_desc' 
          ? dateB.getTime() - dateA.getTime() 
          : dateA.getTime() - dateB.getTime();
      }

      return a.name.localeCompare(b.name);
    });

    return sorted;
  }, [products, sortOrder, productStats]);

  const handleOpenModal = (product?: Product) => {
    if (product) {
      setEditingProduct(product);
      setFormData({ 
        profile: product.profile, 
        code: product.code || '',
        brand: product.brand || '',
        name: product.name, 
        price: product.price.toString(), 
        costPrice: product.costPrice.toString(),
        stock: product.stock.toString(), 
        idealStock: product.idealStock ? product.idealStock.toString() : '',
        serviceType: product.serviceType,
        customCategory: product.customCategory || '',
        hasStock: product.hasStock ?? hasInventory(product.serviceType),
      });
    } else {
      setEditingProduct(null);
      setFormData({ 
        profile: viewProfile === 'todos' ? 'chaveiro' : viewProfile, 
        code: '',
        brand: '',
        name: '', 
        price: '', 
        costPrice: '0',
        stock: '0', 
        idealStock: '',
        serviceType: 'key',
        customCategory: '',
        hasStock: true,
      });
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) return alert('Nome é obrigatório');

    const productData = {
      profile: formData.profile,
      code: formData.code || undefined,
      brand: formData.brand || undefined,
      name: formData.name,
      price: Number(formData.price),
      costPrice: formData.hasStock ? Number(formData.costPrice) : 0,
      stock: formData.hasStock ? Number(formData.stock) : 0,
      idealStock: formData.hasStock && formData.idealStock ? Number(formData.idealStock) : undefined,
      serviceType: formData.serviceType,
      customCategory: formData.serviceType === 'custom' ? formData.customCategory : undefined,
      hasStock: formData.hasStock,
    };

    try {
      if (editingProduct?.id) {
        await db.products.update(editingProduct.id, productData);
      } else {
        await db.products.add(productData);
      }
      setIsModalOpen(false);
    } catch (error) {
      console.error(error);
      alert('Erro ao salvar produto.');
    }
  };

  const handleAddStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct || !editingProduct.id) return;
    
    const qty = Number(stockEntry.qty);
    const cost = Number(stockEntry.cost);
    if (qty <= 0) return alert('Quantidade deve ser maior que zero.');

    const currentStock = editingProduct.stock;
    const currentCost = editingProduct.costPrice || 0;
    
    // Custo Médio Ponderado
    const totalCurrentValue = currentStock * currentCost;
    const totalNewValue = qty * cost;
    const newStock = currentStock + qty;
    const newAvgCost = (totalCurrentValue + totalNewValue) / newStock;

    try {
      await db.products.update(editingProduct.id, {
        stock: newStock,
        costPrice: newAvgCost,
        lastPurchasedDate: new Date(),
        lastPurchasedQty: qty
      });
      setIsAddStockModalOpen(false);
      setStockEntry({ qty: '', cost: '' });
    } catch (error) {
      console.error(error);
      alert('Erro ao atualizar estoque.');
    }
  };

  const handleDelete = async (id: number) => {
    if (window.confirm('Tem certeza que deseja excluir este produto?')) {
      await db.products.delete(id);
    }
  };

  const translateService = (product: Product) => {
    if (product.serviceType === 'custom' && product.customCategory) return product.customCategory;
    switch (product.serviceType) {
      case 'key': return 'Chave';
      case 'plier': return 'Alicate';
      case 'scissor': return 'Tesoura';
      case 'knife': return 'Faca';
      case 'spring': return 'Molinha de Alicate';
      case 'screw': return 'Parafuso de Alicate';
      default: return 'Outros';
    }
  };

  const getStockBadge = (product: Product) => {
    if (!hasInventoryByProduct(product)) return <span className="text-xs text-muted">-</span>;
    
    let bgColor = 'bg-[var(--bg-surface)] text-muted border border-[var(--border)]';
    const ideal = product.idealStock || 0;
    
    if (ideal > 0) {
      const percentage = product.stock / ideal;
      if (percentage <= 0.1) bgColor = 'bg-danger/20 text-danger border border-danger/50 animate-pulse';
      else if (percentage <= 0.3) bgColor = 'bg-yellow-500/20 text-yellow-500 border border-yellow-500/50';
      else bgColor = 'bg-success/20 text-success border border-success/30';
    } else {
      // Fallback
      if (product.stock <= 5) bgColor = 'bg-danger/20 text-danger border border-danger/50';
      else if (product.stock <= 20) bgColor = 'bg-yellow-500/20 text-yellow-500 border border-yellow-500/50';
    }

    return (
      <span className={`px-2 py-1 rounded text-xs font-bold ${bgColor}`}>
        {product.stock} un
      </span>
    );
  };

  return (
    <div className="flex flex-col h-full animate-fade-in">
      <div className="page-header flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Package size={28}/> Estoque</h1>
          <p className="text-muted">Gerencie produtos, valores fixos e quantidades</p>
        </div>
        <div className="flex gap-4 items-center">
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted">Visualizando Estoque:</label>
            <select 
              className="input py-1 px-2 text-sm font-bold w-auto"
              value={viewProfile}
              onChange={e => setViewProfile(e.target.value as any)}
            >
              <option value="todos">Todos (Geral)</option>
              <option value="chaveiro">Chaveiro</option>
              <option value="fabiano">Fabiano</option>
            </select>
          </div>
          <button className="btn btn-primary" onClick={() => handleOpenModal()}>
            <Plus size={20} /> Novo Produto
          </button>
        </div>
      </div>

      <div className="glass-panel p-6 flex-1 flex flex-col min-h-0">
        <div className="mb-6 flex flex-wrap gap-4 items-center justify-between bg-black/20 p-4 rounded-lg border border-[var(--border)]">
          <div className="relative flex-1 min-w-[280px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={20} />
            <input 
              type="text" 
              className="input pl-10" 
              placeholder="Buscar por nome, código ou marca..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-muted uppercase">Vendas no Período:</span>
              <div className="flex rounded bg-black/45 p-0.5 border border-[var(--border)]">
                {(['today', 'week', 'month', 'year'] as const).map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setSalesPeriod(p)}
                    className={`px-3 py-1 rounded text-xs font-bold uppercase transition-all cursor-pointer ${salesPeriod === p ? 'bg-primary text-black font-black' : 'text-muted hover:text-white'}`}
                  >
                    {p === 'today' ? 'Hoje' : p === 'week' ? '7d' : p === 'month' ? '30d' : 'Ano'}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-muted uppercase">Ordenar:</span>
              <select
                className="input py-1 px-2 text-sm font-bold w-auto cursor-pointer"
                value={sortOrder}
                onChange={e => setSortOrder(e.target.value as any)}
              >
                <option value="name">Nome (A-Z)</option>
                <option value="stock_asc">Estoque Crítico (Menor)</option>
                <option value="sales_desc">Mais Vendidas (Período)</option>
                <option value="sales_asc">Menos Vendidas (Período)</option>
                <option value="last_sold_desc">Última Venda (Recente)</option>
                <option value="last_sold_asc">Última Venda (Mais Antiga)</option>
              </select>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-[var(--bg-surface)] sticky top-0 z-10">
              <tr className="border-b border-[var(--border)] text-muted text-sm">
                <th className="py-3 px-4 font-medium">Nome do Produto</th>
                <th className="py-3 px-4 font-medium">Código</th>
                <th className="py-3 px-4 font-medium">Última Compra</th>
                <th className="py-3 px-4 font-medium">Última Venda</th>
                <th className="py-3 px-4 font-medium text-center">Saídas ({salesPeriod === 'today' ? 'Hoje' : salesPeriod === 'week' ? '7d' : salesPeriod === 'month' ? '30d' : 'Ano'})</th>
                <th className="py-3 px-2 font-medium text-right">Estoque</th>
                <th className="py-3 px-2 font-medium text-center">Compra</th>
                <th className="py-3 px-2 font-medium text-right">Custo</th>
                <th className="py-3 px-2 font-medium text-right">Lucro</th>
                <th className="py-3 px-2 font-medium text-right">Margem</th>
                <th className="py-3 px-2 font-medium text-right">Venda</th>
                <th className="py-3 px-2 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {sortedProducts?.map((product) => {
                const stats = productStats[product.id!];
                const periodSales = stats?.currentPeriodSales || 0;
                
                // Format dates
                const lastPurchDateStr = product.lastPurchasedDate ? new Date(product.lastPurchasedDate).toLocaleDateString('pt-BR') : null;
                const lastSoldDateStr = stats?.lastSoldDate ? new Date(stats.lastSoldDate).toLocaleDateString('pt-BR') : null;

                // Purchase suggestion math
                let suggestedQty = 0;
                let suggestedLabel = '';
                let suggestedBadgeClass = '';

                if (hasInventoryByProduct(product)) {
                  let monthlySalesRate = 0;
                  if (salesPeriod === 'today') monthlySalesRate = stats?.salesToday * 30 || 0;
                  else if (salesPeriod === 'week') monthlySalesRate = stats?.sales7d * 4 || 0;
                  else if (salesPeriod === 'month') monthlySalesRate = stats?.sales30d || 0;
                  else if (salesPeriod === 'year') monthlySalesRate = stats?.sales365d / 12 || 0;

                  const targetStock = product.idealStock || Math.max(30, Math.ceil(monthlySalesRate * 1.5));
                  suggestedQty = Math.max(0, targetStock - product.stock);

                  if (suggestedQty > 0) {
                    suggestedLabel = `+${suggestedQty}`;
                    suggestedBadgeClass = suggestedQty >= 50 
                      ? 'bg-danger/25 text-danger border border-danger/40 animate-pulse' 
                      : 'bg-yellow-500/20 text-yellow-500 border border-yellow-500/40';
                  } else {
                    suggestedLabel = 'OK';
                    suggestedBadgeClass = 'bg-success/20 text-success border border-success/40';
                  }
                }

                return (
                  <tr key={product.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-surface-hover)]">
                    <td className="py-3 px-4 font-bold">
                      {product.name}
                      {product.brand && <span className="ml-2 text-xs text-muted font-normal bg-[var(--bg-surface)] px-2 py-0.5 rounded">{product.brand}</span>}
                    </td>
                    <td className="py-3 px-4 text-sm font-mono text-muted">{product.code || '-'}</td>
                    
                    {/* Last Purchase */}
                    <td className="py-3 px-4 text-xs text-muted">
                      {lastPurchDateStr ? (
                        <div>
                          <div>{lastPurchDateStr}</div>
                          <div className="font-semibold text-primary">{product.lastPurchasedQty} un</div>
                        </div>
                      ) : '-'}
                    </td>

                    {/* Last Sale */}
                    <td className="py-3 px-4 text-xs">
                      {lastSoldDateStr ? (
                        <span className="text-white font-medium">{lastSoldDateStr}</span>
                      ) : (
                        <span className="text-muted">Nunca saiu</span>
                      )}
                    </td>

                    {/* Sales in period */}
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {periodSales > 0 ? (
                          <>
                            <TrendingUp size={14} className="text-primary" />
                            <span className="font-bold">{periodSales}</span>
                          </>
                        ) : (
                          <span className="text-xs text-muted">0</span>
                        )}
                      </div>
                    </td>

                    {/* Stock badge */}
                    <td className="py-3 px-2 text-right">
                      {getStockBadge(product)}
                    </td>

                    {/* Purchase suggestion - compact */}
                    <td className="py-3 px-2 text-center">
                      {hasInventoryByProduct(product) ? (
                        <span className={`px-1.5 py-0.5 rounded text-[11px] font-bold ${suggestedBadgeClass}`}>
                          {suggestedLabel}
                        </span>
                      ) : (
                        <span className="text-xs text-muted">-</span>
                      )}
                    </td>

                    {/* Cost */}
                    <td className="py-3 px-2 text-right text-xs font-medium text-muted">
                      {hasInventoryByProduct(product) ? `R$ ${(product.costPrice || 0).toFixed(2).replace('.', ',')}` : '-'}
                    </td>

                    {/* Lucro column */}
                    <td className="py-3 px-2 text-right whitespace-nowrap">
                      {hasInventoryByProduct(product) && product.costPrice > 0 ? (() => {
                        const profit = product.price - (product.costPrice || 0);
                        const isPos = profit > 0;
                        return (
                          <span className={`font-bold text-xs ${isPos ? 'text-success' : 'text-danger'}`}>
                            {isPos ? '+' : ''}R$ {profit.toFixed(2).replace('.', ',')}
                          </span>
                        );
                      })() : <span className="text-xs text-muted">-</span>}
                    </td>

                    {/* Margem column */}
                    <td className="py-3 px-2 text-right whitespace-nowrap">
                      {hasInventoryByProduct(product) && product.costPrice > 0 ? (() => {
                        const profit = product.price - (product.costPrice || 0);
                        const margin = (profit / (product.costPrice || 1)) * 100;
                        const badgeColor = margin >= 50 ? 'bg-success/20 text-success' :
                          margin >= 20 ? 'bg-yellow-500/20 text-yellow-500' :
                          margin > 0   ? 'bg-orange-500/20 text-orange-400' :
                                         'bg-danger/20 text-danger';
                        return (
                          <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${badgeColor}`}>
                            {margin.toFixed(0)}%
                          </span>
                        );
                      })() : <span className="text-xs text-muted">-</span>}
                    </td>

                    <td className="py-3 px-2 text-right font-bold text-success text-sm">R$ {product.price.toFixed(2).replace('.', ',')}</td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      {hasInventoryByProduct(product) && (
                        <button className="p-2 text-primary hover:bg-primary/20 rounded transition-colors cursor-pointer" title="Registrar Compra (Estoque)" onClick={() => { setEditingProduct(product); setIsAddStockModalOpen(true); setStockEntry({ qty: '', cost: product.costPrice ? product.costPrice.toString() : '' }); }}>
                          <Plus size={18} />
                        </button>
                      )}
                      <button className="p-2 text-muted hover:text-primary transition-colors ml-1 cursor-pointer" title="Editar Produto" onClick={() => handleOpenModal(product)}>
                        <Edit2 size={18} />
                      </button>
                      <button className="p-2 text-muted hover:text-danger transition-colors ml-1 cursor-pointer" title="Excluir Produto" onClick={() => product.id && handleDelete(product.id)}>
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {sortedProducts?.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-muted">Nenhum produto encontrado.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in p-4">
          <div className="glass-panel w-full max-w-md p-6">
            <h2 className="text-xl font-bold mb-4">{editingProduct ? 'Editar Produto' : 'Novo Produto'}</h2>
            <form onSubmit={handleSave} className="flex flex-col gap-4">
              <div>
                <label className="label">Perfil do Estoque</label>
                <select 
                  className="input font-bold text-primary"
                  value={formData.profile}
                  onChange={e => setFormData({ ...formData, profile: e.target.value as Profile })}
                >
                  <option value="chaveiro">Chaveiro</option>
                  <option value="fabiano">Fabiano</option>
                </select>
              </div>
              
              <div>
                <label className="label">Categoria / Serviço</label>
                <select 
                  className="input"
                  value={formData.serviceType}
                  onChange={e => setFormData({ ...formData, serviceType: e.target.value as ServiceType })}
                >
                  <option value="key">Chave</option>
                  <option value="spring">Molinha de Alicate</option>
                  <option value="screw">Parafuso de Alicate</option>
                  <option value="plier">Alicate</option>
                  <option value="scissor">Tesoura</option>
                  <option value="knife">Faca</option>
                  <option value="other">Outros</option>
                  <option value="custom">📁 Categoria Personalizada...</option>
                </select>
              </div>

              {formData.serviceType === 'custom' && (
                <div>
                  <label className="label">Nome da Categoria</label>
                  <input 
                    type="text" 
                    className="input border-yellow-500/50" 
                    placeholder="Ex: Alicate de Cutícula Afiado, Capinha de Alicate..."
                    value={formData.customCategory}
                    onChange={e => setFormData({ ...formData, customCategory: e.target.value })}
                    required={formData.serviceType === 'custom'}
                  />
                </div>
              )}

              {/* Toggle: has inventory tracking */}
              <label className="flex items-center gap-3 cursor-pointer bg-black/20 p-3 rounded-lg border border-[var(--border)]">
                <input
                  type="checkbox"
                  className="w-5 h-5 cursor-pointer accent-primary"
                  checked={formData.hasStock}
                  onChange={e => setFormData({ ...formData, hasStock: e.target.checked })}
                />
                <div>
                  <span className="font-bold text-sm">Controlar Estoque / Custo</span>
                  <p className="text-xs text-muted">Marque se este item tem quantidade física a controlar (ex: chaves, bobinas, capinhas). Deixe desmarcado para serviços puros.</p>
                </div>
              </label>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Código (Opcional)</label>
                  <input 
                    type="text" 
                    className="input" 
                    placeholder="Ex: 799"
                    value={formData.code}
                    onChange={e => setFormData({ ...formData, code: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label">Marca (Opcional)</label>
                  <input 
                    type="text" 
                    className="input" 
                    placeholder="Ex: Gold, Jas..."
                    value={formData.brand}
                    onChange={e => setFormData({ ...formData, brand: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="label">Nome do Produto / Descrição *</label>
                <input 
                  type="text" 
                  className="input" 
                  placeholder="Ex: Chave Yale Simples"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Valor Venda (R$)</label>
                  <input 
                    type="number" 
                    step="0.01"
                    className="input font-bold text-success" 
                    placeholder="0.00"
                    value={formData.price}
                    onChange={e => setFormData({ ...formData, price: e.target.value })}
                    required
                  />
                </div>
              </div>

              {formData.hasStock && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="label">Qtd. Estoque Atual</label>
                      <input 
                        type="number" 
                        className="input" 
                        placeholder="0"
                        value={formData.stock}
                        onChange={e => setFormData({ ...formData, stock: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="label text-primary">Estoque Ideal (100%)</label>
                      <input 
                        type="number" 
                        className="input border-primary/50" 
                        placeholder="Ex: 500"
                        value={formData.idealStock}
                        onChange={e => setFormData({ ...formData, idealStock: e.target.value })}
                      />
                      <p className="text-[10px] text-muted mt-1 leading-tight">
                        Define quando o alerta pisca. (Amarelo &lt; 30%, Vermelho &lt; 10%).
                      </p>
                    </div>
                  </div>
                  <div>
                    <label className="label">Custo Base Atual (R$)</label>
                    <input 
                      type="number" 
                      step="0.01"
                      className="input" 
                      placeholder="0.00"
                      value={formData.costPrice}
                      onChange={e => setFormData({ ...formData, costPrice: e.target.value })}
                    />
                  </div>
                </>
              )}
              
              <div className="flex gap-2 justify-end mt-4">
                <button type="button" className="btn btn-outline" onClick={() => setIsModalOpen(false)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Salvar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isAddStockModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in p-4">
          <div className="glass-panel w-full max-w-sm p-6">
            <h2 className="text-xl font-bold mb-2">Registrar Compra</h2>
            <p className="text-sm text-muted mb-4">{editingProduct?.name}</p>
            
            <form onSubmit={handleAddStock} className="flex flex-col gap-4">
              <div>
                <label className="label">Qtd Comprada</label>
                <input 
                  type="number" 
                  min="1"
                  className="input" 
                  placeholder="Ex: 50"
                  value={stockEntry.qty}
                  onChange={e => setStockEntry({ ...stockEntry, qty: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="label">Custo Unitário (R$)</label>
                <input 
                  type="number" 
                  step="0.01"
                  min="0"
                  className="input" 
                  placeholder="Ex: 1.50"
                  value={stockEntry.cost}
                  onChange={e => setStockEntry({ ...stockEntry, cost: e.target.value })}
                  required
                />
                <p className="text-xs text-muted mt-2">
                  O sistema calculará automaticamente o <strong>Custo Médio Ponderado</strong> com as {editingProduct?.stock} unidades que já estão no estoque.
                </p>
              </div>
              <div className="flex gap-2 justify-end mt-4">
                <button type="button" className="btn btn-outline" onClick={() => setIsAddStockModalOpen(false)}>Cancelar</button>
                <button type="submit" className="btn btn-success">Adicionar Estoque</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
