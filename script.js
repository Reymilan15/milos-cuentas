// --- 1. CONFIGURACIÓN Y PERSISTENCIA LOCAL ---
// Cargamos datos guardados o iniciamos vacíos
let transactions = JSON.parse(localStorage.getItem('milCuentas_data')) || [];
let budgetVES = parseFloat(localStorage.getItem('milCuentas_budget')) || 0;
let spendingLimitVES = parseFloat(localStorage.getItem('milCuentas_limit')) || 0;
let currentView = 'VES';
let rates = { "USD": 36.30, "EUR": 39.50, "VES": 1 };

const fmt = (num) => new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);

// Función para guardar todo en el teléfono
function saveToDevice() {
    localStorage.setItem('milCuentas_data', JSON.stringify(transactions));
    localStorage.setItem('milCuentas_budget', budgetVES);
    localStorage.setItem('milCuentas_limit', spendingLimitVES);
}

// --- 2. LÓGICA DE TIEMPO PARA ESTADÍSTICAS ---
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

// --- 3. FUNCIONES DEL MODAL (INTERACTIVO) ---
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

// --- 4. GESTIÓN DE PRESUPUESTO ---
async function setBudget() {
    const valBudget = parseFloat(document.getElementById('total-budget').value) || 0;
    const valLimit = parseFloat(document.getElementById('spending-limit').value) || 0;
    
    budgetVES = valBudget;
    spendingLimitVES = valLimit;
    
    saveToDevice();
    await showModal("Configuración", "Presupuesto y límites guardados en este dispositivo.", "⚙️");
    renderAll();
}

// --- 5. REGISTRO DE GASTOS CON ALERTAS ---
async function addTransaction() {
    const desc = document.getElementById('desc').value;
    const amount = parseFloat(document.getElementById('amount').value);
    const currency = document.getElementById('currency').value;

    if (!desc || isNaN(amount)) return await showModal("Incompleto", "Datos de compra inválidos.", "🛒");

    const amountInVES = (currency === "VES") ? amount : amount * rates[currency];
    const totalSpentSoFar = transactions.reduce((sum, t) => sum + t.valueVES, 0);
    const remainingBefore = budgetVES - totalSpentSoFar;

    // Validación 1: Bloqueo si no hay dinero
    if (amountInVES > remainingBefore) {
        return await showModal("Fondos Insuficientes", `No puedes gastar más de lo que tienes (${fmt(remainingBefore)} BS).`, "🚫");
    }

    // Validación 2: Advertencia si pasa el límite
    const totalDespues = totalSpentSoFar + amountInVES;
    if (spendingLimitVES > 0 && totalDespues > spendingLimitVES) {
        const excedido = totalDespues - spendingLimitVES;
        const confirmar = await showModal(
            "¡Límite Excedido!", 
            `Con este gasto superarás tu límite de alerta por ${fmt(excedido)} BS. ¿Registrar?`, 
            "⚠️", 
            true
        );
        if (!confirmar) return;
    }

    transactions.push({ 
        id: Date.now(), 
        date: new Date().toISOString(), // Fecha exacta del gasto
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
        
        // Sumar a estadísticas según fecha
        if (isToday(t.date)) totalHoy += t.valueVES;
        if (isThisWeek(t.date)) totalSemana += t.valueVES;
        if (isThisMonth(t.date)) totalMes += t.valueVES;

        const li = document.createElement('li');
        li.className = "transaction-item";
        li.innerHTML = `
            <div>
                <b>${t.desc}</b><br>
                <span>${fmt(t.originalAmount)} ${t.originalCurrency}</span>
            </div>
            <div style="text-align: right;">
                <strong>-${fmt(t.valueVES)} BS</strong><br>
                <small onclick="deleteTransaction(${t.id})" style="color: #ef4444; cursor: pointer;">Eliminar</small>
            </div>`;
        list.appendChild(li);
    });

    const remainingVES = budgetVES - totalSpentVES;
    const converted = (currentView === "VES") ? remainingVES : remainingVES / rates[currentView];
    display.innerText = `${fmt(converted)} ${currentView}`;
    
    // Cambiar colores de tarjeta
    if (budgetVES > 0) {
        if (remainingVES <= 0.01) {
            status.innerText = "🚨 SALDO AGOTADO";
            card.style.background = "linear-gradient(135deg, #dc2626, #991b1b)"; 
        } else if (spendingLimitVES > 0 && totalSpentVES > spendingLimitVES) {
            status.innerText = "⚠️ LÍMITE EXCEDIDO";
            card.style.background = "linear-gradient(135deg, #f59e0b, #d97706)"; 
        } else {
            status.innerText = `Balance en ${currentView}`;
            card.style.background = "linear-gradient(135deg, #4f46e5, #3730a3)"; 
        }
    }

    updateStatsUI(totalHoy, totalSemana, totalMes);
}

// Función para mostrar el cuadro de estadísticas
function updateStatsUI(hoy, semana, mes) {
    let statsDiv = document.getElementById('stats-panel');
    if (!statsDiv) {
        statsDiv = document.createElement('div');
        statsDiv.id = 'stats-panel';
        statsDiv.style.cssText = "background: #1e293b; color: white; padding: 15px; border-radius: 15px; margin-top: 20px; text-align: center;";
        document.querySelector('.balance-card').after(statsDiv);
    }

    statsDiv.innerHTML = `
        <h3 style="margin:0 0 10px 0; font-size: 14px; text-transform: uppercase;">📊 Resumen de Gastos (BS)</h3>
        <div style="display: flex; justify-content: space-around; gap: 5px;">
            <div><small>Hoy</small><br><strong>${fmt(hoy)}</strong></div>
            <div><small>Semana</small><br><strong>${fmt(semana)}</strong></div>
            <div><small>Mes</small><br><strong>${fmt(mes)}</strong></div>
        </div>
    `;
}

async function deleteTransaction(id) {
    const confirmar = await showModal("Eliminar Gasto", "¿Borrar este registro?", "🗑️", true);
    if (confirmar) {
        transactions = transactions.filter(t => t.id !== id);
        saveToDevice();
        renderAll();
    }
}

async function resetApp() {
    const confirmar = await showModal("Resetear Todo", "¿Deseas borrar todos los datos permanentemente?", "💣", true);
    if (confirmar) {
        transactions = [];
        budgetVES = 0;
        spendingLimitVES = 0;
        localStorage.clear();
        location.reload();
    }
}

function changeView(iso) { currentView = iso; renderAll(); }

window.onload = () => {
    // Saltamos la pantalla de login para uso local rápido
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app-container').style.display = 'block';
    
    // Rellenamos inputs si hay datos guardados
    document.getElementById('total-budget').value = budgetVES || "";
    document.getElementById('spending-limit').value = spendingLimitVES || "";
    
    renderAll();
};
