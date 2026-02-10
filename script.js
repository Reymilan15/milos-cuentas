// --- 1. CONFIGURACIÓN Y PERSISTENCIA LOCAL ---
let transactions = JSON.parse(localStorage.getItem('milCuentas_data')) || [];
let budgetVES = parseFloat(localStorage.getItem('milCuentas_budget')) || 0;
let spendingLimitVES = parseFloat(localStorage.getItem('milCuentas_limit')) || 0;
let currentView = 'VES';
let rates = { "USD": 36.30, "EUR": 39.50, "VES": 1 };

// Nuevas variables para el usuario
let userName = localStorage.getItem('milCuentas_user_name') || "Usuario";
let userLastName = localStorage.getItem('milCuentas_user_lastname') || "Invitado";

const fmt = (num) => new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);

function saveToDevice() {
    localStorage.setItem('milCuentas_data', JSON.stringify(transactions));
    localStorage.setItem('milCuentas_budget', budgetVES);
    localStorage.setItem('milCuentas_limit', spendingLimitVES);
    localStorage.setItem('milCuentas_user_name', userName);
    localStorage.setItem('milCuentas_user_lastname', userLastName);
}

// --- 2. LÓGICA DE TIEMPO ---
const isToday = (dateStr) => {
    const today = new Date();
    const d = new Date(dateStr);
    return d.toDateString() === today.toDateString();
};

const isThisWeek = (dateStr) => {
    const now = new Date();
    const d = new Date(dateStr);
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
    startOfWeek.setHours(0,0,0,0);
    return d >= startOfWeek;
};

const isThisMonth = (dateStr) => {
    const now = new Date();
    const d = new Date(dateStr);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
};

// --- 3. CONTROL DEL MENÚ LATERAL (NUEVO) ---
function toggleMenu() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    sidebar.classList.toggle('active');
    overlay.classList.toggle('active');
}

async function showSection(section) {
    toggleMenu(); // Cerrar menú al elegir

    if (section === 'inicio') {
        // Ya estamos en el contenedor principal, si tuvieras más pantallas las ocultas aquí
        await showModal("Inicio", "Cargando tu tablero principal...", "🏠");
    } 
    else if (section === 'stats') {
        // Aquí podrías disparar un scroll hacia el panel de estadísticas o abrir un reporte
        document.getElementById('stats-panel').scrollIntoView({ behavior: 'smooth' });
    }
    else if (section === 'edit') {
        const nuevoNombre = prompt("Edita tu nombre:", userName);
        const nuevoApellido = prompt("Edita tu apellido:", userLastName);
        
        if (nuevoNombre !== null && nuevoApellido !== null) {
            userName = nuevoNombre || userName;
            userLastName = nuevoApellido || userLastName;
            saveToDevice();
            updateUserUI();
            await showModal("Actualizado", "Tus datos han sido guardados.", "✅");
        }
    }
}

function updateUserUI() {
    // Actualizar nombre en el sidebar
    document.getElementById('side-username').innerText = userName;
    document.getElementById('side-fullname').innerText = `${userName} ${userLastName}`;
    
    // Actualizar nombre en la cabecera si existe el elemento
    const displayUser = document.getElementById('display-user');
    if (displayUser) displayUser.innerText = `${userName} ${userLastName}`;
}

// --- 4. FUNCIONES DEL MODAL ---
function showModal(title, message, icon = "⚠️", isConfirm = false) {
    return new Promise((resolve) => {
        const modal = document.getElementById('custom-modal');
        const okBtn = document.getElementById('modal-ok-btn');
        const cancelBtn = document.getElementById('modal-cancel-btn');
        
        document.getElementById('modal-title').innerText = title;
        document.getElementById('modal-text').innerText = message;
        document.getElementById('modal-icon').innerText = icon;
        
        cancelBtn.style.display = isConfirm ? "block" : "none";
        okBtn.style.background = (icon === "❌" || icon === "🚨" || icon === "🚫") ? "#ef4444" : "#4f46e5";
        
        modal.style.display = "flex";
        okBtn.onclick = () => { modal.style.display = "none"; resolve(true); };
        cancelBtn.onclick = () => { modal.style.display = "none"; resolve(false); };
    });
}

// --- 5. GESTIÓN DE PRESUPUESTO Y GASTOS ---
async function setBudget() {
    budgetVES = parseFloat(document.getElementById('total-budget').value) || 0;
    spendingLimitVES = parseFloat(document.getElementById('spending-limit').value) || 0;
    saveToDevice();
    await showModal("Configuración", "Presupuesto y límites actualizados.", "⚙️");
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

    if (amountInVES > remainingBefore) {
        return await showModal("Fondos Insuficientes", `No tienes saldo suficiente.`, "🚫");
    }

    const totalDespues = totalSpentSoFar + amountInVES;
    if (spendingLimitVES > 0 && totalDespues > spendingLimitVES) {
        const confirmar = await showModal("¡Límite Excedido!", `Superarás tu límite de alerta. ¿Registrar?`, "⚠️", true);
        if (!confirmar) return;
    }

    transactions.push({ 
        id: Date.now(), 
        date: new Date().toISOString(), 
        desc, 
        originalAmount: amount, 
        originalCurrency: currency, 
        valueVES: amountInVES 
    });

    document.getElementById('desc').value = '';
    document.getElementById('amount').value = '';
    saveToDevice();
    renderAll();
}

// --- 6. RENDERIZADO Y ESTADÍSTICAS ---
function renderAll() {
    const list = document.getElementById('transaction-list');
    const display = document.getElementById('remaining-display');
    const status = document.getElementById('budget-status');
    const card = document.getElementById('balance-card');

    let totalSpentVES = 0;
    let totalHoy = 0;
    let totalSemana = 0;
    let totalMes = 0;

    list.innerHTML = '';
    [...transactions].reverse().forEach(t => {
        totalSpentVES += t.valueVES;
        if (isToday(t.date)) totalHoy += t.valueVES;
        if (isThisWeek(t.date)) totalSemana += t.valueVES;
        if (isThisMonth(t.date)) totalMes += t.valueVES;

        const li = document.createElement('li');
        li.innerHTML = `
            <div><b>${t.desc}</b><br><span>${fmt(t.originalAmount)} ${t.originalCurrency}</span></div>
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
        statsDiv.className = 'stats-container'; // Asegúrate de tener esta clase en CSS o usa style.cssText
        statsDiv.style.cssText = "background: #1e293b; color: white; padding: 15px; border-radius: 15px; margin-top: 20px; text-align: center;";
        document.querySelector('.balance-card').after(statsDiv);
    }
    statsDiv.innerHTML = `
        <h3 style="margin:0 0 10px 0; font-size: 12px; opacity: 0.7;">📊 RESUMEN DE GASTOS (BS)</h3>
        <div style="display: flex; justify-content: space-around;">
            <div><small>Hoy</small><br><strong>${fmt(hoy)}</strong></div>
            <div><small>Semana</small><br><strong>${fmt(semana)}</strong></div>
            <div><small>Mes</small><br><strong>${fmt(mes)}</strong></div>
        </div>`;
}

async function deleteTransaction(id) {
    const c = await showModal("Eliminar", "¿Borrar registro?", "🗑️", true);
    if (c) { transactions = transactions.filter(t => t.id !== id); saveToDevice(); renderAll(); }
}

async function resetApp() {
    const c = await showModal("Resetear", "¿Borrar todo?", "💣", true);
    if (c) { localStorage.clear(); location.reload(); }
}

function changeView(iso) { currentView = iso; renderAll(); }

function logout() {
    location.reload(); // En una app local, recargar simula el cierre de sesión
}

// --- 7. INICIO ---
window.onload = () => {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app-container').style.display = 'block';
    document.getElementById('menu-btn').style.display = 'flex'; // Mostrar botón de 3 rayas
    
    document.getElementById('total-budget').value = budgetVES || "";
    document.getElementById('spending-limit').value = spendingLimitVES || "";
    
    updateUserUI();
    renderAll();
};
