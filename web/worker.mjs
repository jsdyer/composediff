import {compareCompose,convertRun,validateConfig} from './model.mjs';
addEventListener('message',event=>{
  try {
    const {action,before,after,config,normalize,command,name}=event.data;
    const result=action==='convert'?convertRun(command,name):compareCompose(before,after,validateConfig(config),normalize);
    postMessage({ok:true,result});
  } catch(error) {postMessage({ok:false,error:error.message||'The document could not be processed.'});}
});
