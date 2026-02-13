
var API_URL = "https://milos-cuentas.onrender.com"; 

let transactions = [];
let budgetVES = 0;
let spendingLimitVES = 0;
let rates = { "USD": 1, "EUR": 1, "VES": 1 };
let currentView = 'VES';
let myChart = null;
let currentChartFilter = '7days';

// Persistencia de sesión
let currentUser = JSON.parse(localStorage.getItem('milCuentas_session')) || null;

const fmt = (num) => new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);

// --- 1. TASA BCV (DOLAR API) ---
async function fetchBCVRate() {
    try {
        const response = await fetch('https://ve.dolarapi.com/v1/dolares/oficial');
        const data = await response.json();
        if(data && data.promedio) {
            rates.USD = parseFloat(data.promedio);
            rates.EUR = rates.USD * 1.08; 
        }
    } catch (e) { 
        console.error("Error tasa BCV, usando default");
        rates.USD = 36.50; 
    }
    updateBCVUI();
    renderAll();
}

function updateBCVUI() {
    const rateDisplay = document.getElementById('bcv-rate-display');
    if (rateDisplay) {
        rateDisplay.innerHTML = `<span>💵 $ <b>${fmt(rates.USD)}</b></span>`;
    }
}

// --- 2. LÓGICA DE GASTOS ---
async function addTransaction() {
    const desc = document.getElementById('desc').value;
    const amount = parseFloat(document.getElementById('amount').value);
    const curr = document.getElementById('currency').value;

    if (!desc || isNaN(amount)) {
        return showModal("Error", "Por favor ingresa descripción y monto", "🛒");
    }

    let valVES = (curr === "USD") ? amount * rates.USD : (curr === "EUR") ? amount * rates.EUR : amount;
    const totalGastadoActual = transactions.reduce((s, x) => s + x.valueVES, 0);
    const saldoActual = budgetVES - totalGastadoActual;
    const nuevoSaldo = saldoActual - valVES;

    if (spendingLimitVES > 0 && nuevoSaldo <= spendingLimitVES) {
        const mensaje = nuevoSaldo < 0 
            ? `¡Cuidado! Este gasto te dejará en DEUDA (${fmt(nuevoSaldo)} BS). ¿Deseas continuar?`
            : `Estás por alcanzar tu límite. Tu saldo quedará en ${fmt(nuevoSaldo)} BS. ¿Deseas continuar?`;
        
        const confirmar = await showModal("Límite de Gasto", mensaje, "⚠️", true);
        if (!confirmar) return;
    }

    transactions.push({ 
        id: Date.now(), 
        date: new Date().toISOString(), 
        desc, 
        originalAmount: amount, 
        originalCurrency: curr, 
        valueVES: valVES, 
        balanceAtMoment: saldoActual 
    });

    renderAll(); 
    await syncToCloud();
    document.getElementById('desc').value = '';
    document.getElementById('amount').value = '';
}

// --- 3. RENDERIZADO ---
function changeView(iso) { currentView = iso; renderAll(); }

function renderAll() {
    const totalSpentVES = transactions.reduce((s, x) => s + x.valueVES, 0);
    const remainingVES = budgetVES - totalSpentVES;

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
    const card = document.getElementById('balance-card');
    if(display) {
        let finalValue = (currentView === "USD") ? remainingVES / rates.USD : (currentView === "EUR") ? remainingVES / rates.EUR : remainingVES;
        display.innerText = `${fmt(finalValue)} ${currentView}`;
    }

    if(card) {
        if (remainingVES <= 0) card.style.background = "linear-gradient(135deg, #ef4444, #991b1b)";
        else if (spendingLimitVES > 0 && remainingVES <= spendingLimitVES) card.style.background = "linear-gradient(135deg, #f59e0b, #d97706)";
        else card.style.background = "linear-gradient(135deg, var(--primary-dark), #7c3aed)";
    }
}

// --- 4. ESTADÍSTICAS ---
function renderChart() {
    const canvas = document.getElementById('spendingChart');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
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

function updateChartFilter(filter) {
    currentChartFilter = filter;
    document.querySelectorAll('.btn-filter').forEach(b => b.classList.remove('active'));
    document.getElementById('btn-' + filter).classList.add('active');
    renderChart();
}

// --- 5. NAVEGACIÓN Y MENÚ ---
function toggleMenu() {
    document.getElementById('sidebar').classList.toggle('active');
    document.getElementById('sidebar-overlay').classList.toggle('active');
}

function showSection(sec) {
    document.getElementById('section-inicio').style.display = sec === 'inicio' ? 'block' : 'none';
    document.getElementById('section-stats').style.display = sec === 'stats' ? 'block' : 'none';
    document.getElementById('section-registros').style.display = sec === 'registros' ? 'block' : 'none';
    if(sec === 'stats') renderChart();
    if(sec === 'registros') renderFullHistory();
    if(document.getElementById('sidebar').classList.contains('active')) toggleMenu();
}

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

// --- 6. FUNCIONES DE APOYO (MODAL, RESET, DELETE) ---
function showModal(title, message, icon, isConfirm = false) {
    return new Promise((resolve) => {
        const modal = document.getElementById('custom-modal');
        document.getElementById('modal-title').innerText = title;
        document.getElementById('modal-text').innerText = message;
        document.getElementById('modal-icon').innerText = icon;
        const cancelBtn = document.getElementById('modal-cancel-btn');
        cancelBtn.style.display = isConfirm ? "block" : "none";
        modal.style.display = "flex";
        document.getElementById('modal-ok-btn').onclick = () => { modal.style.display = "none"; resolve(true); };
        cancelBtn.onclick = () => { modal.style.display = "none"; resolve(false); };
    });
}

async function deleteTransaction(id) {
    const confirmar = await showModal("Eliminar", "¿Borrar este registro?", "🗑️", true);
    if (confirmar) {
        transactions = transactions.filter(t => t.id !== id);
        renderAll();
        await syncToCloud();
    }
}

async function resetApp() {
    const confirmar = await showModal("Resetear", "¿Borrar todos tus datos?", "🗑️", true);
    if (confirmar) {
        transactions = [];
        budgetVES = 0;
        spendingLimitVES = 0;
        document.getElementById('total-budget').value = '';
        document.getElementById('spending-limit').value = '';
        renderAll();
        await syncToCloud();
    }
}

// --- 7. AUTH Y SYNC ---
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
    } catch (e) { showModal("Error", "Error de conexión", "🌐"); }
}

async function register() {
    const username = document.getElementById('reg-username').value;
    const name = document.getElementById('reg-name').value;
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;
    try {
        const response = await fetch(`${API_URL}/api/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, name, email, password })
        });
        if (response.ok) { showModal("Éxito", "Cuenta creada", "🎉"); toggleAuth(false); }
        else showModal("Error", "El usuario ya existe", "🚫");
    } catch (e) { showModal("Error", "Error de servidor", "🌐"); }
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
                username: currentUser.username,
                budget: budgetVES,
                spendingLimit: spendingLimitVES,
                transactions: transactions
            })
        });
    } catch (e) { console.error("Error sincronizando"); }
}

async function setBudget() {
    budgetVES = parseFloat(document.getElementById('total-budget').value) || 0;
    spendingLimitVES = parseFloat(document.getElementById('spending-limit').value) || 0;
    renderAll();
    await syncToCloud();
    showModal("Éxito", "Presupuesto actualizado", "✅");
}

function logout() { localStorage.removeItem('milCuentas_session'); location.reload(); }

function toggleAuth(isReg) {
    document.getElementById('login-form-container').style.display = isReg ? 'none' : 'block';
    document.getElementById('register-form-container').style.display = isReg ? 'block' : 'none';
    document.getElementById('auth-title').innerText = isReg ? 'Crear Cuenta' : 'Iniciar Sesión';
}

window.onload = () => { if (currentUser) entrarALaApp(); };


