import {calcular, faltaMeta, inicialDe, pctReserva} from "./calculo.js";
import {cicloDoDia, dadosDia, saldoNaData, somaNoIntervalo} from "./ciclo.js";
import {chaveDia, difDias, hoje, hojeZero, key, maisDias} from "./datas.js";
import {mesLeitura, state} from "./estado.js";
import {money} from "./formato.js";

export var APERTO_FATIA=0.20;   // durante o aperto se gasta um quinto da diária normal

export function apertoDoCiclo(ini,fim){
  var cur=new Date(ini.getFullYear(),ini.getMonth(),ini.getDate()),g=0;
  while(cur<=fim&&g++<70){
    var rbs=mesLeitura(key(cur.getFullYear(),cur.getMonth())).rebases||[];
    for(var i=0;i<rbs.length;i++){
      if(rbs[i].dia===cur.getDate()&&+rbs[i].dias>0)
        return {ini:new Date(cur.getFullYear(),cur.getMonth(),cur.getDate()),dias:+rbs[i].dias};
    }
    cur=maisDias(cur,1);
  }
  return null;
}

export function planoAperto(ciclo,ap){
  var hj=hojeZero();
  var refIni=ap.ini>hj?ap.ini:hj;
  if(refIni>ciclo.fim)return null;
  var apFim=maisDias(ap.ini,ap.dias-1);
  if(apFim>ciclo.fim)apFim=new Date(ciclo.fim);
  var D=difDias(refIni,ciclo.fim)+1;
  if(D<1)return null;
  var N=Math.max(0,Math.min(D,difDias(refIni,apFim)+1));
  var sal=ciclo.salario||0;
  var reserva=sal*pctReserva()/100;
  var falta=faltaMeta(sal,state.config.metaEconomia,somaNoIntervalo(ciclo.inicio,ciclo.fim).economia);
  var amanha=maisDias(hj,1);
  var futuros=amanha<=ciclo.fim?somaNoIntervalo(amanha,ciclo.fim).diario:0;
  var bruto=saldoNaData(ciclo.fim)+futuros;
  var M=bruto-reserva-falta,nivel="ok",motivo="";
  if(M<=0){
    M=bruto-reserva;nivel="semInvestir";
    motivo="Não sobra pra investir os "+money(falta)+" que faltam neste ciclo.";
  }
  if(M<=0){
    M=bruto;nivel="semReserva";
    motivo="Você vai encostar na reserva de "+money(reserva)+".";
  }
  if(M<=0){M=0;nivel="vermelho";motivo="Não há dinheiro até o próximo pagamento.";}
  var r=N>0?Math.floor(Math.min(APERTO_FATIA*ciclo.base,M/N)*100)/100:0;
  var depois=(D-N)>0?Math.floor(Math.max(0,(M-N*r)/(D-N))*100)/100:r;
  return {r:r,depois:depois,N:N,D:D,apIni:ap.ini,apFim:apFim,M:M,dias:ap.dias,
          nivel:nivel,motivo:motivo};
}

export function previewAperto(){
  var hj=hojeZero(),c=cicloDoDia[chaveDia(hj)];
  if(!c||!(c.base>0))return null;
  var dd=dadosDia(hj.getFullYear(),hj.getMonth(),hj.getDate());
  var excesso=dd?dd.d:0;
  if(excesso<=0.005)return null;
  var amanha=maisDias(hj,1);
  if(amanha>c.fim)return null;
  var D=difDias(amanha,c.fim)+1;
  var N=Math.ceil(excesso/Math.max(0.01,(1-APERTO_FATIA)*c.base));
  N=Math.max(1,Math.min(N,Math.max(1,Math.floor(D/2)),10));
  var p=planoAperto(c,{ini:amanha,dias:N});
  return p;
}

export function planoCiclo(ciclo){
  if(!ciclo)return null;
  var hj=new Date(hoje.getFullYear(),hoje.getMonth(),hoje.getDate());
  var dd=dadosDia(hj.getFullYear(),hj.getMonth(),hj.getDate());
  var base=dd?dd.b:0,hojeDiaria=dd?dd.v:0,atraso=dd?dd.d:0,sobra=dd&&dd.s?dd.s:0;
  var ap=dd?dd.plano:null,noAperto=!!(dd&&dd.aperto),pv=ap?null:previewAperto();
  var sal=ciclo.salario||0;
  var kh=key(hj.getFullYear(),hj.getMonth());
  var rh=calcular(kh,inicialDe(kh));
  var gastoHoje=rh.linhas[hj.getDate()-1].diario;
  var resta=Math.max(0,hojeDiaria-gastoHoje);
  var passou=Math.max(0,gastoHoje-hojeDiaria);
  var pctG=Math.max(0,Math.min(100,+state.config.metaEconomia||0));
  var pctR=pctReserva();
  var guardar=sal*pctG/100,reserva=sal*pctR/100;
  var jaGuardado=ciclo.mov.economia;
  var faltaGuardar=faltaMeta(sal,pctG,jaGuardado);

  // motivo = aviso de problema (a tela pinta de vermelho); dica = explicação neutra
  var nivel="ok",motivo="",dica="";
  if(atraso>0){
    var dias=base>0?Math.ceil(atraso/base):0;
    nivel="abatendo";
    motivo="Você já gastou "+money(atraso)+" além do seu ritmo, então o limite de hoje é "+
      money(hojeDiaria)+" em vez de "+money(base)+
      (dias>1?". Segurando assim, em "+dias+" dias ele volta ao normal.":". Amanhã ele já volta ao normal.");
  }else if(sobra>0.005){
    dica="Você gastou menos do que podia nos dias anteriores, então hoje dá até "+money(hojeDiaria)+": "+
      money(base)+" da diária mais "+money(sobra)+" que sobraram.";
  }
  if(base<=0){
    nivel="vermelho";
    motivo="Não sobra nada pra gastar até o próximo pagamento.";
  }
  return {salario:sal,guardar:guardar,reserva:reserva,jaGuardado:jaGuardado,pre:!!ciclo.pre,
          faltaGuardar:faltaGuardar,metaBatida:guardar>0&&faltaGuardar<=0,dias:ciclo.restantes,gasto:ciclo.mov.diario,
          diaria:hojeDiaria,base:base,atraso:atraso,sobraAcumulada:sobra,nivel:nivel,motivo:motivo,dica:dica,pctG:pctG,pctR:pctR,
          reservaAtiva:!!state.config.usarReserva,
          gastoHoje:gastoHoje,resta:resta,passou:passou,aperto:ap,noAperto:noAperto,preview:pv};
}
