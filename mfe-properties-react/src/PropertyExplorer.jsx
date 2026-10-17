import React, { useState, useEffect } from 'react';

export default function PropertyExplorer({ onReserve }) {
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('http://localhost:5000/api/properties')
      .then(res => res.json())
      .then(data => {
        if (data.success) setProperties(data.data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Error fetching properties in React MFE:', err);
        setLoading(false);
      });
  }, []);

  if (loading) return <div>Cargando catálogo en React MFE...</div>;

  return (
    <div className="grid-properties">
      {properties.map(p => (
        <div key={p.id} className="property-card">
          <img src={p.image} alt={p.title} style={{ height: '200px', objectFit: 'cover' }} />
          <h3>{p.title}</h3>
          <p>{p.zone}, {p.city}</p>
          <p style={{ fontWeight: 'bold', color: '#059669' }}>${p.price.toLocaleString()} USD</p>
          <button onClick={() => onReserve && onReserve(p.id)}>Reservar</button>
        </div>
      ))}
    </div>
  );
}
