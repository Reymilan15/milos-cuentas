// --- 1. SISTEMA DE DIAGNÓSTICO DE ERRORES ---
window.onerror = async function(msg, url, linenumber) {
    await showModal("Error Crítico", msg, "🚨");
    return true;
};

let currentUser = "";
let transactions = [];
let budgetVES = 0;
let spendingLimitVES = 0; 
let currentView = 'VES';
let rates = { "USD": 36.30, "EUR": 39.50, "VES": 1 };

const fmt = (num) => new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);

// --- FUNCIÓN DEL MODAL MÁGICO ---
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

// --- 2. LÓGICA DE AUTENTICACIÓN ---
function toggleAuth(isRegister) {
    const title = document.getElementById('auth-title');
    const loginBtns = document.getElementById('login-buttons');
    const regBtns = document.getElementById('register-buttons');
    if (isRegister) {
        title.innerText = "Crear Cuenta Nueva";
        loginBtns.style.display = "none";
        regBtns.style.display = "block";
    } else {
        title.innerText = "Iniciar Sesión";
        loginBtns.style.display = "block";
        regBtns.style.display = "none";
    }
}

async function register() {
    const username = document.getElementById('reg-username').value.trim().toLowerCase();
    const name = document.getElementById('reg-name').value.trim();
    const lastname = document.getElementById('reg-lastname').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;

    if (!username || !name || !lastname || !email || !password) {
        return await showModal("Campos vacíos", "Por favor, rellena todos los campos.", "📝");
    }

    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, name, lastname, email, password })
        });
        const data = await response.json();
        if (response.ok) {
            await showModal("¡Éxito!", "Cuenta creada correctamente.", "✅");
            toggleAuth(false);
        } else {
            await showModal("Registro fallido", data.error, "⚠️");
        }
    } catch (error) { await showModal("Error", "No hay conexión.", "❌"); }
}

async function login() {
    const identifier = document.getElementById('username').value.trim().toLowerCase();
    const password = document.getElementById('login-password').value;

    if (!identifier || !password) return await showModal("Faltan datos", "Escribe tu usuario y contraseña.", "🔑");

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier, password })
        });

        const data = await response.json();

        if (response.ok) {
            if (data.rates) rates = data.rates;
            currentUser = data.username;
            budgetVES = data.budget || 0;
            spendingLimitVES = data.spendingLimit || 0; 
            transactions = data.transactions || [];

            document.getElementById('login-screen').style.display = 'none';
            document.getElementById('app-container').style.display = 'block';
            document.getElementById('display-user').innerText = `${data.name} ${data.lastname}`;
            document.getElementById('total-budget').value = budgetVES > 0 ? budgetVES : "";
            
            if(document.getElementById('spending-limit')) {
                document.getElementById('spending-limit').value = spendingLimitVES > 0 ? spendingLimitVES : "";
            }
            renderAll();
        } else {
            await showModal("Acceso denegado", data.error, "❌");
        }
    } catch (error) { await showModal("Error", "Error de servidor.", "🚨"); }
}

// --- 3. LÓGICA DE LA BILLETERA ---
async function syncWithServer() {
    if (!currentUser) return;
    try {
        await fetch('/api/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                username: currentUser, 
                budget: budgetVES, 
                spendingLimit: spendingLimitVES, 
                transactions 
            })
        });
    } catch (e) { console.error("Error sincronizando"); }
}

async function setBudget() {
    const newBudgetVal = parseFloat(document.getElementById('total-budget').value) || 0;
    
    if (transactions.length > 0 && newBudgetVal > 0) {
        const resetear = await showModal("Nuevo Presupuesto", "¿Deseas empezar de cero con este monto?", "💰", true);
        if (resetear) { transactions = []; }
    }

    budgetVES = newBudgetVal;
    const limitInput = document.getElementById('spending-limit');
    spendingLimitVES = limitInput ? (parseFloat(limitInput.value) || 0) : 0;
    
    await syncWithServer();
    renderAll();
}

async function addTransaction() {
    const desc = document.getElementById('desc').value;
    const amount = parseFloat(document.getElementById('amount').value);
    const currency = document.getElementById('currency').value;

    if (!desc || isNaN(amount)) return await showModal("Incompleto", "Dime qué compraste y cuánto costó.", "🛒");

    const amountInVES = (currency === "VES") ? amount : amount * rates[currency];
    const totalSpentSoFar = transactions.reduce((sum, t) => sum + t.valueVES, 0);
    const remainingBefore = budgetVES - totalSpentSoFar;

    // --- PROTECCIÓN DE SALDO NEGATIVO ---
    if (amountInVES > remainingBefore) {
        return await showModal(
            "Fondos Insuficientes", 
            `No puedes gastar ${fmt(amountInVES)} BS porque solo te quedan ${fmt(remainingBefore)} BS.`, 
            "🚫"
        );
    }

    // Validación de límite de gasto (opcional, pero se mantiene por tu configuración)
    if (spendingLimitVES > 0 && (totalSpentSoFar + amountInVES) > spendingLimitVES) {
        const continuar = await showModal("Límite superado", `Este gasto te hará pasar de tu límite de ${fmt(spendingLimitVES)} BS. ¿Continuar?`, "⚠️", true);
        if (!continuar) return;
    }

    transactions.push({ 
        id: Date.now(), 
        desc, 
        originalAmount: amount, 
        originalCurrency: currency, 
        valueVES: amountInVES 
    });

    document.getElementById('desc').value = '';
    document.getElementById('amount').value = '';
    await syncWithServer();
    renderAll();
}

function renderAll() {
    const list = document.getElementById('transaction-list');
    const display = document.getElementById('remaining-display');
    const status = document.getElementById('budget-status');
    const card = document.getElementById('balance-card');
    if (!list) return;

    list.innerHTML = '';
    let totalSpentVES = 0;
    
    [...transactions].reverse().forEach(t => {
        totalSpentVES += t.valueVES;
        const li = document.createElement('li');
        li.innerHTML = `<div><b>${t.desc}</b><br><span>${fmt(t.originalAmount)} ${t.originalCurrency}</span></div><strong>-${fmt(t.valueVES)} BS</strong>`;
        list.appendChild(li);
    });

    const remainingVES = budgetVES - totalSpentVES;
    const converted = (currentView === "VES") ? remainingVES : remainingVES / rates[currentView];
    display.innerText = `${fmt(converted)} ${currentView}`;
    
    if (budgetVES > 0) {
        if (remainingVES <= 0.01) { // Pequeño margen para errores de redondeo
            status.innerText = "🚨 SALDO AGOTADO";
            card.style.background = "linear-gradient(135deg, #dc2626, #991b1b)"; 
        } else if (spendingLimitVES > 0 && totalSpentVES >= spendingLimitVES) {
            status.innerText = "⚠️ LÍMITE DE GASTOS SUPERADO";
            card.style.background = "linear-gradient(135deg, #f59e0b, #d97706)"; 
        } else {
            let tinfo = currentView === "VES" ? "" : `(Tasa: ${fmt(rates[currentView])} BS)`;
            status.innerText = `Balance en ${currentView} ${tinfo}`;
            card.style.background = "linear-gradient(135deg, #4f46e5, #3730a3)"; 
        }
    } else {
        status.innerText = "Define un presupuesto para iniciar";
        card.style.background = "linear-gradient(135deg, #6b7280, #4b5563)";
    }
}

function changeView(iso) { currentView = iso; renderAll(); }
function logout() { location.reload(); }

async function resetApp() {
    const confirmar = await showModal("Borrar Todo", "¿Estás seguro de que deseas eliminar todo?", "🗑️", true);
    if(confirmar) {
        transactions = []; 
        budgetVES = 0; 
        spendingLimitVES = 0;
        document.getElementById('total-budget').value = "";
        const sLimit = document.getElementById('spending-limit');
        if(sLimit) sLimit.value = "";
        await syncWithServer(); 
        renderAll();
    }
}

window.onload = () => {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('app-container').style.display = 'none';
};