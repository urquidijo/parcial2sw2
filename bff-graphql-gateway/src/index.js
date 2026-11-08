const { ApolloServer } = require('@apollo/server');
const { startStandaloneServer } = require('@apollo/server/standalone');
const { GraphQLError } = require('graphql');
const fs = require('fs');
const path = require('path');

const typeDefs = fs.readFileSync(path.join(__dirname, '../schema.graphql'), 'utf-8');

const PROPERTIES_URL = process.env.BFF_PROPERTIES_URL || 'http://localhost:3001/api/v1/properties';
const CONTRACTS_URL = process.env.BFF_CONTRACTS_URL || 'http://localhost:8081/api/v1';
const PORT = Number(process.env.BFF_PORT || 4000);

const ERROR_CODES = { 400: 'BAD_REQUEST', 401: 'UNAUTHENTICATED', 403: 'FORBIDDEN', 404: 'NOT_FOUND', 409: 'CONFLICT' };

// Llama a un microservicio reenviando el token de Keycloak del usuario; los errores REST se traducen a errores GraphQL.
function identifyServiceName(url = '') {
  const u = String(url);
  if (u.includes(PROPERTIES_URL) || u.includes(':3001')) {
    return 'ms-properties-nestjs (Catálogo Inmobiliario · MongoDB Atlas)';
  }
  if (u.includes(CONTRACTS_URL) || u.includes(':8081')) {
    return 'ms-contracts-spring (Contratos, Visitas y Usuarios · PostgreSQL)';
  }
  return 'Microservicio del ecosistema';
}

async function rest(ctx, url, options = {}) {
  const headers = { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(ctx.authorization ? { Authorization: ctx.authorization } : {}) };
  const svcName = identifyServiceName(url);
  let res;
  try {
    res = await fetch(url, { ...options, headers, body: options.body ? JSON.stringify(options.body) : undefined });
  } catch (err) {
    throw new GraphQLError(`⚠️ El microservicio ${svcName} no responde en este momento. Inténtalo de nuevo más tarde.`, { extensions: { code: 'SERVICE_UNAVAILABLE', failedService: svcName } });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if ([502, 503, 504].includes(res.status)) {
      throw new GraphQLError(`⚠️ El microservicio ${svcName} no responde en este momento (detenido o fuera de línea). Inténtalo de nuevo más tarde.`, { extensions: { code: 'SERVICE_UNAVAILABLE', failedService: svcName, http: { status: 503 } } });
    }
    const message = Array.isArray(data.message) ? data.message.join('. ') : (data.message || (res.status === 403 ? 'No tienes permiso para esta operación' : `Error ${res.status} en ${svcName}`));
    throw new GraphQLError(message, { extensions: { code: ERROR_CODES[res.status] || 'INTERNAL_SERVER_ERROR', failedService: svcName, http: { status: res.status } } });
  }
  return data;
}

// Un solo pedido a ms-properties por consulta GraphQL, sin importar cuántos contratos o visitas pidan su inmueble.
function propertyIndex(ctx) {
  if (!ctx.propertiesPromise) {
    ctx.propertiesPromise = rest(ctx, PROPERTIES_URL)
      .then((list) => new Map(list.map((p) => [p.code, p])))
      .catch(() => new Map());
  }
  return ctx.propertiesPromise;
}

const toContract = (c) => ({
  ...c,
  id: String(c.id),
  clientName: c.userName,
  signatures: c.signatures || [],
  signaturesRequired: 2,
});

const toEmployee = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role || 'EMPLEADO', sector: u.sector, active: u.active !== false, createdAt: u.createdAt, telegramLinked: Boolean(u.telegramLinked), telegramAlerts: Boolean(u.telegramAlerts) });

const toAppointment = (a) => ({ ...a, clientName: a.userName, clientPhone: a.userPhone });

const resolvers = {
  Query: {
    contracts: async (_, { status }, ctx) => {
      const list = (await rest(ctx, `${CONTRACTS_URL}/contracts`)).map(toContract);
      return status ? list.filter((c) => c.status === status) : list;
    },
    contract: async (_, { id }, ctx) => toContract(await rest(ctx, `${CONTRACTS_URL}/contracts/${encodeURIComponent(id)}`)),
    employees: async (_, __, ctx) => {
      try {
        const all = await rest(ctx, `${CONTRACTS_URL}/users`);
        if (all && Array.isArray(all.data)) return all.data.map(toEmployee);
      } catch (_) {}
      return (await rest(ctx, `${CONTRACTS_URL}/employees`)).data.map(toEmployee);
    },
    clients: async (_, __, ctx) => (await rest(ctx, `${CONTRACTS_URL}/clients`)).data,
    appointments: async (_, { status }, ctx) => {
      const list = (await rest(ctx, `${CONTRACTS_URL}/appointments`)).data.map(toAppointment);
      return status ? list.filter((a) => a.status === status) : list;
    },
    properties: async (_, { status }, ctx) => {
      const list = await rest(ctx, PROPERTIES_URL + (status ? `?status=${encodeURIComponent(status)}` : ''));
      return list;
    },
  },

  Contract: {
    property: async (contract, _, ctx) => (await propertyIndex(ctx)).get(contract.propertyId) || null,
  },
  Appointment: {
    property: async (appointment, _, ctx) => (await propertyIndex(ctx)).get(appointment.propertyId) || null,
  },

  Mutation: {
    createContract: async (_, { input }, ctx) => {
      await rest(ctx, PROPERTIES_URL + '/' + encodeURIComponent(input.propertyId));
      return toContract(await rest(ctx, CONTRACTS_URL + '/contracts', { method: 'POST', body: input }));
    },
    cancelContract: async (_, { id, reason }, ctx) =>
      toContract(await rest(ctx, `${CONTRACTS_URL}/contracts/${encodeURIComponent(id)}/cancel`, { method: 'POST', body: { reason } })),
    signContract: async (_, { id }, ctx) =>
      toContract(await rest(ctx, `${CONTRACTS_URL}/contracts/${encodeURIComponent(id)}/signatures`, { method: 'POST' })),
    createEmployee: async (_, { input }, ctx) =>
      toEmployee((await rest(ctx, `${CONTRACTS_URL}/employees`, { method: 'POST', body: input })).data),
    updateEmployeeSector: async (_, { id, sector }, ctx) =>
      toEmployee((await rest(ctx, `${CONTRACTS_URL}/employees/${encodeURIComponent(id)}/sector`, { method: 'PATCH', body: { sector } })).data),
    setEmployeeActive: async (_, { id, active }, ctx) =>
      toEmployee((await rest(ctx, `${CONTRACTS_URL}/employees/${encodeURIComponent(id)}/${active ? 'activate' : 'deactivate'}`, { method: 'POST' })).data),
    setEmployeeTelegramAlerts: async (_, { id, enabled }, ctx) =>
      toEmployee((await rest(ctx, `${CONTRACTS_URL}/employees/${encodeURIComponent(id)}/telegram-alerts`, { method: 'PATCH', body: { enabled } })).data),
    updateAppointmentStatus: async (_, { id, status }, ctx) =>
      toAppointment((await rest(ctx, `${CONTRACTS_URL}/appointments/${encodeURIComponent(id)}/status`, { method: 'PUT', body: { status } })).data),
  },
};

async function startGateway() {
  const server = new ApolloServer({ typeDefs, resolvers });
  const { url } = await startStandaloneServer(server, {
    listen: { port: PORT },
    context: async ({ req }) => ({ authorization: req.headers.authorization || null }),
  });
  console.log(`🚀 [BFF GraphQL ERP] listo en ${url}`);
  console.log(`   ms-contracts: ${CONTRACTS_URL} · ms-properties: ${PROPERTIES_URL}`);
}

startGateway().catch((err) => {
  console.error('No se pudo iniciar el BFF GraphQL:', err);
  process.exit(1);
});
