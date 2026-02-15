
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
    const desc = document.getElementById('desc').value;
    const amount = parseFloat(document.getElementById('amount').value);
    const curr = document.getElementById('currency').value;
    const category = document.getElementById('category-select') ? document.getElementById('category-select').value : "Otros";

    if (!desc || isNaN(amount)) return showModal("Error", "Datos incompletos", "🛒");

    // Calcular valor en Bolívares
    let valVES = (curr === "USD") ? amount * rates.USD : (curr === "EUR") ? amount * rates.EUR : amount;
    
    // Cálculo de totales
    const totalGastadoAntes = transactions.reduce((s, x) => s + x.valueVES, 0);
    const saldoDisponibleReal = budgetVES - totalGastadoAntes;
    const totalDespuesDeEsteGasto = totalGastadoAntes + valVES;

    // --- REGLA 1: BLOQUEO TOTAL (Si no hay dinero suficiente) ---
    if (valVES > saldoDisponibleReal) {
        showModal("Gasto Rechazado", `No puedes gastar ${fmt(valVES)} BS porque solo te quedan ${fmt(saldoDisponibleReal)} BS en tu presupuesto total.`, "🚫");
        return; // Detiene la función por completo
    }

    // --- REGLA 2: ADVERTENCIA DE LÍMITE (Si superas el límite fijado pero tienes dinero) ---
    if (spendingLimitVES > 0 && totalDespuesDeEsteGasto > spendingLimitVES) {
        const exceso = totalDespuesDeEsteGasto - spendingLimitVES;
        const msg = `Atención: Este gasto hará que superes tu límite establecido por ${fmt(exceso)} BS. ¿Deseas registrarlo de todas formas?`;
        
        // Si el usuario presiona "Cancelar", se detiene
        if (!(await showModal("Límite Superado", msg, "⚠️", true))) return;
    }

    // Si pasó las reglas anteriores, se registra el gasto
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
    
    // Limpiar campos
    document.getElementById('desc').value = '';
    document.getElementById('amount').value = '';
}

    renderAll(); 
    await syncToCloud();
    document.getElementById('desc').value = '';
    document.getElementById('amount').value = '';
}

// --- 4. ESTADÍSTICAS E INTERACCIÓN ---
function toggleStatsOrder() {
    statsOrderAsc = !statsOrderAsc;
    renderIndividualStats();
}

function renderIndividualStats() {
    const container = document.getElementById('stats-individual-list');
    if (!container) return;
    container.innerHTML = '';
    
    let sorted = [...transactions];
    sorted.sort((a, b) => statsOrderAsc ? new Date(a.date) - new Date(b.date) : new Date(b.date) - new Date(a.date));

    sorted.forEach(t => {
        const card = document.createElement('div');
        card.className = 'expense-item-card';
        card.onclick = () => focusTransactionInChart(t.date);
        
        const catEmoji = t.category || "📦";

        card.innerHTML = `
            <div class="expense-card-top">
                <div style="display:flex; flex-direction:column">
                    <span style="font-size:0.7rem; color:var(--primary); font-weight:bold; text-transform:uppercase">${catEmoji}</span>
                    <span style="font-weight:700">${t.desc}</span>
                </div>
                <span style="color:var(--danger); font-weight:800">-${fmt(t.valueVES)} BS</span>
            </div>
            <div class="expense-card-bottom" style="display:flex; justify-content:space-between; font-size:10px; color:var(--text-muted); margin-top:10px; border-top:1px solid rgba(255,255,255,0.05); padding-top:8px;">
                <span>📅 ${new Date(t.date).toLocaleDateString()} 🕒 ${t.time || ''}</span>
                <span style="color:var(--primary)">Ver en gráfico ↑</span>
            </div>`;
        container.appendChild(card);
    });
}

function focusTransactionInChart(dateIso) {
    if (!myChart) return;
    const targetDate = new Date(dateIso).toLocaleDateString().split('/')[0];
    const index = myChart.data.labels.indexOf(targetDate);
    if (index !== -1) {
        myChart.setActiveElements([{ datasetIndex: 0, index: index }]);
        myChart.tooltip.setActiveElements([{ datasetIndex: 0, index: index }], { x: 0, y: 0 });
        myChart.update();
        document.getElementById('spendingChart').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

// --- 5. LÓGICA DE GRÁFICA ---
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

// --- 6. AUTENTICACIÓN Y NUBE ---
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
        } else showModal("Error", "Credenciales incorrectas", "🚫");
    } catch (e) { showModal("Error", "Error de conexión", "🌐"); }
}

async function register() {
    const username = document.getElementById('reg-username').value;
    const name = document.getElementById('reg-name').value;
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;
    try {
        const res = await fetch(`${API_URL}/api/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, name, email, password })
        });
        if (res.ok) { showModal("Éxito", "Cuenta creada", "🎉"); toggleAuth(false); }
        else showModal("Error", "El usuario ya existe", "🚫");
    } catch (e) { showModal("Error", "Error de conexión", "🌐"); }
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

// --- 7. UTILIDADES ---
function renderAll() {
    if(!currentUser) return;
    const total = transactions.reduce((s, x) => s + x.valueVES, 0);
    const rem = budgetVES - total;
    const list = document.getElementById('transaction-list');
    if(list) {
        list.innerHTML = '';
        [...transactions].reverse().slice(0, 8).forEach(t => {
            const li = document.createElement('li');
            li.innerHTML = `<div><b>${t.desc}</b></div><div style="text-align:right"><strong>-${fmt(t.valueVES)} BS</strong><br><span onclick="deleteTransaction(${t.id})" style="color:var(--danger); cursor:pointer; font-size:10px;">Eliminar</span></div>`;
            list.appendChild(li);
        });
    }
    const val = (currentView === "USD") ? rem / rates.USD : (currentView === "EUR") ? rem / rates.EUR : rem;
    document.getElementById('remaining-display').innerText = `${fmt(val)} ${currentView}`;
}

function renderFullHistory() {
    const body = document.getElementById('full-history-body');
    if(!body) return;
    body.innerHTML = '';
    [...transactions].reverse().forEach(t => {
        body.innerHTML += `<tr><td style="padding:12px">${new Date(t.date).toLocaleDateString()}</td><td>${t.desc}</td><td style="color:var(--danger)">-${fmt(t.valueVES)}</td><td style="color:var(--success)">${fmt(t.balanceAtMoment || 0)}</td></tr>`;
    });
}

async function setBudget() {
    budgetVES = parseFloat(document.getElementById('total-budget').value) || 0;
    spendingLimitVES = parseFloat(document.getElementById('spending-limit').value) || 0;
    renderAll(); await syncToCloud();
    showModal("Éxito", "Presupuesto guardado", "✅");
}

async function deleteTransaction(id) {
    if (await showModal("Borrar", "¿Eliminar este gasto?", "🗑️", true)) {
        transactions = transactions.filter(t => t.id !== id);
        renderAll(); await syncToCloud();
    }
}

function logout() { localStorage.removeItem('milCuentas_session'); location.reload(); }
function changeView(iso) { currentView = iso; renderAll(); }
function toggleAuth(isReg) {
    document.getElementById('login-form-container').style.display = isReg ? 'none' : 'block';
    document.getElementById('register-form-container').style.display = isReg ? 'block' : 'none';
}
function updateChartFilter(f) { currentChartFilter = f; renderChart(); }

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

async function resetApp() {
    if (await showModal("Resetear", "¿Estás seguro de borrar todo?", "🗑️", true)) {
        transactions = []; budgetVES = 0; spendingLimitVES = 0;
        document.getElementById('total-budget').value = '';
        document.getElementById('spending-limit').value = '';
        renderAll(); await syncToCloud();
    }
}

function renderCategoryAnalysis() {
    const analysisContainer = document.getElementById('stats-panel');
    if (!analysisContainer || transactions.length === 0) return;

    const totals = {};
    transactions.forEach(t => {
        const cat = t.category || "Otros";
        totals[cat] = (totals[cat] || 0) + t.valueVES;
    });

    let maxCat = "", maxMonto = 0;
    for (const [cat, monto] of Object.entries(totals)) {
        if (monto > maxMonto) { maxMonto = monto; maxCat = cat; }
    }

    const gastoTotal = transactions.reduce((s, t) => s + t.valueVES, 0);
    const porcentaje = ((maxMonto / gastoTotal) * 100).toFixed(1);

    analysisContainer.innerHTML = `
        <div class="analysis-card" style="background: linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(30, 41, 59, 1)); padding: 20px; border-radius: 20px; border: 1px solid var(--primary); margin-top: 15px;">
            <h3 style="color: white; font-size: 1rem; margin-bottom: 10px;">🧐 Análisis de Gastos</h3>
            <p style="font-size: 0.9rem; color: var(--text-muted);">Mayor gasto en: <b style="color:var(--primary)">${maxCat}</b> (${fmt(maxMonto)} BS)</p>
            <div style="background: rgba(255,255,255,0.05); height: 8px; border-radius: 10px; margin: 10px 0;">
                <div style="background: var(--primary); width: ${porcentaje}%; height: 100%; border-radius: 10px;"></div>
            </div>
        </div>
    `;
}

window.onload = () => {
    if (currentUser) {
        entrarALaApp();
    } else {
        document.getElementById('login-screen').style.display = 'flex';
        document.getElementById('app-container').style.display = 'none';
        document.getElementById('app-header-ui').style.display = 'none';
        fetchBCVRate();
    }
};










