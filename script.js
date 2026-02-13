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
        rateDisplay.innerHTML = `<span>💵 $ <b>${fmt(rates.USD)}</b></span> <span>💶 € <b>${fmt(rates.EUR)}</b></span>`;
    }
}

// --- 2. AUTENTICACIÓN (LOGIN Y REGISTRO SEPARADOS) ---
window.toggleAuth = function(showRegister) {
    const loginForm = document.getElementById('login-form-container');
    const registerForm = document.getElementById('register-form-container');
    const authTitle = document.getElementById('auth-title');

    if (showRegister) {
        loginForm.style.display = 'none';
        registerForm.style.display = 'flex';
        registerForm.style.flexDirection = 'column';
        registerForm.style.gap = '15px';
        authTitle.innerText = "Crear Cuenta Nueva";
    } else {
        registerForm.style.display = 'none';
        loginForm.style.display = 'flex';
        loginForm.style.flexDirection = 'column';
        loginForm.style.gap = '15px';
        authTitle.innerText = "Iniciar Sesión";
    }
};

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
        } else { showModal("Error", "Datos incorrectos", "🚫"); }
    } catch (e) { showModal("Error", "Error de red", "❌"); }
}

async function register() {
    const username = document.getElementById('reg-username').value;
    const name = document.getElementById('reg-name').value;
    const lastname = document.getElementById('reg-lastname').value;
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;
    if (!username || !password || !email) return showModal("Error", "Faltan datos", "❌");

    try {
        const response = await fetch(`${API_URL}/api/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, name, lastname, email })
        });
        if (response.ok) {
            await showModal("Éxito", "Cuenta creada", "🎉");
            window.toggleAuth(false);
        } else {
            const data = await response.json();
            showModal("Error", data.error, "❌");
        }
    } catch (e) { showModal("Error", "Error de red", "📡"); }
}

// --- 3. FUNCIONES DE LA APP ---
function entrarALaApp() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app-container').style.display = 'block';
    document.getElementById('app-header-ui').style.display = 'flex';
    
    document.getElementById('total-budget').value = budgetVES || "";
    document.getElementById('spending-limit').value = spendingLimitVES || "";
    
    updateUserUI();
    fetchBCVRate(); 
    showSection('inicio');
}

function logout() {
    localStorage.removeItem('milCuentas_session');
    location.reload();
}

async function setBudget() {
    budgetVES = parseFloat(document.getElementById('total-budget').value) || 0;
    spendingLimitVES = parseFloat(document.getElementById('spending-limit').value) || 0;
    renderAll();
    await syncToCloud();
    showModal("Guardado", "Presupuesto actualizado", "⚙️");
}

function changeView(iso) {
    currentView = iso;
    renderAll();
}

async function resetApp() {
    if (await showModal("Borrar Todo", "¿Seguro que quieres resetear tus cuentas?", "🗑️", true)) {
        transactions = [];
        budgetVES = 0;
        spendingLimitVES = 0;
        document.getElementById('total-budget').value = "";
        document.getElementById('spending-limit').value = "";
        renderAll();
        await syncToCloud();
    }
}

async function addTransaction() {
    const desc = document.getElementById('desc').value;
    const amount = parseFloat(document.getElementById('amount').value);
    const currency = document.getElementById('currency').value;
    if (!desc || isNaN(amount)) return showModal("Error", "Ingresa descripción y monto", "🛒");

    const amountInVES = (currency === "VES") ? amount : amount * rates[currency];
    
    transactions.push({ 
        id: Date.now(), 
        date: new Date().toISOString(), 
        desc, 
        originalAmount: amount, 
        originalCurrency: currency, 
        valueVES: amountInVES 
    });

    document.getElementById('desc').value = '';
    document.getElementById('amount').value = '';
    renderAll();
    await syncToCloud();
}

function renderAll() {
    const list = document.getElementById('transaction-list');
    const display = document.getElementById('remaining-display');
    const card = document.getElementById('balance-card');
    
    let totalSpentVES = 0, totalHoy = 0, totalMes = 0;
    list.innerHTML = '';

    const isToday = (d) => new Date(d).toDateString() === new Date().toDateString();
    const isThisMonth = (d) => new Date(d).getMonth() === new Date().getMonth();

    [...transactions].reverse().forEach(t => {
        totalSpentVES += t.valueVES;
        if (isToday(t.date)) totalHoy += t.valueVES;
        if (isThisMonth(t.date)) totalMes += t.valueVES;

        const li = document.createElement('li');
        li.innerHTML = `<div><b>${t.desc}</b><br><small>${fmt(t.originalAmount)} ${t.originalCurrency}</small></div>
            <div style="text-align: right;"><strong>-${fmt(t.valueVES)} BS</strong><br>
            <span onclick="deleteTransaction(${t.id})" style="color:red; cursor:pointer; font-size:10px;">Eliminar</span></div>`;
        list.appendChild(li);
    });

    const remainingVES = budgetVES - totalSpentVES;
    
    // Lógica de Alerta por límite
    if (spendingLimitVES > 0 && remainingVES <= spendingLimitVES) {
        card.style.background = "linear-gradient(135deg, #f59e0b, #d97706)"; // Naranja alerta
    } else {
        card.style.background = "linear-gradient(135deg, #4f46e5, #7c3aed)";
    }
    if (remainingVES <= 0) card.style.background = "linear-gradient(135deg, #dc2626, #991b1b)";

    const converted = (currentView === "VES") ? remainingVES : remainingVES / rates[currentView];
    display.innerText = `${fmt(converted)} ${currentView}`;
    
    updateStatsUI(totalHoy, totalMes);
}

// --- RESTO DE FUNCIONES (Stats, Sidebar, Modales) ---
function updateStatsUI(hoy, mes) {
    const panel = document.getElementById('stats-panel');
    if(panel) panel.innerHTML = `<div class="stat-item">Hoy: ${fmt(hoy)} BS</div><div class="stat-item">Mes: ${fmt(mes)} BS</div>`;
}

async function deleteTransaction(id) {
    transactions = transactions.filter(t => t.id !== id);
    renderAll(); await syncToCloud();
}

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
    } catch (e) { console.error("Error Sync"); }
}

function toggleMenu() {
    document.getElementById('sidebar').classList.toggle('active');
    document.getElementById('sidebar-overlay').classList.toggle('active');
}

function showSection(sec) {
    document.getElementById('section-inicio').style.display = sec === 'inicio' ? 'block' : 'none';
    document.getElementById('section-stats').style.display = sec === 'stats' ? 'block' : 'none';
    toggleMenu();
}

function updateUserUI() {
    document.getElementById('side-username').innerText = userName;
}

function showModal(title, message, icon, isConfirm = false) {
    return new Promise((resolve) => {
        const modal = document.getElementById('custom-modal');
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
    else window.toggleAuth(false);
};





