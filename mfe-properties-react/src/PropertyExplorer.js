/**
 * Microfrontend: mfe-properties-react
 * Tecnología: React 18 (Custom Element / Web Component)
 * Responsabilidad: Catálogo inmobiliario, filtros polimórficos y tarjetas de propiedades.
 */

(function () {
  const e = React.createElement;

  function PropertyCard({ property, onReserve, onVisit }) {
    const isDisponible = property.status === 'DISPONIBLE';

    return e('div', { className: 'prop-card', key: property.id },
      e('div', { className: 'prop-card-img-wrapper' },
        e('img', {
          src: property.image || 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=600&q=80',
          alt: property.title,
          className: 'prop-card-img'
        }),
        e('span', { className: `badge-status badge-${property.status ? property.status.toLowerCase() : 'disponible'}` },
          property.status || 'DISPONIBLE'
        ),
        e('span', { className: 'badge-type' }, property.type || property.propertyType || 'INMUEBLE')
      ),
      e('div', { className: 'prop-card-body' },
        e('div', { className: 'prop-card-code' }, `Ref: #${property.code || property.id}`),
        e('h3', { className: 'prop-card-title' }, property.title),
        e('p', { className: 'prop-card-loc' }, `📍 ${property.zone || ''}, ${property.city || ''}`),
        e('div', { className: 'prop-card-features' },
          property.area ? e('span', null, `📐 ${property.area} m²`) : null,
          property.rooms > 0 ? e('span', null, `🛏️ ${property.rooms} dorm.`) : null,
          property.baths > 0 ? e('span', null, `🚿 ${property.baths} baños`) : null,
          property.parking > 0 ? e('span', null, `🚗 ${property.parking} estac.`) : null
        ),
        e('div', { className: 'prop-card-price-row' },
          e('div', null,
            e('span', { className: 'price-label' }, 'Precio de Venta'),
            e('div', { className: 'price-val' }, `$${Number(property.price || 0).toLocaleString()} USD`)
          ),
          e('div', { style: { textAlign: 'right' } },
            e('span', { className: 'price-label' }, 'Arras Requeridas'),
            e('div', { className: 'deposit-val' }, `$${Number(property.deposit || 5000).toLocaleString()} USD`)
          )
        ),
        e('div', { className: 'prop-card-actions' },
          e('button', {
            className: 'btn-secondary btn-sm',
            onClick: () => onVisit(property)
          }, '📅 Visita'),
          isDisponible ? e('button', {
            className: 'btn-primary btn-sm',
            onClick: () => onReserve(property)
          }, '⚡ Reservar con Arras') : e('button', {
            className: 'btn-disabled btn-sm',
            disabled: true
          }, 'No Disponible')
        )
      )
    );
  }

  function PropertyExplorerApp({ apiUrl }) {
    const [properties, setProperties] = React.useState([]);
    const [filterType, setFilterType] = React.useState('TODOS');
    const [searchTerm, setSearchTerm] = React.useState('');
    const [loading, setLoading] = React.useState(true);

    const fetchProperties = React.useCallback(() => {
      setLoading(true);
      const url = `${apiUrl || window.API_URL || 'http://localhost:5000/api'}/properties`;
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
    }, [apiUrl]);

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
      const matchType = filterType === 'TODOS' || (p.type === filterType) || (p.propertyType === filterType);
      const text = `${p.title || ''} ${p.city || ''} ${p.zone || ''} ${p.code || ''}`.toLowerCase();
      const matchSearch = !searchTerm || text.includes(searchTerm.toLowerCase());
      return matchType && matchSearch;
    });

    return e('div', { className: 'mfe-properties-root' },
      e('div', { className: 'mfe-header-bar' },
        e('div', { className: 'mfe-badge react' }, '⚛️ Microfrontend Catálogo (React 18 & MongoDB Atlas)'),
        e('div', { className: 'mfe-filters' },
          ['TODOS', 'DEPARTAMENTO', 'CASA', 'TERRENO'].map(type =>
            e('button', {
              key: type,
              className: `filter-chip ${filterType === type ? 'active' : ''}`,
              onClick: () => setFilterType(type)
            }, type === 'TODOS' ? '🌐 Todos' : type === 'DEPARTAMENTO' ? '🏢 Departamentos' : type === 'CASA' ? '🏡 Casas' : '🏞️ Terrenos')
          )
        )
      ),
      loading
        ? e('div', { className: 'mfe-loading' }, '⏳ Conectando con ms-properties-nestjs en MongoDB Atlas...')
        : filtered.length === 0
          ? e('div', { className: 'mfe-empty' }, 'No se encontraron inmuebles con los criterios seleccionados.')
          : e('div', { className: 'properties-grid' },
              filtered.map(p => e(PropertyCard, {
                key: p.id,
                property: p,
                onReserve: handleReserve,
                onVisit: handleVisit
              }))
            )
    );
  }

  // Definición del Web Component personalizado <mfe-properties>
  class MfePropertiesElement extends HTMLElement {
    connectedCallback() {
      const apiUrl = this.getAttribute('api-url') || (window.API_URL || 'http://localhost:5000/api');
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
