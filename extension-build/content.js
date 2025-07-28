// Content script for dApp integration
class DAppIntegration {
  constructor() {
    this.isInjected = false;
    this.init();
  }

  init() {
    // Only inject on HTTPS sites or localhost
    if (location.protocol === 'https:' || location.hostname === 'localhost') {
      this.injectWalletAPI();
      this.setupMessageHandlers();
    }
  }

  injectWalletAPI() {
    if (this.isInjected) return;

    // Inject the wallet API script
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('injected.js');
    script.onload = () => script.remove();
    (document.head || document.documentElement).appendChild(script);

    this.isInjected = true;
  }

  setupMessageHandlers() {
    // Listen for messages from injected script
    window.addEventListener('message', async (event) => {
      if (event.source !== window || !event.data.type) return;

      switch (event.data.type) {
        case 'OCTRA_WALLET_REQUEST_CONNECTION':
          await this.handleConnectionRequest(event.data);
          break;
        case 'OCTRA_WALLET_REQUEST_TRANSACTION':
          await this.handleTransactionRequest(event.data);
          break;
        case 'OCTRA_WALLET_GET_STATE':
          await this.handleGetState(event.data);
          break;
      }
    });

    // Listen for messages from background script
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'dAppResponse') {
        // Forward response to injected script
        window.postMessage({
          type: 'OCTRA_WALLET_RESPONSE',
          requestId: request.requestId,
          data: request.data
        }, '*');
      }
    });
  }

  async handleConnectionRequest(data) {
    try {
      // Check if wallet is available and unlocked
      const walletState = await chrome.runtime.sendMessage({
        action: 'getWalletState'
      });

      if (!walletState.success || walletState.state !== 'active') {
        this.sendResponse(data.requestId, {
          success: false,
          error: 'Wallet not available or locked'
        });
        return;
      }

      // Check existing connections
      const connections = await chrome.storage.local.get(['connectedDApps']);
      const existingConnection = connections.connectedDApps?.find(
        conn => conn.origin === location.origin
      );

      if (existingConnection) {
        // Already connected, return connection info
        this.sendResponse(data.requestId, {
          success: true,
          address: existingConnection.selectedAddress,
          connected: true
        });
        return;
      }

      // Create connection request URL
      const params = new URLSearchParams({
        origin: location.origin,
        app_name: data.appName || document.title || location.hostname,
        success_url: location.href + '?connection=success',
        failure_url: location.href + '?connection=failed'
      });

      // Open wallet for connection approval
      const walletUrl = chrome.runtime.getURL('index.html') + '?' + params.toString();
      await chrome.tabs.create({ url: walletUrl, active: true });

      // The response will be handled by URL parameters when user returns
      this.sendResponse(data.requestId, {
        success: true,
        pending: true,
        message: 'Connection request sent to wallet'
      });

    } catch (error) {
      console.error('Error handling connection request:', error);
      this.sendResponse(data.requestId, {
        success: false,
        error: error.message
      });
    }
  }

  async handleTransactionRequest(data) {
    try {
      // Check if wallet is available and unlocked
      const walletState = await chrome.runtime.sendMessage({
        action: 'getWalletState'
      });

      if (!walletState.success || walletState.state !== 'active') {
        this.sendResponse(data.requestId, {
          success: false,
          error: 'Wallet not available or locked'
        });
        return;
      }

      // Validate transaction data
      if (!data.to || !data.amount) {
        this.sendResponse(data.requestId, {
          success: false,
          error: 'Invalid transaction data'
        });
        return;
      }

      // Create transaction request URL
      const params = new URLSearchParams({
        action: 'send',
        to: data.to,
        amount: data.amount,
        origin: location.origin,
        app_name: data.appName || document.title || location.hostname,
        success_url: location.href + '?transaction=success',
        failure_url: location.href + '?transaction=failed'
      });

      if (data.message) {
        params.set('message', data.message);
      }

      // Open wallet for transaction approval
      const walletUrl = chrome.runtime.getURL('index.html') + '?' + params.toString();
      await chrome.tabs.create({ url: walletUrl, active: true });

      this.sendResponse(data.requestId, {
        success: true,
        pending: true,
        message: 'Transaction request sent to wallet'
      });

    } catch (error) {
      console.error('Error handling transaction request:', error);
      this.sendResponse(data.requestId, {
        success: false,
        error: error.message
      });
    }
  }

  async handleGetState(data) {
    try {
      const walletState = await chrome.runtime.sendMessage({
        action: 'getWalletState'
      });

      this.sendResponse(data.requestId, {
        success: true,
        isInstalled: true,
        isUnlocked: walletState.state === 'active',
        hasWallet: walletState.wallets?.length > 0
      });

    } catch (error) {
      console.error('Error getting wallet state:', error);
      this.sendResponse(data.requestId, {
        success: false,
        error: error.message
      });
    }
  }

  sendResponse(requestId, data) {
    window.postMessage({
      type: 'OCTRA_WALLET_RESPONSE',
      requestId,
      data
    }, '*');
  }
}

// Initialize dApp integration
new DAppIntegration();

// Handle page navigation for dApp responses
window.addEventListener('load', () => {
  const urlParams = new URLSearchParams(window.location.search);
  
  // Handle connection responses
  if (urlParams.get('connection') === 'success') {
    const accountId = urlParams.get('account_id');
    const publicKey = urlParams.get('public_key');
    
    window.postMessage({
      type: 'OCTRA_WALLET_CONNECTION_SUCCESS',
      data: { accountId, publicKey }
    }, '*');
  } else if (urlParams.get('connection') === 'failed') {
    window.postMessage({
      type: 'OCTRA_WALLET_CONNECTION_FAILED',
      data: { error: 'Connection rejected by user' }
    }, '*');
  }

  // Handle transaction responses
  if (urlParams.get('transaction') === 'success') {
    const txHash = urlParams.get('tx_hash');
    
    window.postMessage({
      type: 'OCTRA_WALLET_TRANSACTION_SUCCESS',
      data: { txHash }
    }, '*');
  } else if (urlParams.get('transaction') === 'failed') {
    window.postMessage({
      type: 'OCTRA_WALLET_TRANSACTION_FAILED',
      data: { error: 'Transaction rejected by user' }
    }, '*');
  }
});