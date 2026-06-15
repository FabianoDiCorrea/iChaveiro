import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Pos } from './pages/Pos';
import { Clients } from './pages/Clients';
import { Inventory } from './pages/Inventory';
import { Reports } from './pages/Reports';
import { Returns } from './pages/Returns';
import { SalesHistory } from './pages/SalesHistory';

const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="caixa" element={<Pos />} />
        <Route path="estoque" element={<Inventory />} />
        <Route path="clientes" element={<Clients />} />
        <Route path="relatorios" element={<Reports />} />
        <Route path="historico" element={<SalesHistory />} />
        <Route path="devolucoes" element={<Returns />} />
      </Route>
    </Routes>
  );
};

function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}

export default App;
