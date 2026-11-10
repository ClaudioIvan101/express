// ARGOS: Sistema de rescate con drones autónomos
import express from "express";

const app = express();
const PORT = 3000;

app.use(express.json());

const incidentes = [
  { id: 1, titulo: "Avalancha", sector: "Norte", prioridad: 5, estado: "pendiente", version: 1 },
  { id: 2, titulo: "Escalador perdido", sector: "Sur", prioridad: 4, estado: "pendiente", version: 1 },
  { id: 3, titulo: "Dron averiado", sector: "Este", prioridad: 2, estado: "resuelto", version: 1 },
  { id: 4, titulo: "Tormenta eléctrica", sector: "Oeste", prioridad: 5, estado: "en-curso", version: 1 },
  { id: 5, titulo: "Refugio aislado", sector: "Norte", prioridad: 3, estado: "pendiente", version: 1 },
  { id: 6, titulo: "Señal de auxilio", sector: "Sur", prioridad: 5, estado: "pendiente", version: 1 },
  { id: 7, titulo: "Puente colapsado", sector: "Este", prioridad: 4, estado: "en-curso", version: 1 },
  { id: 8, titulo: "Senderista herido", sector: "Oeste", prioridad: 3, estado: "resuelto", version: 1 },
  { id: 9, titulo: "Vehículo atrapado", sector: "Norte", prioridad: 4, estado: "pendiente", version: 1 }
];

const despachos = [];
const sectores = ["Norte", "Sur", "Este", "Oeste"];
const estados = ["pendiente", "en-curso", "resuelto"];

// Clase de error personalizada
class ErrorUniversal extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

// Middleware para comprobar campos obligatorios en incidentes
const verificarCampos = (req, res, next) => {
  const { titulo, sector } = req.body;
  const prioridad = Number(req.body.prioridad);

  if (!titulo || !sector || req.body.prioridad === undefined) {
    return next(new ErrorUniversal("Todos los campos son obligatorios", 400));
  }
  if (typeof titulo !== "string" || titulo.trim().length < 3 || titulo.trim().length > 80) {
    return next(new ErrorUniversal("Título debe ser un string de 3 a 80 caracteres", 422));
  }
  
  const sectorEncontrado = sectores.some(s => s.toLowerCase() === sector.toLowerCase());
  if (!sectorEncontrado) {
    return next(new ErrorUniversal("Sector no encontrado", 404));
  }

  if (!Number.isFinite(prioridad) || prioridad < 1 || prioridad > 5) {
    return next(new ErrorUniversal("Prioridad debe ser un número entre 1 y 5", 422));
  }

  next();
};

/// PARTE 1: Gestión de incidentes

// Consultar incidente por ID
app.get("/incidentes/:id", (req, res, next) => {
  const id = Number(req.params.id);
  if (isNaN(id) || !Number.isInteger(id)) {
    return next(new ErrorUniversal("El ID debe ser un número entero válido.", 400));
  }
  
  const incidente = incidentes.find(i => i.id === id);
  if (!incidente) {
    return next(new ErrorUniversal("El incidente no existe", 404));
  }

  const etag = `"v${incidente.version}"`;
  res.set("ETag", etag);
  res.status(200).json({ 
    incidente,
    etag 
  });
});

// Registrar un incidente
app.post("/incidentes", verificarCampos, (req, res) => {
  const { titulo, sector } = req.body;
  const prioridad = Number(req.body.prioridad);

  const nuevoId = incidentes.length > 0 ? Math.max(...incidentes.map(i => i.id)) + 1 : 1;

  const incidente = {
    id: nuevoId,
    titulo: titulo.trim(),
    sector,
    prioridad,
    estado: "pendiente",
    version: 1
  };

  incidentes.push(incidente);
  res.status(201).json(incidente);
});

// Modificar incidente (Concurrencia Optimista con ETag / If-Match)
app.put("/incidentes/:id", verificarCampos, (req, res, next) => {
  const condicion = req.get("If-Match");
  if (!condicion) {
    return res.status(428).json({ error: "Debés enviar el header If-Match" });
  }

  const id = Number(req.params.id);
  if (isNaN(id) || !Number.isInteger(id)) {
    return next(new ErrorUniversal("El ID debe ser un número entero válido.", 400));
  }

  const incidente = incidentes.find(i => i.id === id);
  if (!incidente) {
    return next(new ErrorUniversal("El incidente no existe", 404));
  }

  const etagActual = `"v${incidente.version}"`;
  if (condicion !== etagActual) {
    return res.status(412).json({
      error: "El recurso fue modificado por otro usuario",
      versionActual: etagActual
    });
  }

  const nuevoEstado = req.body.estado || incidente.estado;
  if (!estados.includes(nuevoEstado)) {
    return next(new ErrorUniversal("Estado no permitido", 422));
  }

  const index = incidentes.findIndex(i => i.id === id);
  
  const incidenteModificado = {
    ...incidente,
    ...req.body,
    estado: nuevoEstado,
    version: incidente.version + 1
  };

  incidentes[index] = incidenteModificado;
  
  res.set("ETag", `"v${incidenteModificado.version}"`);
  return res.status(200).json(incidenteModificado);
});

/// PARTE 2: Gestión de Despachos e Idempotencia
const operaciones = new Map();

function procesarDespacho(clave, incidenteId, dron) {
  const despachoExistente = operaciones.get(clave);
  
  if (despachoExistente) {
    if (incidenteId === despachoExistente.incidenteId && dron === despachoExistente.dron) {
      return { status: 200, data: despachoExistente };
    }
    return { status: 409, data: { error: "La clave de idempotencia ya fue usada con parámetros diferentes." } };
  }
   
  const despacho = {
    id: despachos.length + 1,
    incidenteId, 
    dron, 
    estado: "Despachado"
  };

  operaciones.set(clave, despacho);
  despachos.push(despacho);

  return { status: 201, data: despacho };
}

function verificarClave(req, res, next) {
  const key = req.get("Idempotency-Key");
  if (!key) {
    return next(new ErrorUniversal("Falta Idempotency-Key en los headers", 400));
  }
  res.locals.key = key;
  next();
}

// Registrar despacho
app.post("/despacho", verificarClave, (req, res, next) => {
  const incidenteId = Number(req.body.incidenteId);
  const key = res.locals.key;
  const dron = req.body.dron;

  if (!Number.isInteger(incidenteId) || incidenteId <= 0) {
    return next(new ErrorUniversal("El id del incidente debe ser un entero positivo", 400));
  }

  const incidente = incidentes.find(i => i.id === incidenteId);
  if (!incidente) {
    return next(new ErrorUniversal("El incidente no existe", 404));
  }

  if (typeof dron !== "string" || dron.trim().length === 0) {
    return next(new ErrorUniversal("Dron debe ser un texto no vacío", 400));
  }

  if (incidente.estado === "resuelto") {
    return next(new ErrorUniversal("El incidente no puede estar resuelto para recibir un despacho", 400));
  }

  const resultado = procesarDespacho(key, incidenteId, dron.trim());
  return res.status(resultado.status).json(resultado.data);
});

// Middleware centralizado de manejo de errores
app.use((err, req, res, next) => {
  const status = err.status || 500;
  const title = status === 500 ? "Error interno del servidor" : err.message;
  res.status(status).json({
    title: title,
    status: status
  });
});

app.listen(PORT, () => {
  console.log(`ARGOS operativo en http://localhost:${PORT}`);
});