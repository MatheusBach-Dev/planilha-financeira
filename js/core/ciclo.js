import {apertoDoCiclo, planoAperto} from "./aperto.js";
import {calcular, inicialDe} from "./calculo.js";
import {cent, chaveDia, hoje, key, parseKey, somaMes} from "./datas.js";
import {state, ui} from "./estado.js";
import {diaPagamento, temPagamento, valorPagamento} from "./pagamento.js";
import {mov} from "../ui/mes.js";

export function saldoNaData(dt){
  var k=key(dt.getFullYear(),dt.getMonth());
  var r=calcular(k,inicialDe(k));
  return r.linhas[dt.getDate()-1].saldo;
}

export function somaNoIntervalo(a,b){
  var tot={entrada:0,saida:0,diario:0,economia:0,diasCorridos:0};
  var pk=parseKey(key(a.getFullYear(),a.getMonth())),guarda=0;
  var fimK=key(b.getFullYear(),b.getMonth()),k=key(pk.y,pk.m);
  var hj=new Date(hoje.getFullYear(),hoje.getMonth(),hoje.getDate());
  while(k<=fimK&&guarda++<60){
    var r=calcular(k,inicialDe(k)),ano=pk.y,mes=pk.m;
    r.linhas.forEach(function(l){
      var dt=new Date(ano,mes,l.dia);
      if(dt<a||dt>b)return;
      tot.entrada+=l.entrada;tot.saida+=l.saida;tot.diario+=l.diario;tot.economia+=l.economia;
      if(dt<=hj)tot.diasCorridos++;
    });
    pk=somaMes(pk,1);k=key(pk.y,pk.m);
  }
  return tot;
}

export function infoCiclo(){
  if(!temPagamento())return null;
  var hj=new Date(hoje.getFullYear(),hoje.getMonth(),hoje.getDate());
  var pagMes=diaPagamento(hj.getFullYear(),hj.getMonth());
  var inicio,proxPag;
  if(hj.getDate()>=pagMes){
    inicio=new Date(hj.getFullYear(),hj.getMonth(),pagMes);
    var nx=somaMes({y:hj.getFullYear(),m:hj.getMonth()},1);
    proxPag=new Date(nx.y,nx.m,diaPagamento(nx.y,nx.m));
  }else{
    var pv=somaMes({y:hj.getFullYear(),m:hj.getMonth()},-1);
    inicio=new Date(pv.y,pv.m,diaPagamento(pv.y,pv.m));
    proxPag=new Date(hj.getFullYear(),hj.getMonth(),pagMes);
  }
  var fim=new Date(proxPag.getFullYear(),proxPag.getMonth(),proxPag.getDate());
  fim.setDate(fim.getDate()-1);
  var saldoFim=saldoNaData(fim);
  var restantes=Math.max(1,Math.round((fim-hj)/86400000)+1);
  var total=Math.round((fim-inicio)/86400000)+1;
  var mov=somaNoIntervalo(inicio,fim);
  return {inicio:inicio,fim:fim,proxPag:proxPag,saldoFim:saldoFim,restantes:restantes,
          total:total,naSeca:hj.getDate()<pagMes,mov:mov,
          ateProxPag:Math.round((proxPag-hj)/86400000)};
}

export function proxPagamentoDepois(dt){
  var pk={y:dt.getFullYear(),m:dt.getMonth()};
  var d=diaPagamento(pk.y,pk.m);
  if(d>dt.getDate())return new Date(pk.y,pk.m,d);
  var nx=somaMes(pk,1);
  return new Date(nx.y,nx.m,diaPagamento(nx.y,nx.m));
}

export function baseDoCiclo(inicio,fim){
  var antes=new Date(inicio.getFullYear(),inicio.getMonth(),inicio.getDate()-1);
  var saldoAntes=saldoNaData(antes);
  var mov=somaNoIntervalo(inicio,fim);
  var sal=valorPagamento(inicio.getFullYear(),inicio.getMonth());
  var reserva=sal*Math.max(0,Math.min(100,+state.config.metaReserva||0))/100;
  var alvo=sal*Math.max(0,Math.min(100,+state.config.metaEconomia||0))/100;
  var falta=Math.max(0,alvo-mov.economia);
  var dias=Math.round((fim-inicio)/86400000)+1;
  var bruto=saldoAntes+mov.entrada-mov.saida-mov.economia;
  var disponivel=bruto-falta-reserva;
  if(disponivel<=0)disponivel=bruto-reserva;
  if(disponivel<=0)disponivel=bruto;
  return {base:dias>0?Math.max(0,Math.floor(disponivel/dias*100)/100):0,dias:dias,disponivel:disponivel,
          reserva:reserva,investir:alvo,jaInvestido:mov.economia,faltaInvestir:falta,
          inicio:inicio,fim:fim,gasto:mov.diario};
}

export var mapaDiaria={},cicloDoDia={};

export function montarDiarias(){
  mapaDiaria={};cicloDoDia={};
  if(!temPagamento())return;
  var ini=somaMes(ui.atual,-1),fimMes=somaMes(ui.atual,3);
  var cur=new Date(ini.y,ini.m,diaPagamento(ini.y,ini.m)||1);
  var limite=new Date(fimMes.y,fimMes.m,0);
  var ciclo=null,apPlano=null,divida=0,guarda=0,cacheMes={};
  function diarioEm(dt){
    var k=key(dt.getFullYear(),dt.getMonth());
    if(!cacheMes[k])cacheMes[k]=calcular(k,inicialDe(k));
    return cacheMes[k].linhas[dt.getDate()-1].diario;
  }
  while(cur<=limite&&guarda++<800){
    if(cur.getDate()===diaPagamento(cur.getFullYear(),cur.getMonth())){
      var prox=proxPagamentoDepois(cur);
      var fim=new Date(prox.getFullYear(),prox.getMonth(),prox.getDate()-1);
      ciclo=baseDoCiclo(cur,fim);
      var ap=apertoDoCiclo(cur,fim);
      apPlano=ap?planoAperto(ciclo,ap):null;
      divida=0;
    }
    if(ciclo){
      var ch=chaveDia(cur),noAperto=false,v,dv=divida;
      if(apPlano&&cur>=apPlano.apIni){
        noAperto=cur<=apPlano.apFim;
        v=noAperto?apPlano.r:apPlano.depois;
        dv=0;
      }else{
        v=Math.max(0,cent(ciclo.base-divida));
      }
      mapaDiaria[ch]={v:v,d:dv,b:ciclo.base,aperto:noAperto,plano:apPlano};
      cicloDoDia[ch]=ciclo;
      if(!(apPlano&&cur>=apPlano.apIni))
        divida=Math.max(0,cent(divida+diarioEm(cur)-ciclo.base));
    }
    cur=new Date(cur.getFullYear(),cur.getMonth(),cur.getDate()+1);
  }
}

export function dadosDia(y,m,d){return mapaDiaria[y+"-"+m+"-"+d]||null}

export function diariaDe(y,m,d){var x=dadosDia(y,m,d);return x?x.v:null}

export function diasAteFimDoCiclo(c,y,m,dia){
  return Math.max(1,Math.round((c.fim-new Date(y,m,dia))/86400000)+1);
}
