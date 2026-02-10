const express = require('express');
const path = require('path');
const fetch = require('node-fetch'); 
const https = require('https');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 10000; 

// --- 1. MEJORA DE SEGURIDAD EN LA CONEXIÓN ---
const MONGO_URI = process.env.MONGO_URI;

// Si la variable no existe, el servidor avisará específicamente qué falta
if (!MONGO_URI) {
    console.error("❌ ERROR CRÍTICO: La variable de entorno MONGO_URI no está definida.");
    console.log("Asegúrate de haberla configurado en la pestaña 'Environment' de Render.");
} else {
    mongoose.connect(MONGO_URI)
        .then(() => console.log("✅ Conectado a MongoDB Atlas"))
        .catch(err => console.error("❌ Error al conectar a MongoDB:", err));
}

// Esquema de Usuario
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    name: String,
    lastname: String,
    budget: { type: Number, default: 0 },
    spendingLimit: { type: Number, default: 0 },
    transactions: { type: Array, default: [] }
});

const User = mongoose.model('User', userSchema);

// --- MIDDLEWARES ---
app.use(cors()); 
app.use(express.json());
app.use(express.static(__dirname));

const httpsAgent = new https.Agent({ rejectUnauthorized: false });
let currentRates = { "USD": 36.30, "EUR": 39.50, "VES": 1 };

// --- ACTUALIZACIÓN DE TASAS ---
async function updateExchangeRates() {
    try {
        const response = await fetch('https://ve.dolarapi.com/v1/dolares/oficial', { agent: httpsAgent });
        const data = await response.json();
        if (data && data.promedio) {
            currentRates.USD = data.promedio;
            currentRates.EUR = data.promedio * 1.08;
            console.log(`✅ Tasas al día: ${currentRates.USD} BS`);
        }
    } catch (e) { 
        console.error("⚠️ No se pudieron obtener las tasas, usando valores por defecto."); 
    }
}
updateExchangeRates();
setInterval(updateExchangeRates, 3600000);

// --- RUTAS DE LA API ---

app.post('/api/register', async (req, res) => {
    const { username, name, lastname, email, password } = req.body;
    try {
        // Validar que los campos no lleguen vacíos
        if(!username || !email || !password) {
            return res.status(400).json({ error: "Faltan campos obligatorios" });
        }
        const newUser = new User({ username, name, lastname, email, password });
        await newUser.save();
        res.json({ message: "Registro exitoso" });
    } catch (error) {
        res.status(400).json({ error: "El usuario o email ya existe." });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { identifier, password } = req.body;
        if(!identifier || !password) return res.status(400).json({ error: "Datos incompletos" });

        const cleanId = identifier.toLowerCase().trim();
        const user = await User.findOne({
            $or: [{ username: cleanId }, { email: cleanId }]
        });

        if (!user || user.password !== password) {
            return res.status(401).json({ error: "Credenciales incorrectas." });
        }

        res.json({ 
            username: user.username,
            name: user.name,
            lastname: user.lastname,
            budget: user.budget,
            spendingLimit: user.spendingLimit,
            transactions: user.transactions,
            rates: currentRates 
        });
    } catch (e) {
        res.status(500).json({ error: "Error en el servidor" });
    }
});

app.post('/api/save', async (req, res) => {
    const { username, budget, spendingLimit, transactions } = req.body;
    try {
        if(!username) return res.status(400).json({ error: "Usuario no identificado" });
        
        await User.findOneAndUpdate(
            { username: username.toLowerCase().trim() },
            { budget, spendingLimit, transactions }
        );
        res.json({ status: "success" });
    } catch (error) {
        res.status(500).json({ error: "Error al guardar datos." });
    }
});

app.get('*', (req, res) => { 
    res.sendFile(path.join(__dirname, 'index.html')); 
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor activo en puerto: ${PORT}`);
});



