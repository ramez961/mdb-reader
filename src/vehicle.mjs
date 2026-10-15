// Form mappings are column names, never database records.
export const vehicleFields = [
  ['ActualNB','الرقم','plate'], ['CodeDesc','الرمز','code'],
  ['MarqueDesc','الماركة','make'], ['TypeDesc','الطراز','model'],
  ['UtilisDesc','وجهة الاستعمال','usage'], ['PRODDATE','سنة الصنع','year'],
  ['PreMiseCirc','سنة التسجيل','registration'], ['Chassis','رقم الهيكل','chassis'],
  ['Moteur','رقم المحرك','engine'], ['CouleurDesc','اللون','color'],
  ['dateaquisition','تاريخ الملكية','acquisition'], ['Prenom','الاسم','first-name'],
  ['Nom','الشهرة','surname'], ['NomMere','اسم الأم','mother'],
  ['AgeProp','تاريخ الولادة','birth'], ['registry','السجل والمحلة','registry'],
  ['TelProp','أرقام الهاتف','phone'], ['Addresse','العنوان','address'],
];
export const asciiDigits = value => String(value ?? '').replace(/[٠-٩۰-۹]/g, c => String(c.charCodeAt(0) >= 0x6f0 ? c.charCodeAt(0)-0x6f0 : c.charCodeAt(0)-0x660));
export const normalize = value => asciiDigits(value).normalize('NFC').trim().toLocaleLowerCase('ar');
function integer(value,label) {
  const text=asciiDigits(value).trim();
  if(!/^\d+$/.test(text)||!Number.isSafeInteger(Number(text)))throw Error(`${label}: أدخل رقماً صحيحاً.`);
  return Number(text);
}
export function buildVehicleFilters(values) {
  const filters=[];
  if(String(values.plate??'').trim())filters.push({column:'ActualNB',op:'numberEquals',value:integer(values.plate,'الرقم')});
  for(const [key,column] of [['code','CodeDesc'],['usage','UtilisDesc'],['make','MarqueDesc'],['model','TypeDesc'],['color','CouleurDesc']])
    if(String(values[key]??'').trim())filters.push({column,op:'equals',value:String(values[key]).trim()});
  for(const [key,column] of [['firstName','Prenom'],['surname','Nom'],['mother','NomMere'],['chassis','Chassis'],['engine','Moteur']])
    if(String(values[key]??'').trim())filters.push({column,op:'contains',value:String(values[key]).trim()});
  const hasFrom=String(values.yearFrom??'').trim()!=='';
  const hasTo=String(values.yearTo??'').trim()!=='';
  if(hasFrom||hasTo){
    const min=hasFrom?integer(values.yearFrom,'سنة الصنع من'):null;
    const max=hasTo?integer(values.yearTo,'سنة الصنع إلى'):null;
    if((min!==null&&(min<1||min>9999))||(max!==null&&(max<1||max>9999)))throw Error('سنة الصنع يجب أن تكون بين 1 و9999.');
    if(min!==null&&max!==null&&min>max)throw Error('سنة البداية يجب أن تسبق سنة النهاية أو تساويها.');
    filters.push({column:'PRODDATE',op:'yearRange',min,max});
  }
  return filters;
}
export function compileFilters(filters,columns) {
  if(!Array.isArray(filters)||filters.length>20)throw Error('Invalid filters');
  const predicates=filters.map(filter=>{
    if(!columns.includes(filter.column))throw Error('Search field unavailable in this database');
    const {column,op}=filter;
    if(op==='equals'||op==='contains'){
      const value=normalize(filter.value);
      return record=>record[column]!=null&&(op==='equals'?normalize(record[column])===value:normalize(record[column]).includes(value));
    }
    if(op==='numberEquals'){
      if(!Number.isSafeInteger(filter.value)||filter.value<0)throw Error('Invalid numeric filter');
      return record=>record[column]!=null&&/^\d+$/.test(asciiDigits(record[column]).trim())&&Number(asciiDigits(record[column]).trim())===filter.value;
    }
    if(op==='yearRange'){
      const {min,max}=filter;
      if((min!==null&&(!Number.isInteger(min)||min<1||min>9999))||(max!==null&&(!Number.isInteger(max)||max<1||max>9999))||(min!==null&&max!==null&&min>max))throw Error('Invalid year range');
      return record=>{const text=asciiDigits(record[column]).trim();if(!/^\d{1,4}$/.test(text))return false;const year=Number(text);return year>0&&(min===null||year>=min)&&(max===null||year<=max);};
    }
    throw Error('Unsupported filter');
  });
  return record=>predicates.every(predicate=>predicate(record));
}
export function recordValue(record,column) {
  if(!record)return '—';
  if(column==='registry')return [record.NoRegProp,record.BirthPlace].filter(value=>value!=null&&String(value).trim()).join(' / ')||'—';
  const value=record[column];return value==null||String(value).trim()===''?'—':String(value);
}
