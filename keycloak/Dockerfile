# Keycloak para producción (Railway): importa el realm "habitat" la primera vez que arranca.
# Montar un volumen persistente en /opt/keycloak/data para no perder usuarios en cada redespliegue.
FROM quay.io/keycloak/keycloak:24.0.2

# Copiar tema visual de Habitat Pro para Login y Registro (Sign In / Sign Up)
COPY themes/habitat /opt/keycloak/themes/habitat

# Pre-compilar con la base de datos H2 local (dev-file) durante el build de Docker (donde hay más RAM)
RUN /opt/keycloak/bin/kc.sh build --db=dev-file

COPY habitat-realm.json /opt/keycloak/data/import/habitat-realm.json

# Limitar la memoria de Java para que quepa holgadamente en los 512MB de Railway y usar el tema habitat por defecto
ENV JAVA_OPTS_APPEND="-Xms64m -Xmx256m -XX:MetaspaceSize=64M -XX:MaxMetaspaceSize=128m"
ENV KC_SPI_THEME_DEFAULT=habitat
ENV KC_SPI_THEME_STATIC_MAX_AGE=-1
ENV KC_SPI_THEME_CACHE_THEMES=false

EXPOSE 8080
ENTRYPOINT ["/opt/keycloak/bin/kc.sh", "start", "--optimized", "--import-realm", "--http-port=8080", "--http-enabled=true", "--hostname-strict=false", "--proxy-headers=xforwarded"]
