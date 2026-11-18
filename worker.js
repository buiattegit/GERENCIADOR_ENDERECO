const DAY = 86400000;
const reply = (data,status=200) => Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
function live(rows){return rows.filter(r=> Number.isFinite(Date.parse(r.created_at)) && Date.parse(r.created_at)>Date.now()-15*DAY);}
async function github(env,method='GET',body){
  if(!env.GITHUB_TOKEN || env.GITHUB_OWNER!=='buiattegit' || env.GITHUB_REPO!=='GERENCIADOR_ENDERECO' || env.GITHUB_BRANCH!=='main') throw Error('Configuração GitHub incompleta');
  return fetch('https://api.github.com/repos/buiattegit/GERENCIADOR_ENDERECO/contents/divergencias.json?ref=main',{method,headers:{Authorization:`Bearer ${env.GITHUB_TOKEN}`,'User-Agent':'Buiatte-Enderecos',Accept:'application/vnd.github+json','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
}
async function read(env){const r=await github(env);if(!r.ok)throw Error('Falha na leitura GitHub');const f=await r.json();const rows=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(f.content.replace(/\s/g,'')),c=>c.charCodeAt(0))));if(!Array.isArray(rows))throw Error('JSON inválido');return {rows,sha:f.sha};}
async function save(env,record){for(let i=0;i<5;i++){const {rows,sha}=await read(env);const next=live(rows);if(record&&!next.some(r=>r.id===record.id))next.push(record);else if(next.length===rows.length)return;if(next.length>10000)throw Error('Limite de registros');const bytes=new TextEncoder().encode(JSON.stringify(next,null,2));let binary='';for(const b of bytes)binary+=String.fromCharCode(b);if(bytes.length>900000)throw Error('Limite do JSON');const r=await github(env,'PUT',{message:'Atualiza histórico de conferências',content:btoa(binary),sha,branch:'main'});if(r.ok)return;if(r.status!==409&&r.status!==422)throw Error('Falha na gravação GitHub');await new Promise(resolve=>setTimeout(resolve,150*(i+1)));}throw Error('Conflito temporário');}
export default {
 async fetch(request,env){const url=new URL(request.url);const path=url.pathname;try{
 if(path.toLowerCase().includes('divergencias.json'))return reply({error:'Não disponível'},404);
 if(path!=='/api/divergencias')return env.ASSETS.fetch(request);
 // API permanece desativada até a proteção de acesso ser configurada e validada.
 if(env.HISTORICO_HABILITADO!=='true')return reply({error:'Histórico ainda não habilitado'},503);
 if(request.method==='GET')return reply(live((await read(env)).rows));
 if(request.method!=='POST')return reply({error:'Método inválido'},405);
 if(request.headers.get('Origin')!==url.origin)return reply({error:'Origem inválida'},403);
 const raw=await request.text();if(raw.length>12000)return reply({error:'Registro muito grande'},413);
 const data=JSON.parse(raw);if(!data||typeof data!=='object'||Array.isArray(data)||typeof data.id!=='string'||!/^[a-zA-Z0-9_-]{8,80}$/.test(data.id))return reply({error:'Registro inválido'},400);
 const record={...data,created_at:new Date().toISOString()};await save(env,record);return reply({ok:true,id:record.id},201);
 }catch(e){console.error(e.message);return reply({error:'Falha ao acessar histórico'},503);}},
 async scheduled(event,env,ctx){if(env.HISTORICO_HABILITADO==='true')ctx.waitUntil(save(env,null));}
};
