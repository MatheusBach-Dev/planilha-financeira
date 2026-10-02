import {state, ui} from "../core/estado.js";
import {entrarGoogle, sairDaConta} from "../dados/firebase.js";
import {salvarConfig} from "../dados/persistencia.js";
import {sessao} from "../dados/sessao.js";
import {aplicarAperto, desfazerAperto, limpar, limparDias, marcarAte, marcarDia, mover, remover, salvarConfigManual, salvarFixo, salvarNovo, salvarPagamento, setTab} from "./acoes.js";
import {abrirCheckin, abrirCores, abrirDia, abrirNovo, abrirNovoFixo, abrirPagamento, atualizaRegraFixo, atualizaRegraPag, atualizaSeg, fe, fecharSheet, scrim} from "./folhas.js";
import {atualizaSaveBar, lerMoney} from "./perfil.js";
import {render} from "./render.js";
import {aplicarTema} from "./tema.js";
import {toast} from "./toast.js";

export function ligarEventos(){
scrim.addEventListener("click",function(e){if(e.target===scrim)fecharSheet()});
  document.addEventListener("keydown",function(e){if(e.key==="Escape")fecharSheet()});
  document.addEventListener("click",function(e){
    var t=e.target.closest("[data-tab]");
    if(t)return setTab(t.dataset.tab);
    if(e.target.closest("#fabAdd"))return abrirNovo();
    var cm=e.target.closest("[data-checkinmes]");
    if(cm)return abrirCheckin(cm.dataset.checkinmes);
    if(e.target.closest("#btnCheckin"))return abrirCheckin();
    if(e.target.closest("#btnCores"))return abrirCores();
    if(e.target.closest("#prevM"))return mover(-1);
    if(e.target.closest("#nextM"))return mover(1);
  
    var tp=e.target.closest("[data-tipo]");
    if(tp){fe.novoTipo=tp.dataset.tipo;return atualizaSeg()}
  
    var tick=e.target.closest(".tick");
    if(tick){
      e.stopPropagation();
      var trT=tick.closest("tr"),pT=tick.closest(".painel");
      return marcarDia(pT.dataset.mes,+trT.dataset.dia);
    }
  
    var ad=e.target.closest("[data-add-dia]");
    if(ad)return abrirNovo(+ad.dataset.addDia,ad.dataset.mes);
  
    var td=e.target.closest("[data-toggledia]");
    if(td){marcarDia(td.dataset.mes,+td.dataset.toggledia);return fecharSheet()}
  
    var aa=e.target.closest("[data-ateaqui]");
    if(aa){marcarAte(aa.dataset.mes,+aa.dataset.ateaqui);return fecharSheet()}
  
    var ld=e.target.closest("[data-limpardias]");
    if(ld){limparDias(ld.dataset.limpardias);return fecharSheet()}
  
    var del=e.target.closest("[data-del]");
    if(del)return remover(del.dataset.del,del.dataset.mes);
  
    var df=e.target.closest("[data-delfixo]");
    if(df){
      if(sessao.readOnly)return toast("Você tem acesso só de leitura aqui.");
      state.config.fixos=(state.config.fixos||[]).filter(function(f){return f.id!==df.dataset.delfixo});
      fe.fixoEditando=null;salvarConfig();fecharSheet();render();return toast("Conta fixa removida.");
    }
    var dp=e.target.closest("[data-delpag]");
    if(dp){
      if(sessao.readOnly)return toast("Você tem acesso só de leitura aqui.");
      state.config.pagamentos=(state.config.pagamentos||[]).filter(function(x){return x.id!==dp.dataset.delpag});
      fe.pagEditando=null;salvarConfig();fecharSheet();render();return toast("Período removido.");
    }
    var el=e.target.closest("[data-editlanc]");
    if(el)return abrirNovo(+el.dataset.dia,el.dataset.mes,el.dataset.editlanc);
    var ep=e.target.closest("[data-editpag]");
    if(ep)return abrirPagamento(ep.dataset.editpag);
    if(e.target.closest("#addPag"))return abrirPagamento();
    if(e.target.closest("#pSalvar"))return salvarPagamento();
    var ef=e.target.closest("[data-editfixo]");
    if(ef)return abrirNovoFixo(ef.dataset.editfixo);
    if(e.target.closest("#btnGoogle"))return entrarGoogle();
    if(e.target.closest("#btnSair"))return sairDaConta();
    if(e.target.closest("#btnSalvarCfg"))return salvarConfigManual();
    if(e.target.closest("#btnAperto"))return aplicarAperto();
    if(e.target.closest("#btnDesfazerAperto"))return desfazerAperto();
    if(e.target.closest("#minSheet"))return fecharSheet();
    if(e.target.closest("#addFixo"))return abrirNovoFixo();
    if(e.target.closest("#nSalvar"))return salvarNovo();
    if(e.target.closest("#fSalvar"))return salvarFixo();
    if(e.target.closest("#wipe"))return limpar();
  
    var linha=e.target.closest("#painels tbody tr");
    if(linha)return abrirDia(+linha.dataset.dia,linha.closest(".painel").dataset.mes);
  });
  document.addEventListener("keydown",function(e){
    if(e.key!=="Enter"&&e.key!==" ")return;
    if(!e.target.closest)return;
    var linha=e.target.closest("#painels tbody tr");
    if(linha&&!e.target.closest(".tick")){
      e.preventDefault();
      abrirDia(+linha.dataset.dia,linha.closest(".painel").dataset.mes);
    }
  });
  document.addEventListener("input",function(e){
    if(e.target.closest&&e.target.closest("#viewSet [data-set]")){
      ui.cfgSujo=true;atualizaSaveBar();
    }
  });
  document.addEventListener("change",function(e){
    var s=e.target.closest("[data-set]");
    if(s){
      var k=s.dataset.set;
      var val=s.hasAttribute("data-money")?lerMoney(s):(s.type==="number"?(+s.value||0):s.value);
      if(k==="tema"){state.config[k]=val;state.config.temaEscolhido=true;aplicarTema()}
      else state.config[k]=val;
      ui.cfgSujo=false;
      salvarConfig();render();
      return;
    }
    if(e.target.id==="fRegra")return atualizaRegraFixo();
    if(e.target.id==="pRegra")return atualizaRegraPag();
    if(e.target.id==="colSel"){
      document.querySelectorAll("#painels table").forEach(function(t){t.dataset.col=e.target.value});
    }
  });
}
