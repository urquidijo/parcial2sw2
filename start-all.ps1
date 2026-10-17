# Script de Arranque Completo para Habitat Pro en Localhost
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "🏢 INICIANDO PLATAFORMA INMOBILIARIA HABITAT PRO" -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Levantar bases de datos en Docker
Write-Host "`n[1/3] Levantando bases de datos en Docker (PostgreSQL, MongoDB, DynamoDB, Keycloak)..." -ForegroundColor Green
docker compose up -d

# 2. Iniciar Backend API Gateway en puerto 5000
Write-Host "`n[2/3] Iniciando Backend API Gateway en http://localhost:5000..." -ForegroundColor Green
Start-Process pwsh -ArgumentList "-NoExit", "-Command", "node server.js"

# 3. Iniciar Frontend MFE Shell en puerto 3000
Write-Host "`n[3/3] Iniciando Frontend Shell en http://localhost:3000..." -ForegroundColor Green
Start-Process pwsh -ArgumentList "-NoExit", "-Command", "php -S localhost:3000 -t mfe-shell"

Start-Sleep -Seconds 3

# Abrir el navegador en la plataforma
Start-Process "http://localhost:3000"

Write-Host "`n==========================================================" -ForegroundColor Cyan
Write-Host "✅ SISTEMA EN EJECUCIÓN EXITOSA EN LOCALHOST" -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "🌐 Frontend Principal:      http://localhost:3000" -ForegroundColor White
Write-Host "🚀 Backend API Gateway:     http://localhost:5000" -ForegroundColor White
Write-Host "🐘 PostgreSQL (ACID):       localhost:5435 (DB: contracts_db)" -ForegroundColor White
Write-Host "🍃 MongoDB (Catálogo):      localhost:27017 (DB: properties_catalog_db)" -ForegroundColor White
Write-Host "⚡ DynamoDB Local (Ledger): localhost:8005" -ForegroundColor White
Write-Host "🔐 Keycloak SSO:            http://localhost:8080" -ForegroundColor White
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "`nCUENTAS DEMO PRECONFIGURADAS (Contraseña: pass123):" -ForegroundColor Yellow
Write-Host "👤 Comprador:  juan.comprador@habitat.pro" -ForegroundColor White
Write-Host "👤 Agente:     carlos.broker@habitat.pro" -ForegroundColor White
Write-Host "👤 Notario:    elena.ramos@habitat.pro" -ForegroundColor White
Write-Host "👤 Admin:      admin@habitat.pro" -ForegroundColor White
Write-Host "==========================================================" -ForegroundColor Cyan
