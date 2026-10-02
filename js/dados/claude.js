import {localSave, normalizarConfig, state, temDados} from "../core/estado.js";
import {salvarConfig, salvarMes} from "./persistencia.js";
import {sessao} from "./sessao.js";
import {render} from "../ui/render.js";
import {aplicarTema} from "../ui/tema.js";

export function conectar(){
  if(!window.claude||typeof window.claude.use!=="function")return;

  Promise.resolve(window.claude.use("user")).then(function(u){
    if(u&&typeof u.can==="function"){
      try{if(u.can("data.write")===false){sessao.readOnly=true;render()}}catch(e){}
    }
  }).catch(function(){});

  Promise.resolve(window.claude.use("db")).then(function(d){
    if(!d)return;
    sessao.db=d;
    var erro=function(e){if(e&&e.code==="revoked"){sessao.db=null;sessao.readOnly=true;render()}};

    sessao.db.doc("config/geral").onSnapshot(function(snap){
      if(snap.exists)state.config=normalizarConfig(Object.assign({},state.config,snap.data()));
      else if(!sessao.syncConfig&&!sessao.readOnly)salvarConfig();
      sessao.syncConfig=true;
      aplicarTema();localSave();render();
    },erro);

    sessao.db.collection("meses").onSnapshot(function(snap){
      var remoto={};
      snap.docs.forEach(function(s){
        var d=s.data()||{};
        var conf=Array.isArray(d.conferidos)?d.conferidos.slice():[];
        if(!conf.length&&typeof d.checkin==="number"&&d.checkin>0){
          for(var i=1;i<=d.checkin;i++)conf.push(i);
        }
        remoto[s.id]={
          lancamentos:(d.lancamentos||[]).slice(),
          conferidos:conf,
          pulados:(d.pulados||[]).slice(),
          rebases:(d.rebases||[]).slice()
        };
      });
      if(!sessao.syncMeses){
        sessao.syncMeses=true;
        var locais=Object.keys(state.meses);
        locais.forEach(function(k){
          if(!remoto[k]&&temDados(state.meses[k])){
            remoto[k]=state.meses[k];
            if(!sessao.readOnly)salvarMes(k);
          }
        });
      }
      state.meses=remoto;
      localSave();render();
    },erro);

    render();
  }).catch(function(){});
}
