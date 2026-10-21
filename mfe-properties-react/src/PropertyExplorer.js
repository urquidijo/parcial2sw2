/**
 * Microfrontend: mfe-properties-react
 * Tecnología: React 18 (Custom Element / Web Component)
 * Responsabilidad: Catálogo inmobiliario, toolbar de filtros avanzados y fichas técnicas de inmuebles.
 */

(function () {
  const e = React.createElement;

  function PropertyCard({ property, onReserve, onVisit }) {
    const isDisponible = property.status === 'DISPONIBLE';
    const isReservado = property.status === 'RESERVADO';
    const isComprado = property.status === 'COMPRADO';

    const statusClass = isDisponible 
      ? 'status-disponible' 
      : isReservado 
        ? 'status-reservado' 
        : 'status-comprado';

    const statusLabel = isDisponible 
      ? '🟢 DISPONIBLE' 
      : isReservado 
        ? '🟡 EN RESERVA (48h)' 
        : '🔴 VENDIDO';

    return e('div', { className: 'property-card', key: property.id },
      // Imagen con badges flotantes
      e('div', { className: 'property-img' },
        e('img', {
          src: property.image || 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=800&q=80',
          alt: property.title,
          loading: 'lazy'
        }),
        e('span', { className: `badge-status ${statusClass}` }, statusLabel),
        e('span', { className: 'delivery-pill' }, property.deliveryType ? property.deliveryType.replace('_', ' ') : 'ENTREGA INMEDIATA'),
        e('span', { className: 'price-pill' }, `$${Number(property.price || 0).toLocaleString()} USD`)
      ),

      // Cuerpo de la propiedad
      e('div', { className: 'property-content' },
        e('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
          e('span', { className: 'folio-tag' }, `FOLIO: ${property.folioReal || property.code || '#' + property.id}`),
          e('span', { style: { fontSize: '0.75rem', fontWeight: 800, color: 'var(--brand)', textTransform: 'uppercase' } },
            property.type || property.propertyType || 'INMUEBLE'
          )
        ),
        e('h3', { className: 'property-title' }, property.title),
        e('div', { className: 'property-addr' }, `📍 ${property.zone || ''}, ${property.city || ''}`),

        // Grid de Especificaciones Técnicas
        e('div', { className: 'specs-grid' },
          e('div', null,
            e('span', null, 'Superficie'),
            e('strong', null, `${property.area || property.areaSquareMeters || 0} m²`)
          ),
          e('div', null,
            e('span', null, 'Dormitorios'),
            e('strong', null, property.rooms || 0)
          ),
          e('div', null,
            e('span', null, 'Baños'),
            e('strong', null, property.baths || property.bathrooms || 0)
          ),
          e('div', null,
            e('span', null, 'Parqueos'),
            e('strong', null, property.parking || property.parkingSlots || 0)
          )
        ),

        // Fila de Asesor y Arras
        e('div', { className: 'broker-line' },
          e('span', null, `👤 Asesor: ${property.brokerName || 'Carlos Broker'}`),
          e('span', { style: { color: 'var(--emerald)', fontWeight: 800 } },
            `Arras: $${Number(property.deposit || 5000).toLocaleString()} USD`
          )
        ),

        // Botones de acción
        e('div', { className: 'card-actions' },
          e('div', { className: 'actions-sub-row' },
            e('button', {
              className: 'btn btn-secondary',
              style: { flex: 1, padding: '0.65rem 0.5rem', fontSize: '0.82rem', fontWeight: 700 },
              onClick: () => onVisit(property)
            }, '📅 Visita'),

            isDisponible
              ? e('button', {
                  className: 'btn btn-brand',
                  style: { flex: 1.4, padding: '0.65rem 0.5rem', fontSize: '0.82rem', fontWeight: 800 },
                  onClick: () => onReserve(property)
                }, '⚡ Reservar con Arras')
              : e('button', {
                  className: 'btn btn-secondary',
                  style: { flex: 1.4, padding: '0.65rem 0.5rem', fontSize: '0.82rem', opacity: 0.6, cursor: 'not-allowed' },
                  disabled: true
                }, isReservado ? '🟡 En Trámite' : '🔴 No Disponible')
          )
        )
      )
    );
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

  function PropertyExplorerApp({ apiUrl }) {
    const [properties, setProperties] = React.useState([]);
    const [searchTerm, setSearchTerm] = React.useState('');
    const [typeFilter, setTypeFilter] = React.useState('ALL');
    const [statusFilter, setStatusFilter] = React.useState('ALL');
    const [cityFilter, setCityFilter] = React.useState('ALL');
    const [loading, setLoading] = React.useState(true);

    const baseApi = resolveApiUrl(apiUrl);

    const fetchProperties = React.useCallback(() => {
      setLoading(true);
      const url = `${baseApi}/properties`;
      fetch(url)
        .then(res => res.json())
        .then(result => {
          if (result && result.success && Array.isArray(result.data)) {
            setProperties(result.data);
          } else if (Array.isArray(result)) {
            setProperties(result);
          }
          setLoading(false);
        })
        .catch(err => {
          console.error('[mfe-properties-react] Error cargando catálogo:', err);
          setLoading(false);
        });
    }, [baseApi]);

    React.useEffect(() => {
      fetchProperties();

      const handleRefresh = () => fetchProperties();
      window.addEventListener('habitat:refresh:properties', handleRefresh);
      return () => window.removeEventListener('habitat:refresh:properties', handleRefresh);
    }, [fetchProperties]);

    const handleReserve = (property) => {
      window.dispatchEvent(new CustomEvent('habitat:reserve:start', {
        detail: property,
        bubbles: true
      }));
    };

    const handleVisit = (property) => {
      window.dispatchEvent(new CustomEvent('habitat:visit:start', {
        detail: property,
        bubbles: true
      }));
    };

    const filtered = properties.filter(p => {
      const matchType = typeFilter === 'ALL' || (p.type === typeFilter) || (p.propertyType === typeFilter);
      const matchStatus = statusFilter === 'ALL' || (p.status === statusFilter);
      const matchCity = cityFilter === 'ALL' || (p.city === cityFilter);
      const text = `${p.title || ''} ${p.city || ''} ${p.zone || ''} ${p.code || ''} ${p.folioReal || ''}`.toLowerCase();
      const matchSearch = !searchTerm || text.includes(searchTerm.toLowerCase());
      return matchType && matchStatus && matchCity && matchSearch;
    });

    return e('div', { className: 'mfe-properties-root' },
      // Badge indicador del Microfrontend
      e('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' } },
        e('div', { className: 'mfe-badge react' }, '⚛️ Microfrontend Catálogo & Marketplace (React 18 & MongoDB Atlas)'),
        e('span', { style: { fontSize: '0.8rem', color: 'var(--text-muted)' } }, `${filtered.length} inmueble(s) listados`)
      ),

      // Toolbar de Filtros Inmobiliarios idéntico al diseño original
      e('div', { className: 'filter-bar' },
        e('input', {
          type: 'text',
          className: 'search-input',
          placeholder: '🔍 Buscar por título, zona, ciudad o folio real...',
          value: searchTerm,
          onChange: (ev) => setSearchTerm(ev.target.value)
        }),

        e('select', {
          className: 'filter-select',
          value: typeFilter,
          onChange: (ev) => setTypeFilter(ev.target.value)
        },
          e('option', { value: 'ALL' }, '🏢 Todos los Tipos'),
          e('option', { value: 'DEPARTAMENTO' }, 'Departamentos'),
          e('option', { value: 'CASA' }, 'Casas Residenciales'),
          e('option', { value: 'TERRENO' }, 'Terrenos / Lotes')
        ),

        e('select', {
          className: 'filter-select',
          value: statusFilter,
          onChange: (ev) => setStatusFilter(ev.target.value)
        },
          e('option', { value: 'ALL' }, '🔘 Todos los Estados'),
          e('option', { value: 'DISPONIBLE' }, '🟢 Disponibles'),
          e('option', { value: 'RESERVADO' }, '🟡 En Reserva'),
          e('option', { value: 'COMPRADO' }, '🔴 Vendidos')
        ),

        e('select', {
          className: 'filter-select',
          value: cityFilter,
          onChange: (ev) => setCityFilter(ev.target.value)
        },
          e('option', { value: 'ALL' }, '📍 Todas las Ciudades'),
          e('option', { value: 'La Paz' }, 'La Paz'),
          e('option', { value: 'Santa Cruz' }, 'Santa Cruz'),
          e('option', { value: 'Cochabamba' }, 'Cochabamba')
        )
      ),

      // Contenido
      loading
        ? e('div', { style: { padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' } },
            '⏳ Consultando catálogo inmobiliario en MongoDB Atlas Cloud...'
          )
        : filtered.length === 0
          ? e('div', { style: { padding: '3rem', textAlign: 'center', background: 'white', borderRadius: '12px', border: '1px solid var(--border)', marginTop: '1.5rem' } },
              '🔍 No se encontraron propiedades que coincidan con los filtros seleccionados.'
            )
          : e('div', { className: 'properties-grid', style: { marginTop: '1.5rem' } },
              filtered.map(p => e(PropertyCard, {
                key: p.id,
                property: p,
                onReserve: handleReserve,
                onVisit: handleVisit
              }))
            )
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
    console.log('✅ [Microfrontend Registrado]: <mfe-properties> (React 18)');
  }
})();
