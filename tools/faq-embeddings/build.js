/**
 * CU05: calcula los vectores MiniLM de cada pregunta y variante de la FAQ y los guarda en int8
 * (mfe-shell/assistant/faq.embeddings.json). El navegador usa el MISMO modelo para la pregunta del usuario.
 * Uso (en tools/faq-embeddings): npm install && npm run build
 */
const fs = require('fs');
const path = require('path');

const MODEL = 'Xenova/all-MiniLM-L6-v2';
const FAQ = path.join(__dirname, '..', '..', 'mfe-shell', 'assistant', 'faq.json');
const OUT = path.join(__dirname, '..', '..', 'mfe-shell', 'assistant', 'faq.embeddings.json');

(async () => {
  const { pipeline } = await import('@huggingface/transformers');
  const embed = await pipeline('feature-extraction', MODEL, { dtype: 'q8' });
  const faq = JSON.parse(fs.readFileSync(FAQ, 'utf8'));
  const entries = [];
  let dims = 0;
  for (const e of faq.entradas) {
    const texts = [e.pregunta, ...(e.variantes || [])];
    const out = await embed(texts, { pooling: 'mean', normalize: true });
    dims = out.dims[1];
    const bytes = Buffer.alloc(texts.length * dims);
    for (let i = 0; i < out.data.length; i += 1) bytes.writeInt8(Math.max(-127, Math.min(127, Math.round(out.data[i] * 127))), i);
    entries.push({ id: e.id, count: texts.length, vectors: bytes.toString('base64') });
  }
  fs.writeFileSync(OUT, JSON.stringify({ model: MODEL, dtype: 'q8', dims, faqVersion: faq.version, entries }));
  const kb = Math.round(fs.statSync(OUT).size / 1024);
  console.log(`${entries.length} entradas, ${entries.reduce((s, e) => s + e.count, 0)} vectores de ${dims} dimensiones → ${path.relative(process.cwd(), OUT)} (${kb} KB)`);
})().catch((err) => { console.error(err); process.exit(1); });
