import {calcular, faltaMeta, inicialDe, menorMesConhecido} from "./calculo.js";
import {infoCiclo, proxPagamentoDepois, somaNoIntervalo} from "./ciclo.js";
import {fracaoCor} from "./cores.js";
import {HOJE_KEY, fmtDia, hojeZero, key, maisDias, parseKey, somaMes} from "./datas.js";
import {state} from "./estado.js";
import {money, pad} from "./formato.js";
import {valorPagamento} from "./pagamento.js";

// Só leitura e conta. Quem muda e salva é js/dados/investimentos.js.

export var TIPOS_INVEST=[
  {id:"reserva",nome:"Reserva de emergência",dica:"dinheiro que você saca no mesmo dia: caixinha, CDB com liquidez diária, Tesouro Selic"},
  {id:"rendafixa",nome:"Renda fixa",dica:"Tesouro Direto, CDB, LCI e LCA com prazo"},
  {id:"etf",nome:"ETF",dica:"fundo que copia um índice da bolsa"},
  {id:"acoes",nome:"Ações",dica:"pedaços de empresas negociados na bolsa"},
  {id:"cripto",nome:"Cripto",dica:"bitcoin e outras moedas digitais"},
  {id:"outro",nome:"Outro",dica:"previdência, imóvel, o que não se encaixar acima"}
];

var VARIAVEL=["etf","acoes","cripto"];

export function isoDia(dt){return dt.getFullYear()+"-"+pad(dt.getMonth()+1)+"-"+pad(dt.getDate())}

function deIso(s){var p=String(s||"").split("-");return new Date(+p[0],+p[1]-1,+p[2]||1)}

function pctMeta(campo){return Math.max(0,Math.min(100,+state.config[campo]||0))}

export function reservaMeses(){return Math.max(1,Math.min(24,Math.round(+state.config.reservaMeses||6)))}

export function listaInvestimentos(){return Array.isArray(state.config.investimentos)?state.config.investimentos:[]}

export function totaisInvestidos(){
  var porTipo={},total=0,hj=hojeZero();
  TIPOS_INVEST.forEach(function(t){porTipo[t.id]=0});
  var desatualizados=[];
  listaInvestimentos().forEach(function(inv){
    var v=+inv.valor||0,t=porTipo[inv.tipo]!==undefined?inv.tipo:"outro";
    porTipo[t]+=v;total+=v;
    if(!inv.atualizadoEm||(hj-deIso(inv.atualizadoEm))/86400000>30)desatualizados.push(inv);
  });
  var variavel=VARIAVEL.reduce(function(s,t){return s+porTipo[t]},0);
  return {total:total,porTipo:porTipo,reserva:porTipo.reserva,rendafixa:porTipo.rendafixa,variavel:variavel,
          desatualizados:desatualizados};
}

// quanto foi lançado como investimento no app depois do dia dado, até hoje
export function aportesDesde(dataIso){
  var de=maisDias(deIso(dataIso),1),hj=hojeZero();
  if(de>hj)return 0;
  return somaNoIntervalo(de,hj).economia;
}

// salário que vale pro ciclo de agora; antes do 1º salário, o do próximo pagamento
function salarioRef(){
  var c=infoCiclo();
  if(c&&c.salario)return c.salario;
  var p=proxPagamentoDepois(hojeZero());
  return p?valorPagamento(p.getFullYear(),p.getMonth()):0;
}

export function aporteSugerido(){
  return Math.round(salarioRef()*pctMeta("metaEconomia"))/100;
}

// custo de viver um mês: contas (saídas) + dia a dia.
// O dia a dia vem dos dias anotados nos últimos 90 dias; com menos de 7 dias anotados,
// estima como o que sobra do salário depois das contas e da meta de investir.
export function custoMensal(){
  var inicio=state.config.saldoInicialMes||HOJE_KEY,menor=menorMesConhecido();
  if(menor&&menor<inicio)inicio=menor;
  var pk=parseKey(HOJE_KEY),ks=[HOJE_KEY];
  for(var i=1;i<=2;i++){var a=somaMes(pk,-i),k=key(a.y,a.m);if(k<inicio)break;ks.push(k)}
  var meses={};
  ks.forEach(function(k){meses[k]=calcular(k,inicialDe(k))});
  var saidas=ks.reduce(function(s,k){return s+meses[k].total.saida},0)/ks.length;

  var hj=hojeZero(),limite=maisDias(hj,-90),soma=0,dias=0;
  for(var dt=maisDias(hj,-1);dt>=limite;dt=maisDias(dt,-1)){
    var k=key(dt.getFullYear(),dt.getMonth());
    if(k<inicio)break;
    if(!meses[k])meses[k]=calcular(k,inicialDe(k));
    var l=meses[k].linhas[dt.getDate()-1];
    if(l.conferido||l.diario>0){soma+=l.diario;dias++}
  }
  var diaADia,fonte;
  if(dias>=7){diaADia=soma/dias*30;fonte="anotado"}
  else{
    var sal=salarioRef();
    diaADia=Math.max(0,sal-saidas-sal*pctMeta("metaEconomia")/100);
    fonte=sal>0?"salario":"sem";
  }
  return {valor:saidas+diaADia,saidas:saidas,diaADia:diaADia,fonteDiario:fonte,diasAnotados:dias};
}

// nivel = a cor de hoje na tabela; emDia = o critério estável que libera etapas da trilha
export function saudePlanilha(){
  var c=infoCiclo();
  if(!c)return {nivel:"sem-dados",fracao:null,emDia:false,saldoFim:null,reserva:0,faltaInvestir:0,negativoEm:null,
                motivos:["Cadastre seu salário em perfil pra o app acompanhar o seu ciclo."]};
  var hj=hojeZero(),sal=c.salario;
  var reserva=sal*pctMeta("metaReserva")/100;
  var falta=faltaMeta(sal,state.config.metaEconomia,c.mov.economia);
  var negativoEm=null,saldoHoje=0,pk={y:hj.getFullYear(),m:hj.getMonth()};
  for(var g=0;g<3&&!negativoEm;g++){
    var k=key(pk.y,pk.m),r=calcular(k,inicialDe(k));
    for(var i=0;i<r.linhas.length;i++){
      var dt=new Date(pk.y,pk.m,i+1);
      if(dt<hj)continue;
      if(dt>c.fim)break;
      if(+dt===+hj)saldoHoje=r.linhas[i].saldo;
      if(r.linhas[i].saldo<0){negativoEm=dt;break}
    }
    if(new Date(pk.y,pk.m+1,1)>c.fim)break;
    pk=somaMes(pk,1);
  }
  var fr=saldoHoje<0?0:fracaoCor(saldoHoje,valorPagamento(hj.getFullYear(),hj.getMonth()),hj.getFullYear(),hj.getMonth(),hj.getDate());
  var nivel=saldoHoje<0?"vermelho":fr>=0.78?"verde":fr>=0.58?"amarelo":fr>=0.38?"laranja":"vermelho";
  var motivos=[];
  if(negativoEm)motivos.push("O saldo fica negativo em "+fmtDia(negativoEm)+".");
  else if(c.saldoFim<reserva-0.005)
    motivos.push("Você fecha o ciclo com "+money(c.saldoFim)+", abaixo da reserva mínima de "+money(reserva)+".");
  if(falta>0.005)motivos.push("Falta investir "+money(falta)+" pra bater a meta deste ciclo.");
  return {nivel:nivel,fracao:fr,emDia:!motivos.length,motivos:motivos,saldoFim:c.saldoFim,reserva:reserva,
          faltaInvestir:falta,negativoEm:negativoEm};
}

// Etapa 1 reserva → 2 renda fixa → 3 renda variável. Entrar numa etapa nova pede a anterior feita
// e a planilha em dia; quem já tem dinheiro na etapa não perde ela se a planilha piorar.
export function trilha(){
  var s=saudePlanilha(),t=totaisInvestidos(),cm=custoMensal(),meses=reservaMeses();
  var meta=cm.valor*meses;
  var e1={n:1,id:"reserva",titulo:"Reserva de emergência",tem:t.reserva,meta:meta,
          falta:Math.max(0,meta-t.reserva),pct:meta>0?Math.min(100,t.reserva/meta*100):0,
          feita:meta>0&&t.reserva>=meta-0.005,liberada:true,bloqueio:null};
  var e2={n:2,id:"rendafixa",titulo:"Renda fixa",tem:t.rendafixa,meta:null,falta:null,pct:null,
          feita:t.rendafixa>0};
  e2.liberada=e1.feita&&(s.emDia||e2.feita);
  e2.bloqueio=e2.liberada?null:(!e1.feita
    ?(meta>0?"Primeiro complete a reserva de emergência: faltam "+money(e1.falta)+"."
            :"Primeiro o app precisa saber o seu custo por mês: cadastre o salário e lance suas contas.")
    :"Deixe a planilha em dia: "+s.motivos.join(" "));
  var e3={n:3,id:"variavel",titulo:"Renda variável (ETFs)",tem:t.variavel,meta:null,falta:null,pct:null,
          feita:t.variavel>0};
  e3.liberada=e2.feita&&e2.liberada&&(s.emDia||e3.feita);
  e3.bloqueio=e3.liberada?null:(!e2.liberada?"Primeiro libere a renda fixa."
    :!e2.feita?"Comece pela renda fixa: anote aqui o seu primeiro investimento nela."
    :"Deixe a planilha em dia: "+s.motivos.join(" "));
  var etapas=[e1,e2,e3],atual=null;
  for(var i=0;i<etapas.length;i++)if(!etapas[i].feita){atual=etapas[i].n;break}
  etapas.forEach(function(e){e.atual=e.n===atual});
  return {etapas:etapas,atual:atual,completa:atual===null,saude:s,custo:cm,reservaMeses:meses};
}

// ————— nível de investidor —————

// quanto guardar por mês, pela renda: quem ganha pouco tem pouca folga; quem ganha muito consegue guardar mais da metade
export var FAIXAS_GUARDAR=[
  {ate:1500,pct:10},{ate:3000,pct:15},{ate:6000,pct:20},{ate:12000,pct:25},
  {ate:25000,pct:35},{ate:50000,pct:45},{ate:null,pct:60}
];

function faixaDaRenda(renda){
  for(var i=0;i<FAIXAS_GUARDAR.length;i++){
    var f=FAIXAS_GUARDAR[i];
    if(f.ate===null||renda<=f.ate)return {f:f,anterior:i>0?FAIXAS_GUARDAR[i-1]:null};
  }
}

// o ciclo que o salário paga: o atual, ou o primeiro se o salário ainda não caiu
function cicloDoSalario(){
  var c=infoCiclo();
  if(c&&c.salario)return {inicio:c.inicio,fim:c.fim,economia:c.mov.economia};
  var p=proxPagamentoDepois(hojeZero());
  if(!p)return null;
  var q=proxPagamentoDepois(p),fim=q?maisDias(q,-1):maisDias(p,29);
  return {inicio:p,fim:fim,economia:somaNoIntervalo(p,fim).economia};
}

// Os 4 níveis andam junto com o sugerido pra renda da pessoa:
// iniciante < metade do sugerido ≤ equilibrado < sugerido ≤ avançado < sugerido + ¼ do que falta pra 100% ≤ acelerado
export function nivelInvestidor(){
  var renda=salarioRef();
  if(!(renda>0))return null;
  var cs=cicloDoSalario(),guarda=cs?cs.economia:0,fonte="ciclo";
  if(!(guarda>0)){guarda=renda*pctMeta("metaEconomia")/100;fonte="meta"}
  var pct=guarda/renda*100;
  var fx=faixaDaRenda(renda),s=fx.f.pct;
  var corte1=s/2,corte2=s,corte3=s+(100-s)/4;
  var niveis=[
    {id:"iniciante",nome:"Iniciante",de:0,ate:corte1,
     texto:"Guardar todo mês, mesmo pouco, cria o hábito. Primeiro chegue a "+String(corte1).replace(".",",")+"% da renda, depois a "+s+"%."},
    {id:"equilibrado",nome:"Equilibrado",de:corte1,ate:corte2,
     texto:"Você já guarda com constância. O próximo passo é chegar a "+s+"% da renda."},
    {id:"avancado",nome:"Avançado",de:corte2,ate:corte3,
     texto:"Você guarda o indicado pra sua renda ou mais. Agora é fazer esse dinheiro render."},
    {id:"acelerado",nome:"Acelerado",de:corte3,ate:null,
     texto:"Você guarda bem acima do comum pra sua renda e chega mais rápido nos seus objetivos."}
  ];
  var nivel="iniciante";
  // arredonda pra 1 casa, igual à meta de investir (26,67% conta como 26,7%)
  var pr=Math.round(pct*10)/10;
  for(var i=niveis.length-1;i>=0;i--)if(pr>=niveis[i].de){nivel=niveis[i].id;break}
  var faixa=fx.f.ate===null
    ?"quem ganha mais de "+money(fx.anterior.ate)
    :(fx.anterior?"quem ganha de "+money(fx.anterior.ate)+" a "+money(fx.f.ate):"quem ganha até "+money(fx.f.ate));
  return {renda:renda,guarda:guarda,pct:pct,fonte:fonte,
          sugerido:{pct:s,valor:renda*s/100,faixa:faixa,fecharPct:renda<=1500?5:10},
          nivel:nivel,niveis:niveis,faixas:FAIXAS_GUARDAR.slice()};
}

// ————— simulador —————

export function taxaAnualDoCDI(pctCDI,cdiAnual){
  var dia=Math.pow(1+cdiAnual/100,1/252)-1;
  return (Math.pow(1+dia*pctCDI/100,252)-1)*100;
}

// tabela regressiva do IR na renda fixa
export function aliquotaIR(dias){return dias<=180?22.5:dias<=360?20:dias<=720?17.5:15}

// aportes no começo de cada mês (o primeiro já no mês 1); valorInicial entra junto com ele
export function simular(o,taxas){
  o=o||{};
  var meses=Math.max(1,Math.min(600,Math.round(+o.meses||12)));
  var aporte=Math.max(0,+o.aporteMensal||0),ini=Math.max(0,+o.valorInicial||0);
  var temTaxa=o.taxaAnual!=null&&o.taxaAnual!==""&&isFinite(+o.taxaAnual);
  var anual=temTaxa?+o.taxaAnual
    :(taxas&&taxas.cdi?taxaAnualDoCDI(o.pctCDI==null||o.pctCDI===""?100:+o.pctCDI,taxas.cdi.valor):null);
  if(anual==null||!isFinite(anual))return null;
  var m=Math.pow(1+anual/100,1/12)-1;
  var pm=taxas&&taxas.poupancaMes?taxas.poupancaMes.valor/100:null;
  var isento=!!o.isento;

  // valor e IR no mês i: cada aporte j (feito no começo do mês j) rendeu por i-j meses
  function em(i,taxa,comIR){
    var bruto=0,ir=0,aportado=0;
    for(var j=0;j<i;j++){
      var a=aporte+(j===0?ini:0);
      if(!a)continue;
      var f=Math.pow(1+taxa,i-j),rend=a*(f-1);
      bruto+=a*f;aportado+=a;
      if(comIR)ir+=rend*aliquotaIR((i-j)*30)/100;
    }
    return {bruto:bruto,ir:ir,aportado:aportado};
  }
  var serie=[];
  for(var i=1;i<=meses;i++){
    var x=em(i,m,!isento);
    serie.push({mes:i,aportado:x.aportado,liquido:x.bruto-x.ir,poupanca:pm!=null?em(i,pm,false).bruto:null});
  }
  var fim=em(meses,m,!isento),poup=pm!=null?em(meses,pm,false).bruto:null;
  var ipca=taxas&&taxas.ipca12m?taxas.ipca12m.valor:null;
  return {meses:meses,aportado:fim.aportado,bruto:fim.bruto,rendimento:fim.bruto-fim.aportado,ir:fim.ir,
          liquido:fim.bruto-fim.ir,taxaAnual:anual,taxaMensal:m*100,
          taxaRealAnual:ipca!=null?((1+anual/100)/(1+ipca/100)-1)*100:null,
          poupanca:poup,ganhoSobrePoupanca:poup!=null?fim.bruto-fim.ir-poup:null,serie:serie};
}
