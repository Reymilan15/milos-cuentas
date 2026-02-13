const API_URL = "https://milos-cuentas.onrender.com"; 

let transactions = [];
let budgetVES = 0;
let spendingLimitVES = 0;
let currentView = 'VES';
let rates = { "USD": 1, "EUR": 1, "VES": 1 };

let currentUser = JSON.parse(localStorage.getItem('milCuentas_session')) || null;
let userName = "Usuario";
let userLastName = "Invitado";

const fmt = (num) => new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);

// --- 1. TASA BCV ---
async function fetchBCVRate() {
    try {
        const response = await fetch('https://pydolarve.org/api/v1/dollar?page=bcv');
        const data = await response.json();
        if(data && data.monedas) {
            rates.USD = parseFloat(data.monedas.usd.valor);
            rates.EUR = parseFloat(data.monedas.eur.valor);
        }
    } catch (e) {
        try {
            const resAlt = await fetch('https://ve.dolarapi.com/v1/dolares/oficial');
            const dataAlt = await resAlt.json();
            if(dataAlt.promedio) {
                rates.USD = dataAlt.promedio;
                rates.EUR = rates.USD * 1.08;
            }
        } catch (err) { console.error("Error en tasas."); }
    }
    updateBCVUI();
    renderAll();
}

function updateBCVUI() {
    const rateDisplay = document.getElementById('bcv-rate-display');
    if (rateDisplay) {
        rateDisplay.innerHTML = `<span style="margin-right: 12px;">💵 $ <b>${fmt(rates.USD)}</b></span><span>| 💶 € <b>${fmt(rates.EUR)}</b></span>`;
        rateDisplay.onclick = async () => {
            const opcion = prompt("1: USD, 2: EUR");
            if(opcion === "1") {
                const m = prompt("Nuevo USD:", rates.USD);
                if(m && !isNaN(m)) rates.USD = parseFloat(m);
            } else if(opcion === "2") {
                const m = prompt("Nuevo EUR:", rates.EUR);
                if(m && !isNaN(m)) rates.EUR = parseFloat(m);
            }
            updateBCVUI(); renderAll();
        };
    }
}

// --- 2. AUTENTICACIÓN (CORREGIDA PARA SEPARACIÓN TOTAL) ---
window.toggleAuth = function(showRegister) {
    const loginForm = document.getElementById('login-form-container');
    const registerForm = document.getElementById('register-form-container');
    const authTitle = document.getElementById('auth-title');

    // Ocultar TODO antes de mostrar lo nuevo
    if (loginForm) loginForm.style.display = 'none';
    if (registerForm) registerForm.style.display = 'none';

    if (showRegister) {
        if (registerForm) {
            registerForm.style.display = 'flex';
            registerForm.style.flexDirection = 'column';
            registerForm.style.gap = '15px';
        }
        if (authTitle) authTitle.innerText = "Crear Cuenta Nueva";
    } else {
        if (loginForm) {
            loginForm.style.display = 'flex';
            loginForm.style.flexDirection = 'column';
            loginForm.style.gap = '15px';
        }
        if (authTitle) authTitle.innerText = "Iniciar Sesión";
    }
};

async function syncToCloud() {
    if (!currentUser) return;
    try {
        await fetch(`${API_URL}/api/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: currentUser.username,
                budget: budgetVES,
                spendingLimit: spendingLimitVES,
                transactions: transactions
            })
        });
    } catch (error) { console.error("Error sincronizando:", error); }
}

async function register() {
    const username = document.getElementById('reg-username').value;
    const name = document.getElementById('reg-name').value;
    const lastname = document.getElementById('reg-lastname').value;
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;
    if (!username || !password || !email) return showModal("Error", "Campos incompletos", "❌");

    try {
        const response = await fetch(`${API_URL}/api/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, name, lastname, email })
        });
        if (response.ok) {
            await showModal("Éxito", "Cuenta creada.", "🎉");
            window.toggleAuth(false);
        } else {
            const data = await response.json();
            showModal("Error", data.error, "❌");
        }
    } catch (e) { showModal("Error", "Reintenta.", "📡"); }
}

async function login() {
    const identifier = document.getElementById('username').value;
    const password = document.getElementById('login-password').value;
    try {
        const response = await fetch(`${API_URL}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier, password })
        });
        if (response.ok) {
            const user = await response.json();
            currentUser = user;
            localStorage.setItem('milCuentas_session', JSON.stringify(user));
            transactions = user.transactions || [];
            budgetVES = user.budget || 0;
            spendingLimitVES = user.spendingLimit || 0;
            userName = user.name || "Usuario";
            userLastName = user.lastname || "";
            entrarALaApp();
        } else { showModal("Error", "Acceso denegado.", "🚫"); }
    } catch (e) { showModal("Error", "Error de red.", "❌"); }
}

// --- 3. NAVEGACIÓN ---
function entrarALaApp() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app-container').style.display = 'block';
    const headerUI = document.getElementById('app-header-ui');
    if(headerUI) headerUI.style.display = 'flex';
    
    document.getElementById('total-budget').value = budgetVES || "";
    document.getElementById('spending-limit').value = spendingLimitVES || "";
    updateUserUI();
    fetchBCVRate(); 
    showSection('inicio');
}

function logout() {
    localStorage.removeItem('milCuentas_session');
    document.getElementById('app-container').style.display = 'none';
    const headerUI = document.getElementById('app-header-ui');
    if(headerUI) headerUI.style.display = 'none';
    location.reload();
}

async function showSection(section) {
    document.getElementById('sidebar').classList.remove('active');
    document.getElementById('sidebar-overlay').classList.remove('active');
    const secInicio = document.getElementById('section-inicio');
    const secStats = document.getElementById('section-stats');
    if (section === 'inicio') {
        secInicio.style.display = 'block';
        secStats.style.display = 'none';
        renderAll(); 
    } else if (section === 'stats') {
        secInicio.style.display = 'none';
        secStats.style.display = 'block';
        renderAll();
    }
}

// --- 4. GESTIÓN DE DATOS ---
async function addTransaction() {
    const desc = document.getElementById('desc').value;
    const amount = parseFloat(document.getElementById('amount').value);
    const currency = document.getElementById('currency').value;
    if (!desc || isNaN(amount)) return showModal("Error", "Datos vacíos.", "🛒");

    const amountInVES = (currency === "VES") ? amount : amount * rates[currency];
    transactions.push({ id: Date.now(), date: new Date().toISOString(), desc, originalAmount: amount, originalCurrency: currency, valueVES: amountInVES });
    document.getElementById('desc').value = '';
    document.getElementById('amount').value = '';
    renderAll();
    await syncToCloud(); 
}

function renderAll() {
    const list = document.getElementById('transaction-list');
    const display = document.getElementById('remaining-display');
    const card = document.getElementById('balance-card');
    if(!list || !display) return;

    let totalSpentVES = 0, totalHoy = 0, totalMes = 0;
    list.innerHTML = '';
    const isToday = (d) => new Date(d).toDateString() === new Date().toDateString();
    const isThisMonth = (d) => new Date(d).getMonth() === new Date().getMonth();

    [...transactions].reverse().forEach(t => {
        totalSpentVES += t.valueVES;
        if (isToday(t.date)) totalHoy += t.valueVES;
        if (isThisMonth(t.date)) totalMes += t.valueVES;
        const li = document.createElement('li');
        li.innerHTML = `<div><b>${t.desc}</b><br><span>${fmt(t.originalAmount)} ${t.originalCurrency}</span></div>
            <div style="text-align: right;"><strong>-${fmt(t.valueVES)} BS</strong><br>
            <small onclick="deleteTransaction(${t.id})" style="color: #ef4444; cursor: pointer;">Eliminar</small></div>`;
        list.appendChild(li);
    });

    const remainingVES = budgetVES - totalSpentVES;
    const converted = (currentView === "VES") ? remainingVES : remainingVES / rates[currentView];
    display.innerText = `${fmt(converted)} ${currentView}`;
    
    if (budgetVES > 0 && card) {
        card.style.background = remainingVES <= 0 ? "linear-gradient(135deg, #dc2626, #991b1b)" : "linear-gradient(135deg, #4f46e5, #7c3aed)";
    }
    updateStatsUI(totalHoy, totalMes);
}

function updateStatsUI(hoy, mes) {
    const statsDiv = document.getElementById('stats-panel');
    if (!statsDiv) return;
    statsDiv.innerHTML = `
        <div class="stats-container" style="display: grid; gap: 15px; margin-top: 20px;">
            <div class="stat-item" style="background: var(--card-bg); padding: 20px; border-radius: 15px; border-left: 5px solid var(--primary);">
                <small>Hoy</small><h2>${fmt(hoy)} BS</h2>
            </div>
            <div class="stat-item" style="background: var(--card-bg); padding: 20px; border-radius: 15px; border-left: 5px solid #22c55e;">
                <small>Este Mes</small><h2>${fmt(mes)} BS</h2>
            </div>
        </div>`;
}

function toggleMenu() {
    document.getElementById('sidebar').classList.toggle('active');
    document.getElementById('sidebar-overlay').classList.toggle('active');
}

function updateUserUI() {
    const sideU = document.getElementById('side-username');
    const sideF = document.getElementById('side-fullname');
    if(sideU) sideU.innerText = userName;
    if(sideF) sideF.innerText = `${userName} ${userLastName}`;
}

async function deleteTransaction(id) {
    if (await showModal("Eliminar", "¿Borrar?", "🗑️", true)) {
        transactions = transactions.filter(t => t.id !== id);
        renderAll(); await syncToCloud();
    }
}

function showModal(title, message, icon = "⚠️", isConfirm = false) {
    return new Promise((resolve) => {
        const modal = document.getElementById('custom-modal');
        if(!modal) return resolve(true);
        document.getElementById('modal-title').innerText = title;
        document.getElementById('modal-text').innerText = message;
        document.getElementById('modal-icon').innerText = icon;
        document.getElementById('modal-cancel-btn').style.display = isConfirm ? "block" : "none";
        modal.style.display = "flex";
        document.getElementById('modal-ok-btn').onclick = () => { modal.style.display = "none"; resolve(true); };
        document.getElementById('modal-cancel-btn').onclick = () => { modal.style.display = "none"; resolve(false); };
    });
}

window.onload = () => {
    if (currentUser) entrarALaApp();
    else {
        document.getElementById('app-container').style.display = 'none';
        document.getElementById('app-header-ui').style.display = 'none';
        document.getElementById('login-screen').style.display = 'flex';
        window.toggleAuth(false);
    }
};





