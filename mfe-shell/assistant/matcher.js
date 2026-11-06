/**
 * CU05 — Comparador del asistente de ayuda (el mismo archivo lo usan el navegador y la evaluación en Node).
 *
 * Puntaje híbrido por cada pregunta frecuente:
 *  - semántico: similitud coseno entre el vector de la pregunta del usuario y los de la FAQ (MiniLM, 384 dim.)
 *  - palabras clave: coincidencia de raíces de palabras en español (compensa que MiniLM se entrenó en inglés)
 * Los vectores de la FAQ vienen precalculados en int8 (faq.embeddings.json) para que la descarga sea chica.
 */
(function (root) {
  const STOPWORDS = new Set(('a al algo como con cual cuales cuando de del donde el ella en es esa ese esta este esto '
    + 'hay la las le lo los me mi mis no o para pero por que quiero se si sin su sus te tengo ti tu tus un una uno unos '
    + 'y ya yo hago hacer puedo puede veo ver necesito quisiera saber favor hola buenas gracias habitat pro app').split(' '));

  // "¿Cómo reservo un departamento?" -> ["reserv", "departament"]
  function stems(text) {
    return String(text || '').toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9ñ\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w))
      .map((w) => (w.length > 5 ? w.slice(0, 6) : w)); // raíz simple: reservo/reservar/reserva -> reserv
  }

  function keywordScore(queryStems, entryStems) {
    if (!queryStems.length || !entryStems.size) return 0;
    let hits = 0;
    for (const s of queryStems) if (entryStems.has(s)) hits += 1;
    return hits / queryStems.length;
  }

  function decodeInt8(base64, dims) {
    const bin = typeof atob === 'function' ? atob(base64) : Buffer.from(base64, 'base64').toString('binary');
    const out = [];
    for (let i = 0; i < bin.length; i += dims) {
      const v = new Float32Array(dims);
      for (let j = 0; j < dims; j += 1) {
        const b = bin.charCodeAt(i + j);
        v[j] = (b > 127 ? b - 256 : b) / 127;
      }
      out.push(v);
    }
    return out;
  }

  function cosine(a, b) {
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i += 1) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
    return na && nb ? dot / Math.sqrt(na * nb) : 0;
  }

  /** Prepara la FAQ: une textos, raíces y vectores decodificados por entrada. */
  function prepare(faq, embeddings) {
    const vecById = new Map((embeddings?.entries || []).map((e) => [e.id, decodeInt8(e.vectors, embeddings.dims)]));
    return faq.entradas.map((e) => ({
      ...e,
      stems: new Set(stems([e.pregunta, ...(e.variantes || [])].join(' '))),
      vectors: vecById.get(e.id) || [],
    }));
  }

  const WEIGHTS = { semantic: 0.6, keyword: 0.4 };

  /**
   * Ordena las entradas visibles para el rol. `queryVector` puede ser null (sin modelo): solo palabras clave.
   * Devuelve [{ entry, score, semantic, keyword }] de mayor a menor.
   */
  function rank(prepared, queryText, queryVector, role) {
    const qs = stems(queryText);
    return prepared
      .filter((e) => e.roles.includes('TODOS') || e.roles.includes(role))
      .map((e) => {
        const semantic = queryVector && e.vectors.length ? Math.max(...e.vectors.map((v) => cosine(queryVector, v))) : 0;
        const keyword = keywordScore(qs, e.stems);
        const score = queryVector ? WEIGHTS.semantic * semantic + WEIGHTS.keyword * keyword : keyword;
        return { entry: e, score, semantic, keyword };
      })
      .sort((a, b) => b.score - a.score);
  }

  const api = { stems, rank, prepare, cosine, decodeInt8, WEIGHTS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HabitatAssistantMatcher = api;
})(typeof window !== 'undefined' ? window : globalThis);
