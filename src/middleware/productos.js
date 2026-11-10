import express from "express"

const productos = [
  { id: 1, nombre: "Teclado", precio: 12000, stock: 5 },
  { id: 2, nombre: "Mouse", precio: 8000, stock: 0 },
  { id: 3, nombre: "Monitor", precio: 90000, stock: 3 }
];

export const getProductos = (req, res)=> { 
    res.json(productos)
}
export const getProductosDisponbles = (req, res)=> { 
   const minStock = req.query.minStock ? Number(req.query.minStock) : 1;
   if(!Number.isSafeInteger(minStock) || minStock <= 0) { 
    return res.status(400).json({ 
        error: "Solo se permiten numeros enteros positivos"
    })
  }
  const productoDisponibles = productos.filter(p=> p.stock >= minStock)
  res.json(productoDisponibles)
}
