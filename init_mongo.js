// Sembrado inicial de catálogo en MongoDB
db = db.getSiblingDB('properties_catalog_db');

db.properties.deleteMany({});

db.properties.insertMany([
  {
    _id: "DEP-VALLE-101",
    code: "DEP-VALLE-101",
    title: "Penthouse de Lujo con Terraza Panorámica",
    propertyType: "DEPARTAMENTO",
    city: "La Paz",
    zone: "Zona Sur - Calacoto",
    price: 245000,
    deposit: 5000,
    rooms: 3,
    bathrooms: 3,
    areaSquareMeters: 185.5,
    parkingSlots: 2,
    status: "DISPONIBLE",
    photos: ["https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=800&q=80"],
    location: { type: "Point", coordinates: [-68.0892, -16.5398] },
    amenities: ["Piscina Climatizada", "Sauna", "Seguridad 24/7"]
  },
  {
    _id: "CAS-URB-202",
    code: "CAS-URB-202",
    title: "Casa Campestre Estilo Mediterráneo",
    propertyType: "CASA",
    city: "Santa Cruz",
    zone: "Equipetrol Norte",
    price: 380000,
    deposit: 10000,
    rooms: 4,
    bathrooms: 5,
    areaSquareMeters: 420.0,
    parkingSlots: 3,
    status: "DISPONIBLE",
    photos: ["https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=800&q=80"],
    location: { type: "Point", coordinates: [-63.1821, -17.7689] },
    amenities: ["Jardín Privado", "Parrillero", "Club House"]
  },
  {
    _id: "TER-IND-303",
    code: "TER-IND-303",
    title: "Terreno Comercial e Industrial Z4",
    propertyType: "TERRENO",
    city: "Cochabamba",
    zone: "Parque Industrial",
    price: 520000,
    deposit: 15000,
    rooms: 0,
    bathrooms: 0,
    areaSquareMeters: 1250.0,
    parkingSlots: 10,
    status: "DISPONIBLE",
    photos: ["https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=800&q=80"],
    location: { type: "Point", coordinates: [-66.1568, -17.3895] },
    amenities: ["Zonificación Z4", "Red de Gas", "Transformador Trifásico"]
  }
]);

print("Catálogo de MongoDB inicializado con éxito.");
