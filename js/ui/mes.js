import {fmtDia, fmtDiaSem} from "../core/datas.js";
import {state, ui} from "../core/estado.js";
import {$, MESES, esc, money, num} from "../core/formato.js";
import {regraPagamento, textoRegraPag, valorPagamento} from "../core/pagamento.js";

export function porCategoria(r){
  var m={},total=0;
  r.linhas.forEach(function(l){
    l.itens.forEach(function(it){
      if(it.tipo==="entrada")return;
      var c=it.cat||"Sem categoria",v=+it.valor||0;
      if(!m[c])m[c]={valor:0,tipos:{}};
      m[c].valor+=v;m[c].tipos[it.tipo]=1;total+=v;
    });
  });
  var lista=Object.keys(m).map(function(k){return {cat:k,valor:m[k].valor,tipos:m[k].tipos}});
  lista.sort(function(a,b){return b.valor-a.valor});
  return {lista:lista,total:total};
}

export function renderCategorias(r){
  var pc=porCategoria(r);
  if(!pc.total)return "";
  var cor=function(t){return t.diario?"var(--sea)":t.economia?"var(--text-dim)":"var(--neg-deep)"};
  return '<h2 style="margin-top:28px">pra onde foi</h2>'+
    pc.lista.map(function(x){
      var pct=x.valor/pc.total*100;
      return '<div class="cat"><div class="cat-top"><span>'+esc(x.cat)+'</span>'+
        '<b>'+money(x.valor)+' <i>'+num(pct)+'%</i></b></div>'+
        '<div class="bar"><i style="width:'+pct.toFixed(1)+'%;background:'+cor(x.tipos)+'"></i></div></div>';
    }).join("")+
    '<p class="hint" style="margin-top:12px">Soma saídas, diários e investimento do mês. Entradas ficam de fora.</p>';
}

export function renderMes(r,ciclo,plano){
  var c=state.config,v=$("viewMes");
  var renda=valorPagamento(ui.atual.y,ui.atual.m)||+c.renda||r.total.entrada;
  var sobrou=r.total.entrada-r.total.saida-r.total.diario-r.total.economia;
  var custo=r.total.saida+r.total.diario;
  var alvo=+c.metaEconomia||20;
  var pctEcon=renda>0?(r.total.economia/renda*100):0;
  var pctCusto=renda>0?(custo/renda*100):0;
  var base=r.decorridos||r.total.diasComGasto;
  var medio=base>0?(r.total.diario/base):0;

  v.innerHTML=
    (ciclo&&plano?(
      '<h2>ciclo atual</h2>'+
      metric("Sobra até o próximo salário",fmtDia(ciclo.inicio)+" a "+fmtDia(ciclo.fim)+" · "+ciclo.total+" dias",
             money(ciclo.saldoFim),ciclo.saldoFim>=0?"good":"bad",
             ciclo.naSeca?"vivendo da sobra do ciclo anterior":"")+
      metric("Sua diária",plano.dias+" dias até "+fmtDia(ciclo.fim),
             money(plano.diaria),plano.nivel==="ok"?"good":(plano.nivel==="semGuardar"?"dim":"bad"),
             plano.motivo||"recalcula a cada lançamento")+
      metric("Investir no ciclo",plano.pctG+"% de "+money(plano.salario),
             money(plano.guardar),plano.jaGuardado>=plano.guardar?"good":"dim",
             plano.jaGuardado>0?(money(plano.jaGuardado)+" já investidos"):"nada investido ainda",
             plano.guardar>0?Math.min(100,plano.jaGuardado/plano.guardar*100):0,plano.jaGuardado<plano.guardar)+
      metric("Fechar o ciclo com",plano.pctR+"% de "+money(plano.salario)+" de reserva",
             money(plano.reserva),ciclo.saldoFim>=plano.reserva?"good":"bad",
             ciclo.saldoFim>=plano.reserva?"projeção está acima disso":"projeção está abaixo disso")+
      metric("Próximo pagamento",fmtDiaSem(ciclo.proxPag),
             ciclo.ateProxPag>0?("em "+ciclo.ateProxPag+"d"):"hoje","dim",
             textoRegraPag(regraPagamento(ciclo.inicio.getFullYear(),ciclo.inicio.getMonth())||{}))+
      '<h2 style="margin-top:28px">'+MESES[ui.atual.m]+'</h2>'
    ):'<h2>como o mês está indo</h2>')+
    metric("Sobra do mês",sobrou>=0?"sobrou dinheiro":"faltou dinheiro",money(sobrou),sobrou>=0?"good":"bad",
           "entradas menos saídas, diários e investimento")+
    metric("Diário médio",base?("média dos "+base+" dias já corridos"):"nenhum dia corrido ainda",
           money(medio),medio<=ui.permitido?"good":"bad",
           medio>ui.permitido?"acima do que dá pra gastar":"dentro do que dá pra gastar")+
    metric("Investido no mês",pctEcon>=alvo?"dentro da sua meta":"abaixo da meta de "+alvo+"%",
           money(r.total.economia),pctEcon>=alvo?"good":"dim",
           renda>0?num(pctEcon)+"% do salário":"",Math.min(100,pctEcon),pctEcon<alvo)+
    metric("Custo de vida",pctCusto<=100?"dentro da renda":"acima da renda",money(custo),pctCusto<=100?"":"bad",
           renda>0?num(pctCusto)+"% do salário":"",renda>0?Math.min(100,pctCusto):0,pctCusto>100)+
    '<h2 style="margin-top:28px">movimentações</h2>'+
    mov("Entradas","var(--pos-deep)",r.total.entrada)+
    mov("Saídas","var(--neg-deep)",r.total.saida)+
    mov("Diários","var(--sea)",r.total.diario)+
    mov("Investido","var(--text-dim)",r.total.economia)+
    mov("No cartão","var(--text-dim)",r.total.cartao)+
    renderCategorias(r)+
    '<div class="note" style="margin-left:0;margin-right:0">Você começou o mês com <b>'+money(r.inicial)+
    '</b>, que é o fechamento do mês anterior'+
    (r.diaPag>1?(' — e é com essa sobra que você vive do dia 1 ao '+(r.diaPag-1)):'')+
    '. O app soma apenas o que você anota: dia sem lançamento não desconta nada.</div>';
}

export function metric(k,sub,val,cls,vsub,barPct,barBad){
  return '<div class="metric"><div class="k">'+esc(k)+'<small>'+esc(sub)+'</small>'+
    (barPct!=null?'<div class="bar"><i class="'+(barBad?"bad":"")+'" style="width:'+barPct+'%"></i></div>':"")+
    '</div><div class="v '+(cls||"")+'">'+esc(val)+(vsub?'<small class="dim">'+esc(vsub)+'</small>':"")+'</div></div>';
}

export function mov(k,cor,v){
  return '<div class="mov"><span><i class="dot" style="background:'+cor+'"></i>'+esc(k)+'</span><b>'+money(v)+'</b></div>';
}
