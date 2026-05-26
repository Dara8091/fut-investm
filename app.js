document.addEventListener('DOMContentLoaded', () => {
    const API_BASE = 'http://localhost:3001/api';
    let isLiveMode = false;
    let totalBalance = 12450.75;
    let currentRoi = 1.85;
    let autoScanInterval = null;
    let scanCount = 0;
    let oppCount = 0;
    let bestProfit = 0;

    // ============================================
    // Market Data (Live from CoinGecko)
    // ============================================
    async function loadMarketOverview() {
        try {
            const res = await fetch(`${API_BASE}/market/overview`);
            if (!res.ok) throw new Error('Failed');
            const data = await res.json();
            if (data.error) return;

            document.getElementById('market-cap').textContent = formatLargeNumber(data.totalMarketCap);
            document.getElementById('market-volume').textContent = formatLargeNumber(data.totalVolume);
            document.getElementById('btc-dominance').textContent = data.btcDominance.toFixed(1) + '%';
            document.getElementById('btc-dominance').classList.add('btc-dom');
            document.getElementById('eth-dominance').textContent = data.ethDominance.toFixed(1) + '%';
            document.getElementById('eth-dominance').classList.add('eth-dom');
            document.getElementById('active-cryptos').textContent = data.activeCryptocurrencies?.toLocaleString() || '—';
        } catch (e) {
            document.getElementById('market-cap').textContent = '—';
            document.getElementById('market-volume').textContent = '—';
            document.getElementById('btc-dominance').textContent = '—';
            document.getElementById('eth-dominance').textContent = '—';
            document.getElementById('active-cryptos').textContent = '—';
        }
    }

    async function loadFearAndGreed() {
        try {
            const res = await fetch(`${API_BASE}/market/fear-greed`);
            if (!res.ok) throw new Error('Failed');
            const data = await res.json();
            if (data.error) return;

            const el = document.getElementById('fear-greed');
            el.textContent = `${data.value} — ${data.classification}`;
            if (data.value <= 25) el.classList.add('fear-extreme');
            else if (data.value >= 75) el.classList.add('fear-greed');
        } catch (e) {
            document.getElementById('fear-greed').textContent = '—';
        }
    }

    async function loadLiveTicker() {
        try {
            const res = await fetch(`${API_BASE}/market/top?limit=10`);
            if (!res.ok) throw new Error('Failed');
            const coins = await res.json();
            if (!coins.length) return;

            const track = document.getElementById('live-ticker-track');
            track.innerHTML = coins.map(c => {
                const change = c.change24h || 0;
                const isUp = change >= 0;
                return `<div class="ticker-item">
                    <span class="ticker-symbol">${c.symbol}</span>
                    <span class="ticker-price">$${formatPrice(c.price)}</span>
                    <span class="ticker-change ${isUp ? 'up' : 'down'}">${isUp ? '+' : ''}${change.toFixed(2)}%</span>
                </div>`;
            }).join('');

            // Duplicate for infinite scroll effect
            track.innerHTML += track.innerHTML;
        } catch (e) {
            // Keep static fallback
        }
    }

    function formatLargeNumber(num) {
        if (!num) return '—';
        if (num >= 1e12) return '$' + (num / 1e12).toFixed(2) + 'T';
        if (num >= 1e9) return '$' + (num / 1e9).toFixed(2) + 'B';
        if (num >= 1e6) return '$' + (num / 1e6).toFixed(2) + 'M';
        return '$' + num.toLocaleString();
    }

    function formatPrice(price) {
        if (!price) return '—';
        if (price >= 1000) return price.toLocaleString('en-US', { maximumFractionDigits: 2 });
        if (price >= 1) return price.toFixed(2);
        return price.toFixed(4);
    }

    // Load market data on startup
    loadMarketOverview();
    loadFearAndGreed();
    loadLiveTicker();

    // Refresh market data every 60 seconds
    setInterval(() => {
        loadMarketOverview();
        loadFearAndGreed();
        loadLiveTicker();
    }, 60000);

    const navItems = document.querySelectorAll('.nav-item');
    const tabContents = document.querySelectorAll('.tab-content');
    const pageTitle = document.getElementById('current-page-title');
    const pageSubtitle = document.getElementById('current-page-subtitle');

    const PAGE_INFO = {
        dashboard: { title: 'Dashboard General', subtitle: 'Rendimiento de inversión y balance del portafolio.' },
        wallet: { title: 'Dinero', subtitle: 'Fondeo, depósitos y retiros.' },
        security: { title: 'Centro de Seguridad', subtitle: 'Protección AES-256 y controles TOTP.' },
        network: { title: 'Estructura de Red', subtitle: 'Visualización interactiva del volumen organizacional.' },
        futinves: { title: 'FutInvest — Motor de Arbitraje', subtitle: 'Escaneo y ejecución de oportunidades de arbitraje entre exchanges.' },
        profile: { title: 'Mi Perfil', subtitle: 'Información personal, cartera y actividad reciente.' },
        settings: { title: 'Configuración', subtitle: 'Contraseña, notificaciones y gestión de cuenta.' },
        admin: { title: 'Panel de Administración', subtitle: 'Gestión de retiros, usuarios y configuración.' },
    };

    function switchTab(tabName) {
        navItems.forEach(i => i.classList.remove('active'));
        const item = document.querySelector(`[data-tab="${tabName}"]`);
        if (item) item.classList.add('active');
        tabContents.forEach(c => c.classList.remove('active'));
        const target = document.getElementById(`tab-${tabName}`);
        if (target) target.classList.add('active');
        if (PAGE_INFO[tabName]) {
            pageTitle.textContent = PAGE_INFO[tabName].title;
            pageSubtitle.textContent = PAGE_INFO[tabName].subtitle;
        }
        if (tabName === 'admin') refreshAdminPanel();
        if (tabName === 'profile') loadProfile();
        if (tabName === 'settings') loadSettings();
    }

    navItems.forEach(item => {
        item.addEventListener('click', () => switchTab(item.dataset.tab));
    });

    window.switchTab = switchTab;

    // Toast notifications
    function showToast(msg, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = msg;
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
    }

    // Auth Modal
    const authModal = document.getElementById('auth-modal');
    const authForm = document.getElementById('auth-form');
    const authEmail = document.getElementById('auth-email');
    const authPassword = document.getElementById('auth-password');
    const authName = document.getElementById('auth-name');
    const authNameGroup = document.getElementById('auth-name-group');
    const authSubmitBtn = document.getElementById('auth-submit-btn');
    const authError = document.getElementById('auth-error');
    const authModalTitle = document.getElementById('auth-modal-title');
    const authToggleBtn = document.getElementById('auth-toggle-btn');
    const authSkipBtn = document.getElementById('auth-skip-btn');
    let isRegisterMode = false;

    function showAuthError(msg) { authError.textContent = msg; authError.style.display = 'block'; }
    function hideAuthError() { authError.style.display = 'none'; }

    function toggleAuthMode() {
        isRegisterMode = !isRegisterMode;
        authModalTitle.textContent = isRegisterMode ? 'Crear Cuenta' : 'Iniciar Sesión';
        authSubmitBtn.textContent = isRegisterMode ? 'Crear Cuenta' : 'Iniciar Sesión';
        authNameGroup.style.display = isRegisterMode ? 'block' : 'none';
        hideAuthError();
    }

    authToggleBtn.addEventListener('click', toggleAuthMode);

    authSkipBtn.addEventListener('click', () => {
        authModal.style.display = 'none';
        isLiveMode = false;
        updateLiveIndicator();
        updateUserProfileUI({ fullName: 'Invitado', role: 'guest', tier: 'silver' });
    });

    authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideAuthError();
        const email = authEmail.value.trim();
        const password = authPassword.value.trim();

        if (!email || !password) { showAuthError('Email y contraseña requeridos'); return; }

        if (isLiveMode) {
            try {
                if (isRegisterMode) {
                    const name = authName.value.trim();
                    const user = await ApiService.register(email, password, name || 'Inversor');
                    updateUserProfileUI(user);
                } else {
                    const user = await ApiService.login(email, password);
                    updateUserProfileUI(user);
                }
                authModal.style.display = 'none';
                updateLiveIndicator();
                showToast('Bienvenido', 'success');
            } catch (err) {
                showAuthError(err.message);
            }
        } else {
            const validEmail = email.toLowerCase() === 'demo@futinvest.io';
            const validPassword = password === 'Demo123!' || password === 'demo123' || password === 'Demo123';
            if (validEmail && validPassword) {
                authModal.style.display = 'none';
                isLiveMode = true;
                updateLiveIndicator({ email });
                updateUserProfileUI({ fullName: 'Inversor VIP', role: 'investor', tier: 'black', email });
                showToast('Login exitoso', 'success');
            } else {
                showAuthError('Credenciales inválidas. Usa demo@futinvest.io / Demo123!');
            }
        }
    });

    function updateLiveIndicator(user) {
        const existing = document.querySelector('.live-indicator');
        if (existing) existing.remove();
        const indicator = document.createElement('span');
        indicator.className = `live-indicator ${isLiveMode ? 'live' : 'demo'}`;
        indicator.innerHTML = `<span class="dot ${isLiveMode ? '' : 'pulse'}"></span> ${isLiveMode ? 'API Conectado' : 'Demo Local'}`;
        indicator.title = isLiveMode ? `Conectado como ${user?.email || 'usuario'}` : 'Usando datos de demostración locales';
        indicator.addEventListener('click', () => {
            if (isLiveMode) { ApiService.logout(); location.reload(); }
            else { authModal.style.display = 'flex'; }
        });
        const target = document.querySelector('.user-profile, .user-menu');
        if (target) target.prepend(indicator);
    }

    function updateUserProfileUI(user) {
        if (!user) return;
        const nameEl = document.querySelector('.user-name');
        const roleEl = document.querySelector('.user-role');
        const avatarEl = document.getElementById('topbar-avatar');
        if (nameEl) nameEl.textContent = user.fullName || '—';
        if (roleEl) roleEl.textContent = user.role || 'investor';
        if (avatarEl) {
            const initials = (user.fullName || 'FU').split(' ').map(s => s[0]).join('').slice(0, 2).toUpperCase();
            avatarEl.textContent = initials;
        }
        if (user.role === 'admin' || user.role === 'superadmin') {
            document.getElementById('btn-tab-admin').style.display = '';
        }
    }

    // Profile sub-tabs
    const profileTabs = document.querySelectorAll('[data-profile-tab]');
    const profileTabContents = document.querySelectorAll('.profile-tab-content');
    profileTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            profileTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            profileTabContents.forEach(c => c.classList.remove('active'));
            const targetTab = tab.dataset.profileTab;
            const target = document.getElementById(`profile-tab-${targetTab}`);
            if (target) target.classList.add('active');
        });
    });

    // Wallet sub-tabs
    const walletTabs = document.querySelectorAll('.wallet-tab');
    const walletSubContents = document.querySelectorAll('.wallet-sub-content');
    walletTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            walletTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            walletSubContents.forEach(c => c.classList.remove('active'));
            document.getElementById(`wallet-${tab.dataset.subtab}-content`).classList.add('active');
        });
    });

    // Withdrawal address validation
    const walletAddressInput = document.getElementById('wallet-address');
    const walletAmountInput = document.getElementById('wallet-amount');
    const btnShowQR = document.getElementById('btn-show-qr');

    function isValidCryptoAddress(address) {
        if (!address || address.length < 10) return false;
        // TRC20: starts with T, 34 chars
        if (address.startsWith('T') && address.length === 34) return true;
        // ERC20/BSC: starts with 0x, 42 chars
        if (address.startsWith('0x') && address.length === 42) return true;
        // BTC: starts with 1, 3, or bc1
        if (/^(1|3|bc1)/.test(address) && address.length >= 26) return true;
        // Generic: at least 20 chars
        return address.length >= 20;
    }

    function validateWithdrawalForm() {
        const address = walletAddressInput?.value?.trim() || '';
        const amount = walletAmountInput?.value?.trim() || '';
        const isValid = isValidCryptoAddress(address) && amount && parseFloat(amount) > 0;
        if (btnShowQR) btnShowQR.disabled = !isValid;
    }

    walletAddressInput?.addEventListener('input', validateWithdrawalForm);
    walletAmountInput?.addEventListener('input', validateWithdrawalForm);
    validateWithdrawalForm();

    // Deposit generation
    const depositAssetSelect = document.getElementById('deposit-asset');
    const btnGenerateDeposit = document.getElementById('btn-generate-deposit');
    const depositResultCard = document.getElementById('deposit-result-card');
    const depositQRLabel = document.getElementById('deposit-qr-label');
    const depositAddressDisplay = document.getElementById('deposit-address-display');
    const btnCopyDeposit = document.getElementById('btn-copy-deposit');

    const MOCK_DEPOSIT_ADDRESSES = {
        USDT_TRC20: 'TXYZabc123def456ghi789jkl012mno345pq',
        USDT_ERC20: '0xABCDEF1234567890abcdef1234567890ABCDEF12',
        BTC: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
        ETH: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
    };

    btnGenerateDeposit.addEventListener('click', async () => {
        const assetKey = depositAssetSelect.value;
        const assetName = depositAssetSelect.options[depositAssetSelect.selectedIndex].text;
        btnGenerateDeposit.disabled = true;
        btnGenerateDeposit.innerHTML = '<span class="material-icons-round pulse">sync</span> Generando...';

        if (isLiveMode) {
            try {
                const result = await ApiService.deposit(assetKey, null);
                depositQRLabel.textContent = assetName;
                depositAddressDisplay.textContent = result.address;
                depositResultCard.style.display = 'block';
                showToast('Dirección creada', 'success');
            } catch (e) {
                // Fallback to demo mode if API fails
                depositQRLabel.textContent = assetName;
                depositAddressDisplay.textContent = MOCK_DEPOSIT_ADDRESSES[assetKey] || '—';
                depositResultCard.style.display = 'block';
                showToast('Dirección de depósito creada (demo)', 'success');
            }
        } else {
            setTimeout(() => {
                depositQRLabel.textContent = assetName;
                depositAddressDisplay.textContent = MOCK_DEPOSIT_ADDRESSES[assetKey] || '—';
                depositResultCard.style.display = 'block';
                showToast('Dirección de depósito creada', 'success');
            }, 1000);
        }
        btnGenerateDeposit.disabled = false;
        btnGenerateDeposit.innerHTML = 'Obtener Dirección de Fondeo';
    });

    btnCopyDeposit.addEventListener('click', () => {
        const address = depositAddressDisplay.textContent;
        if (!address || address === '—') return;
        navigator.clipboard.writeText(address).then(() => showToast('Dirección copiada', 'success'));
    });

    // Security - AES
    const aesInput = document.getElementById('aes-input');
    const btnEncrypt = document.getElementById('btn-aes-encrypt');
    const btnDecrypt = document.getElementById('btn-aes-decrypt');
    const aesResultsContainer = document.getElementById('aes-results-container');
    const aesCipherOutput = document.getElementById('aes-cipher-output');

    async function aesEncrypt(text) {
        const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']);
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encoded = new TextEncoder().encode(text);
        const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
        const combined = new Uint8Array(iv.length + encrypted.byteLength);
        combined.set(iv);
        combined.set(new Uint8Array(encrypted), iv.length);
        return btoa(String.fromCharCode(...combined));
    }

    async function aesDecrypt(base64) {
        try {
            const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['decrypt']);
            const data = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
            const iv = data.slice(0, 12);
            const encrypted = data.slice(12);
            const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, encrypted);
            return new TextDecoder().decode(decrypted);
        } catch { return 'Error: No se puede descifrar (clave diferente)'; }
    }

    btnEncrypt.addEventListener('click', async () => {
        if (!aesInput.value.trim()) return;
        const encrypted = await aesEncrypt(aesInput.value);
        aesCipherOutput.value = encrypted;
        aesResultsContainer.style.display = 'block';
    });

    btnDecrypt.addEventListener('click', async () => {
        if (!aesInput.value.trim()) return;
        const decrypted = await aesDecrypt(aesInput.value);
        aesCipherOutput.value = decrypted;
        aesResultsContainer.style.display = 'block';
    });

    // Security - 2FA
    const toggle2fa = document.getElementById('2fa-toggle');
    const totpDisplayArea = document.getElementById('totp-display-area');
    const totpCodeEl = document.getElementById('totp-code');
    const totpTimerText = document.getElementById('totp-timer-text');
    let totpInterval = null;

    function generateTOTP() {
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        totpCodeEl.textContent = code.slice(0, 3) + ' ' + code.slice(3);
    }

    toggle2fa.addEventListener('change', () => {
        totpDisplayArea.style.display = toggle2fa.checked ? 'block' : 'none';
        if (toggle2fa.checked) {
            generateTOTP();
            let remaining = 30;
            totpInterval = setInterval(() => {
                remaining--;
                totpTimerText.textContent = remaining + 's';
                if (remaining <= 0) { remaining = 30; generateTOTP(); }
            }, 1000);
        } else {
            clearInterval(totpInterval);
        }
    });

    // Network zoom
    let networkZoom = 1;
    const interactiveTree = document.getElementById('interactive-tree');
    document.getElementById('btn-zoom-in').addEventListener('click', () => { networkZoom = Math.min(networkZoom + 0.2, 2); interactiveTree.style.transform = `scale(${networkZoom})`; });
    document.getElementById('btn-zoom-out').addEventListener('click', () => { networkZoom = Math.max(networkZoom - 0.2, 0.5); interactiveTree.style.transform = `scale(${networkZoom})`; });
    document.getElementById('btn-zoom-reset').addEventListener('click', () => { networkZoom = 1; interactiveTree.style.transform = 'scale(1)'; });

    // FutInvest
    const btnGoarbitScan = document.getElementById('btn-futinves-scan');
    const btnGoarbitScanAll = document.getElementById('btn-futinves-scan-all');
    const btnGoarbitTriangular = document.getElementById('btn-futinves-triangular');
    const btnGoarbitRefresh = document.getElementById('btn-futinves-refresh');
    const futinvesResults = document.getElementById('futinves-results');
    const futinvesOppBody = document.getElementById('futinves-opportunities-body');
    const futinvesAutoScan = document.getElementById('futinves-auto-scan');

    function renderGoarbitResult(opp) {
        if (!opp || opp.error) {
            futinvesResults.innerHTML = `<div class="futinves-result-card not-profitable"><p style="color:var(--red-primary);">${opp?.error || 'Sin resultados'}</p></div>`;
            return;
        }
        const isProfit = opp.profit > 0;
        futinvesResults.innerHTML = `
            <div class="futinves-result-card ${isProfit ? '' : 'not-profitable'}">
                <div class="futinves-result-row"><span class="futinves-result-label">Par</span><span class="futinves-result-value">${opp.symbol}</span></div>
                <div class="futinves-result-row"><span class="futinves-result-label">Comprar en</span><span class="futinves-result-value" style="color:var(--blue-primary);">${opp.buyExchange}</span></div>
                <div class="futinves-result-row"><span class="futinves-result-label">Precio Compra</span><span class="futinves-result-value">$${opp.buyPrice.toLocaleString()}</span></div>
                <div class="futinves-result-row"><span class="futinves-result-label">Vender en</span><span class="futinves-result-value" style="color:var(--green-primary);">${opp.sellExchange}</span></div>
                <div class="futinves-result-row"><span class="futinves-result-label">Precio Venta</span><span class="futinves-result-value">$${opp.sellPrice.toLocaleString()}</span></div>
                <div class="futinves-result-row"><span class="futinves-result-label">Spread</span><span class="futinves-result-value">${opp.spreadPercent.toFixed(3)}%</span></div>
                <div class="futinves-result-row"><span class="futinves-result-label">Ganancia Estimada</span><span class="futinves-result-value ${isProfit ? 'profit' : 'loss'}">$${opp.profit.toFixed(2)} (${opp.profitPercent.toFixed(2)}%)</span></div>
            </div>`;
    }

    async function scanPair() {
        const symbol = document.getElementById('futinves-symbol').value;
        const amount = parseFloat(document.getElementById('futinves-amount').value) || 100;
        scanCount++;
        document.getElementById('futinves-scan-count').textContent = scanCount;

        if (isLiveMode) {
            try {
                const res = await fetch(`${API_BASE}/futinvest/scan?symbol=${symbol}&amount=${amount}`);
                const data = await res.json();
                if (data.opportunity) {
                    oppCount++;
                    document.getElementById('futinves-opp-count').textContent = oppCount;
                    if (data.opportunity.profit > bestProfit) {
                        bestProfit = data.opportunity.profit;
                        document.getElementById('futinves-best-profit').textContent = `$${bestProfit.toFixed(2)}`;
                    }
                    renderGoarbitResult(data.opportunity);
                } else {
                    futinvesResults.innerHTML = '<div class="futinves-empty-state"><span class="material-icons-round">search_off</span><p>Sin oportunidades rentables</p></div>';
                }
            } catch (e) { futinvesResults.innerHTML = `<div class="futinves-result-card not-profitable"><p style="color:var(--red-primary);">Error: ${e.message}</p></div>`; }
        } else {
            const spread = (Math.random() * 2).toFixed(3);
            const profit = (amount * spread / 100).toFixed(2);
            const opp = { symbol, buyExchange: 'Binance', sellExchange: 'OKX', buyPrice: 42000, sellPrice: 42000 * (1 + spread / 100), spreadPercent: parseFloat(spread), profit: parseFloat(profit), profitPercent: parseFloat(spread) };
            oppCount++;
            document.getElementById('futinves-opp-count').textContent = oppCount;
            if (opp.profit > bestProfit) { bestProfit = opp.profit; document.getElementById('futinves-best-profit').textContent = `$${bestProfit.toFixed(2)}`; }
            renderGoarbitResult(opp);
        }
    }

    async function scanAll() {
        const amount = parseFloat(document.getElementById('futinves-amount').value) || 100;
        scanCount++;
        document.getElementById('futinves-scan-count').textContent = scanCount;

        if (isLiveMode) {
            try {
                const res = await fetch(`${API_BASE}/futinvest/scan-all?amount=${amount}`);
                const data = await res.json();
                if (data.opportunities && data.opportunities.length > 0) {
                    oppCount += data.opportunities.length;
                    document.getElementById('futinves-opp-count').textContent = oppCount;
                    futinvesOppBody.innerHTML = data.opportunities.map(opp => `
                        <tr>
                            <td>${opp.symbol}</td>
                            <td style="color:var(--blue-primary)">${opp.buyExchange}</td>
                            <td>$${opp.buyPrice.toLocaleString()}</td>
                            <td style="color:var(--green-primary)">${opp.sellExchange}</td>
                            <td>$${opp.sellPrice.toLocaleString()}</td>
                            <td>${opp.spreadPercent.toFixed(3)}%</td>
                            <td class="profit">+$${opp.profit.toFixed(2)}</td>
                            <td><button class="btn btn-sm btn-primary btn-execute" data-symbol="${opp.symbol}" data-amount="${amount}">Ejecutar</button></td>
                        </tr>`).join('');
                    const best = data.opportunities.reduce((max, o) => o.profit > max.profit ? o : max, data.opportunities[0]);
                    if (best.profit > bestProfit) { bestProfit = best.profit; document.getElementById('futinves-best-profit').textContent = `$${bestProfit.toFixed(2)}`; }
                } else {
                    futinvesOppBody.innerHTML = '<tr><td colspan="8" class="text-center">Sin oportunidades rentables</td></tr>';
                    futinvesResults.innerHTML = '<div class="futinves-empty-state"><span class="material-icons-round">search_off</span><p>No hay oportunidades rentables</p></div>';
                }
            } catch (e) { futinvesResults.innerHTML = `<div class="futinves-result-card not-profitable"><p style="color:var(--red-primary);">Error: ${e.message}</p></div>`; }
        } else {
            const pairs = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT'];
            const opps = pairs.map(sym => {
                const spread = (Math.random() * 1.5).toFixed(3);
                const profit = (amount * spread / 100).toFixed(2);
                return { symbol: sym, buyExchange: 'Binance', sellExchange: 'OKX', buyPrice: 42000, sellPrice: 42000 * (1 + spread / 100), spreadPercent: parseFloat(spread), profit: parseFloat(profit) };
            });
            oppCount += opps.length;
            document.getElementById('futinves-opp-count').textContent = oppCount;
            futinvesOppBody.innerHTML = opps.map(opp => `
                <tr>
                    <td>${opp.symbol}</td>
                    <td style="color:var(--blue-primary)">${opp.buyExchange}</td>
                    <td>$${opp.buyPrice.toLocaleString()}</td>
                    <td style="color:var(--green-primary)">${opp.sellExchange}</td>
                    <td>$${opp.sellPrice.toLocaleString()}</td>
                    <td>${opp.spreadPercent.toFixed(3)}%</td>
                    <td class="profit">+$${opp.profit.toFixed(2)}</td>
                    <td><button class="btn btn-sm btn-primary btn-execute" data-symbol="${opp.symbol}" data-amount="${amount}">Ejecutar</button></td>
                </tr>`).join('');
        }
    }

    async function scanTriangular() {
        const amount = parseFloat(document.getElementById('futinves-amount').value) || 1000;
        scanCount++;
        document.getElementById('futinves-scan-count').textContent = scanCount;

        if (isLiveMode) {
            try {
                const res = await fetch(`${API_BASE}/futinvest/triangular?amount=${amount}`);
                const data = await res.json();
                if (data.best) {
                    const best = data.best;
                    oppCount++;
                    document.getElementById('futinves-opp-count').textContent = oppCount;
                    if (best.profit > bestProfit) { bestProfit = best.profit; document.getElementById('futinves-best-profit').textContent = `$${bestProfit.toFixed(2)}`; }
                    futinvesResults.innerHTML = `
                        <div class="futinves-result-card">
                            <div class="futinves-result-row"><span class="futinves-result-label">Tipo</span><span class="futinves-result-value">Arbitraje Triangular</span></div>
                            <div class="futinves-result-row"><span class="futinves-result-label">Ruta</span><span class="futinves-result-value">${best.path.join(' → ')}</span></div>
                            <div class="futinves-result-row"><span class="futinves-result-label">Monto Inicial</span><span class="futinves-result-value">$${best.initialAmount.toLocaleString()}</span></div>
                            <div class="futinves-result-row"><span class="futinves-result-label">Monto Final</span><span class="futinves-result-value">$${best.finalAmount.toFixed(2)}</span></div>
                            <div class="futinves-result-row"><span class="futinves-result-label">Ganancia</span><span class="futinves-result-value profit">+$${best.profit.toFixed(2)} (${best.profitPercent.toFixed(3)}%)</span></div>
                        </div>`;
                } else {
                    futinvesResults.innerHTML = '<div class="futinves-empty-state"><span class="material-icons-round">change_circle</span><p>No hay oportunidades triangulares rentables</p></div>';
                }
            } catch (e) { futinvesResults.innerHTML = `<div class="futinves-result-card not-profitable"><p style="color:var(--red-primary);">Error: ${e.message}</p></div>`; }
        } else {
            const path = ['USDT', 'BTC', 'ETH', 'USDT'];
            const profitPercent = (Math.random() * 0.5).toFixed(3);
            const profit = (amount * profitPercent / 100).toFixed(2);
            const finalAmount = (amount + parseFloat(profit)).toFixed(2);
            oppCount++;
            document.getElementById('futinves-opp-count').textContent = oppCount;
            if (parseFloat(profit) > bestProfit) { bestProfit = parseFloat(profit); document.getElementById('futinves-best-profit').textContent = `$${bestProfit.toFixed(2)}`; }
            futinvesResults.innerHTML = `
                <div class="futinves-result-card">
                    <div class="futinves-result-row"><span class="futinves-result-label">Tipo</span><span class="futinves-result-value">Arbitraje Triangular</span></div>
                    <div class="futinves-result-row"><span class="futinves-result-label">Ruta</span><span class="futinves-result-value">${path.join(' → ')}</span></div>
                    <div class="futinves-result-row"><span class="futinves-result-label">Monto Inicial</span><span class="futinves-result-value">$${amount.toLocaleString()}</span></div>
                    <div class="futinves-result-row"><span class="futinves-result-label">Monto Final</span><span class="futinves-result-value">$${finalAmount}</span></div>
                    <div class="futinves-result-row"><span class="futinves-result-label">Ganancia</span><span class="futinves-result-value profit">+$${profit} (${profitPercent}%)</span></div>
                </div>`;
        }
    }

    async function executeArbitrage(symbol, amount) {
        if (!isLiveMode) { showToast('Modo demo: arbitraje simulado', 'info'); return; }
        try {
            const data = await ApiService._fetch('/futinves/execute', {
                method: 'POST',
                body: JSON.stringify({ symbol, amount }),
            });
            if (data.success) {
                showToast('Arbitraje ejecutado: ' + data.message, 'success');
            } else {
                showToast('Error: ' + (data.error || data.message), 'error');
            }
        } catch (e) { showToast(e.message, 'error'); }
    }

    function toggleAutoScan() {
        if (futinvesAutoScan.checked) {
            autoScanInterval = setInterval(scanPair, 30000);
            showToast('Auto-escaneo activado (cada 30s)', 'info');
        } else {
            clearInterval(autoScanInterval);
            autoScanInterval = null;
            showToast('Auto-escaneo desactivado', 'info');
        }
    }

    btnGoarbitScan.addEventListener('click', scanPair);
    btnGoarbitScanAll.addEventListener('click', scanAll);
    btnGoarbitTriangular.addEventListener('click', scanTriangular);
    btnGoarbitRefresh.addEventListener('click', () => { futinvesResults.innerHTML = '<div class="futinves-empty-state"><span class="material-icons-round">search</span><p>Inicia un escaneo</p></div>'; futinvesOppBody.innerHTML = '<tr><td colspan="8" class="text-center">Sin oportunidades</td></tr>'; });
    if (futinvesAutoScan) futinvesAutoScan.addEventListener('change', toggleAutoScan);

    // Execute buttons in table
    document.addEventListener('click', (e) => {
        const execBtn = e.target.closest('.btn-execute');
        if (execBtn) {
            const symbol = execBtn.dataset.symbol;
            const amount = parseFloat(execBtn.dataset.amount);
            executeArbitrage(symbol, amount);
        }
    });

    // Profile loading
    async function loadProfile() {
        // Show loading states
        ['prof-avatar-circle', 'prof-name', 'prof-email', 'prof-tier-badge', 'prof-kyc-badge', 'prof-2fa-badge'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.classList.add('skeleton');
                el.textContent = '';
            }
        });

        try {
            const data = await ApiService._fetch('/profile');
            const u = data.user || {}, a = data.account || {};
            const tier = u.tier || 'silver';
            const tierLabel = { silver: 'Silver', gold: 'Gold', black: 'Black VIP', interbank: 'Interbank', institutional: 'Institutional', premium: 'Premium' };
            const kycLabel = { approved: 'Verificado', pending: 'Pendiente', rejected: 'Rechazado' };
            const initials = (u.fullName || 'FU').split(' ').map(s => s[0]).join('').slice(0, 2).toUpperCase();
            
            // Remove loading states
            ['prof-avatar-circle', 'prof-name', 'prof-email', 'prof-tier-badge', 'prof-kyc-badge', 'prof-2fa-badge'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.classList.remove('skeleton');
            });

            document.getElementById('prof-avatar-circle').textContent = initials;
            document.getElementById('prof-name').textContent = u.fullName || '—';
            document.getElementById('prof-email').textContent = u.email || '—';
            document.getElementById('prof-tier-badge').textContent = tierLabel[tier] || tier.toUpperCase();
            document.getElementById('prof-tier-badge').className = 'prof-badge ' + tier;
            const kycStatus = u.kycStatus || 'pending';
            document.getElementById('prof-kyc-badge').textContent = kycLabel[kycStatus] || kycStatus;
            document.getElementById('prof-kyc-badge').className = 'prof-badge prof-kyc ' + kycStatus;
            const tfa = u.totpEnabled;
            document.getElementById('prof-2fa-badge').textContent = tfa ? '2FA Activado' : '2FA No';
            document.getElementById('prof-2fa-badge').className = 'prof-badge prof-2fa' + (tfa ? ' enabled' : '');
            document.getElementById('prof-balance').textContent = '$' + (a.balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2 });
            document.getElementById('prof-earnings').textContent = '$' + (a.accumulatedEarnings || 0).toLocaleString('en-US', { minimumFractionDigits: 2 });
            document.getElementById('prof-roi').textContent = (a.dailyRoi || 0) + '%';
            document.getElementById('prof-contracts').textContent = data.activeContracts || 0;
            document.getElementById('prof-member-since').textContent = u.memberSince ? new Date(u.memberSince).toLocaleDateString() : '—';
            document.getElementById('prof-tier-name').textContent = tierLabel[tier] || tier.toUpperCase();
            document.getElementById('prof-kyc-status').textContent = kycLabel[kycStatus] || kycStatus;
            document.getElementById('prof-2fa-status').textContent = tfa ? 'Activado' : 'No configurado';
            document.getElementById('prof-role').textContent = u.role || 'investor';
            document.getElementById('prof-user-id').textContent = '#' + (u.id || '—');
            document.getElementById('prof-ref-code').textContent = u.referralCode || '—';
            document.getElementById('prof-copy-ref').onclick = () => { if (u.referralCode) navigator.clipboard.writeText(u.referralCode).then(() => showToast('Copiado', 'success')); };

            const tbody = document.getElementById('prof-tx-body');
            const txs = data.recentTransactions || [];
            tbody.innerHTML = txs.length === 0 ? '<div class="prof-tx-empty">Sin movimientos recientes</div>' : txs.map(t => {
                const date = t.created_at ? new Date(t.created_at).toLocaleDateString() : '—';
                return `<div class="prof-tx-row"><span class="prof-tx-type ${t.type || 'unknown'}">${t.type || '—'}</span><span>${t.asset || '—'}</span><span>$${(t.amount || 0).toLocaleString()}</span><span class="prof-tx-status ${t.status || 'pending'}">${t.status || '—'}</span><span>${date}</span></div>`;
            }).join('');

            loadProfileCompletion();
            loadWithdrawalLimits();
            loadRiskProfile();
            loadPerformanceChart();
            loadAssetAllocation();
            loadGoals();
            loadAchievements();
            loadSecurityLog();
            loadSessions();
            loadApiKeys();
            loadKycDocuments();
            loadFutInvestProfile();
        } catch (e) { 
            console.error('Error loading profile:', e);
            // Show error state
            ['prof-avatar-circle', 'prof-name', 'prof-email', 'prof-tier-badge', 'prof-kyc-badge', 'prof-2fa-badge'].forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    el.classList.remove('skeleton');
                    el.textContent = '—';
                }
            });
            showToast('Error cargando perfil', 'error');
        }
    }

    async function loadProfileCompletion() {
        try {
            const data = await ApiService._fetch('/profile/completion');
            document.getElementById('prof-completion-percent').textContent = data.percent + '%';
            document.getElementById('prof-completion-fill').style.width = data.percent + '%';
            const stepsEl = document.getElementById('prof-completion-steps');
            if (stepsEl && data.steps) {
                stepsEl.innerHTML = data.steps.map(s => `<div class="prof-step ${s.done ? 'done' : ''}"><span class="prof-step-icon">${s.done ? '✓' : '○'}</span><span>${s.label}</span></div>`).join('');
            }
        } catch (e) { }
    }

    async function loadWithdrawalLimits() {
        try {
            const data = await ApiService._fetch('/profile/withdrawal-limits');
            const dailyPct = Math.round((data.daily.used / data.daily.limit) * 100);
            const monthlyPct = Math.round((data.monthly.used / data.monthly.limit) * 100);
            document.getElementById('prof-limit-daily-fill').style.width = dailyPct + '%';
            document.getElementById('prof-limit-daily').textContent = `$${data.daily.used.toLocaleString()} / $${data.daily.limit.toLocaleString()}`;
            document.getElementById('prof-limit-monthly-fill').style.width = monthlyPct + '%';
            document.getElementById('prof-limit-monthly').textContent = `$${data.monthly.used.toLocaleString()} / $${data.monthly.limit.toLocaleString()}`;
        } catch (e) { }
    }

    async function loadRiskProfile() {
        try {
            const data = await ApiService._fetch('/profile/risk-profile');
            const p = data.profile || {};
            document.getElementById('prof-risk-badge').textContent = (p.profile_type || 'moderate').charAt(0).toUpperCase() + (p.profile_type || 'moderate').slice(1);
            const bars = { conservative: 'risk-conservative', moderate: 'risk-moderate', aggressive: 'risk-aggressive' };
            for (const [key, id] of Object.entries(bars)) {
                const el = document.getElementById(id);
                if (el) el.style.width = p.profile_type === key ? '100%' : '20%';
            }
            const descEl = document.getElementById('risk-description');
            if (descEl) {
                const descs = { conservative: 'Prioriza la preservación de capital.', moderate: 'Balance entre riesgo y rendimiento.', aggressive: 'Maximiza rendimientos con mayor volatilidad.' };
                descEl.textContent = descs[p.profile_type] || descs.moderate;
            }
        } catch (e) { }
    }

    async function loadPerformanceChart() {
        try {
            const data = await ApiService._fetch('/profile/performance-chart?days=30');
            const canvas = document.getElementById('prof-perf-chart');
            if (!canvas || !data.data || data.data.length === 0) return;
            const ctx = canvas.getContext('2d');
            const w = canvas.width, h = canvas.height;
            ctx.clearRect(0, 0, w, h);
            const rates = data.data.map(d => d.rate);
            const min = Math.min(...rates) * 0.95, max = Math.max(...rates) * 1.05;
            const stepX = w / (rates.length - 1);
            ctx.beginPath();
            ctx.strokeStyle = '#00e676';
            ctx.lineWidth = 2;
            rates.forEach((r, i) => {
                const x = i * stepX, y = h - ((r - min) / (max - min)) * h;
                i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            });
            ctx.stroke();
            ctx.fillStyle = 'rgba(0,230,118,0.1)';
            ctx.lineTo(w, h);
            ctx.lineTo(0, h);
            ctx.fill();
        } catch (e) { }
    }

    async function loadAssetAllocation() {
        try {
            const data = await ApiService._fetch('/profile/asset-allocation');
            const allocMap = { 'USDT TRC20': 'alloc-usdt-trc', 'USDT ERC20': 'alloc-usdt-erc', 'BTC': 'alloc-btc', 'ETH': 'alloc-eth', 'SOL': 'alloc-sol' };
            for (const item of (data.allocation || [])) {
                const id = allocMap[item.asset];
                if (id) { const el = document.getElementById(id); if (el) el.textContent = item.percentage + '%'; }
            }
        } catch (e) { }
    }

    async function loadGoals() {
        try {
            const data = await ApiService._fetch('/profile/goals');
            const listEl = document.getElementById('prof-goals-list');
            if (!listEl) return;
            if (!data.goals || data.goals.length === 0) { listEl.innerHTML = '<div class="prof-tx-empty">Sin objetivos definidos</div>'; return; }
            listEl.innerHTML = data.goals.map(g => {
                const pct = g.progress_pct || 0;
                return `<div class="prof-goal"><div class="prof-goal-header"><span class="prof-goal-name">${g.name}</span><span class="prof-goal-priority ${g.priority}">${g.priority}</span></div><div class="prof-goal-progress"><div class="prof-goal-bar" style="width:${pct}%"></div></div><div class="prof-goal-footer"><span>$${g.current_amount.toLocaleString()} / $${g.target_amount.toLocaleString()}</span><span>${pct}%</span></div></div>`;
            }).join('');
        } catch (e) { }
    }

    async function loadAchievements() {
        try {
            const container = document.getElementById('prof-achievements');
            if (!container) return;
            const defs = [
                { icon: 'account_balance_wallet', name: 'Primer Depósito', tier: 'bronze' },
                { icon: 'send', name: 'Primer Retiro', tier: 'bronze' },
                { icon: 'trending_up', name: 'Maestro ROI', tier: 'silver' },
                { icon: 'account_group', name: 'Líder de Red', tier: 'gold' },
                { icon: 'diamond', name: 'Ballena', tier: 'platinum' },
                { icon: 'rocket', name: 'Adoptador Temprano', tier: 'silver' },
            ];
            container.innerHTML = defs.map(a => `<div class="prof-achievement"><span class="prof-achievement-icon">${a.icon}</span><span>${a.name}</span><span class="prof-achievement-tier ${a.tier}">${a.tier}</span></div>`).join('');
        } catch (e) { }
    }

    async function loadSecurityLog() {
        try {
            const data = await ApiService._fetch('/profile/security-log?limit=10');
            const logEl = document.getElementById('prof-security-log');
            if (!logEl) return;
            if (!data.logs || data.logs.length === 0) { logEl.innerHTML = '<div class="prof-tx-empty">Sin registros</div>'; return; }
            logEl.innerHTML = data.logs.map(l => {
                const date = l.created_at ? new Date(l.created_at).toLocaleString() : '—';
                return `<div class="prof-log-entry"><span class="prof-log-action">${l.action}</span><span>${date}</span><span class="prof-log-ip">${l.ip_address || '—'}</span></div>`;
            }).join('');
        } catch (e) { }
    }

    async function loadSessions() {
        try {
            const data = await ApiService._fetch('/profile/sessions');
            const container = document.getElementById('prof-devices');
            if (!container) return;
            if (!data.sessions || data.sessions.length === 0) { container.innerHTML = '<div class="prof-tx-empty">Sin sesiones activas</div>'; return; }
            container.innerHTML = data.sessions.map(s => {
                const last = s.last_active_at ? new Date(s.last_active_at).toLocaleString() : '—';
                return `<div class="prof-device ${s.is_current ? 'current' : ''}"><span class="prof-device-name">${s.device_name}</span><span>${s.os} / ${s.browser}</span><span>${last}</span>${s.is_current ? '<span class="prof-device-badge">Actual</span>' : ''}</div>`;
            }).join('');
        } catch (e) { }
    }

    async function loadApiKeys() {
        try {
            const data = await ApiService._fetch('/profile/api-keys');
            const container = document.getElementById('prof-api-keys');
            if (!container) return;
            if (!data.keys || data.keys.length === 0) { container.innerHTML = '<div class="prof-tx-empty">Sin API keys</div>'; return; }
            container.innerHTML = data.keys.map(k => {
                const created = k.created_at ? new Date(k.created_at).toLocaleDateString() : '—';
                const lastUsed = k.last_used_at ? new Date(k.last_used_at).toLocaleString() : 'Nunca';
                return `<div class="prof-api-key ${k.revoked ? 'revoked' : ''}"><span class="prof-api-key-name">${k.name}</span><span class="prof-api-key-prefix">${k.prefix}***</span><span>${k.permissions}</span><span>${lastUsed}</span><span>${created}</span></div>`;
            }).join('');
        } catch (e) { }
    }

    async function loadKycDocuments() {
        try {
            const data = await ApiService._fetch('/profile/kyc-documents');
            const container = document.getElementById('prof-kyc-docs');
            if (!container) return;
            if (!data.documents || data.documents.length === 0) { container.innerHTML = '<div class="prof-tx-empty">Sin documentos KYC</div>'; return; }
            container.innerHTML = data.documents.map(d => {
                const submitted = d.submitted_at ? new Date(d.submitted_at).toLocaleDateString() : '—';
                return `<div class="prof-kyc-doc"><span>${d.document_type}</span><span class="prof-kyc-status ${d.status}">${d.status}</span><span>${submitted}</span></div>`;
            }).join('');
        } catch (e) { }
    }

    async function loadFutInvestProfile() {
        try {
            const data = await ApiService._fetch('/futinvest-profile/profile');
            if (!data) return;

            document.getElementById('futinves-total-scans').textContent = data.stats.totalScans || 0;
            document.getElementById('futinves-profitable').textContent = data.stats.profitableOpportunities || 0;
            document.getElementById('futinves-total-profit').textContent = '$' + (data.stats.totalProfit || 0).toFixed(2);
            document.getElementById('futinves-profile-best-profit').textContent = '$' + (data.stats.bestProfit || 0).toFixed(2);
            document.getElementById('futinves-executed').textContent = data.stats.executedCount || 0;

            if (data.config) {
                document.getElementById('futinves-auto-execute').checked = data.config.autoExecute || false;
                document.getElementById('futinves-min-profit').value = data.config.minProfit || 1.0;
                document.getElementById('futinves-max-trade').value = data.config.maxTrade || 10000;
            }

            const recentEl = document.getElementById('futinves-recent-scans');
            if (recentEl) {
                if (!data.recentScans || data.recentScans.length === 0) {
                    recentEl.innerHTML = '<div class="prof-tx-empty">Sin escaneos recientes</div>';
                } else {
                    recentEl.innerHTML = data.recentScans.map(s => {
                        const date = s.created_at ? new Date(s.created_at).toLocaleString() : '—';
                        return `<div class="futinves-scan-row ${s.is_profitable ? 'profitable' : ''}">
                            <span class="futinves-scan-symbol">${s.symbol}</span>
                            <span class="futinves-scan-exchanges">${s.buy_exchange} → ${s.sell_exchange}</span>
                            <span class="futinves-scan-profit ${s.profit > 0 ? 'green' : 'red'}">$${(s.profit || 0).toFixed(2)}</span>
                            <span class="futinves-scan-date">${date}</span>
                            <span class="futinves-scan-status">${s.executed ? '✓ Ejecutado' : '○ Pendiente'}</span>
                        </div>`;
                    }).join('');
                }
            }

            const executedEl = document.getElementById('futinves-executed-trades');
            if (executedEl) {
                if (!data.executedTrades || data.executedTrades.length === 0) {
                    executedEl.innerHTML = '<div class="prof-tx-empty">Sin arbitrajes ejecutados</div>';
                } else {
                    executedEl.innerHTML = data.executedTrades.map(t => {
                        const date = t.created_at ? new Date(t.created_at).toLocaleString() : '—';
                        return `<div class="futinves-trade-row">
                            <span class="futinves-trade-id">#${t.id}</span>
                            <span class="futinves-trade-exchanges">${t.buy_exchange} → ${t.sell_exchange}</span>
                            <span class="futinves-trade-profit green">$${(t.profit || 0).toFixed(2)}</span>
                            <span class="futinves-trade-fee">Fee: $${(t.fee || 0).toFixed(2)}</span>
                            <span class="futinves-trade-date">${date}</span>
                        </div>`;
                    }).join('');
                }
            }
        } catch (e) { console.error('Error loading FutInvest profile:', e); }
    }

    document.getElementById('btn-save-futinves-config')?.addEventListener('click', async () => {
        try {
            await ApiService._fetch('/futinvest-profile/settings', {
                method: 'POST',
                body: JSON.stringify({
                    autoExecute: document.getElementById('futinves-auto-execute').checked,
                    minProfit: parseFloat(document.getElementById('futinves-min-profit').value),
                    maxTrade: parseFloat(document.getElementById('futinves-max-trade').value),
                })
            });
            showToast('Configuración de FutInvest guardada', 'success');
        } catch (err) { showToast(err.message, 'error'); }
    });

    // Settings
    async function loadSettings() {
        try {
            const meData = await ApiService.me();
            const code = meData.referralCode;
            if (code) document.getElementById('settings-referral-code').textContent = code;
            const notifRes = await ApiService._fetch('/settings/notifications');
            document.getElementById('settings-email-notif').checked = notifRes.emailNotifications;
            document.getElementById('settings-push-notif').checked = notifRes.pushEnabled;
            const refRes = await ApiService._fetch('/referrals/stats');
            document.getElementById('settings-referral-count').textContent = refRes.referralCount;
            document.getElementById('settings-referral-earnings').textContent = `$${refRes.referralEarnings.toFixed(2)}`;
            const kycBadge = document.getElementById('kyc-status-badge');
            if (kycBadge && meData.kycStatus) {
                const labels = { pending: 'Pendiente', approved: 'Aprobada', rejected: 'Rechazada' };
                const icons = { pending: 'hourglass_empty', approved: 'verified', rejected: 'warning' };
                kycBadge.className = 'kyc-status-badge kyc-status-' + meData.kycStatus;
                kycBadge.innerHTML = `<span class="material-icons-round">${icons[meData.kycStatus] || 'help'}</span><span>${labels[meData.kycStatus] || meData.kycStatus}</span>`;
                if (meData.kycStatus === 'approved') document.getElementById('kyc-upload-form').style.display = 'none';
            }
        } catch (e) { }
    }

    document.getElementById('settings-password-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            await ApiService._fetch('/settings/change-password', { method: 'POST', body: JSON.stringify({ currentPassword: document.getElementById('settings-current-password').value, newPassword: document.getElementById('settings-new-password').value }) });
            showToast('Contraseña actualizada', 'success');
        } catch (err) { showToast(err.message, 'error'); }
    });

    document.getElementById('btn-save-notifications')?.addEventListener('click', async () => {
        try {
            await ApiService._fetch('/settings/notifications', { method: 'POST', body: JSON.stringify({ emailNotifications: document.getElementById('settings-email-notif').checked, pushEnabled: document.getElementById('settings-push-notif').checked }) });
            showToast('Preferencias guardadas', 'success');
        } catch (err) { showToast(err.message, 'error'); }
    });

    document.getElementById('kyc-upload-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const file = document.getElementById('kyc-file').files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async () => {
            try {
                await ApiService._fetch('/settings/kyc', { method: 'POST', body: JSON.stringify({ documentType: document.getElementById('kyc-doc-type').value, fileBase64: reader.result.split(',')[1], mimeType: file.type }) });
                showToast('Documento subido', 'success');
            } catch (err) { showToast(err.message, 'error'); }
        };
        reader.readAsDataURL(file);
    });

    document.getElementById('settings-delete-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!confirm('¿Estás seguro? Esta acción es irreversible.')) return;
        try {
            await ApiService._fetch('/settings/account', { method: 'DELETE', body: JSON.stringify({ password: document.getElementById('settings-delete-password').value }) });
            showToast('Cuenta eliminada', 'info');
            setTimeout(() => location.reload(), 2000);
        } catch (err) { showToast(err.message, 'error'); }
    });

    // Admin
    async function loadAdminStats() {
        try {
            const data = await ApiService._fetch('/admin/stats');
            document.querySelector('#admin-stat-users .stat-value').textContent = data.totalUsers || 0;
            document.querySelector('#admin-stat-deposits .stat-value').textContent = `$${(data.totalDeposits || 0).toLocaleString()}`;
            document.querySelector('#admin-stat-withdrawals .stat-value').textContent = `$${(data.totalWithdrawals || 0).toLocaleString()}`;
            document.querySelector('#admin-stat-pending .stat-value').textContent = data.pendingWithdrawals || 0;
            document.querySelector('#admin-stat-fees .stat-value').textContent = `$${(data.totalFees || 0).toLocaleString()}`;
            document.querySelector('#admin-stat-users-today .stat-value').textContent = data.newUsersToday || 0;
        } catch (e) { }
    }

    async function loadAdminPendingWithdrawals() {
        try {
            const data = await ApiService._fetch('/admin/withdrawals?status=pending');
            const tbody = document.getElementById('admin-pending-body');
            if (!data.withdrawals || data.withdrawals.length === 0) { tbody.innerHTML = '<tr><td colspan="8" class="text-center">Sin retiros pendientes</td></tr>'; return; }
            tbody.innerHTML = data.withdrawals.map(w => `
                <tr>
                    <td>#${w.id}</td><td>${w.full_name || w.email}</td><td>${w.asset}</td><td>$${w.amount.toFixed(2)}</td>
                    <td>$${(w.fee || 0).toFixed(2)}</td><td class="mono" style="max-width:120px;overflow:hidden;text-overflow:ellipsis">${w.wallet_address || '—'}</td>
                    <td>${new Date(w.created_at).toLocaleDateString()}</td>
                    <td><button class="btn btn-sm btn-primary btn-approve" data-id="${w.id}">Aprobar</button> <button class="btn btn-sm btn-secondary btn-reject" data-id="${w.id}">Rechazar</button></td>
                </tr>`).join('');
        } catch (e) { document.getElementById('admin-pending-body').innerHTML = '<tr><td colspan="8" class="text-center">Error</td></tr>'; }
    }

    async function loadAdminFeeConfig() {
        try {
            const data = await ApiService._fetch('/admin/fees');
            const tbody = document.getElementById('admin-fees-body');
            if (!data.fees || data.fees.length === 0) { tbody.innerHTML = '<tr><td colspan="9" class="text-center">Sin configuración</td></tr>'; return; }
            tbody.innerHTML = data.fees.map(f => `
                <tr><td>#${f.id}</td><td>${f.asset}</td><td>${f.network}</td><td>${f.withdrawal_fee}%</td><td>${f.deposit_fee}%</td><td>$${f.min_withdrawal}</td><td>$${f.max_withdrawal}</td><td>${f.confirmations}</td>
                <td><button class="btn btn-sm btn-outline admin-edit-fee" data-id="${f.id}">Editar</button></td></tr>`).join('');
        } catch (e) { document.getElementById('admin-fees-body').innerHTML = '<tr><td colspan="9" class="text-center">Error</td></tr>'; }
    }

    async function loadAdminUsers() {
        try {
            const data = await ApiService._fetch('/admin/users');
            const tbody = document.getElementById('admin-users-body');
            if (!data.users || data.users.length === 0) { tbody.innerHTML = '<tr><td colspan="8" class="text-center">Sin usuarios</td></tr>'; return; }
            tbody.innerHTML = data.users.map(u => `
                <tr><td>#${u.id}</td><td>${u.email}</td><td>${u.full_name}</td><td>${u.role}</td><td>${u.tier}</td>
                <td><span class="badge badge-${u.kyc_status === 'approved' ? 'success' : u.kyc_status === 'rejected' ? 'danger' : 'warning'}">${u.kyc_status}</span></td>
                <td>${u.totp_enabled ? '✓' : '—'}</td><td>${new Date(u.created_at).toLocaleDateString()}</td></tr>`).join('');
        } catch (e) { document.getElementById('admin-users-body').innerHTML = '<tr><td colspan="8" class="text-center">Error</td></tr>'; }
    }

    async function loadAdminWithdrawalHistory() {
        const status = document.getElementById('admin-withdrawal-filter')?.value || '';
        try {
            const data = await ApiService._fetch(`/admin/withdrawals${status ? '?status=' + status : ''}`);
            const tbody = document.getElementById('admin-history-body');
            if (!data.withdrawals || data.withdrawals.length === 0) { tbody.innerHTML = '<tr><td colspan="7" class="text-center">Sin retiros</td></tr>'; return; }
            tbody.innerHTML = data.withdrawals.map(w => `
                <tr><td>#${w.id}</td><td>${w.full_name || w.email}</td><td>${w.asset}</td><td>$${w.amount.toFixed(2)}</td>
                <td><span class="badge badge-${w.status === 'completed' ? 'success' : w.status === 'failed' ? 'danger' : 'warning'}">${w.status}</span></td>
                <td>${w.provider || '-'}</td><td>${new Date(w.created_at).toLocaleDateString()}</td></tr>`).join('');
        } catch (e) { document.getElementById('admin-history-body').innerHTML = '<tr><td colspan="7" class="text-center">Error</td></tr>'; }
    }

    async function loadAdminMasterWallets() {
        try {
            const data = await ApiService._fetch('/payka/wallets');
            const tbody = document.getElementById('admin-wallets-body');
            if (!data.wallets || data.wallets.length === 0) { tbody.innerHTML = '<tr><td colspan="6" class="text-center">Sin billeteras</td></tr>'; return; }
            tbody.innerHTML = data.wallets.map(w => `
                <tr><td><strong>${w.asset}</strong></td><td class="mono wallet-addr" title="${w.wallet_address}">${w.wallet_address}</td>
                <td>$${(w.balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                <td>$${(w.totalDeposited || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                <td><span class="badge badge-${w.active ? 'success' : 'danger'}">${w.active ? 'Activa' : 'Inactiva'}</span></td>
                <td><button class="btn btn-sm btn-outline admin-edit-wallet" data-id="${w.id}" data-asset="${w.asset}" data-address="${w.wallet_address}"><span class="material-icons-round" style="font-size:16px">edit</span></button></td></tr>`).join('');
        } catch (e) { document.getElementById('admin-wallets-body').innerHTML = '<tr><td colspan="6" class="text-center">Error</td></tr>'; }
    }

    async function refreshAdminPanel() {
        loadAdminStats();
        loadAdminPendingWithdrawals();
        loadAdminFeeConfig();
        loadAdminUsers();
        loadAdminWithdrawalHistory();
        loadAdminMasterWallets();
    }

    document.addEventListener('click', async (e) => {
        const approveBtn = e.target.closest('.btn-approve');
        if (approveBtn) {
            try { await ApiService.approveWithdrawal(approveBtn.dataset.id); showToast('Retiro aprobado', 'success'); refreshAdminPanel(); } catch (err) { showToast(err.message, 'error'); }
            return;
        }
        const rejectBtn = e.target.closest('.btn-reject');
        if (rejectBtn) {
            if (!confirm('¿Rechazar este retiro?')) return;
            try { await ApiService.rejectWithdrawal(rejectBtn.dataset.id, 'Rechazado'); showToast('Retiro rechazado', 'info'); refreshAdminPanel(); } catch (err) { showToast(err.message, 'error'); }
            return;
        }
        const editFeeBtn = e.target.closest('.admin-edit-fee');
        if (editFeeBtn) {
            const newFee = prompt('Nuevo fee de retiro (%):');
            if (newFee !== null && !isNaN(parseFloat(newFee))) {
                try { await ApiService.updateFeeConfig(editFeeBtn.dataset.id, { withdrawal_fee: parseFloat(newFee) }); showToast('Fee actualizado', 'success'); loadAdminFeeConfig(); } catch (err) { showToast(err.message, 'error'); }
            }
            return;
        }
        const editWalletBtn = e.target.closest('.admin-edit-wallet');
        if (editWalletBtn) {
            const id = editWalletBtn.dataset.id;
            const asset = editWalletBtn.dataset.asset;
            const currentAddress = editWalletBtn.dataset.address;
            const newAddress = prompt(`Nueva dirección para ${asset}:`, currentAddress);
            if (newAddress !== null && newAddress.trim()) {
                try {
                    await ApiService._fetch(`/payka/wallets/${id}`, { method: 'PATCH', body: JSON.stringify({ wallet_address: newAddress.trim() }) });
                    showToast('Billetera actualizada', 'success');
                    loadAdminMasterWallets();
                } catch (err) { showToast(err.message, 'error'); }
            }
            return;
        }
    });

    document.getElementById('admin-refresh-pending')?.addEventListener('click', loadAdminPendingWithdrawals);
    document.getElementById('admin-refresh-fees')?.addEventListener('click', loadAdminFeeConfig);
    document.getElementById('admin-refresh-users')?.addEventListener('click', loadAdminUsers);
    document.getElementById('admin-refresh-history')?.addEventListener('click', loadAdminWithdrawalHistory);
    document.getElementById('admin-refresh-wallets')?.addEventListener('click', loadAdminMasterWallets);
    document.getElementById('admin-withdrawal-filter')?.addEventListener('change', loadAdminWithdrawalHistory);

    // Live simulation
    function simulateLiveROI() {
        setInterval(() => {
            currentRoi = 1.5 + Math.random() * 1.0;
            const roiEl = document.getElementById('live-roi-percentage');
            if (roiEl) roiEl.textContent = `+${currentRoi.toFixed(2)}%`;
            const increment = totalBalance * (currentRoi / 100) / 86400 * 4;
            totalBalance += increment;
            const balEl = document.getElementById('live-balance');
            if (balEl) balEl.textContent = '$' + totalBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }, 4000);
    }

    // Theme toggle
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const html = document.documentElement;
            const current = html.getAttribute('data-theme');
            const next = current === 'dark' ? 'light' : 'dark';
            html.setAttribute('data-theme', next);
            themeToggle.querySelector('.material-icons-round').textContent = next === 'dark' ? 'dark_mode' : 'light_mode';
        });
    }

    // Dashboard Sparklines
    function drawSparkline(canvasId, data, color) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const w = canvas.width, h = canvas.height;
        ctx.clearRect(0, 0, w, h);
        
        const min = Math.min(...data) * 0.95;
        const max = Math.max(...data) * 1.05;
        const stepX = w / (data.length - 1);
        
        // Fill
        ctx.beginPath();
        ctx.moveTo(0, h);
        data.forEach((val, i) => {
            const x = i * stepX;
            const y = h - ((val - min) / (max - min)) * h;
            ctx.lineTo(x, y);
        });
        ctx.lineTo(w, h);
        ctx.closePath();
        ctx.fillStyle = color + '15';
        ctx.fill();
        
        // Line
        ctx.beginPath();
        data.forEach((val, i) => {
            const x = i * stepX;
            const y = h - ((val - min) / (max - min)) * h;
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        });
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    function initSparklines() {
        const balanceData = [10200, 10800, 11200, 10900, 11500, 11800, 12100, 11900, 12300, 12450];
        const profitData = [120, 180, 95, 210, 165, 240, 190, 280, 310, 342];
        const roiData = [1.2, 1.5, 1.8, 1.4, 1.9, 2.1, 1.7, 2.0, 1.85, 1.85];
        const arbData = [2, 5, 3, 8, 6, 12, 9, 15, 18, 23];
        
        drawSparkline('spark-balance', balanceData, '#00D4FF');
        drawSparkline('spark-profit', profitData, '#00FF88');
        drawSparkline('spark-roi', roiData, '#FFD700');
        drawSparkline('spark-arb', arbData, '#9945FF');
    }

    // Allocation Donut Chart
    function drawAllocationChart() {
        const canvas = document.getElementById('allocation-chart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const w = canvas.width, h = canvas.height;
        const cx = w / 2, cy = h / 2;
        const radius = Math.min(w, h) / 2 - 10;
        const innerRadius = radius * 0.6;
        
        const data = [
            { label: 'USDT TRC20', value: 35, color: '#00D4FF' },
            { label: 'USDT ERC20', value: 25, color: '#00FF88' },
            { label: 'BTC', value: 20, color: '#F7931A' },
            { label: 'ETH', value: 15, color: '#627EEA' },
            { label: 'SOL', value: 5, color: '#9945FF' },
        ];
        
        const total = data.reduce((sum, d) => sum + d.value, 0);
        let startAngle = -Math.PI / 2;
        
        data.forEach(d => {
            const sliceAngle = (d.value / total) * 2 * Math.PI;
            const endAngle = startAngle + sliceAngle;
            
            ctx.beginPath();
            ctx.arc(cx, cy, radius, startAngle, endAngle);
            ctx.arc(cx, cy, innerRadius, endAngle, startAngle, true);
            ctx.closePath();
            ctx.fillStyle = d.color;
            ctx.fill();
            
            startAngle = endAngle;
        });
        
        // Center text
        ctx.fillStyle = '#E8ECF4';
        ctx.font = 'bold 18px Space Grotesk';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('$12.4K', cx, cy - 8);
        ctx.fillStyle = '#8B95A8';
        ctx.font = '11px Inter';
        ctx.fillText('Total', cx, cy + 10);
    }

    // Chart Time Filters
    document.querySelectorAll('.chart-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.chart-filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            loadPerformanceChart();
        });
    });

    // Init
    simulateLiveROI();
    updateLiveIndicator();
    initSparklines();
    drawAllocationChart();
});
