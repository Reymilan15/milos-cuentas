
var API_URL = "https://milos-cuentas.onrender.com"; 

let transactions = [];
let budgetVES = 0;
let spendingLimitVES = 0;
let currentView = 'VES'; 
let rates = { "USD": 1, "EUR": 1, "VES": 1 };
let myChart = null;
let currentChartFilter = '7days';

let currentUser = JSON.parse(localStorage.getItem('milCuentas_session')) || null;
const fmt = (num) => new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);

// --- 1. BCV Y TASAS ---
async function fetchBCVRate() {
    try {
        const response = await fetch('https://ve.dolarapi.com/v1/dolares/oficial');
        const data = await response.json();
        if(data && data.promedio) {
            rates.USD = parseFloat(data.promedio);
            rates.EUR = rates.USD * 1.08; 
        }
    } catch (e) { rates.USD = 36.50; }
    updateBCVUI();
    renderAll();
}

function updateBCVUI() {
    const rateDisplay = document.getElementById('bcv-rate-display');
    if (rateDisplay) {
        rateDisplay.innerHTML = `<span>💵 $ <b>${fmt(rates.USD)}</b></span> <span>💶 € <b>${fmt(rates.EUR)}</b></span>`;
    }
}

// --- 2. CONVERSIÓN Y RENDER (RESPECTANDO DIVISIÓN) ---
function changeView(iso) { currentView = iso; renderAll(); }

function renderAll() {
    const list = document.getElementById('transaction-list');
    const display = document.getElementById('remaining-display');
    const card = document.getElementById('balance-card');
    if(!list || !display) return;

    let totalSpentVES = transactions.reduce((s, x) => s + x.valueVES, 0);
    list.innerHTML = '';
    
    [...transactions].reverse().slice(0, 10).forEach(t => {
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
    card.style.background = remainingVES <= spendingLimitVES ? "linear-gradient(135deg, #f59e0b, #d97706)" : "linear-gradient(135deg, #4f46e5, #7c3aed)";
    if (remainingVES <= 0) card.style.background = "linear-gradient(135deg, #dc2626, #991b1b)";
}

// --- 3. GRÁFICAS FILTRADAS ---
function updateChartFilter(filter) {
    currentChartFilter = filter;
    document.querySelectorAll('.btn-filter').forEach(b => b.classList.remove('active'));
    document.getElementById('btn-' + filter).classList.add('active');
    renderChart();
}

function renderChart() {
    const ctx = document.getElementById('spendingChart').getContext('2d');
    let labels = [], dataValues = [];
    const hoy = new Date();

    if (currentChartFilter === '7days') {
        for (let i = 6; i >= 0; i--) {
            const d = new Date(); d.setDate(hoy.getDate() - i);
            const dateStr = d.toLocaleDateString();
            labels.push(dateStr.split('/')[0]); 
            dataValues.push(transactions.filter(t => new Date(t.date).toLocaleDateString() === dateStr).reduce((s, x) => s + x.valueVES, 0));
        }
    } else if (currentChartFilter === 'month') {
        labels = ["Sem 1", "Sem 2", "Sem 3", "Sem 4"];
        dataValues = [0, 0, 0, 0];
        transactions.forEach(t => {
            const d = new Date(t.date);
            if (d.getMonth() === hoy.getMonth()) {
                const day = d.getDate();
                if (day <= 7) dataValues[0] += t.valueVES;
                else if (day <= 14) dataValues[1] += t.valueVES;
                else if (day <= 21) dataValues[2] += t.valueVES;
                else dataValues[3] += t.valueVES;
            }
        });
    } else if (currentChartFilter === 'year') {
        labels = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
        dataValues = new Array(12).fill(0);
        transactions.forEach(t => {
            const d = new Date(t.date);
            if (d.getFullYear() === hoy.getFullYear()) dataValues[d.getMonth()] += t.valueVES;
        });
    }

    if (myChart) myChart.destroy();
    myChart = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets: [{ data: dataValues, borderColor: '#4f46e5', backgroundColor: 'rgba(79, 70, 229, 0.1)', borderWidth: 3, tension: 0.4, fill: true }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
}

// --- 4. GESTIÓN DE GASTOS Y SYNC ---
async function addTransaction() {
    const desc = document.getElementById('desc').value;
    const amount = parseFloat(document.getElementById('amount').value);
    const curr = document.getElementById('currency').value;
    if (!desc || isNaN(amount)) return showModal("Error", "Faltan datos", "🛒");

    let valVES = (curr === "USD") ? amount * rates.USD : (curr === "EUR") ? amount * rates.EUR : amount;
    const balancePrevio = budgetVES - transactions.reduce((s, x) => s + x.valueVES, 0);

    transactions.push({ id: Date.now(), date: new Date().toISOString(), desc, originalAmount: amount, originalCurrency: curr, valueVES: valVES, balanceAtMoment: balancePrevio });
    
    renderAll(); await syncToCloud();
    document.getElementById('desc').value = ''; document.getElementById('amount').value = '';
}

async function syncToCloud() {
    if (!currentUser) return;
    try {
        await fetch(`${API_URL}/api/save`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: currentUser.username, budget: budgetVES, spendingLimit: spendingLimitVES, transactions: transactions }) });
    } catch (e) { console.error("Error Sync"); }
}

// --- 5. AUTENTICACIÓN COMPLETA (RECUPERADA) ---
function toggleAuth(reg) {
    const lCont = document.getElementById('login-form-container');
    const rCont = document.getElementById('register-form-container');
    lCont.style.display = reg ? 'none' : 'flex';
    rCont.style.display = reg ? 'flex' : 'none';
    lCont.style.flexDirection = 'column'; rCont.style.flexDirection = 'column';
    document.getElementById('auth-title').innerText = reg ? "Crear Cuenta" : "Iniciar Sesión";
}

async function login() {
    const identifier = document.getElementById('username').value;
    const password = document.getElementById('login-password').value;
    try {
        const response = await fetch(`${API_URL}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier, password }) });
        if (response.ok) { currentUser = await response.json(); localStorage.setItem('milCuentas_session', JSON.stringify(currentUser)); entrarALaApp(); }
        else { showModal("Error", "Datos incorrectos", "🚫"); }
    } catch (e) { showModal("Error", "Sin conexión", "📡"); }
}

async function register() {
    const username = document.getElementById('reg-username').value;
    const name = document.getElementById('reg-name').value;
    const lastname = document.getElementById('reg-lastname').value;
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;
    if (!username || !password) return showModal("Error", "Datos incompletos", "❌");
    try {
        const response = await fetch(`${API_URL}/api/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, name, lastname, email, password }) });
        if (response.ok) { showModal("Éxito", "Registrado", "🎉"); toggleAuth(false); }
    } catch (e) { showModal("Error", "Falla de red", "📡"); }
}

function entrarALaApp() {
    if(!currentUser) return;
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

// --- 6. INTERFAZ Y MODALES ---
function showSection(sec) {
    document.getElementById('section-inicio').style.display = sec === 'inicio' ? 'block' : 'none';
    document.getElementById('section-stats').style.display = sec === 'stats' ? 'block' : 'none';
    document.getElementById('section-registros').style.display = sec === 'registros' ? 'block' : 'none';
    if(sec === 'stats') { renderChart(); updateStatsUI(); }
    if(sec === 'registros') renderFullHistory();
    if(document.getElementById('sidebar').classList.contains('active')) toggleMenu();
}

function updateStatsUI() {
    const hoy = new Date();
    const tHoy = transactions.filter(t => new Date(t.date).toDateString() === hoy.toDateString()).reduce((s,x)=>s+x.valueVES,0);
    const tMes = transactions.filter(t => new Date(t.date).getMonth() === hoy.getMonth()).reduce((s,x)=>s+x.valueVES,0);
    const tAno = transactions.filter(t => new Date(t.date).getFullYear() === hoy.getFullYear()).reduce((s,x)=>s+x.valueVES,0);
    document.getElementById('stats-panel').innerHTML = `
        <div style="padding:12px; background:#1e293b; border-radius:10px; margin-bottom:8px; border-left:4px solid #4f46e5;"><small>HOY</small><br><b>${fmt(tHoy)} BS</b></div>
        <div style="padding:12px; background:#1e293b; border-radius:10px; margin-bottom:8px; border-left:4px solid #7c3aed;"><small>MES</small><br><b>${fmt(tMes)} BS</b></div>
        <div style="padding:12px; background:#1e293b; border-radius:10px; border-left:4px solid #10b981;"><small>AÑO</small><br><b>${fmt(tAno)} BS</b></div>`;
}

function renderFullHistory() {
    const body = document.getElementById('full-history-body'); body.innerHTML = '';
    [...transactions].reverse().forEach(t => {
        const d = new Date(t.date);
        body.innerHTML += `<tr style="border-bottom:1px solid #334155"><td style="padding:10px">${d.toLocaleDateString()}<br>${d.getHours()}:${d.getMinutes()}</td><td style="padding:10px">${t.desc}</td><td style="padding:10px; color:#f87171">-${fmt(t.valueVES)}</td><td style="padding:10px; color:#4ade80">${fmt(t.balanceAtMoment || 0)}</td></tr>`;
    });
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

async function deleteTransaction(id) {
    if(await showModal("Eliminar", "¿Borrar gasto?", "🗑️", true)) {
        transactions = transactions.filter(t => t.id !== id);
        renderAll(); await syncToCloud();
    }
}

async function setBudget() {
    budgetVES = parseFloat(document.getElementById('total-budget').value) || 0;
    spendingLimitVES = parseFloat(document.getElementById('spending-limit').value) || 0;
    renderAll(); await syncToCloud();
    showModal("Éxito", "Presupuesto fijado", "✅");
}

function resetApp() {
    showModal("Resetear", "¿Borrar TODO?", "⚠️", true).then(async (c) => {
        if(c) { transactions = []; budgetVES = 0; renderAll(); await syncToCloud(); }
    });
}

function toggleMenu() { document.getElementById('sidebar').classList.toggle('active'); document.getElementById('sidebar-overlay').classList.toggle('active'); }
function logout() { localStorage.removeItem('milCuentas_session'); location.reload(); }
window.onload = () => { if (currentUser) entrarALaApp(); else toggleAuth(false); };
