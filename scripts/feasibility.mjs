// Private file path is supplied at runtime, never embedded in public source.
import {open} from 'node:fs/promises';
import {ChunkSource,openDatabase,describe,scan} from '../src/engine.mjs';
const file=await open(process.argv[2],'r');
try {
  const before=await file.stat();let maxRead=0;
  const source=new ChunkSource(before.size,async(start,end)=>{
    maxRead=Math.max(maxRead,end-start);
    const buffer=Buffer.alloc(end-start);const {bytesRead}=await file.read(buffer,0,buffer.length,start);
    return buffer.subarray(0,bytesRead);
  },{maxBytes:256*1024*1024});
  const start=performance.now();
  const {reader,tables}=await openDatabase(source);
  const info=await describe(source,reader,'CARMDI');
  const column=info.columns.find(c=>!['binary','ole','memo','complex'].includes(c.type))?.name;
  // Derive a match internally without printing the key or any personal record.
  const first=await source.run(()=>info.table.readPage(0,[column]));
  const key=String(first[0]?.[column]??'');
  const result=await scan(source,info.table,{column,query:key,mode:'equals',pageLimit:Number(process.argv[3]||128),resultLimit:10,timeLimit:12000});
  const after=await file.stat();
  console.log(JSON.stringify({fileSize:before.size,tableCount:tables.length,rowCount:info.rowCount,columnCount:info.columns.length,dataPages:info.pageCount,
    matches:result.matches.length,rowsExamined:result.examined,pagesExamined:result.pages,complete:result.complete,maxRead,
    ...source.stats(),elapsedMs:Math.round(performance.now()-start),sourceUnchanged:before.size===after.size&&before.mtimeMs===after.mtimeMs},null,2));
} finally {await file.close();}
