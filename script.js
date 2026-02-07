
const BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? 'http://localhost:3000' 
    : window.location.origin;

window.onerror = async function(msg, url, linenumber) {
    if(!msg.includes("ResizeObserver")) {
        console.error("Error:", msg, "en", url, ":", linenumber);
        showModal("Error de App", msg, "🚨");
    }
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

// --- 2. AUTENTICACIÓN ---
function toggleAuth(isRegister) {
    const title = document.getElementById('auth-title');
    const loginBtns = document.getElementById('login-buttons');
    const regBtns = document.getElementById('register-buttons');
    title.innerText = isRegister ? "Crear Cuenta Nueva" : "Iniciar Sesión";
    loginBtns.style.display = isRegister ? "none" : "block";
    regBtns.style.display = isRegister ? "block" : "none";
}

async function register() {
    const fields = ['reg-username', 'reg-name', 'reg-lastname', 'reg-email', 'reg-password'];
    const values = fields.map(id => document.getElementById(id).value.trim());
    
    if (values.some(v => !v)) return await showModal("Campos vacíos", "Rellena todos los campos.", "📝");

    try {
        const response = await fetch(`${BASE_URL}/api/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                username: values[0].toLowerCase(), 
                name: values[1], 
                lastname: values[2], 
                email: values[3], 
                password: values[4] 
            })
        });
        const data = await response.json();
        if (response.ok) {
            await showModal("¡Éxito!", "Cuenta creada.", "✅");
            toggleAuth(false);
        } else {
            await showModal("Registro fallido", data.error, "⚠️");
        }
    } catch (error) { await showModal("Error", "Sin conexión con el servidor.", "❌"); }
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
            
            renderAll();
        } else {
            await showModal("Acceso denegado", data.error, "❌");
        }
    } catch (error) { 
        await showModal("Servidor Iniciando", "Despertando al servidor de Render. Reintenta en 20 segundos.", "⏳"); 
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
    } catch (e) { console.error("Error de sincronización"); }
}

async function addTransaction() {
    const desc = document.getElementById('desc').value;
    const amount = parseFloat(document.getElementById('amount').value);
    const currency = document.getElementById('currency').value;

    if (!desc || isNaN(amount)) return await showModal("Incompleto", "Datos de compra inválidos.", "🛒");

    const amountInVES = (currency === "VES") ? amount : amount * rates[currency];
    const totalSpentSoFar = transactions.reduce((sum, t) => sum + t.valueVES, 0);
    const remainingBefore = budgetVES - totalSpentSoFar;

    if (amountInVES > remainingBefore) {
        return await showModal("Fondos Insuficientes", `No puedes gastar más de lo que tienes (${fmt(remainingBefore)} BS).`, "🚫");
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

async function deleteTransaction(id) {
    const confirmar = await showModal("Eliminar Gasto", "¿Estás seguro de borrar este registro?", "🗑️", true);
    if (confirmar) {
        transactions = transactions.filter(t => t.id !== id);
        await syncWithServer();
        renderAll();
    }
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
    
    if (budgetVES > 0) {
        if (remainingVES <= 0.01) {
            status.innerText = "🚨 SALDO AGOTADO";
            card.style.background = "linear-gradient(135deg, #dc2626, #991b1b)"; 
        } else {
            status.innerText = `Balance en ${currentView}`;
            card.style.background = "linear-gradient(135deg, #4f46e5, #3730a3)"; 
        }
    } else {
        status.innerText = "Define un presupuesto inicial";
        card.style.background = "linear-gradient(135deg, #6b7280, #4b5563)";
    }
}

async function setBudget() {
    const val = parseFloat(document.getElementById('total-budget').value) || 0;
    budgetVES = val;
    await syncWithServer();
    renderAll();
}

function changeView(iso) { currentView = iso; renderAll(); }
function logout() { location.reload(); }

window.onload = () => {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('app-container').style.display = 'none';
};


