
// --- 1. CONFIGURACIÓN Y CONEXIÓN AL SERVIDOR ---
// He actualizado esta URL según el error de consola que me pasaste
const API_URL = "https://milos-cuentas.onrender.com"; 

let transactions = [];
let budgetVES = 0;
let spendingLimitVES = 0;
let currentView = 'VES';
let rates = { "USD": 36.30, "EUR": 39.50, "VES": 1 };

// Usuario actual en sesión
let currentUser = JSON.parse(localStorage.getItem('milCuentas_session')) || null;
let userName = "Usuario";
let userLastName = "Invitado";

const fmt = (num) => new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);

// --- FUNCIÓN GLOBAL PARA CAMBIAR ENTRE LOGIN Y REGISTRO ---
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

// Función para sincronizar datos con la nube (MongoDB)
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
    } catch (error) {
        console.error("Error sincronizando con la nube:", error);
    }
}

// --- 2. LÓGICA DE REGISTRO Y LOGIN ---

async function register() {
    const username = document.getElementById('reg-username').value;
    const name = document.getElementById('reg-name').value;
    const lastname = document.getElementById('reg-lastname').value;
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;

    if (!username || !password || !email) return showModal("Error", "Usuario, Correo y Contraseña son obligatorios", "❌");

    try {
        const response = await fetch(`${API_URL}/api/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, name, lastname, email })
        });

        if (response.ok) {
            await showModal("Éxito", "Cuenta creada. Ahora puedes iniciar sesión.", "🎉");
            window.toggleAuth(false);
        } else {
            const data = await response.json();
            showModal("Error", data.error || "Hubo un problema al registrar.", "❌");
        }
    } catch (e) {
        // Si sale este error, es porque el backend en Render todavía no ha despertado o no tiene CORS
        showModal("Servidor Offline", "El servidor está despertando. Intenta de nuevo en 30 segundos.", "📡");
    }
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
            if(user.rates) rates = user.rates;

            entrarALaApp();
        } else {
            showModal("Acceso Denegado", "Credenciales incorrectas.", "🚫");
        }
    } catch (e) {
        showModal("Error", "Problema al conectar con el servidor.", "❌");
    }
}

// --- 3. FUNCIONES DE INTERFAZ Y NAVEGACIÓN ---

function entrarALaApp() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app-container').style.display = 'block';
    document.getElementById('menu-btn').style.display = 'flex';
    
    document.getElementById('total-budget').value = budgetVES || "";
    document.getElementById('spending-limit').value = spendingLimitVES || "";
    
    updateUserUI();
    renderAll();
}

function logout() {
    localStorage.removeItem('milCuentas_session');
    location.reload();
}

const isToday = (dateStr) => new Date(dateStr).toDateString() === new Date().toDateString();

const isThisWeek = (dateStr) => {
    const now = new Date();
    const d = new Date(dateStr);
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
    startOfWeek.setHours(0,0,0,0);
    return d >= startOfWeek;
};

const isThisMonth = (dateStr) => {
    const d = new Date(dateStr);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
};

function toggleMenu() {
    document.getElementById('sidebar').classList.toggle('active');
    document.getElementById('sidebar-overlay').classList.toggle('active');
}

async function showSection(section) {
    toggleMenu();
    if (section === 'inicio') return;
    else if (section === 'stats') {
        const statsEl = document.getElementById('stats-panel');
        if(statsEl) statsEl.scrollIntoView({ behavior: 'smooth' });
    }
    else if (section === 'edit') {
        userName = prompt("Nombre:", userName) || userName;
        userLastName = prompt("Apellido:", userLastName) || userLastName;
        updateUserUI();
        syncToCloud(); 
    }
}

function updateUserUI() {
    document.getElementById('side-username').innerText = userName;
    document.getElementById('side-fullname').innerText = `${userName} ${userLastName}`;
    const display = document.getElementById('display-user');
    if (display) display.innerText = `${userName} ${userLastName}`;
}

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

// --- 4. GESTIÓN DE GASTOS ---

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

    if (!desc || isNaN(amount)) return showModal("Incompleto", "Datos inválidos.", "🛒");

    const amountInVES = (currency === "VES") ? amount : amount * rates[currency];
    const totalSpentSoFar = transactions.reduce((sum, t) => sum + t.valueVES, 0);

    if (amountInVES > (budgetVES - totalSpentSoFar)) return showModal("Fondos Insuficientes", `No tienes saldo suficiente.`, "🚫");

    if (spendingLimitVES > 0 && (totalSpentSoFar + amountInVES) > spendingLimitVES) {
        if (!(await showModal("¡Límite!", `Superarás tu alerta. ¿Continuar?`, "⚠️", true))) return;
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

    [...transactions].reverse().forEach(t => {
        totalSpentVES += t.valueVES;
        if (isToday(t.date)) totalHoy += t.valueVES;
        if (isThisWeek(t.date)) totalSemana += t.valueVES;
        if (isThisMonth(t.date)) totalMes += t.valueVES;

        const li = document.createElement('li');
        li.innerHTML = `<div><b>${t.desc}</b><br><span>${fmt(t.originalAmount)} ${t.originalCurrency}</span></div>
            <div style="text-align: right;"><strong>-${fmt(t.valueVES)} BS</strong><br>
            <small onclick="deleteTransaction(${t.id})" style="color: #ef4444; cursor: pointer;">Eliminar</small></div>`;
        list.appendChild(li);
    });

    const remainingVES = budgetVES - totalSpentVES;
    const converted = (currentView === "VES") ? remainingVES : remainingVES / rates[currentView];
    display.innerText = `${fmt(converted)} ${currentView}`;
    
    if (budgetVES > 0) {
        if (remainingVES <= 0) card.style.background = "linear-gradient(135deg, #dc2626, #991b1b)";
        else if (spendingLimitVES > 0 && totalSpentVES > spendingLimitVES) card.style.background = "linear-gradient(135deg, #f59e0b, #d97706)";
        else card.style.background = "linear-gradient(135deg, #4f46e5, #3730a3)";
    }
    updateStatsUI(totalHoy, totalSemana, totalMes);
}

function updateStatsUI(hoy, semana, mes) {
    let statsDiv = document.getElementById('stats-panel');
    if (!statsDiv) {
        statsDiv = document.createElement('div');
        statsDiv.id = 'stats-panel';
        statsDiv.style.cssText = "background: #1e293b; color: white; padding: 15px; border-radius: 15px; margin-top: 20px; text-align: center;";
        const balanceCard = document.querySelector('.balance-card');
        if(balanceCard) balanceCard.after(statsDiv);
    }
    statsDiv.innerHTML = `<h3 style="margin:0 0 10px 0; font-size: 12px; opacity: 0.7;">📊 RESUMEN (BS)</h3>
        <div style="display: flex; justify-content: space-around;">
            <div><small>Hoy</small><br><strong>${fmt(hoy)}</strong></div>
            <div><small>Semana</small><br><strong>${fmt(semana)}</strong></div>
            <div><small>Mes</small><br><strong>${fmt(mes)}</strong></div>
        </div>`;
}

async function deleteTransaction(id) {
    if (await showModal("Eliminar", "¿Borrar registro?", "🗑️", true)) {
        transactions = transactions.filter(t => t.id !== id);
        renderAll();
        await syncToCloud();
    }
}

async function resetApp() {
    if (await showModal("Resetear", "¿Borrar todo?", "💣", true)) {
        transactions = []; budgetVES = 0; spendingLimitVES = 0;
        renderAll();
        await syncToCloud();
    }
}

function changeView(iso) { currentView = iso; renderAll(); }

window.onload = () => {
    if (currentUser) entrarALaApp();
    else document.getElementById('login-screen').style.display = 'flex';
};




