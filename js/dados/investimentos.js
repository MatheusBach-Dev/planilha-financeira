import {hojeZero} from "../core/datas.js";
import {state} from "../core/estado.js";
import {uid} from "../core/formato.js";
import {TIPOS_INVEST, isoDia, listaInvestimentos} from "../core/investimentos.js";
import {salvarConfig} from "./persistencia.js";
import {sessao} from "./sessao.js";

// Mudam os investimentos anotados à mão e salvam. Devolvem {ok, msg}; quem chama redesenha (render) e mostra a msg.

var SO_LEITURA={ok:false,msg:"Você tem acesso só de leitura aqui."};

function tipoValido(t){
  return TIPOS_INVEST.some(function(x){return x.id===t})?t:"outro";
}

function nomeDoTipo(t){
  return TIPOS_INVEST.filter(function(x){return x.id===t})[0].nome;
}

// guarda o valor de hoje no histórico (um registro por dia, até 60)
function registrar(inv,valor){
  var d=isoDia(hojeZero());
  inv.historico=(inv.historico||[]).filter(function(h){return h.data!==d}).concat([{data:d,valor:valor}]).slice(-60);
  inv.valor=valor;
  inv.atualizadoEm=d;
}

function lerValor(v){
  if(typeof v==="string")v=v.replace(/\./g,"").replace(",",".");
  v=+v;
  return isFinite(v)&&v>=0?Math.round(v*100)/100:null;
}

export function salvarInvestimento(dados){
  if(sessao.readOnly)return SO_LEITURA;
  dados=dados||{};
  var valor=lerValor(dados.valor);
  if(valor===null)return {ok:false,msg:"Coloque um valor."};
  var tipo=tipoValido(dados.tipo);
  var nome=String(dados.nome||"").trim()||nomeDoTipo(tipo);
  var onde=String(dados.onde||"").trim();
  var lista=listaInvestimentos();
  if(dados.id){
    var achou=false;
    lista=lista.map(function(x){
      if(x.id!==dados.id)return x;
      achou=true;
      var inv=Object.assign({},x,{nome:nome,onde:onde,tipo:tipo});
      if(Math.abs(valor-(+x.valor||0))>=0.005||!x.atualizadoEm)registrar(inv,valor);
      return inv;
    });
    if(!achou)return {ok:false,msg:"Esse investimento não existe mais."};
    state.config.investimentos=lista;
    salvarConfig();
    return {ok:true,msg:"Investimento atualizado."};
  }
  var novo={id:uid(),nome:nome,onde:onde,tipo:tipo,valor:0,historico:[]};
  registrar(novo,valor);
  state.config.investimentos=lista.concat([novo]);
  salvarConfig();
  return {ok:true,msg:nome+" anotado."};
}

// mesmo valor também conta: marca que a pessoa conferiu hoje
export function atualizarValorInvestimento(id,valor){
  if(sessao.readOnly)return SO_LEITURA;
  var v=lerValor(valor);
  if(v===null)return {ok:false,msg:"Coloque um valor."};
  var achou=false;
  state.config.investimentos=listaInvestimentos().map(function(x){
    if(x.id!==id)return x;
    achou=true;
    var inv=Object.assign({},x);
    registrar(inv,v);
    return inv;
  });
  if(!achou)return {ok:false,msg:"Esse investimento não existe mais."};
  salvarConfig();
  return {ok:true,msg:"Valor atualizado."};
}

export function removerInvestimento(id){
  if(sessao.readOnly)return SO_LEITURA;
  var antes=listaInvestimentos();
  var depois=antes.filter(function(x){return x.id!==id});
  if(depois.length===antes.length)return {ok:false,msg:"Esse investimento não existe mais."};
  state.config.investimentos=depois;
  salvarConfig();
  return {ok:true,msg:"Investimento removido."};
}

export function definirMesesReserva(n){
  if(sessao.readOnly)return SO_LEITURA;
  n=Math.round(+n);
  if(!(n>=1&&n<=24))return {ok:false,msg:"Escolha de 1 a 24 meses."};
  state.config.reservaMeses=n;
  salvarConfig();
  return {ok:true,msg:"Reserva de "+n+" "+(n===1?"mês":"meses")+" de custo."};
}
