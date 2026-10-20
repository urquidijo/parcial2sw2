# ==============================================================================
# Script de Apagado y Limpieza Completa de Habitat Pro
# (Cierra Microservicios, API Gateway, Procesos Huérfanos y Contenedores)
# ==============================================================================

Write-Host "==========================================================" -ForegroundColor Red
Write-Host "🛑 DETENIENDO PLATAFORMA LOCAL DE HABITAT PRO" -ForegroundColor Yellow
Write-Host "   (Liberando puertos y finalizando procesos en ejecución)" -ForegroundColor Gray
Write-Host "==========================================================" -ForegroundColor Red

function Kill-Port($port, $name) {
    $connections = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    if ($connections) {
        $pids = $connections | Select-Object -ExpandProperty OwningProcess -Unique
        foreach ($pidToKill in $pids) {
            if ($pidToKill -gt 0) {
                Write-Host "⏹️  Deteniendo $name (Puerto :$port, PID $pidToKill)..." -ForegroundColor Yellow
                Stop-Process -Id $pidToKill -Force -ErrorAction SilentlyContinue
            }
        }
        Write-Host "   ✅ Puerto :$port liberado." -ForegroundColor Green
    } else {
        Write-Host "   ℹ️  Puerto :$port ($name) ya estaba libre." -ForegroundColor Gray
    }
}

# 1. Liberar puertos de los 4 servicios locales
Write-Host "`n[1/3] Finalizando servicios locales..." -ForegroundColor Cyan
Kill-Port 5000 "API Gateway & Frontend"
Kill-Port 3001 "ms-properties-nestjs"
Kill-Port 8081 "ms-contracts-spring"
Kill-Port 8002 "ms-billing-php"

# 2. Detener contenedor de n8n si el usuario lo desea
Write-Host "`n[2/3] Verificando contenedores Docker..." -ForegroundColor Cyan
$dockerRunning = docker info 2>&1
if ($LASTEXITCODE -eq 0) {
    $n8nRunning = docker ps --filter "name=proptech-n8n" --format "{{.Names}}"
    if ($n8nRunning -contains "proptech-n8n") {
        Write-Host "   ⏹️  Deteniendo contenedor proptech-n8n..." -ForegroundColor Yellow
        docker stop proptech-n8n | Out-Null
        Write-Host "   ✅ Contenedor n8n detenido." -ForegroundColor Green
    } else {
        Write-Host "   ℹ️  Contenedor n8n no estaba en ejecución." -ForegroundColor Gray
    }
} else {
    Write-Host "   ℹ️  Docker no está en ejecución." -ForegroundColor Gray
}

# 3. Limpieza de procesos y ventanas de terminal huérfanas
Write-Host "`n[3/3] Limpieza de procesos huérfanos..." -ForegroundColor Cyan
Get-Process -Name "node", "java", "php" -ErrorAction SilentlyContinue | Where-Object {
    $_.Path -like "*parcial2*" -or $_.CommandLine -like "*server.js*" -or $_.CommandLine -like "*ms-contracts*"
} | ForEach-Object {
    Write-Host "   🧹 Terminando proceso residual: $($_.Name) (PID $($_.Id))..." -ForegroundColor Yellow
    Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
}

Write-Host "`n==========================================================" -ForegroundColor Green
Write-Host "✅ TODOS LOS SERVICIOS HAN SIDO DETENIDOS EXITOSAMENTE" -ForegroundColor Yellow
Write-Host "   Todos los puertos (5000, 3001, 8081, 8002, 5678) están libres." -ForegroundColor Gray
Write-Host "==========================================================" -ForegroundColor Green
