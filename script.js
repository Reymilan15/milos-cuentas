// --- 1. CONFIGURACIÓN Y CONEXIÓN AL SERVIDOR ---
// REEMPLAZA ESTA URL con la que te asigne Render al desplegar tu backend
const API_URL = "https://tu-app-en-render.onrender.com"; 

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

// Función para sincronizar datos con la nube (Render)
async function syncToCloud() {
    if (!currentUser) return;
    try {
        await fetch(`${API_URL}/save-data`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: currentUser.username,
                budget: budgetVES,
                limit: spendingLimitVES,
                transactions: transactions
            })
        });
    } catch (error) {
        console.error("Error sincronizando con la nube:", error);
    }
}

// --- 2. LÓGICA DE REGISTRO Y LOGIN (MEJORADA) ---

async function register() {
    const username = document.getElementById('reg-username').value;
    const name = document.getElementById('reg-name').value;
    const lastname = document.getElementById('reg-lastname').value;
    const password = document.getElementById('reg-password').value;

    if (!username || !password) return showModal("Error", "Usuario y contraseña obligatorios", "❌");

    try {
        const response = await fetch(`${API_URL}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, name, lastname, transactions: [], budget: 0, limit: 0 })
        });

        if (response.ok) {
            showModal("Éxito", "Cuenta creada. Ahora puedes iniciar sesión.", "🎉");
            toggleAuth(false);
        } else {
            showModal("Error", "El usuario ya existe o hubo un problema.", "❌");
        }
    } catch (e) {
        showModal("Servidor Offline", "No se pudo conectar con Render.", "📡");
    }
}

async function login() {
    const username = document.getElementById('username').value;
    const password = document.getElementById('login-password').value;

    try {
        const response = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        if (response.ok) {
            const user = await response.json();
            currentUser = user;
            localStorage.setItem('milCuentas_session', JSON.stringify(user));
            
            // Cargar datos del usuario desde la nube
            transactions = user.transactions || [];
            budgetVES = user.budget || 0;
            spendingLimitVES = user.limit || 0;
            userName = user.name || "Usuario";
            userLastName = user.lastname || "";

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

// (Tus funciones de tiempo, toggleMenu, showModal y updateUserUI se mantienen igual...)

const isToday = (dateStr) => {
    const d = new Date(dateStr);
    return d.toDateString() === new Date().toDateString();
};
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
    if (section === 'inicio') await showModal("Inicio", "Tablero principal listo.", "🏠");
    else if (section === 'stats') document.getElementById('stats-panel').scrollIntoView({ behavior: 'smooth' });
    else if (section === 'edit') {
        userName = prompt("Nombre:", userName) || userName;
        userLastName = prompt("Apellido:", userLastName) || userLastName;
        updateUserUI();
        syncToCloud(); // Guardamos el cambio de nombre en la nube
    }
}

function updateUserUI() {
    document.getElementById('side-username').innerText = userName;
    document.getElementById('side-fullname').innerText = `${userName} ${userLastName}`;
    if (document.getElementById('display-user')) document.getElementById('display-user').innerText = `${userName} ${userLastName}`;
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

// --- 4. GESTIÓN DE GASTOS (CONEXIÓN A NUBE) ---

async function setBudget() {
    budgetVES = parseFloat(document.getElementById('total-budget').value) || 0;
    spendingLimitVES = parseFloat(document.getElementById('spending-limit').value) || 0;
    await syncToCloud(); // Guardar en Render
    await showModal("Configuración", "Presupuesto guardado en la nube.", "⚙️");
    renderAll();
}

async function addTransaction() {
    const desc = document.getElementById('desc').value;
    const amount = parseFloat(document.getElementById('amount').value);
    const currency = document.getElementById('currency').value;

    if (!desc || isNaN(amount)) return await showModal("Incompleto", "Datos inválidos.", "🛒");

    const amountInVES = (currency === "VES") ? amount : amount * rates[currency];
    const totalSpentSoFar = transactions.reduce((sum, t) => sum + t.valueVES, 0);
    const remainingBefore = budgetVES - totalSpentSoFar;

    if (amountInVES > remainingBefore) return await showModal("Fondos Insuficientes", `No tienes saldo suficiente.`, "🚫");

    const totalDespues = totalSpentSoFar + amountInVES;
    if (spendingLimitVES > 0 && totalDespues > spendingLimitVES) {
        if (!(await showModal("¡Límite Excedido!", `Superarás tu alerta. ¿Registrar?`, "⚠️", true))) return;
    }

    transactions.push({ id: Date.now(), date: new Date().toISOString(), desc, originalAmount: amount, originalCurrency: currency, valueVES: amountInVES });
    
    document.getElementById('desc').value = '';
    document.getElementById('amount').value = '';
    
    await syncToCloud(); // Sincronizar nuevo gasto con Render
    renderAll();
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
        document.querySelector('.balance-card').after(statsDiv);
    }
    statsDiv.innerHTML = `<h3 style="margin:0 0 10px 0; font-size: 12px; opacity: 0.7;">📊 RESUMEN (NUBE)</h3>
        <div style="display: flex; justify-content: space-around;">
            <div><small>Hoy</small><br><strong>${fmt(hoy)}</strong></div>
            <div><small>Semana</small><br><strong>${fmt(semana)}</strong></div>
            <div><small>Mes</small><br><strong>${fmt(mes)}</strong></div>
        </div>`;
}

async function deleteTransaction(id) {
    if (await showModal("Eliminar", "¿Borrar registro?", "🗑️", true)) {
        transactions = transactions.filter(t => t.id !== id);
        await syncToCloud(); // Sincronizar eliminación
        renderAll();
    }
}

async function resetApp() {
    if (await showModal("Resetear", "¿Borrar todo?", "💣", true)) {
        transactions = []; budgetVES = 0; spendingLimitVES = 0;
        await syncToCloud();
        renderAll();
    }
}

function changeView(iso) { currentView = iso; renderAll(); }

// --- 5. INICIO DE SESIÓN ---
window.onload = () => {
    if (currentUser) {
        // Si hay una sesión activa, cargar datos
        entrarALaApp();
    } else {
        document.getElementById('login-screen').style.display = 'flex';
    }
};


