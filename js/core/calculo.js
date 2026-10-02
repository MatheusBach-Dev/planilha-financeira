import {HOJE_DIA, HOJE_KEY, diasNoMes, key, nEsimoDiaUtil, parseKey, somaMes, ultimoDiaUtil} from "./datas.js";
import {mesLeitura, state, temDados} from "./estado.js";
import {diaPagamento, regraPagamento, temPagamento} from "./pagamento.js";

export function diaDoFixo(f,y,m){
  var r=f.regra||"fixo",dias=diasNoMes(y,m),d;
  if(r==="util")d=nEsimoDiaUtil(y,m,Math.max(1,+f.n||1));
  else if(r==="ultimoUtil")d=ultimoDiaUtil(y,m);
  else if(r==="pagamento")d=temPagamento()?diaPagamento(y,m):Math.min(dias,+f.dia||1);
  else if(r==="aposPagamento")d=temPagamento()?Math.min(dias,diaPagamento(y,m)+Math.max(0,+f.n||0)):Math.min(dias,+f.dia||1);
  else d=Math.max(1,Math.min(dias,+f.dia||1));
  if(f.espera&&f.tipo!=="entrada"&&temPagamento()){
    var pag=diaPagamento(y,m);
    if(d<pag)return pag;
  }
  return d;
}

export function textoRegraFixo(f){
  var r=f.regra||"fixo";
  if(r==="util")return (+f.n||1)+"º dia útil";
  if(r==="ultimoUtil")return "último dia útil";
  if(r==="pagamento")return "no dia do salário";
  if(r==="aposPagamento")return (+f.n||0)+" dia"+((+f.n||0)===1?"":"s")+" após o salário";
  return "dia "+(+f.dia||1);
}

export function fixosDoMes(k){
  var d=mesLeitura(k),out=[],pk=parseKey(k);
  (state.config.fixos||[]).forEach(function(f){
    if(f.desde&&k<f.desde)return;
    if(d.pulados.indexOf(f.id)>=0)return;
    var dia=diaDoFixo(f,pk.y,pk.m);
    var nominal=diaDoFixo(Object.assign({},f,{espera:false}),pk.y,pk.m);
    out.push({id:"fix:"+f.id,dia:dia,tipo:f.tipo,valor:f.valor,desc:f.desc,
              fixo:true,cartao:!!f.cartao,adiadaDe:dia!==nominal?nominal:0});
  });
  return out;
}

export function pagamentoDoMes(k){
  var pk=parseKey(k),p=regraPagamento(pk.y,pk.m);
  if(!p)return [];
  if(mesLeitura(k).pulados.indexOf("pag")>=0)return [];
  return [{id:"pag",dia:diaPagamento(pk.y,pk.m),tipo:"entrada",valor:+p.valor,
           desc:p.desc||"salário",pagamento:true}];
}

export function calcular(k,inicial){
  var pk=parseKey(k),dias=diasNoMes(pk.y,pk.m),doc=mesLeitura(k);
  var lanc=doc.lancamentos.concat(fixosDoMes(k)).concat(pagamentoDoMes(k));
  var diaPag=diaPagamento(pk.y,pk.m);
  var porDia={};
  lanc.forEach(function(l){
    var d=Math.min(dias,Math.max(1,+l.dia||1));
    (porDia[d]=porDia[d]||[]).push(l);
  });
  var saldo=inicial,linhas=[],vazio=lanc.length===0;
  var conf=doc.conferidos||[];
  var tot={entrada:0,saida:0,diario:0,economia:0,cartao:0,marcados:conf.length,diasComGasto:0};
  for(var d=1;d<=dias;d++){
    var itens=porDia[d]||[],e=0,s=0,dr=0,ec=0,ct=0;
    for(var i=0;i<itens.length;i++){
      var l=itens[i],v=+l.valor||0;
      if(l.tipo==="entrada")e+=v;
      else if(l.tipo==="saida"){s+=v;if(l.cartao)ct+=v}
      else if(l.tipo==="economia")ec+=v;
      else{dr+=v;if(l.cartao)ct+=v}
    }
    saldo=saldo+e-s-ec-dr;
    linhas.push({dia:d,dow:new Date(pk.y,pk.m,d).getDay(),entrada:e,saida:s,economia:ec,
                 diario:dr,conferido:conf.indexOf(d)>=0,saldo:saldo,itens:itens,
                 pagamento:diaPag===d,seca:diaPag>0&&d<diaPag});
    tot.entrada+=e;tot.saida+=s;tot.economia+=ec;tot.cartao+=ct;tot.diario+=dr;
    if(dr>0)tot.diasComGasto++;
  }
  var restam=k<HOJE_KEY?0:(k===HOJE_KEY?dias-HOJE_DIA+1:dias);
  var decorridos=k<HOJE_KEY?dias:(k===HOJE_KEY?HOJE_DIA:0);
  var permitido=restam>0?saldo/restam:(inicial+tot.entrada-tot.saida-tot.economia)/dias;
  return {linhas:linhas,total:tot,final:saldo,inicial:inicial,dias:dias,vazio:vazio,diaPag:diaPag,
          restam:restam,decorridos:decorridos,permitido:Math.max(0,permitido)};
}

export var cacheInicial={};

export function inicialDe(k){
  if(cacheInicial[k]!==undefined)return cacheInicial[k];
  var base=+state.config.saldoInicial||0;
  var inicio=state.config.saldoInicialMes||HOJE_KEY;
  var menor=menorMesConhecido();
  if(menor&&menor<inicio)inicio=menor;
  if(k<=inicio){cacheInicial[k]=base;return base}
  var acc=base,cur=parseKey(inicio),ck=inicio,guarda=0;
  while(ck<k&&guarda++<480){
    cacheInicial[ck]=acc;
    acc=calcular(ck,acc).final;
    cur=somaMes(cur,1);
    ck=key(cur.y,cur.m);
  }
  cacheInicial[k]=acc;
  return acc;
}

export function menorMesConhecido(){
  var ks=Object.keys(state.meses).filter(function(x){return temDados(state.meses[x])});
  (state.config.fixos||[]).forEach(function(f){if(f.desde)ks.push(f.desde)});
  (state.config.pagamentos||[]).forEach(function(p){if(+p.valor>0&&p.desde)ks.push(p.desde)});
  ks.sort();
  return ks[0]||null;
}

export function limparCache(){cacheInicial={}}
