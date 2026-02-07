// --- 1. CONFIGURACIÓN Y DIAGNÓSTICO ---
const BASE_URL = 'https://TU-URL-DE-RENDER.onrender.com'; // ⬅️ CAMBIA ESTO

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

// --- FUNCIÓN DEL MODAL ---
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

// --- 2. AUTENTICACIÓN (CONEXIÓN A RENDER) ---
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
        const response = await fetch(`${BASE_URL}/api/register`, {
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
    } catch (error) { await showModal("Error", "No hay conexión con el servidor.", "❌"); }
}

async function login() {
    const identifier = document.getElementById('username').value.trim().toLowerCase();
    const password = document.getElementById('login-password').value;

    if (!identifier || !password) return await showModal("Faltan datos", "Escribe tu usuario y contraseña.", "🔑");

    try {
        const response = await fetch(`${BASE_URL}/api/login`, {
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
    } catch (error) { 
        await showModal("Servidor Dormido", "El servidor está despertando, intenta de nuevo en 20 segundos.", "⏳"); 
    }
}

// --- 3. LÓGICA DE GASTOS ---
async function syncWithServer() {
    if (!currentUser) return;
    try {
        await fetch(`${BASE_URL}/api/save`, {
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

// --- RESTO DE FUNCIONES (Render, Budget, etc.) ---
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
        if (remainingVES <= 0.01) {
            status.innerText = "🚨 SALDO AGOTADO";
            card.style.background = "linear-gradient(135deg, #dc2626, #991b1b)"; 
        } else {
            status.innerText = `Balance en ${currentView}`;
            card.style.background = "linear-gradient(135deg, #4f46e5, #3730a3)"; 
        }
    }
}

async function setBudget() {
    const newBudgetVal = parseFloat(document.getElementById('total-budget').value) || 0;
    budgetVES = newBudgetVal;
    await syncWithServer();
    renderAll();
}

function changeView(iso) { currentView = iso; renderAll(); }
function logout() { location.reload(); }

window.onload = () => {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('app-container').style.display = 'none';
};

window.onload = () => {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('app-container').style.display = 'none';

};
