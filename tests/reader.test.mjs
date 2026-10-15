import test from 'node:test';
import assert from 'node:assert/strict';
import {ChunkSource,scan} from '../src/engine.mjs';
import {parseDriveLink,rangeFetcher} from '../src/drive.mjs';
test('cache evicts old chunks and returned buffers cannot mutate cached bytes',async()=>{
  const source=new ChunkSource(1024,async(a,b)=>new Uint8Array(b-a).fill(a/64),{chunkSize:64,maxChunks:2,maxBytes:1024});
  const data=await source.run(()=>source.slice(0,8));data.fill(99);assert.equal(source.slice(0,1)[0],0);
  await source.run(()=>source.slice(64,72));await source.run(()=>source.slice(128,136));
  assert.equal(source.stats().peakCacheBytes,128);assert.equal(source.cache.has(0),false);
});
test('read budget, malformed ranges and truncated chunks stop reading',async()=>{
  const source=new ChunkSource(1024,async(a,b)=>new Uint8Array(b-a),{chunkSize:64,maxBytes:64});
  await source.run(()=>source.slice(0,8));await assert.rejects(()=>source.run(()=>source.slice(64,65)),/budget/);
  assert.throws(()=>source.slice(0,70000),/oversized/);
  const short=new ChunkSource(1024,async()=>new Uint8Array(2));await assert.rejects(()=>short.run(()=>short.slice(0,1)),/length/);
});
test('scan continuation neither repeats nor drops rows at result cap',async()=>{
  const source={run:async fn=>fn(),stats:()=>({})};
  const table={getColumns:()=>[{name:'id',type:4}],pageCount:2,readPage:p=>Array.from({length:4},(_,i)=>({id:p*4+i}))};
  const first=await scan(source,table,{column:'id',resultLimit:3});
  const second=await scan(source,table,{column:'id',resultLimit:3,cursor:first.cursor});
  const third=await scan(source,table,{column:'id',resultLimit:3,cursor:second.cursor});
  assert.deepEqual([...first.matches,...second.matches,...third.matches].map(r=>r.id),[0,1,2,3,4,5,6,7]);assert.equal(third.complete,true);
});
test('a capped scan reports incomplete even with no matches',async()=>{
  const source={run:async fn=>fn(),stats:()=>({})};const table={getColumns:()=>[{name:'id',type:4}],pageCount:3,readPage:p=>[{id:p}]};
  const result=await scan(source,table,{column:'id',query:'missing',pageLimit:1});assert.equal(result.complete,false);assert.equal(result.cursor.page,1);assert.equal(result.matches.length,0);
});
test('Drive links require exact Google host and parse resource keys',()=>{
  assert.deepEqual(parseDriveLink('https://drive.google.com/file/d/syntheticId123/view?resourcekey=test-key'),{id:'syntheticId123',resourceKey:'test-key'});
  assert.throws(()=>parseDriveLink('https://drive.google.com.evil.test/file/d/syntheticId123/view'));
});
test('Drive rejects a full-file response before consuming it',async()=>{
  let cancelled=false;const fake=async()=>({status:200,body:{cancel:async()=>{cancelled=true;}}});
  await assert.rejects(()=>rangeFetcher({id:'syntheticId123'},'synthetic-token',{size:100},fake)(0,10),/partial/);assert.equal(cancelled,true);
});
test('Drive range is authenticated and oversized streams are cancelled',async()=>{
  let cancelled=false;let read=false;
  const fake=async(url,options)=>{assert.equal(options.headers.Authorization,'Bearer synthetic-token');assert.equal(options.headers.Range,'bytes=0-9');return {status:206,headers:new Headers(),body:{getReader:()=>({read:async()=>read?{done:true}:(read=true,{done:false,value:new Uint8Array(11)}),cancel:async()=>{cancelled=true;},releaseLock(){}})}};};
  await assert.rejects(()=>rangeFetcher({id:'syntheticId123'},'synthetic-token',{size:100},fake)(0,10),/budget/);assert.equal(cancelled,true);
});
