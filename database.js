const mongoose = require('mongoose');

// Usamos el formato de conexión estándar (sin +srv) que evita errores de DNS
const url = 'mongodb://Reymilan:Reym1lan12@cluster0-shard-00-00.5mblulb.mongodb.net:27017,cluster0-shard-00-01.5mblulb.mongodb.net:27017,cluster0-shard-00-02.5mblulb.mongodb.net:27017/mil_cuentas?ssl=true&replicaSet=atlas-5mblulb-shard-0&authSource=admin&retryWrites=true&w=majority';

mongoose.connect(url)
  .then(() => {
    console.log("✅ Conexión exitosa a MongoDB Atlas (Modo Estándar)");
  })
  .catch((error) => {
    console.error("❌ Error conectando a la base de datos:", error);
  });

module.exports = mongoose;
