<template>
  <div class="bi-dashboard-container">
    <h2>Tablero de Inteligencia de Negocios y Métricas (Vue 3)</h2>
    <div class="kpi-grid">
      <div class="kpi-box">
        <span class="label">Volumen Total Operado</span>
        <span class="value">${{ finances.totalVolume?.toLocaleString() }} USD</span>
      </div>
      <div class="kpi-box">
        <span class="label">Comisiones Liquidadas</span>
        <span class="value">${{ Math.round(finances.totalCommissions || 0).toLocaleString() }} USD</span>
      </div>
      <div class="kpi-box">
        <span class="label">Arras en Custodia</span>
        <span class="value">${{ finances.totalArras?.toLocaleString() }} USD</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';

const finances = ref({});

onMounted(async () => {
  const res = await fetch('http://localhost:5000/api/finances');
  const json = await res.json();
  if (json.success) finances.value = json.data;
});
</script>
