// Background service worker for Chrome Extension
class BackgroundManager {
  constructor() {
    this.init();
  }

  init() {
    this.setupEventListeners();
    this.setupAlarms();
  }

  setupEventListeners() {
    // Handle extension installation
    chrome.runtime.onInstalled.addListener((details) => {
      if (details.reason === 'install') {
        this.handleFirstInstall();
      }
    });

    // Handle messages from popup and content scripts
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      this.handleMessage(request, sender, sendResponse);
      return true; // Keep message channel open for async responses
    });

    // Handle tab updates for dApp integration
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && tab.url) {
        this.checkForDAppRequests(tab);
      }
    });

    // Handle alarm events for periodic tasks
    chrome.alarms.onAlarm.addListener((alarm) => {
      this.handleAlarm(alarm);
    });
  }

  setupAlarms() {
    // Set up periodic balance refresh (every 5 minutes)
    chrome.alarms.create('refreshBalance', {
      delayInMinutes: 1,
      periodInMinutes: 5
    });

    // Set up notification cleanup
    chrome.alarms.create('cleanupNotifications', {
      delayInMinutes: 60,
      periodInMinutes: 60
    });
  }

  async handleFirstInstall() {
    try {
      // Open welcome tab
      await chrome.tabs.create({
        url: chrome.runtime.getURL('index.html'),
        active: true
      });

      // Show welcome notification
      await this.showNotification(
        'Octra Wallet Installed!',
        'Welcome to Octra Web Wallet. Click to get started.',
        'welcome'
      );

      // Initialize default settings
      await chrome.storage.local.set({
        extensionSettings: {
          notifications: true,
          autoRefresh: true,
          dAppIntegration: true,
          theme: 'dark'
        },
        rpcProviders: [{
          id: 'default',
          name: 'Octra Network (Default)',
          url: 'https://octra.network',
          headers: {},
          priority: 1,
          isActive: true,
          createdAt: Date.now()
        }]
      });

    } catch (error) {
      console.error('Error during first install:', error);
    }
  }

  async handleMessage(request, sender, sendResponse) {
    try {
      switch (request.action) {
        case 'fetchBalance':
          await this.handleFetchBalance(request, sendResponse);
          break;

        case 'unlockWallet':
          await this.handleUnlockWallet(request, sendResponse);
          break;

        case 'lockWallet':
          await this.handleLockWallet(request, sendResponse);
          break;

        case 'sendTransaction':
          await this.handleSendTransaction(request, sendResponse);
          break;

        case 'getDAppPermissions':
          await this.handleGetDAppPermissions(request, sendResponse);
          break;

        case 'requestDAppConnection':
          await this.handleDAppConnection(request, sendResponse);
          break;

        case 'getWalletState':
          await this.handleGetWalletState(request, sendResponse);
          break;

        default:
          sendResponse({ success: false, error: 'Unknown action' });
      }
    } catch (error) {
      console.error('Error handling message:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  async handleFetchBalance(request, sendResponse) {
    try {
      const { address, privateKey } = request;
      
      // Get active RPC provider
      const rpcProvider = await this.getActiveRPCProvider();
      
      // Fetch balance from API
      const balanceResponse = await this.makeAPIRequest(
        `/balance/${address}`,
        rpcProvider
      );

      let balance = 0;
      let nonce = 0;

      if (balanceResponse.ok) {
        const balanceData = await balanceResponse.json();
        balance = parseFloat(balanceData.balance || '0');
        nonce = balanceData.nonce || 0;
      }

      // Fetch encrypted balance
      let encryptedBalance = null;
      try {
        const encResponse = await this.makeAPIRequest(
          `/view_encrypted_balance/${address}`,
          rpcProvider,
          {
            headers: { 'X-Private-Key': privateKey }
          }
        );

        if (encResponse.ok) {
          const encData = await encResponse.json();
          encryptedBalance = {
            public: parseFloat(encData.public_balance?.split(' ')[0] || '0'),
            encrypted: parseFloat(encData.encrypted_balance?.split(' ')[0] || '0'),
            total: parseFloat(encData.total_balance?.split(' ')[0] || '0')
          };
        }
      } catch (error) {
        console.warn('Failed to fetch encrypted balance:', error);
      }

      sendResponse({
        success: true,
        balance,
        nonce,
        encryptedBalance
      });

    } catch (error) {
      console.error('Error fetching balance:', error);
      sendResponse({
        success: false,
        error: error.message,
        balance: 0,
        nonce: 0
      });
    }
  }

  async handleUnlockWallet(request, sendResponse) {
    try {
      const { password } = request;
      
      // Get stored password hash and salt
      const result = await chrome.storage.local.get(['walletPasswordHash', 'walletPasswordSalt', 'encryptedWallets']);
      
      if (!result.walletPasswordHash || !result.walletPasswordSalt) {
        throw new Error('No password set');
      }

      // Verify password
      const isValid = await this.verifyPassword(password, result.walletPasswordHash, result.walletPasswordSalt);
      
      if (!isValid) {
        sendResponse({ success: false, error: 'Invalid password' });
        return;
      }

      // Decrypt wallets
      const decryptedWallets = [];
      if (result.encryptedWallets) {
        for (const encWallet of result.encryptedWallets) {
          try {
            const decryptedData = await this.decryptWalletData(encWallet.encryptedData, password);
            const wallet = JSON.parse(decryptedData);
            decryptedWallets.push(wallet);
          } catch (error) {
            console.error('Failed to decrypt wallet:', error);
          }
        }
      }

      // Update storage
      await chrome.storage.local.set({
        isWalletLocked: 'false',
        wallets: decryptedWallets
      });

      sendResponse({
        success: true,
        wallets: decryptedWallets
      });

    } catch (error) {
      console.error('Error unlocking wallet:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  async handleLockWallet(request, sendResponse) {
    try {
      await chrome.storage.local.set({ isWalletLocked: 'true' });
      sendResponse({ success: true });
    } catch (error) {
      console.error('Error locking wallet:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  async handleGetWalletState(request, sendResponse) {
    try {
      const result = await chrome.storage.local.get(['wallets', 'isWalletLocked', 'activeWalletId']);
      
      let state = 'no-wallet';
      if (result.wallets && result.wallets.length > 0) {
        state = result.isWalletLocked === 'true' ? 'locked' : 'active';
      }

      sendResponse({
        success: true,
        state,
        wallets: result.wallets || [],
        activeWalletId: result.activeWalletId
      });
    } catch (error) {
      console.error('Error getting wallet state:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  async checkForDAppRequests(tab) {
    try {
      const url = new URL(tab.url);
      const params = url.searchParams;
      
      // Check for dApp connection or transaction requests
      if (params.get('success_url') && params.get('failure_url') && params.get('origin')) {
        // This is a dApp request, show notification
        const appName = params.get('app_name') || url.hostname;
        const action = params.get('action');
        
        let title, message;
        if (action === 'send') {
          title = 'Transaction Request';
          message = `${appName} wants to send a transaction`;
        } else {
          title = 'Connection Request';
          message = `${appName} wants to connect to your wallet`;
        }

        await this.showNotification(title, message, 'dapp-request', {
          tabId: tab.id,
          url: tab.url
        });
      }
    } catch (error) {
      console.error('Error checking dApp requests:', error);
    }
  }

  async handleAlarm(alarm) {
    switch (alarm.name) {
      case 'refreshBalance':
        await this.refreshAllBalances();
        break;
      case 'cleanupNotifications':
        await this.cleanupOldNotifications();
        break;
    }
  }

  async refreshAllBalances() {
    try {
      const result = await chrome.storage.local.get(['wallets', 'isWalletLocked', 'extensionSettings']);
      
      if (!result.extensionSettings?.autoRefresh || 
          result.isWalletLocked === 'true' || 
          !result.wallets?.length) {
        return;
      }

      const rpcProvider = await this.getActiveRPCProvider();
      
      for (const wallet of result.wallets) {
        try {
          const response = await this.makeAPIRequest(`/balance/${wallet.address}`, rpcProvider);
          if (response.ok) {
            const data = await response.json();
            // Store updated balance for badge updates
            await chrome.storage.local.set({
              [`balance_${wallet.address}`]: {
                balance: parseFloat(data.balance || '0'),
                nonce: data.nonce || 0,
                lastUpdated: Date.now()
              }
            });
          }
        } catch (error) {
          console.error(`Error refreshing balance for ${wallet.address}:`, error);
        }
      }
    } catch (error) {
      console.error('Error in refreshAllBalances:', error);
    }
  }

  async getActiveRPCProvider() {
    try {
      const result = await chrome.storage.local.get(['rpcProviders']);
      const providers = result.rpcProviders || [];
      return providers.find(p => p.isActive) || {
        id: 'default',
        name: 'Octra Network (Default)',
        url: 'https://octra.network',
        headers: {},
        priority: 1,
        isActive: true,
        createdAt: Date.now()
      };
    } catch (error) {
      console.error('Error getting RPC provider:', error);
      return {
        id: 'default',
        name: 'Octra Network (Default)',
        url: 'https://octra.network',
        headers: {},
        priority: 1,
        isActive: true,
        createdAt: Date.now()
      };
    }
  }

  async makeAPIRequest(endpoint, rpcProvider, options = {}) {
    const url = `${rpcProvider.url}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...rpcProvider.headers,
      ...options.headers
    };

    return fetch(url, {
      ...options,
      headers,
      signal: AbortSignal.timeout(30000)
    });
  }

  async showNotification(title, message, notificationId, data = {}) {
    try {
      const settings = await chrome.storage.local.get(['extensionSettings']);
      if (!settings.extensionSettings?.notifications) return;

      await chrome.notifications.create(notificationId, {
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title,
        message,
        ...data
      });
    } catch (error) {
      console.error('Error showing notification:', error);
    }
  }

  async cleanupOldNotifications() {
    try {
      const notifications = await chrome.notifications.getAll();
      const now = Date.now();
      
      for (const [id, notification] of Object.entries(notifications)) {
        // Clear notifications older than 1 hour
        if (now - notification.timestamp > 3600000) {
          await chrome.notifications.clear(id);
        }
      }
    } catch (error) {
      console.error('Error cleaning up notifications:', error);
    }
  }

  // Crypto utilities for extension
  async verifyPassword(password, hashedPassword, salt) {
    const encoder = new TextEncoder();
    const saltBytes = new Uint8Array(Buffer.from(salt, 'hex'));
    const passwordBytes = encoder.encode(password);
    
    const combined = new Uint8Array(passwordBytes.length + saltBytes.length);
    combined.set(passwordBytes);
    combined.set(saltBytes, passwordBytes.length);
    
    const hashBuffer = await crypto.subtle.digest('SHA-256', combined);
    const newHash = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    return newHash === hashedPassword;
  }

  async decryptWalletData(encryptedData, password) {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    
    const key = await crypto.subtle.importKey(
      'raw',
      await crypto.subtle.digest('SHA-256', encoder.encode(password)),
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );
    
    const combined = new Uint8Array(Buffer.from(encryptedData, 'base64'));
    const iv = combined.slice(0, 12);
    const encrypted = combined.slice(12);
    
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      encrypted
    );
    
    return decoder.decode(decrypted);
  }
}

// Initialize background manager
new BackgroundManager();

// Handle notification clicks
chrome.notifications.onClicked.addListener(async (notificationId) => {
  if (notificationId === 'welcome') {
    await chrome.tabs.create({
      url: chrome.runtime.getURL('index.html'),
      active: true
    });
  } else if (notificationId === 'dapp-request') {
    // Focus the tab with the dApp request
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]) {
      await chrome.tabs.update(tabs[0].id, { active: true });
    }
  }
  
  await chrome.notifications.clear(notificationId);
});