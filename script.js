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

// --- 1. ACTUALIZACIÓN DIARIA BCV (REVISADO) ---
async function fetchBCVRate() {
    try {
        // Obtenemos la tasa oficial del día directamente
        const response = await fetch('https://pydolarve.org/api/v1/dollar?page=bcv');
        const data = await response.json();
        if(data && data.monedas) {
            rates.USD = parseFloat(data.monedas.usd.valor);
            rates.EUR = parseFloat(data.monedas.eur.valor);
            console.log("Tasas BCV del día actualizadas:", rates);
        }
    } catch (e) { 
        console.error("Error al obtener tasas del BCV. Usando valores por defecto."); 
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

// --- 2. LÓGICA DE CONVERSIÓN (REVISADO - DIVISIÓN MATEMÁTICA) ---
function changeView(iso) {
    currentView = iso; // 'VES', 'USD' o 'EUR'
    renderAll(); 
}

function renderAll() {
    const list = document.getElementById('transaction-list');
    const display = document.getElementById('remaining-display');
    const card = document.getElementById('balance-card');
    
    let totalSpentVES = 0;
    let totalHoy = 0;
    let totalMes = 0;
    list.innerHTML = '';
    const hoy = new Date();

    // Siempre calculamos sobre la base de Bolívares
    [...transactions].reverse().forEach(t => {
        totalSpentVES += t.valueVES;
        const tDate = new Date(t.date);
        
        if (tDate.toDateString() === hoy.toDateString()) totalHoy += t.valueVES;
        if (tDate.getMonth() === hoy.getMonth() && tDate.getFullYear() === hoy.getFullYear()) totalMes += t.valueVES;

        const li = document.createElement('li');
        li.innerHTML = `<div><b>${t.desc}</b><br><small>${fmt(t.originalAmount)} ${t.originalCurrency}</small></div>
            <div style="text-align: right;"><strong>-${fmt(t.valueVES)} BS</strong><br>
            <span onclick="deleteTransaction(${t.id})" style="color:red; cursor:pointer; font-size:10px;">Eliminar</span></div>`;
        list.appendChild(li);
    });

    const remainingVES = budgetVES - totalSpentVES;
    
    // OPERACIÓN MATEMÁTICA SEGÚN TASA BCV
    let finalValue = remainingVES;
    if (currentView === "USD") {
        finalValue = remainingVES / rates.USD; // DIVISIÓN PARA DÓLAR
    } else if (currentView === "EUR") {
        finalValue = remainingVES / rates.EUR; // DIVISIÓN PARA EURO
    }

    // Actualizamos el display principal
    display.innerText = `${fmt(finalValue)} ${currentView === 'VES' ? 'BS' : currentView}`;

    // Colores de alerta por presupuesto
    if (spendingLimitVES > 0 && remainingVES <= spendingLimitVES) {
        card.style.background = "linear-gradient(135deg, #f59e0b, #d97706)";
    } else {
        card.style.background = "linear-gradient(135deg, #4f46e5, #7c3aed)";
    }
    if (remainingVES <= 0) card.style.background = "linear-gradient(135deg, #dc2626, #991b1b)";

    updateStatsUI(totalHoy, totalMes);
}

// --- 3. REGISTRO DE GASTOS (REVISADO) ---
async function addTransaction() {
    const desc = document.getElementById('desc').value;
    const amount = parseFloat(document.getElementById('amount').value);
    const currency = document.getElementById('currency').value;

    if (!desc || isNaN(amount)) return showModal("Error", "Faltan datos", "🛒");

    let amountInVES = amount;
    if (currency === "USD") amountInVES = amount * rates.USD;
    else if (currency === "EUR") amountInVES = amount * rates.EUR;
    
    const currentSpent = transactions.reduce((sum, t) => sum + t.valueVES, 0);
    const balanceAtMoment = budgetVES - currentSpent;

    transactions.push({ 
        id: Date.now(), 
        date: new Date().toISOString(), 
        desc, 
        originalAmount: amount, 
        originalCurrency: currency, 
        valueVES: amountInVES,
        balanceAtMoment: balanceAtMoment 
    });

    document.getElementById('desc').value = '';
    document.getElementById('amount').value = '';
    renderAll();
    await syncToCloud();
}

// --- 4. AUTENTICACIÓN (LOGIN Y REGISTRO - REVISADO) ---
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
        } else { showModal("Error", "Credenciales incorrectas", "🚫"); }
    } catch (e) { showModal("Error", "Error de conexión con el servidor", "❌"); }
}

async function register() {
    const username = document.getElementById('reg-username').value;
    const name = document.getElementById('reg-name').value;
    const lastname = document.getElementById('reg-lastname').value;
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;
    if (!username || !password || !email) return showModal("Error", "Datos obligatorios faltantes", "❌");
    try {
        const response = await fetch(`${API_URL}/api/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, name, lastname, email })
        });
        if (response.ok) {
            await showModal("Éxito", "Cuenta creada correctamente", "🎉");
            window.toggleAuth(false);
        } else {
            const data = await response.json();
            showModal("Error", data.error || "No se pudo registrar", "❌");
        }
    } catch (e) { showModal("Error", "Error de servidor", "📡"); }
}

function entrarALaApp() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app-container').style.display = 'block';
    document.getElementById('app-header-ui').style.display = 'flex';
    document.getElementById('total-budget').value = budgetVES || "";
    document.getElementById('spending-limit').value = spendingLimitVES || "";
    document.getElementById('side-username').innerText = userName;
    document.getElementById('side-fullname').innerText = `${userName} ${userLastName}`;
    fetchBCVRate(); 
}

// --- 5. FUNCIONES DE APOYO (HISTORIAL, SYNC, ETC) ---
function renderFullHistory() {
    const tableBody = document.getElementById('full-history-body');
    if(!tableBody) return;
    tableBody.innerHTML = '';
    [...transactions].reverse().forEach(t => {
        const d = new Date(t.date);
        const tr = document.createElement('tr');
        tr.style.borderBottom = "1px solid #334155";
        tr.innerHTML = `<td style="padding:10px;">${d.toLocaleDateString()}<br><small>${d.getHours()}:${d.getMinutes()}</small></td>
            <td style="padding:10px;">${t.desc}</td>
            <td style="padding:10px; color:#f87171;">-${fmt(t.valueVES)} BS</td>
            <td style="padding:10px; color:#4ade80;">${fmt(t.balanceAtMoment || 0)} BS</td>`;
        tableBody.appendChild(tr);
    });
}

function updateStatsUI(hoy, mes) {
    const p = document.getElementById('stats-panel');
    if(p) p.innerHTML = `<div style="padding:15px; background:#1e293b; border-radius:12px; margin-bottom:10px;">GASTOS HOY: ${fmt(hoy)} BS</div>
                         <div style="padding:15px; background:#1e293b; border-radius:12px;">GASTOS MES: ${fmt(mes)} BS</div>`;
}

async function syncToCloud() {
    if (!currentUser) return;
    try {
        await fetch(`${API_URL}/api/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: currentUser.username, budget: budgetVES,
                spendingLimit: spendingLimitVES, transactions: transactions
            })
        });
    } catch (e) { console.error("Error al sincronizar"); }
}

async function setBudget() { 
    budgetVES = parseFloat(document.getElementById('total-budget').value) || 0; 
    spendingLimitVES = parseFloat(document.getElementById('spending-limit').value) || 0; 
    renderAll(); await syncToCloud(); 
    showModal("Éxito", "Presupuesto guardado", "✅");
}

function showSection(sec) {
    document.getElementById('section-inicio').style.display = sec === 'inicio' ? 'block' : 'none';
    document.getElementById('section-stats').style.display = sec === 'stats' ? 'block' : 'none';
    document.getElementById('section-registros').style.display = sec === 'registros' ? 'block' : 'none';
    if(sec === 'registros') renderFullHistory();
    if(document.getElementById('sidebar').classList.contains('active')) toggleMenu();
}

function toggleMenu() {
    document.getElementById('sidebar').classList.toggle('active');
    document.getElementById('sidebar-overlay').classList.toggle('active');
}

function logout() { localStorage.removeItem('milCuentas_session'); location.reload(); }

async function deleteTransaction(id) { 
    if(await showModal("Eliminar", "¿Borrar registro?", "🗑️", true)) { 
        transactions = transactions.filter(t => t.id !== id); 
        renderAll(); await syncToCloud(); 
    } 
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

window.toggleAuth = (reg) => {
    document.getElementById('login-form-container').style.display = reg ? 'none' : 'flex';
    document.getElementById('register-form-container').style.display = reg ? 'flex' : 'none';
};

window.onload = () => { if (currentUser) entrarALaApp(); else window.toggleAuth(false); };
