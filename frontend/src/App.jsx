import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Navbar from "./components/Navbar";

import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Transfer from "./pages/Transfer";
import Deposit from "./pages/Deposit";
import Withdraw from "./pages/Withdraw";
import History from "./pages/History";
import Payments from "./pages/Payments";
import AIChat from "./pages/AIChat";

function AppLayout({ children }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50 to-violet-100">
      <Navbar />
      <main>{children}</main>
    </div>
  );
}

function ProtectedPage({ children }) {
  return (
    <ProtectedRoute>
      <AppLayout>{children}</AppLayout>
    </ProtectedRoute>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          <Route path="/" element={<ProtectedPage><Dashboard /></ProtectedPage>} />
          <Route path="/transfer" element={<ProtectedPage><Transfer /></ProtectedPage>} />
          <Route path="/deposit" element={<ProtectedPage><Deposit /></ProtectedPage>} />
          <Route path="/withdraw" element={<ProtectedPage><Withdraw /></ProtectedPage>} />
          <Route path="/history" element={<ProtectedPage><History /></ProtectedPage>} />
          <Route path="/payments" element={<ProtectedPage><Payments /></ProtectedPage>} />
          <Route path="/ai-chat" element={<ProtectedPage><AIChat /></ProtectedPage>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}