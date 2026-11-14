import {sessao} from "./sessao.js";

// Fase de teste da ligação com os bancos: pergunta ao servidor (api/pluggy-teste.js) o que a Pluggy
// devolve das conexões do dono. Só leitura. Devolve sempre {ok, status, dados}.
export function testarBancos(corpo){
  if(!sessao.user)return Promise.resolve({ok:false,status:0,dados:{erro:"login"}});
  return sessao.user.getIdToken().then(function(token){
    return fetch("/api/pluggy-teste",{
      method:"POST",
      headers:{"Content-Type":"application/json","Authorization":"Bearer "+token},
      body:JSON.stringify(corpo)
    });
  }).then(function(r){
    return r.json().catch(function(){return null}).then(function(d){
      return {ok:r.ok&&!!d,status:r.status,dados:d||{erro:"sem_servidor"}};
    });
  }).catch(function(){return {ok:false,status:0,dados:{erro:"rede"}}});
}
