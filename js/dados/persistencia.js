import {localSave, mesDoc, state} from "../core/estado.js";
import {sessao} from "./sessao.js";
import {render} from "../ui/render.js";
import {toast} from "../ui/toast.js";

export function salvarMes(k){
  var d=mesDoc(k);
  localSave();
  var dados={lancamentos:d.lancamentos,conferidos:d.conferidos,pulados:d.pulados,rebases:d.rebases};
  if(sessao.pronto&&sessao.usuarioId){
    sessao.api.fs.setDoc(sessao.api.fs.doc(sessao.fsdb,"users",sessao.usuarioId,"meses",k),dados).catch(erroEscrita);
    return;
  }
  if(sessao.db&&!sessao.readOnly)sessao.db.doc("meses/"+k).set(dados).catch(erroEscrita);
}

export function salvarConfig(){
  localSave();
  var dados=JSON.parse(JSON.stringify(state.config));
  if(sessao.pronto&&sessao.usuarioId){
    sessao.api.fs.setDoc(sessao.api.fs.doc(sessao.fsdb,"users",sessao.usuarioId,"config","geral"),dados).catch(erroEscrita);
    return;
  }
  if(sessao.db&&!sessao.readOnly)sessao.db.doc("config/geral").set(dados).catch(erroEscrita);
}

export function erroEscrita(e){
  if(e&&e.code==="invalid_argument"){sessao.readOnly=true;toast("Você tem acesso só de leitura aqui.");render()}
  else if(e&&e.code==="quota_exceeded")toast("Acabou o espaço. Apague lançamentos antigos.");
  else toast("Não deu pra salvar agora. Tente de novo.");
}
