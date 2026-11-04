/**
 * Servidor MCP de Habitat Pro (Streamable HTTP, sin sesiones) — puerto 4100.
 *
 * Lo usa el gateway para los reportes con IA (CU20) y lo puede usar cualquier cliente MCP
 * (Claude Code, Claude Desktop, el agente monitor de CU21) enviando "Authorization: Bearer <token de Keycloak>".
 */
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { createMcpExpressApp } = require('@modelcontextprotocol/sdk/server/express.js');
const { TOOLS, ToolError } = require('./tools');

const PORT = Number(process.env.MCP_PORT || process.env.PORT || 4100);
const HOST = process.env.MCP_HOST || '127.0.0.1';

function buildServer() {
  const server = new McpServer({ name: 'habitat-pro', version: '1.0.0' });
  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: tool.inputSchema, annotations: { readOnlyHint: true } },
      async (args, extra) => {
        const authorization = extra.requestInfo?.headers?.authorization;
        try {
          const result = await tool.run(args || {}, authorization);
          return { content: [{ type: 'text', text: JSON.stringify(result) }] };
        } catch (err) {
          const message = err instanceof ToolError ? err.message : `Error interno: ${err.message}`;
          return { isError: true, content: [{ type: 'text', text: message }] };
        }
      }
    );
  }
  return server;
}

const app = createMcpExpressApp({ host: HOST });

app.post('/mcp', async (req, res) => {
  if (!String(req.headers.authorization || '').startsWith('Bearer ')) {
    return res.status(401).json({ jsonrpc: '2.0', error: { code: -32001, message: 'Falta el token de Keycloak (Authorization: Bearer ...)' }, id: null });
  }
  const server = buildServer();
  try {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      transport.close();
      server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error('[mcp] Error atendiendo la petición:', err);
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Error interno del servidor MCP' }, id: null });
    }
  }
});

// Sin sesiones: GET y DELETE no aplican.
const notAllowed = (req, res) => res.status(405).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Método no permitido' }, id: null });
app.get('/mcp', notAllowed);
app.delete('/mcp', notAllowed);
app.get('/health', (req, res) => res.json({ service: 'mcp-habitat-server', status: 'UP', tools: TOOLS.map((t) => t.name) }));

app.listen(PORT, HOST, () => {
  console.log(`[mcp] Servidor MCP de Habitat Pro en http://${HOST}:${PORT}/mcp (${TOOLS.length} herramientas de solo lectura)`);
});
