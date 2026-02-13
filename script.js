var API_URL = "https://milos-cuentas.onrender.com"; 

let transactions = [];
let budgetVES = 0;
let spendingLimitVES = 0;
let rates = { "USD": 1, "EUR": 1, "VES": 1 };
let currentView = 'VES';
let myChart = null;
let currentChartFilter = '7days';

// Recuperar sesión al cargar
let currentUser = JSON.parse(localStorage.getItem('milCuentas_session')) || null;

const fmt = (num) => new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);

// --- 1. TASA BCV ---
async function fetchBCVRate() {
    try {
        const response = await fetch('https://ve.dolarapi.com/v1/dolares/oficial');
        const data = await response.json();
        if(data && data.promedio) {
            rates.USD = parseFloat(data.promedio);
            rates.EUR = rates.USD * 1.08; 
        }
    } catch (e) { 
        rates.USD = 36.50; 
    }
    updateBCVUI();
    if(currentUser) renderAll();
}

function updateBCVUI() {
    const rateDisplay = document.getElementById('bcv-rate-display');
    if (rateDisplay) rateDisplay.innerHTML = `<span>💵 $ <b>${fmt(rates.USD)}</b></span>`;
}

// --- 2. NAVEGACIÓN Y MENÚ (ESTO ES LO QUE NO SALÍA) ---
function toggleMenu() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    sidebar.classList.toggle('active');
    overlay.classList.toggle('active');
}

function showSection(sec) {
    // Control de visibilidad de capas
    document.getElementById('section-inicio').style.display = sec === 'inicio' ? 'block' : 'none';
    document.getElementById('section-stats').style.display = sec === 'stats' ? 'block' : 'none';
    document.getElementById('section-registros').style.display = sec === 'registros' ? 'block' : 'none';
    
    // Carga de datos según sección
    if(sec === 'stats') renderChart();
    if(sec === 'registros') renderFullHistory();
    
    // Cerrar menú lateral al navegar
    const sidebar = document.getElementById('sidebar');
    if(sidebar.classList.contains('active')) toggleMenu();
}

// --- 3. GESTIÓN DE GASTOS ---
async function addTransaction() {
    const desc = document.getElementById('desc').value;
    const amount = parseFloat(document.getElementById('amount').value);
    const curr = document.getElementById('currency').value;

    if (!desc || isNaN(amount)) return showModal("Error", "Datos incompletos", "🛒");

    let valVES = (curr === "USD") ? amount * rates.USD : (curr === "EUR") ? amount * rates.EUR : amount;
    const totalSpent = transactions.reduce((s, x) => s + x.valueVES, 0);
    const saldoActual = budgetVES - totalSpent;
    const nuevoSaldo = saldoActual - valVES;

    if (spendingLimitVES > 0 && nuevoSaldo <= spendingLimitVES) {
        const msg = nuevoSaldo < 0 ? `Quedarás en deuda (${fmt(nuevoSaldo)} BS)` : `Límite cerca (${fmt(nuevoSaldo)} BS)`;
        const confirmar = await showModal("Atención", msg, "⚠️", true);
        if (!confirmar) return;
    }

    transactions.push({ 
        id: Date.now(), date: new Date().toISOString(), desc, 
        originalAmount: amount, originalCurrency: curr, valueVES: valVES, 
        balanceAtMoment: saldoActual 
    });

    renderAll(); 
    await syncToCloud();
    document.getElementById('desc').value = '';
    document.getElementById('amount').value = '';
}

function renderAll() {
    if(!currentUser) return;
    const totalSpent = transactions.reduce((s, x) => s + x.valueVES, 0);
    const remaining = budgetVES - totalSpent;

    const list = document.getElementById('transaction-list');
    if(list) {
        list.innerHTML = '';
        [...transactions].reverse().slice(0, 8).forEach(t => {
            const li = document.createElement('li');
            li.innerHTML = `
                <div><b>${t.desc}</b><br><small>${t.originalAmount} ${t.originalCurrency}</small></div>
                <div style="text-align: right;">
                    <strong>-${fmt(t.valueVES)} BS</strong><br>
                    <span onclick="deleteTransaction(${t.id})" style="color:var(--danger); cursor:pointer; font-size:11px;">Eliminar</span>
                </div>`;
            list.appendChild(li);
        });
    }

    const display = document.getElementById('remaining-display');
    if(display) {
        let val = (currentView === "USD") ? remaining / rates.USD : (currentView === "EUR") ? remaining / rates.EUR : remaining;
        display.innerText = `${fmt(val)} ${currentView}`;
    }
}

// --- 4. HISTORIAL Y ESTADÍSTICAS ---
function renderFullHistory() {
    const body = document.getElementById('full-history-body'); 
    if(!body) return;
    body.innerHTML = '';
    [...transactions].reverse().forEach(t => {
        body.innerHTML += `
            <tr style="border-bottom:1px solid var(--border)">
                <td style="padding:12px">${new Date(t.date).toLocaleDateString()}</td>
                <td style="padding:12px">${t.desc}</td>
                <td style="padding:12px; color:var(--danger)">-${fmt(t.valueVES)}</td>
                <td style="padding:12px; color:var(--success)">${fmt(t.balanceAtMoment || 0)}</td>
            </tr>`;
    });
}

function renderChart() {
    const canvas = document.getElementById('spendingChart');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    let labels = [], dataValues = [];
    const hoy = new Date();

    for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(hoy.getDate() - i);
        const dateStr = d.toLocaleDateString();
        labels.push(dateStr.split('/')[0]); 
        dataValues.push(transactions.filter(t => new Date(t.date).toLocaleDateString() === dateStr).reduce((s, x) => s + x.valueVES, 0));
    }

    if (myChart) myChart.destroy();
    myChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{ label: 'Gastos (BS)', data: dataValues, borderColor: '#6366f1', tension: 0.4, fill: true }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

// --- 5. SISTEMA DE SESIÓN ---
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
            currentUser = await response.json();
            localStorage.setItem('milCuentas_session', JSON.stringify(currentUser));
            entrarALaApp();
        } else showModal("Error", "Credenciales incorrectas", "🚫");
    } catch (e) { showModal("Error", "Sin conexión con el servidor", "🌐"); }
}

function entrarALaApp() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app-container').style.display = 'block';
    document.getElementById('app-header-ui').style.display = 'flex';
    
    transactions = currentUser.transactions || [];
    budgetVES = currentUser.budget || 0;
    spendingLimitVES = currentUser.spendingLimit || 0;
    
    document.getElementById('side-username').innerText = currentUser.name || "Usuario";
    document.getElementById('total-budget').value = budgetVES || "";
    document.getElementById('spending-limit').value = spendingLimitVES || "";
    
    fetchBCVRate();
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
    } catch (e) {}
}

// --- 6. ACCIONES DE USUARIO ---
async function resetApp() {
    const confirmar = await showModal("Resetear", "¿Borrar todos los datos?", "🗑️", true);
    if (confirmar) {
        transactions = []; budgetVES = 0; spendingLimitVES = 0;
        document.getElementById('total-budget').value = '';
        document.getElementById('spending-limit').value = '';
        renderAll(); await syncToCloud();
    }
}

async function deleteTransaction(id) {
    const confirmar = await showModal("Borrar", "¿Eliminar este gasto?", "🗑️", true);
    if (confirmar) {
        transactions = transactions.filter(t => t.id !== id);
        renderAll(); await syncToCloud();
    }
}

async function setBudget() {
    budgetVES = parseFloat(document.getElementById('total-budget').value) || 0;
    spendingLimitVES = parseFloat(document.getElementById('spending-limit').value) || 0;
    renderAll(); await syncToCloud();
    showModal("Éxito", "Presupuesto guardado", "✅");
}

function logout() { localStorage.removeItem('milCuentas_session'); location.reload(); }

function showModal(title, msg, icon, isConfirm = false) {
    return new Promise((res) => {
        const m = document.getElementById('custom-modal');
        document.getElementById('modal-title').innerText = title;
        document.getElementById('modal-text').innerText = msg;
        document.getElementById('modal-icon').innerText = icon;
        document.getElementById('modal-cancel-btn').style.display = isConfirm ? "block" : "none";
        m.style.display = "flex";
        document.getElementById('modal-ok-btn').onclick = () => { m.style.display = "none"; res(true); };
        document.getElementById('modal-cancel-btn').onclick = () => { m.style.display = "none"; res(false); };
    });
}

function changeView(iso) { currentView = iso; renderAll(); }

function toggleAuth(isReg) {
    document.getElementById('login-form-container').style.display = isReg ? 'none' : 'block';
    document.getElementById('register-form-container').style.display = isReg ? 'block' : 'none';
}

function updateChartFilter(f) { currentChartFilter = f; renderChart(); }

window.onload = () => { if (currentUser) entrarALaApp(); };
