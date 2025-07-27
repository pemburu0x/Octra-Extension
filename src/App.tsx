import React, { useState, useEffect } from 'react';
import { WelcomeScreen } from './components/WelcomeScreen';
import { WalletDashboard } from './components/WalletDashboard';
import { UnlockWallet } from './components/UnlockWallet';
import { DAppConnection } from './components/DAppConnection';
import { TransactionRequestDialog } from './components/DAppTransactionRequest';
import { ThemeProvider } from './components/ThemeProvider';
import { Wallet, DAppConnectionRequest, DAppTransactionRequest as DAppTransactionRequestType } from './types/wallet';
import { Toaster } from '@/components/ui/toaster';

function App() {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [isLocked, setIsLocked] = useState(false);
  const [connectionRequest, setConnectionRequest] = useState<DAppConnectionRequest | null>(null);
  const [selectedWalletForConnection, setSelectedWalletForConnection] = useState<Wallet | null>(null);
  const [transactionRequest, setTransactionRequest] = useState<DAppTransactionRequestType | null>(null);
  const [selectedWalletForTransaction, setSelectedWalletForTransaction] = useState<Wallet | null>(null);
  const [connectedDAppWallet, setConnectedDAppWallet] = useState<Wallet | null>(null);

  // Listen for storage changes across tabs
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      // Handle wallet lock state changes
      if (e.key === 'isWalletLocked') {
        const isLocked = e.newValue === 'true';
        setIsLocked(isLocked);
        
        if (isLocked) {
          // If wallet is locked, clear current wallet data
          setWallet(null);
          setWallets([]);
        } else {
          // If wallet is unlocked, reload wallet data with a small delay
          // to ensure localStorage is fully updated
          setTimeout(() => {
            const storedWallets = localStorage.getItem('wallets');
            const activeWalletId = localStorage.getItem('activeWalletId');
            
            if (storedWallets) {
              const parsedWallets = JSON.parse(storedWallets);
              setWallets(parsedWallets);
              
              if (parsedWallets.length > 0) {
                let activeWallet = parsedWallets[0];
                if (activeWalletId) {
                  const foundWallet = parsedWallets.find((w: Wallet) => w.address === activeWalletId);
                  if (foundWallet) {
                    activeWallet = foundWallet;
                  }
                }
                setWallet(activeWallet);
              }
            }
          }, 100);
        }
      }
      
      // Handle wallet data changes
      if (e.key === 'wallets' && !isLocked) {
        // Only update if we don't have wallets or if the data actually changed
        if (e.newValue) {
          const newWallets = JSON.parse(e.newValue);
          setWallets(newWallets);
          
          // Update active wallet if needed
          const activeWalletId = localStorage.getItem('activeWalletId');
          if (activeWalletId && newWallets.length > 0) {
            const foundWallet = newWallets.find((w: Wallet) => w.address === activeWalletId);
            if (foundWallet) {
              setWallet(foundWallet);
            }
          } else if (newWallets.length > 0 && !wallet) {
            // If no active wallet is set but we have wallets, set the first one
            setWallet(newWallets[0]);
          }
        }
      }
      
      // Handle active wallet changes
      if (e.key === 'activeWalletId' && !isLocked) {
        const newActiveWalletId = e.newValue;
        const currentWallets = wallets.length > 0 ? wallets : JSON.parse(localStorage.getItem('wallets') || '[]');
        if (newActiveWalletId && currentWallets.length > 0) {
          const foundWallet = currentWallets.find((w: Wallet) => w.address === newActiveWalletId);
          if (foundWallet) {
            setWallet(foundWallet);
          }
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [isLocked, wallets, wallet]);

  useEffect(() => {
    // Check for dApp requests in URL
    const urlParams = new URLSearchParams(window.location.search);
    const action = urlParams.get('action');
    
    if (action === 'send') {
      // Handle transaction request
      const to = urlParams.get('to');
      const amount = urlParams.get('amount');
      const successUrl = urlParams.get('success_url');
      const failureUrl = urlParams.get('failure_url');
      const origin = urlParams.get('origin');
      const appName = urlParams.get('app_name');
      const message = urlParams.get('message');
      
      if (to && amount && successUrl && failureUrl && origin) {
        setTransactionRequest({
          action: 'send',
          to: decodeURIComponent(to),
          amount: decodeURIComponent(amount),
          origin: decodeURIComponent(origin),
          successUrl: decodeURIComponent(successUrl),
          failureUrl: decodeURIComponent(failureUrl),
          appName: appName ? decodeURIComponent(appName) : undefined,
          message: message ? decodeURIComponent(message) : undefined
        });
      }
    } else {
      // Check for dApp connection request (existing logic)
      const successUrl = urlParams.get('success_url');
      const failureUrl = urlParams.get('failure_url');
      const origin = urlParams.get('origin');
      const appName = urlParams.get('app_name');
      
      if (successUrl && failureUrl && origin) {
        setConnectionRequest({
          origin: decodeURIComponent(origin),
          successUrl: decodeURIComponent(successUrl),
          failureUrl: decodeURIComponent(failureUrl),
          permissions: ['view_address', 'view_balance', 'call_methods'],
          appName: appName ? decodeURIComponent(appName) : undefined
        });
      }
    }

    // Check if wallet is locked
    const walletLocked = localStorage.getItem('isWalletLocked');
    const hasPassword = localStorage.getItem('walletPasswordHash');
    
    if (hasPassword && walletLocked !== 'false') {
      setIsLocked(true);
      return;
    }
    const storedWallets = localStorage.getItem('wallets');
    const activeWalletId = localStorage.getItem('activeWalletId');
    if (storedWallets) {
      const parsedWallets = JSON.parse(storedWallets);
      setWallets(parsedWallets);
      
      // Set active wallet based on stored ID or default to first wallet
      if (parsedWallets.length > 0) {
        let activeWallet = parsedWallets[0];
        if (activeWalletId) {
          const foundWallet = parsedWallets.find((w: Wallet) => w.address === activeWalletId);
          if (foundWallet) {
            activeWallet = foundWallet;
          }
        }
        setWallet(activeWallet);
      }
    }
  }, []);

  // Check for existing dApp connection when transaction request is made
  useEffect(() => {
    if (transactionRequest && wallets.length > 0) {
      const connections = JSON.parse(localStorage.getItem('connectedDApps') || '[]');
      const existingConnection = connections.find((conn: any) => conn.origin === transactionRequest.origin);
      
      if (existingConnection) {
        // Find the connected wallet
        const connectedWallet = wallets.find(w => w.address === existingConnection.selectedAddress);
        if (connectedWallet) {
          setConnectedDAppWallet(connectedWallet);
          setSelectedWalletForTransaction(connectedWallet);
        }
      }
    }
  }, [transactionRequest, wallets]);

  // Check for existing dApp connection when connection request is made
  useEffect(() => {
    if (connectionRequest && wallets.length > 0) {
      const connections = JSON.parse(localStorage.getItem('connectedDApps') || '[]');
      const existingConnection = connections.find((conn: any) => conn.origin === connectionRequest.origin);
      
      // Always set a default wallet selection
      if (!selectedWalletForConnection && wallets.length > 0) {
        if (existingConnection) {
          // If there's an existing connection, try to use that wallet
          const connectedWallet = wallets.find(w => w.address === existingConnection.selectedAddress);
          setSelectedWalletForConnection(connectedWallet || wallets[0]);
        } else {
          // If no existing connection, use first wallet
          setSelectedWalletForConnection(wallets[0]);
        }
      }
    }
  }, [connectionRequest, wallets, selectedWalletForConnection]);
  const handleUnlock = (unlockedWallets: Wallet[]) => {
    setWallets(unlockedWallets);
    setIsLocked(false);
    
    // Set active wallet
    if (unlockedWallets.length > 0) {
      const activeWalletId = localStorage.getItem('activeWalletId');
      let activeWallet = unlockedWallets[0];
      if (activeWalletId) {
        const foundWallet = unlockedWallets.find(w => w.address === activeWalletId);
        if (foundWallet) {
          activeWallet = foundWallet;
        }
      }
      setWallet(activeWallet);
    }
  };

  const handleConnectionApprove = (selectedWallet: Wallet) => {
    if (!connectionRequest) return;
    
    // Redirect to success URL with wallet info
    const successUrl = new URL(connectionRequest.successUrl);
    successUrl.searchParams.set('account_id', selectedWallet.address);
    if (selectedWallet.publicKey) {
      successUrl.searchParams.set('public_key', selectedWallet.publicKey);
    }
    
    // Clear the connection request before redirecting
    setConnectionRequest(null);
    setSelectedWalletForConnection(null);
    
    // Clear URL parameters
    window.history.replaceState({}, document.title, window.location.pathname);
    
    // Redirect to success URL
    window.location.href = successUrl.toString();
  };

  const handleConnectionReject = () => {
    if (!connectionRequest) return;
    
    // Clear the connection request before redirecting
    setConnectionRequest(null);
    setSelectedWalletForConnection(null);
    
    // Clear URL parameters
    window.history.replaceState({}, document.title, window.location.pathname);
    
    // Redirect to failure URL
    window.location.href = connectionRequest.failureUrl;
  };

  const handleTransactionApprove = (txHash: string) => {
    if (!transactionRequest) return;
    
    // Redirect to success URL with transaction hash
    const successUrl = new URL(transactionRequest.successUrl);
    successUrl.searchParams.set('tx_hash', txHash);
    
    window.location.href = successUrl.toString();
  };

  const handleTransactionReject = () => {
    if (!transactionRequest) return;
    
    // Redirect to failure URL
    window.location.href = transactionRequest.failureUrl;
  };

  const addWallet = (newWallet: Wallet) => {
    // Check if wallet already exists
    const existingWallet = wallets.find(w => w.address === newWallet.address);
    if (existingWallet) {
      // If wallet exists, just switch to it
      setWallet(existingWallet);
      localStorage.setItem('activeWalletId', existingWallet.address);
      return;
    }
    
    const updatedWallets = [...wallets, newWallet];
    setWallets(updatedWallets);
    setWallet(newWallet);
    
    // Save to both regular storage and encrypted storage
    localStorage.setItem('wallets', JSON.stringify(updatedWallets));
    localStorage.setItem('activeWalletId', newWallet.address);
    
    // Also save to encrypted storage if password protection is enabled
    const hasPassword = localStorage.getItem('walletPasswordHash');
    if (hasPassword) {
      // Update encrypted wallets storage
      const existingEncryptedWallets = JSON.parse(localStorage.getItem('encryptedWallets') || '[]');
      const walletExists = existingEncryptedWallets.some((w: any) => w.address === newWallet.address);
      
      if (!walletExists) {
        // For now, we'll add a placeholder - the actual encryption should happen during password setup
        // This is a temporary solution to prevent wallet loss
        const newEncryptedWallet = {
          address: newWallet.address,
          encryptedData: JSON.stringify(newWallet), // Temporary - should be properly encrypted
          createdAt: Date.now()
        };
        const updatedEncryptedWallets = [...existingEncryptedWallets, newEncryptedWallet];
        localStorage.setItem('encryptedWallets', JSON.stringify(updatedEncryptedWallets));
      }
    }
  };

  const switchWallet = (selectedWallet: Wallet) => {
    setWallet(selectedWallet);
    localStorage.setItem('activeWalletId', selectedWallet.address);
  };

  const removeWallet = (walletToRemove: Wallet) => {
    const updatedWallets = wallets.filter(w => w.address !== walletToRemove.address);
    setWallets(updatedWallets);
    localStorage.setItem('wallets', JSON.stringify(updatedWallets));
    
    // Only update wallet state if we're removing the currently active wallet
    // and there are no remaining wallets
    if (wallet?.address === walletToRemove.address && updatedWallets.length === 0) {
      setWallet(null);
      localStorage.removeItem('activeWalletId');
    }
    
    // Note: Active wallet switching is handled in WalletDashboard component
    // to ensure proper state synchronization
  };

  const disconnectWallet = () => {
    // Only clear UI state, don't remove wallet data from localStorage
    setWallet(null);
    setWallets([]);
    setIsLocked(true);
  };

  // Show unlock screen if wallet is locked
  if (isLocked) {
    return (
      <ThemeProvider defaultTheme="dark" storageKey="octra-wallet-theme">
        <div className="min-h-screen bg-background">
          <UnlockWallet onUnlock={handleUnlock} />
          <Toaster />
        </div>
      </ThemeProvider>
    );
  }

  // Show dApp transaction request screen if there's a transaction request
  if (transactionRequest && wallets.length > 0) {
    return (
      <ThemeProvider defaultTheme="dark" storageKey="octra-wallet-theme">
        <div className="min-h-screen bg-background">
          <TransactionRequestDialog
            transactionRequest={transactionRequest}
            wallets={wallets}
            selectedWallet={selectedWalletForTransaction}
            connectedWallet={connectedDAppWallet}
            onWalletSelect={setSelectedWalletForTransaction}
            onApprove={handleTransactionApprove}
            onReject={handleTransactionReject}
          />
          <Toaster />
        </div>
      </ThemeProvider>
    );
  }

  // Show dApp connection screen if there's a connection request
  if (connectionRequest && wallets.length > 0) {
    return (
      <ThemeProvider defaultTheme="dark" storageKey="octra-wallet-theme">
        <div className="min-h-screen bg-background">
          <DAppConnection
            connectionRequest={connectionRequest}
            wallets={wallets}
            selectedWallet={selectedWalletForConnection}
            onWalletSelect={setSelectedWalletForConnection}
            onApprove={handleConnectionApprove}
            onReject={handleConnectionReject}
          />
          <Toaster />
        </div>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider defaultTheme="dark" storageKey="octra-wallet-theme">
      <div className="min-h-screen bg-background">
        {!wallet ? (
          <WelcomeScreen onWalletCreated={addWallet} />
        ) : (
          <WalletDashboard 
            wallet={wallet} 
            wallets={wallets}
            onDisconnect={disconnectWallet}
            onSwitchWallet={switchWallet}
            onAddWallet={addWallet}
            onRemoveWallet={removeWallet}
          />
        )}
        <Toaster />
      </div>
    </ThemeProvider>
  );
}

export default App;