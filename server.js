const express = require('express');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch'); 
const https = require('https');
const cors = require('cors');

const app = express();
// Render usa el puerto 10000 por defecto, pero process.env.PORT es lo más seguro
const PORT = process.env.PORT || 10000; 

const publicPath = __dirname; 
const DB_FILE = path.join(__dirname, 'database.json');

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

app.use(cors()); 
app.use(express.json());
app.use(express.static(publicPath));

let currentRates = { "USD": 36.30, "EUR": 39.50, "VES": 1 };

// --- ACTUALIZACIÓN DE TASAS ---
async function updateExchangeRates() {
    try {
        console.log("🔄 Actualizando tasas oficiales...");
        const response = await fetch('https://ve.dolarapi.com/v1/dolares/oficial', { agent: httpsAgent });
        const data = await response.json();
        
        if (data && data.promedio) {
            currentRates.USD = data.promedio;
            currentRates.EUR = data.promedio * 1.08;
            console.log(`✅ Tasa actualizada: ${currentRates.USD} BS`);
        }
    } catch (error) {
        console.error("❌ Error en API de tasas.");
    }
}

updateExchangeRates();
setInterval(updateExchangeRates, 3600000);

// --- MANEJO DE BASE DE DATOS ---
const readDB = () => {
    try {
        if (!fs.existsSync(DB_FILE)) {
            fs.writeFileSync(DB_FILE, JSON.stringify({}));
            return {};
        }
        const data = fs.readFileSync(DB_FILE, 'utf-8');
        return data.trim() ? JSON.parse(data) : {};
    } catch (error) { return {}; }
};

const writeDB = (data) => {
    try { fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2)); } 
    catch (error) { console.error("Error al escribir:", error); }
};

// --- RUTAS DE LA API ---

app.post('/api/register', (req, res) => {
    const { username, name, lastname, email, password } = req.body;
    const db = readDB();
    const cleanUser = username.toLowerCase().trim();
    if (db[cleanUser]) return res.status(400).json({ error: "El usuario ya existe." });
    db[cleanUser] = { name, lastname, email, password, budget: 0, spendingLimit: 0, transactions: [] };
    writeDB(db);
    res.json({ message: "Registro exitoso" });
});

app.post('/api/login', (req, res) => {
    const { identifier, password } = req.body;
    const db = readDB();
    const cleanId = identifier?.toLowerCase().trim();
    const userKey = Object.keys(db).find(key => 
        key === cleanId || (db[key].email && db[key].email.toLowerCase() === cleanId)
    );
    const user = db[userKey];
    if (!user || user.password !== password) return res.status(401).json({ error: "Credenciales incorrectas." });

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
        writeDB(db);
        res.json({ status: "success" });
    } else {
        res.status(404).json({ error: "Usuario no encontrado" });
    }
});

// Ruta comodín para el frontend
app.get('*', (req, res) => { 
    res.sendFile(path.join(__dirname, 'index.html')); 
});

// --- INICIO DEL SERVIDOR CON MANEJO DE ERROR ---
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Servidor Mil Cuentas activo en puerto: ${PORT}`);
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`❌ El puerto ${PORT} está ocupado. Reintentando...`);
        setTimeout(() => {
            server.close();
            server.listen(PORT);
        }, 1000);
    } else {
        console.error("❌ Error de servidor:", err);
    }
});
