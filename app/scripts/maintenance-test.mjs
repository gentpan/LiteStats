import assert from 'node:assert/strict';
try {
assert.equal(new URL(process.env.DATABASE_URL).host,'127.0.0.1:55435','Use only the isolated PostgreSQL fixture');
assert.equal(new URL(process.env.CLICKHOUSE_URL).host,'127.0.0.1:58123','Use only the isolated ClickHouse fixture');
await import('../.output/start.mjs');
const address='http://127.0.0.1:3315/api/health';
let response;
for(let n=0;n<50;n++){try{response=await fetch(address);if(response.ok)break}catch{}await new Promise(r=>setTimeout(r,100))}
assert.equal(response.status,200);
const state=globalThis[Symbol.for('litestats.maintenance.v1')];assert.ok(state);
assert.equal(state.requests,0,'Response hook releases tracked requests');
state.paused=true;
response=await fetch(address);assert.equal(response.status,503);assert.equal(response.headers.get('retry-after'),'30');
state.paused=false;
response=await fetch(address);assert.equal(response.status,200);
console.log('PASS: compiled Nitro maintenance gate returns 503/Retry-After and resumes health');
process.exit(0);
} catch(error){console.error(error.message);process.exit(1)}
