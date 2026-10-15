import {ChunkSource,openDatabase,describe,scan} from './engine.mjs';
import {metadata,rangeFetcher} from './drive.mjs';
import {normalize} from './vehicle.mjs';
let source,reader,info,remote,makers=[];
let queue=Promise.resolve();
self.onmessage=({data})=>{queue=queue.then(()=>handle(data)).catch(()=>{});};
async function lookup(name,column,limit,filters=[],extra=[]) {
  if(!reader.getTableNames().includes(name))return {rows:[],complete:true};
  const {table}=await describe(source,reader,name);
  source.maxBytes=source.bytes+8*1024*1024;
  const result=await scan(source,table,{filters,projection:[column,...extra],pageLimit:256,resultLimit:limit});
  return {rows:result.matches,complete:result.complete};
}
async function handle(data){
  try {
    if(data.type==='open') {
      remote=null;info=null;makers=[];
      if(data.file)source=new ChunkSource(data.file.size,async(a,b)=>new Uint8Array(await data.file.slice(a,b).arrayBuffer()));
      else {
        const meta=await metadata(data.selection,data.token);remote={selection:data.selection,token:data.token,meta};
        source=new ChunkSource(Number(meta.size),rangeFetcher(data.selection,data.token,meta));
      }
      const db=await openDatabase(source);reader=db.reader;
      if(!db.tables.includes('CARMDI'))throw Error('VEHICLE_TABLE_MISSING');
      info=await describe(source,reader,'CARMDI');
      const names=info.columns.map(c=>c.name);
      if(!['ActualNB','CodeDesc','MarqueDesc','TypeDesc','PRODDATE'].every(c=>names.includes(c)))throw Error('VEHICLE_SCHEMA_MISSING');
      self.postMessage({type:'opened',rowCount:info.rowCount,pageCount:info.pageCount,columns:names,stats:source.stats()});
    } else if(data.type==='lookups') {
      const definitions=[['codes','CODE','CODEDESC',100],['usages','UTILISATION','UTILISDESC',100],['makes','MARQUE','MARQUEDESC',1000],['colors','COULEUR','COULEURDESC',2000]];
      const lists={};let complete=true;
      for(const [key,name,column,limit] of definitions){
        const result=await lookup(name,column,limit,[],key==='makes'?['MARQUEID']:[]);
        if(key==='makes')makers=result.rows;
        lists[key]=[...new Set(result.rows.map(row=>row[column]).filter(v=>v!=null).map(v=>String(v).trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ar'));
        complete&&=result.complete;
      }
      self.postMessage({type:'lookups',lists,complete});
    } else if(data.type==='models') {
      const maker=makers.find(row=>normalize(row.MARQUEDESC)===normalize(data.make));
      const result=maker?await lookup('TYPE','TYPEDESC',250,[{column:'MARQUEID',op:'equals',value:String(maker.MARQUEID)}]):{rows:[],complete:true};
      self.postMessage({type:'models',requestId:data.requestId,models:[...new Set(result.rows.map(row=>String(row.TYPEDESC??'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ar')),complete:result.complete});
    } else if(data.type==='scan') {
      if(!info)throw Error('VEHICLE_TABLE_MISSING');
      if(remote){const fresh=await metadata(remote.selection,remote.token);if(fresh.version!==remote.meta.version)throw Error('DRIVE_CHANGED');}
      source.maxBytes=source.bytes+8*1024*1024;
      const result=await scan(source,info.table,{filters:data.filters,cursor:data.cursor,pageLimit:128,resultLimit:50,timeLimit:12000,
        onProgress:({examined,pages})=>self.postMessage({type:'progress',examined,pages})});
      if(remote){const fresh=await metadata(remote.selection,remote.token);if(fresh.version!==remote.meta.version)throw Error('DRIVE_CHANGED');}
      self.postMessage({type:'results',...result});
    }
  } catch(error){
    const message=error.message==='VEHICLE_TABLE_MISSING'?'لا يوجد جدول السيارات CARMDI في هذا الملف. اختر قاعدة بيانات السيارات.':
      error.message==='VEHICLE_SCHEMA_MISSING'?'حقول هذا الملف مختلفة عن قاعدة السيارات المعروفة. اختر الملف الصحيح.':
      error.message==='DRIVE_CHANGED'?'تغيّر ملف Drive أثناء القراءة. أعد الاتصال بالملف.':
      'تعذّرت قراءة الملف. أعد اختياره وتحقق من نوعه وصلاحية الوصول إليه.';
    self.postMessage({type:'error',operation:data.type,message});
  }
}
