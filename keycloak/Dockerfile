# Keycloak para producción (Railway): importa el realm "habitat" la primera vez que arranca.
# Montar un volumen persistente en /opt/keycloak/data para no perder usuarios en cada redespliegue.
FROM quay.io/keycloak/keycloak:24.0.2
COPY habitat-realm.json /opt/keycloak/data/import/habitat-realm.json
EXPOSE 8080
ENTRYPOINT ["/opt/keycloak/bin/kc.sh", "start-dev", "--import-realm", "--http-port=8080"]
