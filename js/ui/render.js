import {planoCiclo} from "../core/aperto.js";
import {calcular, inicialDe, limparCache} from "../core/calculo.js";
import {infoCiclo, montarDiarias} from "../core/ciclo.js";
import {HOJE_KEY, fmtDia, fmtDiaSem, key, maisDias, somaMes} from "../core/datas.js";
import {state, ui} from "../core/estado.js";
import {$, MESES, esc, money} from "../core/formato.js";
import {temPagamento, valorPagamento} from "../core/pagamento.js";
import {renderPaineis} from "./ledger.js";
import {renderMes} from "./mes.js";
import {renderSet} from "./perfil.js";

export var mqLargo=window.matchMedia("(min-width:1100px)");

export function ehLargo(){return mqLargo.matches}

export function render(){
  var focoAnt=document.activeElement;
  var marcaFoco=(focoAnt&&focoAnt.dataset&&focoAnt.dataset.set)?focoAnt.dataset.set:null;
  limparCache();
  document.documentElement.classList.toggle("largo",ehLargo());
  var k=key(ui.atual.y,ui.atual.m);
  var r=calcular(k,inicialDe(k));
  var ciclo=infoCiclo();
  montarDiarias();
  var plano=planoCiclo(ciclo);
  ui.permitido=plano?(plano.base||plano.diaria):r.permitido;

  $("brandName").textContent=state.config.nome||"saldos";
  var fim=somaMes(ui.atual,2);
  $("monthTitle").innerHTML=ehLargo()
    ? MESES[ui.atual.m]+" a "+MESES[fim.m]+" <em>"+(ui.atual.y===fim.y?ui.atual.y:ui.atual.y+"–"+fim.y)+"</em>"
    : MESES[ui.atual.m]+" <em>"+ui.atual.y+"</em>";
  $("checkinDay").textContent=r.total.marcados;
  $("checkinTxt").textContent="de "+r.dias+" anotados";

  var hn=$("heroNum"),sub=[];
  if(ciclo){
    $("heroLead").textContent=ciclo.naSeca
      ? "vivendo da sobra até o salário cair"
      : "até o próximo pagamento você tem";
    hn.textContent=money(ciclo.saldoFim);
    hn.classList.toggle("neg",ciclo.saldoFim<0);
    sub.push("ciclo de "+fmtDia(ciclo.inicio)+" a "+fmtDia(ciclo.fim)+", "+ciclo.total+" dias");
    sub.push("salário cai "+fmtDiaSem(ciclo.proxPag)+(ciclo.ateProxPag>0?(" · em "+ciclo.ateProxPag+" dia"+(ciclo.ateProxPag>1?"s":"")):""));
  }else{
    $("heroLead").textContent=(k<HOJE_KEY)?"você terminou o mês com":"você termina o mês com";
    hn.textContent=money(r.final);
    hn.classList.toggle("neg",r.final<0);
    if(r.restam>0&&r.final>0)sub.push("dá pra gastar até <b>"+money(r.permitido)+"</b> por dia nos "+r.restam+" dias que faltam");
    sub.push(r.total.marcados+" de "+r.dias+" dias anotados");
  }
  $("plano").innerHTML=plano?renderPlano(plano,ciclo):"";
  var negs=r.linhas.filter(function(l){return l.saldo<0});
  if(negs.length)sub.push("<b>"+MESES[ui.atual.m]+"</b> fica negativo no dia "+negs[0].dia);
  $("heroSub").innerHTML=sub.join(" · ");

  var fr=$("firstRun"),dup=fixoDuplicado();
  if(dup){
    fr.innerHTML='<div class="note alerta">Seu salário parece estar cadastrado <b>duas vezes</b>: '+
      'a regra de recebimento lança '+money(valorPagamento(ui.atual.y,ui.atual.m))+' no dia útil, e ainda existe a conta fixa '+
      '"'+esc(dup.desc||"sem nome")+'" com o mesmo valor no dia '+dup.dia+'. '+
      '<button class="linkish" data-delfixo="'+esc(dup.id)+'" style="text-align:left;margin-top:8px">remover a conta fixa duplicada</button></div>';
  }else if(!temPagamento()){
    fr.innerHTML='<div class="note alerta">Você não tem <b>recebimento cadastrado</b> para '+MESES[ui.atual.m]+
      '. Sem ele o app não sabe o tamanho do seu ciclo e não consegue calcular a diária. '+
      '<button class="linkish" id="addPag" style="text-align:left;margin-top:8px">cadastrar recebimento agora</button></div>';
  }else if(r.vazio&&!(+state.config.saldoInicial)){
    fr.innerHTML='<div class="note">Primeira vez aqui? Vá em <b>configurações</b>, diga quanto você recebe e em que dia útil cai. Depois use o <b>+</b> pra lançar contas e o que você gastar em cada dia. O app só conta o que você anotar.</div>';
  }else fr.innerHTML="";

  renderPaineis();
  if(ui.tab==="mes")renderMes(r,ciclo,plano);
  if(ui.tab==="set")renderSet();

  if(marcaFoco&&document.activeElement!==focoAnt){
    var volta=document.querySelector('#viewSet [data-set="'+marcaFoco+'"]');
    if(volta&&volta.focus){try{volta.focus({preventScroll:true})}catch(e2){volta.focus()}}
  }
}

export function fixoDuplicado(){
  var v=valorPagamento(ui.atual.y,ui.atual.m),achado=null;
  if(!v)return null;
  (state.config.fixos||[]).forEach(function(f){
    if(f.tipo==="entrada"&&Math.abs((+f.valor||0)-v)<0.01)achado=f;
  });
  return achado;
}

export function renderPlano(p,ciclo){
  var l=[],nv=p.passou>0?"vermelho":(p.resta<=0?"vermelho":p.nivel);
  l.push('<div class="pl destaque '+nv+'"><span>ainda dá pra gastar hoje</span><b>'+money(p.resta)+'</b></div>');
  if(p.gastoHoje>0){
    l.push('<div class="motivo'+(p.passou>0?'':' neutro')+'">Você já gastou '+money(p.gastoHoje)+
      ' dos '+money(p.diaria)+' de hoje'+
      (p.passou>0?'. Passou '+money(p.passou)+', que sai da diária de amanhã.':'.')+'</div>');
  }
  if(p.motivo)l.push('<div class="motivo">'+esc(p.motivo)+'</div>');
  l.push('<div class="pl"><span>limite de hoje</span><b>'+money(p.diaria)+'</b></div>');
  if(Math.abs(p.base-p.diaria)>0.005)
    l.push('<div class="pl"><span>sua diária normal</span><b>'+money(p.base)+'</b></div>');
  l.push('<div class="pl"><span>investir neste ciclo'+(p.pctG?" ("+p.pctG+"%)":"")+'</span><b>'+
    (p.jaGuardado>=p.guardar&&p.guardar>0
      ? '<span class="feito">'+money(p.guardar)+' ✓</span>'
      : money(p.faltaGuardar)+(p.jaGuardado>0?' <span class="feito">de '+money(p.guardar)+'</span>':''))+'</b></div>');
  var okReserva=ciclo.saldoFim>=p.reserva-0.005;
  l.push('<div class="pl '+(okReserva?"ok":"vermelho")+'"><span>fechar dia '+ciclo.fim.getDate()+
    ' com pelo menos'+(p.pctR?" ("+p.pctR+"%)":"")+'</span><b>'+money(p.reserva)+'</b></div>');
  if(!okReserva)l.push('<div class="motivo">Nesse ritmo você fecha o ciclo com '+money(ciclo.saldoFim)+
    ', ou seja, '+money(p.reserva-ciclo.saldoFim)+' abaixo da sua reserva.</div>');
  l.push('<div class="pl"><span>já gastou nestes '+(ciclo.total-p.dias+1)+' dias</span><b>'+money(p.gasto)+'</b></div>');
  var ap=p.aperto,pv=p.preview;
  if(ap){
    l.push('<div class="fases">'+
      '<div class="fase'+(p.noAperto?' ativa':'')+'"><span>aperto até '+fmtDia(ap.apFim)+
        '<em>'+ap.N+' dia'+(ap.N>1?'s':'')+'</em></span><b>'+money(ap.r)+'</b></div>'+
      '<div class="fase'+(p.noAperto?'':' ativa')+'"><span>de '+fmtDia(maisDias(ap.apFim,1))+
        ' em diante<em>'+(ap.D-ap.N)+' dia'+((ap.D-ap.N)>1?'s':'')+' até o pagamento</em></span>'+
        '<b>'+money(ap.depois)+'</b></div>'+
      '</div>'+
      (ap.motivo?'<div class="motivo">'+esc(ap.motivo)+'</div>':'')+
      '<div class="motivo neutro">Os dois valores se recalculam sozinhos conforme você gasta. '+
      '<button class="linkish" id="btnDesfazerAperto" style="display:inline;margin:0;width:auto">desfazer recálculo</button></div>');
  }else if(pv){
    l.push('<button class="btn ghost w" id="btnAperto" style="margin-top:14px">'+
      'recalcular: '+pv.N+' dia'+(pv.N>1?'s':'')+' a '+money(pv.r)+', depois '+money(pv.depois)+'</button>'+
      '<div class="motivo neutro">Em vez de travar os próximos dias até quitar os '+money(p.atraso)+
      ', você aperta até '+fmtDia(pv.apFim)+' e depois volta a '+money(pv.depois)+' por dia até o pagamento.</div>');
  }
  return l.join("");
}
