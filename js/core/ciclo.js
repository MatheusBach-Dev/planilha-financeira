import {apertoDoCiclo, planoAperto} from "./aperto.js";
import {abertasNoIntervalo, calcular, faltaMeta, inicialDe, pctReserva, pendencias} from "./calculo.js";
import {cent, chaveDia, hoje, hojeZero, isoData, key, maisDias, parseKey, somaMes} from "./datas.js";
import {state, ui} from "./estado.js";
import {diaPagamento, ehPagamento, primeiroPagamento, temPagamento, valorPagamento} from "./pagamento.js";

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
  var hj=hojeZero();
  var inicio=inicioDoCiclo(hj),proxPag=proxPagamentoDepois(hj);
  if(!inicio||!proxPag)return null;
  var pre=!ehPagamento(inicio);
  var pagMes=diaPagamento(hj.getFullYear(),hj.getMonth());
  var fim=maisDias(proxPag,-1);
  var saldoFim=saldoNaData(fim);
  var restantes=Math.max(1,Math.round((fim-hj)/86400000)+1);
  var total=Math.round((fim-inicio)/86400000)+1;
  var mov=somaNoIntervalo(inicio,fim);
  // contas vencidas sem pagar: o saldo da tabela não desconta, mas o que sobra de verdade sim
  var pend=pendencias();
  return {inicio:inicio,fim:fim,proxPag:proxPag,saldoFim:saldoFim,restantes:restantes,
          total:total,naSeca:pre||hj.getDate()<pagMes,mov:mov,pre:pre,salario:salarioDoCiclo(inicio),
          ateProxPag:Math.round((proxPag-hj)/86400000),
          devendo:pend.total,devendoEconomia:pend.economia,atrasadas:pend.lista,sobraFim:saldoFim-pend.total};
}

// último dia de pagamento até dt (inclusive), ou null se o salário ainda não começou
export function pagamentoAte(dt){
  var pp=primeiroPagamento();
  if(pp&&dt<pp)return null;
  var pk={y:dt.getFullYear(),m:dt.getMonth()};
  for(var i=0;i<36;i++){
    var d=diaPagamento(pk.y,pk.m);
    if(d>0&&(i>0||d<=dt.getDate()))return new Date(pk.y,pk.m,d);
    pk=somaMes(pk,-1);
  }
  return null;
}

export function proxPagamentoDepois(dt){
  var pk={y:dt.getFullYear(),m:dt.getMonth()};
  for(var i=0;i<36;i++){
    var d=diaPagamento(pk.y,pk.m);
    if(d>0&&(i>0||d>dt.getDate()))return new Date(pk.y,pk.m,d);
    pk=somaMes(pk,1);
  }
  return null;
}

// antes do primeiro salário existe um pré-ciclo: do dia 1 daquele mês até a véspera do salário
export function inicioPreCiclo(){
  var p=primeiroPagamento();
  return p&&p.getDate()>1?new Date(p.getFullYear(),p.getMonth(),1):null;
}

export function inicioDoCiclo(dt){
  var p=pagamentoAte(dt);
  if(p)return p;
  var pre=inicioPreCiclo();
  return pre&&pre<=dt?pre:null;
}

export function salarioDoCiclo(inicio){
  return ehPagamento(inicio)?valorPagamento(inicio.getFullYear(),inicio.getMonth()):0;
}

export function baseDoCiclo(inicio,fim){
  var antes=new Date(inicio.getFullYear(),inicio.getMonth(),inicio.getDate()-1);
  var saldoAntes=saldoNaData(antes);
  var mov=somaNoIntervalo(inicio,fim);
  var sal=salarioDoCiclo(inicio);
  var reserva=sal*pctReserva()/100;
  var alvo=sal*Math.max(0,Math.min(100,+state.config.metaEconomia||0))/100;
  // a diária só desconta conta fixa depois do "paguei": as que ainda vão vencer neste ciclo voltam
  // pra conta e as vencidas sem pagar (que já não saem do saldo) não são tiradas.
  // Investimento programado (pago ou não) conta pra meta, pra meta não descontar o mesmo dinheiro.
  var hj=hojeZero(),pend=hj>=inicio&&hj<=fim?pendencias():{total:0,economia:0};
  var ab=abertasNoIntervalo(isoData(inicio.getFullYear(),inicio.getMonth(),inicio.getDate()),
                            isoData(fim.getFullYear(),fim.getMonth(),fim.getDate()));
  var falta=faltaMeta(sal,state.config.metaEconomia,mov.economia+pend.economia);
  var dias=Math.round((fim-inicio)/86400000)+1;
  var bruto=saldoAntes+mov.entrada-(mov.saida-ab.saida)-(mov.economia-ab.economia);
  var aPagar=ab.saida+ab.economia+pend.total;
  function porDia(b){
    var d=b-falta-reserva;
    if(d<=0)d=b-reserva;
    if(d<=0)d=b;
    return {disponivel:d,base:dias>0?Math.max(0,Math.floor(d/dias*100)/100):0};
  }
  var agora=porDia(bruto),pagando=porDia(bruto-aPagar);
  return {base:agora.base,dias:dias,disponivel:agora.disponivel,
          reserva:reserva,investir:alvo,jaInvestido:mov.economia,faltaInvestir:falta,
          inicio:inicio,fim:fim,gasto:mov.diario,salario:sal,devendo:pend.total,
          aPagar:aPagar,basePagando:pagando.base};
}

export var mapaDiaria={},cicloDoDia={};

// nMeses = quantos meses aparecem lado a lado a partir de ui.atual; o mês de hoje entra sempre
export function montarDiarias(nMeses){
  mapaDiaria={};cicloDoDia={};
  if(!(state.config.pagamentos||[]).some(function(p){return +p.valor>0}))return;
  var hj=hojeZero(),n=Math.max(1,+nMeses||3);
  var a=somaMes(ui.atual,-1),b=somaMes(ui.atual,n);
  var ini=new Date(a.y,a.m,1),limite=new Date(b.y,b.m,0);
  var hjIni=new Date(hj.getFullYear(),hj.getMonth()-1,1),hjFim=new Date(hj.getFullYear(),hj.getMonth()+2,0);
  if(hjIni<ini)ini=hjIni;
  if(hjFim>limite)limite=hjFim;
  var pre=inicioPreCiclo();
  var cur=inicioDoCiclo(ini)||ini;
  // acum: o que sobrou (+) ou passou (−) da diária nos dias anteriores do ciclo
  var ciclo=null,apPlano=null,acum=0,guarda=0,cacheMes={};
  function linhaEm(dt){
    var k=key(dt.getFullYear(),dt.getMonth());
    if(!cacheMes[k])cacheMes[k]=calcular(k,inicialDe(k));
    return cacheMes[k].linhas[dt.getDate()-1];
  }
  while(cur<=limite&&guarda++<2500){
    if(ehPagamento(cur)||(pre&&+cur===+pre)){
      var prox=proxPagamentoDepois(cur);
      if(prox){
        var fim=maisDias(prox,-1);
        ciclo=baseDoCiclo(cur,fim);
        var ap=apertoDoCiclo(cur,fim);
        apPlano=ap?planoAperto(ciclo,ap):null;
      }else{ciclo=null;apPlano=null}
      acum=0;
    }
    if(ciclo){
      var ch=chaveDia(cur),noAperto=false,v,dv=Math.max(0,-acum),sb=Math.max(0,acum);
      if(apPlano&&cur>=apPlano.apIni){
        noAperto=cur<=apPlano.apFim;
        v=noAperto?apPlano.r:apPlano.depois;
        dv=0;sb=0;
      }else{
        v=Math.max(0,cent(ciclo.base+acum));
      }
      mapaDiaria[ch]={v:v,d:dv,s:sb,b:ciclo.base,aperto:noAperto,plano:apPlano};
      cicloDoDia[ch]=ciclo;
      if(!(apPlano&&cur>=apPlano.apIni)){
        var l=linhaEm(cur),saldoDia=ciclo.base-l.diario;
        // dia que já passou e foi marcado como anotado: a sobra ou o excesso entram na conta.
        // Dia que passou sem marcar: só o excesso entra (o app não sabe se você gastou).
        // Hoje e os próximos dias: só pagam o excesso; a sobra não se espalha pelos dias que ainda vêm.
        if(cur<hj)acum=cent(acum+(l.conferido?saldoDia:Math.min(0,saldoDia)));
        else acum=Math.min(0,cent(acum+saldoDia));
      }
    }
    cur=new Date(cur.getFullYear(),cur.getMonth(),cur.getDate()+1);
  }
}

export function dadosDia(y,m,d){return mapaDiaria[y+"-"+m+"-"+d]||null}

export function diariaDe(y,m,d){var x=dadosDia(y,m,d);return x?x.v:null}

export function diasAteFimDoCiclo(c,y,m,dia){
  return Math.max(1,Math.round((c.fim-new Date(y,m,dia))/86400000)+1);
}

// ————— "mês gastando a diária" —————
// saldo de cada dia se a pessoa gastar a diária inteira em todo dia, contando a partir de ini.
// Hoje e os próximos dias: sai o que falta pra completar a diária (gastou 9 de 17,46 → sai mais 8,46).
// Dia que já passou fica com o valor real se tem gasto ou foi marcado como anotado; sem marcar e
// sem gasto, o app não sabe se você gastou, então sai a diária.
function gastoPrevistoNoDia(y,m,l,ini){
  var dt=new Date(y,m,l.dia);
  if(dt<ini)return 0;
  if(dt<hojeZero()&&(l.conferido||l.diario>0))return 0;
  var v=diariaDe(y,m,l.dia);
  return v>0?Math.max(0,cent(v-l.diario)):0;
}

// Cada mês sozinho, começando do saldo real do dia 1: o que seria gasto num mês não passa pro
// seguinte. Sem doDia1 conta de hoje em diante (mês que já passou não muda); com doDia1, desde o dia 1.
export function saldosGastandoDiaria(k,doDia1){
  var hj=hojeZero(),pk=parseKey(k),dia1=new Date(pk.y,pk.m,1),off=0;
  var ini=doDia1||dia1>hj?dia1:hj;
  return calcular(k,inicialDe(k)).linhas.map(function(l){
    off+=gastoPrevistoNoDia(pk.y,pk.m,l,ini);
    return cent(l.saldo-off);
  });
}

// saldo no dia dt gastando a diária de hoje até lá (pode atravessar meses, como o ciclo)
export function saldoGastandoDiaria(dt){
  var hj=hojeZero(),a={y:hj.getFullYear(),m:hj.getMonth()},k=key(dt.getFullYear(),dt.getMonth()),off=0,g=0;
  while(key(a.y,a.m)<=k&&g++<120){
    var ka=key(a.y,a.m),ra=calcular(ka,inicialDe(ka));
    ra.linhas.forEach(function(l){
      if(ka===k&&l.dia>dt.getDate())return;
      off+=gastoPrevistoNoDia(a.y,a.m,l,hj);
    });
    a=somaMes(a,1);
  }
  return cent(saldoNaData(dt)-off);
}
