const express = require('express');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch'); 
const https = require('https');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 10000; 

const publicPath = __dirname; 
// NOTA: /tmp es temporal en Render. Para persistencia real a largo plazo, 
// considera usar una base de datos como MongoDB más adelante.
const DB_FILE = path.join('/tmp', 'database.json'); 

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

// --- MIDDLEWARES ---
app.use(cors()); 
app.use(express.json({ limit: '1mb' })); // Protección contra payloads gigantes
app.use(express.static(publicPath));

// Tasas por defecto por si falla la API
let currentRates = { "USD": 36.30, "EUR": 39.50, "VES": 1 };

// --- ACTUALIZACIÓN DE TASAS (Optimizado) ---
async function updateExchangeRates() {
    try {
        const response = await fetch('https://ve.dolarapi.com/v1/dolares/oficial', { 
            agent: httpsAgent,
            timeout: 5000 // Si la API de tasas tarda mucho, cancelamos
        });
        const data = await response.json();
        if (data && data.promedio) {
            currentRates.USD = data.promedio;
            currentRates.EUR = data.promedio * 1.08; // Estimado basado en mercado
            console.log(`✅ Tasas actualizadas: USD: ${currentRates.USD} | EUR: ${currentRates.EUR.toFixed(2)}`);
        }
    } catch (error) {
        console.error("⚠️ No se pudo actualizar las tasas, usando valores previos.");
    }
}

// Ejecutar al inicio y cada hora
updateExchangeRates();
setInterval(updateExchangeRates, 3600000);

// --- MANEJO DE BASE DE DATOS (Más seguro) ---
const readDB = () => {
    try {
        if (!fs.existsSync(DB_FILE)) {
            fs.writeFileSync(DB_FILE, JSON.stringify({}), 'utf8');
            return {};
        }
        const data = fs.readFileSync(DB_FILE, 'utf-8');
        return data.trim() ? JSON.parse(data) : {};
    } catch (error) { 
        console.error("❌ Error leyendo DB:", error);
        return {}; 
    }
};

const writeDB = (data) => {
    try { 
        // Escribimos de forma asíncrona para no bloquear el servidor
        fs.writeFile(DB_FILE, JSON.stringify(data, null, 2), (err) => {
            if (err) console.error("❌ ERROR AL ESCRIBIR DB:", err);
        });
    } catch (error) { 
        console.error("❌ ERROR CRÍTICO EN ESCRITURA:", error); 
    }
};

// --- RUTAS DE LA API ---

app.post('/api/register', (req, res) => {
    const { username, name, lastname, email, password } = req.body;
    
    if (!username || !password || !email) {
        return res.status(400).json({ error: "Faltan datos obligatorios." });
    }

    const db = readDB();
    const cleanUser = username.toLowerCase().trim();
    
    if (db[cleanUser]) return res.status(400).json({ error: "El usuario ya existe." });
    
    // Verificamos si el email ya está en uso
    const emailExists = Object.values(db).some(u => u.email?.toLowerCase() === email.toLowerCase());
    if (emailExists) return res.status(400).json({ error: "El correo ya está registrado." });
    
    db[cleanUser] = { 
        name, 
        lastname, 
        email: email.toLowerCase(), 
        password, 
        budget: 0, 
        spendingLimit: 0, 
        transactions: [],
        createdAt: new Date().toISOString()
    };
    
    writeDB(db);
    res.json({ message: "Registro exitoso" });
});

app.post('/api/login', (req, res) => {
    const { identifier, password } = req.body;
    if (!identifier || !password) return res.status(400).json({ error: "Faltan credenciales." });

    const db = readDB();
    const cleanId = identifier.toLowerCase().trim();
    
    const userKey = Object.keys(db).find(key => 
        key === cleanId || (db[key].email && db[key].email.toLowerCase() === cleanId)
    );
    
    const user = db[userKey];
    
    if (!user || user.password !== password) {
        return res.status(401).json({ error: "Usuario o contraseña incorrectos." });
    }

    // Enviamos solo lo necesario, incluyendo las tasas frescas
    res.json({ 
        username: userKey,
        name: user.name,
        lastname: user.lastname,
        budget: user.budget,
        spendingLimit: user.spendingLimit || 0,
        transactions: user.transactions,
        rates: currentRates 
    });
});

app.post('/api/save', (req, res) => {
    const { username, budget, spendingLimit, transactions } = req.body;
    const db = readDB();
    const cleanUser = username?.toLowerCase().trim();

    if (db[cleanUser]) {
        db[cleanUser].budget = budget;
        db[cleanUser].spendingLimit = spendingLimit;
        db[cleanUser].transactions = transactions;
        db[cleanUser].lastUpdate = new Date().toISOString();
        
        writeDB(db);
        res.json({ status: "success", message: "Sincronizado correctamente" });
    } else {
        res.status(404).json({ error: "Usuario no encontrado" });
    }
});

// Ruta para verificar estado del servidor (útil para Render)
app.get('/health', (req, res) => res.send('OK'));

app.get('*', (req, res) => { 
    res.sendFile(path.join(__dirname, 'index.html')); 
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor Mil Cuentas activo en puerto: ${PORT}`);
});

const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Servidor activo en puerto: ${PORT}`);
});


