import express from "express"
import { getProductos, getProductosDisponbles  } from "../middleware/productos.js"
const router = express.Router()

router.get("/", getProductos)
router.get("/disponibles", getProductosDisponbles)
export default router