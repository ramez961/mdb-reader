import test from 'node:test';
import assert from 'node:assert/strict';
import {buildVehicleFilters,compileFilters,recordValue} from '../src/vehicle.mjs';
import {scan,ReadBudgetError} from '../src/engine.mjs';
const columns=['ActualNB','CodeDesc','UtilisDesc','MarqueDesc','TypeDesc','CouleurDesc','PRODDATE','Prenom','Nom','NomMere','Chassis','Moteur'];
const synthetic={ActualNB:100001,CodeDesc:' T ',UtilisDesc:'تجريبي',MarqueDesc:'DEMO ALPHA',TypeDesc:'MODEL A',CouleurDesc:'اختبار',PRODDATE:' 2002 ',Prenom:'اسم تجريبي',Nom:'سجل افتراضي',NomMere:'أم تجريبية',Chassis:'SYNTHETIC-CHASSIS-1',Moteur:'SYNTHETIC-ENGINE-1'};
test('general search combines plate, lookups and inclusive year range using AND',()=>{
  const filters=buildVehicleFilters({plate:'١٠٠٠٠١',code:'t',usage:'تجريبي',make:'demo alpha',model:'MODEL A',color:'اختبار',yearFrom:'٢٠٠١',yearTo:'2002'});
  const match=compileFilters(filters,columns);
  assert.equal(match(synthetic),true);
  for(const [column,value] of [['ActualNB',100002],['CodeDesc','other'],['MarqueDesc','OTHER'],['PRODDATE','2003'],['PRODDATE',null],['TypeDesc','MODEL B']])assert.equal(match({...synthetic,[column]:value}),false);
});
test('year range rejects reversed and malformed input, accepts one-sided bounds',()=>{
  assert.throws(()=>buildVehicleFilters({yearFrom:'2026',yearTo:'2024'}),/سنة/);
  assert.throws(()=>buildVehicleFilters({yearFrom:'20xx'}),/رقماً/);
  assert.throws(()=>buildVehicleFilters({plate:'1.2'}),/رقماً/);
  const from=compileFilters(buildVehicleFilters({yearFrom:'2002'}),columns);
  assert.equal(from(synthetic),true);assert.equal(from({...synthetic,PRODDATE:'unknown'}),false);
  assert.equal(from({...synthetic,PRODDATE:'01/01/2002'}),false);
  const to=compileFilters(buildVehicleFilters({yearTo:'2002'}),columns);
  assert.equal(to({...synthetic,PRODDATE:'2001'}),true);
});
test('name conditions are combined; chassis and engine contain text without wildcard expansion',()=>{
  const name=compileFilters(buildVehicleFilters({firstName:'تجريبي',surname:'افتراضي',mother:'تجريبية'}),columns);
  assert.equal(name(synthetic),true);assert.equal(name({...synthetic,Nom:'غير مطابق'}),false);
  assert.equal(compileFilters(buildVehicleFilters({chassis:'CHASSIS-1',engine:'engine-1'}),columns)(synthetic),true);
  assert.equal(compileFilters(buildVehicleFilters({chassis:'*'}),columns)(synthetic),false);
  assert.throws(()=>compileFilters([{column:'absent',op:'equals',value:'a'}],columns),/unavailable/);
});
test('combined filtering resumes exactly across page and 50-match boundaries',async()=>{
  const records=Array.from({length:155},(_,i)=>({...synthetic,ActualNB:i,PRODDATE:i%3===0?'1990':'2002'}));
  const table={getColumns:()=>columns.map(name=>({name,type:'text'})),pageCount:Math.ceil(records.length/11),readPage:p=>records.slice(p*11,p*11+11)};
  const source={run:async fn=>fn(),stats:()=>({})};
  const filters=buildVehicleFilters({make:'DEMO ALPHA',yearFrom:'2001',yearTo:'2003'});
  const all=[];let cursor={page:0,row:0},complete=false;
  while(!complete){const result=await scan(source,table,{filters,cursor,resultLimit:50,pageLimit:3});all.push(...result.matches.map(row=>row.ActualNB));cursor=result.cursor;complete=result.complete;}
  assert.deepEqual(all,records.filter(row=>row.PRODDATE==='2002').map(row=>row.ActualNB));
  assert.equal(new Set(all).size,all.length);
});
test('byte cap returns collected matches and a resumable cursor without declaring completion',async()=>{
  let budgetReached=true;
  const table={getColumns:()=>columns.map(name=>({name,type:'text'})),pageCount:2,readPage:p=>{if(p===1&&budgetReached)throw new ReadBudgetError();return [{...synthetic,ActualNB:p}];}};
  const source={run:async fn=>fn(),stats:()=>({})};
  const first=await scan(source,table,{filters:[]});
  assert.equal(first.complete,false);assert.equal(first.stopReason,'byteBudget');assert.deepEqual(first.matches.map(row=>row.ActualNB),[0]);assert.deepEqual(first.cursor,{page:1,row:0});
  budgetReached=false;const next=await scan(source,table,{filters:[],cursor:first.cursor});assert.equal(next.complete,true);assert.deepEqual(next.matches.map(row=>row.ActualNB),[1]);
});
test('raw birth text is not converted, and null and combined registry display safely',()=>{
  assert.equal(recordValue({AgeProp:'01/01/1990'},'AgeProp'),'01/01/1990');
  assert.equal(recordValue({AgeProp:'unknown'},'AgeProp'),'unknown');
  assert.equal(recordValue(null,'AgeProp'),'—');
  assert.equal(recordValue({NoRegProp:'DEMO',BirthPlace:'تجريبي'},'registry'),'DEMO / تجريبي');
});
