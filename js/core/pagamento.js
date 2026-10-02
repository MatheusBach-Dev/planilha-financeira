import {ajustarDia, ehDiaUtil, feriados, key, nEsimoDiaUtil, parseKey, ultimoDiaUtil} from "./datas.js";
import {state, ui} from "./estado.js";
import {MESES} from "./formato.js";

export function explicaPagamento(y,m,dia){
  var p=regraPagamento(y,m)||{},fers=feriados(y),fora=[];
  for(var d=1;d<dia;d++){
    if(ehDiaUtil(y,m,d))continue;
    var dw=new Date(y,m,d).getDay();
    fora.push(d+" ("+(fers[m+"-"+d]||(dw===0?"domingo":"sábado"))+")");
  }
  var regra=p.regra==="ultimoUtil"?"Último dia útil":
            p.regra==="fixo"?("Dia "+p.n+" do mês"):(p.n+"º dia útil");
  var txt=regra+" de "+MESES[m]+" de "+y+" cai no dia "+dia+".";
  if(fora.length)txt+=" Não contaram: dia "+fora.join(", dia ")+".";
  return txt;
}

export function regraPagamento(y,m){
  var k=key(y,m),lista=state.config.pagamentos||[],melhor=null;
  for(var i=0;i<lista.length;i++){
    var p=lista[i];
    if(!(+p.valor>0))continue;
    if((p.desde||"")>k)continue;
    if(!melhor||(p.desde||"")>(melhor.desde||""))melhor=p;
  }
  return melhor;
}

export function temPagamento(y,m){
  if(y===undefined){y=ui.atual.y;m=ui.atual.m}
  return !!regraPagamento(y,m);
}

export function valorPagamento(y,m){var p=regraPagamento(y,m);return p?+p.valor||0:0}

export function textoRegraPag(p){
  if(p.regra==="ultimoUtil")return "último dia útil";
  if(p.regra==="fixo")return "dia "+(+p.n||1)+(p.ajuste==="adia"?", adiando":", antecipando");
  return (+p.n||5)+"º dia útil";
}

export function mesExtenso(k){
  if(!k)return "sempre";
  var pk=parseKey(k);
  return MESES[pk.m].slice(0,3)+"/"+pk.y;
}

export function diaPagamento(y,m){
  var p=regraPagamento(y,m);
  if(!p)return 0;
  if(p.regra==="ultimoUtil")return ultimoDiaUtil(y,m);
  if(p.regra==="fixo")return ajustarDia(y,m,+p.n||1,p.ajuste||"antecipa");
  return nEsimoDiaUtil(y,m,Math.max(1,Math.min(23,+p.n||5)));
}
