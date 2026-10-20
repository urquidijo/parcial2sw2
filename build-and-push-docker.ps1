# ==============================================================================
# Script de Construcción y Publicación a Docker Hub (Habitat Pro)
# Usuario Docker Hub: urquidijo
# ==============================================================================

param(
    [string]$DockerUser = "urquidijo",
    [string]$Tag = "latest"
)

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "🐳 CONSTRUYENDO Y SUBIENDO IMÁGENES A DOCKER HUB" -ForegroundColor Yellow
Write-Host "   Usuario: $DockerUser | Tag: $Tag" -ForegroundColor Gray
Write-Host "==========================================================" -ForegroundColor Cyan

# Asegurarse de estar autenticado
Write-Host "`n🔑 Verificando inicio de sesión en Docker Hub..." -ForegroundColor Cyan
docker login

# 1. Microservicio ms-properties-nestjs
Write-Host "`n[1/4] 🍃 Construyendo ms-properties ($DockerUser/ms-properties:$Tag)..." -ForegroundColor Green
docker build -t "$DockerUser/ms-properties:$Tag" ./ms-properties-nestjs
if ($LASTEXITCODE -eq 0) {
    Write-Host "⬆️ Subiendo ms-properties a Docker Hub..." -ForegroundColor Yellow
    docker push "$DockerUser/ms-properties:$Tag"
} else {
    Write-Host "❌ Falló el build de ms-properties" -ForegroundColor Red
}

# 2. Microservicio ms-contracts-spring
Write-Host "`n[2/4] 🐘 Construyendo ms-contracts ($DockerUser/ms-contracts:$Tag)..." -ForegroundColor Green
docker build -t "$DockerUser/ms-contracts:$Tag" ./ms-contracts-spring
if ($LASTEXITCODE -eq 0) {
    Write-Host "⬆️ Subiendo ms-contracts a Docker Hub..." -ForegroundColor Yellow
    docker push "$DockerUser/ms-contracts:$Tag"
} else {
    Write-Host "❌ Falló el build de ms-contracts" -ForegroundColor Red
}

# 3. Microservicio ms-billing-php
Write-Host "`n[3/4] ⚡ Construyendo ms-billing ($DockerUser/ms-billing:$Tag)..." -ForegroundColor Green
docker build -t "$DockerUser/ms-billing:$Tag" ./ms-billing-php
if ($LASTEXITCODE -eq 0) {
    Write-Host "⬆️ Subiendo ms-billing a Docker Hub..." -ForegroundColor Yellow
    docker push "$DockerUser/ms-billing:$Tag"
} else {
    Write-Host "❌ Falló el build de ms-billing" -ForegroundColor Red
}

# 4. API Gateway & Frontend Shell
Write-Host "`n[4/4] 🚀 Construyendo api-gateway ($DockerUser/api-gateway:$Tag)..." -ForegroundColor Green
docker build -t "$DockerUser/api-gateway:$Tag" .
if ($LASTEXITCODE -eq 0) {
    Write-Host "⬆️ Subiendo api-gateway a Docker Hub..." -ForegroundColor Yellow
    docker push "$DockerUser/api-gateway:$Tag"
} else {
    Write-Host "❌ Falló el build de api-gateway" -ForegroundColor Red
}

Write-Host "`n==========================================================" -ForegroundColor Cyan
Write-Host "✅ PROCESO COMPLETADO EN DOCKER HUB" -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Cyan
