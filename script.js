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

// --- 1. GESTIÓN DE TASAS ---
async function fetchBCVRate() {
    try {
        const response = await fetch('https://pydolarve.org/api/v1/dollar?page=bcv');
        const data = await response.json();
        if(data && data.monedas) {
            rates.USD = parseFloat(data.monedas.usd.valor);
            rates.EUR = parseFloat(data.monedas.eur.valor);
        }
    } catch (e) { console.error("Error cargando tasas automáticas."); }
    updateBCVUI();
    renderAll();
}

function updateBCVUI() {
    const rateDisplay = document.getElementById('bcv-rate-display');
    if (rateDisplay) {
        rateDisplay.style.cursor = "pointer";
        rateDisplay.innerHTML = `<span>💵 $ <b>${fmt(rates.USD)}</b></span> <span>| 💶 € <b>${fmt(rates.EUR)}</b></span>`;
        
        rateDisplay.onclick = async () => {
            const opcion = prompt("¿Qué tasa deseas editar?\n1: Dólar ($)\n2: Euro (€)");
            if(opcion === "1") {
                const nuevoVal = prompt("Nuevo precio del Dólar:", rates.USD);
                if(nuevoVal && !isNaN(nuevoVal)) rates.USD = parseFloat(nuevoVal);
            } else if(opcion === "2") {
                const nuevoVal = prompt("Nuevo precio del Euro:", rates.EUR);
                if(nuevoVal && !isNaN(nuevoVal)) rates.EUR = parseFloat(nuevoVal);
            }
            updateBCVUI(); 
            renderAll(); 
        };
    }
}

// --- 2. AUTENTICACIÓN Y NAVEGACIÓN ---
window.toggleAuth = (reg) => {
    document.getElementById('login-form-container').style.display = reg ? 'none' : 'flex';
    document.getElementById('register-form-container').style.display = reg ? 'flex' : 'none';
    document.getElementById('auth-title').innerText = reg ? "Crear Cuenta" : "Iniciar Sesión";
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
    } catch (e) { showModal("Error", "Error de conexión", "❌"); }
}

async function register() {
    const username = document.getElementById('reg-username').value;
    const name = document.getElementById('reg-name').value;
    const lastname = document.getElementById('reg-lastname').value;
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;
    if (!username || !password || !email) return showModal("Error", "Faltan campos obligatorios", "❌");
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
            showModal("Error", data.error, "❌");
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

function toggleMenu() {
    document.getElementById('sidebar').classList.toggle('active');
    document.getElementById('sidebar-overlay').classList.toggle('active');
}

function showSection(sec) {
    document.getElementById('section-inicio').style.display = sec === 'inicio' ? 'block' : 'none';
    document.getElementById('section-stats').style.display = sec === 'stats' ? 'block' : 'none';
    document.getElementById('section-registros').style.display = sec === 'registros' ? 'block' : 'none';
    if(sec === 'registros') renderFullHistory();
    if(document.getElementById('sidebar').classList.contains('active')) toggleMenu();
}

// --- 3. LÓGICA DE TRANSACCIONES Y CONVERSIÓN ---
async function addTransaction() {
    const desc = document.getElementById('desc').value;
    const amount = parseFloat(document.getElementById('amount').value);
    const currency = document.getElementById('currency').value;

    if (!desc || isNaN(amount)) return showModal("Error", "Ingresa descripción y monto", "🛒");

    // CONVERSIÓN REAL: Se multiplica el monto por la tasa si no es BS
    let amountInVES = amount;
    if (currency === "USD") amountInVES = amount * rates.USD;
    else if (currency === "EUR") amountInVES = amount * rates.EUR;
    
    const totalSpentSoFar = transactions.reduce((sum, t) => sum + t.valueVES, 0);
    const balanceAtMoment = budgetVES - totalSpentSoFar;

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

function renderAll() {
    const list = document.getElementById('transaction-list');
    const display = document.getElementById('remaining-display');
    const card = document.getElementById('balance-card');
    
    let totalSpentVES = 0, totalHoy = 0, totalMes = 0;
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
    
    // --- CONVERSIÓN DE VISTA PRINCIPAL ---
    let convertedValue = remainingVES;
    if (currentView === "USD") convertedValue = remainingVES / rates.USD;
    else if (currentView === "EUR") convertedValue = remainingVES / rates.EUR;

    display.innerText = `${fmt(convertedValue)} ${currentView}`;

    // Alertas de color
    if (spendingLimitVES > 0 && remainingVES <= spendingLimitVES) card.style.background = "linear-gradient(135deg, #f59e0b, #d97706)";
    else card.style.background = "linear-gradient(135deg, #4f46e5, #7c3aed)";
    if (remainingVES <= 0) card.style.background = "linear-gradient(135deg, #dc2626, #991b1b)";

    updateStatsUI(totalHoy, totalMes);
}

// --- 4. REPORTES Y MODALES ---
function renderFullHistory() {
    const tableBody = document.getElementById('full-history-body');
    if(!tableBody) return;
    tableBody.innerHTML = '';
    [...transactions].reverse().forEach(t => {
        const d = new Date(t.date);
        const fecha = `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()}`;
        const hora = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
        const tr = document.createElement('tr');
        tr.style.borderBottom = "1px solid #334155";
        tr.innerHTML = `
            <td style="padding:10px;">${fecha}<br><small style="color:#94a3b8">${hora}</small></td>
            <td style="padding:10px;">${t.desc}</td>
            <td style="padding:10px; color:#f87171;">-${fmt(t.valueVES)} BS</td>
            <td style="padding:10px; color:#4ade80;">${fmt(t.balanceAtMoment || 0)} BS</td>
        `;
        tableBody.appendChild(tr);
    });
}

function updateStatsUI(hoy, mes) {
    const p = document.getElementById('stats-panel');
    if(p) {
        p.innerHTML = `
            <div style="padding:15px; background:#1e293b; border-radius:12px; margin-bottom:15px; border-left: 4px solid #4f46e5;">
                <p style="color:#94a3b8; font-size:0.8rem;">GASTOS HOY (BS)</p>
                <h2 style="margin:5px 0;">${fmt(hoy)}</h2>
            </div>
            <div style="padding:15px; background:#1e293b; border-radius:12px; border-left: 4px solid #10b981;">
                <p style="color:#94a3b8; font-size:0.8rem;">GASTOS MES (BS)</p>
                <h2 style="margin:5px 0;">${fmt(mes)}</h2>
            </div>`;
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

// --- 5. PERSISTENCIA Y CONFIGURACIÓN ---
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
    } catch (e) { console.error("Error de sincronización"); }
}

async function setBudget() {
    budgetVES = parseFloat(document.getElementById('total-budget').value) || 0;
    spendingLimitVES = parseFloat(document.getElementById('spending-limit').value) || 0;
    renderAll();
    await syncToCloud();
    showModal("Éxito", "Configuración guardada", "✅");
}

function changeView(iso) { currentView = iso; renderAll(); }
function logout() { localStorage.removeItem('milCuentas_session'); location.reload(); }

async function deleteTransaction(id) {
    if(await showModal("Eliminar", "¿Borrar este registro?", "🗑️", true)) {
        transactions = transactions.filter(t => t.id !== id);
        renderAll(); await syncToCloud();
    }
}

async function resetApp() {
    if(await showModal("Reiniciar", "¿Borrar TODO el historial?", "⚠️", true)) {
        transactions = []; budgetVES = 0; spendingLimitVES = 0;
        document.getElementById('total-budget').value = "";
        document.getElementById('spending-limit').value = "";
        renderAll(); await syncToCloud();
    }
}

window.onload = () => { if (currentUser) entrarALaApp(); else window.toggleAuth(false); };


