// Builds src/data/us-map.json (nation + state borders as SVG paths in us-atlas's pre-projected 975x610 Albers USA space)
// and src/data/county-centroids.json for every county named in the MAP cluster seed, matched by name + state.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { geoPath } from 'd3-geo';
import * as topojson from 'topojson-client';
const require = createRequire(import.meta.url);
const states = require('us-atlas/states-albers-10m.json');
const counties = require('us-atlas/counties-albers-10m.json');
const path = geoPath();
const nation = path(topojson.feature(states, states.objects.nation));
const borders = path(topojson.mesh(states, states.objects.states, (a, b) => a !== b));
const stateFeatures = topojson.feature(states, states.objects.states).features;
const stateById = Object.fromEntries(stateFeatures.map((f) => [f.id, f.properties.name]));
const FIPS_TO_USPS = { '01':'AL','02':'AK','04':'AZ','05':'AR','06':'CA','08':'CO','09':'CT','10':'DE','11':'DC','12':'FL','13':'GA','15':'HI','16':'ID','17':'IL','18':'IN','19':'IA','20':'KS','21':'KY','22':'LA','23':'ME','24':'MD','25':'MA','26':'MI','27':'MN','28':'MS','29':'MO','30':'MT','31':'NE','32':'NV','33':'NH','34':'NJ','35':'NM','36':'NY','37':'NC','38':'ND','39':'OH','40':'OK','41':'OR','42':'PA','44':'RI','45':'SC','46':'SD','47':'TN','48':'TX','49':'UT','50':'VT','51':'VA','53':'WA','54':'WV','55':'WI','56':'WY','72':'PR' };
const ALIAS = { 'St. Louis city|MO': 'St. Louis|29510', 'Dade|FL': 'Miami-Dade', 'De Kalb|GA': 'DeKalb', 'New York County|NY': 'New York' };
const cf = topojson.feature(counties, counties.objects.counties).features;
const byKey = new Map();
for (const f of cf) { const st = FIPS_TO_USPS[String(f.id).padStart(5, '0').slice(0, 2)]; byKey.set(`${f.properties.name}|${st}|${String(f.id).padStart(5,'0')}`, f); }
function find(county, state) {
  let name = county, id = null;
  const a = ALIAS[`${county}|${state}`]; if (a) { [name, id] = a.split('|'); }
  const hits = [...byKey.entries()].filter(([k]) => { const [n, s, i] = k.split('|'); return n === name && s === state && (!id || i === id); });
  if (hits.length === 1) return hits[0];
  if (hits.length > 1) { const c = hits.find(([k]) => k.endsWith('|' + id)) ?? hits[0]; return c; }
  return null;
}
const seed = JSON.parse(readFileSync('data/seed/map-clusters.json', 'utf8')).clusters;
const dec = JSON.parse(readFileSync('data/seed/map-decade-clusters.json', 'utf8')).rows;
const want = new Map(); for (const c of [...seed, ...dec]) want.set(`${c.county}|${c.state}`, c);
const out = {}; const missing = [];
for (const [key] of want) { const [county, state] = key.split('|'); const hit = find(county, state); if (!hit) { missing.push(key); continue; } const [k, f] = hit; const [x, y] = path.centroid(f); out[key] = { fips: k.split('|')[2], name: f.properties.name, x: +x.toFixed(2), y: +y.toFixed(2) }; }
writeFileSync('src/data/us-map.json', JSON.stringify({ width: 975, height: 610, nation, borders }));
writeFileSync('src/data/county-centroids.json', JSON.stringify(out, null, 1));
console.log('counties resolved', Object.keys(out).length, 'missing', missing);
