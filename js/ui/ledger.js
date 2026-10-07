import {calcular, inicialDe} from "../core/calculo.js";
import {cicloDoDia, dadosDia, diariaDe} from "../core/ciclo.js";
import {COR_NEGATIVO, corPorPercentual, cssVar, fracaoCor, hex2rgb, lum, mix} from "../core/cores.js";
import {HOJE_DIA, HOJE_KEY, key, parseKey, somaMes} from "../core/datas.js";
import {ui} from "../core/estado.js";
import {$, DOW, MESES, money, num} from "../core/formato.js";
import {regraPagamento, valorPagamento} from "../core/pagamento.js";
import {ehLargo, mesesNaTela, vista} from "./render.js";

var observador=null;

// "mostrar tudo" (entrada, saída e diário juntos, como na planilha) só existe no computador
function opcaoTudo(){
  var sel=$("colSel"),quer=ehLargo(),op=sel.querySelector('option[value="tudo"]');
  if(quer&&!op){sel.insertBefore(new Option("mostrar tudo","tudo"),sel.firstChild);sel.value="tudo"}
  else if(!quer&&op){var era=sel.value==="tudo";op.remove();if(era)sel.value="diario"}
}

// as cinco colunas precisam de uns 300px por mês; abaixo disso o "mostrar tudo" mostra só o diário
export function aplicarColuna(){
  var cont=$("painels"),pref=$("colSel").value,w=cont.clientWidth/(cont.children.length||1);
  var col=pref==="tudo"&&w<300?"diario":pref;
  cont.querySelectorAll("table").forEach(function(t){t.dataset.col=col});
}

// painel estreito (4 ou 5 meses) encolhe o selo do salário pra uma bolinha
export function medirPaineis(){
  var cont=$("painels"),n=cont.children.length||1,w=cont.clientWidth/n;
  cont.classList.toggle("estreito",n>1&&w<250);
  aplicarColuna();
}

export function renderPaineis(){
  var n=mesesNaTela();
  var cont=$("painels");
  $("qtdSel").value=String(vista.meses);
  opcaoTudo();
  cont.classList.toggle("trio",n>1);
  cont.style.setProperty("--n",n);
  while(cont.children.length>n)cont.removeChild(cont.lastChild);
  while(cont.children.length<n){
    var p=document.createElement("div");
    p.className="painel";
    p.innerHTML='<div class="painel-head"><button class="painel-info" type="button">'+
      '<span class="painel-mes"></span><em class="painel-anot"></em></button>'+
      '<b class="painel-fim"></b></div>'+
      '<table class="ledger"><thead><tr><th>dia</th><th class="c-entrada" title="dinheiro que entrou">entrada</th>'+
      '<th class="c-saida" title="contas que saíram e dinheiro que você guardou — encolhem o bolo do ciclo">saída</th><th class="c-diario" title="o que você gastou no dia; em tom apagado, quanto você ainda pode gastar naquele dia">diário</th><th>saldo</th></tr></thead><tbody></tbody></table>';
    cont.appendChild(p);
  }
  for(var i=0;i<n;i++){
    var alvo=somaMes(ui.atual,i),k=key(alvo.y,alvo.m);
    var painel=cont.children[i];
    painel.dataset.mes=k;
    painel.querySelector(".painel-mes").textContent=MESES[alvo.m];
    painel.querySelector(".painel-info").dataset.checkinmes=k;
    renderLedger(painel,k,calcular(k,inicialDe(k)));
  }
  medirPaineis();
  if(!observador&&window.ResizeObserver){observador=new ResizeObserver(medirPaineis);observador.observe(cont)}
}

export function renderLedger(painel,k,r){
  var pk=parseKey(k);
  var fimEl=painel.querySelector(".painel-fim");
  fimEl.textContent=money(r.final);
  fimEl.classList.toggle("neg",r.final<0);
  var anEl=painel.querySelector(".painel-anot");
  if(anEl){
    anEl.textContent=r.total.marcados+" de "+r.dias+" anotados";
    anEl.parentElement.title=anEl.textContent;
    anEl.classList.toggle("completo",r.total.marcados>=r.dias);
  }

  var tb=painel.querySelector("tbody");
  var maxPos=0,maxNeg=0;
  r.linhas.forEach(function(l){
    if(l.saldo>maxPos)maxPos=l.saldo;
    if(l.saldo<-maxNeg)maxNeg=-l.saldo;
  });
  var neutro=(maxPos===0&&maxNeg===0);
  var pPale=hex2rgb(cssVar("--pos-pale")),pDeep=hex2rgb(cssVar("--pos-deep"));
  var nPale=hex2rgb(cssVar("--neg-pale")),nDeep=hex2rgb(cssVar("--neg-deep"));
  var tintFg=cssVar("--tint-fg"),textFg=cssVar("--text"),surf=cssVar("--surface-2");
  var refSal=valorPagamento(pk.y,pk.m);

  if(tb.children.length!==r.linhas.length)tb.innerHTML="";

  r.linhas.forEach(function(l,i){
    var tr=tb.children[i];
    if(!tr){
      tr=document.createElement("tr");
      tr.tabIndex=0;
      tr.innerHTML='<td class="c-dia"><span><button class="tick" type="button"></button>'+
                   '<i class="numdia"></i><i class="dow"></i></span></td>'+
                   '<td class="c-entrada"><span></span></td><td class="c-saida"><span></span></td>'+
                   '<td class="c-diario"><span></span></td><td class="saldo"><span></span></td>';
      tb.appendChild(tr);
    }
    tr.dataset.dia=l.dia;
    var c=tr.children;
    var tick=c[0].querySelector(".tick");
    tick.setAttribute("aria-pressed",l.conferido?"true":"false");
    tick.setAttribute("aria-label",(l.conferido?"Desmarcar":"Marcar")+" dia "+l.dia+" como anotado");
    c[0].querySelector(".numdia").textContent=l.dia;
    c[0].querySelector(".dow").textContent=DOW[l.dow];
    var selo=c[0].querySelector(".pagflag");
    if(l.pagamento){
      if(!selo){selo=document.createElement("i");selo.className="pagflag";c[0].firstChild.appendChild(selo)}
      selo.textContent=(regraPagamento(pk.y,pk.m)||{}).desc||"salário";
    }else if(selo)selo.remove();

    setCel(c[1].firstChild,l.entrada,false);
    setCel(c[2].firstChild,l.saida+l.economia,false);
    var refDia=diariaDe(pk.y,pk.m,l.dia);
    var spDia=c[3].firstChild;
    if(l.diario){
      spDia.textContent=num(l.diario);
      spDia.className=(refDia!==null&&l.diario>refDia+0.005)?"acima":"";
    }else if(refDia!==null){
      var dd=dadosDia(pk.y,pk.m,l.dia);
      spDia.textContent=num(refDia);
      spDia.className=(dd&&dd.d>0.005)?"ref abatido":(dd&&dd.s>0.005)?"ref somado":"ref";
    }else{
      spDia.textContent="–";spDia.className="zero";
    }
    c[4].firstChild.textContent=num(l.saldo);

    var bg;
    if(neutro)bg=surf;
    else if(l.saldo<0)bg=COR_NEGATIVO;
    else if(refSal>0||cicloDoDia[pk.y+"-"+pk.m+"-"+l.dia])bg=corPorPercentual(fracaoCor(l.saldo,refSal,pk.y,pk.m,l.dia));
    else bg=mix(pPale,pDeep,maxPos>0?Math.pow(l.saldo/maxPos,.85):0);
    c[4].style.backgroundColor=bg;
    var claro=bg.indexOf("rgb")===0?lum(bg)>0.58:true;
    c[4].firstChild.style.color=neutro?textFg:(claro?"#12263A":tintFg);

    tr.className=(l.dia===HOJE_DIA&&k===HOJE_KEY?"hoje ":"")+(l.conferido?"":"pendente ")+
                 (l.seca?"seca ":"")+(l.pagamento?"pagrow":"");
  });
}

export function setCel(sp,v,acima){
  sp.textContent=v?num(v):"–";
  sp.className=v?(acima?"acima":""):"zero";
}
