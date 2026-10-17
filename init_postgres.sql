-- Habitat Pro: Base de Datos Relacional PostgreSQL (contracts_db)
-- Inicialización de Esquema para Usuarios, Contratos, Reservas, Inmuebles y Pagos

CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(50) PRIMARY KEY,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(100) NOT NULL,
    role VARCHAR(50) NOT NULL,
    initials VARCHAR(10),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS properties (
    id VARCHAR(50) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    property_type VARCHAR(50) NOT NULL,
    city VARCHAR(100) NOT NULL,
    zone VARCHAR(100) NOT NULL,
    price NUMERIC(14, 2) NOT NULL,
    deposit NUMERIC(14, 2) NOT NULL,
    rooms INT DEFAULT 0,
    baths INT DEFAULT 0,
    area NUMERIC(10, 2) NOT NULL,
    parking INT DEFAULT 0,
    status VARCHAR(50) NOT NULL DEFAULT 'DISPONIBLE',
    image TEXT NOT NULL,
    reserved_by_user_id VARCHAR(50),
    reserved_by_name VARCHAR(100),
    reservation_expires_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reservations (
    id VARCHAR(50) PRIMARY KEY,
    property_id VARCHAR(50) REFERENCES properties(id),
    user_id VARCHAR(50) REFERENCES users(id),
    user_name VARCHAR(100) NOT NULL,
    deposit_amount NUMERIC(14, 2) NOT NULL,
    payment_id VARCHAR(50) NOT NULL,
    contract_number VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVA',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS contracts (
    id VARCHAR(50) PRIMARY KEY,
    property_id VARCHAR(50) REFERENCES properties(id),
    property_title VARCHAR(255) NOT NULL,
    user_id VARCHAR(50) REFERENCES users(id),
    user_name VARCHAR(100) NOT NULL,
    contract_type VARCHAR(50) NOT NULL,
    total_amount NUMERIC(14, 2) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'BORRADOR',
    signed_by TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS payments (
    id VARCHAR(50) PRIMARY KEY,
    concept VARCHAR(255) NOT NULL,
    property_id VARCHAR(50),
    user_id VARCHAR(50) REFERENCES users(id),
    amount NUMERIC(14, 2) NOT NULL,
    method VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'COMPLETED',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sembrado de Usuarios Iniciales
INSERT INTO users (id, email, password_hash, name, role, initials) VALUES
('CLI-JUAN-COMPRADOR', 'juan.comprador@habitat.pro', 'pass123', 'Juan Comprador', 'CLIENTE', 'JC'),
('AGT-CARLOS-BROKER', 'carlos.broker@habitat.pro', 'pass123', 'Carlos Broker', 'AGENTE', 'CB'),
('NOT-ELENA-RAMOS', 'elena.ramos@habitat.pro', 'pass123', 'Dra. Elena Ramos', 'LEGAL', 'ER'),
('ADM-SISTEMAS', 'admin@habitat.pro', 'pass123', 'Administrador Principal', 'ADMIN', 'AD')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email;

-- Sembrado de Inmuebles Iniciales
INSERT INTO properties (id, title, property_type, city, zone, price, deposit, rooms, baths, area, parking, status, image) VALUES
('DEP-VALLE-101', 'Penthouse de Lujo con Terraza Panorámica', 'DEPARTAMENTO', 'La Paz', 'Zona Sur - Calacoto', 245000.00, 5000.00, 3, 3, 185.50, 2, 'DISPONIBLE', 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=800&q=80'),
('CAS-URB-202', 'Casa Campestre Estilo Mediterráneo', 'CASA', 'Santa Cruz', 'Equipetrol Norte', 380000.00, 10000.00, 4, 5, 420.00, 3, 'DISPONIBLE', 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=800&q=80'),
('TER-IND-303', 'Terreno Comercial e Industrial Z4', 'TERRENO', 'Cochabamba', 'Parque Industrial', 520000.00, 15000.00, 0, 0, 1250.00, 10, 'DISPONIBLE', 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=800&q=80')
ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, price = EXCLUDED.price;

-- Sembrado de Contrato Base
INSERT INTO contracts (id, property_id, property_title, user_id, user_name, contract_type, total_amount, status, signed_by) VALUES
('CTR-BASE-101', 'DEP-VALLE-101', 'Penthouse de Lujo con Terraza Panorámica', 'CLI-JUAN-COMPRADOR', 'Juan Comprador', 'PROMESA_COMPRAVENTA', 245000.00, 'BORRADOR', '')
ON CONFLICT (id) DO NOTHING;

-- Sembrado de Pago Base
INSERT INTO payments (id, concept, property_id, user_id, amount, method, status) VALUES
('REC-9011', 'Garantía de Alquiler Previo', 'DEP-VALLE-101', 'CLI-JUAN-COMPRADOR', 2500.00, 'Transferencia Bancaria', 'COMPLETED')
ON CONFLICT (id) DO NOTHING;
