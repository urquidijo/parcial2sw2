const { ApolloServer } = require('@apollo/server');
const { startStandaloneServer } = require('@apollo/server/standalone');
const fs = require('fs');
const path = require('path');

const typeDefs = fs.readFileSync(path.join(__dirname, '../schema.graphql'), 'utf-8');

const PROPERTIES_URL = process.env.PROPERTIES_URL || 'http://localhost:3001/api/v1/properties';
const CONTRACTS_URL = process.env.CONTRACTS_URL || 'http://localhost:8081/api/v1/contracts';
const BILLING_URL = process.env.BILLING_URL || 'http://localhost:8002/api/v1';

const resolvers = {
  Query: {
    contracts: async (_, { status }) => {
      try {
        const res = await fetch(CONTRACTS_URL);
        const data = await res.json();
        if (status) return data.filter(c => c.status === status);
        return data;
      } catch (err) {
        console.error('Error fetching contracts from Spring Boot:', err.message);
        return [];
      }
    },
    contract: async (_, { id }) => {
      try {
        const res = await fetch(`${CONTRACTS_URL}/${id}`);
        return await res.json();
      } catch (err) {
        return null;
      }
    },
    properties: async (_, { status, city }) => {
      try {
        const params = new URLSearchParams();
        if (status) params.append('status', status);
        if (city) params.append('city', city);
        const res = await fetch(`${PROPERTIES_URL}?${params.toString()}`);
        return await res.json();
      } catch (err) {
        console.error('Error fetching properties from NestJS:', err.message);
        return [];
      }
    },
    property: async (_, { id }) => {
      try {
        const res = await fetch(`${PROPERTIES_URL}/${id}`);
        return await res.json();
      } catch (err) {
        return null;
      }
    },
    agentCommissions: async (_, { agentId }) => {
      try {
        const res = await fetch(`${BILLING_URL}/commissions/agent/${agentId}`);
        return await res.json();
      } catch (err) {
        return null;
      }
    },
  },

  // Resolver anidado para Contract.property (Elimina N+1 con queries directas)
  Contract: {
    property: async (parent) => {
      if (!parent.propertyId) return null;
      try {
        // Intentar buscar por código o por ID
        const res = await fetch(`${PROPERTIES_URL}/code/${parent.propertyId}`);
        if (res.ok) return await res.json();
        const resId = await fetch(`${PROPERTIES_URL}/${parent.propertyId}`);
        if (resId.ok) return await resId.json();
      } catch (e) {}
      return null;
    },
  },

  Mutation: {
    createContract: async (_, { input }) => {
      const res = await fetch(CONTRACTS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      return await res.json();
    },

    initiateReservationSaga: async (_, { input }) => {
      const { propertyId, clientId, depositAmount, totalAmount } = input;
      // Delegar al orquestador Saga
      try {
        const { executeSagaReservation } = require('../../saga-orchestrator/orchestrator');
        const result = await executeSagaReservation({ propertyId, clientId, depositAmount, totalAmount });
        if (result.success) {
          return {
            success: true,
            message: 'Saga completada con éxito. Contrato generado y propiedad confirmada.',
            propertyId,
            paymentId: result.sagaLog.paymentId,
            contractNumber: String(result.sagaLog.contractId),
          };
        } else {
          return {
            success: false,
            message: `Saga compensada (Rollback ejecutado): ${result.error}`,
            propertyId,
          };
        }
      } catch (e) {
        return {
          success: false,
          message: `Error al orquestar Saga: ${e.message}`,
          propertyId,
        };
      }
    },

    cancelContract: async (_, { id, reason }) => {
      const res = await fetch(`${CONTRACTS_URL}/${id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      return await res.json();
    },
  },
};

async function startGateway() {
  const server = new ApolloServer({
    typeDefs,
    resolvers,
  });

  const { url } = await startStandaloneServer(server, {
    listen: { port: 4000 },
  });

  console.log(`=======================================================`);
  console.log(`🚀 [BFF GraphQL Gateway] listo en ${url}`);
  console.log(`📡 Agregando microservicios:`);
  console.log(`   - ms-contracts-spring (Postgres)  -> http://localhost:8081`);
  console.log(`   - ms-properties-nestjs (MongoDB)   -> http://localhost:3001`);
  console.log(`   - ms-billing-php (DynamoDB)       -> http://localhost:8002`);
  console.log(`=======================================================`);
}

startGateway().catch(console.error);
