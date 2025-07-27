// Injected script for dApp wallet API
(function() {
  'use strict';

  // Prevent multiple injections
  if (window.octraWallet) return;

  class OctraWallet {
    constructor() {
      this.isConnected = false;
      this.currentAccount = null;
      this.requestId = 0;
      this.pendingRequests = new Map();
      this.setupMessageHandlers();
    }

    setupMessageHandlers() {
      window.addEventListener('message', (event) => {
        if (event.source !== window) return;

        switch (event.data.type) {
          case 'OCTRA_WALLET_RESPONSE':
            this.handleResponse(event.data);
            break;
          case 'OCTRA_WALLET_CONNECTION_SUCCESS':
            this.handleConnectionSuccess(event.data);
            break;
          case 'OCTRA_WALLET_CONNECTION_FAILED':
            this.handleConnectionFailed(event.data);
            break;
          case 'OCTRA_WALLET_TRANSACTION_SUCCESS':
            this.handleTransactionSuccess(event.data);
            break;
          case 'OCTRA_WALLET_TRANSACTION_FAILED':
            this.handleTransactionFailed(event.data);
            break;
        }
      });
    }

    generateRequestId() {
      return `req_${++this.requestId}_${Date.now()}`;
    }

    sendRequest(type, data = {}) {
      return new Promise((resolve, reject) => {
        const requestId = this.generateRequestId();
        
        this.pendingRequests.set(requestId, { resolve, reject });
        
        window.postMessage({
          type,
          requestId,
          ...data
        }, '*');

        // Timeout after 30 seconds
        setTimeout(() => {
          if (this.pendingRequests.has(requestId)) {
            this.pendingRequests.delete(requestId);
            reject(new Error('Request timeout'));
          }
        }, 30000);
      });
    }

    handleResponse(data) {
      const { requestId, data: responseData } = data;
      const request = this.pendingRequests.get(requestId);
      
      if (request) {
        this.pendingRequests.delete(requestId);
        
        if (responseData.success) {
          request.resolve(responseData);
        } else {
          request.reject(new Error(responseData.error || 'Request failed'));
        }
      }
    }

    handleConnectionSuccess(data) {
      this.isConnected = true;
      this.currentAccount = data.data.accountId;
      
      // Dispatch custom event
      window.dispatchEvent(new CustomEvent('octraWalletConnected', {
        detail: data.data
      }));
    }

    handleConnectionFailed(data) {
      this.isConnected = false;
      this.currentAccount = null;
      
      // Dispatch custom event
      window.dispatchEvent(new CustomEvent('octraWalletConnectionFailed', {
        detail: data.data
      }));
    }

    handleTransactionSuccess(data) {
      // Dispatch custom event
      window.dispatchEvent(new CustomEvent('octraWalletTransactionSuccess', {
        detail: data.data
      }));
    }

    handleTransactionFailed(data) {
      // Dispatch custom event
      window.dispatchEvent(new CustomEvent('octraWalletTransactionFailed', {
        detail: data.data
      }));
    }

    // Public API methods
    async isInstalled() {
      try {
        const response = await this.sendRequest('OCTRA_WALLET_GET_STATE');
        return response.isInstalled || false;
      } catch (error) {
        return false;
      }
    }

    async isUnlocked() {
      try {
        const response = await this.sendRequest('OCTRA_WALLET_GET_STATE');
        return response.isUnlocked || false;
      } catch (error) {
        return false;
      }
    }

    async connect(options = {}) {
      try {
        const response = await this.sendRequest('OCTRA_WALLET_REQUEST_CONNECTION', {
          appName: options.appName || document.title || window.location.hostname,
          permissions: options.permissions || ['view_address', 'view_balance', 'call_methods']
        });

        if (response.connected) {
          this.isConnected = true;
          this.currentAccount = response.address;
          return {
            success: true,
            address: response.address
          };
        }

        return response;
      } catch (error) {
        throw new Error(`Connection failed: ${error.message}`);
      }
    }

    async disconnect() {
      this.isConnected = false;
      this.currentAccount = null;
      
      // Clear any stored connection data
      try {
        await this.sendRequest('OCTRA_WALLET_DISCONNECT');
      } catch (error) {
        console.warn('Error during disconnect:', error);
      }
      
      return { success: true };
    }

    async getAccount() {
      if (!this.isConnected) {
        throw new Error('Wallet not connected');
      }
      
      return {
        address: this.currentAccount,
        isConnected: this.isConnected
      };
    }

    async sendTransaction(transactionData) {
      if (!this.isConnected) {
        throw new Error('Wallet not connected');
      }

      if (!transactionData.to || !transactionData.amount) {
        throw new Error('Invalid transaction data: to and amount are required');
      }

      try {
        const response = await this.sendRequest('OCTRA_WALLET_REQUEST_TRANSACTION', {
          to: transactionData.to,
          amount: transactionData.amount.toString(),
          message: transactionData.message,
          appName: document.title || window.location.hostname
        });

        return response;
      } catch (error) {
        throw new Error(`Transaction failed: ${error.message}`);
      }
    }

    async signMessage(message) {
      if (!this.isConnected) {
        throw new Error('Wallet not connected');
      }

      try {
        const response = await this.sendRequest('OCTRA_WALLET_SIGN_MESSAGE', {
          message,
          appName: document.title || window.location.hostname
        });

        return response;
      } catch (error) {
        throw new Error(`Message signing failed: ${error.message}`);
      }
    }

    // Event listeners
    on(event, callback) {
      window.addEventListener(`octraWallet${event.charAt(0).toUpperCase() + event.slice(1)}`, callback);
    }

    off(event, callback) {
      window.removeEventListener(`octraWallet${event.charAt(0).toUpperCase() + event.slice(1)}`, callback);
    }
  }

  // Create wallet instance
  const wallet = new OctraWallet();

  // Expose wallet API to window
  Object.defineProperty(window, 'octraWallet', {
    value: wallet,
    writable: false,
    configurable: false
  });

  // Also expose as octra for compatibility
  Object.defineProperty(window, 'octra', {
    value: { wallet },
    writable: false,
    configurable: false
  });

  // Dispatch wallet ready event
  window.dispatchEvent(new CustomEvent('octraWalletReady', {
    detail: { wallet }
  }));

  // Legacy support - dispatch after a short delay to ensure page is ready
  setTimeout(() => {
    window.dispatchEvent(new CustomEvent('octraWalletInjected', {
      detail: { wallet }
    }));
  }, 100);

})();