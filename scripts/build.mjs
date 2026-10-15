import {readFile,writeFile,mkdir,cp,realpath} from 'node:fs/promises';
import {dirname} from 'node:path';
import {build} from 'esbuild';
await mkdir('.build',{recursive:true});
await cp('node_modules/mdb-reader/lib/browser','.build/reader',{recursive:true});
const path='.build/reader/Table.js';
let table=await readFile(path,'utf8');
const marker='    get name() {';
if (!table.includes(marker)) throw Error('Upstream patch target changed');
table=table.replace(marker,`    get pageCount() { return this.#dataPages.length; }
    readPage(index, names) {
        if (!Number.isInteger(index) || index < 0 || index >= this.#dataPages.length) throw new Error('Invalid page index');
        const columns = this.#getColumnDefinitions().filter(c => names.includes(c.name));
        const buffer = this.#getDataPage(this.#dataPages[index]);
        return this.#getDataFromPage(buffer, this.#getRecordOffsets(buffer), columns);
    }
${marker}`);
table=table.replace('let nextDefinitionPage = this.#firstDefinitionPage;', 'let nextDefinitionPage = this.#firstDefinitionPage; const seenDefinitions = new Set();');
table=table.replace('while (nextDefinitionPage > 0) {', "while (nextDefinitionPage > 0) { if (seenDefinitions.has(nextDefinitionPage) || seenDefinitions.size >= 256) throw new Error('Invalid or oversized table definition'); seenDefinitions.add(nextDefinitionPage);");
await writeFile(path,table);
// Bound the system catalog; application tables are always read one page at a time.
const readerPath='.build/reader/MDBReader.js';
let reader=await readFile(readerPath,'utf8');
reader=reader.replace('columns: ["Id", "Name", "Type", "Flags"],','columns: ["Id", "Name", "Type", "Flags"], rowLimit: 10000,');
await writeFile(readerPath,reader);
await writeFile('.build/shim.js','export {Buffer} from "buffer"; export const process={browser:true,version:"",env:{},nextTick:(fn,...args)=>queueMicrotask(()=>fn(...args))}; export const global=globalThis;');
const nodePaths=[dirname(await realpath('node_modules/mdb-reader'))];
await cp('node_modules/mdb-reader/LICENSE','MDB-READER-LICENSE.txt');
if(process.argv.includes('--prepare-only'))process.exit(0);
await build({entryPoints:['.build/reader/index.js'],outfile:'vendor.mjs',bundle:true,format:'esm',platform:'browser',alias:{stream:'stream-browserify'},nodePaths,inject:['.build/shim.js'],legalComments:'eof',minify:true});
await build({stdin:{contents:'export {Buffer} from "buffer"',resolveDir:process.cwd()},outfile:'vendor-buffer.mjs',bundle:true,format:'esm',platform:'browser',legalComments:'eof',minify:true});
await cp('node_modules/mdb-reader/LICENSE','MDB-READER-LICENSE.txt');
console.log('Built browser reader with bounded-page extension.');
