import {HOJE_KEY, hoje} from "./datas.js";
import {uid} from "./formato.js";
import {sessao} from "../dados/sessao.js";

export const ui={atual:{y:hoje.getFullYear(),m:hoje.getMonth()},tab:"saldos",permitido:0,cfgSujo:false,salvoT:null};

export var LKEY="bach.saldos.v1";

export function chaveLocal(){return sessao.usuarioId?(LKEY+":"+sessao.usuarioId):LKEY}

export var padraoConfig={nome:"matheus bach",saldoInicial:0,saldoInicialMes:HOJE_KEY,renda:0,metaEconomia:20,metaReserva:10,tema:"dark",fixos:[],pagamentos:[],investimentos:[],reservaMeses:6};

export var state={config:Object.assign({},padraoConfig),meses:{}};

export function normalizarConfig(c){
  c=c||{};
  var out=Object.assign({},padraoConfig,c);
  if(!Array.isArray(out.fixos))out.fixos=[];
  out.investimentos=Array.isArray(c.investimentos)?c.investimentos.slice():[];
  var lista=Array.isArray(c.pagamentos)?c.pagamentos.slice():[];
  var v=c.pagamento;
  if(!lista.length&&v&&+v.valor>0){
    lista=[{id:uid(),desde:v.desde||HOJE_KEY,valor:+v.valor,regra:v.regra||"util",
            n:+v.n||5,ajuste:v.ajuste||"antecipa",desc:v.desc||"salário"}];
  }
  out.pagamentos=lista;
  if(out.tema==="auto"&&!c.temaEscolhido)out.tema="dark";
  if(v)out.pagamento=v;
  return out;
}

export function localLoad(){
  try{
    var raw=localStorage.getItem(chaveLocal());
    if(!raw)return;
    var d=JSON.parse(raw);
    if(d&&d.config)state.config=normalizarConfig(d.config);
    if(d&&d.meses)state.meses=d.meses;
  }catch(e){}
}

export function localSave(){
  try{localStorage.setItem(chaveLocal(),JSON.stringify(state))}catch(e){}
}

export var MES_VAZIO={lancamentos:[],conferidos:[],pulados:[],rebases:[]};

export function mesLeitura(k){return state.meses[k]?mesDoc(k):MES_VAZIO}

export function mesDoc(k){
  var d=state.meses[k];
  if(!d)d=state.meses[k]={lancamentos:[],checkin:0,pulados:[]};
  if(!d.lancamentos)d.lancamentos=[];
  if(!d.pulados)d.pulados=[];
  if(!Array.isArray(d.rebases))d.rebases=[];
  if(!Array.isArray(d.conferidos)){
    d.conferidos=[];
    if(typeof d.checkin==="number"&&d.checkin>0){
      for(var i=1;i<=d.checkin;i++)d.conferidos.push(i);
    }
  }
  delete d.checkin;
  return d;
}

export function temDados(d){return !!(d&&((d.lancamentos&&d.lancamentos.length)||(d.conferidos&&d.conferidos.length)))}
