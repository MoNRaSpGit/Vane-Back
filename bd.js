const mysql = require('mysql2');

const pool = mysql.createPool({
  host: 'bssaegbqrmyecdjjygj5-mysql.services.clever-cloud.com',
  user: 'uahl3tt3sjtuispa',
  password: '5UTpIqN5oQMZpRIxOFGm',
  database: 'bssaegbqrmyecdjjygj5',
  port: 3306,
  waitForConnections: true,   // Espera a que haya conexiones disponibles
  connectionLimit: 10,        // Número máximo de conexiones en el pool
  queueLimit: 0               // Sin límite para la cola de conexiones en espera
});

// Prueba la conexión para verificar si es exitosa
pool.getConnection((err, connection) => {
  if (err) {
    console.error('Error al conectar al pool de la base de datos:', err.message);
  } else {
    console.log('Conexión exitosa al pool de la base de datos.');
    connection.release(); // Libera la conexión de vuelta al pool
  }
});

// Exporta el pool en lugar de una conexión única
module.exports = pool;
