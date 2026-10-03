import {DOW, MESES, pad} from "./formato.js";

export function key(y,m){return y+"-"+pad(m+1)}

export function parseKey(k){var p=k.split("-");return{y:+p[0],m:+p[1]-1}}

export function diasNoMes(y,m){return new Date(y,m+1,0).getDate()}

export function pascoa(y){
  var a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,
      f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,
      i=Math.floor(c/4),j=c%4,l=(32+2*e+2*i-h-j)%7,
      mm=Math.floor((a+11*h+22*l)/451),
      mes=Math.floor((h+l-7*mm+114)/31),dia=((h+l-7*mm+114)%31)+1;
  return new Date(y,mes-1,dia);
}

export var cacheFeriados={};

export function feriados(y){
  if(cacheFeriados[y])return cacheFeriados[y];
  var set={};
  function add(dt,nome){set[dt.getMonth()+"-"+dt.getDate()]=nome}
  [[0,1,"Confraternização"],[3,21,"Tiradentes"],[4,1,"Dia do Trabalho"],[8,7,"Independência"],
   [9,12,"N. Sra. Aparecida"],[10,2,"Finados"],[10,15,"Proclamação da República"],
   [11,25,"Natal"]].forEach(function(p){add(new Date(y,p[0],p[1]),p[2])});
  if(y>=2024)add(new Date(y,10,20),"Consciência Negra");
  var p=pascoa(y);
  function off(n){return new Date(y,p.getMonth(),p.getDate()+n)}
  add(off(-48),"Carnaval");add(off(-47),"Carnaval");
  add(off(-2),"Sexta-feira Santa");
  add(off(60),"Corpus Christi");
  cacheFeriados[y]=set;
  return set;
}

export function ehDiaUtil(y,m,d){
  var dt=new Date(y,m,d),dw=dt.getDay();
  if(dw===0||dw===6)return false;
  return !feriados(y)[m+"-"+d];
}

export function nEsimoDiaUtil(y,m,n){
  var dias=diasNoMes(y,m),c=0;
  for(var d=1;d<=dias;d++){
    if(ehDiaUtil(y,m,d)&&++c===n)return d;
  }
  return ultimoDiaUtil(y,m);
}

export function ultimoDiaUtil(y,m){
  for(var d=diasNoMes(y,m);d>=1;d--)if(ehDiaUtil(y,m,d))return d;
  return diasNoMes(y,m);
}

export function ajustarDia(y,m,d,modo){
  var dias=diasNoMes(y,m);
  d=Math.max(1,Math.min(dias,d));
  if(modo==="adia"){
    while(d<dias&&!ehDiaUtil(y,m,d))d++;
    if(!ehDiaUtil(y,m,d))return ultimoDiaUtil(y,m);
    return d;
  }
  while(d>1&&!ehDiaUtil(y,m,d))d--;
  if(!ehDiaUtil(y,m,d)){
    for(var i=1;i<=dias;i++)if(ehDiaUtil(y,m,i))return i;
  }
  return d;
}

export function fmtDia(dt){
  return dt.getDate()+" de "+MESES[dt.getMonth()].slice(0,3);
}

export function fmtDiaSem(dt){
  return DOW[dt.getDay()]+", "+dt.getDate()+" de "+MESES[dt.getMonth()].slice(0,3);
}

export var hoje=new Date();

export var HOJE_KEY=key(hoje.getFullYear(),hoje.getMonth());

export var HOJE_DIA=hoje.getDate();

export function cent(v){return Math.round(v*100)/100}

export function chaveDia(dt){return dt.getFullYear()+"-"+dt.getMonth()+"-"+dt.getDate()}

export function hojeZero(){return new Date(hoje.getFullYear(),hoje.getMonth(),hoje.getDate())}

export function maisDias(dt,n){return new Date(dt.getFullYear(),dt.getMonth(),dt.getDate()+n)}

export function difDias(a,b){return Math.round((b-a)/86400000)}

export function mesAntes(k){var p=somaMes(parseKey(k),-1);return key(p.y,p.m)}

export function somaMes(base,n){
  var m=base.m+n,y=base.y;
  while(m<0){m+=12;y--}
  while(m>11){m-=12;y++}
  return {y:y,m:m};
}
