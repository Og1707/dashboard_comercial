'use strict';

const repo = require('../repositories/summary.repository');
const cache = require('../config/cache');

const semaColor = (rate) => {
  const r = parseFloat(rate);
  if (r < 85) return 'red';
  if (r < 93) return 'amber';
  return 'green';
};

const mapCountry = (row) => ({
  code: row.code,
  name: row.name,
  processed: parseInt(row.processed, 10),
  delivered: parseInt(row.delivered, 10),
  failed: parseInt(row.failed, 10),
  rate: parseFloat(row.rate),
  cost: parseFloat(row.cost),
  sema: semaColor(row.rate),
});

const mapProcess = (row) => ({
  name: row.name,
  templateCategory: row.categoria_template,
  processed: parseInt(row.processed, 10),
  delivered: parseInt(row.delivered, 10),
  failed: parseInt(row.failed, 10),
  rate: parseFloat(row.rate),
  cost: parseFloat(row.cost),
  sema: semaColor(row.rate),
  validation: false,
});

const getSummary = async (from, to, user) => {
  const cacheKey = `summary:${user.id}:${from}:${to}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const [kpisRaw, countriesRaw, processesRaw, integrityIssues, heatmapRaw] = await Promise.all([
    repo.getGlobalKpis(from, to, user),
    repo.getByCountry(from, to, user),
    repo.getByProcess(from, to, user),
    repo.getIntegrityIssues(from, to, user),
    repo.getByCountryProcess(from, to, user),
  ]);

  const processed = kpisRaw ? parseInt(kpisRaw.processed, 10) : 0;
  const delivered = kpisRaw ? parseInt(kpisRaw.delivered, 10) : 0;
  const globalRate = processed > 0 ? parseFloat(((delivered / processed) * 100).toFixed(1)) : 0;

  const result = {
    kpis: {
      processed,
      delivered,
      failed: kpisRaw ? parseInt(kpisRaw.failed, 10) : 0,
      rate: globalRate,
      cost: kpisRaw ? parseFloat(parseFloat(kpisRaw.total_cost).toFixed(2)) : 0,
      sema: semaColor(globalRate),
      integrityIssues,
    },
    countries: countriesRaw.map(mapCountry),
    processes: processesRaw.map(mapProcess),
    heatmap: heatmapRaw,
  };

  cache.set(cacheKey, result);
  return result;
};

module.exports = { getSummary };
