/**
 * CU05: mide la precisión del asistente con preguntas redactadas distinto a la FAQ (no están en las variantes).
 * Compara solo semántico (MiniLM), solo palabras clave y el híbrido que usa la app, y propone el umbral.
 * Uso: npm run eval
 */
const fs = require('fs');
const path = require('path');
const M = require('../../mfe-shell/assistant/matcher.js');

const DIR = path.join(__dirname, '..', '..', 'mfe-shell', 'assistant');
const faq = JSON.parse(fs.readFileSync(path.join(DIR, 'faq.json'), 'utf8'));
const emb = JSON.parse(fs.readFileSync(path.join(DIR, 'faq.embeddings.json'), 'utf8'));

// [rol, pregunta, id esperado]  (null = fuera de tema: no debería responder con la FAQ)
const TESTS = [
  ['CLIENTE', 'me gustaria conocer el depa antes de decidir', 'agendar-visita'],
  ['CLIENTE', 'como hago para apartar la casa que me gusto', 'reservar'],
  ['CLIENTE', 'devuelven la plata si me arrepiento', 'cancelar-reserva'],
  ['CLIENTE', 'donde firmo el contrato de compra', 'firmar-contrato'],
  ['CLIENTE', 'quiero que me llegue una notificacion al telefono', 'avisos-push'],
  ['CLIENTE', 'cuanto tiempo me guardan el inmueble reservado', 'que-son-arras'],
  ['CLIENTE', 'busco departamentos de 3 dormitorios en La Paz', 'buscar-inmueble'],
  ['CLIENTE', 'puedo mandarle un mensaje al agente sobre la casa', 'consultar-asesor'],
  ['CLIENTE', 'no tengo internet, igual puedo agendar?', 'sin-conexion'],
  ['CLIENTE', 'como pongo la app en el celular', 'instalar-app'],
  ['CLIENTE', 'donde estan mis citas', 'mis-visitas'],
  ['CLIENTE', 'como pago la mensualidad del alquiler', 'pagar-saldo'],
  ['CLIENTE', 'olvide la clave de mi cuenta', 'cuenta'],
  ['AGENTE', 'quiero subir un departamento nuevo para la venta', 'publicar-inmueble'],
  ['AGENTE', 'que precio le pongo a esta casa', 'estimar-precio'],
  ['AGENTE', 'puedo completar los datos con las fotos', 'autocompletar-fotos'],
  ['AGENTE', 'tengo visitas hoy?', 'agenda-agente'],
  ['AGENTE', 'cuanto me toca de comision', 'mis-comisiones'],
  ['AGENTE', 'los clientes me escribieron preguntas, donde las contesto', 'responder-consultas'],
  ['AGENTE', 'como cambio el precio publicado', 'editar-inmueble'],
  ['LEGAL', 'necesito hacer un contrato de alquiler', 'generar-contrato'],
  ['LEGAL', 'el contrato tiene un error, como lo invalido', 'anular-contrato'],
  ['FINANZAS', 'el cliente vino a pagar el saldo', 'cobrar'],
  ['FINANZAS', 'tengo que pagarle a carlos su comision', 'pagar-comision'],
  ['FINANZAS', 'cuanto ingreso este mes', 'dashboard'],
  ['ADMIN', 'contratamos un agente nuevo, como lo agrego', 'empleados'],
  ['ADMIN', 'quiero un informe en excel de los contratos', 'reportes-ia'],
  ['ADMIN', 'que perfiles de compradores tenemos', 'segmentos'],
  ['ADMIN', 'quiero que las alertas me lleguen al telegram', 'telegram'],
  ['ADMIN', 'que significa la campana', 'alertas-monitor'],
  ['CLIENTE', 'cual es la capital de francia', null],
  ['CLIENTE', 'recomiendame una receta de cocina', null],
  ['AGENTE', 'quien gano el partido ayer', null],
  ['ADMIN', 'cuantos inmuebles vendimos en octubre en equipetrol', null],
];

(async () => {
  const { pipeline } = await import('@huggingface/transformers');
  const embed = await pipeline('feature-extraction', emb.model, { dtype: emb.dtype });
  const prepared = M.prepare(faq, emb);

  const rows = [];
  for (const [role, q, expected] of TESTS) {
    const v = Array.from((await embed(q, { pooling: 'mean', normalize: true })).data);
    const hybrid = M.rank(prepared, q, v, role);
    const sem = [...hybrid].sort((a, b) => b.semantic - a.semantic);
    const kw = [...hybrid].sort((a, b) => b.keyword - a.keyword);
    rows.push({ role, q, expected, hybrid: hybrid[0], sem: sem[0], kw: kw[0], top3: hybrid.slice(0, 3).map((r) => r.entry.id) });
  }

  const inDomain = rows.filter((r) => r.expected);
  const acc = (key) => inDomain.filter((r) => r[key].entry.id === r.expected).length;
  console.log(`Precisión top-1 en ${inDomain.length} preguntas: semántico ${acc('sem')} · palabras clave ${acc('kw')} · híbrido ${acc('hybrid')}`);
  console.log(`Híbrido top-3: ${inDomain.filter((r) => r.top3.includes(r.expected)).length}/${inDomain.length}`);

  const DIRECT = 0.45;
  const direct = rows.filter((r) => r.expected && r.hybrid.score >= DIRECT && r.hybrid.entry.id === r.expected).length;
  const wrongDirect = rows.filter((r) => r.hybrid.score >= DIRECT && r.hybrid.entry.id !== r.expected).length;
  const suggested = rows.filter((r) => r.expected && r.hybrid.score < DIRECT && r.top3.includes(r.expected)).length;
  console.log(`Con umbral ${DIRECT}: ${direct} respondidas directo y bien · ${suggested} con la correcta entre las 3 sugerencias · ${wrongDirect} respuestas directas equivocadas`);
  for (const r of rows) {
    const mode = r.hybrid.score >= DIRECT ? "directa " : "sugiere ";
    const ok = r.expected ? (r.hybrid.score >= DIRECT ? r.hybrid.entry.id === r.expected : r.top3.includes(r.expected)) : r.hybrid.score < DIRECT;
    console.log(`${ok ? "OK " : "MAL"} ${mode}${r.hybrid.score.toFixed(2)} [${r.role}] ${r.q} → ${r.hybrid.score >= DIRECT ? r.hybrid.entry.id : r.top3.join(", ")}`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
