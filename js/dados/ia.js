import {sessao} from "./sessao.js";

// A IA só existe com login do Firebase: o servidor confere o token antes de gastar a cota.
export function iaDisponivel(){return !!(sessao.pronto&&sessao.usuarioId&&sessao.user)}

export function perguntarIA(mensagens,contexto){
  return chamarServidor("/api/chat",{mensagens:mensagens,contexto:contexto});
}

// Manda pro servidor da assistente com o login; qualquer erro volta com e.codigo
// (os mesmos códigos que a tela do chat já sabe explicar).
export function chamarServidor(caminho,corpo){
  if(!sessao.user)return Promise.reject(erroIA("login"));
  return sessao.user.getIdToken().then(function(token){
    return fetch(caminho,{
      method:"POST",
      headers:{"Content-Type":"application/json","Authorization":"Bearer "+token},
      body:JSON.stringify(corpo)
    }).catch(function(){throw erroIA("rede")});
  }).then(function(r){
    return r.json().catch(function(){return null}).then(function(d){
      if(r.ok&&d)return d;
      // o servidor da assistente sempre responde JSON; sem JSON, quem respondeu foi outro servidor
      // (prévia local, servidor estático) ou a função quebrou na Vercel
      if(!d)throw erroIA([200,404,405,501].indexOf(r.status)>=0?"sem_servidor":"servidor",{detalhe:"http "+r.status});
      throw erroIA(d.erro||"",{espera:+d.espera||0,modelo:d.modelo||"",detalhe:d.detalhe||("http "+r.status)});
    });
  });
}

export function erroIA(codigo,extra){
  var e=new Error(codigo||"ia");
  e.codigo=codigo;
  Object.keys(extra||{}).forEach(function(k){e[k]=extra[k]});
  return e;
}
