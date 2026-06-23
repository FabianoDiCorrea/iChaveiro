import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { Profile } from '../db/db';
import { format, startOfDay, endOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { TrendingUp, TrendingDown, DollarSign, Package, AlertCircle } from 'lucide-react';

export const Dashboard = () => {
  const [viewProfile, setViewProfile] = React.useState<Profile | 'todos'>('todos');
  
  const today = new Date();
  const start = startOfDay(today);
  const end = endOfDay(today);

  // Get today's transactions for the active profile
  const todayTransactions = useLiveQuery(
    () => {
      let query = db.transactions.where('date').between(start, end);
      if (viewProfile !== 'todos') {
        return query.filter(t => t.profile === viewProfile).toArray();
      }
      return query.toArray();
    },
    [viewProfile]
  );

  const [isTakingTooLong, setIsTakingTooLong] = React.useState(false);

  React.useEffect(() => {
    if (!todayTransactions) {
      const timer = setTimeout(() => setIsTakingTooLong(true), 3000);
      return () => clearTimeout(timer);
    } else {
      setIsTakingTooLong(false);
    }
  }, [todayTransactions]);

  if (!todayTransactions) {
    return (
      <div className="p-8 text-center flex flex-col items-center justify-center gap-4">
        <div className="text-xl">Carregando dados...</div>
        {isTakingTooLong && (
          <div className="text-danger mt-4 bg-danger/10 p-6 rounded-lg max-w-lg text-left border border-danger/30">
            <h3 className="font-bold text-lg mb-2 flex items-center gap-2">
              <AlertCircle size={20} /> O banco de dados parece estar travado
            </h3>
            <p className="text-sm mb-4 text-muted-foreground">
              O aplicativo está demorando muito para iniciar. Isso pode ocorrer devido a uma falha na atualização do banco de dados local.
            </p>
            <p className="text-sm mb-4 font-medium">
              Se você possui um backup em nuvem e deseja apenas restaurá-lo, você pode forçar a limpeza do banco local para destravar o sistema.
            </p>
            <button 
              className="bg-danger text-white px-4 py-2 rounded font-bold hover:bg-danger/80 w-full flex items-center justify-center gap-2"
              onClick={async () => {
                if (window.confirm('CUIDADO: Isso apagará TODOS os dados locais deste computador. Só prossiga se você tiver um backup na nuvem pronto para restaurar. Confirmar limpeza?')) {
                  try {
                    await db.delete();
                    alert('Banco local limpo com sucesso! O aplicativo será recarregado.');
                    window.location.reload();
                  } catch (e: any) {
                    alert('Erro ao limpar banco: ' + e.message);
                  }
                }
              }}
            >
              Forçar Limpeza Local (Para Restaurar Backup)
            </button>
          </div>
        )}
      </div>
    );
  }

  const sales = todayTransactions.filter(t => t.type === 'sale');
  const returns = todayTransactions.filter(t => t.type === 'return');

  const totalSales = sales.reduce((sum, t) => sum + t.total, 0);
  const totalReturns = returns.reduce((sum, t) => sum + t.total, 0);
  const netTotal = totalSales - totalReturns;

  let totalCosts = 0;
  let totalDiscounts = 0;
  const serviceCounts: Record<string, number> = {};
  sales.forEach(t => {
    totalDiscounts += t.discount || 0;
    t.items.forEach(item => {
      serviceCounts[item.service] = (serviceCounts[item.service] || 0) + item.quantity;
      totalCosts += (item.cost || 0) * item.quantity;
    });
  });

  const realProfit = netTotal - totalCosts - totalDiscounts;

  const topService = Object.entries(serviceCounts).sort((a, b) => b[1] - a[1])[0];

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <div className="page-header flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm mt-1">{format(today, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR })}</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted">Visualizando Faturamento:</label>
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
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="glass-panel p-6 flex flex-col gap-2">
          <div className="flex justify-between items-center text-muted">
            <span className="font-medium">Faturamento Líquido</span>
            <DollarSign size={20} className="text-success" />
          </div>
          <span className="text-3xl font-bold">R$ {netTotal.toFixed(2)}</span>
        </div>

        <div className="glass-panel p-6 flex flex-col gap-2">
          <div className="flex justify-between items-center text-muted">
            <span className="font-medium">Vendas Brutas</span>
            <TrendingUp size={20} className="text-primary" />
          </div>
          <span className="text-3xl font-bold">R$ {totalSales.toFixed(2)}</span>
        </div>

        <div className="glass-panel p-6 flex flex-col gap-2">
          <div className="flex justify-between items-center text-muted">
            <span className="font-medium">Devoluções / Custos</span>
            <TrendingDown size={20} className="text-danger" />
          </div>
          <span className="text-3xl font-bold">R$ {(totalReturns + totalCosts + totalDiscounts).toFixed(2)}</span>
        </div>

        <div className="glass-panel p-6 flex flex-col gap-2 bg-success/10 border border-success/30">
          <div className="flex justify-between items-center text-success">
            <span className="font-medium">Lucro Real</span>
            <DollarSign size={20} />
          </div>
          <span className="text-3xl font-bold text-success">
            R$ {realProfit.toFixed(2)}
          </span>
        </div>
      </div>

      <div className="glass-panel p-6 mt-4">
        <h2 className="text-lg font-bold mb-4">Últimas Transações</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--border)] text-muted text-sm">
                <th className="pb-3 font-medium">Hora</th>
                <th className="pb-3 font-medium">Tipo</th>
                <th className="pb-3 font-medium">Serviços</th>
                <th className="pb-3 font-medium">Pagamento</th>
                <th className="pb-3 font-medium text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              {todayTransactions.sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 10).map((t, i) => (
                <tr key={t.id || i} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-surface-hover)]">
                  <td className="py-3 text-sm">{format(t.date, 'HH:mm')}</td>
                  <td className="py-3">
                    {t.type === 'sale' 
                      ? <span className="bg-success/20 text-success px-2 py-1 rounded text-xs">Venda</span>
                      : <span className="bg-danger/20 text-danger px-2 py-1 rounded text-xs">Devolução</span>
                    }
                  </td>
                  <td className="py-3 text-sm">{t.items.map(item => `${item.quantity}x ${item.name}`).join(', ')}</td>
                  <td className="py-3 text-sm uppercase">{t.paymentMethod === 'cash' ? 'Dinheiro' : t.paymentMethod === 'credit' ? 'Crédito' : t.paymentMethod === 'debit' ? 'Débito' : t.paymentMethod === 'pix' ? 'PIX' : 'Múltiplo'}</td>
                  <td className={`py-3 text-sm font-bold text-right ${t.type === 'sale' ? 'text-success' : 'text-danger'}`}>
                    {t.type === 'sale' ? '+' : '-'} R$ {t.total.toFixed(2)}
                  </td>
                </tr>
              ))}
              {todayTransactions.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-muted">Nenhuma transação hoje.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
