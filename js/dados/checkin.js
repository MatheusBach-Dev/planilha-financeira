import {contasDoMes} from "../core/calculo.js";
import {HOJE_ISO} from "../core/datas.js";
import {mesDoc} from "../core/estado.js";
import {money} from "../core/formato.js";
import {salvarMes} from "./persistencia.js";
import {sessao} from "./sessao.js";

// "Paguei" das contas fixas. Devolvem {ok, msg}; quem chama redesenha (render) e mostra a msg.

var SO_LEITURA={ok:false,msg:"Você tem acesso só de leitura aqui."};

function acharConta(k,chave){
  return contasDoMes(k).filter(function(c){return c.chave===chave})[0]||null;
}

function lerValor(v){
  if(typeof v==="string")v=v.replace(/\./g,"").replace(",",".");
  v=+v;
  return isFinite(v)&&v>0?Math.round(v*100)/100:null;
}

// k = mês da conta; data = "aaaa-mm-dd" do pagamento (pode cair no mês seguinte, se pagou atrasado)
export function marcarPaga(k,chave,data,valor){
  if(sessao.readOnly)return SO_LEITURA;
  var c=acharConta(k,chave);
  if(!c)return {ok:false,msg:"Essa conta não existe mais neste mês."};
  var v=lerValor(valor);
  if(v===null)return {ok:false,msg:"Coloque o valor que você pagou."};
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(data||"")))return {ok:false,msg:"Escolha o dia do pagamento."};
  if(data>HOJE_ISO)return {ok:false,msg:"O dia do pagamento não pode ser depois de hoje."};
  if(data.slice(0,7)<k)return {ok:false,msg:"O pagamento não pode ser antes do mês da conta."};
  var d=mesDoc(k);
  d.pagos[chave]={data:data,valor:v};
  tirarPulo(d,c);
  salvarMes(k);
  return {ok:true,msg:(c.desc||"Conta")+" paga: "+money(v)+"."};
}

// o "pular" antigo guardava o id do pedaço da conta; o novo guarda a chave (série). Tira os dois.
function tirarPulo(d,c){
  d.pulados=d.pulados.filter(function(x){return x!==c.chave&&x!==c.f.id});
}

// "não vou pagar este mês": a conta sai do mês sem ficar vermelha e sem entrar no "devendo"
export function naoVouPagar(k,chave){
  if(sessao.readOnly)return SO_LEITURA;
  var c=acharConta(k,chave);
  if(!c)return {ok:false,msg:"Essa conta não existe mais neste mês."};
  var d=mesDoc(k);
  delete d.pagos[chave];
  tirarPulo(d,c);
  d.pulados.push(chave);
  salvarMes(k);
  return {ok:true,msg:(c.desc||"Conta")+": não vai pagar este mês."};
}

export function voltarACobrar(k,chave){
  if(sessao.readOnly)return SO_LEITURA;
  var c=acharConta(k,chave);
  if(!c)return {ok:false,msg:"Essa conta não existe mais neste mês."};
  var d=mesDoc(k);
  tirarPulo(d,c);
  salvarMes(k);
  return {ok:true,msg:(c.desc||"Conta")+" voltou a contar neste mês."};
}

export function desmarcarPaga(k,chave){
  if(sessao.readOnly)return SO_LEITURA;
  var d=mesDoc(k);
  if(!d.pagos[chave])return {ok:false,msg:"Essa conta já estava sem pagamento."};
  delete d.pagos[chave];
  salvarMes(k);
  return {ok:true,msg:"Pagamento desfeito."};
}
