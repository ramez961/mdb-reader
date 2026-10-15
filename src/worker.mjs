import {ChunkSource,openDatabase,describe,scan} from './engine.mjs';
import {metadata,rangeFetcher} from './drive.mjs';
let source,reader,info,remote,aborter;
self.onmessage=async({data})=>{
  try {
    if(data.type==='open') {
      aborter=new AbortController();remote=null;
      if(data.file)source=new ChunkSource(data.file.size,async(a,b)=>new Uint8Array(await data.file.slice(a,b).arrayBuffer()));
      else {
        const meta=await metadata(data.selection,data.token);remote={selection:data.selection,token:data.token,meta};
        source=new ChunkSource(Number(meta.size),rangeFetcher(data.selection,data.token,meta,fetch,aborter.signal));
      }
      const db=await openDatabase(source);reader=db.reader;
      self.postMessage({type:'opened',tables:db.tables,stats:source.stats()});
    } else if(data.type==='table') {
      info=null;
      info=await describe(source,reader,data.name);
      self.postMessage({type:'table',columns:info.columns.filter(c=>!['binary','ole','memo','complex'].includes(c.type)),rowCount:info.rowCount,pageCount:info.pageCount,stats:source.stats()});
    } else if(data.type==='scan') {
      if(!info)throw Error('No table opened');
      if(remote){const fresh=await metadata(remote.selection,remote.token);if(fresh.version!==remote.meta.version)throw Error('Drive file changed. Reconnect before searching.');}
      source.maxBytes=source.bytes+8*1024*1024;
      const result=await scan(source,info.table,{...data.options,onProgress:({examined,pages})=>self.postMessage({type:'progress',examined,pages})});
      // Check again before releasing private results to the UI.
      if(remote){const fresh=await metadata(remote.selection,remote.token);if(fresh.version!==remote.meta.version)throw Error('Drive file changed during search. Reconnect.');}
      self.postMessage({type:'results',...result});
    }
  } catch(e){self.postMessage({type:'error',message:e.message?.startsWith('Google')||e.message?.startsWith('Drive')||e.message?.startsWith('File unavailable')||e.message?.startsWith('Read budget')?e.message:'Unable to read this MDB safely. It may be unsupported or malformed; reconnect or try another table.'});}
};
