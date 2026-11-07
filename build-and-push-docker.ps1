# ==============================================================================
# Script de Construcción y Publicación a Docker Hub (Habitat Pro)
# Usuario Docker Hub: urquidijo
# ==============================================================================
# Uso:
#   .\build-and-push-docker.ps1                      # Construye y sube los 8 servicios
#   .\build-and-push-docker.ps1 -Only keycloak       # Construye y sube solo keycloak
#   .\build-and-push-docker.ps1 -NoPush              # Solo construye localmente sin subir
# ==============================================================================

param(
    [string]$DockerUser = "urquidijo",
    [string]$Tag = "latest",
    [string[]]$Only = @(),
    [switch]$NoPush
)

$ErrorActionPreference = "Stop"

$Services = @(
    @{ Name = "keycloak";       Image = "keycloak";       Context = "./keycloak";             Emoji = "🔐"; Desc = "Keycloak SSO (Realm habitat + optimizado)" },
    @{ Name = "ms-properties";  Image = "ms-properties";  Context = "./ms-properties-nestjs"; Emoji = "🍃"; Desc = "Microservicio Propiedades (NestJS + MongoDB)" },
    @{ Name = "ms-contracts";   Image = "ms-contracts";   Context = "./ms-contracts-spring";  Emoji = "🐘"; Desc = "Microservicio Contratos/ERP (Spring Boot + PostgreSQL)" },
    @{ Name = "ms-billing";     Image = "ms-billing";     Context = "./ms-billing-php";       Emoji = "⚡"; Desc = "Microservicio Facturación/Pagos (PHP + DynamoDB)" },
    @{ Name = "ms-ml";          Image = "ms-ml";          Context = "./ms-ml-python";         Emoji = "🤖"; Desc = "Microservicio Machine Learning (FastAPI + scikit-learn)" },
    @{ Name = "bff-graphql";    Image = "bff-graphql";    Context = "./bff-graphql-gateway";  Emoji = "🔮"; Desc = "BFF GraphQL Gateway para ERP Angular" },
    @{ Name = "mcp-server";     Image = "mcp-server";     Context = "./mcp-habitat-server";   Emoji = "🛠️"; Desc = "Servidor MCP de Reportes con IA (CU20/CU21)" },
    @{ Name = "api-gateway";    Image = "api-gateway";    Context = ".";                      Emoji = "🚀"; Desc = "API Gateway Principal & Frontend Shell" }
)

if ($Only.Count -gt 0) {
    $Services = $Services | Where-Object { $Only -contains $_.Name -or $Only -contains $_.Image }
    if ($Services.Count -eq 0) {
        Write-Host "❌ Ningún servicio coincide con -Only ($($Only -join ', '))." -ForegroundColor Red
        Write-Host "   Servicios disponibles: keycloak, ms-properties, ms-contracts, ms-billing, ms-ml, bff-graphql, mcp-server, api-gateway" -ForegroundColor Yellow
        exit 1
    }
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "🐳 CONSTRUYENDO Y SUBIENDO IMÁGENES A DOCKER HUB" -ForegroundColor Yellow
Write-Host "   Usuario: $DockerUser | Tag: $Tag | Total: $($Services.Count) servicio(s)" -ForegroundColor Gray
Write-Host "==========================================================" -ForegroundColor Cyan

if (-not $NoPush) {
    Write-Host "`n🔑 Verificando sesión en Docker Hub..." -ForegroundColor Cyan
    docker login
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Error al autenticar en Docker Hub. Ejecuta 'docker login' primero." -ForegroundColor Red
        exit 1
    }
}

$Results = @()
$Index = 0
$Total = $Services.Count

foreach ($Svc in $Services) {
    $Index++
    $FullImage = "$DockerUser/$($Svc.Image):$Tag"
    Write-Host "`n[$Index/$Total] $($Svc.Emoji) Construyendo $($Svc.Name) -> $FullImage" -ForegroundColor Green
    Write-Host "       $($Svc.Desc)" -ForegroundColor DarkGray

    docker build -t $FullImage $Svc.Context
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Falló el build de $($Svc.Name)" -ForegroundColor Red
        $Results += [PSCustomObject]@{ Servicio = $Svc.Name; Imagen = $FullImage; Estado = "❌ FALLÓ BUILD" }
        continue
    }

    if (-not $NoPush) {
        Write-Host "⬆️  Subiendo $FullImage a Docker Hub..." -ForegroundColor Yellow
        docker push $FullImage
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ $FullImage publicado correctamente" -ForegroundColor Green
            $Results += [PSCustomObject]@{ Servicio = $Svc.Name; Imagen = $FullImage; Estado = "✅ PUBLICADO" }
        } else {
            Write-Host "❌ Falló el push de $FullImage" -ForegroundColor Red
            $Results += [PSCustomObject]@{ Servicio = $Svc.Name; Imagen = $FullImage; Estado = "❌ FALLÓ PUSH" }
        }
    } else {
        $Results += [PSCustomObject]@{ Servicio = $Svc.Name; Imagen = $FullImage; Estado = "🔨 SOLO BUILD" }
    }
}

Write-Host "`n==========================================================" -ForegroundColor Cyan
Write-Host "📊 RESUMEN DE IMÁGENES EN DOCKER HUB" -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Cyan
$Results | Format-Table -AutoSize

