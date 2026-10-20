# Script de Arranque de la Arquitectura de Microservicios Habitat Pro
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "🏢 INICIANDO PLATAFORMA DE MICROSERVICIOS HABITAT PRO" -ForegroundColor Yellow
Write-Host "   (3 Microservicios independientes + 3 Bases de Datos Cloud)" -ForegroundColor Gray
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Iniciar Microservicio 1: ms-properties-nestjs (MongoDB Atlas) en :3001
Write-Host "`n[1/4] Iniciando ms-properties-nestjs (:3001) -> MongoDB Atlas..." -ForegroundColor Green
Start-Process pwsh -ArgumentList "-NoExit", "-Command", "cd ms-properties-nestjs; node dist/main.js"

# 2. Iniciar Microservicio 2: ms-contracts-spring (PostgreSQL Render) en :8081
Write-Host "`n[2/4] Iniciando ms-contracts-spring (:8081) -> PostgreSQL Render..." -ForegroundColor Green
Start-Process pwsh -ArgumentList "-NoExit", "-Command", "cd ms-contracts-spring; java -jar target/ms-contracts-spring-1.0.0.jar"

# 3. Iniciar Microservicio 3: ms-billing-php (Amazon DynamoDB) en :8002
Write-Host "`n[3/4] Iniciando ms-billing-php (:8002) -> Amazon DynamoDB AWS..." -ForegroundColor Green
Start-Process pwsh -ArgumentList "-NoExit", "-Command", "cd ms-billing-php; php -S 127.0.0.1:8002 -t public"

# 4. Iniciar API Gateway & Orquestador Saga en :5000
Write-Host "`n[4/4] Iniciando API Gateway & Orquestador Saga (:5000)..." -ForegroundColor Green
Start-Process pwsh -ArgumentList "-NoExit", "-Command", "node server.js"

Start-Sleep -Seconds 4

Write-Host "`n==========================================================" -ForegroundColor Cyan
Write-Host "✅ ARQUITECTURA DE MICROSERVICIOS EN EJECUCIÓN" -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "🚀 API Gateway (Frontend Entry): http://localhost:5000" -ForegroundColor White
Write-Host "🍃 ms-properties (Catálogo):      http://localhost:3001 [MongoDB Atlas]" -ForegroundColor White
Write-Host "🐘 ms-contracts (Legal & Auth):  http://localhost:8081 [PostgreSQL Render]" -ForegroundColor White
Write-Host "⚡ ms-billing (Pagos & TTL):     http://localhost:8002 [Amazon DynamoDB]" -ForegroundColor White
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "`nCUENTAS DEMO (Contraseña: pass123):" -ForegroundColor Yellow
Write-Host "👤 Comprador:  juan.comprador@habitat.pro" -ForegroundColor White
Write-Host "👤 Agente:     carlos.broker@habitat.pro" -ForegroundColor White
Write-Host "👤 Notario:    elena.ramos@habitat.pro" -ForegroundColor White
Write-Host "👤 Admin:      admin@habitat.pro" -ForegroundColor White
Write-Host "==========================================================" -ForegroundColor Cyan
