import {parseDocument, stringify} from './vendor/yaml-2.9.1.mjs';

const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const own = (object,key) => Object.prototype.hasOwnProperty.call(object,key);
export const pointer = parts => '/' + parts.map(x=>String(x).replaceAll('~','~0').replaceAll('/','~1')).join('/');

export function validateConfig(value) {
  if (!plain(value)) throw new Error('The application configuration is invalid.');
  for (const key of ['maximumCharacters','maximumNodes','maximumDepth','maximumAliases','maximumChanges','workerTimeoutSeconds']) {
    if (!Number.isInteger(value[key]) || value[key] < 1) throw new Error(`Invalid configuration: ${key}.`);
  }
  if (value.maximumCharacters>2000000 || value.maximumNodes>100000 || value.maximumDepth>100 || value.maximumAliases>100 || value.maximumChanges>20000 || value.workerTimeoutSeconds>30) throw new Error('Configuration exceeds the browser safety limits.');
  if (!Array.isArray(value.examples) || !value.examples.every(x=>plain(x)&&typeof x.name==='string'&&typeof x.before==='string'&&typeof x.after==='string')) throw new Error('Examples need a name, before and after text.');
  return value;
}

function safeTree(value, config, seen=new Set(), state={nodes:0}, depth=0) {
  if (++state.nodes > config.maximumNodes || depth>config.maximumDepth) throw new Error('Expanded document is too large or deeply nested.');
  if (value===null || ['string','boolean'].includes(typeof value)) return value;
  if (typeof value==='number' && Number.isFinite(value)) return value;
  if (typeof value!=='object') throw new Error('Only ordinary YAML scalar, list and mapping values are supported.');
  if (seen.has(value)) throw new Error('Recursive YAML aliases are not supported.');
  seen.add(value);
  const output = Array.isArray(value) ? [] : Object.create(null);
  for (const [key,child] of Object.entries(value)) output[key]=safeTree(child,config,seen,state,depth+1);
  seen.delete(value);
  return output;
}

function mapEntries(value, field, service) {
  if (value==null) return value;
  if (plain(value)) return Object.fromEntries(Object.entries(value).map(([key,v])=>{
    if(v!==null&&!['string','number'].includes(typeof v))throw new Error(`${service}.${field} values must be strings, numbers or null; quote boolean text.`);
    return [key,v==null?null:String(v)];
  }));
  if (!Array.isArray(value)) throw new Error(`${service}.${field} must be a mapping or a list.`);
  const result=Object.create(null);
  for (const entry of value) {
    if (typeof entry!=='string') throw new Error(`${service}.${field} list entries must be strings.`);
    const split=entry.indexOf('='), key=split<0?entry:entry.slice(0,split), val=split<0?null:entry.slice(split+1);
    if (!key || own(result,key)) throw new Error(`${service}.${field} has an empty or duplicate key.`);
    result[key]=val;
  }
  return result;
}

export function parseCompose(text, config, normalize=true) {
  if (typeof text!=='string' || !text.trim()) throw new Error('Paste a Compose document on both sides.');
  if (text.length>config.maximumCharacters) throw new Error(`Document exceeds ${config.maximumCharacters.toLocaleString()} characters.`);
  const doc=parseDocument(text,{version:'1.2',schema:'core',merge:true,uniqueKeys:true,prettyErrors:false});
  if(doc.errors.length) throw new Error(`YAML could not be read: ${doc.errors[0].message}`);
  if(doc.warnings.length) throw new Error(`Unsupported YAML: ${doc.warnings[0].message}`);
  const data=safeTree(doc.toJS({maxAliasCount:config.maximumAliases,mapAsMap:false}),config);
  if(!plain(data)||!plain(data.services)) throw new Error('A Compose document needs a services mapping.');
  for(const [name,service] of Object.entries(data.services)) {
    if(!name || !plain(service)) throw new Error(`Service ${name||'(unnamed)'} must be a mapping.`);
    if(normalize) for(const field of ['environment','labels']) if(own(service,field)) service[field]=mapEntries(service[field],field,name);
  }
  const warnings=[];
  if(/\$\{|\$[A-Za-z_]/.test(text)) warnings.push('Variable expressions are compared literally; no .env or shell environment is loaded.');
  if(own(data,'include') || Object.values(data.services).some(x=>own(x,'extends')||own(x,'env_file'))) warnings.push('Referenced include, extends and env_file files are not loaded. For effective runtime settings, compare two docker compose config outputs.');
  if(own(data,'jobs')) warnings.push('Jobs are compared structurally; service summary counts cover the services mapping only.');
  return {data,warnings};
}

function category(parts) {
  if(parts[0]!=='services') return parts[0]||'document';
  const field=parts[2];
  if(!field) return 'services';
  if(['environment','env_file'].includes(field)) return 'environment';
  if(['ports','expose'].includes(field)) return 'ports';
  if(['volumes','volumes_from'].includes(field)) return 'volumes';
  if(['networks','network_mode','dns','extra_hosts'].includes(field)) return 'networking';
  if(['image','build','pull_policy'].includes(field)) return 'image / build';
  if(['secrets','configs','privileged','cap_add','cap_drop','security_opt','read_only','user'].includes(field)) return 'permissions / secrets';
  return 'other service settings';
}

export function compareData(before,after,maximumChanges=5000) {
  const changes=[];
  const add=(kind,parts,a,b)=>{
    if(changes.length>=maximumChanges) throw new Error('Too many changes to display safely. Compare smaller configurations.');
    changes.push({kind,path:pointer(parts),service:parts[0]==='services'?parts[1]||'':'',category:category(parts),beforePresent:kind!=='added',afterPresent:kind!=='removed',before:a,after:b});
  };
  function visit(a,b,parts) {
    if(Object.is(a,b)) return;
    if(plain(a)&&plain(b)) {
      for(const key of [...new Set([...Object.keys(a),...Object.keys(b)])].sort()) {
        if(!own(a,key)) add('added',[...parts,key],undefined,b[key]);
        else if(!own(b,key)) add('removed',[...parts,key],a[key],undefined);
        else visit(a[key],b[key],[...parts,key]);
      }
    } else if(Array.isArray(a)&&Array.isArray(b)) {
      for(let i=0;i<Math.max(a.length,b.length);i++) {
        if(i>=a.length) add('added',[...parts,i],undefined,b[i]);
        else if(i>=b.length) add('removed',[...parts,i],a[i],undefined);
        else visit(a[i],b[i],[...parts,i]);
      }
    } else add('changed',parts,a,b);
  }
  visit(before,after,[]);
  const services=[...new Set([...Object.keys(before.services),...Object.keys(after.services)])].sort().map(name=>({name,status:!own(before.services,name)?'added':!own(after.services,name)?'removed':changes.some(x=>x.service===name)?'changed':'unchanged',changes:changes.filter(x=>x.service===name).length}));
  return {changes,services};
}

export function compareCompose(before,after,config,normalize=true) {
  let left,right;
  try { left=parseCompose(before,config,normalize); } catch(e) {throw new Error(`Before: ${e.message}`);}
  try { right=parseCompose(after,config,normalize); } catch(e) {throw new Error(`After: ${e.message}`);}
  return {...compareData(left.data,right.data,config.maximumChanges),warnings:[...new Set([...left.warnings,...right.warnings])],normalized:normalize,capturedAt:new Date().toISOString()};
}

export function reportForExport(result,reveal=false) {
  return {schema:'coolcode.composediff.v1',capturedAt:result.capturedAt,comparison:'YAML structure; no external file loading or interpolation',normalizedEnvironmentAndLabels:result.normalized,valuesIncluded:reveal,warnings:result.warnings,services:result.services,changes:result.changes.map(c=>({...c,before:c.beforePresent?(reveal?c.before:'[hidden]'):null,after:c.afterPresent?(reveal?c.after:'[hidden]'):null}))};
}

export function reportCSV(result,reveal=false) {
  const cell=v=>'"'+String(v??'').replace(/^[=+\-@\t\r]/,"'$&").replaceAll('"','""')+'"';
  const value=(c,key)=>c[key+'Present']?(reveal?JSON.stringify(c[key]):'[hidden]'):'(absent)';
  return [['Change','Path','Service','Category','Before','After'],...result.changes.map(c=>[c.kind,c.path,c.service,c.category,value(c,'before'),value(c,'after')])].map(r=>r.map(cell).join(',')).join('\r\n');
}

// Deliberately limited POSIX-like tokenization. This never evaluates shell text.
export function tokenizeCommand(text) {
  if(typeof text!=='string'||text.length>30000) throw new Error('Use a command under 30,000 characters.');
  const tokens=[];let token='',quote='',active=false;
  for(let i=0;i<text.length;i++) {
    const ch=text[i];
    if(quote==="'") {if(ch==="'")quote='';else token+=ch;active=true;continue;}
    if(ch==='`'||(ch==='$'&&text[i+1]==='(')) throw new Error('Shell substitutions are not supported. Paste literal values.');
    if(ch==='\\') {if(i+1>=text.length)throw new Error('Trailing backslash.');if(text[i+1]==='\n'){i++;continue;}if(quote==='"'&&!['\\','"','$','`'].includes(text[i+1])){token+='\\';active=true;continue;}token+=text[++i];active=true;continue;}
    if(ch==='"') {quote=quote==='"'?'':'"';active=true;continue;}
    if(!quote&&ch==="'") {quote="'";active=true;continue;}
    if(!quote&&/[;&|<>]/.test(ch)) throw new Error('Use one docker run command without shell operators or redirection.');
    if(!quote&&/\s/.test(ch)) {if(active){tokens.push(token);token='';active=false;}continue;}
    if(ch==='$') throw new Error('Shell variables are not expanded. Replace them with literal values first.');
    token+=ch;active=true;
  }
  if(quote)throw new Error('Unclosed quote.');
  if(active)tokens.push(token);
  return tokens;
}

export function convertRun(text,serviceName='app') {
  if(!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(serviceName)) throw new Error('Use a service name containing letters, digits, dots, underscores or hyphens.');
  const tokens=tokenizeCommand(text);if(tokens[0]!=='docker')throw new Error('Start with docker run (or docker container run).');
  let i=tokens[1]==='container'?2:1;if(tokens[i++]!=='run')throw new Error('Only docker run is supported.');
  const service=Object.create(null),volumes=Object.create(null),warnings=[],flags={'--name':'container_name','--hostname':'hostname','--user':'user','--workdir':'working_dir','-w':'working_dir','-u':'user','--restart':'restart','--platform':'platform','--entrypoint':'entrypoint','--network':'network_mode'};
  const lists={'--publish':'ports','-p':'ports','--volume':'volumes','-v':'volumes','--env':'environment','-e':'environment','--env-file':'env_file','--label':'labels','-l':'labels','--cap-add':'cap_add','--cap-drop':'cap_drop','--security-opt':'security_opt','--dns':'dns','--add-host':'extra_hosts','--expose':'expose'};
  for(;i<tokens.length;i++) {
    let token=tokens[i];if(token==='--'){i++;break;}if(!token.startsWith('-'))break;
    if(['-d','--detach','--rm'].includes(token)){warnings.push(`${token} is a run-time CLI choice and is not written to Compose.`);continue;}
    if(['-it','-ti'].includes(token)){service.stdin_open=true;service.tty=true;continue;}
    if(['-i','--interactive','-t','--tty','--privileged','--read-only','--init'].includes(token)) {service[({'-i':'stdin_open','--interactive':'stdin_open','-t':'tty','--tty':'tty','--privileged':'privileged','--read-only':'read_only','--init':'init'})[token]]=true;continue;}
    let option=token,value;const equal=token.indexOf('=');
    if(equal>0){option=token.slice(0,equal);value=token.slice(equal+1);}
    else if(/^-[pevlwu].+/.test(token)){option=token.slice(0,2);value=token.slice(2);}
    if(!(option in flags)&&!(option in lists)) throw new Error(`Unsupported option ${option}. No partial Compose output was produced.`);
    if(value===undefined){if(i+1>=tokens.length||tokens[i+1].startsWith('--'))throw new Error(`Missing value for ${option}.`);value=tokens[++i];}
    if(value==='')throw new Error(`Empty value for ${option}.`);
    if(option in flags){if(own(service,flags[option]))throw new Error(`Repeated ${option} is ambiguous.`);service[flags[option]]=option==='--entrypoint'?[value]:value;}
    else {
      (service[lists[option]]??=[]).push(value);
      if(lists[option]==='volumes'){
        if(/^[A-Za-z]:/.test(value))throw new Error('Windows drive paths are outside this POSIX-like converter. Write that mount in Compose manually.');
        const source=value.split(':')[0];
        if(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(source)&&value.includes(':'))volumes[source]={external:true,name:source};
      }
    }
  }
  if(i>=tokens.length||!tokens[i]||tokens[i].startsWith('-'))throw new Error('The image name is missing.');
  const image=tokens[i++];if(/\s/.test(image))throw new Error('Image names cannot contain spaces.');
  if(i<tokens.length)service.command=tokens.slice(i);
  if(service.environment)mapEntries(service.environment,'environment',serviceName);
  if(service.labels)mapEntries(service.labels,'labels',serviceName);
  if(service.network_mode&& !['host','none','bridge'].includes(service.network_mode)&&!service.network_mode.startsWith('container:')) throw new Error('Named Docker networks require an explicit Compose networks/external definition; this converter does not guess it.');
  const document={services:{[serviceName]:{image,...service}}};
  if(Object.keys(volumes).length){document.volumes=volumes;warnings.push('Named volumes reference their existing Docker names as external volumes; create them first if they do not exist.');}
  // Compose interpolation also applies to quoted YAML. Escape literal dollars
  // retained from single-quoted or backslash-escaped shell arguments.
  const literal=value=>typeof value==='string'?value.replaceAll('$',()=>'$$'):Array.isArray(value)?value.map(literal):plain(value)?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,literal(v)])):value;
  const yaml=stringify(literal(document),{lineWidth:100});
  warnings.push('Review the generated file and validate with docker compose config before using it.');
  return {yaml,warnings};
}
