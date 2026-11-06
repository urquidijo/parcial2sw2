/**
 * Microfrontend: mfe-properties-react
 * Tecnología: React 18 (Custom Element / Web Component)
 * Responsabilidad: Catálogo inmobiliario (CU01), gestión de inmuebles (CU02) y consultas de clientes.
 */

(function () {
  const e = React.createElement;

  const DEFAULT_IMAGE = 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=800&q=80';
  const DEFAULT_CENTER = [-17.7833, -63.1821]; // Santa Cruz de la Sierra
  const STAFF_EDITORS = ['AGENTE', 'ADMIN'];
  const INQUIRY_ROLES = ['CLIENTE', 'AGENTE', 'ATENCION', 'ADMIN'];
  const INQUIRY_ANSWERERS = ['AGENTE', 'ATENCION', 'ADMIN'];
  const PROPERTY_TYPES = {
    DEPARTAMENTO: 'Departamento',
    CASA: 'Casa',
    TERRENO: 'Terreno / Lote',
    OFICINA: 'Oficina',
    LOCAL_COMERCIAL: 'Local comercial',
  };
  const DELIVERY_TYPES = { ENTREGA_INMEDIATA: 'Entrega inmediata', PREVENTA: 'Preventa', EN_CONSTRUCCION: 'En construcción' };

  const money = (value) => `$${Number(value || 0).toLocaleString()} USD`;
  const DATE_TIME = { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false };
  const formatDistance = (meters) => (meters < 1000 ? `a ${meters} m` : `a ${(meters / 1000).toFixed(1)} km`);
  const getUser = () => (window.HabitatAuth ? window.HabitatAuth.getUser() : null);
  const notify = (msg) => (typeof window.showToast === 'function' ? window.showToast(msg) : alert(msg));

  // Ícono de Lucide que provee el shell (window.HabitatIcons). Si el MFE corre solo, no muestra nada.
  function Icon({ name, size }) {
    const ref = React.useRef(null);
    React.useEffect(() => {
      const node = ref.current;
      const svg = window.HabitatIcons ? window.HabitatIcons.el(name, size || 16) : null;
      if (node) node.replaceChildren(...(svg ? [svg] : []));
    }, [name, size]);
    return e('span', { ref, className: 'icon', 'aria-hidden': 'true' });
  }
  const withIcon = (name, label, size) => e(React.Fragment, null, e(Icon, { name, size }), label);

  // Raíz desde donde se sirve este microfrontend (local: /mfe/properties/; producción: su dominio de Vercel).
  const MFE_BASE = (() => {
    try { return new URL('..', document.currentScript.src).href; } catch (_) { return `${window.location.origin}/mfe/properties/`; }
  })();

  function statusInfo(status) {
    if (status === 'DISPONIBLE') return { cls: 'status-disponible', label: 'Disponible' };
    if (status && status.startsWith('RESERVADO')) return { cls: 'status-reservado', label: 'Reservado (48 h)' };
    if (status === 'ALQUILADO') return { cls: 'status-alquilado', label: 'Alquilado' };
    return { cls: 'status-comprado', label: 'Vendido' };
  }

  function resolveApiUrl(attrUrl) {
    if (attrUrl && (attrUrl.startsWith('http://') || attrUrl.startsWith('https://'))) {
      return attrUrl.replace(/\/$/, '');
    }
    if (typeof window !== 'undefined' && window.API_URL) {
      return window.API_URL.replace(/\/$/, '');
    }
    if (typeof window !== 'undefined') {
      if (window.location.origin.includes('vercel.app')) {
        return 'https://api-gateway-production-c3ed.up.railway.app/api';
      }
      if (window.location.protocol !== 'file:') {
        return `${window.location.origin}/api`;
      }
    }
    return 'http://localhost:5000/api';
  }

  // Llamada al API Gateway; el shell adjunta el token de Keycloak a cada fetch.
  async function apiRequest(baseApi, path, options = {}) {
    const init = { ...options };
    if (init.body && typeof init.body !== 'string') {
      init.body = JSON.stringify(init.body);
      init.headers = { 'Content-Type': 'application/json', ...(init.headers || {}) };
    }
    const res = await fetch(`${baseApi}${path}`, init);
    const result = await res.json().catch(() => ({}));
    if (!res.ok || result.success === false) {
      throw new Error(result.message || `Error ${res.status}`);
    }
    return result.data !== undefined ? result.data : result;
  }

  function Modal({ title, onClose, children, footer, maxWidth }) {
    return e('div', { className: 'modal-backdrop open', onClick: (ev) => { if (ev.target === ev.currentTarget) onClose(); } },
      e('div', { className: 'modal-window', style: { maxWidth: maxWidth || 580 } },
        e('div', { className: 'modal-head' },
          e('h3', null, title),
          e('button', { onClick: onClose, className: 'modal-close', 'aria-label': 'Cerrar' }, e(Icon, { name: 'X', size: 18 }))
        ),
        e('div', { className: 'modal-body' }, children),
        footer ? e('div', { className: 'modal-foot' }, footer) : null
      )
    );
  }

  // Mapa Leaflet + OpenStreetMap. Con onPick, un clic en el mapa elige la ubicación.
  function LocationMap({ lat, lng, title, onPick, height }) {
    const containerRef = React.useRef(null);
    const mapRef = React.useRef(null);
    const markerRef = React.useRef(null);
    const hasPoint = Number.isFinite(lat) && Number.isFinite(lng);

    React.useEffect(() => {
      if (!window.L || !containerRef.current) return undefined;
      const map = window.L.map(containerRef.current, { scrollWheelZoom: false })
        .setView(hasPoint ? [lat, lng] : DEFAULT_CENTER, hasPoint ? 15 : 12);
      window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19,
      }).addTo(map);
      if (onPick) map.on('click', (ev) => onPick(ev.latlng.lat, ev.latlng.lng));
      mapRef.current = map;
      const timer = setTimeout(() => map.invalidateSize(), 250);
      return () => {
        clearTimeout(timer);
        map.remove();
        mapRef.current = null;
        markerRef.current = null;
      };
    }, []);

    React.useEffect(() => {
      const map = mapRef.current;
      if (!map || !hasPoint) return;
      if (markerRef.current) {
        markerRef.current.setLatLng([lat, lng]);
      } else {
        markerRef.current = window.L.marker([lat, lng]).addTo(map).bindPopup(title || 'Ubicación del inmueble');
      }
      map.setView([lat, lng], Math.max(map.getZoom(), 15));
    }, [lat, lng, hasPoint]);

    if (!window.L) return null;
    return e('div', { ref: containerRef, style: { height: height || 220, borderRadius: 6, border: '1px solid var(--border)' } });
  }

  function PropertyCard({ property, canEdit, onOpen, onEdit, onReserve, onVisit }) {
    const isDisponible = property.status === 'DISPONIBLE';
    const status = statusInfo(property.status);

    return e('div', { className: 'property-card' },
      e('div', { className: 'property-img', style: { cursor: 'pointer' }, onClick: () => onOpen(property) },
        e('img', { src: property.image || DEFAULT_IMAGE, alt: property.title, loading: 'lazy' }),
        e('span', { className: `badge-status ${status.cls}` }, status.label),
        e('span', { className: 'delivery-pill' }, DELIVERY_TYPES[property.deliveryType] || 'Entrega inmediata'),
        e('span', { className: 'price-pill' }, money(property.price))
      ),

      e('div', { className: 'property-content' },
        e('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' } },
          e('span', { className: 'folio-tag' }, property.folioReal || property.code),
          property.distanceMeters !== undefined
            ? e('span', { style: { fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' } }, withIcon('Navigation', formatDistance(property.distanceMeters), 13))
            : e('span', { style: { fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-muted)' } },
                PROPERTY_TYPES[property.propertyType] || property.propertyType || 'Inmueble')
        ),
        e('h3', { className: 'property-title', style: { cursor: 'pointer' }, onClick: () => onOpen(property) }, property.title),
        e('div', { className: 'property-addr' }, e(Icon, { name: 'MapPin', size: 14 }), `${property.zone || ''}, ${property.city || ''}`),

        e('div', { className: 'specs-grid' },
          e('div', null, e('span', null, 'Superficie'), e('strong', null, `${property.areaSquareMeters || 0} m²`)),
          e('div', null, e('span', null, 'Dormitorios'), e('strong', null, property.rooms || 0)),
          e('div', null, e('span', null, 'Baños'), e('strong', null, property.bathrooms || 0)),
          e('div', null, e('span', null, 'Parqueos'), e('strong', null, property.parkingSlots || 0))
        ),

        e('div', { className: 'broker-line' },
          e('span', null, `Asesor: ${property.brokerName || 'Carlos Broker'}`),
          e('span', { style: { color: 'var(--text-main)', fontWeight: 500 } }, `Arras ${money(property.deposit || 5000)}`)
        ),

        e('div', { className: 'card-actions' },
          e('div', { className: 'actions-sub-row' },
            e('button', {
              className: 'btn btn-secondary',
              style: { flex: 1 },
              onClick: () => onOpen(property)
            }, withIcon('Eye', 'Ver ficha', 14)),
            canEdit
              ? e('button', {
                  className: 'btn btn-secondary',
                  style: { flex: 1 },
                  onClick: () => onEdit(property)
                }, withIcon('Pencil', 'Editar', 14))
              : e('button', {
                  className: 'btn btn-secondary',
                  style: { flex: 1 },
                  onClick: () => onVisit(property)
                }, withIcon('Calendar', 'Agendar visita', 14))
          ),
          isDisponible
            ? e('button', {
                className: 'btn',
                style: { width: '100%' },
                onClick: () => onReserve(property)
              }, 'Reservar con arras')
            : e('button', {
                className: 'btn btn-secondary',
                style: { width: '100%' },
                disabled: true
              }, property.status && property.status.startsWith('RESERVADO') ? 'Reservado: en trámite' : 'No disponible')
        )
      )
    );
  }

  function InquiryForm({ baseApi, property }) {
    const [message, setMessage] = React.useState('');
    const [phone, setPhone] = React.useState('');
    const [sending, setSending] = React.useState(false);
    const [error, setError] = React.useState('');
    const [sent, setSent] = React.useState(false);

    const submit = async (ev) => {
      ev.preventDefault();
      setSending(true);
      setError('');
      try {
        const result = await apiRequest(baseApi, `/properties/${encodeURIComponent(property.code)}/inquiries`, {
          method: 'POST',
          body: { message, phone: phone || undefined },
        });
        // Sin conexión el shell la guarda en la cola y la envía al volver la red (CU22).
        setSent(result && result.queued ? 'queued' : true);
        setMessage('');
      } catch (err) {
        setError(err.message);
      } finally {
        setSending(false);
      }
    };

    if (sent) {
      return e('div', { className: sent === 'queued' ? 'notice warn' : 'notice' }, e(Icon, { name: sent === 'queued' ? 'CloudOff' : 'CircleCheck' }),
        e('div', null, sent === 'queued'
          ? 'Estás sin conexión: tu consulta quedó guardada y se enviará sola al volver la señal.'
          : 'Consulta enviada. Verás la respuesta del asesor en "Mis consultas".'));
    }

    return e('form', { onSubmit: submit, style: { display: 'flex', flexDirection: 'column', gap: '0.6rem', background: '#fafafa', border: '1px solid var(--border)', borderRadius: 6, padding: '0.9rem' } },
      e('strong', { style: { fontSize: '0.88rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.4rem' } }, withIcon('MessageSquare', 'Consultar al asesor')),
      e('textarea', {
        className: 'form-control', rows: 3, required: true, minLength: 5, maxLength: 1000,
        placeholder: '¿Está disponible para visitar este fin de semana? ¿El precio es negociable?',
        value: message, onChange: (ev) => setMessage(ev.target.value)
      }),
      e('input', { className: 'form-control', placeholder: 'Teléfono de contacto (opcional)', maxLength: 30, value: phone, onChange: (ev) => setPhone(ev.target.value) }),
      error ? e('div', { style: { color: 'var(--rose)', fontSize: '0.8rem' } }, error) : null,
      e('button', { type: 'submit', className: 'btn', disabled: sending }, sending ? 'Enviando…' : 'Enviar consulta')
    );
  }

  function PropertyDetail({ baseApi, property, user, onClose, onEdit, onReserve, onVisit }) {
    const photos = (property.photos && property.photos.length ? property.photos : [property.image || DEFAULT_IMAGE]);
    const [photoIndex, setPhotoIndex] = React.useState(0);
    const role = user ? user.role : null;
    const hasLocation = Number.isFinite(property.latitude) && Number.isFinite(property.longitude);
    const status = statusInfo(property.status);

    const spec = (label, value) => e('div', { style: { background: '#fafafa', border: '1px solid var(--border)', borderRadius: 6, padding: '0.5rem 0.7rem' } },
      e('div', { style: { fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 500 } }, label),
      e('div', { style: { fontWeight: 600, fontSize: '0.92rem' } }, value));

    const footer = [
      e('button', { key: 'close', className: 'btn btn-secondary', onClick: onClose }, 'Cerrar'),
      STAFF_EDITORS.includes(role) ? e('button', { key: 'edit', className: 'btn btn-secondary', onClick: () => onEdit(property) }, withIcon('Pencil', 'Editar', 14)) : null,
      e('button', { key: 'visit', className: 'btn btn-secondary', onClick: () => { onClose(); onVisit(property); } }, withIcon('Calendar', 'Agendar visita', 14)),
      property.status === 'DISPONIBLE'
        ? e('button', { key: 'reserve', className: 'btn', onClick: () => { onClose(); onReserve(property); } }, 'Reservar con arras')
        : null,
    ];

    return e(Modal, { title: property.title, onClose, footer, maxWidth: 880 },
      e('div', { style: { position: 'relative' } },
        e('img', { src: photos[photoIndex], alt: property.title, style: { width: '100%', height: 320, objectFit: 'cover', borderRadius: 8 } }),
        e('span', { className: `badge-status ${status.cls}`, style: { position: 'absolute', top: 12, left: 12 } }, status.label)
      ),
      photos.length > 1
        ? e('div', { style: { display: 'flex', gap: '0.5rem', overflowX: 'auto' } },
            photos.map((src, i) => e('img', {
              key: src + i, src, alt: `Foto ${i + 1}`, onClick: () => setPhotoIndex(i),
              style: { width: 84, height: 60, objectFit: 'cover', borderRadius: 6, cursor: 'pointer', border: i === photoIndex ? '2px solid var(--brand)' : '1px solid var(--border)' }
            })))
        : null,

      e('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' } },
        e('div', null,
          e('div', { style: { fontSize: '0.8rem', color: 'var(--text-muted)' } }, `${PROPERTY_TYPES[property.propertyType] || property.propertyType} · Folio ${property.folioReal || property.code}`),
          e('div', { style: { fontSize: '0.88rem', marginTop: '0.2rem', display: 'flex', alignItems: 'center', gap: '0.3rem' } }, e(Icon, { name: 'MapPin', size: 14 }), [property.address, property.zone, property.city].filter(Boolean).join(', ')),
          property.distanceMeters !== undefined ? e('div', { style: { fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500 } }, `Estás ${formatDistance(property.distanceMeters)}`) : null
        ),
        e('div', { style: { textAlign: 'right' } },
          e('div', { style: { fontSize: '1.4rem', fontWeight: 600 } }, money(property.price)),
          e('div', { style: { fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500 } }, `Arras para reservar: ${money(property.deposit || 5000)}`)
        )
      ),

      e('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.5rem' } },
        spec('Superficie', `${property.areaSquareMeters || 0} m²`),
        spec('Dormitorios', property.rooms || 0),
        spec('Baños', property.bathrooms || 0),
        spec('Parqueos', property.parkingSlots || 0),
        spec('Expensas', `$${property.maintenanceFee || 0}/mes`),
        spec('Entrega', DELIVERY_TYPES[property.deliveryType] || 'Inmediata')
      ),

      property.description ? e('p', { style: { fontSize: '0.9rem', lineHeight: 1.6, whiteSpace: 'pre-line' } }, property.description) : null,

      property.amenitiesList && property.amenitiesList.length
        ? e('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '0.4rem' } },
            property.amenitiesList.map((a) => e('span', { key: a, className: 'amenity-chip' }, a)))
        : null,

      hasLocation ? e(LocationMap, { lat: property.latitude, lng: property.longitude, title: property.title, height: 320 }) : null,

      e('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', color: 'var(--text-muted)', flexWrap: 'wrap', gap: '0.5rem' } },
        e('span', null, `Asesor: ${property.brokerName || 'Carlos Broker'}`),
        property.virtualTour3dUrl ? e('a', { href: property.virtualTour3dUrl, target: '_blank', rel: 'noopener noreferrer', style: { color: 'var(--brand)', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: '0.3rem', textDecoration: 'none' } }, withIcon('Box', 'Ver recorrido 3D', 14)) : null
      ),

      role === 'CLIENTE' ? e(InquiryForm, { baseApi, property }) : null
    );
  }

  function toFormState(property) {
    const p = property || {};
    const value = (v) => (v === undefined || v === null ? '' : String(v));
    return {
      title: value(p.title),
      propertyType: p.propertyType || 'DEPARTAMENTO',
      deliveryType: p.deliveryType || 'ENTREGA_INMEDIATA',
      description: value(p.description),
      price: value(p.price),
      deposit: value(p.deposit || 5000),
      maintenanceFee: value(p.maintenanceFee),
      areaSquareMeters: value(p.areaSquareMeters),
      rooms: value(p.rooms),
      bathrooms: value(p.bathrooms),
      parkingSlots: value(p.parkingSlots),
      city: value(p.city),
      zone: value(p.zone),
      address: value(p.address),
      latitude: value(p.latitude),
      longitude: value(p.longitude),
      amenities: (p.amenitiesList || []).join(', '),
      photos: (p.photos || []).join('\n'),
      virtualTour3dUrl: value(p.virtualTour3dUrl),
      folioReal: value(p.folioReal),
    };
  }

  function toPayload(form) {
    const number = (v) => (v === '' ? undefined : Number(v));
    const text = (v) => (v.trim() === '' ? undefined : v.trim());
    return {
      title: form.title.trim(),
      propertyType: form.propertyType,
      deliveryType: form.deliveryType,
      description: text(form.description),
      price: number(form.price),
      deposit: number(form.deposit),
      maintenanceFee: number(form.maintenanceFee),
      areaSquareMeters: number(form.areaSquareMeters),
      rooms: number(form.rooms),
      bathrooms: number(form.bathrooms),
      parkingSlots: number(form.parkingSlots),
      city: form.city.trim(),
      zone: form.zone.trim(),
      address: text(form.address),
      latitude: number(form.latitude),
      longitude: number(form.longitude),
      amenities: form.amenities.split(',').map((s) => s.trim()).filter(Boolean),
      photos: form.photos.split('\n').map((s) => s.trim()).filter(Boolean),
      virtualTour3dUrl: text(form.virtualTour3dUrl),
      folioReal: text(form.folioReal),
    };
  }

  // ---------------------------------------------------------------------------------------------
  // CU04: autocompletar la ficha desde fotos con IA LOCAL (Deep Learning en el navegador).
  // TensorFlow.js + COCO-SSD (detector de 80 tipos de objetos). Las fotos no salen del dispositivo.
  // El modelo está cuantizado a 8 bits (17 MB → 4,8 MB, ver tools/quantize-model.js) y se sirve desde
  // este mismo microfrontend; la librería y el modelo se descargan solo cuando el agente usa la función.
  // ---------------------------------------------------------------------------------------------
  const TFJS_URL = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js';
  const COCO_SSD_URL = 'https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js';
  const COCO_MODEL_URL = new URL('models/coco-ssd-lite-uint8/model.json', MFE_BASE).href;
  const MIN_SCORE = 0.5;
  const OBJECT_LABELS = {
    bed: 'cama', toilet: 'inodoro', sink: 'lavamanos', oven: 'horno', microwave: 'microondas', refrigerator: 'refrigerador',
    toaster: 'tostadora', couch: 'sofá', tv: 'televisor', 'dining table': 'mesa de comedor', chair: 'silla', car: 'auto',
    'potted plant': 'planta', bench: 'banco', vase: 'florero', laptop: 'computadora', clock: 'reloj', book: 'libro',
    bicycle: 'bicicleta', person: 'persona', motorcycle: 'moto', 'wine glass': 'copa', cup: 'taza', bowl: 'bol',
  };
  let detectorPromise = null;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) return resolve();
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error('No se pudo descargar la librería de IA. Revisa tu conexión.'));
      document.head.appendChild(script);
    });
  }

  function loadDetector() {
    if (!detectorPromise) {
      detectorPromise = loadScript(TFJS_URL)
        .then(() => loadScript(COCO_SSD_URL))
        .then(() => window.cocoSsd.load({ base: 'lite_mobilenet_v2', modelUrl: COCO_MODEL_URL }))
        .catch((err) => { detectorPromise = null; throw err; });
    }
    return detectorPromise;
  }

  function fileToImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`No se pudo leer la imagen ${file.name}`));
      img.src = URL.createObjectURL(file);
    });
  }

  // Sugerencias a partir de lo detectado: un dormitorio por foto con cama y un baño por foto con inodoro
  // (así un reflejo o dos inodoros en la misma foto no suman de más); parqueos = máximo de autos en una foto.
  function suggestionsFrom(results) {
    const photosWith = (cls) => results.filter((r) => r.detections.some((d) => d.class === cls)).length;
    const maxIn = (cls) => Math.max(0, ...results.map((r) => r.detections.filter((d) => d.class === cls).length));
    const any = (...classes) => results.some((r) => r.detections.some((d) => classes.includes(d.class)));
    const list = [];
    if (photosWith('bed')) list.push({ key: 'rooms', label: `Dormitorios: ${photosWith('bed')}`, field: 'rooms', value: String(photosWith('bed')) });
    if (photosWith('toilet')) list.push({ key: 'bathrooms', label: `Baños: ${photosWith('toilet')}`, field: 'bathrooms', value: String(photosWith('toilet')) });
    if (maxIn('car')) list.push({ key: 'parking', label: `Parqueos: ${maxIn('car')}`, field: 'parkingSlots', value: String(maxIn('car')) });
    if (any('oven', 'microwave', 'refrigerator', 'toaster')) list.push({ key: 'kitchen', label: 'Comodidad: Cocina equipada', amenity: 'Cocina equipada' });
    if (any('couch', 'dining table', 'tv', 'bed')) list.push({ key: 'furnished', label: 'Comodidad: Amoblado', amenity: 'Amoblado' });
    return list;
  }

  // Foto con los recuadros de lo detectado.
  function DetectionPreview({ result }) {
    const canvasRef = React.useRef(null);
    React.useEffect(() => {
      const canvas = canvasRef.current;
      const { img, detections } = result;
      const scale = Math.min(1, 320 / img.naturalWidth);
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      ctx.lineWidth = 2;
      ctx.font = '600 12px "Plus Jakarta Sans", sans-serif';
      for (const d of detections) {
        const [x, y, w, h] = d.bbox.map((v) => v * scale);
        const text = `${OBJECT_LABELS[d.class] || d.class} ${Math.round(d.score * 100)}%`;
        ctx.strokeStyle = '#1d4ed8';
        ctx.strokeRect(x, y, w, h);
        ctx.fillStyle = '#1d4ed8';
        ctx.fillRect(x, Math.max(0, y - 18), ctx.measureText(text).width + 8, 18);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(text, x + 4, Math.max(12, y - 5));
      }
    }, [result]);
    return e('figure', { style: { margin: 0, display: 'flex', flexDirection: 'column', gap: '0.25rem' } },
      e('canvas', { ref: canvasRef, style: { width: '100%', borderRadius: 6, border: '1px solid var(--border)' } }),
      e('figcaption', { className: 'hint' }, result.detections.length
        ? result.detections.map((d) => OBJECT_LABELS[d.class] || d.class).join(', ')
        : 'No se detectaron objetos conocidos'));
  }

  function PhotoAutofill({ onApply }) {
    const [status, setStatus] = React.useState('idle'); // idle | loading | analyzing | done
    const [error, setError] = React.useState('');
    const [results, setResults] = React.useState([]);
    const [selected, setSelected] = React.useState({});
    const [elapsed, setElapsed] = React.useState(0);
    const suggestions = suggestionsFrom(results);

    const analyze = async (fileList) => {
      const files = Array.from(fileList || []).filter((f) => f.type.startsWith('image/')).slice(0, 12);
      if (!files.length) return;
      setError('');
      setResults([]);
      try {
        setStatus('loading');
        const model = await loadDetector();
        setStatus('analyzing');
        const t0 = performance.now();
        const out = [];
        for (const file of files) {
          const img = await fileToImage(file);
          const detections = await model.detect(img, 20, MIN_SCORE);
          out.push({ name: file.name, img, detections });
          setResults([...out]);
        }
        setElapsed(Math.round(performance.now() - t0));
        setSelected(Object.fromEntries(suggestionsFrom(out).map((s) => [s.key, true])));
        setStatus('done');
      } catch (err) {
        setError(err.message);
        setStatus('idle');
      }
    };

    const busy = status === 'loading' || status === 'analyzing';
    return e('div', { style: { border: '1px dashed var(--border-strong)', borderRadius: 8, padding: '0.85rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.65rem', background: '#fafafa' } },
      e('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' } },
        e('div', null,
          e('strong', { style: { fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.4rem' } }, withIcon('ScanSearch', 'Autocompletar desde fotos', 16)),
          e('div', { className: 'hint' }, 'La IA reconoce camas, baños, cocina, muebles y autos en tus fotos y sugiere datos. Las fotos no salen de tu dispositivo.')),
        e('label', { className: 'btn btn-secondary', style: { cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1 } },
          withIcon('ImagePlus', busy ? 'Analizando…' : 'Elegir fotos', 14),
          e('input', { type: 'file', accept: 'image/*', multiple: true, disabled: busy, style: { display: 'none' }, onChange: (ev) => { analyze(ev.target.files); ev.target.value = ''; } }))),
      status === 'loading' ? e('div', { className: 'hint' }, 'Descargando el modelo de IA (≈5 MB, solo la primera vez)…') : null,
      status === 'analyzing' ? e('div', { className: 'hint' }, `Analizando foto ${results.length + 1}…`) : null,
      error ? e('div', { className: 'notice error' }, error) : null,
      results.length
        ? e('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '0.6rem' } },
            results.map((r, i) => e(DetectionPreview, { key: r.name + i, result: r })))
        : null,
      status === 'done'
        ? e('div', { style: { display: 'flex', flexDirection: 'column', gap: '0.4rem' } },
            suggestions.length
              ? e(React.Fragment, null,
                  e('div', { style: { fontSize: '0.84rem', fontWeight: 600 } }, 'Sugerencias (revísalas antes de aplicar)'),
                  suggestions.map((s) => e('label', { key: s.key, style: { display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.84rem' } },
                    e('input', { type: 'checkbox', checked: !!selected[s.key], onChange: (ev) => setSelected({ ...selected, [s.key]: ev.target.checked }) }),
                    s.label)),
                  e('div', { style: { display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' } },
                    e('button', { type: 'button', className: 'btn', onClick: () => onApply(suggestions.filter((s) => selected[s.key])) }, 'Aplicar sugerencias'),
                    e('span', { className: 'hint' }, `${results.length} foto(s) analizadas en ${(elapsed / 1000).toFixed(1)} s`)))
              : e('div', { className: 'hint' }, 'No se encontró nada para sugerir. Prueba con fotos de dormitorios, baños o la cocina.'),
            e('span', { className: 'demo-only demo-tag' }, 'TensorFlow.js · COCO-SSD lite (cuantizado 8 bits) · corre en el navegador'))
        : null
    );
  }

  // Lista desplegable con opción "Otra…" que abre un campo de texto (ciudad y zona del inmueble).
  const OTHER = '__otra__';
  function ChoiceOrText({ label, value, options, onChange, placeholder }) {
    const [other, setOther] = React.useState(false);
    React.useEffect(() => {
      // Un valor que no está en la lista (inmueble antiguo o ciudad nueva) se muestra como "Otra…"
      setOther(options.length > 0 && Boolean(value) && !options.includes(value));
    }, [options.join('|')]);
    const showSelect = options.length > 0;
    const showInput = !showSelect || other;
    return e('div', { className: 'form-group' },
      e('label', null, label),
      showSelect
        ? e('select', {
            className: 'form-control', required: !other, value: other ? OTHER : value,
            onChange: (ev) => {
              if (ev.target.value === OTHER) { setOther(true); onChange(''); } else { setOther(false); onChange(ev.target.value); }
            },
          },
            e('option', { value: '' }, 'Selecciona…'),
            options.map((o) => e('option', { key: o, value: o }, o)),
            e('option', { value: OTHER }, 'Otra…'))
        : null,
      showInput
        ? e('input', { className: 'form-control', required: true, maxLength: 60, value, placeholder, autoFocus: other, onChange: (ev) => onChange(ev.target.value) })
        : null,
      other ? e('span', { className: 'hint' }, 'No está en la lista: el precio estimado usará el promedio de la ciudad.') : null
    );
  }

  function PropertyForm({ baseApi, property, onClose, onSaved }) {
    const isEdit = !!property;
    const [form, setForm] = React.useState(() => toFormState(property));
    // Ciudades y zonas que conoce el modelo de precios (ms-ml-python); si no responde, quedan campos de texto.
    const [locations, setLocations] = React.useState({});
    React.useEffect(() => {
      apiRequest(baseApi, '/ml/locations').then((data) => setLocations(data.ciudades || {})).catch(() => setLocations({}));
    }, [baseApi]);
    const [saving, setSaving] = React.useState(false);
    const [error, setError] = React.useState('');
    const [locating, setLocating] = React.useState(false);
    const [estimate, setEstimate] = React.useState(null);
    const [estimating, setEstimating] = React.useState(false);
    const [estimateError, setEstimateError] = React.useState('');

    // CU03: precio sugerido por el modelo de random forest (ms-ml-python) a partir de los datos del formulario.
    const estimatePrice = async () => {
      setEstimateError('');
      if (!form.city.trim() || !(Number(form.areaSquareMeters) > 0)) {
        setEstimateError('Completa la ciudad y la superficie para estimar el precio.');
        return;
      }
      setEstimating(true);
      try {
        setEstimate(await apiRequest(baseApi, '/ml/predict-price', {
          method: 'POST',
          body: {
            ciudad: form.city.trim(),
            zona: form.zone.trim(),
            tipo: form.propertyType,
            entrega: form.deliveryType,
            superficie_m2: Number(form.areaSquareMeters),
            dormitorios: Number(form.rooms) || 0,
            banos: Number(form.bathrooms) || 0,
            parqueos: Number(form.parkingSlots) || 0,
            comodidades: form.amenities.split(',').map((s) => s.trim()).filter(Boolean).length,
          },
        }));
      } catch (err) {
        setEstimate(null);
        setEstimateError(err.message);
      } finally {
        setEstimating(false);
      }
    };

    const set = (field) => (ev) => {
      const val = ev.target.value;
      setForm((f) => ({ ...f, [field]: val }));
    };
    const pickLocation = (lat, lng) => setForm((f) => ({ ...f, latitude: lat.toFixed(6), longitude: lng.toFixed(6) }));

    // CU04: aplica al formulario las sugerencias que el agente marcó (campos numéricos y comodidades).
    const applyPhotoSuggestions = (items) => {
      setForm((f) => {
        const next = { ...f };
        const amenities = f.amenities.split(',').map((s) => s.trim()).filter(Boolean);
        for (const item of items) {
          if (item.field) next[item.field] = item.value;
          if (item.amenity && !amenities.some((a) => a.toLowerCase() === item.amenity.toLowerCase())) amenities.push(item.amenity);
        }
        next.amenities = amenities.join(', ');
        return next;
      });
      notify(items.length ? 'Sugerencias aplicadas al formulario. Revisa los datos antes de guardar.' : 'No marcaste ninguna sugerencia.');
    };

    const useMyLocation = () => {
      if (!navigator.geolocation) { setError('Tu navegador no permite obtener la ubicación.'); return; }
      setLocating(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => { pickLocation(pos.coords.latitude, pos.coords.longitude); setLocating(false); },
        () => { setError('No se pudo obtener tu ubicación. Marca el punto en el mapa.'); setLocating(false); },
        { timeout: 10000 }
      );
    };

    const submit = async (ev) => {
      ev.preventDefault();
      setSaving(true);
      setError('');
      try {
        const saved = await apiRequest(baseApi, isEdit ? `/properties/${encodeURIComponent(property.code)}` : '/properties', {
          method: isEdit ? 'PATCH' : 'POST',
          body: toPayload(form),
        });
        onSaved(saved, isEdit);
      } catch (err) {
        setError(err.message);
      } finally {
        setSaving(false);
      }
    };

    const field = (label, name, props = {}) => e('div', { className: 'form-group' },
      e('label', null, label),
      e('input', { className: 'form-control', value: form[name], onChange: set(name), ...props }));
    const row = (...children) => e('div', { style: { display: 'grid', gridTemplateColumns: `repeat(${children.length}, minmax(0, 1fr))`, gap: '0.75rem' } }, ...children);
    const select = (label, name, options) => e('div', { className: 'form-group' },
      e('label', null, label),
      e('select', { className: 'form-control', value: form[name], onChange: set(name) },
        Object.entries(options).map(([value, text]) => e('option', { key: value, value }, text))));

    const footer = [
      e('button', { key: 'cancel', type: 'button', className: 'btn btn-secondary', onClick: onClose }, 'Cancelar'),
      e('button', { key: 'save', type: 'submit', form: 'propertyForm', className: 'btn', disabled: saving }, saving ? 'Guardando…' : (isEdit ? 'Guardar cambios' : 'Publicar inmueble')),
    ];

    return e(Modal, { title: isEdit ? `Editar ${property.code}` : 'Publicar nuevo inmueble', onClose, footer, maxWidth: 760 },
      e('form', { id: 'propertyForm', onSubmit: submit, style: { display: 'flex', flexDirection: 'column', gap: '0.9rem' } },
        field('Título *', 'title', { required: true, minLength: 5, maxLength: 120, placeholder: 'Departamento moderno con balcón' }),
        row(select('Tipo *', 'propertyType', PROPERTY_TYPES), select('Entrega', 'deliveryType', DELIVERY_TYPES)),
        e('div', { className: 'form-group' },
          e('label', null, 'Descripción'),
          e('textarea', { className: 'form-control', rows: 3, maxLength: 2000, value: form.description, onChange: set('description') })),
        e(PhotoAutofill, { onApply: applyPhotoSuggestions }),
        row(
          field('Precio (USD) *', 'price', { type: 'number', min: 1, step: 'any', required: true }),
          field('Arras (USD)', 'deposit', { type: 'number', min: 0, step: 'any' }),
          field('Expensas (USD/mes)', 'maintenanceFee', { type: 'number', min: 0, step: 'any' })
        ),
        e('div', { style: { display: 'flex', flexDirection: 'column', gap: '0.5rem' } },
          e('div', { style: { display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' } },
            e('button', { type: 'button', className: 'btn btn-secondary', onClick: estimatePrice, disabled: estimating },
              withIcon('Sparkles', estimating ? 'Estimando…' : 'Estimar precio', 14)),
            e('span', { className: 'hint' }, 'Sugerencia del modelo de ML según ciudad, zona, tipo, superficie y ambientes.')),
          estimateError ? e('div', { className: 'notice error' }, estimateError) : null,
          estimate ? e('div', { className: 'notice', style: { alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' } },
            e('div', null,
              e('div', null, 'Precio sugerido: ', e('strong', null, money(estimate.precio_estimado_usd))),
              e('div', { className: 'hint' },
                `Rango probable ${money(estimate.rango_usd[0])} – ${money(estimate.rango_usd[1])} · ${money(estimate.precio_m2_usd)}/m²`),
              estimate.avisos.map((a) => e('div', { key: a, className: 'hint', style: { color: 'var(--amber)' } }, a))),
            e('button', { type: 'button', className: 'btn', onClick: () => setForm((f) => ({ ...f, price: String(estimate.precio_estimado_usd) })) }, 'Usar este precio'))
            : null
        ),
        row(
          field('Superficie (m²) *', 'areaSquareMeters', { type: 'number', min: 1, step: 'any', required: true }),
          field('Dormitorios', 'rooms', { type: 'number', min: 0, step: 1 }),
          field('Baños', 'bathrooms', { type: 'number', min: 0, step: 1 }),
          field('Parqueos', 'parkingSlots', { type: 'number', min: 0, step: 1 })
        ),
        row(
          e(ChoiceOrText, {
            label: 'Ciudad *', value: form.city, options: Object.keys(locations), placeholder: 'Escribe la ciudad',
            onChange: (city) => setForm((f) => ({ ...f, city, zone: (locations[city] || []).includes(f.zone) ? f.zone : '' })),
          }),
          e(ChoiceOrText, {
            label: 'Zona *', value: form.zone, options: locations[form.city] || [], placeholder: 'Escribe la zona o barrio',
            onChange: (zone) => setForm((f) => ({ ...f, zone })),
          })
        ),
        field('Dirección', 'address', { maxLength: 200, placeholder: 'Calle, número, edificio' }),
        e('div', { className: 'form-group' },
          e('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
            e('label', null, 'Ubicación en el mapa (haz clic para marcarla)'),
            e('button', { type: 'button', className: 'btn btn-secondary', style: { padding: '0.3rem 0.7rem', fontSize: '0.78rem' }, onClick: useMyLocation, disabled: locating },
              withIcon('LocateFixed', locating ? 'Ubicando…' : 'Usar mi ubicación', 14))),
          e(LocationMap, { lat: parseFloat(form.latitude), lng: parseFloat(form.longitude), onPick: pickLocation, height: 200 }),
          row(
            field('Latitud', 'latitude', { type: 'number', step: 'any', min: -90, max: 90 }),
            field('Longitud', 'longitude', { type: 'number', step: 'any', min: -180, max: 180 })
          )
        ),
        field('Comodidades (separadas por coma)', 'amenities', { placeholder: 'Piscina, Gimnasio, Seguridad 24/7' }),
        e('div', { className: 'form-group' },
          e('label', null, 'Fotos (una URL por línea; la primera es la principal)'),
          e('textarea', { className: 'form-control', rows: 3, value: form.photos, onChange: set('photos'), placeholder: 'https://…' }),
          e('small', { style: { color: 'var(--text-muted)' } }, 'Por ahora las fotos se cargan como enlaces; pronto se podrán subir archivos.')),
        row(
          field('Recorrido 3D (URL)', 'virtualTour3dUrl', { type: 'url' }),
          field('Folio real', 'folioReal')
        ),
        error ? e('div', { className: 'notice error' }, error) : null
      )
    );
  }

  function InquiriesPanel({ baseApi, user }) {
    const [items, setItems] = React.useState([]);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState('');
    const [drafts, setDrafts] = React.useState({});
    const canAnswer = INQUIRY_ANSWERERS.includes(user.role);

    const load = React.useCallback(async () => {
      setLoading(true);
      setError('');
      try {
        setItems(await apiRequest(baseApi, '/inquiries'));
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }, [baseApi]);

    React.useEffect(() => { load(); }, [load]);

    const answer = async (id) => {
      try {
        await apiRequest(baseApi, `/inquiries/${id}/answer`, { method: 'PATCH', body: { answer: drafts[id] || '' } });
        notify('Respuesta enviada al cliente.');
        setDrafts((d) => ({ ...d, [id]: '' }));
        load();
      } catch (err) {
        alert(err.message);
      }
    };

    if (loading) return e('div', { style: { padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' } }, 'Cargando consultas…');
    if (error) return e('div', { className: 'notice error' }, error);
    if (!items.length) {
      return e('div', { style: { padding: '2.5rem', textAlign: 'center', background: 'white', borderRadius: 8, border: '1px solid var(--border)', color: 'var(--text-muted)' } },
        canAnswer ? 'No hay consultas de clientes todavía.' : 'Aún no enviaste consultas. Abre la ficha de un inmueble para preguntar al asesor.');
    }

    return e('div', { style: { display: 'flex', flexDirection: 'column', gap: '0.75rem' } },
      items.map((q) => e('div', { key: q.id, style: { background: 'white', border: '1px solid var(--border)', borderRadius: 8, padding: '0.9rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.45rem' } },
        e('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' } },
          e('div', null, e('strong', { style: { fontWeight: 600 } }, q.propertyTitle), e('span', { className: 'folio-tag', style: { marginLeft: '0.5rem' } }, q.propertyId)),
          e('span', { className: `status-pill ${q.status === 'PENDIENTE' ? 'warn' : 'ok'}` },
            q.status === 'PENDIENTE' ? 'Pendiente' : 'Respondida')
        ),
        canAnswer
          ? e('div', { style: { fontSize: '0.8rem', color: 'var(--text-muted)' } },
              `${q.clientName}${q.clientEmail ? ' · ' + q.clientEmail : ''}${q.clientPhone ? ' · ' + q.clientPhone : ''} · ${new Date(q.createdAt).toLocaleString('es-BO', DATE_TIME)}`)
          : e('div', { style: { fontSize: '0.8rem', color: 'var(--text-muted)' } }, new Date(q.createdAt).toLocaleString('es-BO', DATE_TIME)),
        e('div', { style: { fontSize: '0.88rem' } }, q.message),
        q.answer
          ? e('div', { style: { background: '#fafafa', border: '1px solid var(--border)', borderRadius: 6, padding: '0.6rem 0.8rem', fontSize: '0.86rem' } },
              e('strong', null, `Respuesta de ${q.answeredBy}: `), q.answer)
          : canAnswer
            ? e('div', { style: { display: 'flex', gap: '0.5rem' } },
                e('input', {
                  className: 'form-control', placeholder: 'Escribe la respuesta…', maxLength: 1000,
                  value: drafts[q.id] || '', onChange: (ev) => { const val = ev.target.value; setDrafts((d) => ({ ...d, [q.id]: val })); }
                }),
                e('button', { className: 'btn', onClick: () => answer(q.id), disabled: !(drafts[q.id] || '').trim() }, 'Responder'))
            : e('div', { style: { fontSize: '0.8rem', color: 'var(--text-muted)' } }, 'El asesor aún no respondió.')
      ))
    );
  }

  function PropertyExplorerApp({ apiUrl }) {
    const [properties, setProperties] = React.useState([]);
    const [user, setUser] = React.useState(getUser());
    const [tab, setTab] = React.useState('catalogo');
    const [searchTerm, setSearchTerm] = React.useState('');
    const [typeFilter, setTypeFilter] = React.useState('ALL');
    const [statusFilter, setStatusFilter] = React.useState('ALL');
    const [cityFilter, setCityFilter] = React.useState('ALL');
    const [loading, setLoading] = React.useState(true);
    const [selected, setSelected] = React.useState(null);
    const [editing, setEditing] = React.useState(null); // null | 'new' | propiedad
    const [radiusKm, setRadiusKm] = React.useState(5);
    const [nearby, setNearby] = React.useState(null);
    const [geoState, setGeoState] = React.useState({ loading: false, error: '' });

    const baseApi = resolveApiUrl(apiUrl);
    const role = user ? user.role : null;
    const canEdit = STAFF_EDITORS.includes(role);

    const fetchProperties = React.useCallback(() => {
      setLoading(true);
      apiRequest(baseApi, '/properties')
        .then((data) => setProperties(Array.isArray(data) ? data : []))
        .catch((err) => console.error('[mfe-properties-react] Error cargando catálogo:', err))
        .finally(() => setLoading(false));
    }, [baseApi]);

    React.useEffect(() => {
      fetchProperties();
      const handleRefresh = () => {
        setUser(getUser());
        fetchProperties();
      };
      window.addEventListener('habitat:refresh:properties', handleRefresh);
      return () => window.removeEventListener('habitat:refresh:properties', handleRefresh);
    }, [fetchProperties]);

    const handleReserve = (property) => {
      window.dispatchEvent(new CustomEvent('habitat:reserve:start', { detail: property, bubbles: true }));
    };
    const handleVisit = (property) => {
      window.dispatchEvent(new CustomEvent('habitat:visit:start', { detail: property, bubbles: true }));
    };

    const searchNearMe = () => {
      if (!navigator.geolocation) {
        setGeoState({ loading: false, error: 'Tu navegador no permite obtener la ubicación.' });
        return;
      }
      setGeoState({ loading: true, error: '' });
      navigator.geolocation.getCurrentPosition(async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const items = await apiRequest(baseApi, `/properties/search/geo?lat=${latitude}&lng=${longitude}&distance=${radiusKm * 1000}`);
          setNearby({ items, radiusKm });
          setGeoState({ loading: false, error: '' });
        } catch (err) {
          setGeoState({ loading: false, error: err.message });
        }
      }, (err) => {
        setGeoState({ loading: false, error: err.code === 1 ? 'Permiso de ubicación denegado en el navegador.' : 'No se pudo obtener tu ubicación.' });
      }, { timeout: 10000 });
    };

    const handleSaved = (saved, isEdit) => {
      setEditing(null);
      setSelected(null);
      notify(isEdit ? `Inmueble ${saved.code} actualizado.` : `Inmueble ${saved.code} publicado en el catálogo.`);
      if (typeof window.cargarPropiedadesDesdeBD === 'function') window.cargarPropiedadesDesdeBD();
      else fetchProperties();
    };

    const source = nearby ? nearby.items : properties;
    const cities = Array.from(new Set(properties.map((p) => p.city).filter(Boolean))).sort();
    const types = Array.from(new Set(properties.map((p) => p.propertyType).filter(Boolean)));

    const filtered = source.filter((p) => {
      const matchType = typeFilter === 'ALL' || p.propertyType === typeFilter;
      const matchStatus = statusFilter === 'ALL' || p.status === statusFilter || (statusFilter === 'RESERVADO' && p.status && p.status.startsWith('RESERVADO'));
      const matchCity = cityFilter === 'ALL' || p.city === cityFilter;
      const text = `${p.title || ''} ${p.city || ''} ${p.zone || ''} ${p.code || ''} ${p.folioReal || ''}`.toLowerCase();
      const matchSearch = !searchTerm || text.includes(searchTerm.toLowerCase());
      return matchType && matchStatus && matchCity && matchSearch;
    });

    const tabButton = (id, icon, label) => e('button', {
      className: tab === id ? 'filter-chip active' : 'filter-chip',
      style: { display: 'inline-flex', alignItems: 'center', gap: '0.35rem' },
      onClick: () => setTab(id)
    }, withIcon(icon, label, 14));

    return e('div', { className: 'mfe-properties-root' },
      e('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', gap: '0.75rem', flexWrap: 'wrap' } },
        e('h2', { style: { fontSize: '1.1rem' } }, tab === 'consultas' ? 'Consultas' : 'Catálogo'),
        e('div', { style: { display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' } },
          INQUIRY_ROLES.includes(role)
            ? e(React.Fragment, null, tabButton('catalogo', 'House', 'Catálogo'), tabButton('consultas', 'MessageSquare', role === 'CLIENTE' ? 'Mis consultas' : 'Consultas de clientes'))
            : null,
          canEdit ? e('button', { className: 'btn', onClick: () => setEditing('new') }, withIcon('Plus', 'Publicar inmueble', 14)) : null
        )
      ),

      tab === 'consultas' && user
        ? e(InquiriesPanel, { baseApi, user })
        : e(React.Fragment, null,
            e('div', { className: 'filter-bar' },
              e('input', {
                type: 'text', className: 'search-input', placeholder: 'Buscar por título, zona, ciudad o folio',
                value: searchTerm, onChange: (ev) => setSearchTerm(ev.target.value)
              }),
              e('select', { className: 'filter-select', value: typeFilter, onChange: (ev) => setTypeFilter(ev.target.value) },
                e('option', { value: 'ALL' }, 'Todos los tipos'),
                types.map((t) => e('option', { key: t, value: t }, PROPERTY_TYPES[t] || t))
              ),
              e('select', { className: 'filter-select', value: statusFilter, onChange: (ev) => setStatusFilter(ev.target.value) },
                e('option', { value: 'ALL' }, 'Todos los estados'),
                e('option', { value: 'DISPONIBLE' }, 'Disponibles'),
                e('option', { value: 'RESERVADO' }, 'Reservados'),
                e('option', { value: 'COMPRADO' }, 'Vendidos'),
                e('option', { value: 'ALQUILADO' }, 'Alquilados')
              ),
              e('select', { className: 'filter-select', value: cityFilter, onChange: (ev) => setCityFilter(ev.target.value) },
                e('option', { value: 'ALL' }, 'Todas las ciudades'),
                cities.map((c) => e('option', { key: c, value: c }, c))
              ),
              e('select', { className: 'filter-select', value: radiusKm, onChange: (ev) => setRadiusKm(Number(ev.target.value)), title: 'Radio de búsqueda' },
                [2, 5, 10, 25, 50].map((km) => e('option', { key: km, value: km }, `Radio ${km} km`))
              ),
              e('button', { className: 'btn btn-secondary', onClick: searchNearMe, disabled: geoState.loading, style: { whiteSpace: 'nowrap' } },
                withIcon('LocateFixed', geoState.loading ? 'Ubicando…' : 'Cerca de mí', 14))
            ),

            geoState.error ? e('div', { className: 'notice error', style: { marginTop: '0.75rem' } }, geoState.error) : null,
            nearby
              ? e('div', { style: { marginTop: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', background: '#fafafa', border: '1px solid var(--border)', borderRadius: 6, padding: '0.55rem 0.9rem', fontSize: '0.84rem' } },
                  e('span', null, `${nearby.items.length} inmueble(s) a menos de ${nearby.radiusKm} km de tu ubicación, del más cercano al más lejano.`),
                  e('button', { className: 'btn btn-secondary', style: { padding: '0.3rem 0.7rem', fontSize: '0.78rem' }, onClick: () => setNearby(null) }, 'Ver todo el catálogo'))
              : null,

            e('div', { style: { marginTop: '0.75rem', fontSize: '0.8rem', color: 'var(--text-muted)' } }, `${filtered.length} inmueble(s) listados`),

            loading
              ? e('div', { style: { padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' } }, 'Cargando inmuebles…')
              : filtered.length === 0
                ? e('div', { style: { padding: '2.5rem', textAlign: 'center', background: 'white', borderRadius: 8, border: '1px solid var(--border)', marginTop: '1rem', color: 'var(--text-muted)' } },
                    nearby ? `No hay inmuebles a menos de ${nearby.radiusKm} km. Prueba con un radio mayor.` : 'Ningún inmueble coincide con los filtros.')
                : e('div', { className: 'properties-grid', style: { marginTop: '1rem' } },
                    filtered.map((p) => e(PropertyCard, {
                      key: p.id, property: p, canEdit,
                      onOpen: setSelected, onEdit: setEditing, onReserve: handleReserve, onVisit: handleVisit
                    }))
                  )
          ),

      selected && !editing
        ? e(PropertyDetail, {
            baseApi, property: selected, user,
            onClose: () => setSelected(null),
            onEdit: (p) => setEditing(p),
            onReserve: handleReserve, onVisit: handleVisit
          })
        : null,

      editing
        ? e(PropertyForm, {
            baseApi,
            property: editing === 'new' ? null : editing,
            onClose: () => setEditing(null),
            onSaved: handleSaved
          })
        : null
    );
  }

  // Definición del Web Component <mfe-properties>
  class MfePropertiesElement extends HTMLElement {
    connectedCallback() {
      const apiUrl = resolveApiUrl(this.getAttribute('api-url'));
      this.root = ReactDOM.createRoot(this);
      this.root.render(e(PropertyExplorerApp, { apiUrl }));
    }

    disconnectedCallback() {
      if (this.root) {
        this.root.unmount();
      }
    }
  }

  if (!customElements.get('mfe-properties')) {
    customElements.define('mfe-properties', MfePropertiesElement);
    console.log('[Microfrontend registrado] <mfe-properties> (React 18)');
  }
})();
