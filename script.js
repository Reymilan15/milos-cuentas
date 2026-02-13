// --- CONFIGURACIÓN Y ESTADO (Mantenido intacto) ---
var API_URL = "https://milos-cuentas.onrender.com"; 

let transactions = [];
let budgetVES = 0;
let spendingLimitVES = 0;
let currentView = 'VES'; 
let rates = { "USD": 1, "EUR": 1, "VES": 1 };

let currentUser = JSON.parse(localStorage.getItem('milCuentas_session')) || null;
let userName = "Usuario";
let userLastName = "Invitado";

const fmt = (num) => new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);

// --- 1. ACTUALIZACIÓN DIARIA BCV (Tasa del día) ---
async function fetchBCVRate() {
    try {
        const response = await fetch('https://ve.dolarapi.com/v1/dolares/oficial');
        const data = await response.json();
        if(data && data.promedio) {
            rates.USD = parseFloat(data.promedio);
            rates.EUR = rates.USD * 1.08; 
            console.log("Tasas actualizadas con éxito");
        }
    } catch (e) { 
        console.error("Error al obtener tasas BCV. Usando respaldo.");
        if(rates.USD === 1) rates.USD = 36.50; 
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

// --- 2. LÓGICA DE CONVERSIÓN (Tu división matemática respetada) ---
function changeView(iso) {
    currentView = iso;
    renderAll(); 
}

function renderAll() {
    const list = document.getElementById('transaction-list');
    const display = document.getElementById('remaining-display');
    const card = document.getElementById('balance-card');
    
    if(!list || !display) return;

    let totalSpentVES = 0;
    let totalHoy = 0;
    let totalMes = 0;
    list.innerHTML = '';
    const hoy = new Date();

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
    
    // OPERACIÓN DE DIVISIÓN SEGÚN TU SOLICITUD
    let finalValue = remainingVES;
    if (currentView === "USD") finalValue = remainingVES / rates.USD;
    else if (currentView === "EUR") finalValue = remainingVES / rates.EUR;

    display.innerText = `${fmt(finalValue)} ${currentView === 'VES' ? 'BS' : currentView}`;

    if (spendingLimitVES > 0 && remainingVES <= spendingLimitVES) {
        card.style.background = "linear-gradient(135deg, #f59e0b, #d97706)";
    } else {
        card.style.background = "linear-gradient(135deg, #4f46e5, #7c3aed)";
    }
    if (remainingVES <= 0) card.style.background = "linear-gradient(135deg, #dc2626, #991b1b)";

    updateStatsUI(totalHoy, totalMes);
}

// --- 3. REGISTRO DE GASTOS (Con saldo previo respetado) ---
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

// --- 4. AUTENTICACIÓN (Sin agrupaciones raras al cerrar sesión) ---
window.toggleAuth = (reg) => {
    const loginCont = document.getElementById('login-form-container');
    const regCont = document.getElementById('register-form-container');
    const authTitle = document.getElementById('auth-title');

    if (reg) {
        loginCont.style.display = 'none';
        regCont.style.display = 'flex';
        regCont.style.flexDirection = 'column'; // Orden vertical corregido
        authTitle.innerText = "Crear Cuenta";
    } else {
        loginCont.style.display = 'flex';
        loginCont.style.flexDirection = 'column'; // Orden vertical corregido
        regCont.style.display = 'none';
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
            entrarALaApp();
        } else { showModal("Error", "Credenciales incorrectas", "🚫"); }
    } catch (e) { showModal("Error", "Error de conexión", "❌"); }
}

function entrarALaApp() {
    if (!currentUser) return;
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app-container').style.display = 'block';
    document.getElementById('app-header-ui').style.display = 'flex';
    
    transactions = currentUser.transactions || [];
    budgetVES = currentUser.budget || 0;
    spendingLimitVES = currentUser.spendingLimit || 0;
    userName = currentUser.name || "Usuario";
    userLastName = currentUser.lastname || "";

    document.getElementById('total-budget').value = budgetVES || "";
    document.getElementById('spending-limit').value = spendingLimitVES || "";
    document.getElementById('side-username').innerText = userName;
    document.getElementById('side-fullname').innerText = `${userName} ${userLastName}`;
    fetchBCVRate(); 
}

// --- 5. FUNCIONES DE APOYO (Historial detallado y Sync) ---
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
    } catch (e) { console.error("Error de sincronización"); }
}

function updateStatsUI(hoy, mes) {
    const p = document.getElementById('stats-panel');
    if(p) p.innerHTML = `<div style="padding:15px; background:#1e293b; border-radius:12px; margin-bottom:10px;">GASTOS HOY: ${fmt(hoy)} BS</div>
                         <div style="padding:15px; background:#1e293b; border-radius:12px;">GASTOS MES: ${fmt(mes)} BS</div>`;
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

window.onload = () => { if (currentUser) entrarALaApp(); else window.toggleAuth(false); };
