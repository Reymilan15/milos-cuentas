
var API_URL = "https://milos-cuentas.onrender.com"; 

let transactions = [];
let budgetVES = 0;
let spendingLimitVES = 0;
let rates = { "USD": 1, "EUR": 1, "VES": 1 };
let currentView = 'VES';
let myChart = null;
let currentChartFilter = '7days';
let statsOrderAsc = false; 

// --- VARIABLES PARA EL CALENDARIO ---
let currentCalendarDate = new Date();

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
            // El modelo actualiza el dólar y convierte a la tasa del banco central diariamente
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

// --- NUEVA FUNCIÓN: CAMBIAR NOMBRE DE CUENTA ---
async function editProfile() {
    const newName = prompt("Introduce tu nuevo nombre de perfil:", currentUser.name);
    
    if (newName && newName.trim() !== "") {
        if (!/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/.test(newName)) {
            await showModal("Error", "El nombre solo puede contener letras", "👤");
            return;
        }

        currentUser.name = newName.trim();
        document.getElementById('side-username').innerText = currentUser.name;
        
        localStorage.setItem('milCuentas_session', JSON.stringify(currentUser));
        await syncToCloud();
        await showModal("Perfil Actualizado", `Nombre cambiado a: ${currentUser.name}`, "✅");
    }
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
    document.getElementById('section-calendario').style.display = sec === 'calendario' ? 'block' : 'none'; 
    
    if(sec === 'stats') {
        renderChart();
        renderIndividualStats(); 
        renderCategoryAnalysis();
    }
    if(sec === 'registros') renderFullHistory();
    if(sec === 'calendario') renderCalendarGrid();

    const sidebar = document.getElementById('sidebar');
    if(sidebar && sidebar.classList.contains('active')) toggleMenu();
}

// --- 3. GESTIÓN DE GASTOS ---
async function addTransaction() {
    const descInput = document.getElementById('desc');
    const amountInput = document.getElementById('amount');
    const currencyInput = document.getElementById('currency');
    const categoryInput = document.getElementById('category-select');

    const desc = descInput.value;
    const amount = parseFloat(amountInput.value);
    const curr = currencyInput.value;
    const category = categoryInput ? categoryInput.value : "Otros";

    if (!desc || isNaN(amount) || amount <= 0) {
        await showModal("Error", "Ingresa una descripción y un monto válido", "🛒");
        return;
    }

    if (budgetVES <= 0) {
        await showModal("Presupuesto Vacío", "Primero fija un presupuesto en la parte superior", "💰");
        return;
    }

    let valVES = (curr === "USD") ? amount * rates.USD : (curr === "EUR") ? amount * rates.EUR : amount;
    
    const totalGastadoAntes = transactions.reduce((s, x) => s + x.valueVES, 0);
    const saldoDisponibleReal = budgetVES - totalGastadoAntes;
    const totalDespuesDeEsteGasto = totalGastadoAntes + valVES;

    if (valVES > saldoDisponibleReal) {
        await showModal("Gasto Rechazado", `No tienes saldo suficiente. Solo te quedan ${fmt(saldoDisponibleReal)} BS.`, "🚫");
        return; 
    }

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

// --- 4. GESTIÓN DE PRESUPUESTO ---
async function setBudget() {
    const total = parseFloat(document.getElementById('total-budget').value) || 0;
    const limit = parseFloat(document.getElementById('spending-limit').value) || 0;

    if (total <= 0) {
        await showModal("Error", "Ingresa un presupuesto válido", "💰");
        return;
    }

    if (limit > total) {
        const msg = `Tu límite (${fmt(limit)} BS) es mayor a tu presupuesto. ¿Deseas fijarlo así?`;
        const confirma = await showModal("Límite Elevado", msg, "⚠️", true);
        if (!confirma) return;
    }
    
    confirmSetBudget(total, limit);
} 

async function confirmSetBudget(total, limit) {
    const totalGastadoAcumulado = transactions.reduce((s, x) => s + x.valueVES, 0);
    budgetVES = total + totalGastadoAcumulado;
    spendingLimitVES = limit;
    
    if(currentUser) {
        currentUser.budget = budgetVES;
        currentUser.spendingLimit = spendingLimitVES;
        localStorage.setItem('milCuentas_session', JSON.stringify(currentUser));
        await syncToCloud();
    }
    
    renderAll();
    showModal("¡Listo!", `Ahora tienes ${fmt(total)} BS disponibles para gastar.`, "✅");
}

// --- 5. LÓGICA DE CALENDARIO VISUAL ---
function changeMonth(offset) {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + offset);
    renderCalendarGrid();
}

function renderCalendarGrid() {
    const grid = document.getElementById('calendar-grid');
    const monthYearLabel = document.getElementById('calendar-month-year');
    if (!grid || !monthYearLabel) return;

    grid.innerHTML = '';
    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();
    
    const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    monthYearLabel.innerText = `${monthNames[month].toUpperCase()} ${year}`;

    const firstDayIndex = new Date(year, month, 1).getDay();
    const lastDayDate = new Date(year, month + 1, 0).getDate();

    for (let i = 0; i < firstDayIndex; i++) {
        grid.appendChild(document.createElement('div'));
    }

    for (let day = 1; day <= lastDayDate; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const hasExpenses = transactions.some(t => new Date(t.date).toISOString().split('T')[0] === dateStr);
        
        const dayBtn = document.createElement('div');
        dayBtn.className = 'calendar-day-item';
        dayBtn.setAttribute('data-date', dateStr); 
        
        dayBtn.style = `padding: 12px 5px; cursor: pointer; border-radius: 12px; transition: 0.2s; position: relative; color: white; font-weight: bold; border: 1px solid rgba(255,255,255,0.05); text-align: center;`;

        dayBtn.innerHTML = `${day} ${hasExpenses ? '<div class="dot" style="width:5px; height:5px; background:var(--primary); border-radius:50%; position:absolute; bottom:5px; left:50%; transform:translateX(-50%);"></div>' : ''}`;

        dayBtn.onclick = () => {
            document.querySelectorAll('.calendar-day-item').forEach(d => {
                d.style.background = 'transparent';
                d.style.color = 'white';
                const dDot = d.querySelector('.dot');
                if(dDot) dDot.style.background = 'var(--primary)';
            });
            dayBtn.style.background = 'var(--primary)';
            dayBtn.style.color = '#000';
            const dot = dayBtn.querySelector('.dot');
            if(dot) dot.style.background = '#000';
            filterBySpecificDate(dateStr);
        };
        grid.appendChild(dayBtn);
    }
}

function filterBySpecificDate(selectedDate) {
    const list = document.getElementById('calendar-list');
    const title = document.getElementById('date-selected-title');
    const totalDisplay = document.getElementById('total-day-display');
    const [y, m, d] = selectedDate.split('-');
    const dateObj = new Date(y, m - 1, d);
    title.innerText = `Gastos del: ${dateObj.toLocaleDateString()}`;

    const filtered = transactions.filter(t => new Date(t.date).toISOString().split('T')[0] === selectedDate);
    list.innerHTML = '';
    let totalDia = 0;

    if (filtered.length === 0) {
        list.innerHTML = `<p style="color:gray; text-align:center; margin-top:20px;">No hubo gastos este día.</p>`;
        totalDisplay.innerText = "";
    } else {
        filtered.forEach(t => {
            totalDia += t.valueVES;
            list.innerHTML += `<li class="transaction-item-mini" style="background:rgba(255,255,255,0.05); margin-bottom:10px; padding:12px; border-radius:12px; display:flex; justify-content:space-between;">
                <div><b>${t.desc}</b><br><small style="color:var(--primary)">${t.category}</small></div>
                <div style="text-align:right"><strong>-${fmt(t.valueVES)} BS</strong><br><small>${t.time}</small></div>
            </li>`;
        });
        totalDisplay.innerHTML = `Total del día: <span style="color:var(--danger)">${fmt(totalDia)} BS</span>`;
    }
}

// --- 6. MODAL Y UTILIDADES ---
function showModal(title, msg, icon, isConfirm = false) {
    return new Promise((res) => {
        const m = document.getElementById('custom-modal');
        const titleEl = document.getElementById('modal-title');
        const textEl = document.getElementById('modal-text');
        const iconEl = document.getElementById('modal-icon');
        const okBtn = document.getElementById('modal-ok-btn');
        const cancelBtn = document.getElementById('modal-cancel-btn');

        // Si por alguna razón el HTML del modal no existe, usamos un alert clásico para no dejar al usuario a ciegas
        if (!m || !titleEl || !textEl) {
            console.error("El HTML del modal no se encontró en el DOM.");
            alert(`${icon} ${title}\n\n${msg}`);
            res(isConfirm ? false : true);
            return;
        }

        titleEl.innerText = title;
        textEl.innerText = msg;
        iconEl.innerText = icon;
        
        cancelBtn.style.display = isConfirm ? "block" : "none";
        okBtn.innerText = isConfirm ? "Confirmar" : "Aceptar";
        
        // Mostrar el modal
        m.style.display = "flex"; 

        okBtn.onclick = () => { 
            m.style.display = "none"; 
            res(true); 
        };
        
        cancelBtn.onclick = () => { 
            m.style.display = "none"; 
            res(false); 
        };
    });
}
async function resetApp() {
    const confirma = await showModal("¿Restablecer todo?", "Se borrarán gastos y presupuesto. No se puede deshacer.", "⚠️", true);
    if (confirma) {
        transactions = [];
        budgetVES = 0;
        spendingLimitVES = 0;
        if (currentUser) {
            currentUser.transactions = [];
            currentUser.budget = 0;
            currentUser.spendingLimit = 0;
            localStorage.setItem('milCuentas_session', JSON.stringify(currentUser));
            await syncToCloud();
        }
        location.reload(); 
    }
}

// --- 7. AUTENTICACIÓN (CORREGIDA) ---

function logout() {
    // 1. Limpiamos la sesión del navegador
    localStorage.removeItem('milCuentas_session');
    currentUser = null;

    // 2. Definimos los elementos que queremos manipular
    const loginScreen = document.getElementById('login-screen');
    const appContainer = document.getElementById('app-container');
    const appHeader = document.getElementById('app-header-ui');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');

    // 3. Cambiamos la visibilidad solo si los elementos existen (evita el error de 'style')
    if (loginScreen) loginScreen.style.display = 'flex';
    if (appContainer) appContainer.style.display = 'none';
    if (appHeader) appHeader.style.display = 'none';
    
    // 4. Cerramos el menú lateral si estaba abierto
    if (sidebar) sidebar.classList.remove('active');
    if (overlay) overlay.classList.remove('active');

    // 5. Limpiamos los inputs de login para la próxima vez
    const userInp = document.getElementById('login-user');
    const passInp = document.getElementById('login-pass');
    if (userInp) userInp.value = '';
    if (passInp) passInp.value = '';
    
    console.log("Sesión cerrada correctamente.");
}

async function login() {
    try {
        const userInput = document.getElementById('login-user');
        const passInput = document.getElementById('login-pass');
        const userVal = userInput.value.trim();
        const passVal = passInput.value.trim();

        if (!userVal || !passVal) {
            lanzarAvisoError("Campos Vacíos", "Por favor, completa todos los campos.");
            return;
        }

        // 1. Intento con el Servidor (database.json)
        try {
            const res = await fetch(`${API_URL}/api/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: userVal, password: passVal })
            });

            if (res.ok) {
                const data = await res.json();
                currentUser = data;
                localStorage.setItem('milCuentas_session', JSON.stringify(currentUser));
                entrarALaApp();
                return;
            }
        } catch (e) {
            console.warn("Servidor offline, operando en modo local...");
        }

        // 2. Lógica Universal Local (Para cualquier cuenta)
        // Buscamos en la lista global de usuarios locales
        let usersDB = JSON.parse(localStorage.getItem('milCuentas_users')) || {};

        if (usersDB[userVal]) {
            // Si el usuario existe localmente, validamos su clave
            if (usersDB[userVal].password === passVal) {
                currentUser = usersDB[userVal];
                localStorage.setItem('milCuentas_session', JSON.stringify(currentUser));
                entrarALaApp();
            } else {
                lanzarAvisoError("Contraseña Incorrecta", "La clave no coincide para este usuario.");
            }
        } else {
            // Si el usuario NO existe (ni en server ni local), lo creamos dinámicamente
            // Esto evita que te quedes fuera si el servidor no responde
            const newUser = {
                username: userVal,
                password: passVal,
                name: userVal,
                budget: 0,
                spendingLimit: 0,
                transactions: []
            };
            
            usersDB[userVal] = newUser;
            localStorage.setItem('milCuentas_users', JSON.stringify(usersDB));
            
            currentUser = newUser;
            localStorage.setItem('milCuentas_session', JSON.stringify(currentUser));
            entrarALaApp();
        }

    } catch (e) {
        console.error("Error crítico:", e);
        lanzarAvisoError("Error", "No se pudo procesar el inicio de sesión.");
    }
}

// Esta función asegura que el modal sea visible por encima de todo
function lanzarAvisoError(titulo, mensaje) {
    // Usamos tu función showModal ya existente que devuelve una promesa
    showModal(titulo, mensaje, "🚨");
}
// Función para cerrar el aviso
function cerrarModal() {
    document.getElementById('custom-modal').style.display = 'none';
}
async function register() {
    const username = document.getElementById('reg-username').value.trim();
    const name = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password-input').value;

    if (!/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/.test(name)) return await showModal("Error", "El nombre solo letras", "👤");
    if (username.length < 4) return await showModal("Error", "Usuario muy corto", "🆔");
    if (!email.includes('@')) return await showModal("Error", "Correo inválido", "📧");
    if (password.length < 8) return await showModal("Seguridad", "Mínimo 8 caracteres", "🔒");

    try {
        const res = await fetch(`${API_URL}/api/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, name, email, password })
        });
        if (res.ok) { 
            await showModal("🎉 Éxito", "Cuenta creada", "✅"); 
            toggleAuth(false); 
        } else {
            const data = await res.json();
            await showModal("Error", data.message || "Ya registrado", "🚫");
        }
    } catch (e) { await showModal("Error", "Fallo de conexión", "🌐"); }
}

function entrarALaApp() {
    if (!currentUser) return;

    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app-container').style.display = 'block';
    document.getElementById('app-header-ui').style.display = 'flex';
    
    transactions = currentUser.transactions || [];
    budgetVES = currentUser.budget || 0;
    spendingLimitVES = currentUser.spendingLimit || 0;
    
    const sideName = document.getElementById('side-username');
    if (sideName) sideName.innerText = currentUser.name || "Usuario";
    
    const budgetInput = document.getElementById('total-budget');
    if (budgetInput) budgetInput.value = budgetVES || "";
    
    const limitInput = document.getElementById('spending-limit');
    if (limitInput) limitInput.value = spendingLimitVES || "";
    
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
                name: currentUser.name, 
                budget: budgetVES, 
                spendingLimit: spendingLimitVES, 
                transactions: transactions 
            })
        });
    } catch (e) {}
}

// --- 8. RENDERING Y GRÁFICAS ---
function renderAll() {
    if(!currentUser) return;
    const total = transactions.reduce((s, x) => s + x.valueVES, 0);
    const rem = budgetVES - total;
    const list = document.getElementById('transaction-list');
    
    if(list) {
        list.innerHTML = '';
        [...transactions].reverse().slice(0, 8).forEach(t => {
            const li = document.createElement('li');
            li.className = "transaction-item-mini";
            li.innerHTML = `<div><b>${t.desc}</b><br><small style="color:var(--primary)">${t.category || 'Otros'}</small></div>
                <div style="text-align:right"><strong style="color:white">-${fmt(t.valueVES)} BS</strong><br>
                <span onclick="deleteTransaction(${t.id})" style="color:var(--danger); cursor:pointer; font-size:10px;">Eliminar</span></div>`;
            list.appendChild(li);
        });
    }
    const val = (currentView === "USD") ? rem / rates.USD : (currentView === "EUR") ? rem / rates.EUR : rem;
    const displayElement = document.getElementById('remaining-display');
    if (displayElement) displayElement.innerText = `${fmt(val)} ${currentView}`;
}

function renderFullHistory() {
    const body = document.getElementById('full-history-body');
    if(!body) return;
    body.innerHTML = '';
    [...transactions].reverse().forEach(t => {
        body.innerHTML += `<tr><td style="padding:12px">${new Date(t.date).toLocaleDateString()}</td><td>${t.desc}</td><td style="color:var(--danger)">-${fmt(t.valueVES)}</td><td style="color:var(--success)">${fmt(t.balanceAtMoment || 0)}</td></tr>`;
    });
}

function renderIndividualStats() {
    const container = document.getElementById('stats-individual-list');
    if (!container) return;
    container.innerHTML = '';
    let sorted = [...transactions].sort((a, b) => statsOrderAsc ? new Date(a.date) - new Date(b.date) : new Date(b.date) - new Date(a.date));
    sorted.forEach(t => {
        const card = document.createElement('div');
        card.className = 'expense-item-card';
        card.innerHTML = `<div style="display:flex; justify-content:space-between;"><div><small style="color:var(--primary)">${t.category || 'Otros'}</small><br><b>${t.desc}</b></div>
            <div style="color:var(--danger); font-weight:800;">-${fmt(t.valueVES)} BS</div></div>
            <div style="font-size:0.7rem; margin-top:10px; color:gray">📅 ${new Date(t.date).toLocaleDateString()} | Saldo: ${fmt(t.balanceAtMoment || 0)} BS</div>`;
        container.appendChild(card);
    });
}

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

function renderCategoryAnalysis() {
    const analysisContainer = document.getElementById('stats-panel');
    if (!analysisContainer || transactions.length === 0) return;
    const totals = {};
    transactions.forEach(t => { const cat = t.category || "Otros"; totals[cat] = (totals[cat] || 0) + t.valueVES; });
    const maxCat = Object.entries(totals).reduce((a, b) => a[1] > b[1] ? a : b)[0];
    analysisContainer.innerHTML = `<div class="analysis-card" style="padding:15px; background:rgba(255,255,255,0.05); border-radius:15px; margin-bottom:15px;">
        <p>Mayor gasto en: <b style="color:var(--primary)">${maxCat}</b></p>
        <button onclick="toggleCategoryDetails()" id="btn-details" class="btn-primary" style="padding:5px 10px; font-size:0.8rem;">Ver detalles por categoría</button>
        <div id="category-details-list" style="display:none; margin-top:10px;"></div></div>`;
    const detailsList = document.getElementById('category-details-list');
    Object.entries(totals).forEach(([cat, monto]) => {
        detailsList.innerHTML += `<div style="display:flex; justify-content:space-between; font-size:0.8rem; margin-bottom:5px;"><span>${cat}</span><b>${fmt(monto)} BS</b></div>`;
    });
}

// --- 9. FUNCIONES DE APOYO ---
async function deleteTransaction(id) {
    if (await showModal("Borrar", "¿Eliminar este gasto?", "🗑️", true)) {
        transactions = transactions.filter(t => t.id !== id);
        renderAll(); await syncToCloud();
    }
}

function toggleCategoryDetails() {
    const list = document.getElementById('category-details-list');
    list.style.display = list.style.display === 'none' ? 'block' : 'none';
}

function togglePasswordVisibility(inputId, iconId) {
    const passInput = document.getElementById(inputId);
    const iconSpan = document.getElementById(iconId);
    if (!passInput || !iconSpan) return;
    if (passInput.type === "password") {
        passInput.type = "text";
        iconSpan.innerText = "🔒"; 
    } else {
        passInput.type = "password";
        iconSpan.innerText = "👁️"; 
    }
}

function checkPassStrength() {
    const passInput = document.getElementById('reg-password-input');
    const bar = document.getElementById('pass-strength-bar');
    const text = document.getElementById('pass-text');
    if (!passInput || !bar || !text) return; 
    const pass = passInput.value;
    let strength = 0;
    if (pass.length >= 8) strength += 25;
    if (/[A-Z]/.test(pass)) strength += 25;
    if (/[0-9]/.test(pass)) strength += 25;
    if (/[^A-Za-z0-9]/.test(pass)) strength += 25;
    bar.style.width = strength + "%";
    if (strength <= 25) { bar.style.backgroundColor = "#ff4d4d"; text.innerText = "Débil"; }
    else if (strength <= 75) { bar.style.backgroundColor = "#ffd11a"; text.innerText = "Media"; }
    else { bar.style.backgroundColor = "#00cc44"; text.innerText = "Fuerte"; }
}

function changeView(iso) { 
    currentView = iso; 
    document.querySelectorAll('.btn-currency').forEach(btn => {
        btn.classList.remove('active');
        if(btn.innerText === iso || (btn.innerText === 'BS' && iso === 'VES')) {
            btn.classList.add('active');
        }
    });
    renderAll(); 
}

function toggleAuth(isReg) {
    document.getElementById('login-form-container').style.display = isReg ? 'none' : 'block';
    document.getElementById('register-form-container').style.display = isReg ? 'block' : 'none';
    document.getElementById('auth-title').innerText = isReg ? 'Crear Cuenta' : 'Iniciar Sesión';
}

function updateChartFilter(f) { 
    currentChartFilter = f; 
    document.getElementById('btn-7days').classList.toggle('active', f === '7days');
    document.getElementById('btn-month').classList.toggle('active', f === 'month');
    renderChart(); 
}

function toggleStatsOrder() { statsOrderAsc = !statsOrderAsc; renderIndividualStats(); }

function showTutorial() {
    const tutorial = document.getElementById('tutorial-modal');
    if (tutorial) {
        tutorial.style.display = 'flex';
        const sidebar = document.getElementById('sidebar');
        if (sidebar && sidebar.classList.contains('active')) toggleMenu();
    }
}

function closeTutorial() {
    const tutorial = document.getElementById('tutorial-modal');
    if (tutorial) tutorial.style.display = 'none';
}
function toggleAuthScreens(screen) {
    const loginForm = document.getElementById('login-form-container');
    const registerForm = document.getElementById('register-form-container');
    
    if (screen === 'register') {
        loginForm.style.display = 'none';
        registerForm.style.display = 'block';
    } else {
        loginForm.style.display = 'block';
        registerForm.style.display = 'none';
    }
}

// 2. FUNCIÓN PARA VER/OCULTAR CONTRASEÑA
function togglePassword() {
    // Intentamos obtener ambos inputs (login y registro)
    const passLogin = document.getElementById('login-pass');
    const passReg = document.getElementById('register-pass');
    
    // Si existe el de login, cambiamos su tipo
    if (passLogin) {
        passLogin.type = passLogin.type === 'password' ? 'text' : 'password';
    }
    
    // Si existe el de registro, también
    if (passReg) {
        passReg.type = passReg.type === 'password' ? 'text' : 'password';
    }
}

window.addEventListener('DOMContentLoaded', () => {
    const session = localStorage.getItem('milCuentas_session');
    
    if (session) {
        currentUser = JSON.parse(session);
        // Pequeño delay de 50ms para asegurar que el DOM esté listo para recibir estilos
        setTimeout(() => {
            entrarALaApp();
        }, 50);
    } else {
        // Si no hay sesión, nos aseguramos de ver solo el login
        const loginScreen = document.getElementById('login-screen');
        if (loginScreen) loginScreen.style.display = 'flex';
    }
});












































