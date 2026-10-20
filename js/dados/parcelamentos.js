import {state} from "../core/estado.js";
import {uid} from "../core/formato.js";
import {listaParcelamentos} from "../core/parcelas.js";
import {salvarConfig} from "./persistencia.js";
import {sessao} from "./sessao.js";

// Mudam as compras parceladas e salvam. Devolvem {ok, msg}; quem chama redesenha (render) e mostra a msg.

var SO_LEITURA={ok:false,msg:"Você tem acesso só de leitura aqui."};

function lerValor(v){
  if(v===null||v===undefined||v==="")return null;
  if(typeof v==="string")v=v.replace(/\./g,"").replace(",",".");
  v=+v;
  return isFinite(v)&&v>=0?Math.round(v*100)/100:NaN;
}

// dados: {id?, desc, cat, forma, onde, aVista, n, parcela, jaPagas, primeira:"aaaa-mm", dia, valores:{i:valor}}
export function salvarParcelamento(dados){
  if(sessao.readOnly)return SO_LEITURA;
  dados=dados||{};
  var n=Math.round(+dados.n),ja=Math.round(+dados.jaPagas||0),dia=Math.round(+dados.dia);
  var parcela=lerValor(dados.parcela),aVista=lerValor(dados.aVista);
  if(!(n>=1&&n<=360))return {ok:false,msg:"Coloque quantas parcelas são (de 1 a 360)."};
  if(!(parcela>0))return {ok:false,msg:"Coloque o valor de cada parcela."};
  if(aVista!==null&&isNaN(aVista))return {ok:false,msg:"O preço à vista não está certo."};
  if(!(ja>=0&&ja<n))return {ok:false,msg:"Já pagas tem que ser menos que o total de parcelas."};
  if(!/^\d{4}-\d{2}$/.test(String(dados.primeira||"")))return {ok:false,msg:"Escolha o mês da próxima parcela."};
  if(!(dia>=1&&dia<=31))return {ok:false,msg:"Escolha o dia em que a parcela cai (1 a 31)."};
  // só guarda valor diferente pra parcela que existe e que não é igual ao valor normal
  var valores={};
  Object.keys(dados.valores||{}).forEach(function(i){
    var v=lerValor(dados.valores[i]);
    if(+i>=1&&+i<=n&&v>0&&Math.abs(v-parcela)>=0.005)valores[i]=v;
  });
  var p={desc:String(dados.desc||"").trim()||"parcelamento",cat:String(dados.cat||""),
         forma:dados.forma==="debito"?"debito":"credito",onde:String(dados.onde||"").trim(),
         aVista:aVista>0?aVista:null,n:n,parcela:parcela,jaPagas:ja,primeira:dados.primeira,dia:dia,valores:valores};
  var lista=listaParcelamentos();
  if(dados.id){
    var achou=false;
    state.config.parcelamentos=lista.map(function(x){
      if(x.id!==dados.id)return x;
      achou=true;
      return Object.assign({id:x.id},p);
    });
    if(!achou)return {ok:false,msg:"Esse parcelamento não existe mais."};
    salvarConfig();
    return {ok:true,msg:p.desc+" atualizado."};
  }
  state.config.parcelamentos=lista.concat([Object.assign({id:uid()},p)]);
  salvarConfig();
  return {ok:true,msg:p.desc+": "+n+"x salvo."};
}

// tira a compra de todos os meses, inclusive as parcelas já pagas no app
export function removerParcelamento(id){
  if(sessao.readOnly)return SO_LEITURA;
  var antes=listaParcelamentos(),depois=antes.filter(function(x){return x.id!==id});
  if(depois.length===antes.length)return {ok:false,msg:"Esse parcelamento não existe mais."};
  state.config.parcelamentos=depois;
  salvarConfig();
  return {ok:true,msg:"Parcelamento apagado."};
}
