# Keycloak para producción (Railway): importa el realm "habitat" la primera vez que arranca.
# Montar un volumen persistente en /opt/keycloak/data para no perder usuarios en cada redespliegue.
FROM quay.io/keycloak/keycloak:24.0.2

# Pre-compilar durante el build (donde Railway da más RAM) para evitar "Killed" (OOM) al arrancar
RUN /opt/keycloak/bin/kc.sh build

COPY habitat-realm.json /opt/keycloak/data/import/habitat-realm.json

# Limitar la memoria de Java para que quepa holgadamente en los 512MB de Railway
ENV JAVA_OPTS_APPEND="-Xms64m -Xmx256m -XX:MetaspaceSize=64M -XX:MaxMetaspaceSize=128m"

EXPOSE 8080
ENTRYPOINT ["/opt/keycloak/bin/kc.sh", "start-dev", "--optimized", "--import-realm", "--http-port=8080"]
