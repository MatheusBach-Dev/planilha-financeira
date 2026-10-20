import {HOJE_DIA, HOJE_ISO, HOJE_KEY, diasNoMes, isoData, key, mesAntes, nEsimoDiaUtil, parseKey, somaMes, ultimoDiaUtil} from "./datas.js";
import {mesLeitura, state, temDados} from "./estado.js";
import {diaPagamento, mesExtenso, regraPagamento, temPagamento} from "./pagamento.js";
import {parcelasDoMes} from "./parcelas.js";

export function diaDoFixo(f,y,m){
  var r=f.regra||"fixo",dias=diasNoMes(y,m),d;
  if(r==="util")d=nEsimoDiaUtil(y,m,Math.max(1,+f.n||1));
  else if(r==="ultimoUtil")d=ultimoDiaUtil(y,m);
  else if(r==="pagamento")d=temPagamento()?diaPagamento(y,m):Math.min(dias,+f.dia||1);
  else if(r==="aposPagamento")d=temPagamento()?Math.min(dias,diaPagamento(y,m)+Math.max(0,+f.n||0)):Math.min(dias,+f.dia||1);
  else if(r==="mes")d=dias; // sem dia certo: fica prevista pro último dia do mês até ser paga
  else d=Math.max(1,Math.min(dias,+f.dia||1));
  if(f.espera&&f.tipo!=="entrada"&&temPagamento()){
    var pag=diaPagamento(y,m);
    if(d<pag)return pag;
  }
  return d;
}

export function textoRegraFixo(f){
  var r=f.regra||"fixo";
  if(r==="util")return (+f.n||1)+"º dia útil";
  if(r==="ultimoUtil")return "último dia útil";
  if(r==="pagamento")return "no dia do salário";
  if(r==="aposPagamento")return (+f.n||0)+" dia"+((+f.n||0)===1?"":"s")+" após o salário";
  if(r==="mes")return "todo mês, sem dia certo";
  return "dia "+(+f.dia||1);
}

export function fixoAtivo(f,k){return !(f.desde&&k<f.desde)&&!(f.ate&&k>f.ate)}

export function textoPeriodoFixo(f){
  if(f.desde&&f.ate)return f.desde===f.ate?"só em "+mesExtenso(f.desde):"de "+mesExtenso(f.desde)+" até "+mesExtenso(f.ate);
  if(f.ate)return "até "+mesExtenso(f.ate);
  if(f.desde)return "de "+mesExtenso(f.desde)+" em diante";
  return "todo mês";
}

export function serieDoFixo(f){return f.serie||f.id}

export function fixoAnterior(f,lista){
  if(!f.desde)return null;
  var ate=mesAntes(f.desde);
  return (lista||state.config.fixos||[]).filter(function(x){
    return x.id!==f.id&&serieDoFixo(x)===serieDoFixo(f)&&x.ate===ate;
  })[0]||null;
}

export function mesmoFixo(a,b){
  function assinatura(f){
    var r=f.regra||"fixo";
    return [+f.valor||0,f.desc||"",f.cat||"",f.tipo,r,
            r==="fixo"?(+f.dia||1):(r==="util"||r==="aposPagamento"?(+f.n||0):0),
            !!f.espera,!!f.cartao].join("|");
  }
  return assinatura(a)===assinatura(b);
}

export function historicoAte(f){
  var hj=parseKey(HOJE_KEY);
  var lim=fixoAtivo(f,HOJE_KEY)&&diaDoFixo(f,hj.y,hj.m)<HOJE_DIA?HOJE_KEY:mesAntes(HOJE_KEY);
  if(f.ate&&f.ate<lim)lim=f.ate;
  return f.desde&&f.desde>lim?null:lim;
}

export function fixoEncerrado(f){return !!f.ate&&historicoAte(f)===f.ate}

function nomeFixo(f){return String(f.desc||"").trim().toLowerCase()}

export function candidatosSubst(novo,antigo,lista){
  var de=novo.desde||"";
  if(!de)return [];
  return (lista||state.config.fixos||[]).filter(function(x){
    if(x.tipo!==novo.tipo||!fixoAtivo(x,de))return false;
    if(antigo&&serieDoFixo(x)===serieDoFixo(antigo))return false;
    return (nomeFixo(x)&&nomeFixo(x)===nomeFixo(novo))||(x.cat&&x.cat===novo.cat);
  });
}

export function substPadrao(novo,cands){
  var igual=cands.filter(function(x){return nomeFixo(x)&&nomeFixo(x)===nomeFixo(novo)})[0];
  return igual?igual.id:"";
}

export function planoFixo(antigo,novo,lista){
  if(!antigo)return {acao:"novo"};
  var de=novo.desde||"",ini=antigo.desde||"";
  if(antigo.ate&&de>antigo.ate)
    return {erro:"Essa conta vale só até "+mesExtenso(antigo.ate)+", então não dá pra mudar a partir de "+mesExtenso(de)+"."};
  if(de>ini&&!mesmoFixo(antigo,novo))return {acao:"divide"};
  var ant=fixoAnterior(antigo,lista);
  if(ant&&de<=(ant.desde||""))
    return {erro:"Antes de "+mesExtenso(antigo.desde)+" vale outro período desta conta. Pra mexer antes de "+mesExtenso(mesAntes(antigo.desde))+", edite aquele."};
  return {acao:"edita",anterior:ant};
}

// "fechar o ciclo com X%" só vale quando a pessoa liga; desligada, nada é separado da diária
export function pctReserva(){
  return state.config.usarReserva?Math.max(0,Math.min(100,+state.config.metaReserva||0)):0;
}

export function faltaMeta(sal,pct,feito){
  pct=Math.max(0,Math.min(100,+pct||0));
  var alvo=sal*pct/100;
  if(feito>=alvo-0.005)return 0;
  if(sal>0&&Math.round(feito/sal*1000)>=Math.round(pct*10))return 0;
  return alvo-feito;
}

// ————— check-in das contas fixas —————
// Saídas e investimentos fixos ficam "a pagar" até a pessoa marcar "paguei". Venceu sem marcar:
// não sai do saldo (o dinheiro ainda está na conta) e entra no "devendo". A diária só desconta
// a conta depois do "paguei". "Não vou pagar este mês" tira a conta do mês sem deixar vermelho.
// Contas que venceram antes desta data contam como pagas sozinhas.
export var CHECKIN_DESDE="2026-10-01";

export function pedeCheckin(f){return f.tipo==="saida"||f.tipo==="economia"}

function pulado(d,f){return d.pulados.indexOf(f.id)>=0||(f.serie&&d.pulados.indexOf(f.serie)>=0)}

// cada conta fixa de check-in no mês k, com status: "auto" (antes do check-in existir), "pulada"
// ("não vou pagar este mês"), "pago", "vencida" (passou do vencimento sem pagar) ou "aberta" (ainda não venceu)
export function contasDoMes(k){
  var d=mesLeitura(k),pk=parseKey(k),out=[];
  (state.config.fixos||[]).forEach(function(f){
    if(!pedeCheckin(f)||!fixoAtivo(f,k))return;
    var venc=diaDoFixo(f,pk.y,pk.m),vIso=isoData(pk.y,pk.m,venc);
    var chave=serieDoFixo(f),pg=d.pagos[chave]||null;
    var status=pulado(d,f)?"pulada":vIso<CHECKIN_DESDE?"auto":pg?"pago":vIso<HOJE_ISO?"vencida":"aberta";
    var nominal=diaDoFixo(Object.assign({},f,{espera:false}),pk.y,pk.m);
    out.push({f:f,k:k,chave:chave,id:"fix:"+f.id,desc:f.desc,cat:f.cat||"",tipo:f.tipo,valor:+f.valor||0,cartao:!!f.cartao,
              venc:venc,vencIso:vIso,adiadaDe:venc!==nominal&&f.regra!=="mes"?nominal:0,
              semDia:f.regra==="mes",status:status,pago:pg});
  });
  // parcelas de compras parceladas: mesmas regras de check-in, chave "parc:<compra>:<nº da parcela>"
  parcelasDoMes(k).forEach(function(x){
    var p=x.p,vIso=isoData(pk.y,pk.m,x.dia),chave="parc:"+p.id+":"+x.i,pg=d.pagos[chave]||null;
    var status=d.pulados.indexOf(chave)>=0?"pulada":vIso<CHECKIN_DESDE?"auto":pg?"pago":vIso<HOJE_ISO?"vencida":"aberta";
    out.push({f:{id:chave},k:k,chave:chave,id:chave,desc:(p.desc||"parcelamento")+" ("+x.i+"/"+x.n+")",cat:p.cat||"",
              tipo:"saida",valor:x.valor,cartao:p.forma==="credito",venc:x.dia,vencIso:vIso,adiadaDe:0,semDia:false,
              status:status,pago:pg,parcela:{id:p.id,i:x.i,n:x.n,forma:p.forma,onde:p.onde||""}});
  });
  return out;
}

export function vencidasDoMes(k){
  return contasDoMes(k).filter(function(c){return c.status==="vencida"});
}

// dia sugerido pra "paguei": hoje, se ainda não venceu; o vencimento, se já passou
export function dataPadraoPago(c){return c.vencIso<HOJE_ISO?c.vencIso:HOJE_ISO}

var cachePend=null;

// tudo o que venceu e não foi pago, do início do check-in até hoje
export function pendencias(){
  if(cachePend)return cachePend;
  var ini=CHECKIN_DESDE.slice(0,7),menor=menorMesConhecido();
  if(menor&&menor>ini)ini=menor;
  var lista=[],total=0,economia=0,pk=parseKey(ini),k=ini,g=0;
  while(k<=HOJE_KEY&&g++<240){
    vencidasDoMes(k).forEach(function(v){
      lista.push(v);total+=v.valor;
      if(v.tipo==="economia")economia+=v.valor;
    });
    pk=somaMes(pk,1);k=key(pk.y,pk.m);
  }
  cachePend={total:total,economia:economia,lista:lista};
  return cachePend;
}

// contas ainda não pagas que vencem entre a e b ("aaaa-mm-dd"), pra a diária não descontar antes do "paguei"
export function abertasNoIntervalo(aIso,bIso){
  var tot={saida:0,economia:0},pk=parseKey(aIso.slice(0,7)),k=aIso.slice(0,7),g=0;
  while(k<=bIso.slice(0,7)&&g++<60){
    contasDoMes(k).forEach(function(c){
      if(c.status==="aberta"&&c.vencIso>=aIso&&c.vencIso<=bIso)tot[c.tipo]+=c.valor;
    });
    pk=somaMes(pk,1);k=key(pk.y,pk.m);
  }
  return tot;
}

function itemDaConta(c,dia,valor){
  return {id:c.id,dia:dia,tipo:c.tipo,valor:valor,desc:c.desc,cat:c.cat,fixo:true,cartao:c.cartao,
          adiadaDe:c.status==="pago"?0:c.adiadaDe,checkin:c.status,chave:c.chave,mesConta:c.k,
          venc:c.venc,semDia:c.semDia,pagoEm:c.pago?c.pago.data:null,parcela:c.parcela||null};
}

export function fixosDoMes(k){
  var d=mesLeitura(k),out=[],pk=parseKey(k);
  (state.config.fixos||[]).forEach(function(f){
    if(pedeCheckin(f)||!fixoAtivo(f,k)||pulado(d,f))return;
    var dia=diaDoFixo(f,pk.y,pk.m);
    var nominal=diaDoFixo(Object.assign({},f,{espera:false}),pk.y,pk.m);
    out.push({id:"fix:"+f.id,dia:dia,tipo:f.tipo,valor:f.valor,desc:f.desc,
              fixo:true,cartao:!!f.cartao,adiadaDe:dia!==nominal?nominal:0});
  });
  contasDoMes(k).forEach(function(c){
    if(c.status==="auto"||c.status==="aberta")out.push(itemDaConta(c,c.venc,c.valor));
    else if(c.status==="pago"&&c.pago.data.slice(0,7)===k)out.push(itemDaConta(c,+c.pago.data.slice(8),+c.pago.valor||0));
  });
  // contas de até 2 meses antes que foram pagas neste mês (pagou atrasado)
  for(var i=1;i<=2;i++){
    var a=somaMes(pk,-i);
    contasDoMes(key(a.y,a.m)).forEach(function(c){
      if(c.status==="pago"&&c.pago.data.slice(0,7)===k)out.push(itemDaConta(c,+c.pago.data.slice(8),+c.pago.valor||0));
    });
  }
  return out;
}

export function pagamentoDoMes(k){
  var pk=parseKey(k),p=regraPagamento(pk.y,pk.m);
  if(!p)return [];
  if(mesLeitura(k).pulados.indexOf("pag")>=0)return [];
  return [{id:"pag",dia:diaPagamento(pk.y,pk.m),tipo:"entrada",valor:+p.valor,
           desc:p.desc||"salário",pagamento:true}];
}

export function calcular(k,inicial){
  var pk=parseKey(k),dias=diasNoMes(pk.y,pk.m),doc=mesLeitura(k);
  var lanc=doc.lancamentos.concat(fixosDoMes(k)).concat(pagamentoDoMes(k));
  var diaPag=diaPagamento(pk.y,pk.m);
  var porDia={},vencPorDia={},pulPorDia={},contas=contasDoMes(k);
  var vencidas=contas.filter(function(c){return c.status==="vencida"});
  lanc.forEach(function(l){
    var d=Math.min(dias,Math.max(1,+l.dia||1));
    (porDia[d]=porDia[d]||[]).push(l);
  });
  // vencidas sem pagar (vermelho) e puladas ("não vou pagar este mês") só aparecem no dia:
  // não entram nas somas nem no saldo
  vencidas.forEach(function(v){(vencPorDia[v.venc]=vencPorDia[v.venc]||[]).push(v)});
  contas.forEach(function(c){if(c.status==="pulada")(pulPorDia[c.venc]=pulPorDia[c.venc]||[]).push(c)});
  var saldo=inicial,linhas=[],vazio=lanc.length===0;
  var conf=doc.conferidos||[];
  var tot={entrada:0,saida:0,diario:0,economia:0,cartao:0,marcados:conf.length,diasComGasto:0};
  for(var d=1;d<=dias;d++){
    var itens=porDia[d]||[],e=0,s=0,dr=0,ec=0,ct=0;
    for(var i=0;i<itens.length;i++){
      var l=itens[i],v=+l.valor||0;
      if(l.tipo==="entrada")e+=v;
      else if(l.tipo==="saida"){s+=v;if(l.cartao)ct+=v}
      else if(l.tipo==="economia")ec+=v;
      else{dr+=v;if(l.cartao)ct+=v}
    }
    saldo=saldo+e-s-ec-dr;
    linhas.push({dia:d,dow:new Date(pk.y,pk.m,d).getDay(),entrada:e,saida:s,economia:ec,
                 diario:dr,conferido:conf.indexOf(d)>=0,saldo:saldo,itens:itens,vencidas:vencPorDia[d]||[],puladas:pulPorDia[d]||[],
                 pagamento:diaPag===d,seca:diaPag>0&&d<diaPag});
    tot.entrada+=e;tot.saida+=s;tot.economia+=ec;tot.cartao+=ct;tot.diario+=dr;
    if(dr>0)tot.diasComGasto++;
  }
  var restam=k<HOJE_KEY?0:(k===HOJE_KEY?dias-HOJE_DIA+1:dias);
  var decorridos=k<HOJE_KEY?dias:(k===HOJE_KEY?HOJE_DIA:0);
  var permitido=restam>0?saldo/restam:(inicial+tot.entrada-tot.saida-tot.economia)/dias;
  return {linhas:linhas,total:tot,final:saldo,inicial:inicial,dias:dias,vazio:vazio,diaPag:diaPag,vencidas:vencidas,
          restam:restam,decorridos:decorridos,permitido:Math.max(0,permitido)};
}

export var cacheInicial={};

export function inicialDe(k){
  if(cacheInicial[k]!==undefined)return cacheInicial[k];
  var base=+state.config.saldoInicial||0;
  var inicio=state.config.saldoInicialMes||HOJE_KEY;
  var menor=menorMesConhecido();
  if(menor&&menor<inicio)inicio=menor;
  if(k<=inicio){cacheInicial[k]=base;return base}
  var acc=base,cur=parseKey(inicio),ck=inicio,guarda=0;
  while(ck<k&&guarda++<480){
    cacheInicial[ck]=acc;
    acc=calcular(ck,acc).final;
    cur=somaMes(cur,1);
    ck=key(cur.y,cur.m);
  }
  cacheInicial[k]=acc;
  return acc;
}

export function menorMesConhecido(){
  var ks=Object.keys(state.meses).filter(function(x){return temDados(state.meses[x])});
  (state.config.fixos||[]).forEach(function(f){if(f.desde)ks.push(f.desde)});
  (state.config.pagamentos||[]).forEach(function(p){if(+p.valor>0&&p.desde)ks.push(p.desde)});
  ks.sort();
  return ks[0]||null;
}

export function limparCache(){cacheInicial={};cachePend=null}
