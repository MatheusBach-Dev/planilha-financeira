import {previewAperto} from "../core/aperto.js";
import {cicloDoDia} from "../core/ciclo.js";
import {chaveDia, diasNoMes, hojeZero, key, parseKey, somaMes} from "../core/datas.js";
import {localSave, mesDoc, padraoConfig, state, ui} from "../core/estado.js";
import {$, money, uid} from "../core/formato.js";
import {salvarConfig, salvarMes} from "../dados/persistencia.js";
import {sessao} from "../dados/sessao.js";
import {abrirDia, fe, fecharSheet} from "./folhas.js";
import {atualizaSaveBar, lerMoney} from "./perfil.js";
import {render} from "./render.js";
import {aplicarTema} from "./tema.js";
import {toast} from "./toast.js";

export function aplicarAperto(){
  if(sessao.readOnly)return toast("Você tem acesso só de leitura aqui.");
  var p=previewAperto();
  if(!p)return toast("Não há o que recalcular agora.");
  var k=key(p.apIni.getFullYear(),p.apIni.getMonth()),d=p.apIni.getDate();
  var doc=mesDoc(k);
  doc.rebases=(doc.rebases||[]).filter(function(r){return r.dia!==d});
  doc.rebases.push({dia:d,dias:p.dias});
  salvarMes(k);render();
  toast("Aperto de "+p.N+" dias a "+money(p.r)+" por dia.");
}

export function desfazerAperto(){
  if(sessao.readOnly)return toast("Você tem acesso só de leitura aqui.");
  var c=cicloDoDia[chaveDia(hojeZero())];
  if(!c)return;
  var pk={y:c.inicio.getFullYear(),m:c.inicio.getMonth()};
  var fimK=key(c.fim.getFullYear(),c.fim.getMonth()),k=key(pk.y,pk.m),g=0,tocados=[];
  while(k<=fimK&&g++<4){
    var doc=state.meses[k];
    if(doc&&doc.rebases&&doc.rebases.length){
      var ano=pk.y,mes=pk.m,antes=doc.rebases.length;
      doc.rebases=doc.rebases.filter(function(r){
        var dt=new Date(ano,mes,r.dia);
        return dt<c.inicio||dt>c.fim;
      });
      if(doc.rebases.length!==antes)tocados.push(k);
    }
    pk=somaMes(pk,1);k=key(pk.y,pk.m);
  }
  tocados.forEach(salvarMes);
  render();toast("Recálculo desfeito.");
}

export function salvarConfigManual(){
  if(sessao.readOnly)return toast("Você tem acesso só de leitura aqui.");
  document.querySelectorAll("#viewSet [data-set]").forEach(function(el){
    var k=el.dataset.set;
    var val=el.hasAttribute("data-money")?lerMoney(el):(el.type==="number"?(+el.value||0):el.value);
    if(k==="tema")state.config.temaEscolhido=true;
    state.config[k]=val;
  });
  aplicarTema();
  ui.cfgSujo=false;
  salvarConfig();
  render();
  var b=$("btnSalvarCfg");
  if(b){
    b.classList.add("ok");
    b.firstChild.textContent="Salvo ✓";
    clearTimeout(ui.salvoT);
    ui.salvoT=setTimeout(atualizaSaveBar,1800);
  }
  toast("Configurações salvas.");
}

export function salvarPagamento(){
  if(sessao.readOnly)return toast("Você tem acesso só de leitura aqui.");
  var val=lerMoney($("pVal"));
  if(!val)return toast("Coloque um valor.");
  var lista=(state.config.pagamentos||[]).slice();
  var antigo=fe.pagEditando?lista.filter(function(x){return x.id===fe.pagEditando})[0]:null;
  var novo={
    id:antigo?antigo.id:uid(),
    valor:val,
    desc:$("pDesc").value.trim()||"salário",
    regra:fe.pagRegra,
    n:Math.max(1,+$("pN").value||5),
    ajuste:$("pAjuste").value,
    desde:$("pDesde").value||key(ui.atual.y,ui.atual.m)
  };
  if(antigo)lista=lista.map(function(x){return x.id===antigo.id?novo:x});
  else lista.push(novo);
  state.config.pagamentos=lista;
  fe.pagEditando=null;
  salvarConfig();fecharSheet();render();
  toast(antigo?"Recebimento atualizado.":"Recebimento salvo.");
}

export function salvarFixo(){
  if(sessao.readOnly)return toast("Você tem acesso só de leitura aqui.");
  var val=lerMoney($("fVal"));
  if(!val)return toast("Coloque um valor.");
  var n=Math.max(1,+($("fN")||{value:1}).value||1);
  var lista=(state.config.fixos||[]).slice();
  var antigo=fe.fixoEditando?lista.filter(function(x){return x.id===fe.fixoEditando})[0]:null;
  var novo={
    id:antigo?antigo.id:uid(),
    desc:$("fDesc").value.trim()||($("fCat")?$("fCat").value:""),
    cat:$("fCat")?$("fCat").value:"",
    regra:fe.fixoRegra,
    dia:fe.fixoRegra==="fixo"?Math.min(31,n):(antigo?antigo.dia:1),
    n:n,
    espera:$("fEspera").checked,
    tipo:fe.novoTipo,valor:val,
    cartao:$("fCartao").checked&&fe.novoTipo==="saida",
    desde:antigo?antigo.desde:key(ui.atual.y,ui.atual.m)
  };
  if(antigo)lista=lista.map(function(x){return x.id===antigo.id?novo:x});
  else lista.push(novo);
  state.config.fixos=lista;
  fe.fixoEditando=null;
  salvarConfig();fecharSheet();render();
  toast(antigo?"Conta fixa atualizada.":"Conta fixa salva.");
}

export function mover(d){
  var m=ui.atual.m+d,y=ui.atual.y;
  if(m<0){m=11;y--}
  if(m>11){m=0;y++}
  ui.atual={y:y,m:m};
  render();
}

export function setTab(name){
  ui.tab=name;
  $("viewSaldos").hidden=name!=="saldos";
  $("viewMes").hidden=name!=="mes";
  $("viewSet").hidden=name!=="set";
  document.querySelectorAll("[data-tab]").forEach(function(b){
    b.setAttribute("aria-current",b.dataset.tab===name?"true":"false");
  });
  render();
  window.scrollTo(0,0);
}

export function marcarDia(k,d){
  if(sessao.readOnly)return toast("Você tem acesso só de leitura aqui.");
  var doc=mesDoc(k),i=doc.conferidos.indexOf(d);
  if(i>=0)doc.conferidos.splice(i,1);
  else doc.conferidos.push(d);
  doc.conferidos.sort(function(a,b){return a-b});
  salvarMes(k);render();
}

export function marcarAte(k,d){
  if(sessao.readOnly)return toast("Você tem acesso só de leitura aqui.");
  var doc=mesDoc(k);
  for(var i=1;i<=d;i++)if(doc.conferidos.indexOf(i)<0)doc.conferidos.push(i);
  doc.conferidos.sort(function(a,b){return a-b});
  salvarMes(k);render();
  toast("Dias 1 a "+d+" marcados.");
}

export function limparDias(k){
  if(sessao.readOnly)return toast("Você tem acesso só de leitura aqui.");
  mesDoc(k).conferidos=[];
  salvarMes(k);render();
  toast("Mês desmarcado.");
}

export function salvarNovo(){
  if(sessao.readOnly)return toast("Você tem acesso só de leitura aqui.");
  var val=lerMoney($("nVal"));
  if(!val)return toast("Coloque um valor.");
  var k=fe.novoMes||key(ui.atual.y,ui.atual.m),pk=parseKey(k);
  var cat=$("nCat")?$("nCat").value:"";
  var desc=$("nDesc").value.trim()||cat;
  var dia=Math.max(1,Math.min(diasNoMes(pk.y,pk.m),+$("nDia").value||1));
  var cartao=$("nCartao").checked&&fe.novoTipo!=="entrada"&&fe.novoTipo!=="economia";
  if(fe.novoEditando){
    var docE=mesDoc(k),achou=false;
    docE.lancamentos=docE.lancamentos.map(function(l){
      if(l.id!==fe.novoEditando)return l;
      achou=true;
      return {id:l.id,desc:desc,dia:dia,tipo:fe.novoTipo,valor:val,cartao:cartao,cat:cat};
    });
    fe.novoEditando=null;
    if(!achou)return toast("Esse lançamento não existe mais.");
    salvarMes(k);fecharSheet();render();
    return toast("Lançamento atualizado.");
  }
  if($("nFixo").value==="1"){
    state.config.fixos=(state.config.fixos||[]).concat([{id:uid(),desc:desc,dia:dia,tipo:fe.novoTipo,valor:val,cartao:cartao,cat:cat,desde:k}]);
    salvarConfig();
  }else{
    var doc=mesDoc(k);
    doc.lancamentos.push({id:uid(),desc:desc,dia:dia,tipo:fe.novoTipo,valor:val,cartao:cartao,cat:cat});
    if(fe.novoTipo==="diario"&&doc.conferidos.indexOf(dia)<0){
      doc.conferidos.push(dia);
      doc.conferidos.sort(function(a,b){return a-b});
    }
    salvarMes(k);
  }
  fecharSheet();render();
  toast(desc?(desc+" lançado."):"Lançado.");
}

export function remover(id,mk){
  if(sessao.readOnly)return toast("Você tem acesso só de leitura aqui.");
  var k=mk||key(ui.atual.y,ui.atual.m),d=mesDoc(k);
  if(id==="pag"){
    if(!confirm("Marcar que o pagamento não caiu neste mês?"))return;
    if(d.pulados.indexOf("pag")<0)d.pulados.push("pag");
  }else if(id.indexOf("fix:")===0){
    var fid=id.slice(4);
    if(!confirm("Pular esta conta fixa só neste mês?"))return;
    if(d.pulados.indexOf(fid)<0)d.pulados.push(fid);
  }else{
    d.lancamentos=d.lancamentos.filter(function(l){return l.id!==id});
  }
  salvarMes(k);render();
  if(fe.diaAberto)abrirDia(fe.diaAberto.dia,fe.diaAberto.k);
  toast("Removido.");
}

export function limpar(){
  if(sessao.readOnly)return toast("Você tem acesso só de leitura aqui.");
  if(!confirm("Apagar todos os lançamentos e configurações? Não dá pra desfazer."))return;
  var chaves=Object.keys(state.meses);
  state.meses={};
  state.config=Object.assign({},padraoConfig,{nome:state.config.nome,tema:state.config.tema});
  localSave();
  if(sessao.db&&!sessao.readOnly){
    chaves.forEach(function(k){sessao.db.doc("meses/"+k).delete().catch(function(){})});
    salvarConfig();
  }
  render();toast("Tudo limpo.");
}
