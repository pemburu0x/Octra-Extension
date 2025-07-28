// Popup script for Chrome Extension
class PopupManager {
  constructor() {
    this.currentState = 'loading';
    this.walletData = null;
    this.init();
  }

  async init() {
    await this.loadWalletState();
    this.setupEventListeners();
    this.updateUI();
  }

  async loadWalletState() {
    try {
      // Check if wallet exists and is unlocked
      const result = await chrome.storage.local.get(['wallets', 'isWalletLocked', 'activeWalletId']);
      
      if (!result.wallets || result.wallets.length === 0) {
        this.currentState = 'no-wallet';
      } else if (result.isWalletLocked === 'true') {
        this.currentState = 'locked';
      } else {
        this.currentState = 'active';
        this.walletData = this.findActiveWallet(result.wallets, result.activeWalletId);
        await this.loadBalanceData();
      }
    } catch (error) {
      console.error('Error loading wallet state:', error);
      this.currentState = 'no-wallet';
    }
  }

  findActiveWallet(wallets, activeWalletId) {
    if (activeWalletId) {
      return wallets.find(w => w.address === activeWalletId) || wallets[0];
    }
    return wallets[0];
  }

  async loadBalanceData() {
    if (!this.walletData) return;

    try {
      // Send message to background script to fetch balance
      const response = await chrome.runtime.sendMessage({
        action: 'fetchBalance',
        address: this.walletData.address,
        privateKey: this.walletData.privateKey
      });

      if (response.success) {
        this.walletData.balance = response.balance;
        this.walletData.nonce = response.nonce;
        this.walletData.encryptedBalance = response.encryptedBalance;
        this.updateBalanceDisplay();
      }
    } catch (error) {
      console.error('Error loading balance:', error);
    }
  }

  setupEventListeners() {
    // Password toggle
    const togglePasswordBtn = document.getElementById('toggle-password');
    const passwordInput = document.getElementById('password');
    
    if (togglePasswordBtn && passwordInput) {
      togglePasswordBtn.addEventListener('click', () => {
        const type = passwordInput.type === 'password' ? 'text' : 'password';
        passwordInput.type = type;
      });

      passwordInput.addEventListener('input', () => {
        const unlockBtn = document.getElementById('unlock-btn');
        unlockBtn.disabled = !passwordInput.value.trim();
      });

      passwordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && passwordInput.value.trim()) {
          this.handleUnlock();
        }
      });
    }

    // Unlock button
    const unlockBtn = document.getElementById('unlock-btn');
    if (unlockBtn) {
      unlockBtn.addEventListener('click', () => this.handleUnlock());
    }

    // Create wallet button
    const createWalletBtn = document.getElementById('create-wallet-btn');
    if (createWalletBtn) {
      createWalletBtn.addEventListener('click', () => this.openFullWallet());
    }

    // Import wallet button
    const importWalletBtn = document.getElementById('import-wallet-btn');
    if (importWalletBtn) {
      importWalletBtn.addEventListener('click', () => this.openFullWallet());
    }

    // Expand buttons
    const expandBtns = [
      'expand-btn',
      'expand-btn-no-wallet', 
      'expand-btn-active'
    ];
    
    expandBtns.forEach(id => {
      const btn = document.getElementById(id);
      if (btn) {
        btn.addEventListener('click', () => this.openFullWallet());
      }
    });

    // Copy address
    const copyAddressBtn = document.getElementById('copy-address-btn');
    if (copyAddressBtn) {
      copyAddressBtn.addEventListener('click', () => this.copyAddress());
    }

    // Refresh balance
    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => this.refreshBalance());
    }

    // Quick actions
    const sendBtn = document.getElementById('send-btn');
    if (sendBtn) {
      sendBtn.addEventListener('click', () => this.openFullWallet('send'));
    }

    const receiveBtn = document.getElementById('receive-btn');
    if (receiveBtn) {
      receiveBtn.addEventListener('click', () => this.showReceiveModal());
    }

    const historyBtn = document.getElementById('history-btn');
    if (historyBtn) {
      historyBtn.addEventListener('click', () => this.openFullWallet('history'));
    }

    // Lock wallet
    const lockWalletBtn = document.getElementById('lock-wallet-btn');
    if (lockWalletBtn) {
      lockWalletBtn.addEventListener('click', () => this.lockWallet());
    }
  }

  async handleUnlock() {
    const passwordInput = document.getElementById('password');
    const unlockBtn = document.getElementById('unlock-btn');
    const btnText = unlockBtn.querySelector('.btn-text');
    const btnSpinner = unlockBtn.querySelector('.btn-spinner');

    if (!passwordInput.value.trim()) return;

    // Show loading state
    unlockBtn.disabled = true;
    btnText.style.display = 'none';
    btnSpinner.style.display = 'block';

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'unlockWallet',
        password: passwordInput.value
      });

      if (response.success) {
        this.currentState = 'active';
        this.walletData = response.wallets[0];
        await this.loadBalanceData();
        this.updateUI();
        this.showToast('Wallet unlocked successfully!', 'success');
      } else {
        this.showToast('Invalid password', 'error');
      }
    } catch (error) {
      console.error('Unlock error:', error);
      this.showToast('Failed to unlock wallet', 'error');
    } finally {
      // Reset button state
      unlockBtn.disabled = false;
      btnText.style.display = 'block';
      btnSpinner.style.display = 'none';
      passwordInput.value = '';
    }
  }

  async lockWallet() {
    try {
      await chrome.runtime.sendMessage({ action: 'lockWallet' });
      this.currentState = 'locked';
      this.walletData = null;
      this.updateUI();
      this.showToast('Wallet locked', 'success');
    } catch (error) {
      console.error('Lock error:', error);
      this.showToast('Failed to lock wallet', 'error');
    }
  }

  async copyAddress() {
    if (!this.walletData) return;

    try {
      await navigator.clipboard.writeText(this.walletData.address);
      this.showToast('Address copied to clipboard!', 'success');
    } catch (error) {
      console.error('Copy error:', error);
      this.showToast('Failed to copy address', 'error');
    }
  }

  async refreshBalance() {
    const refreshBtn = document.getElementById('refresh-btn');
    if (!refreshBtn || !this.walletData) return;

    // Add spinning animation
    refreshBtn.style.transform = 'rotate(360deg)';
    refreshBtn.style.transition = 'transform 0.5s ease';

    try {
      await this.loadBalanceData();
      this.showToast('Balance refreshed!', 'success');
    } catch (error) {
      console.error('Refresh error:', error);
      this.showToast('Failed to refresh balance', 'error');
    } finally {
      setTimeout(() => {
        refreshBtn.style.transform = 'rotate(0deg)';
      }, 500);
    }
  }

  showReceiveModal() {
    if (!this.walletData) return;

    // Create a simple receive modal in the popup
    const modal = document.createElement('div');
    modal.className = 'receive-modal';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3>Receive OCT</h3>
          <button class="close-btn">&times;</button>
        </div>
        <div class="modal-body">
          <p>Share this address to receive OCT:</p>
          <div class="address-display">
            <code>${this.walletData.address}</code>
            <button class="copy-btn">Copy</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Add event listeners
    modal.querySelector('.close-btn').addEventListener('click', () => {
      document.body.removeChild(modal);
    });

    modal.querySelector('.copy-btn').addEventListener('click', async () => {
      await this.copyAddress();
      document.body.removeChild(modal);
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        document.body.removeChild(modal);
      }
    });
  }

  openFullWallet(tab = '') {
    chrome.tabs.create({
      url: chrome.runtime.getURL('index.html') + (tab ? `#${tab}` : ''),
      active: true
    });
    window.close();
  }

  updateUI() {
    // Hide all states
    document.querySelectorAll('.wallet-state').forEach(state => {
      state.style.display = 'none';
    });

    // Hide loading
    document.getElementById('loading-state').style.display = 'none';

    // Show current state
    switch (this.currentState) {
      case 'locked':
        document.getElementById('locked-state').style.display = 'block';
        break;
      case 'no-wallet':
        document.getElementById('no-wallet-state').style.display = 'block';
        break;
      case 'active':
        document.getElementById('active-state').style.display = 'block';
        this.updateWalletDisplay();
        break;
    }
  }

  updateWalletDisplay() {
    if (!this.walletData) return;

    // Update address display
    const addressElement = document.getElementById('wallet-address');
    if (addressElement) {
      addressElement.textContent = this.truncateAddress(this.walletData.address);
    }

    this.updateBalanceDisplay();
  }

  updateBalanceDisplay() {
    if (!this.walletData) return;

    const balanceValue = document.getElementById('balance-value');
    const publicBalance = document.getElementById('public-balance');
    const privateBalance = document.getElementById('private-balance');
    const nonceBadge = document.getElementById('nonce-badge');

    if (balanceValue) {
      const total = (this.walletData.balance || 0) + 
                   (this.walletData.encryptedBalance?.encrypted || 0);
      balanceValue.textContent = total.toFixed(8);
    }

    if (publicBalance) {
      publicBalance.textContent = `${(this.walletData.balance || 0).toFixed(8)} OCT`;
    }

    if (privateBalance) {
      const encrypted = this.walletData.encryptedBalance?.encrypted || 0;
      privateBalance.textContent = `${encrypted.toFixed(8)} OCT`;
    }

    if (nonceBadge) {
      nonceBadge.textContent = `Nonce: ${this.walletData.nonce || 0}`;
    }
  }

  truncateAddress(address) {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toast-message');
    
    if (!toast || !toastMessage) return;

    toastMessage.textContent = message;
    toast.className = `toast ${type}`;
    toast.style.display = 'block';
    
    // Trigger animation
    setTimeout(() => {
      toast.classList.add('show');
    }, 10);

    // Hide after 3 seconds
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => {
        toast.style.display = 'none';
      }, 300);
    }, 3000);
  }
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new PopupManager();
});

// Add CSS for receive modal
const modalStyles = `
.receive-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 12px;
  padding: 20px;
  max-width: 320px;
  width: 90%;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.modal-header h3 {
  font-size: 16px;
  font-weight: 600;
  color: #e2e8f0;
}

.close-btn {
  background: none;
  border: none;
  color: #94a3b8;
  font-size: 20px;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
}

.close-btn:hover {
  color: #e2e8f0;
  background: #334155;
}

.modal-body p {
  color: #94a3b8;
  font-size: 14px;
  margin-bottom: 12px;
}

.address-display {
  display: flex;
  gap: 8px;
  align-items: center;
}

.address-display code {
  flex: 1;
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 6px;
  padding: 8px;
  font-size: 12px;
  color: #e2e8f0;
  word-break: break-all;
}

.copy-btn {
  padding: 8px 12px;
  background: #3b82f6;
  border: none;
  border-radius: 6px;
  color: white;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.2s ease;
}

.copy-btn:hover {
  background: #2563eb;
}
`;

// Inject modal styles
const styleSheet = document.createElement('style');
styleSheet.textContent = modalStyles;
document.head.appendChild(styleSheet);