const express = require('express');
const path = require('path');
const fetch = require('node-fetch'); 
const https = require('https');
const cors = require('cors');
const mongoose = require('mongoose'); // Agregamos Mongoose

const app = express();
const PORT = process.env.PORT || 10000; 

// --- CONFIGURACIÓN DE MONGODB ---
// La URL la configuraremos en Render como variable de entorno
const MONGO_URI = process.env.MONGO_URI;

mongoose.connect(MONGO_URI)
    .then(() => console.log("✅ Conectado a MongoDB Atlas"))
    .catch(err => console.error("❌ Error al conectar a MongoDB:", err));

// Esquema de Usuario (Define qué guardamos)
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, lowercase: true },
    email: { type: String, required: true, unique: true, lowercase: true },
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
    } catch (e) { console.error("Error tasas"); }
}
updateExchangeRates();
setInterval(updateExchangeRates, 3600000);

// --- RUTAS DE LA API (Adaptadas a MongoDB) ---

app.post('/api/register', async (req, res) => {
    const { username, name, lastname, email, password } = req.body;
    try {
        const newUser = new User({ username, name, lastname, email, password });
        await newUser.save();
        res.json({ message: "Registro exitoso" });
    } catch (error) {
        res.status(400).json({ error: "El usuario o email ya existe." });
    }
});

app.post('/api/login', async (req, res) => {
    const { identifier, password } = req.body;
    const cleanId = identifier?.toLowerCase().trim();

    // Busca por username O por email
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
});

app.post('/api/save', async (req, res) => {
    const { username, budget, spendingLimit, transactions } = req.body;
    try {
        await User.findOneAndUpdate(
            { username: username.toLowerCase() },
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
    console.log(`🚀 Servidor con MongoDB en puerto: ${PORT}`);
});


