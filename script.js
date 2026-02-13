var API_URL = "https://milos-cuentas.onrender.com"; 

let transactions = [];
let budgetVES = 0;
let spendingLimitVES = 0;
let currentView = 'VES'; 
let rates = { "USD": 1, "EUR": 1, "VES": 1 };
let myChart = null; // Para controlar el gráfico lineal

let currentUser = JSON.parse(localStorage.getItem('milCuentas_session')) || null;
let userName = "Usuario";
let userLastName = "Invitado";

const fmt = (num) => new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);

// --- 1. ACTUALIZACIÓN DIARIA BCV ---
async function fetchBCVRate() {
    try {
        const response = await fetch('https://ve.dolarapi.com/v1/dolares/oficial');
        const data = await response.json();
        if(data && data.promedio) {
            rates.USD = parseFloat(data.promedio);
            rates.EUR = rates.USD * 1.08; 
        }
    } catch (e) { 
        console.error("Error BCV");
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

// --- 2. LÓGICA DE CONVERSIÓN (DIVISIÓN) ---
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
    list.innerHTML = '';
    
    [...transactions].reverse().forEach(t => {
        totalSpentVES += t.valueVES;
        const li = document.createElement('li');
        li.innerHTML = `<div><b>${t.desc}</b><br><small>${fmt(t.originalAmount)} ${t.originalCurrency}</small></div>
            <div style="text-align: right;"><strong>-${fmt(t.valueVES)} BS</strong><br>
            <span onclick="deleteTransaction(${t.id})" style="color:red; cursor:pointer; font-size:10px;">Eliminar</span></div>`;
        list.appendChild(li);
    });

    const remainingVES = budgetVES - totalSpentVES;
    let finalValue = remainingVES;
    if (currentView === "USD") finalValue = remainingVES / rates.USD;
    else if (currentView === "EUR") finalValue = remainingVES / rates.EUR;

    display.innerText = `${fmt(finalValue)} ${currentView === 'VES' ? 'BS' : currentView}`;

    if (spendingLimitVES > 0 && remainingVES <= spendingLimitVES) {
        card.style.background = "linear-gradient(135deg, #f59e0b, #d97706)";
    } else {
        card.style.background = "linear-gradient(135deg, #4f46e5, #7c3aed)";
    }
}

// --- 3. GRÁFICOS Y ESTADÍSTICAS ---
function renderChart() {
    const ctx = document.getElementById('spendingChart').getContext('2d');
    const last7Days = {};
    const hoy = new Date();
    
    // Generar labels de los últimos 7 días
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(hoy.getDate() - i);
        last7Days[d.toLocaleDateString()] = 0;
    }

    transactions.forEach(t => {
        const dateStr = new Date(t.date).toLocaleDateString();
        if (last7Days.hasOwnProperty(dateStr)) last7Days[dateStr] += t.valueVES;
    });

    if (myChart) myChart.destroy();

    myChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: Object.keys(last7Days),
            datasets: [{
                data: Object.values(last7Days),
                borderColor: '#4f46e5',
                backgroundColor: 'rgba(79, 70, 229, 0.1)',
                borderWidth: 3,
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
                y: { grid: { color: '#334155' }, ticks: { color: '#94a3b8' } },
                x: { ticks: { color: '#94a3b8' } }
            }
        }
    });
}

function updateStatsUI() {
    const p = document.getElementById('stats-panel');
    const hoy = new Date();
    let tHoy = 0, tMes = 0, tAno = 0;

    transactions.forEach(t => {
        const d = new Date(t.date);
        if(d.toDateString() === hoy.toDateString()) tHoy += t.valueVES;
        if(d.getMonth() === hoy.getMonth() && d.getFullYear() === hoy.getFullYear()) tMes += t.valueVES;
        if(d.getFullYear() === hoy.getFullYear()) tAno += t.valueVES;
    });

    if(p) {
        p.innerHTML = `
            <div style="padding:15px; background:#1e293b; border-radius:12px; margin-bottom:10px; border-left: 4px solid #4f46e5;">
                <small style="color:#94a3b8">GASTOS HOY</small><br><b>${fmt(tHoy)} BS</b>
            </div>
            <div style="padding:15px; background:#1e293b; border-radius:12px; margin-bottom:10px; border-left: 4px solid #7c3aed;">
                <small style="color:#94a3b8">GASTOS MES</small><br><b>${fmt(tMes)} BS</b>
            </div>
            <div style="padding:15px; background:#1e293b; border-radius:12px; border-left: 4px solid #10b981;">
                <small style="color:#94a3b8">GASTOS AÑO</small><br><b>${fmt(tAno)} BS</b>
            </div>`;
    }
}

// --- 4. NAVEGACIÓN Y SECCIONES ---
function showSection(sec) {
    document.getElementById('section-inicio').style.display = sec === 'inicio' ? 'block' : 'none';
    document.getElementById('section-stats').style.display = sec === 'stats' ? 'block' : 'none';
    document.getElementById('section-registros').style.display = sec === 'registros' ? 'block' : 'none';
    
    if(sec === 'registros') renderFullHistory();
    if(sec === 'stats') { renderChart(); updateStatsUI(); }
    if(document.getElementById('sidebar').classList.contains('active')) toggleMenu();
}

// --- 5. AUTENTICACIÓN Y REGISTRO ---
window.toggleAuth = (reg) => {
    const loginCont = document.getElementById('login-form-container');
    const regCont = document.getElementById('register-form-container');
    loginCont.style.display = reg ? 'none' : 'flex';
    regCont.style.display = reg ? 'flex' : 'none';
    loginCont.style.flexDirection = 'column';
    regCont.style.flexDirection = 'column';
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
            localStorage.setItem('milCuentas_session', JSON.stringify(user));
            location.reload();
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

// --- 6. GASTOS Y SYNC ---
async function addTransaction() {
    const desc = document.getElementById('desc').value;
    const amount = parseFloat(document.getElementById('amount').value);
    const currency = document.getElementById('currency').value;
    if (!desc || isNaN(amount)) return;

    let valVES = amount;
    if (currency === "USD") valVES = amount * rates.USD;
    else if (currency === "EUR") valVES = amount * rates.EUR;
    
    const currentSpent = transactions.reduce((sum, t) => sum + t.valueVES, 0);
    transactions.push({ 
        id: Date.now(), date: new Date().toISOString(), 
        desc, originalAmount: amount, originalCurrency: currency, 
        valueVES: valVES, balanceAtMoment: budgetVES - currentSpent 
    });

    renderAll();
    await syncToCloud();
    document.getElementById('desc').value = '';
    document.getElementById('amount').value = '';
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
    } catch (e) { console.error("Error Sync"); }
}

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

// --- OTROS ---
function toggleMenu() {
    document.getElementById('sidebar').classList.toggle('active');
    document.getElementById('sidebar-overlay').classList.toggle('active');
}
function logout() { localStorage.removeItem('milCuentas_session'); location.reload(); }
async function setBudget() { 
    budgetVES = parseFloat(document.getElementById('total-budget').value) || 0; 
    spendingLimitVES = parseFloat(document.getElementById('spending-limit').value) || 0; 
    renderAll(); await syncToCloud(); 
}
function showModal(title, message, icon) {
    const modal = document.getElementById('custom-modal');
    document.getElementById('modal-title').innerText = title;
    document.getElementById('modal-text').innerText = message;
    document.getElementById('modal-icon').innerText = icon;
    modal.style.display = "flex";
    document.getElementById('modal-ok-btn').onclick = () => { modal.style.display = "none"; };
}
window.onload = () => { if (currentUser) entrarALaApp(); else window.toggleAuth(false); };
