# ==============================================================================
# Script de Arranque Completo de Habitat Pro en Localhost
# (3 Microservicios + API Gateway + Frontend mfe-shell + n8n Automation)
# ==============================================================================

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "🏢 INICIANDO PLATAFORMA LOCAL DE HABITAT PRO" -ForegroundColor Yellow
Write-Host "   (Microservicios + Frontend Web + Motor n8n)" -ForegroundColor Gray
Write-Host "==========================================================" -ForegroundColor Cyan

$workspaceRoot = $PSScriptRoot
if (-not $workspaceRoot) { $workspaceRoot = (Get-Location).Path }
$shell = if (Get-Command pwsh -ErrorAction SilentlyContinue) { "pwsh" } else { "powershell" }

# Helper para liberar puertos antes de iniciar
function Free-Port($port, $serviceName) {
    $connections = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    if ($connections) {
        $pids = $connections | Select-Object -ExpandProperty OwningProcess -Unique
        foreach ($pidToKill in $pids) {
            if ($pidToKill -gt 0) {
                Write-Host "⚠️  Liberando puerto :$port ($serviceName) del PID $pidToKill..." -ForegroundColor Yellow
                Stop-Process -Id $pidToKill -Force -ErrorAction SilentlyContinue
            }
        }
        Start-Sleep -Milliseconds 600
    }
}

Write-Host "`n🔍 Verificando y liberando puertos locales..." -ForegroundColor Cyan
Free-Port 5000 "API Gateway"
Free-Port 3001 "ms-properties"
Free-Port 8081 "ms-contracts"
Free-Port 8002 "ms-billing"
Free-Port 3003 "mfe-bi-next"
Free-Port 4000 "bff-graphql"

# 1. Iniciar n8n en Docker (si Docker está activo)
Write-Host "`n[1/5] 🤖 Verificando Motor de Flujos n8n (:5678)..." -ForegroundColor Green
$dockerRunning = docker info 2>&1
if ($LASTEXITCODE -eq 0) {
    $n8nRunning = docker ps --filter "name=proptech-n8n" --format "{{.Names}}"
    if ($n8nRunning -contains "proptech-n8n") {
        Write-Host "   ✅ n8n ya está activo en Docker en http://localhost:5678" -ForegroundColor Gray
    } else {
        $n8nExists = docker ps -a --filter "name=proptech-n8n" --format "{{.Names}}"
        if ($n8nExists -contains "proptech-n8n") {
            Write-Host "   🔄 Iniciando contenedor existente proptech-n8n..." -ForegroundColor Gray
            docker start proptech-n8n | Out-Null
        } else {
            Write-Host "   📦 Creando contenedor n8n..." -ForegroundColor Gray
            docker run -d --name proptech-n8n -p 5678:5678 -e GENERIC_TIMEZONE=America/La_Paz docker.n8n.io/n8nio/n8n:latest | Out-Null
        }
    }
    Write-Host "   🔐 Iniciando Keycloak SSO (:8080, realm habitat)..." -ForegroundColor Gray
    docker compose -f "$workspaceRoot\docker-compose.yml" up -d keycloak-sso 2>&1 | Out-Null
} else {
    Write-Host "   ⚠️ Docker no detectado en ejecución. n8n y Keycloak omitidos: sin Keycloak no se puede iniciar sesión." -ForegroundColor DarkYellow
}

# 2. Iniciar Microservicio 1: ms-properties-nestjs en :3001
Write-Host "`n[2/5] 🍃 Iniciando ms-properties-nestjs (:3001) -> MongoDB Atlas..." -ForegroundColor Green
Start-Process $shell -ArgumentList "-NoExit", "-Command", "Set-Location '$workspaceRoot\ms-properties-nestjs'; `$host.UI.RawUI.WindowTitle = 'ms-properties (:3001)'; node dist/main.js"

# 3. Iniciar Microservicio 2: ms-contracts-spring en :8081
Write-Host "`n[3/5] 🐘 Iniciando ms-contracts-spring (:8081) -> PostgreSQL Render..." -ForegroundColor Green
Start-Process $shell -ArgumentList "-NoExit", "-Command", "Set-Location '$workspaceRoot\ms-contracts-spring'; `$host.UI.RawUI.WindowTitle = 'ms-contracts (:8081)'; java -jar target/ms-contracts-spring-1.0.0.jar"

# 4. Iniciar Microservicio 3: ms-billing-php en :8002
Write-Host "`n[4/5] ⚡ Iniciando ms-billing-php (:8002) -> Amazon DynamoDB AWS..." -ForegroundColor Green
Start-Process $shell -ArgumentList "-NoExit", "-Command", "Set-Location '$workspaceRoot\ms-billing-php'; `$host.UI.RawUI.WindowTitle = 'ms-billing (:8002)'; php -S 127.0.0.1:8002 -t public"

# El ERP Angular (mfe-contracts-angular) se sirve compilado: se compila si falta dist/
$erpDir = "$workspaceRoot\mfe-contracts-angular"
if ((Test-Path "$erpDir\node_modules") -and -not (Test-Path "$erpDir\dist\browser\main.js")) {
    Write-Host "`n[+] 🅰️  Compilando el ERP Angular (primera vez)..." -ForegroundColor Green
    Push-Location $erpDir; npm run build | Out-Null; Pop-Location
} elseif (-not (Test-Path "$erpDir\node_modules")) {
    Write-Host "   ⚠️ Falta 'npm install' en mfe-contracts-angular: el ERP Angular no se mostrará." -ForegroundColor DarkYellow
}

# 5. Iniciar API Gateway & Frontend Web en :5000
Write-Host "`n[5/5] 🚀 Iniciando API Gateway & Frontend Web (:5000)..." -ForegroundColor Green
Start-Process $shell -ArgumentList "-NoExit", "-Command", "Set-Location '$workspaceRoot'; `$host.UI.RawUI.WindowTitle = 'API Gateway & Frontend (:5000)'; node server.js"

# BFF GraphQL del ERP en :4000 (lo consume el microfrontend Angular a través de /api/graphql)
Write-Host "`n[+] 🔗 Iniciando BFF GraphQL del ERP (:4000)..." -ForegroundColor Green
if (Test-Path "$workspaceRoot\bff-graphql-gateway\node_modules") {
    Start-Process $shell -ArgumentList "-NoExit", "-Command", "Set-Location '$workspaceRoot\bff-graphql-gateway'; `$host.UI.RawUI.WindowTitle = 'BFF GraphQL (:4000)'; node src/index.js"
} else {
    Write-Host "   ⚠️ Falta 'npm install' en bff-graphql-gateway. BFF GraphQL omitido." -ForegroundColor DarkYellow
}

# 6. App de BI separada (Next.js) en :3003 — usa la misma sesión de Keycloak
Write-Host "`n[+] 📊 Iniciando Dashboard BI standalone (:3003)..." -ForegroundColor Green
if (Test-Path "$workspaceRoot\mfe-bi-next\node_modules") {
    Start-Process $shell -ArgumentList "-NoExit", "-Command", "Set-Location '$workspaceRoot\mfe-bi-next'; `$host.UI.RawUI.WindowTitle = 'Dashboard BI (:3003)'; npm run dev"
} else {
    Write-Host "   ⚠️ Falta 'npm install' en mfe-bi-next. Dashboard BI omitido." -ForegroundColor DarkYellow
}

Write-Host "`n⏳ Esperando inicialización de servicios (6 segundos)..." -ForegroundColor Cyan
Start-Sleep -Seconds 6

Write-Host "`n==========================================================" -ForegroundColor Cyan
Write-Host "✅ ARQUITECTURA HABITAT PRO OPERATIVA EN LOCALHOST" -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "🌐 FRONTEND WEB & GATEWAY: http://localhost:5000" -ForegroundColor White -BackgroundColor DarkBlue
Write-Host "📊 Dashboard BI (Next.js):  http://localhost:3003 [misma sesión SSO]" -ForegroundColor White
Write-Host "🔗 BFF GraphQL (ERP):       http://localhost:4000 [vía /api/graphql]" -ForegroundColor White
Write-Host "🍃 ms-properties (Catálogo): http://localhost:3001 [MongoDB Atlas]" -ForegroundColor White
Write-Host "🐘 ms-contracts (Legal):    http://localhost:8081 [PostgreSQL Render]" -ForegroundColor White
Write-Host "⚡ ms-billing (Pagos/Arras): http://localhost:8002 [Amazon DynamoDB]" -ForegroundColor White
Write-Host "🤖 n8n Workflows:           http://localhost:5678 [Docker]" -ForegroundColor White
Write-Host "🔐 Keycloak SSO:            http://localhost:8080 [Docker] (consola: admin)" -ForegroundColor White
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "CUENTAS DEMO EN KEYCLOAK (Contraseña: pass123):" -ForegroundColor Yellow
Write-Host "👤 Cliente:            juan.comprador@habitat.pro" -ForegroundColor White
Write-Host "👤 Empleado/Agente:    carlos.broker@habitat.pro" -ForegroundColor White
Write-Host "👤 Empleado/Legal:     elena.ramos@habitat.pro" -ForegroundColor White
Write-Host "👤 Empleado/Finanzas:  maria.finanzas@habitat.pro" -ForegroundColor White
Write-Host "👤 Admin:              admin@habitat.pro" -ForegroundColor White
Write-Host "==========================================================" -ForegroundColor Cyan

# Abrir el navegador en el Frontend automáticamente
Start-Process "http://localhost:5000"
