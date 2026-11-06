/**
 * Cuantiza a 8 bits (uint8) los pesos de un modelo de TensorFlow.js: ~4 veces más liviano.
 * Es lo mismo que hace `tensorflowjs_converter --quantize_uint8`: cada tensor float32 se guarda como
 * q = round((v - min) / scale) y TensorFlow.js lo reconstruye al cargar con v = q * scale + min.
 *
 *   node tools/quantize-model.js <url-o-carpeta-del-modelo-original> <carpeta-destino>
 *
 * Uso en el proyecto (CU04, COCO-SSD liviano):
 *   node tools/quantize-model.js https://storage.googleapis.com/tfjs-models/savedmodel/ssdlite_mobilenet_v2 models/coco-ssd-lite-uint8
 */
const fs = require('fs');
const path = require('path');

const SHARD_BYTES = 4 * 1024 * 1024;
const BYTES = { float32: 4, int32: 4, bool: 1 };

async function read(source, file) {
  if (/^https?:/.test(source)) {
    const res = await fetch(`${source.replace(/\/$/, '')}/${file}`);
    if (!res.ok) throw new Error(`HTTP ${res.status} al descargar ${file}`);
    return Buffer.from(await res.arrayBuffer());
  }
  return fs.readFileSync(path.join(source, file));
}

async function main() {
  const [source, outDir] = process.argv.slice(2);
  if (!source || !outDir) throw new Error('Uso: node tools/quantize-model.js <origen> <destino>');
  const model = JSON.parse((await read(source, 'model.json')).toString('utf8'));

  const outWeights = [];
  const outBuffers = [];
  let before = 0;
  for (const group of model.weightsManifest) {
    const data = Buffer.concat(await Promise.all(group.paths.map((p) => read(source, p))));
    before += data.length;
    let offset = 0;
    for (const w of group.weights) {
      const count = w.shape.reduce((a, b) => a * b, 1);
      const size = count * BYTES[w.dtype];
      const slice = data.subarray(offset, offset + size);
      offset += size;
      if (w.dtype !== 'float32' || w.quantization) {
        outWeights.push(w);
        outBuffers.push(Buffer.from(slice));
        continue;
      }
      const values = new Float32Array(slice.buffer.slice(slice.byteOffset, slice.byteOffset + size));
      let min = Infinity;
      let max = -Infinity;
      for (const v of values) { if (v < min) min = v; if (v > max) max = v; }
      const scale = max > min ? (max - min) / 255 : 1;
      const q = Buffer.alloc(count);
      for (let i = 0; i < count; i++) q[i] = Math.round((values[i] - min) / scale);
      outWeights.push({ ...w, quantization: { dtype: 'uint8', min, scale, original_dtype: 'float32' } });
      outBuffers.push(q);
    }
    if (offset !== data.length) throw new Error(`Los pesos no coinciden con el manifiesto (${offset} de ${data.length} bytes)`);
  }

  const all = Buffer.concat(outBuffers);
  const paths = [];
  fs.mkdirSync(outDir, { recursive: true });
  for (let i = 0, n = 1; i < all.length; i += SHARD_BYTES, n++) {
    const name = `group1-shard${n}of${Math.ceil(all.length / SHARD_BYTES)}.bin`;
    fs.writeFileSync(path.join(outDir, name), all.subarray(i, i + SHARD_BYTES));
    paths.push(name);
  }
  model.weightsManifest = [{ paths, weights: outWeights }];
  fs.writeFileSync(path.join(outDir, 'model.json'), JSON.stringify(model));
  const mb = (b) => (b / 1048576).toFixed(1) + ' MB';
  console.log(`Pesos: ${mb(before)} → ${mb(all.length)} en ${paths.length} archivo(s) · ${outDir}`);
}

main().catch((err) => { console.error(err.message); process.exit(1); });
