import {calcular, inicialDe} from "../core/calculo.js";
import {cicloDoDia, dadosDia, diariaDe, saldosGastandoDiaria} from "../core/ciclo.js";
import {COR_NEGATIVO, corPorPercentual, cssVar, fracaoCor, hex2rgb, lum, mix} from "../core/cores.js";
import {HOJE_DIA, HOJE_KEY, key, parseKey, somaMes} from "../core/datas.js";
import {ui} from "../core/estado.js";
import {$, DOW, MESES, money, num} from "../core/formato.js";
import {regraPagamento, valorPagamento} from "../core/pagamento.js";
import {ehLargo, mesesNaTela, vista} from "./render.js";

var observador=null;

// "mostrar tudo" (entrada, contas e gastos juntos, como na planilha) só existe no computador
function opcaoTudo(){
  var sel=$("colSel"),quer=ehLargo(),op=sel.querySelector('option[value="tudo"]');
  if(quer&&!op){sel.insertBefore(new Option("mostrar tudo","tudo"),sel.firstChild);sel.value="tudo"}
  else if(!quer&&op){var era=sel.value==="tudo";op.remove();if(era)sel.value="diario"}
}

// as cinco colunas precisam de uns 300px por mês; abaixo disso o "mostrar tudo" mostra só o diário
export function aplicarColuna(){
  var cont=$("painels"),pref=$("colSel").value,w=cont.clientWidth/(cont.children.length||1);
  // "mês gastando a diária" usa as mesmas colunas do "mostrar gastos"
  var col=pref==="proj"?"diario":pref==="tudo"&&w<300?"diario":pref;
  cont.querySelectorAll("table").forEach(function(t){t.dataset.col=col});
}

// painel estreito (4 ou 5 meses) encolhe o selo do salário pra uma bolinha
export function medirPaineis(){
  var cont=$("painels");
  if(!cont)return;
  var n=cont.children.length||1,w=cont.clientWidth/n;
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
      '<b class="painel-fim"></b></div><p class="painel-proj"></p>'+
      '<table class="ledger"><thead><tr><th>dia</th><th class="c-entrada" title="dinheiro que entrou">entrada</th>'+
      '<th class="c-saida" title="contas com data (aluguel, boleto, parcela) e dinheiro que você guardou — encolhem o bolo do ciclo">contas</th><th class="c-diario" title="o que você escolheu gastar no dia; em tom apagado, quanto você ainda pode gastar naquele dia">gastos</th><th>saldo</th></tr></thead><tbody></tbody></table>';
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
  // previsão: quanto o mês fecha se gastar a diária todo dia de hoje em diante (vem do mês anterior
  // quando o ciclo atravessa o mês). Mês que já passou não tem linha; sem salário não existe diária.
  var todos=saldosGastandoDiaria(k);
  var proj=k>=HOJE_KEY&&todos.length&&Math.abs(todos[todos.length-1]-r.final)>=0.005?todos:null;
  // "mês gastando a diária": a tabela mostra essa previsão dia a dia
  var tabProj=$("colSel").value==="proj"&&todos.length?todos:null;
  var modoProj=!!tabProj;
  var prEl=painel.querySelector(".painel-proj"),pf=proj?proj[proj.length-1]:0;
  prEl.hidden=!proj;
  if(proj){
    prEl.innerHTML='gastando a diária: fecha com <b>'+money(pf)+'</b>';
    prEl.classList.toggle("neg",pf<0);
    prEl.title="Se você gastar a diária todo dia (nos dias que ainda não têm gasto anotado), o mês fecha com "+money(pf)+".";
  }
  painel.querySelector("table").classList.toggle("proj",modoProj);
  var anEl=painel.querySelector(".painel-anot");
  if(anEl){
    anEl.textContent=r.total.marcados+" de "+r.dias+" anotados";
    anEl.parentElement.title=anEl.textContent;
    anEl.classList.toggle("completo",r.total.marcados>=r.dias);
  }

  var tb=painel.querySelector("tbody");
  var maxPos=0,maxNeg=0;
  function saldoDe(l,i){return modoProj?tabProj[i]:l.saldo}
  r.linhas.forEach(function(l,i){
    var s=saldoDe(l,i);
    if(s>maxPos)maxPos=s;
    if(s<-maxNeg)maxNeg=-s;
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

    // conta que venceu sem "paguei": selo vermelho no dia e o valor em vermelho na saída,
    // sem entrar no saldo (o dinheiro ainda está na conta)
    var vencs=l.vencidas||[],pend=vencs.reduce(function(s,v){return s+(+v.valor||0)},0);
    var aviso=c[0].querySelector(".vencflag");
    if(vencs.length){
      if(!aviso){aviso=document.createElement("i");aviso.className="vencflag";c[0].firstChild.appendChild(aviso)}
      aviso.textContent=vencs.length>1?vencs.length+" contas":"conta";
      aviso.title="Venceu e não foi paga: "+vencs.map(function(v){return (v.desc||"conta")+" "+money(v.valor)}).join(", ")+". Ainda não saiu do saldo.";
    }else if(aviso)aviso.remove();
    var puls=l.puladas||[],selo2=c[0].querySelector(".pulflag");
    if(puls.length){
      if(!selo2){selo2=document.createElement("i");selo2.className="pulflag";c[0].firstChild.appendChild(selo2)}
      selo2.textContent="pulada";
      selo2.title="Não vai pagar este mês: "+puls.map(function(p){return (p.desc||"conta")+" "+money(p.valor)}).join(", ")+".";
    }else if(selo2)selo2.remove();

    setCel(c[1].firstChild,l.entrada,false);
    var spSai=c[2].firstChild;
    if(!(l.saida+l.economia)&&pend){
      spSai.textContent=num(pend);spSai.className="vencido";
      spSai.title="conta vencida e não paga: ainda não saiu do saldo";
    }else{setCel(spSai,l.saida+l.economia,false);spSai.title=""}
    var refDia=diariaDe(pk.y,pk.m,l.dia);
    var spDia=c[3].firstChild;
    var prevDia=modoProj&&tabProj.previsto?tabProj.previsto[i]:null;
    spDia.title="";
    if(l.diario){
      spDia.textContent=num(l.diario);
      spDia.className=(refDia!==null&&l.diario>refDia+0.005)?"acima":"";
      if(prevDia>0.005)spDia.title="gastou "+money(l.diario)+"; a previsão tira mais "+money(prevDia)+" pra completar a diária";
    }else if(prevDia!=null&&tabProj.previsto&&(k>HOJE_KEY||(k===HOJE_KEY&&l.dia>=HOJE_DIA))){
      // previsão: a diária normal que sai do saldo neste dia
      spDia.textContent=num(prevDia);spDia.className="ref";
    }else if(refDia!==null){
      var dd=dadosDia(pk.y,pk.m,l.dia);
      spDia.textContent=num(refDia);
      spDia.className=(dd&&dd.d>0.005)?"ref abatido":(dd&&dd.s>0.005)?"ref somado":"ref";
    }else{
      spDia.textContent="–";spDia.className="zero";
    }
    var sd=saldoDe(l,i);
    c[4].firstChild.textContent=num(sd);
    c[4].title=modoProj&&Math.abs(sd-l.saldo)>0.005?"sem gastar a diária: "+money(l.saldo):"";

    var bg;
    if(neutro)bg=surf;
    else if(sd<0)bg=COR_NEGATIVO;
    else if(refSal>0||cicloDoDia[pk.y+"-"+pk.m+"-"+l.dia])bg=corPorPercentual(fracaoCor(sd,refSal,pk.y,pk.m,l.dia));
    else bg=mix(pPale,pDeep,maxPos>0?Math.pow(sd/maxPos,.85):0);
    c[4].style.backgroundColor=bg;
    var claro=bg.indexOf("rgb")===0?lum(bg)>0.58:true;
    c[4].firstChild.style.color=neutro?textFg:(claro?"#12263A":tintFg);

    tr.className=(l.dia===HOJE_DIA&&k===HOJE_KEY?"hoje ":"")+(l.conferido?"":"pendente ")+
                 (l.seca?"seca ":"")+(l.pagamento?"pagrow ":"")+(vencs.length?"vencrow":"");
  });
}

export function setCel(sp,v,acima){
  sp.textContent=v?num(v):"–";
  sp.className=v?(acima?"acima":""):"zero";
}
