const express = require('express');
const app = express();
const pool = require('./bd'); // Importa el pool en lugar de la conexión
const PORT = process.env.PORT || 5000;
const cors = require('cors'); // Importa el paquete cors

app.use(cors()); // Habilita CORS para todas las solicitudes
app.use(express.json());

// Ruta de prueba para verificar la conexión con la base de datos
app.get('/test-db', (req, res) => {
  pool.query('SELECT 1 + 1 AS solution', (error, results) => {
    if (error) {
      res.status(500).send('Error en la consulta');
    } else {
      res.send(`La solución es: ${results[0].solution}`);
    }
  });
});

app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});



// Ruta para obtener formularios filtrados
app.get('/api/getFormulariosFiltrados', (req, res) => {
  const { nombre_empresa, fecha } = req.query;

  // Consulta para obtener el ID de la empresa
  const queryEmpresaId = `SELECT id FROM empresas WHERE nombre_empresa = ?`;
  const queryFormularios = `
    SELECT fc.id, fc.empresa_id, fc.fecha_completado, fc.datos_formulario, 
           fs.tipo_formulario_id, fs.datos_subformulario, e.nombre_empresa
    FROM formularios_completados AS fc
    LEFT JOIN formularios_sub AS fs ON fc.id = fs.formulario_principal_id
    LEFT JOIN empresas AS e ON fc.empresa_id = e.id
    WHERE fc.empresa_id = ? AND JSON_UNQUOTE(JSON_EXTRACT(fc.datos_formulario, '$.encabezado.fecha')) = ?`;

  pool.query(queryEmpresaId, [nombre_empresa], (error, results) => {
    if (error) {
      console.error('Error al obtener el ID de la empresa:', error.message);
      return res.status(500).json({ error: `Error al obtener el ID de la empresa: ${error.message}` });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: 'Empresa no encontrada' });
    }

    const empresaId = results[0].id;
    pool.query(queryFormularios, [empresaId, fecha], (error, formulariosResults) => {
      if (error) {
        console.error('Error al obtener los formularios:', error.message);
        return res.status(500).json({ error: `Error al obtener los formularios: ${error.message}` });
      }

      const formularios = {};
      formulariosResults.forEach(row => {
        if (!formularios[row.id]) {
          formularios[row.id] = {
            formularioPrincipal: {
              id: row.id,
              empresa_id: row.empresa_id,
              nombre_empresa: row.nombre_empresa, // Añadimos el nombre de la empresa
              fecha_completado: row.fecha_completado,
              datos_formulario: typeof row.datos_formulario === 'string' ? JSON.parse(row.datos_formulario) : row.datos_formulario,
            },
            subformularios: {},
          };
        }
        if (row.tipo_formulario_id) {
          formularios[row.id].subformularios[row.tipo_formulario_id] = typeof row.datos_subformulario === 'string' ? JSON.parse(row.datos_subformulario) : row.datos_subformulario;
        }
      });

      res.status(200).json({ formularios: Object.values(formularios) });
    });
  });
});





// Endpoint para obtener el formulario principal junto con sus subformularios
app.get('/api/getFormularioCompleto/:id', (req, res) => {
  const formularioPrincipalId = req.params.id;

  const queryPrincipal = `
    SELECT id, empresa_id, usuario_id, tipo_formulario_id, fecha_completado, datos_formulario
    FROM formularios_completados
    WHERE id = ?;
  `;
  const querySubformularios = `
    SELECT tipo_formulario_id, datos_subformulario
    FROM formularios_sub
    WHERE formulario_principal_id = ?;
  `;

  pool.query(queryPrincipal, [formularioPrincipalId], (error, principalResults) => {
    if (error) {
      console.error('Error al obtener el formulario principal:', error.message);
      return res.status(500).json({ error: 'Error al obtener el formulario principal' });
    }

    if (principalResults.length === 0) {
      return res.status(404).json({ error: 'Formulario principal no encontrado' });
    }

    const formularioPrincipal = principalResults[0];
    pool.query(querySubformularios, [formularioPrincipalId], (error, subResults) => {
      if (error) {
        console.error('Error al obtener los subformularios:', error.message);
        return res.status(500).json({ error: 'Error al obtener los subformularios' });
      }

      const subformularios = {};
      subResults.forEach(sub => {
        subformularios[sub.tipo_formulario_id] = typeof sub.datos_subformulario === 'string' 
          ? JSON.parse(sub.datos_subformulario) 
          : sub.datos_subformulario;
      });

      res.status(200).json({
        formularioPrincipal: formularioPrincipal,
        subformularios: subformularios
      });
    });
  });
});

// Registro de usuario
app.post("/api/registrarUsuario", (req, res) => {
  const { nombre_usuario, password, rol = "empleado" } = req.body;
  const query = `INSERT INTO usuarios (nombre_usuario, password, rol) VALUES (?, ?, ?)`;
  pool.query(query, [nombre_usuario, password, rol], (error, results) => {
    if (error) {
      console.error("Error al registrar usuario en la base de datos:", error);
      return res.status(500).json({ error: "Error al registrar el usuario" });
    }
    res.status(201).json({ message: "Usuario registrado con éxito", userId: results.insertId });
  });
});

// Login de usuario
app.post("/api/login", (req, res) => {
  const { nombre_usuario, password } = req.body;
  const query = `SELECT * FROM usuarios WHERE nombre_usuario = ? AND password = ?`;
  pool.query(query, [nombre_usuario, password], (error, results) => {
    if (error) {
      console.error("Error en la consulta de login:", error);
      return res.status(500).json({ error: "Error en el proceso de login" });
    }

    if (results.length === 0) {
      return res.status(401).json({ error: "Credenciales incorrectas" });
    }

    const user = results[0];
    res.status(200).json({
      message: "Login exitoso",
      user: {
        id: user.id,
        nombre_usuario: user.nombre_usuario,
        rol: user.rol,
      },
    });
  });
});




// Endpoint para guardar el formulario principal y sus subformularios
app.post('/api/saveForm', (req, res) => {
  const { controlOperacional, botiquin, acidente, fechaEnvio } = req.body;

  // Logs iniciales para verificar el contenido del request
  console.log("Datos recibidos para guardar:", req.body);

  const empresa_id = controlOperacional?.headerData?.empresa_id || 1;
  const usuario_id = controlOperacional?.headerData?.usuario_id || 1;
  const tipo_formulario_id = controlOperacional?.headerData?.tipo_formulario_id || 1;
  const fechaCompletado = fechaEnvio ? new Date(fechaEnvio).toISOString().slice(0, 19).replace("T", " ") : null;
  const total_correctos = controlOperacional?.totals?.totalCorrectos || 0;
  const total_incorrectos = controlOperacional?.totals?.totalIncorrectos || 0;

  const datosFormularioPrincipal = JSON.stringify({
    total_correctos,
    total_incorrectos,
    observaciones: controlOperacional.headerData?.observaciones || "",
    campos: controlOperacional.formData || {},
    encabezado: {
      obra: controlOperacional.headerData?.obra || "",
      nucleo: controlOperacional.headerData?.nucleo || "",
      fecha: controlOperacional.headerData?.fecha || "",
      hora: controlOperacional.headerData?.hora || "",
    },
  });

  console.log("Datos del formulario principal preparados:", datosFormularioPrincipal);

  pool.query(
    `INSERT INTO formularios_completados (empresa_id, usuario_id, tipo_formulario_id, fecha_completado, datos_formulario, es_obligatorio) VALUES (?, ?, ?, ?, ?, 1)`,
    [empresa_id, usuario_id, tipo_formulario_id, fechaCompletado, datosFormularioPrincipal],
    (error, results) => {
      if (error) {
        console.error('Error al guardar el formulario principal:', error.message);
        return res.status(500).json({ error: 'Error al guardar el formulario principal' });
      }

      const formularioPrincipalId = results.insertId;
      console.log("ID del formulario principal guardado:", formularioPrincipalId);

      const subformulariosData = [
        { tipo_formulario_id: 2, data: botiquin.formData || {}, headerData: botiquin.headerData || {}, name: "Botiquín" },
        { tipo_formulario_id: 3, data: acidente.formData || {}, headerData: acidente.headerData || {}, name: "Accidente" },
      ];
    
      const subformulariosQueries = subformulariosData.map(sub => new Promise((resolve, reject) => {
        if (Object.keys(sub.data).length === 0) return resolve();
    
        // Incluye `headerData` en `datosSubformulario`
        const datosSubformulario = JSON.stringify({
            campos: sub.data,
            headerData: sub.headerData,
            observaciones: controlOperacional.headerData?.observaciones || ""
        });

        console.log(`Guardando subformulario ${sub.name}:`, datosSubformulario);

        pool.query(
            `INSERT INTO formularios_sub (formulario_principal_id, tipo_formulario_id, datos_subformulario) VALUES (?, ?, ?)`,
            [formularioPrincipalId, sub.tipo_formulario_id, datosSubformulario],
            (error) => {
                if (error) {
                    console.error(`Error al guardar el subformulario ${sub.name}:`, error.message);
                    return reject(`Error al guardar el subformulario ${sub.name}`);
                }
                resolve();
            }
        );
      }));
    
      Promise.all(subformulariosQueries)
        .then(() => {
          console.log('Formulario principal y subformularios guardados con éxito.');
          res.status(200).json({ message: 'Formulario principal y subformularios guardados con éxito' });
        })
        .catch(error => {
          console.error('Error al guardar los subformularios:', error);
          res.status(500).json({ error: 'Error al guardar los subformularios' });
        });
    }
  );
});



// Endpoint para obtener la lista de empresas
app.get('/api/getEmpresas', (req, res) => {
  const query = 'SELECT id, nombre_empresa FROM empresas';
  pool.query(query, (error, results) => {
    if (error) {
      console.error('Error al obtener empresas:', error.message);
      return res.status(500).json({ error: 'Error al obtener empresas' });
    }
    res.status(200).json({ empresas: results });
  });
});
