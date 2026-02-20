
var API_URL = "https://milos-cuentas.onrender.com"; 

let transactions = [];
let budgetVES = 0;
let spendingLimitVES = 0;
let rates = { "USD": 1, "EUR": 1, "VES": 1 };
let currentView = 'VES';
let myChart = null;
let currentChartFilter = '7days';
let statsOrderAsc = false; 

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

// --- 2. NAVEGACIÓN ---
function toggleMenu() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    sidebar.classList.toggle('active');
    overlay.classList.toggle('active');
}

function showSection(sec) {
    document.getElementById('section-inicio').style.display = sec === 'inicio' ? 'block' : 'none';
    document.getElementById('section-stats').style.display = sec === 'stats' ? 'block' : 'none';
    document.getElementById('section-registros').style.display = sec === 'registros' ? 'block' : 'none';
    
    if(sec === 'stats') {
        renderChart();
        renderIndividualStats(); 
        renderCategoryAnalysis();
    }
    if(sec === 'registros') renderFullHistory();

    const sidebar = document.getElementById('sidebar');
    if(sidebar && sidebar.classList.contains('active')) toggleMenu();
}

// --- 3. GESTIÓN DE GASTOS ---
async function addTransaction() {
    const descInput = document.getElementById('desc');
    const amountInput = document.getElementById('amount');
    const currencyInput = document.getElementById('currency');
    const categoryInput = document.getElementById('category-select');

    const desc = descInput.value;
    const amount = parseFloat(amountInput.value);
    const curr = currencyInput.value;
    const category = categoryInput ? categoryInput.value : "Otros";

    if (!desc || isNaN(amount) || amount <= 0) {
        await showModal("Error", "Ingresa una descripción y un monto válido", "🛒");
        return;
    }

    if (budgetVES <= 0) {
        await showModal("Presupuesto Vacío", "Primero fija un presupuesto en la parte superior", "💰");
        return;
    }

    let valVES = (curr === "USD") ? amount * rates.USD : (curr === "EUR") ? amount * rates.EUR : amount;
    
    const totalGastadoAntes = transactions.reduce((s, x) => s + x.valueVES, 0);
    const saldoDisponibleReal = budgetVES - totalGastadoAntes;
    const totalDespuesDeEsteGasto = totalGastadoAntes + valVES;

    if (valVES > saldoDisponibleReal) {
        await showModal("Gasto Rechazado", `No tienes saldo suficiente. Solo te quedan ${fmt(saldoDisponibleReal)} BS.`, "🚫");
        return; 
    }

    if (spendingLimitVES > 0 && totalDespuesDeEsteGasto > spendingLimitVES) {
        const exceso = totalDespuesDeEsteGasto - spendingLimitVES;
        const msg = `Atención: Superas tu límite por ${fmt(exceso)} BS. ¿Registrar de todas formas?`;
        const confirma = await showModal("Límite Superado", msg, "⚠️", true);
        if (!confirma) return;
    }

    const ahora = new Date();
    const saldoRestanteFinal = budgetVES - totalDespuesDeEsteGasto;

    transactions.push({ 
        id: Date.now(), 
        date: ahora.toISOString(), 
        time: ahora.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        desc, 
        category,
        originalAmount: amount, 
        originalCurrency: curr, 
        valueVES: valVES, 
        balanceAtMoment: saldoRestanteFinal 
    });

    renderAll(); 
    await syncToCloud();
    
    descInput.value = '';
    amountInput.value = '';
}

// --- 4. GESTIÓN DE PRESUPUESTO (CORREGIDA) ---
async function setBudget() {
    const total = parseFloat(document.getElementById('total-budget').value) || 0;
    const limit = parseFloat(document.getElementById('spending-limit').value) || 0;

    if (total <= 0) {
        await showModal("Error", "Ingresa un presupuesto válido", "💰");
        return;
    }

    if (limit > total) {
        const msg = `Tu límite (${fmt(limit)} BS) es mayor a tu presupuesto. ¿Deseas fijarlo así?`;
        const confirma = await showModal("Límite Elevado", msg, "⚠️", true);
        if (!confirma) return;
    }
    
    confirmSetBudget(total, limit);
} 

async function confirmSetBudget(total, limit) {
    budgetVES = total;
    spendingLimitVES = limit;
    
    if(currentUser) {
        currentUser.budget = budgetVES;
        currentUser.spendingLimit = spendingLimitVES;
        localStorage.setItem('milCuentas_session', JSON.stringify(currentUser));
        await syncToCloud();
    }
    
    renderAll();
    showModal("¡Listo!", "Presupuesto actualizado", "✅");
}

// --- 5. MODAL Y UTILIDADES ---
function showModal(title, msg, icon, isConfirm = false) {
    return new Promise((res) => {
        const m = document.getElementById('custom-modal');
        const titleEl = document.getElementById('modal-title');
        const textEl = document.getElementById('modal-text');
        const iconEl = document.getElementById('modal-icon');
        const okBtn = document.getElementById('modal-ok-btn');
        const cancelBtn = document.getElementById('modal-cancel-btn');

        titleEl.innerText = title;
        textEl.innerText = msg;
        iconEl.innerText = icon;
        
        cancelBtn.style.display = isConfirm ? "block" : "none";
        okBtn.innerText = isConfirm ? "Confirmar" : "Aceptar";

        m.style.display = "flex"; 

        okBtn.onclick = () => { m.style.display = "none"; res(true); };
        cancelBtn.onclick = () => { m.style.display = "none"; res(false); };
    });
}

async function resetApp() {
    const confirma = await showModal("¿Restablecer todo?", "Se borrarán gastos y presupuesto. No se puede deshacer.", "⚠️", true);
    if (confirma) {
        transactions = [];
        budgetVES = 0;
        spendingLimitVES = 0;
        if (currentUser) {
            currentUser.transactions = [];
            currentUser.budget = 0;
            currentUser.spendingLimit = 0;
            localStorage.setItem('milCuentas_session', JSON.stringify(currentUser));
            await syncToCloud();
        }
        location.reload(); 
    }
}

// --- 6. AUTENTICACIÓN ---
async function login() {
    const identifier = document.getElementById('username').value;
    const password = document.getElementById('login-password').value;
    try {
        const res = await fetch(`${API_URL}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier, password })
        });
        if (res.ok) {
            currentUser = await res.json();
            localStorage.setItem('milCuentas_session', JSON.stringify(currentUser));
            entrarALaApp();
        } else await showModal("Error", "Credenciales incorrectas", "🚫");
    } catch (e) { await showModal("Error", "Error de conexión", "🌐"); }
}

async function register() {
    const username = document.getElementById('reg-username').value.trim();
    const name = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;

    if (!/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/.test(name)) return await showModal("Error", "El nombre solo letras", "👤");
    if (username.length < 4) return await showModal("Error", "Usuario muy corto", "🆔");
    if (!email.includes('@')) return await showModal("Error", "Correo inválido", "📧");
    if (password.length < 8) return await showModal("Seguridad", "Mínimo 8 caracteres", "🔒");

    try {
        const res = await fetch(`${API_URL}/api/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, name, email, password })
        });
        if (res.ok) { 
            await showModal("🎉 Éxito", "Cuenta creada", "✅"); 
            toggleAuth(false); 
        } else await showModal("Error", "Ya registrado", "🚫");
    } catch (e) { await showModal("Error", "Fallo de conexión", "🌐"); }
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
    renderAll();
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
    } catch (e) {}
}

// --- 7. RENDERING Y GRÁFICAS ---
function renderAll() {
    if(!currentUser) return;
    const total = transactions.reduce((s, x) => s + x.valueVES, 0);
    const rem = budgetVES - total;
    const list = document.getElementById('transaction-list');
    
    if(list) {
        list.innerHTML = '';
        [...transactions].reverse().slice(0, 8).forEach(t => {
            const li = document.createElement('li');
            li.className = "transaction-item-mini";
            li.innerHTML = `
                <div>
                    <b>${t.desc}</b><br>
                    <small style="color:var(--primary)">${t.category || 'Otros'}</small>
                </div>
                <div style="text-align:right">
                    <strong style="color:white">-${fmt(t.valueVES)} BS</strong><br>
                    <span onclick="deleteTransaction(${t.id})" style="color:var(--danger); cursor:pointer; font-size:10px;">Eliminar</span>
                </div>
            `;
            list.appendChild(li);
        });
    }

    const val = (currentView === "USD") ? rem / rates.USD : (currentView === "EUR") ? rem / rates.EUR : rem;
    const displayElement = document.getElementById('remaining-display');
    if (displayElement) displayElement.innerText = `${fmt(val)} ${currentView}`;
}

function renderFullHistory() {
    const body = document.getElementById('full-history-body');
    if(!body) return;
    body.innerHTML = '';
    [...transactions].reverse().forEach(t => {
        body.innerHTML += `<tr><td style="padding:12px">${new Date(t.date).toLocaleDateString()}</td><td>${t.desc}</td><td style="color:var(--danger)">-${fmt(t.valueVES)}</td><td style="color:var(--success)">${fmt(t.balanceAtMoment || 0)}</td></tr>`;
    });
}

function renderIndividualStats() {
    const container = document.getElementById('stats-individual-list');
    if (!container) return;
    container.innerHTML = '';
    let sorted = [...transactions].sort((a, b) => statsOrderAsc ? new Date(a.date) - new Date(b.date) : new Date(b.date) - new Date(a.date));

    sorted.forEach(t => {
        const card = document.createElement('div');
        card.className = 'expense-item-card';
        card.innerHTML = `
            <div style="display:flex; justify-content:space-between;">
                <div><small style="color:var(--primary)">${t.category || 'Otros'}</small><br><b>${t.desc}</b></div>
                <div style="color:var(--danger); font-weight:800;">-${fmt(t.valueVES)} BS</div>
            </div>
            <div style="font-size:0.7rem; margin-top:10px; color:gray">📅 ${new Date(t.date).toLocaleDateString()} | Saldo: ${fmt(t.balanceAtMoment || 0)} BS</div>
        `;
        container.appendChild(card);
    });
}

function renderChart() {
    const canvas = document.getElementById('spendingChart');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    let labels = [], dataValues = [];
    const hoy = new Date();

    if (currentChartFilter === '7days') {
        for (let i = 6; i >= 0; i--) {
            const d = new Date(); d.setDate(hoy.getDate() - i);
            const ds = d.toLocaleDateString();
            labels.push(ds.split('/')[0]);
            dataValues.push(transactions.filter(t => new Date(t.date).toLocaleDateString() === ds).reduce((s, x) => s + x.valueVES, 0));
        }
    } else if (currentChartFilter === 'month') {
        labels = ['Sem 1', 'Sem 2', 'Sem 3', 'Sem 4'];
        for (let i = 3; i >= 0; i--) {
            const inicio = new Date(); inicio.setDate(hoy.getDate() - ((i + 1) * 7));
            const fin = new Date(); fin.setDate(hoy.getDate() - (i * 7));
            dataValues.push(transactions.filter(t => { const f = new Date(t.date); return f > inicio && f <= fin; }).reduce((s, x) => s + x.valueVES, 0));
        }
    }

    if (myChart) myChart.destroy();
    myChart = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets: [{ label: 'Gastos (BS)', data: dataValues, borderColor: '#6366f1', tension: 0.4, fill: true, backgroundColor: 'rgba(99, 102, 241, 0.1)' }] },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

function renderCategoryAnalysis() {
    const analysisContainer = document.getElementById('stats-panel');
    if (!analysisContainer || transactions.length === 0) return;
    const totals = {};
    transactions.forEach(t => { const cat = t.category || "Otros"; totals[cat] = (totals[cat] || 0) + t.valueVES; });
    const maxCat = Object.entries(totals).reduce((a, b) => a[1] > b[1] ? a : b)[0];

    analysisContainer.innerHTML = `
        <div class="analysis-card" style="padding:15px; background:rgba(255,255,255,0.05); border-radius:15px; margin-bottom:15px;">
            <p>Mayor gasto en: <b style="color:var(--primary)">${maxCat}</b></p>
            <button onclick="toggleCategoryDetails()" id="btn-details" class="btn-primary" style="padding:5px 10px; font-size:0.8rem;">Ver detalles por categoría</button>
            <div id="category-details-list" style="display:none; margin-top:10px;"></div>
        </div>
    `;
    const detailsList = document.getElementById('category-details-list');
    Object.entries(totals).forEach(([cat, monto]) => {
        detailsList.innerHTML += `<div style="display:flex; justify-content:space-between; font-size:0.8rem; margin-bottom:5px;"><span>${cat}</span><b>${fmt(monto)} BS</b></div>`;
    });
}

// --- 8. FUNCIONES DE APOYO ---
async function deleteTransaction(id) {
    if (await showModal("Borrar", "¿Eliminar este gasto?", "🗑️", true)) {
        transactions = transactions.filter(t => t.id !== id);
        renderAll(); await syncToCloud();
    }
}

function toggleCategoryDetails() {
    const list = document.getElementById('category-details-list');
    list.style.display = list.style.display === 'none' ? 'block' : 'none';
}

function togglePasswordVisibility(inputId, iconId) {
    const passInput = document.getElementById(inputId);
    const iconSpan = document.getElementById(iconId);

    if (passInput.type === "password") {
        passInput.type = "text";
        iconSpan.innerText = "🔒"; 
    } else {
        passInput.type = "password";
        iconSpan.innerText = "👁️"; 
    }
}

function checkPassStrength() {
    const pass = document.getElementById('reg-password').value;
    const bar = document.getElementById('pass-strength-bar');
    const text = document.getElementById('pass-text');
    let s = pass.length >= 8 ? 1 : 0;
    if (/[0-9]/.test(pass)) s++;
    if (/[A-Z]/.test(pass)) s++;
    bar.style.width = (s * 33) + "%";
    bar.style.backgroundColor = s === 3 ? "green" : s === 2 ? "orange" : "red";
    text.innerText = s === 3 ? "Fuerte" : s === 2 ? "Media" : "Débil";
}

function logout() { localStorage.removeItem('milCuentas_session'); location.reload(); }
function changeView(iso) { currentView = iso; renderAll(); }
function toggleAuth(isReg) {
    document.getElementById('login-form-container').style.display = isReg ? 'none' : 'block';
    document.getElementById('register-form-container').style.display = isReg ? 'block' : 'none';
}
function updateChartFilter(f) { currentChartFilter = f; renderChart(); }
function toggleStatsOrder() { statsOrderAsc = !statsOrderAsc; renderIndividualStats(); }

window.onload = () => {
    fetchBCVRate();
    if (currentUser) entrarALaApp();
};











































