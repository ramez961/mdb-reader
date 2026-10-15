import config from './config.js';
import {parseDriveLink} from './src/drive.mjs';
const $=id=>document.getElementById(id),storageKey='access-pocket-source-v1';
let worker=null,cursor=null,searchOptions=null,busy=false,selection=null,token=null,tokenExpiry=0;
try{const saved=JSON.parse(localStorage.getItem(storageKey));if(saved?.id&&/^[-\w]{10,200}$/.test(saved.id))selection=saved;}catch{}
if(selection){$('source-name').textContent='A private Drive file choice is remembered. Reconnect to read it.';selected();}
function status(text){$('state').textContent=text;}
function stats(s){if(s)$('metrics').textContent=`Read ${(s.bytes/1048576).toFixed(2)} MiB · chunk cache ${(s.cacheBytes/1048576).toFixed(2)} MiB · ${s.requests} chunk reads`;}
function clearResults(){ $('results').replaceChildren();$('results-panel').hidden=true;cursor=null;$('continue').hidden=true;}
function setBusy(value){busy=value;for(const id of ['table','column','mode','query','search','continue'])$(id).disabled=value;$('cancel').hidden=!value;}
function reset(){worker?.terminate();worker=null;setBusy(false);clearResults();$('search-panel').hidden=true;$('metrics').textContent='';$('query').value='';$('file').value='';token=null;tokenExpiry=0;}
function newWorker(){worker?.terminate();worker=new Worker('./src/worker.mjs',{type:'module'});worker.onmessage=onMessage;worker.onerror=()=>{setBusy(false);status('Reader could not start. Serve this folder over HTTP and check browser compatibility.');};setBusy(true);status('Opening database in small chunks…');}
function selected(){ $('choose').hidden=true;$('change').hidden=false;$('forget').hidden=false;}
function onMessage({data:d}) {
  if(d.type==='progress'){status(`Searching this step… ${d.examined.toLocaleString()} rows checked.`);return;}
  setBusy(false);stats(d.stats);
  if(d.type==='error'){status(d.message);$('continue').hidden=true;$('search').disabled=true;return;}
  if(d.type==='opened'){
    $('search-panel').hidden=false;$('table').replaceChildren(...d.tables.map(name=>new Option(name,name)));
    if(!d.tables.length){status('No readable user tables found.');$('search').disabled=true;return;}
    selected();loadTable();
  }else if(d.type==='table'){
    $('column').replaceChildren(...d.columns.map(c=>new Option(c.name,c.name)));
    $('table-info').textContent=`${d.rowCount.toLocaleString()} rows · ${d.pageCount.toLocaleString()} data pages`;
    $('search').disabled=!d.columns.length;status('Database ready. Choose a field and search, or leave the value empty to browse.');
  }else if(d.type==='results'){
    cursor=d.cursor;$('continue').hidden=d.complete;$('results-panel').hidden=false;
    $('coverage').textContent=`${d.matches.length} matches in this step; ${d.examined.toLocaleString()} rows checked. ${d.complete?'Reached the end of this table.':'Partial search — more pages remain.'} Earlier steps are replaced to keep memory bounded.`;
    $('results').replaceChildren(...d.matches.map(record=>{const article=document.createElement('article');article.className='record';const dl=document.createElement('dl');for(const [key,value] of Object.entries(record)){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=key;dd.textContent=value===null?'—':String(value);dl.append(dt,dd);}article.append(dl);return article;}));
    status(d.complete?'End of table reached. Review the results from this step.':'Partial search finished. Use “Search next pages” to continue.');
  }
}
function loadTable(){clearResults();$('column').replaceChildren();setBusy(true);status('Reading table structure…');worker.postMessage({type:'table',name:$('table').value});}
$('choose').onclick=$('change').onclick=()=>{$('file').value='';$('file').click();};
$('file').onchange=()=>{const file=$('file').files[0];if(!file)return;reset();selection=null;try{localStorage.removeItem(storageKey);}catch{}newWorker();$('source-name').textContent=file.name;selected();worker.postMessage({type:'open',file});};
$('forget').onclick=()=>{reset();selection=null;try{localStorage.removeItem(storageKey);}catch{}$('drive-link').value='';$('source-name').textContent='No database selected';$('choose').hidden=false;$('change').hidden=true;$('forget').hidden=true;status('Database choice and in-memory results cleared. Your original file is unchanged.');};
$('cancel').onclick=()=>{reset();status('Stopped. Select or reconnect your database to start again.');};
$('table').onchange=loadTable;
for(const id of ['column','mode','query'])$(id).oninput=()=>{cursor=null;$('continue').hidden=true;};
$('search').onclick=()=>{clearResults();searchOptions={column:$('column').value,mode:$('mode').value,query:$('query').value};runScan({page:0,row:0});};
$('continue').onclick=()=>runScan(cursor);
function runScan(next){if(!worker||busy)return;setBusy(true);status('Searching a bounded group of pages…');worker.postMessage({type:'scan',options:{...searchOptions,cursor:next}});}
const scripts=new Map();function script(url){if(!scripts.has(url))scripts.set(url,new Promise((resolve,reject)=>{const el=document.createElement('script');el.src=url;el.onload=resolve;el.onerror=()=>reject(Error('Google services could not load.'));document.head.append(el);}));return scripts.get(url);}
async function authenticate(){
  if(!config.clientId)throw Error('Google Drive is optional and not configured yet. Choose from Files to use the reader now.');
  if(token&&Date.now()<tokenExpiry)return token;
  await script('https://accounts.google.com/gsi/client');
  return new Promise((resolve,reject)=>google.accounts.oauth2.initTokenClient({client_id:config.clientId,scope:'https://www.googleapis.com/auth/drive.file',include_granted_scopes:false,
    callback:r=>{if(r.error){reject(Error('Google authorization was not completed.'));return;}token=r.access_token;tokenExpiry=Date.now()+(r.expires_in-60)*1000;resolve(token);},error_callback:()=>reject(Error('Google sign-in window closed or blocked. Try again.'))}).requestAccessToken({prompt:''}));
}
async function connect(chosen){
  const accessToken=await authenticate();reset();token=accessToken;selection=chosen;
  try{localStorage.setItem(storageKey,JSON.stringify({id:chosen.id,...(chosen.resourceKey?{resourceKey:chosen.resourceKey}:{})}));}catch{}
  newWorker();selected();$('source-name').textContent='Private Google Drive file';$('drive-link').value='';worker.postMessage({type:'open',selection:chosen,token:accessToken});
}
$('drive-connect').onclick=async()=>{try{const chosen=$('drive-link').value.trim()?parseDriveLink($('drive-link').value):selection;if(!chosen)throw Error('Paste your own Drive file link or select with Google Picker.');await connect(chosen);}catch(e){status(e.message);}};
$('drive-pick').onclick=async()=>{try{const accessToken=await authenticate();if(!config.apiKey||!config.appId)throw Error('Google Picker needs an API key and project number in config.js.');await script('https://apis.google.com/js/api.js');await new Promise(resolve=>gapi.load('picker',resolve));const view=new google.picker.DocsView().setMode(google.picker.DocsViewMode.LIST);new google.picker.PickerBuilder().addView(view).setOAuthToken(accessToken).setDeveloperKey(config.apiKey).setAppId(config.appId).setOrigin(location.origin).setCallback(data=>{if(data.action===google.picker.Action.PICKED){const doc=data.docs[0];connect({id:doc.id,...(doc.resourceKey?{resourceKey:doc.resourceKey}:{})}).catch(e=>status(e.message));}}).build().setVisible(true);}catch(e){status(e.message);}};
