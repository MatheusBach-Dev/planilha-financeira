import {sessao} from "./sessao.js";

// A IA só existe com login do Firebase: o servidor confere o token antes de gastar a cota.
export function iaDisponivel(){return !!(sessao.pronto&&sessao.usuarioId&&sessao.user)}

export function perguntarIA(mensagens,contexto){
  if(!sessao.user){var semLogin=new Error("login");semLogin.codigo="login";return Promise.reject(semLogin)}
  return sessao.user.getIdToken().then(function(token){
    return fetch("/api/chat",{
      method:"POST",
      headers:{"Content-Type":"application/json","Authorization":"Bearer "+token},
      body:JSON.stringify({mensagens:mensagens,contexto:contexto})
    });
  }).then(function(r){
    return r.json().catch(function(){return {}}).then(function(d){
      if(r.ok)return d;
      var e=new Error(d.erro||("http "+r.status));
      e.codigo=d.erro||"";e.espera=+d.espera||0;
      throw e;
    });
  });
}
