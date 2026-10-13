import {diasNoMes, key, parseKey, somaMes} from "./datas.js";
import {state} from "./estado.js";

// Compras parceladas (crédito ou débito/boleto). Cada parcela vira uma "conta" do mês em calculo.contasDoMes,
// com o mesmo check-in das contas fixas. Formato:
// {id, desc, cat, forma:"credito"|"debito", onde, aVista (preço à vista, opcional), n (total de parcelas),
//  parcela (valor de cada uma), jaPagas (pagas antes de entrar no app), primeira:"aaaa-mm" (mês da parcela jaPagas+1),
//  dia (dia do mês em que cai), valores:{número da parcela: valor diferente}}

export function listaParcelamentos(){return Array.isArray(state.config.parcelamentos)?state.config.parcelamentos:[]}

export function valorDaParcela(p,i){
  var v=p.valores&&p.valores[i];
  return v!=null&&v!==""&&isFinite(+v)?+v:(+p.parcela||0);
}

function mesesEntre(a,b){var x=parseKey(a),y=parseKey(b);return (y.y-x.y)*12+(y.m-x.m)}

// mês ("aaaa-mm") em que cai a parcela i (só existe pra i > jaPagas)
export function mesDaParcela(p,i){
  var pk=somaMes(parseKey(p.primeira),i-(+p.jaPagas||0)-1);
  return key(pk.y,pk.m);
}

// parcelas que caem no mês k: [{p, i, n, valor, dia}]
export function parcelasDoMes(k){
  var out=[],pk=parseKey(k),dias=diasNoMes(pk.y,pk.m);
  listaParcelamentos().forEach(function(p){
    var n=+p.n||0,ja=+p.jaPagas||0;
    if(!p.primeira||n<1)return;
    var off=mesesEntre(p.primeira,k),i=ja+1+off;
    if(off<0||i>n)return;
    out.push({p:p,i:i,n:n,valor:valorDaParcela(p,i),dia:Math.max(1,Math.min(dias,+p.dia||1))});
  });
  return out;
}

// taxa ao mês (em %) que faz as parcelas valerem o preço à vista hoje (1ª parcela 1 mês depois da compra)
function taxaDe(aVista,valores){
  function vp(r){return valores.reduce(function(s,v,j){return s+v/Math.pow(1+r,j+1)},0)}
  var lo=0,hi=1;
  if(vp(hi)>aVista)return null;
  for(var g=0;g<100;g++){var mid=(lo+hi)/2;if(vp(mid)>aVista)lo=mid;else hi=mid}
  return (lo+hi)/2*100;
}

export function resumoParcelamento(p){
  var n=+p.n||0,ja=+p.jaPagas||0,valores=[],faltam=[];
  for(var i=1;i<=n;i++){
    var v=valorDaParcela(p,i);
    valores.push(v);
    if(i>ja)faltam.push({i:i,mes:mesDaParcela(p,i),valor:v});
  }
  var total=valores.reduce(function(s,v){return s+v},0);
  var aVista=+p.aVista>0?+p.aVista:null;
  // tolerância de 1 centavo por parcela: 3x de 33,33 num preço de 100 é "sem juros"
  var semJuros=aVista!==null&&Math.abs(total-aVista)<=0.01*n+0.005;
  var juros=aVista===null?null:(semJuros?0:total-aVista);
  var taxa=aVista===null||semJuros||total<aVista?(semJuros?0:null):taxaDe(aVista,valores);
  return {n:n,total:total,aVista:aVista,juros:juros,semJuros:semJuros,
          taxaMensal:taxa,taxaAnual:taxa==null?null:(Math.pow(1+taxa/100,12)-1)*100,
          faltam:faltam,faltamValor:faltam.reduce(function(s,x){return s+x.valor},0),
          primeiraMes:faltam.length?faltam[0].mes:null,ultimaMes:faltam.length?faltam[faltam.length-1].mes:null};
}
