import config from './config.js';
import {parseDriveLink} from './src/drive.mjs';
import {vehicleFields,buildVehicleFilters,recordValue} from './src/vehicle.mjs';
const $=id=>document.getElementById(id);
const storageKey='access-pocket-source-v1';
const number=value=>Number(value).toLocaleString('ar');
let worker=null,ready=false,busy=false,selection=null,token=null,tokenExpiry=0;
let matches=[],position=0,cursor=null,filters=[],batch=0,examined=0,pageCount=0,dialogMode='general',modelRequest=0,modelTimer;
const dialog=$('search-dialog'),form=$('search-form');
for(const [column,label,layout] of vehicleFields){
  const field=document.createElement('div');field.className=`field ${layout}`;
  const caption=document.createElement('span');caption.className='field-label';caption.id=`label-${column}`;caption.textContent=label;
  const value=document.createElement('output');value.dataset.field=column;value.setAttribute('aria-labelledby',caption.id);value.dir='auto';value.textContent='—';
  field.append(caption,value);$('record-fields').append(field);
}
try{const saved=JSON.parse(localStorage.getItem(storageKey));if(saved?.id&&/^[-\w]{10,200}$/.test(saved.id))selection=saved;}catch{}
if(selection){$('source-name').textContent='تم حفظ اختيار ملف Drive في هذا المتصفح؛ أعد الاتصال لقراءته.';selected();}
function status(text){$('state').textContent=text;}
function stats(value){if(value)$('metrics').textContent=`قراءة ${(value.bytes/1048576).toFixed(2)} MiB · ذاكرة المقاطع ${(value.cacheBytes/1048576).toFixed(2)} MiB`;}
function selected(){ $('choose').hidden=true;$('change').hidden=false;$('forget').hidden=false;}
function renderRecord(){
  const record=matches[position];
  for(const output of document.querySelectorAll('[data-field]'))output.textContent=recordValue(record,output.dataset.field);
  const raw=record?.HorsService;
  $('out-of-service').checked=raw!=null&&String(raw).trim()!==''&&Number.isFinite(Number(raw))&&Number(raw)!==0;
  $('record-position').textContent=record?`النتيجة ${number(position+1)} من ${number(matches.length)} في الدفعة ${number(batch)}`:'لا توجد نتيجة معروضة';
  $('first').disabled=$('previous').disabled=busy||!record||position===0;
  $('next').disabled=$('last').disabled=busy||!record||position>=matches.length-1;
}
function setBusy(value){
  busy=value;
  for(const button of document.querySelectorAll('.search-action'))button.disabled=value||!ready;
  $('browse').disabled=value||!ready;$('continue').disabled=value||!ready;$('cancel').hidden=!value;
  renderRecord();
}
function clearResults(){matches=[];position=0;cursor=null;batch=0;examined=0;$('continue').hidden=true;$('coverage').textContent='';renderRecord();}
function reset(){
  const previousWorker=worker;worker=null;previousWorker?.terminate();ready=false;clearResults();setBusy(false);pageCount=0;
  token=null;tokenExpiry=0;filters=[];modelRequest++;clearTimeout(modelTimer);
  for(const id of ['codes','usages','makes','models','colors'])$(id).replaceChildren();
  form.reset();$('file').value='';$('metrics').textContent='';$('lookup-note').textContent='اترك أي خانة فارغة لتجاهلها. جميع الشروط المدخلة مطلوبة معاً؛ السنوات تشمل طرفَي النطاق.';if(dialog.open)dialog.close();
}
function newWorker(){
  worker?.terminate();worker=new Worker('./src/worker.mjs',{type:'module'});
  const activeWorker=worker;
  worker.onmessage=event=>{if(worker===activeWorker)onMessage(event);};
  worker.onerror=()=>{if(worker!==activeWorker)return;ready=false;clearResults();setBusy(false);status('تعذّر تشغيل القارئ. افتح الموقع عبر HTTP أو HTTPS وتحقق من المتصفح.');};
  setBusy(true);status('جارٍ فتح قاعدة البيانات بمقاطع صغيرة…');
}
function fillList(id,values){$(id).replaceChildren(...values.map(value=>{const option=document.createElement('option');option.value=value;return option;}));}
function onMessage({data}){
  if(data.type==='progress'){status(`جارٍ البحث… تم فحص ${number(data.examined)} سجلاً في هذه الدفعة.`);return;}
  if(data.type==='lookups'){
    for(const [id,values] of Object.entries(data.lists))fillList(id,values);
    if(!data.complete)$('lookup-note').textContent='الاقتراحات محدودة؛ يمكنك كتابة القيمة الكاملة. الشروط المعبأة مطلوبة معاً، والسنوات تشمل طرفَي النطاق.';
    return;
  }
  if(data.type==='models'){
    if(data.requestId===modelRequest){fillList('models',data.models);$('lookup-note').textContent=data.complete?'اختر الطراز أو اكتب قيمته الكاملة. جميع الشروط المعبأة مطلوبة معاً؛ السنوات تشمل طرفَي النطاق.':'اقتراحات الطراز جزئية، حتى 250 طرازاً. يمكنك كتابة القيمة الكاملة. جميع الشروط مطلوبة معاً.';}
    return;
  }
  if(data.type==='error'){
    if(['lookups','models'].includes(data.operation)){$('lookup-note').textContent='تعذّر تحميل بعض الاقتراحات. يمكنك كتابة القيم الكاملة والبحث.';return;}
    ready=false;clearResults();setBusy(false);status(data.message);return;
  }
  stats(data.stats);
  if(data.type==='opened'){
    ready=true;pageCount=data.pageCount;setBusy(false);
    status(`الملف جاهز: ${number(data.rowCount)} سجلاً. اضغط «بحث عام» أو اختر بحث الاسم أو الهيكل أو المحرك.`);
    worker.postMessage({type:'lookups'});
  }else if(data.type==='results'){
    matches=data.matches;position=0;cursor=data.cursor;batch++;examined+=data.examined;setBusy(false);
    $('continue').hidden=data.complete;
    const scope=data.complete?'اكتمل فحص الجدول لهذا البحث.':'بحث جزئي — لم تُفحص كل صفحات الجدول بعد.';
    $('coverage').textContent=`${scope} تم فحص ${number(examined)} سجلاً؛ ${number(matches.length)} نتيجة في هذه الدفعة. الأسهم تخص هذه الدفعة فقط. متابعة البحث تستبدل نتائجها.`;
    if(data.stopReason==='byteBudget')$('coverage').textContent+=' توقفت الدفعة عند حد القراءة؛ يمكنك المتابعة من موضعها.';
    status(matches.length?'تظهر النتيجة في النموذج الرئيسي.':data.complete?'لا توجد نتائج في هذه الدفعة الأخيرة؛ اكتمل الفحص. يمكنك إعادة البحث لعرض النتائج من البداية.':'لا توجد نتائج في الصفحات المفحوصة بهذه الدفعة. تابع البحث في بقية الصفحات.');
    renderRecord();
  }
}
function scan(next){if(!worker||!ready||busy)return;matches=[];position=0;setBusy(true);status('جارٍ البحث في صفحات الملف…');worker.postMessage({type:'scan',filters,cursor:next});}
function startSearch(nextFilters){clearResults();filters=nextFilters;scan({page:0,row:0});}
for(const button of document.querySelectorAll('[data-search]'))button.onclick=()=>{
  dialogMode=button.dataset.search;
  $('search-title').textContent={general:'بحث عام',name:'بحث بالاسم',chassis:'بحث برقم الهيكل',engine:'بحث برقم المحرك'}[dialogMode];
  for(const section of form.querySelectorAll('[data-mode]'))section.hidden=section.dataset.mode!==dialogMode;
  $('form-error').textContent='';dialog.showModal();form.querySelector(`[data-mode="${dialogMode}"] input`)?.focus();
};
$('close-dialog').onclick=()=>dialog.close();
form.onsubmit=event=>{
  event.preventDefault();
  const names={general:['plate','code','usage','make','model','color','yearFrom','yearTo'],name:['firstName','surname','mother'],chassis:['chassis'],engine:['engine']}[dialogMode];
  const all=Object.fromEntries(new FormData(form));const values=Object.fromEntries(names.map(name=>[name,all[name]]));
  try{const next=buildVehicleFilters(values);dialog.close();startSearch(next);}catch(error){$('form-error').textContent=error.message;}
};
form.onreset=()=>{$('form-error').textContent='';fillList('models',[]);modelRequest++;};
$('make-input').oninput=()=>{
  $('model-input').value='';fillList('models',[]);modelRequest++;clearTimeout(modelTimer);
  const requestId=modelRequest,make=$('make-input').value;
  modelTimer=setTimeout(()=>{if(worker&&ready)worker.postMessage({type:'models',make,requestId});},250);
};
$('continue').onclick=()=>scan(cursor);
$('browse').onclick=()=>startSearch([]);
$('first').onclick=()=>{position=0;renderRecord();};$('previous').onclick=()=>{if(position>0)position--;renderRecord();};
$('next').onclick=()=>{if(position<matches.length-1)position++;renderRecord();};$('last').onclick=()=>{position=Math.max(0,matches.length-1);renderRecord();};
$('choose').onclick=$('change').onclick=()=>{$('file').value='';$('file').click();};
$('file').onchange=()=>{
  const file=$('file').files[0];if(!file)return;reset();selection=null;try{localStorage.removeItem(storageKey);}catch{}
  $('source-name').textContent=file.name;selected();newWorker();worker.postMessage({type:'open',file});
};
$('forget').onclick=()=>{
  reset();selection=null;filters=[];try{localStorage.removeItem(storageKey);}catch{}
  $('drive-link').value='';$('source-name').textContent='اختر ملف قاعدة البيانات من جهازك';$('choose').hidden=false;$('change').hidden=true;$('forget').hidden=true;
  status('تم نسيان اختيار الملف ومسح النتائج من الذاكرة. الملف الأصلي لم يتغيّر.');
};
$('cancel').onclick=()=>{reset();filters=[];status('تم إيقاف القراءة ومسح النتائج. اختر الملف من جديد لبدء بحث آخر.');};
const scripts=new Map();
function script(url){if(!scripts.has(url))scripts.set(url,new Promise((resolve,reject)=>{const el=document.createElement('script');el.src=url;el.onload=resolve;el.onerror=()=>reject(Error('تعذّر تحميل خدمات Google.'));document.head.append(el);}));return scripts.get(url);}
async function authenticate(){
  if(!config.clientId)throw Error('الاتصال بـ Google غير مُعدّ بعد. اختر ملفك من Files لاستخدام القارئ.');
  if(token&&Date.now()<tokenExpiry)return token;
  await script('https://accounts.google.com/gsi/client');
  return new Promise((resolve,reject)=>google.accounts.oauth2.initTokenClient({client_id:config.clientId,scope:'https://www.googleapis.com/auth/drive.file',include_granted_scopes:false,
    callback:r=>{if(r.error){reject(Error('لم تكتمل موافقة Google.'));return;}token=r.access_token;tokenExpiry=Date.now()+(r.expires_in-60)*1000;resolve(token);},error_callback:()=>reject(Error('أُغلقت نافذة Google أو حظرها المتصفح. حاول مجدداً.'))}).requestAccessToken({prompt:''}));
}
async function connect(chosen){
  const accessToken=await authenticate();reset();token=accessToken;selection=chosen;
  try{localStorage.setItem(storageKey,JSON.stringify({id:chosen.id,...(chosen.resourceKey?{resourceKey:chosen.resourceKey}:{})}));}catch{}
  newWorker();selected();$('source-name').textContent='ملف Google Drive خاص';$('drive-link').value='';worker.postMessage({type:'open',selection:chosen,token:accessToken});
}
$('drive-connect').onclick=async()=>{try{const chosen=$('drive-link').value.trim()?parseDriveLink($('drive-link').value):selection;if(!chosen)throw Error('أدخل رابط ملفك أو اختره عبر Google Picker.');await connect(chosen);}catch{status('تعذّر الاتصال بـ Drive. تحقق من الإعدادات وصلاحية الملف أو اختر الملف من Files.');}};
$('drive-pick').onclick=async()=>{try{const accessToken=await authenticate();if(!config.apiKey||!config.appId)throw Error('Google setup required');await script('https://apis.google.com/js/api.js');await new Promise(resolve=>gapi.load('picker',resolve));new google.picker.PickerBuilder().addView(new google.picker.DocsView().setMode(google.picker.DocsViewMode.LIST)).setOAuthToken(accessToken).setDeveloperKey(config.apiKey).setAppId(config.appId).setOrigin(location.origin).setCallback(data=>{if(data.action===google.picker.Action.PICKED){const doc=data.docs[0];connect({id:doc.id,...(doc.resourceKey?{resourceKey:doc.resourceKey}:{})}).catch(()=>status('تعذّر فتح ملف Drive.'));}}).build().setVisible(true);}catch{status('تعذّر الاتصال بـ Google. تحقق من الإعدادات أو اختر ملفك من Files.');}};
