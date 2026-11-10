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

const sectores = ["Norte", "Sur", "Este", "Oeste"]
const estados = ["pendiente", "en-curso", "resuelto"]
// Clase de error para evitar escribir "err.status = 404", etc
class ErrorUniversal extends Error {
  constructor(message, status) {
    super(message);
    this.status = status
  }
}
// Middleware para comprobar campos
const verificarCampos = (req, res, next)=> { 
  const titulo = req.body.titulo
  const sector = req.body.sector
  const prioridad = Number(req.body.prioridad)
  if (!titulo || !sector || !prioridad) {
    throw new ErrorUniversal("Todos los campos son obligatorios", 400)
  }
  if (typeof titulo != "string" || titulo.trim().length < 3 || titulo.trim().length > 80) {
    throw new ErrorUniversal("Titulo debe ser un string de 3 a 80 caracteres", 422)
  }
  const sectorBuscado = sectores.filter(s => s.toLocaleLowerCase() === sector.toLowerCase())
  if (sectorBuscado.length === 0) {
    throw new ErrorUniversal("Sector no encontrado", 404)
  }
  if (!(Number.isFinite(prioridad) || prioridad < 1 || prioridad > 5)) {
    throw new ErrorUniversal("Prioridad debe ser un numero entre 1 y 5", 422)
  }
  next()
}
///PARTE 1: Gestion de indicentes//
// Consultar indicente
app.get("/incidentes/:id", (req, res) => {
  const id = Number(req.params.id)
  if (isNaN(id) || !Number.isInteger(id)) {
    throw new ErrorUniversal("El ID debe ser un número entero válido.", 400)
  }
  const incidente = incidentes.find(i => i.id === id)
  if (!incidente) {
    throw new ErrorUniversal("El indicente no existe", 404)
  }
  // Generamos el ETag actual
  const etag = () => `"v${incidente.version}"`;
  res.set("ETag", etag());
  res.status(200).json({ 
    incidente: incidente,
    etag: etag()
  })
})
// Registrar un incidente
app.post("/incidentes", verificarCampos,(req, res) => {
  const titulo = req.body.titulo
  const sector = req.body.sector
  const prioridad = Number(req.body.prioridad)
  const incidente = {
    id: sectores.length + 1,
    titulo: titulo,
    sector: sector,
    prioridad: prioridad,
    estado: "pendiente",
    version: 1
  }
  res.status(201).json(incidente)
})
// Modificar incidente
app.put("/incidentes/:id",verificarCampos, (req, res) => {
  const condicion = req.get("If-Match");
  // No envió una versión
  if (!condicion) {
    return res.status(428).json({
      error: "Debés enviar If-Match"
    });
  }
  const id = Number(req.params.id)
  const nuevoEstado = req.body.estado;
  if (isNaN(id) || !Number.isInteger(id)) {
    throw new ErrorUniversal("El ID debe ser un número entero válido.", 400)
  }
  const incidente = incidentes.find(i => i.id === id)
  let version = incidente.version
  // Generamos el ETag actual
  const etag = () => `"v${version}"`;
    // La versión no coincide
  if (condicion !== etag()) {
    return res.status(412).json({
      error: "El recurso fue modificado",
      versionActual: etag()
    });
  }
  if (!incidente) {
    throw new ErrorUniversal("El incidente no existe", 404)
  }
  if(!(estados.some(e=> e.estado === nuevoEstado))) { 
    throw new ErrorUniversal("Estado no permitido", 442)
  }
  res.set("ETag", etag());
  version++; 
  const incidenteModificado = {
    ...incidente,
    ...req.body,
    estado: nuevoEstado,
    version: version
  };
  const index = incidentes.findIndex(i => i.id === id);
  incidentes[index] = incidenteModificado;
  return res.status(200).json(incidenteModificado);
})
const operaciones = new Map();
const verificarClave = (req, res, next)=> { 
  const IdempotencyKey = req.get("Idempotency-Key")
    if(!IdempotencyKey) { 
    throw new ErrorUniversal("Debe incluir Idempotency-Key", 400)
  }
}
function crearDespacho(clave, incidenteId, dron) {
  const despachoExistente =operaciones.get(clave)
  if(despachoExistente) { 
    if(incidenteId === despachoExistente.incidenteId) { 
     return {
      status: 201, 
      despacho: despachoExistente
     }
    }
    return {
    status: 409,
    mensaje: "El dron proporcionado es diferente"
  };
  }
  if (operaciones.has(clave)) {
    return operaciones.get(clave);
  }
   
  const despacho = {
    incidenteId: incidenteId, 
    dron: dron,
    id: despachos.length + 1, 
    estado: "Despachado"
  };

  operaciones.set(clave, despacho);
  despachos.push(despacho);

  return despacho;
}
function verificarClave(req, res, next) {
  const key = req.get("Idempotency-Key");

  if (!key) {
    return res.status(400).json({
      error: "Falta Idempotency-Key"
    });
  }

  res.locals.key = key;
  next();
}
// registrar despacho
app.post("/despacho",verificarClave, (req, res)=> { 
  const incidenteId = Number(req.body.incidenteId)
  const key = res.locals.key
  const dron = req.body.dron
  if(!Number.isInteger(incidenteId) || incidenteId <= 0) { 
    throw new ErrorUniversal("El id debe ser un entero positivo", 400)
  }
  const incidente = incidentes.find(i=> i.id === incidenteId)
  if(!incidente) { 
     throw new ErrorUniversal("El incidente no existe", 404)
  }
  if(typeof dron != "string" || dron.length < 1) { 
     throw new ErrorUniversal("Dron debe ser texto no vacio", 400)
  }
  if(incidente.estado === "resuelto") {
    throw new ErrorUniversal("El incidente no puede estar resuelto", 400)
   }
   const despacho = crearDespacho(key, incidenteId, dron)
   res.status(201).json(despacho)
})

// handler error para centralizar errores
app.use((err, req, res, next) => {
  const status = err.status || 500
  const title = status === 500 ? "Error interno del servidor" : err.message
  res.status(status).json({
    title: title,
    status: status
  })
})
app.listen(PORT, () => {
  console.log(`ARGOS operativo en http://localhost:${PORT}`);
});