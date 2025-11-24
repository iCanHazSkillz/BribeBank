
import React, { useState, useEffect } from 'react';
import { User, UserRole } from './types';
import { storageService } from './services/storageService';
import { LoginView } from './components/LoginView';
import { WalletView } from './components/WalletView';
import { AdminView } from './components/AdminView';
import { LogOut } from 'lucide-react';

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [view, setView] = useState<'wallet' | 'admin' | 'login'>('login');

  useEffect(() => {
    // Check for existing session
    const sessionUser = storageService.getCurrentUser();
    if (sessionUser) {
        setCurrentUser(sessionUser);
        setView(sessionUser.role === UserRole.ADMIN ? 'admin' : 'wallet');
    }
  }, []);

  const handleLogin = (user: User) => {
    setCurrentUser(user);
    if (user.role === UserRole.ADMIN) {
      setView('admin');
    } else {
      setView('wallet');
    }
  };

  const handleLogout = () => {
    storageService.logout();
    setCurrentUser(null);
    setView('login');
  };

  if (!currentUser || view === 'login') {
    return <LoginView onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen max-w-md mx-auto bg-gray-50 shadow-2xl overflow-hidden relative border-x border-gray-200">
      {/* Content Area */}
      <main className="h-full overflow-y-auto no-scrollbar">
        {view === 'admin' && currentUser.role === UserRole.ADMIN && (
          <AdminView 
            currentUser={currentUser} 
          />
        )}
        
        {view === 'wallet' && (
          <WalletView currentUser={currentUser} />
        )}
      </main>

      {/* Bottom Navigation Bar */}
      <nav className="fixed bottom-0 max-w-md w-full bg-white border-t border-gray-200 flex justify-around items-center py-3 pb-5 z-20 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
        {currentUser.role === UserRole.ADMIN && (
            <>
                <button 
                    onClick={() => setView('wallet')}
                    className={`flex flex-col items-center space-y-1 transition-colors ${view === 'wallet' ? 'text-indigo-600' : 'text-gray-400'}`}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>
                    <span className="text-xs font-medium">My Wallet</span>
                </button>
                <button 
                    onClick={() => setView('admin')}
                    className={`flex flex-col items-center space-y-1 transition-colors ${view === 'admin' ? 'text-indigo-600' : 'text-gray-400'}`}
                >
                   <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="m9 12 2 2 4-4"/></svg>
                    <span className="text-xs font-medium">Admin</span>
                </button>
            </>
        )}
        <button 
          onClick={handleLogout}
          className="flex flex-col items-center space-y-1 text-gray-400 hover:text-red-500 transition-colors"
        >
          <LogOut size={24} />
          <span className="text-xs font-medium">Log Out</span>
        </button>
      </nav>
    </div>
  );
};

export default App;
