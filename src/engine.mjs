import MDBReader from '../vendor.mjs';
import {Buffer} from '../vendor-buffer.mjs';
import {compileFilters} from './vehicle.mjs';

export class MissingChunk extends Error { constructor(offset){super('Chunk required');this.offset=offset;} }
export class ReadBudgetError extends Error { constructor(){super('Read budget reached. Start a new bounded search.');} }
/** Async fetch outside the parser; synchronous parser only sees cached chunks. */
export class ChunkSource {
  constructor(size,fetchRange,{chunkSize=65536,maxChunks=64,maxBytes=16*1024*1024}={}) {
    this.size=size;this.fetchRange=fetchRange;this.chunkSize=chunkSize;this.maxChunks=maxChunks;
    this.maxBytes=maxBytes;this.cache=new Map();this.bytes=0;this.requests=0;this.peakCache=0;
    this.facade=new Proxy(this,{get:(target,key)=> /^\d+$/.test(String(key)) ? target.slice(Number(key),Number(key)+1)[0] :
      key==='length'?target.size:typeof target[key]==='function'?target[key].bind(target):target[key]});
  }
  slice(start,end=this.size) {
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<start||end>this.size||end-start>65536) throw Error('Invalid or oversized MDB page');
    const parts=[];
    for(let pos=start;pos<end;) {
      const base=Math.floor(pos/this.chunkSize)*this.chunkSize;
      const chunk=this.cache.get(base);if(!chunk) throw new MissingChunk(base);
      this.cache.delete(base);this.cache.set(base,chunk);
      const count=Math.min(end-pos,chunk.length-(pos-base));
      if(count<=0)throw Error('Truncated MDB range');
      parts.push(chunk.subarray(pos-base,pos-base+count));pos+=count;
    }
    // Parser decryption may mutate buffers: never lend cache bytes to it.
    return Buffer.concat(parts);
  }
  copy(target,targetStart,start,end){return this.slice(start,end).copy(target,targetStart);}
  async load(offset) {
    const end=Math.min(offset+this.chunkSize,this.size);
    if(this.bytes+end-offset>this.maxBytes) throw new ReadBudgetError();
    const bytes=Buffer.from(await this.fetchRange(offset,end));
    if(bytes.length!==end-offset)throw Error('Server returned an incorrect range length');
    this.bytes+=bytes.length;this.requests++;
    this.cache.set(offset,bytes);
    while(this.cache.size>this.maxChunks)this.cache.delete(this.cache.keys().next().value);
    this.peakCache=Math.max(this.peakCache,[...this.cache.values()].reduce((n,b)=>n+b.length,0));
  }
  async run(fn) {
    // Prevent malformed files or cache thrashing from retrying indefinitely.
    for(let retries=0;retries<1024;retries++)try{return fn();}catch(e){if(!(e instanceof MissingChunk))throw e;await this.load(e.offset);}
    throw Error('MDB metadata exceeds the bounded reader retry limit');
  }
  stats(){return {bytes:this.bytes,requests:this.requests,cacheBytes:[...this.cache.values()].reduce((n,b)=>n+b.length,0),peakCacheBytes:this.peakCache};}
}
export async function openDatabase(source) {
  const reader=await source.run(()=>new MDBReader(source.facade));
  return {reader,tables:reader.getTableNames()};
}
export async function describe(source,reader,name) {
  const table=await source.run(()=>reader.getTable(name));
  return {table,columns:table.getColumns(),rowCount:table.rowCount,pageCount:table.pageCount};
}
export async function scan(source,table,{column,query='',mode='contains',filters,projection,cursor={page:0,row:0},pageLimit=128,resultLimit=50,timeLimit=12000,onProgress=()=>{}}) {
  const supported=table.getColumns().filter(c=>!['binary','ole','memo','complex'].includes(c.type)).map(c=>c.name);
  const conditions=filters??(query===''?[]:[{column,op:mode,value:query}]);
  if(filters===undefined&&!supported.includes(column))throw Error('Choose a supported search column');
  const predicate=compileFilters(conditions,supported);
  const columns=projection?[...new Set([...projection,...conditions.map(f=>f.column)])]:supported;
  if(columns.some(name=>!supported.includes(name)))throw Error('Unsupported output field');
  if(!Number.isInteger(cursor.page)||!Number.isInteger(cursor.row)||cursor.page<0||cursor.page>table.pageCount||cursor.row<0)throw Error('Invalid cursor');
  const matches=[];let examined=0,pages=0;let {page,row}=cursor;
  const started=Date.now();let stopReason;
  while(page<table.pageCount&&pages<pageLimit&&Date.now()-started<timeLimit) {
    let records;
    try{records=await source.run(()=>table.readPage(page,columns));}catch(error){if(error instanceof ReadBudgetError){stopReason='byteBudget';break;}throw error;}
    pages++;
    for(;row<records.length;row++) {
      const record=records[row];examined++;
      if(predicate(record))matches.push(record);
      if(matches.length>=resultLimit){row++;break;}
    }
    if(row>=records.length){page++;row=0;}
    onProgress({examined,pages});
    if(matches.length>=resultLimit)break;
  }
  const complete=page>=table.pageCount;
  stopReason??=complete?'end':matches.length>=resultLimit?'resultLimit':pages>=pageLimit?'pageLimit':'timeLimit';
  return {matches,examined,pages,cursor:{page,row},complete,stopReason,stats:source.stats()};
}
