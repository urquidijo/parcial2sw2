# ☸️ Orquestación Cloud-Native con Kubernetes (Habitat Pro)

Este directorio contiene los manifiestos de **Infraestructura como Código (IaC)** para desplegar la arquitectura completa de microservicios políglotas de **Habitat Pro** en cualquier cluster de Kubernetes de nivel empresarial (AWS EKS, Google Cloud GKE, Azure AKS, o local con Minikube / Docker Desktop).

---

## 🏛️ Arquitectura de Manifiestos K8s

| Manifiesto | Tipo de Objeto | Descripción y Responsabilidad |
| :--- | :--- | :--- |
| **`01-namespace.yaml`** | `Namespace` | Aísla los recursos del ecosistema bajo el espacio de nombres `habitat-pro`. |
| **`02-configmaps-secrets.yaml`** | `ConfigMap` & `Secret` | Inyección segura de endpoints, credenciales AWS S3, llaves de Keycloak y configuración global sin hardcoding. |
| **`03-ms-properties.yaml`** | `Deployment` + `Service` | Catálogo NestJS (MongoDB Atlas). 2 réplicas con probes de auto-recuperación (`livenessProbe` y `readinessProbe`). |
| **`04-ms-contracts.yaml`** | `Deployment` + `Service` | Contratos Spring Boot (PostgreSQL). 2 réplicas con límites de memoria y healthcheck en `/api/v1/architecture`. |
| **`05-ms-billing.yaml`** | `Deployment` + `Service` | Pasarela de cobros PHP (DynamoDB). 2 réplicas para reservas distribuidas Saga. |
| **`06-api-gateway.yaml`** | `Deployment` + `Service` | Puerta de enlace unificada y orquestador Saga (Node.js). 3 réplicas balanceadas mediante Service ClusterIP. |
| **`07-ingress.yaml`** | `Ingress` (NGINX) | Controlador de entrada que enruta el tráfico externo HTTPS hacia el API Gateway con certificados SSL automáticos. |
| **`08-hpa.yaml`** | `HorizontalPodAutoscaler` | Autoescalado elástico de Pods basado en consumo de CPU/Memoria (escala de 2 a 8 pods bajo alta demanda). |

---

## 🚀 Cómo desplegar en un Cluster Kubernetes

### 1. Despliegue secuencial de la infraestructura
Ejecuta los siguientes comandos desde la raíz del proyecto:

```bash
# 1. Crear el namespace
kubectl apply -f k8s/01-namespace.yaml

# 2. Inyectar variables de entorno y secretos
kubectl apply -f k8s/02-configmaps-secrets.yaml

# 3. Desplegar los microservicios con sus servicios internos
kubectl apply -f k8s/03-ms-properties.yaml
kubectl apply -f k8s/04-ms-contracts.yaml
kubectl apply -f k8s/05-ms-billing.yaml
kubectl apply -f k8s/06-api-gateway.yaml

# 4. Configurar el Ingress (punto de entrada público) y el Autoescalado
kubectl apply -f k8s/07-ingress.yaml
kubectl apply -f k8s/08-hpa.yaml
```

*(O despliega todo de un solo comando: `kubectl apply -f k8s/`)*

---

## 🔍 Comandos de Verificación y Demostración

```bash
# Ver el estado de todos los pods réplicas corriendo
kubectl get pods -n habitat-pro -o wide

# Ver los servicios y balanceadores internos
kubectl get svc -n habitat-pro

# Ver el Ingress público
kubectl get ingress -n habitat-pro

# Ver el estado del autoescalado (HPA)
kubectl get hpa -n habitat-pro

# Ver logs en vivo del API Gateway (Orquestador Saga)
kubectl logs -f deployment/api-gateway-deployment -n habitat-pro
```

---

## 🛡️ Demostración de Resiliencia (Auto-Healing) ante Evaluadores

Para demostrar cómo Kubernetes recupera automáticamente cualquier falla de un microservicio sin caída de servicio para el usuario:

1. Lista los pods activos:
   ```bash
   kubectl get pods -n habitat-pro
   ```
2. Elimina manualmente uno de los pods del API Gateway simulando un fallo de hardware:
   ```bash
   kubectl delete pod <nombre-del-pod> -n habitat-pro
   ```
3. Inmediatamente ejecuta `kubectl get pods -n habitat-pro`:
   Se evidenciará que Kubernetes detectó la muerte del contenedor y **creó un nuevo pod de reemplazo en menos de 2 segundos**, manteniendo las 3 réplicas siempre disponibles.

