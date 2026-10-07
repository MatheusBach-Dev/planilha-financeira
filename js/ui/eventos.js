import {state, ui} from "../core/estado.js";
import {entrarGoogle, sairDaConta} from "../dados/firebase.js";
import {salvarConfig} from "../dados/persistencia.js";
import {sessao} from "../dados/sessao.js";
import {apagarFixo, aplicarAperto, desfazerAperto, limpar, limparDias, marcarAte, marcarDia, mover, remover, removerFixo, salvarConfigManual, salvarFixo, salvarNovo, salvarPagamento, setTab} from "./acoes.js";
import {abrirCheckin, abrirCores, abrirDia, abrirNovo, abrirNovoFixo, abrirPagamento, atualizaAvisoFixo, atualizaRegraFixo, atualizaRegraPag, atualizaSeg, fe, fecharSheet, scrim} from "./folhas.js";
import {abrirIA, cancelarIA, confirmarIA, desfazerIA, enviarAudioIA, enviarIA, limparIA} from "./ia.js";
import {atualizaSaveBar, lerMoney} from "./perfil.js";
import {cliqueInvestir, mudancaInvestir} from "./investir.js";
import {aplicarColuna} from "./ledger.js";
import {escolherMeses, render, trocarLateral} from "./render.js";
import {aplicarTema} from "./tema.js";
import {toast} from "./toast.js";
import {cancelarVoz, gravandoVoz, ligarVoz, terminarVoz} from "./voz.js";

export function ligarEventos(){
scrim.addEventListener("click",function(e){if(e.target===scrim)fecharSheet()});
  ligarVoz(enviarAudioIA);
  document.addEventListener("keydown",function(e){
    if(e.key!=="Escape")return;
    if(gravandoVoz())return cancelarVoz();
    fecharSheet();
  });
  document.addEventListener("click",function(e){
    var t=e.target.closest("[data-tab]");
    if(t)return setTab(t.dataset.tab);
    if(cliqueInvestir(e))return;
    if(e.target.closest("#fabAdd,#topAdd"))return abrirNovo();
    var cm=e.target.closest("[data-checkinmes]");
    if(cm)return abrirCheckin(cm.dataset.checkinmes);
    if(e.target.closest("#btnCheckin"))return abrirCheckin();
    if(e.target.closest("#btnCores"))return abrirCores();
    if(e.target.closest("#prevM"))return mover(-1);
    if(e.target.closest("#nextM"))return mover(1);
  
    var tp=e.target.closest("[data-tipo]");
    if(tp){fe.novoTipo=tp.dataset.tipo;atualizaSeg();return atualizaAvisoFixo()}
  
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
    if(df)return removerFixo(df.dataset.delfixo);
    var af=e.target.closest("[data-apagarfixo]");
    if(af)return apagarFixo(af.dataset.apagarfixo);
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
    if(e.target.closest("#contaLateral"))return setTab("set");
    if(e.target.closest("#btnAperto"))return aplicarAperto();
    if(e.target.closest("#btnDesfazerAperto"))return desfazerAperto();
    if(e.target.closest("#minSheet"))return fecharSheet();
    if(e.target.closest("#addFixo"))return abrirNovoFixo();
    if(e.target.closest("#nSalvar"))return salvarNovo();
    if(e.target.closest("#fSalvar"))return salvarFixo();
    if(e.target.closest("#wipe"))return limpar();
    if(e.target.closest("#btnIA"))return abrirIA();
    if(e.target.closest("#btnLateral,#btnFecharLateral"))return trocarLateral();
    if(e.target.closest("#iaEnviar"))return gravandoVoz()?terminarVoz():enviarIA();
    if(e.target.closest("#iaLimpar"))return limparIA();
    var io=e.target.closest("[data-iaok]");
    if(io)return confirmarIA(io.dataset.iaok);
    var ic=e.target.closest("[data-iano]");
    if(ic)return cancelarIA(ic.dataset.iano);
    var idz=e.target.closest("[data-iadesfaz]");
    if(idz)return desfazerIA(idz.dataset.iadesfaz);
  
    var linha=e.target.closest("#painels tbody tr");
    if(linha)return abrirDia(+linha.dataset.dia,linha.closest(".painel").dataset.mes);
  });
  document.addEventListener("keydown",function(e){
    if(e.key!=="Enter"&&e.key!==" ")return;
    if(!e.target.closest)return;
    if(e.key==="Enter"&&e.target.id==="iaTexto"){
      if(!e.isComposing){e.preventDefault();enviarIA()}
      return;
    }
    var linha=e.target.closest("#painels tbody tr");
    if(linha&&!e.target.closest(".tick")){
      e.preventDefault();
      abrirDia(+linha.dataset.dia,linha.closest(".painel").dataset.mes);
    }
  });
  document.addEventListener("input",function(e){
    if(mudancaInvestir(e))return;
    if(e.target.closest&&e.target.closest("#viewSet [data-set]")){
      ui.cfgSujo=true;atualizaSaveBar();
    }
    if(e.target.closest&&e.target.closest("#sheet"))atualizaAvisoFixo();
  });
  document.addEventListener("change",function(e){
    if(mudancaInvestir(e))return;
    var s=e.target.closest("[data-set]");
    if(s){
      var k=s.dataset.set;
      var val=s.type==="checkbox"?s.checked:s.hasAttribute("data-money")?lerMoney(s):(s.type==="number"?(+s.value||0):s.value);
      if(k==="tema"){state.config[k]=val;state.config.temaEscolhido=true;aplicarTema()}
      else state.config[k]=val;
      ui.cfgSujo=false;
      salvarConfig();render();
      return;
    }
    if(e.target.id==="fRegra")atualizaRegraFixo();
    if(e.target.id==="pRegra")return atualizaRegraPag();
    if(e.target.closest&&e.target.closest("#sheet"))return atualizaAvisoFixo();
    if(e.target.id==="qtdSel")return escolherMeses(e.target.value);
    if(e.target.id==="colSel")return aplicarColuna();
  });
}
