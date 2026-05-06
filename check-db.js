const db = require('better-sqlite3')('./data/precios.db');

console.log('=== snapshots ===');
const snapCount = db.prepare('SELECT COUNT(*) as count, MIN(fecha) as min_fecha, MAX(fecha) as max_fecha FROM snapshots').get();
console.log(snapCount);

console.log('\n=== snapshot_precios ===');
const precioCount = db.prepare('SELECT COUNT(*) as count FROM snapshot_precios').get();
console.log(precioCount);

console.log('\n=== estaciones ===');
const estCount = db.prepare('SELECT COUNT(*) as count FROM estaciones').get();
console.log(estCount);

console.log('\n=== sample snapshots ===');
db.prepare('SELECT * FROM snapshots LIMIT 5').all().forEach(r => console.log(JSON.stringify(r)));

console.log('\n=== sample precios ===');
db.prepare('SELECT * FROM snapshot_precios LIMIT 5').all().forEach(r => console.log(JSON.stringify(r)));

console.log('\n=== date test ===');
console.log('date(now):', db.prepare("SELECT date('now') as d").get().d);
console.log('date(now, \'+1 day\'):', db.prepare("SELECT date('now', '+1 day') as d").get().d);
console.log('date(now, \'-7 days\'):', db.prepare("SELECT date('now', '-7 days') as d").get().d);

// Test the actual query
console.log('\n=== query test (7 dias) ===');
const result = db.prepare(`
  SELECT s.fecha, AVG(sp.avg_gasolina95) as gasolina95, AVG(sp.avg_diesel) as dieselA
  FROM snapshot_precios sp
  JOIN snapshots s ON sp.snapshot_id = s.id
  WHERE s.fecha >= date('now', '-7 days')
  GROUP BY s.fecha
  ORDER BY s.fecha DESC
`).all();
console.log('Rows returned:', result.length);
result.forEach(r => console.log(JSON.stringify(r)));

// What does date('now') return vs what's in DB?
console.log('\n=== comparison ===');
const cutoff = db.prepare("SELECT date('now', '-7 days') as cutoff").get().cutoff;
const maxFecha = db.prepare("SELECT MAX(fecha) as max_fecha FROM snapshots").get().max_fecha;
console.log('Cutoff (UTC):', cutoff);
console.log('Max fecha in DB:', maxFecha);
console.log('Max fecha >= cutoff:', maxFecha >= cutoff);

db.close();
