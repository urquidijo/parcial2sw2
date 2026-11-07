/**
 * Script de migración de imágenes de inmuebles a Amazon S3 (bucket sw2p2).
 * 1. Conecta a MongoDB Atlas (ms-properties-nestjs/.env)
 * 2. Descarga las imágenes actuales de las propiedades (o usa las fotos por defecto)
 * 3. Las sube al bucket S3 `sw2p2` bajo `properties/<code>-<idx>.jpg`
 * 4. Actualiza `image` y `photos` de cada propiedad en MongoDB Atlas para que apunten a S3.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const { MongoClient } = require('mongodb');

// Leer MONGO_URI de ms-properties-nestjs/.env
const msPropEnvPath = path.join(__dirname, '..', 'ms-properties-nestjs', '.env');
let mongoUri = process.env.MONGO_URI;
if (fs.existsSync(msPropEnvPath)) {
  const lines = fs.readFileSync(msPropEnvPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    if (line.startsWith('MONGO_URI=')) {
      mongoUri = line.slice('MONGO_URI='.length).trim();
    }
  }
}

const S3_BUCKET = process.env.S3_BUCKET || 'sw2p2';
const S3_REGION = process.env.AWS_REGION || 'us-east-1';
const accessKeyId = (process.env.AWS_ACCESS_KEY_ID || '').trim();
const secretAccessKey = (process.env.AWS_SECRET_ACCESS_KEY || '').trim();

function hmacSha256(key, data) {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest();
}

function sha256Hex(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

async function putObjectToS3({ key, body, contentType }) {
  const host = `${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(body);
  const canonicalUri = '/' + key.split('/').map(encodeURIComponent).join('/');

  const headersToSign = {
    'content-type': contentType,
    host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  const sortedHeaderKeys = Object.keys(headersToSign).sort();
  const canonicalHeaders = sortedHeaderKeys.map((k) => `${k}:${headersToSign[k]}\n`).join('');
  const signedHeaders = sortedHeaderKeys.join(';');

  const canonicalRequest = ['PUT', canonicalUri, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const credentialScope = `${dateStamp}/${S3_REGION}/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, sha256Hex(canonicalRequest)].join('\n');

  const kDate = hmacSha256(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmacSha256(kDate, S3_REGION);
  const kService = hmacSha256(kRegion, 's3');
  const kSigning = hmacSha256(kService, 'aws4_request');
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');

  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  const url = `https://${host}${canonicalUri}`;

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      Authorization: authorization,
    },
    body,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Error S3 (${res.status}): ${errText}`);
  }
  return url;
}

const FALLBACK_IMAGES = {
  DEPARTAMENTO: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=800&q=80',
  CASA: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=800&q=80',
  TERRENO: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=800&q=80',
  OFICINA: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=800&q=80',
  LOCAL_COMERCIAL: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=800&q=80',
  DEFAULT: 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=800&q=80',
};

async function downloadBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} al descargar ${url}`);
  const contentType = (res.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
  const arrayBuffer = await res.arrayBuffer();
  return { buffer: Buffer.from(arrayBuffer), contentType };
}

async function main() {
  console.log(`📦 Subiendo imagen por defecto a s3://${S3_BUCKET}/properties/default-property.jpg ...`);
  const defImg = await downloadBuffer(FALLBACK_IMAGES.DEFAULT);
  const defaultS3Url = await putObjectToS3({
    key: 'properties/default-property.jpg',
    body: defImg.buffer,
    contentType: defImg.contentType,
  });
  console.log(`✅ Imagen por defecto en S3: ${defaultS3Url}`);

  console.log(`\n🍃 Conectando a MongoDB Atlas...`);
  const client = new MongoClient(mongoUri);
  await client.connect();
  const db = client.db();
  const col = db.collection('properties');
  const properties = await col.find({}).toArray();
  console.log(`   Encontradas ${properties.length} propiedades en MongoDB.`);

  for (const prop of properties) {
    const code = prop.code || String(prop._id);
    const currentPhotos = Array.isArray(prop.photos) && prop.photos.length
      ? prop.photos
      : [prop.image || FALLBACK_IMAGES[prop.propertyType] || FALLBACK_IMAGES.DEFAULT];

    const newPhotos = [];
    for (let i = 0; i < currentPhotos.length; i++) {
      const srcUrl = currentPhotos[i];
      if (srcUrl && srcUrl.includes(`${S3_BUCKET}.s3.`)) {
        newPhotos.push(srcUrl);
        console.log(`   [${code}] Foto ${i + 1} ya está en S3: ${srcUrl}`);
        continue;
      }
      try {
        const { buffer, contentType } = await downloadBuffer(srcUrl);
        const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
        const key = `properties/${code}${currentPhotos.length > 1 ? `-${i + 1}` : ''}.${ext}`;
        const s3Url = await putObjectToS3({ key, body: buffer, contentType });
        newPhotos.push(s3Url);
        console.log(`   [${code}] ⬆️ Subida a S3 -> ${s3Url}`);
      } catch (err) {
        console.warn(`   [${code}] ⚠️ No se pudo migrar ${srcUrl} (${err.message}), usando default de S3.`);
        newPhotos.push(defaultS3Url);
      }
    }

    await col.updateOne(
      { _id: prop._id },
      { $set: { image: newPhotos[0] || defaultS3Url, photos: newPhotos } }
    );
  }

  await client.close();
  console.log(`\n🎉 Todas las propiedades ahora sirven sus imágenes desde Amazon S3 (${S3_BUCKET})!`);
}

main().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
