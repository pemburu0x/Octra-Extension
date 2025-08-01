# Octra Web Wallet

This is UnOfficial Octra Web Wallet.
Octra Web Wallet is an open-source web interface that allows users to easily and securely interact with the **Octra blockchain** directly from their browser.

---

## 🚀 Key Features

- 🔐 Import wallet using **Private Key** or **Mnemonic Phrase**
- 💰 View real-time balance from any Octra address
- 📤 Send native Octra coin transactions
- 📄 Transaction history display
- ⚙️ Direct connection to Octra RPC (`https://octra.network`)
- 🖥️ Fully client-side — no backend required

---

## 🛠️ Tech Stack

- ⚡ [Vite](https://vitejs.dev/) for blazing-fast bundling
- 💻 Frontend: [React.js](https://reactjs.org/)
- 🔗 Blockchain interaction via JSON-RPC & `fetch`
- 🔒 Secure client-side key management — no keys are stored or transmitted

---

## 🧪 Installation & Running Locally

```bash
# Clone the repository
git clone https://github.com/m-tq/Octra-Wallet.git
cd octra-wallet

# Install dependencies
npm install

# Start development server
npm run dev

```

## 🔌 Chrome Extension

Octra Web Wallet is also available as a Chrome Extension for seamless dApp integration.

### Building the Extension

```bash
# Build extension for production
npm run build:extension

# Development with auto-rebuild
npm run watch:extension
```

### Installing the Extension

1. Build the extension using the command above
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the `extension-build` folder
5. The Octra Wallet extension will appear in your browser toolbar

### Extension Features

- 🔐 **Secure Popup Interface** - Quick access to wallet functions
- 🌐 **dApp Integration** - Seamless connection with decentralized applications
- 🔔 **Smart Notifications** - Real-time alerts for transactions and connections
- ⚡ **Auto-refresh** - Automatic balance updates every 5 minutes
- 🎯 **One-click Actions** - Send, receive, and view history from popup
- 🔒 **Enhanced Security** - Password protection with encrypted storage
- 📱 **Responsive Design** - Optimized for all screen sizes

### dApp Integration API

Developers can integrate with Octra Wallet using the injected API:

```javascript
// Check if wallet is installed
if (window.octraWallet) {
  // Connect to wallet
  const connection = await window.octraWallet.connect({
    appName: 'My dApp',
    permissions: ['view_address', 'view_balance', 'call_methods']
  });
  
  // Send transaction
  const result = await window.octraWallet.sendTransaction({
    to: 'oct1234567890abcdef...',
    amount: '1.5',
    message: 'Payment for services'
  });
  
  // Listen for events
  window.octraWallet.on('connected', (event) => {
    console.log('Wallet connected:', event.detail);
  });
}
```

## 🚀 Production Deployment (VPS)

### Prerequisites
- Ubuntu/Debian VPS with root access
- Nginx installed
- Node.js 18+ and npm installed
- Domain name pointed to your VPS
- SSL certificate (Let's Encrypt recommended)

### Deployment Steps

1. **Clone and build the application:**
```bash
git clone https://github.com/m-tq/Octra-Web-Wallet.git
cd octra-web-wallet
npm install
npm run build
```

2. **Run the deployment script:**
```bash
chmod +x deploy.sh
sudo ./deploy.sh
```

3. **Configure your domain in nginx:**
```bash
sudo nano /etc/nginx/sites-available/octra-wallet
# Edit server_name to your domain
# Configure SSL certificate paths
```

4. **Enable the site:**
```bash
sudo ln -s /etc/nginx/sites-available/octra-wallet /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### SSL Certificate Setup (Let's Encrypt)

```bash
# Install certbot
sudo apt update
sudo apt install certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal (optional)
sudo crontab -e
# Add: 0 12 * * * /usr/bin/certbot renew --quiet
```

### Dynamic RPC Configuration

The application uses a dynamic proxy system for RPC requests:
- **Development**: Uses Vite proxy for CORS handling
- **Production**: Always uses nginx proxy with dynamic target based on selected RPC provider
- **Dynamic Target**: RPC target ditentukan dari header `X-RPC-Target` yang dikirim oleh frontend
- **Zero Configuration**: User bisa ganti RPC provider tanpa restart server

This ensures maximum compatibility with any RPC provider and eliminates CORS issues completely.

### Troubleshooting

**Debug RPC Requests:**
```bash
# Monitor nginx proxy logs
sudo tail -f /var/log/nginx/rpc-proxy.log
sudo tail -f /var/log/nginx/rpc-proxy-error.log
```

**Test RPC Connectivity:**
```bash
# Test manual request via proxy
curl -H "X-RPC-Target: https://octra.network" \
     https://your-domain.com/rpc-proxy/balance/octBK3u2ViE1Jr7wCtysgkcCHvuqt1C7Spiy6qYHPTqndPG
```
