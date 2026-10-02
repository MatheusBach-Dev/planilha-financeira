import {cicloDoDia, diasAteFimDoCiclo} from "./ciclo.js";

export function cssVar(n){return getComputedStyle(document.documentElement).getPropertyValue(n).trim()}

export function hex2rgb(h){
  h=(h||"#000000").replace("#","");
  if(h.length===3)h=h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
  return [parseInt(h.slice(0,2),16)||0,parseInt(h.slice(2,4),16)||0,parseInt(h.slice(4,6),16)||0];
}

export function mix(a,b,t){
  t=Math.max(0,Math.min(1,t||0));
  return "rgb("+Math.round(a[0]+(b[0]-a[0])*t)+","+Math.round(a[1]+(b[1]-a[1])*t)+","+Math.round(a[2]+(b[2]-a[2])*t)+")";
}

export var ESCALA=[
  [0.00,[107,112,118]], // cinza
  [0.12,[152,98,95]],   // vermelho acinzentado
  [0.22,[190,113,105]], // vermelho suave
  [0.38,[199,148,102]], // laranja suave
  [0.58,[195,178,101]], // amarelo suave
  [0.80,[127,164,104]], // verde claro
  [1.00,[79,138,102]]   // verde
];

export var COR_NEGATIVO="rgb(74,78,84)";

export function corPorPercentual(f){
  if(!isFinite(f))f=0;
  if(f<=0)return "rgb(107,112,118)";
  if(f>=1)return "rgb(79,138,102)";
  for(var i=1;i<ESCALA.length;i++){
    if(f<=ESCALA[i][0]){
      var a=ESCALA[i-1],b=ESCALA[i];
      return mix(a[1],b[1],(f-a[0])/(b[0]-a[0]));
    }
  }
  return "rgb(79,138,102)";
}

export function fracaoCor(saldo,sal,y,m,dia){
  if(saldo<=0)return 0;
  var fa=sal>0?Math.min(1,saldo/sal):null;
  var fc=null,c=cicloDoDia[y+"-"+m+"-"+dia];
  if(c&&c.base>0)fc=Math.min(1,(saldo/c.base)/diasAteFimDoCiclo(c,y,m,dia));
  if(fa===null&&fc===null)return 0;
  if(fa===null)return fc;
  if(fc===null)return fa;
  return (fa+fc)/2;
}

export function lum(s){var m=s.match(/\d+/g);return (0.299*m[0]+0.587*m[1]+0.114*m[2])/255}
