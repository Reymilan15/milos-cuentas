
// --- 1. CONFIGURACIÓN Y CONEXIÓN AL SERVIDOR ---
const API_URL = "https://milos-cuentas.onrender.com"; 

let transactions = [];
let budgetVES = 0;
let spendingLimitVES = 0;
let currentView = 'VES';
// Tasa de seguridad inicial (se actualizará con fetchBCVRate)
let rates = { "USD": 52.00, "EUR": 55.50, "VES": 1 };

let currentUser = JSON.parse(localStorage.getItem('milCuentas_session')) || null;
let userName = "Usuario";
let userLastName = "Invitado";

const fmt = (num) => new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);

// --- NUEVA FUNCIÓN: OBTENER TASA REAL BCV ---
async function fetchBCVRate() {
    try {
        const response = await fetch('https://ve.dolarapi.com/v1/dolares/oficial');
        const data = await response.json();
        
        if(data && data.promedio) {
            rates.USD = parseFloat(data.promedio);
            rates.EUR = rates.USD * 1.07; // El Euro suele ser ~7% más caro
            console.log("Tasa BCV Sincronizada:", rates.USD);
        }
    } catch (e) {
        console.error("Error conectando a la API de tasas, usando respaldo.");
    }
    updateBCVUI();
    renderAll(); // Forzamos el recálculo inmediato de los montos
}

function updateBCVUI() {
    const rateDisplay = document.getElementById('bcv-rate-display');
    if (rateDisplay) {
        rateDisplay.innerHTML = `💵 BCV: <b>${fmt(rates.USD)} BS</b>`;
        
        // Hacemos que la tasa sea editable manualmente al hacer clic
        rateDisplay.style.cursor = "pointer";
        rateDisplay.onclick = async () => {
            const manual = prompt("Editar tasa USD manualmente:", rates.USD);
            if(manual && !isNaN(manual)) {
                rates.USD = parseFloat(manual);
                updateBCVUI();
                renderAll();
                showModal("Tasa Actualizada", "Has ajustado la tasa manualmente.", "✅");
            }
        };
    }
}

// --- AUTENTICACIÓN ---
window.toggleAuth = function(showRegister) {
    const loginForm = document.getElementById('login-buttons');
    const registerForm = document.getElementById('register-buttons');
    const authTitle = document.getElementById('auth-title');

    if (showRegister) {
        loginForm.style.display = 'none';
        registerForm.style.display = 'flex';
        registerForm.style.flexDirection = 'column';
        if (authTitle) authTitle.innerText = "Crear Cuenta Nueva";
    } else {
        loginForm.style.display = 'flex';
        registerForm.style.display = 'none';
        if (authTitle) authTitle.innerText = "Iniciar Sesión";
    }
};

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
    } catch (error) { console.error("Error sincronizando:", error); }
}

async function register() {
    const username = document.getElementById('reg-username').value;
    const name = document.getElementById('reg-name').value;
    const lastname = document.getElementById('reg-lastname').value;
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;

    if (!username || !password || !email) return showModal("Error", "Campos obligatorios incompletos", "❌");

    try {
        const response = await fetch(`${API_URL}/api/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, name, lastname, email })
        });
        if (response.ok) {
            await showModal("Éxito", "Cuenta creada correctamente.", "🎉");
            window.toggleAuth(false);
        } else {
            const data = await response.json();
            showModal("Error", data.error, "❌");
        }
    } catch (e) { showModal("Servidor Offline", "Reintenta en segundos.", "📡"); }
}

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
        } else {
            showModal("Acceso Denegado", "Credenciales incorrectas.", "🚫");
        }
    } catch (e) { showModal("Error", "Problema al conectar con el servidor.", "❌"); }
}

// --- NAVEGACIÓN ---
function entrarALaApp() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app-container').style.display = 'block';
    document.getElementById('menu-btn').style.display = 'flex';
    
    document.getElementById('total-budget').value = budgetVES || "";
    document.getElementById('spending-limit').value = spendingLimitVES || "";
    
    updateUserUI();
    fetchBCVRate(); 
    showSection('inicio');
}

async function showSection(section) {
    document.getElementById('sidebar').classList.remove('active');
    document.getElementById('sidebar-overlay').classList.remove('active');

    const secInicio = document.getElementById('section-inicio');
    const secStats = document.getElementById('section-stats');

    if (section === 'inicio') {
        secInicio.style.display = 'block';
        secStats.style.display = 'none';
        renderAll(); 
    } else if (section === 'stats') {
        secInicio.style.display = 'none';
        secStats.style.display = 'block';
        renderAll();
    } else if (section === 'edit') {
        const newName = prompt("Nuevo Nombre:", userName);
        if (newName) {
            userName = newName;
            userLastName = prompt("Nuevo Apellido:", userLastName) || userLastName;
            updateUserUI();
            syncToCloud(); 
        }
    }
}

function logout() {
    localStorage.removeItem('milCuentas_session');
    location.reload();
}

// --- GESTIÓN DE DATOS ---
async function setBudget() {
    budgetVES = parseFloat(document.getElementById('total-budget').value) || 0;
    spendingLimitVES = parseFloat(document.getElementById('spending-limit').value) || 0;
    renderAll();
    await syncToCloud(); 
    showModal("Éxito", "Presupuesto actualizado.", "⚙️");
}

async function addTransaction() {
    const desc = document.getElementById('desc').value;
    const amount = parseFloat(document.getElementById('amount').value);
    const currency = document.getElementById('currency').value;

    if (!desc || isNaN(amount)) return showModal("Incompleto", "Ingresa descripción y monto.", "🛒");

    const amountInVES = (currency === "VES") ? amount : amount * rates[currency];
    const totalSpentSoFar = transactions.reduce((sum, t) => sum + t.valueVES, 0);

    if (budgetVES > 0 && amountInVES > (budgetVES - totalSpentSoFar)) return showModal("Sin Fondos", `No tienes saldo suficiente.`, "🚫");

    if (spendingLimitVES > 0 && (totalSpentSoFar + amountInVES) > spendingLimitVES) {
        if (!(await showModal("¡Límite!", `Superarás tu alerta de gasto. ¿Continuar?`, "⚠️", true))) return;
    }

    transactions.push({ id: Date.now(), date: new Date().toISOString(), desc, originalAmount: amount, originalCurrency: currency, valueVES: amountInVES });
    document.getElementById('desc').value = '';
    document.getElementById('amount').value = '';
    
    renderAll();
    await syncToCloud(); 
}

function renderAll() {
    const list = document.getElementById('transaction-list');
    const display = document.getElementById('remaining-display');
    const card = document.getElementById('balance-card');

    let totalSpentVES = 0, totalHoy = 0, totalSemana = 0, totalMes = 0;
    list.innerHTML = '';

    const isToday = (d) => new Date(d).toDateString() === new Date().toDateString();
    const isThisMonth = (d) => new Date(d).getMonth() === new Date().getMonth();

    [...transactions].reverse().forEach(t => {
        totalSpentVES += t.valueVES;
        if (isToday(t.date)) totalHoy += t.valueVES;
        if (isThisMonth(t.date)) totalMes += t.valueVES;

        const li = document.createElement('li');
        li.innerHTML = `<div><b>${t.desc}</b><br><span>${fmt(t.originalAmount)} ${t.originalCurrency}</span></div>
            <div style="text-align: right;"><strong>-${fmt(t.valueVES)} BS</strong><br>
            <small onclick="deleteTransaction(${t.id})" style="color: #ef4444; cursor: pointer;">Eliminar</small></div>`;
        list.appendChild(li);
    });

    const remainingVES = budgetVES - totalSpentVES;
    
    // CÁLCULO PRECISO: División del remanente entre la tasa
    const converted = (currentView === "VES") ? remainingVES : remainingVES / rates[currentView];
    display.innerText = `${fmt(converted)} ${currentView}`;
    
    if (budgetVES > 0) {
        if (remainingVES <= 0) card.style.background = "linear-gradient(135deg, #dc2626, #991b1b)";
        else if (spendingLimitVES > 0 && totalSpentVES > spendingLimitVES) card.style.background = "linear-gradient(135deg, #f59e0b, #d97706)";
        else card.style.background = "linear-gradient(135deg, #4f46e5, #7c3aed)";
    }

    updateStatsUI(totalHoy, totalSemana, totalMes);
}

function updateStatsUI(hoy, semana, mes) {
    const statsDiv = document.getElementById('stats-panel');
    if (!statsDiv) return;
    statsDiv.innerHTML = `
        <div class="stats-container" style="display: grid; gap: 15px; margin-top: 20px;">
            <div class="stat-item" style="background: var(--card-bg); padding: 20px; border-radius: 15px; border-left: 5px solid var(--primary);">
                <small style="color: var(--text-muted); text-transform: uppercase;">Hoy</small>
                <h2 style="margin: 5px 0;">${fmt(hoy)} BS</h2>
            </div>
            <div class="stat-item" style="background: var(--card-bg); padding: 20px; border-radius: 15px; border-left: 5px solid var(--success);">
                <small style="color: var(--text-muted); text-transform: uppercase;">Este Mes</small>
                <h2 style="margin: 5px 0;">${fmt(mes)} BS</h2>
            </div>
        </div>`;
}

// --- UTILIDADES ---
function toggleMenu() {
    document.getElementById('sidebar').classList.toggle('active');
    document.getElementById('sidebar-overlay').classList.toggle('active');
}

function updateUserUI() {
    document.getElementById('side-username').innerText = userName;
    document.getElementById('side-fullname').innerText = `${userName} ${userLastName}`;
    const display = document.getElementById('display-user');
    if (display) display.innerText = `Hola, ${userName} 👋`;
}

async function deleteTransaction(id) {
    if (await showModal("Eliminar", "¿Borrar este registro?", "🗑️", true)) {
        transactions = transactions.filter(t => t.id !== id);
        renderAll();
        await syncToCloud();
    }
}

async function resetApp() {
    if (await showModal("Resetear", "¿Borrar todos los datos?", "💣", true)) {
        transactions = []; budgetVES = 0; spendingLimitVES = 0;
        renderAll();
        await syncToCloud();
    }
}

function changeView(iso) { currentView = iso; renderAll(); }

function showModal(title, message, icon = "⚠️", isConfirm = false) {
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

window.onload = () => {
    if (currentUser) entrarALaApp();
    else document.getElementById('login-screen').style.display = 'flex';
};






