# Keycloak para producción (Railway): importa el realm "habitat" la primera vez que arranca.
# Montar un volumen persistente en /opt/keycloak/data para no perder usuarios en cada redespliegue.
FROM quay.io/keycloak/keycloak:24.0.2

# Pre-compilar con la base de datos H2 local (dev-file) durante el build de Docker (donde hay más RAM)
RUN /opt/keycloak/bin/kc.sh build --db=dev-file

COPY habitat-realm.json /opt/keycloak/data/import/habitat-realm.json

# Limitar la memoria de Java para que quepa holgadamente en los 512MB de Railway
ENV JAVA_OPTS_APPEND="-Xms64m -Xmx256m -XX:MetaspaceSize=64M -XX:MaxMetaspaceSize=128m"

EXPOSE 8080
ENTRYPOINT ["/opt/keycloak/bin/kc.sh", "start", "--optimized", "--import-realm", "--http-port=8080", "--http-enabled=true", "--hostname-strict=false", "--proxy-headers=xforwarded"]
