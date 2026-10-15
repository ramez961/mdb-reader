import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
const root=resolve('.');
// Allowlist application assets only. Never serve private files, dependencies or scratch data.
const allowed=/^(index\.html|app\.mjs|style\.css|config\.js|vendor(?:-buffer)?\.mjs|src\/[a-z-]+\.mjs)$/;
createServer(async(req,res)=>{
  try{let path=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\//,'')||'index.html';
    if(!allowed.test(path)){res.writeHead(404);res.end();return;}
    const data=await readFile(resolve(root,path));
    const mime={'.html':'text/html','.css':'text/css','.mjs':'text/javascript','.js':'text/javascript'}[extname(path)];
    res.writeHead(200,{'Content-Type':mime,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(data);
  }catch{res.writeHead(404);res.end();}
}).listen(4173,'127.0.0.1',()=>console.log('Local preview: http://127.0.0.1:4173'));
