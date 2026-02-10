const express = require('express');
const path = require('path');
const fetch = require('node-fetch'); 
const https = require('https');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 10000; 

// --- 1. CONFIGURACIÓN DE MIDDLEWARES ---
// Colocamos CORS al principio para que todas las rutas tengan permiso
app.use(cors({
    origin: '*', // Permite que cualquier sitio (como tu frontend en Render) se conecte
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type']
}));

app.use(express.json());
app.use(express.static(__dirname));

// --- 2. CONEXIÓN A MONGO CON MANEJO DE ERRORES ---
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
    console.error("❌ ERROR: La variable MONGO_URI no está configurada en Render.");
} else {
    mongoose.connect(MONGO_URI)
        .then(() => console.log("✅ Conexión exitosa a MongoDB Atlas"))
        .catch(err => console.error("❌ Error de conexión a MongoDB:", err));
}

// Esquema de Usuario
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    name: { type: String, default: "" },
    lastname: { type: String, default: "" },
    budget: { type: Number, default: 0 },
    spendingLimit: { type: Number, default: 0 },
    transactions: { type: Array, default: [] }
});

const User = mongoose.model('User', userSchema);

// --- 3. TASAS DE CAMBIO ---
const httpsAgent = new https.Agent({ rejectUnauthorized: false });
let currentRates = { "USD": 36.30, "EUR": 39.50, "VES": 1 };

async function updateExchangeRates() {
    try {
        const response = await fetch('https://ve.dolarapi.com/v1/dolares/oficial', { agent: httpsAgent });
        const data = await response.json();
        if (data && data.promedio) {
            currentRates.USD = data.promedio;
            currentRates.EUR = data.promedio * 1.08;
            console.log(`✅ Tasas actualizadas: ${currentRates.USD} BS`);
        }
    } catch (e) { 
        console.error("⚠️ Error al obtener tasas, usando valores previos."); 
    }
}
updateExchangeRates();
setInterval(updateExchangeRates, 3600000); // Actualiza cada hora

// --- 4. RUTAS DE LA API ---

// Registro de usuarios
app.post('/api/register', async (req, res) => {
    try {
        const { username, name, lastname, email, password } = req.body;
        
        if(!username || !email || !password) {
            return res.status(400).json({ error: "Faltan campos obligatorios" });
        }

        const newUser = new User({ 
            username: username.toLowerCase().trim(), 
            name, 
            lastname, 
            email: email.toLowerCase().trim(), 
            password 
        });

        await newUser.save();
        res.json({ message: "Registro exitoso" });
    } catch (error) {
        console.error("Error en registro:", error);
        res.status(400).json({ error: "El usuario o email ya está registrado." });
    }
});

// Inicio de sesión
app.post('/api/login', async (req, res) => {
    try {
        const { identifier, password } = req.body;
        if(!identifier || !password) return res.status(400).json({ error: "Datos incompletos" });

        const cleanId = identifier.toLowerCase().trim();
        const user = await User.findOne({
            $or: [{ username: cleanId }, { email: cleanId }]
        });

        if (!user || user.password !== password) {
            return res.status(401).json({ error: "Usuario o contraseña incorrectos." });
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
        res.status(500).json({ error: "Error interno del servidor" });
    }
});

// Guardar datos (Sincronización)
app.post('/api/save', async (req, res) => {
    try {
        const { username, budget, spendingLimit, transactions } = req.body;
        if(!username) return res.status(400).json({ error: "Sesión inválida" });
        
        await User.findOneAndUpdate(
            { username: username.toLowerCase().trim() },
            { budget, spendingLimit, transactions }
        );
        res.json({ status: "success" });
    } catch (error) {
        res.status(500).json({ error: "No se pudieron guardar los datos." });
    }
});

// Servir el frontend para cualquier otra ruta
app.get('*', (req, res) => { 
    res.sendFile(path.join(__dirname, 'index.html')); 
});

// Iniciar servidor
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor corriendo en el puerto ${PORT}`);
});



