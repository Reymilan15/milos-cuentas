
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

// --- 3. GESTIÓN DE GASTOS (CORREGIDA Y RESTRICTIVA) ---
async function addTransaction() {
    const descInput = document.getElementById('desc');
    const amountInput = document.getElementById('amount');
    const currencyInput = document.getElementById('currency');
    const categoryInput = document.getElementById('category-select');

    const desc = descInput.value;
    const amount = parseFloat(amountInput.value);
    const curr = currencyInput.value;
    const category = categoryInput ? categoryInput.value : "Otros";

    if (!desc || isNaN(amount)) {
        await showModal("Error", "Datos incompletos", "🛒");
        return;
    }

    let valVES = (curr === "USD") ? amount * rates.USD : (curr === "EUR") ? amount * rates.EUR : amount;
    
    const totalGastadoAntes = transactions.reduce((s, x) => s + x.valueVES, 0);
    const saldoDisponibleReal = budgetVES - totalGastadoAntes;
    const totalDespuesDeEsteGasto = totalGastadoAntes + valVES;

    // --- REGLA 1: BLOQUEO TOTAL (Gasto > Saldo disponible) ---
    if (valVES > saldoDisponibleReal) {
        await showModal("Gasto Rechazado", `No tienes saldo suficiente. El gasto es de ${fmt(valVES)} BS y solo te quedan ${fmt(saldoDisponibleReal)} BS.`, "🚫");
        return; 
    }

    // --- REGLA 2: ADVERTENCIA DE LÍMITE ---
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
    // Ordenamos por fecha (más reciente primero por defecto)
    sorted.sort((a, b) => statsOrderAsc ? new Date(a.date) - new Date(b.date) : new Date(b.date) - new Date(a.date));

    sorted.forEach(t => {
        const card = document.createElement('div');
        // Aplicamos estilos directos para asegurar la separación visual
        card.className = 'expense-item-card';
        card.style.cssText = `
            background: rgba(255, 255, 255, 0.05);
            border-left: 4px solid var(--primary);
            margin-bottom: 15px;
            padding: 15px;
            border-radius: 12px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            display: flex;
            flex-direction: column;
            gap: 8px;
            transition: transform 0.2s;
        `;

        const catEmoji = t.category || "📦";

        card.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                <div style="display:flex; flex-direction:column">
                    <span style="font-size:0.75rem; color:var(--primary); font-weight:bold; text-transform:uppercase; letter-spacing:0.5px;">
                        ${catEmoji} ${t.category || 'Otros'}
                    </span>
                    <span style="font-weight:700; font-size:1.1rem; color: #fff; margin-top:2px;">${t.desc}</span>
                </div>
                <div style="text-align:right">
                    <span style="color:var(--danger); font-weight:800; font-size:1.1rem;">-${fmt(t.valueVES)} BS</span>
                </div>
            </div>
            
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px; padding-top:8px; border-top:1px solid rgba(255,255,255,0.1); font-size:0.8rem; color:var(--text-muted);">
                <span>📅 ${new Date(t.date).toLocaleDateString()} <span style="margin-left:8px;">🕒 ${t.time || ''}</span></span>
                <span style="color:var(--success); font-weight:600; background:rgba(34, 197, 94, 0.1); padding:2px 8px; border-radius:4px;">
                    Saldo: ${fmt(t.balanceAtMoment || 0)} BS
                </span>
            </div>
        `;
        
        // Efecto visual al hacer clic
        card.onclick = () => {
            focusTransactionInChart(t.date);
            card.style.transform = "scale(0.98)";
            setTimeout(() => card.style.transform = "scale(1)", 100);
        };
        
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
        // Mostramos los últimos 8 registros
        [...transactions].reverse().slice(0, 8).forEach(t => {
            const li = document.createElement('li');
            li.style.display = "flex";
            li.style.justifyContent = "space-between";
            li.style.alignItems = "center";
            li.style.padding = "10px 0";
            li.style.borderBottom = "1px solid rgba(255,255,255,0.05)";

            // El emoji de la categoría o uno por defecto
            const catEmoji = t.category || "📦";

            li.innerHTML = `
                <div style="display:flex; flex-direction:column; gap:2px;">
                    <b style="color: white; font-size: 0.95rem;">${t.desc}</b>
                    <span style="font-size: 0.7rem; color: var(--primary); font-weight: 700; text-transform: uppercase;">
                        ${catEmoji} ${t.category || 'Otros'}
                    </span>
                </div>
                <div style="text-align:right">
                    <strong style="color: white; display: block;">-${fmt(t.valueVES)} BS</strong>
                    <span onclick="deleteTransaction(${t.id})" style="color:var(--danger); cursor:pointer; font-size:10px; font-weight:bold;">Eliminar</span>
                </div>
            `;
            list.appendChild(li);
        });
    }

    // Actualización del saldo superior
    const val = (currentView === "USD") ? rem / rates.USD : (currentView === "EUR") ? rem / rates.EUR : rem;
    const displayElement = document.getElementById('remaining-display');
    if (displayElement) {
        displayElement.innerText = `${fmt(val)} ${currentView}`;
    }
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
    const modalConfirm = document.getElementById('confirm-modal');
    if (modalConfirm) {
        modalConfirm.style.display = 'flex';
    }
}

// Función para cerrar el modal de confirmación
function closeConfirmModal() {
    const modalConfirm = document.getElementById('confirm-modal');
    if (modalConfirm) {
        modalConfirm.style.display = 'none';
    }
}

// Asignamos las funciones a los botones del nuevo modal
document.addEventListener('DOMContentLoaded', () => {
    const btnConfirmReset = document.getElementById('modal-confirm-btn');
    const btnCancelReset = document.getElementById('modal-confirm-cancel-btn');

    if (btnConfirmReset) {
        btnConfirmReset.onclick = function() {
            // AQUÍ LA LÓGICA DE BORRADO REAL:
            transactions = [];
            budgetVES = 0;
            localStorage.removeItem('transactions');
            localStorage.removeItem('budgetVES');
            
            // Cerramos y recargamos para limpiar la pantalla
            closeConfirmModal();
            location.reload(); 
        };
    }

    if (btnCancelReset) {
        btnCancelReset.onclick = closeConfirmModal;
    }
});

function renderCategoryAnalysis() {
    const analysisContainer = document.getElementById('stats-panel');
    if (!analysisContainer || transactions.length === 0) return;

    // 1. Agrupar totales por categoría
    const totals = {};
    transactions.forEach(t => {
        const cat = t.category || "Otros";
        totals[cat] = (totals[cat] || 0) + t.valueVES;
    });

    const gastoTotal = transactions.reduce((s, t) => s + t.valueVES, 0);

    // 2. Encontrar la categoría principal para el resumen
    let maxCat = "", maxMonto = 0;
    for (const [cat, monto] of Object.entries(totals)) {
        if (monto > maxMonto) { maxMonto = monto; maxCat = cat; }
    }

    // 3. Renderizar el contenedor principal con el botón
    analysisContainer.innerHTML = `
        <div class="analysis-card" style="background: linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(30, 41, 59, 1)); padding: 20px; border-radius: 20px; border: 1px solid rgba(99, 102, 241, 0.3); margin-top: 15px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                <h3 style="color: white; font-size: 1.1rem; margin:0;">🧐 Análisis de Gastos</h3>
                <button onclick="toggleCategoryDetails()" id="btn-details" style="background:var(--primary); color:white; border:none; padding:6px 12px; border-radius:8px; font-size:0.8rem; cursor:pointer; font-weight:600;">
                    Ver Detalles
                </button>
            </div>
            
            <p style="font-size: 0.9rem; color: var(--text-muted); margin-bottom:5px;">Principal gasto: <b style="color:var(--primary)">${maxCat}</b></p>
            <div style="font-size: 1.2rem; font-weight: 800; color: white;">${fmt(maxMonto)} BS</div>
            
            <div id="category-details-list" style="display: none; margin-top: 20px; border-top: 1px solid rgba(255,255,255,0.1); pt: 15px; flex-direction: column; gap: 12px;">
                </div>
        </div>
    `;

    // 4. Generar las mini-tarjetas detalladas dentro del contenedor oculto
    const detailsList = document.getElementById('category-details-list');
    Object.entries(totals).sort((a,b) => b[1] - a[1]).forEach(([cat, monto]) => {
        const porcentaje = ((monto / gastoTotal) * 100).toFixed(1);
        const detailItem = document.createElement('div');
        detailItem.style.cssText = `
            background: rgba(255,255,255,0.03);
            padding: 12px;
            border-radius: 10px;
            border: 1px solid rgba(255,255,255,0.05);
        `;
        detailItem.innerHTML = `
            <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
                <span style="color:white; font-weight:600; font-size:0.9rem;">${cat}</span>
                <span style="color:var(--primary); font-weight:700; font-size:0.9rem;">${fmt(monto)} BS</span>
            </div>
            <div style="background: rgba(255,255,255,0.05); height: 6px; border-radius: 10px; overflow:hidden;">
                <div style="background: var(--primary); width: ${porcentaje}%; height: 100%; border-radius: 10px;"></div>
            </div>
            <div style="text-align:right; font-size:0.7rem; color:var(--text-muted); margin-top:4px;">${porcentaje}% del total</div>
        `;
        detailsList.appendChild(detailItem);
    });
}

// 5. Función para abrir/cerrar el detalle (Añádela al final de tu script.js)
function toggleCategoryDetails() {
    const list = document.getElementById('category-details-list');
    const btn = document.getElementById('btn-details');
    if (list.style.display === 'none') {
        list.style.display = 'flex';
        btn.innerText = 'Cerrar';
        btn.style.background = 'rgba(255,255,255,0.1)';
    } else {
        list.style.display = 'none';
        btn.innerText = 'Ver Detalles';
        btn.style.background = 'var(--primary)';
    }
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















