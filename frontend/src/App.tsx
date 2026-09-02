import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { AppShell } from './layout/AppShell';
import { LoginPage } from './pages/LoginPage';
import { PharmaciesPage } from './pages/superadmin/PharmaciesPage';
import { StaffPage } from './pages/pharmacyadmin/StaffPage';
import { DashboardPage } from './pages/pharmacyadmin/DashboardPage';
import { ProductsPage } from './pages/pharmacyadmin/ProductsPage';
import { PurchasesPage } from './pages/pharmacyadmin/PurchasesPage';
import { SuppliersPage } from './pages/pharmacyadmin/SuppliersPage';
import { SalesHistoryPage } from './pages/pharmacyadmin/SalesHistoryPage';
import { SalesPOS } from './pages/salesman/SalesPOS';

function RoleHome() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'super_admin') return <PharmaciesPage />;
  if (user.role === 'pharmacy_admin' || user.role === 'manager') return <DashboardPage />;
  return <SalesPOS />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route element={<ProtectedRoute />}>
            <Route element={<AppShell />}>
              <Route path="/" element={<RoleHome />} />

              <Route element={<ProtectedRoute allow={['pharmacy_admin']} />}>
                <Route path="/staff" element={<StaffPage />} />
              </Route>

              <Route element={<ProtectedRoute allow={['pharmacy_admin', 'manager']} />}>
                <Route path="/products" element={<ProductsPage />} />
                <Route path="/purchases" element={<PurchasesPage />} />
                <Route path="/suppliers" element={<SuppliersPage />} />
                <Route path="/sales-history" element={<SalesHistoryPage />} />
              </Route>

              <Route element={<ProtectedRoute allow={['pharmacy_admin', 'salesman']} />}>
                <Route path="/sell" element={<SalesPOS />} />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
