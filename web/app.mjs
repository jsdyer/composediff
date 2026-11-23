import {validateConfig,reportForExport,reportCSV} from './model.mjs';
const $=id=>document.getElementById(id);
let config,result=null,page=0,dirty=true,busy=false,worker=null,timer;
const pageSize=30;
function node(tag,text,className){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e;}
function status(text,error=false,id='status'){$(id).textContent=text;$(id).classList.toggle('error',error);}
function setBusy(value){busy=value;for(const id of ['compare','convert','load-example','swap','clear','command-example','before','after','normalize','before-file','after-file','command','service-name'])$(id).disabled=value;}
function markDirty(){dirty=true;if(result){status('Inputs changed. Compare again to update the result.');$('capture-label').textContent='Previous result · inputs have changed';}for(const id of ['save-json','save-csv'])$(id).disabled=true;}
function download(text,name,type){const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function run(message,onResult,statusId='status'){
  worker?.terminate();clearTimeout(timer);setBusy(true);
  worker=new Worker(new URL('./worker.mjs',import.meta.url),{type:'module'});
  const finish=()=>{clearTimeout(timer);worker?.terminate();worker=null;setBusy(false);};
  worker.onmessage=event=>{finish();if(event.data.ok)onResult(event.data.result);else status(event.data.error+(result&&statusId==='status'?' The previous result is unchanged.':''),true,statusId);};
  worker.onerror=()=>{finish();status('The local worker could not finish. Check the input and try again.',true,statusId);};
  timer=setTimeout(()=>{finish();status('Processing exceeded the time limit. Try a smaller document. The previous result is unchanged.',true,statusId);},config.workerTimeoutSeconds*1000);
  worker.postMessage({...message,config});
}
function selectOptions(id,values,all){const current=$(id).value;$(id).replaceChildren(new Option(all,''),...values.map(v=>new Option(v,v)));if(values.includes(current))$(id).value=current;}
function draw(){
  if(!result)return;
  const reveal=$('reveal').checked,service=$('filter-service').value,category=$('filter-category').value,kind=$('filter-kind').value,query=$('filter-query').value.toLowerCase();
  const changes=result.changes.filter(c=>(!service||c.service===service)&&(!category||c.category===category)&&(!kind||c.kind===kind)&&(!query||c.path.toLowerCase().includes(query)));
  const pages=Math.max(1,Math.ceil(changes.length/pageSize));page=Math.min(page,pages-1);
  $('changes').replaceChildren();
  for(const change of changes.slice(page*pageSize,(page+1)*pageSize)){
    const card=node('article',undefined,'change-card'),head=node('div',undefined,'change-header');head.append(node('span',change.category),node('span',change.kind,'badge '+change.kind));card.append(head,node('h3',change.path));
    const values=node('div',undefined,'values');
    for(const side of ['before','after']){const part=node('div');part.append(node('span',side==='before'?'Before':'After'),node('pre',!change[side+'Present']?'(absent)':reveal?JSON.stringify(change[side],null,2):'[hidden]'));values.append(part);}
    card.append(values);$('changes').append(card);
  }
  $('empty').hidden=changes.length>0;$('empty').textContent=result.changes.length?'No changes match these filters.':'No structural differences under the selected comparison rules.';
  $('shown-count').textContent=`${changes.length.toLocaleString()} of ${result.changes.length.toLocaleString()} changes match`;
  $('page-label').textContent=`Page ${page+1} of ${pages}`;$('previous').disabled=page===0;$('next').disabled=page===pages-1;
  $('privacy-note').textContent=reveal?'Values are visible and will be included in exported reports. Review them before sharing.':'Values are hidden. Paths, service names and field names remain visible in reports.';
}
function acceptComparison(value){
  result=value;dirty=false;page=0;$('results').hidden=false;
  $('change-count').textContent=result.changes.length.toLocaleString();$('service-count').textContent=result.services.length.toLocaleString();$('added-count').textContent=result.services.filter(s=>s.status==='added').length;$('removed-count').textContent=result.services.filter(s=>s.status==='removed').length;
  $('capture-label').textContent='Compared '+new Date(result.capturedAt).toLocaleString();
  $('warnings').replaceChildren(...result.warnings.map(w=>node('li',w)));$('service-list').replaceChildren(...result.services.map(s=>{const e=node('div',undefined,'service-row');e.append(node('strong',s.name),node('span',`${s.status} · ${s.changes} changes`));return e;}));
  selectOptions('filter-service',result.services.map(s=>s.name),'All services and top-level changes');selectOptions('filter-category',[...new Set(result.changes.map(c=>c.category))].sort(),'All areas');
  $('save-json').disabled=false;$('save-csv').disabled=false;status(`${result.changes.length} structural changes across ${result.services.length} services. ${result.normalized?'Environment and label forms matched.':'Exact YAML structure compared.'}`);draw();
}
function tab(name){for(const key of ['compare','convert']){$('tab-'+key).setAttribute('aria-selected',String(key===name));$('tab-'+key).tabIndex=key===name?0:-1;$(key+'-panel').hidden=key!==name;}}
for(const name of ['compare','convert']){
  $('tab-'+name).onclick=()=>tab(name);
  $('tab-'+name).onkeydown=e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const target=e.key==='Home'?'compare':e.key==='End'?'convert':name==='compare'?'convert':'compare';tab(target);$('tab-'+target).focus();}};
}
$('compare').onclick=()=>{status('Comparing on this device…');run({action:'compare',before:$('before').value,after:$('after').value,normalize:$('normalize').checked},acceptComparison);};
for(const id of ['before','after','normalize'])$(id).addEventListener(id==='normalize'?'change':'input',markDirty);
$('load-example').onclick=()=>{const example=config.examples[Number($('example').value)];if($('example').value===''||!example){status('Choose a starting example first.');return;}$('before').value=example.before;$('after').value=example.after;for(const side of ['before','after'])$(side+'-name').textContent='Illustrative example · '+example.name;markDirty();$('compare').click();};
$('swap').onclick=()=>{[$('before').value,$('after').value]=[$('after').value,$('before').value];[$('before-name').textContent,$('after-name').textContent]=[$('after-name').textContent,$('before-name').textContent];markDirty();};
$('clear').onclick=()=>{for(const id of ['before','after']){$(id).value='';$(id+'-name').textContent='Paste YAML or JSON, or choose a local file.';}result=null;dirty=true;$('results').hidden=true;status('Workspace cleared. No input has been stored.');};
for(const side of ['before','after'])$(side+'-file').onchange=async event=>{const file=event.target.files?.[0];if(!file)return;try{if(file.size>config.maximumCharacters*4)throw new Error('This file exceeds the configured size limit.');const text=await file.text();if(text.length>config.maximumCharacters)throw new Error('This file exceeds the configured character limit.');$(side).value=text;$(side+'-name').textContent=file.name;markDirty();}catch(e){status(e.message,true);}finally{event.target.value='';}};
for(const id of ['filter-service','filter-category','filter-kind'])$(id).onchange=()=>{page=0;draw();};$('filter-query').oninput=()=>{page=0;draw();};$('reveal').onchange=draw;$('previous').onclick=()=>{page--;draw();};$('next').onclick=()=>{page++;draw();};
$('save-json').onclick=()=>{if(result&&!dirty)download(JSON.stringify(reportForExport(result,$('reveal').checked),null,2),'compose-comparison.json','application/json');};
$('save-csv').onclick=()=>{if(result&&!dirty)download(reportCSV(result,$('reveal').checked),'compose-comparison.csv','text/csv;charset=utf-8');};
$('convert').onclick=()=>{status('Converting the command locally…',false,'convert-status');$('save-yaml').disabled=true;$('use-after').disabled=true;run({action:'convert',command:$('command').value,name:$('service-name').value},value=>{$('converted').value=value.yaml;$('convert-warnings').replaceChildren(...value.warnings.map(w=>node('li',w)));$('save-yaml').disabled=false;$('use-after').disabled=false;status('Draft created. Review the settings before use.',false,'convert-status');},'convert-status');};
for(const id of ['command','service-name'])$(id).oninput=()=>{$('save-yaml').disabled=true;$('use-after').disabled=true;status('Command changed. Convert again to update the draft.',false,'convert-status');};
$('command-example').onclick=()=>{$('command').value=config.commandExample;$('service-name').value='web';$('convert').click();};
$('save-yaml').onclick=()=>download($('converted').value,'compose.yaml','application/yaml');
$('use-after').onclick=()=>{$('after').value=$('converted').value;$('after-name').textContent='Converted docker run draft';markDirty();tab('compare');$('after').focus();};
setBusy(true);
try{const response=await fetch('./config.json');if(!response.ok)throw new Error('Configuration could not load.');config=validateConfig(await response.json());for(const [i,example]of config.examples.entries())$('example').append(new Option(example.name,String(i)));setBusy(false);status('Paste two configurations or choose an example. Values are hidden in reports until you reveal them.');}catch(error){status(error.message,true);setBusy(true);}
