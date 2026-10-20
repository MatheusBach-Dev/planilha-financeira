import {contasDoMes} from "../core/calculo.js";
import {HOJE_DIA, HOJE_KEY, key, parseKey, somaMes} from "../core/datas.js";
import {$, esc, money, num} from "../core/formato.js";
import {mesExtenso} from "../core/pagamento.js";
import {listaParcelamentos, mesDaParcela, resumoParcelamento, valorDaParcela} from "../core/parcelas.js";
import {abrirSheet, fe, fmtIso, opcoesCat} from "./folhas.js";
import {aplicarMascara, lerMoney} from "./perfil.js";

// ————— situação de cada parcela (vem do check-in do mês dela) —————

function contaDaParcela(p,i){
  var k=mesDaParcela(p,i),ch="parc:"+p.id+":"+i;
  return contasDoMes(k).filter(function(c){return c.chave===ch})[0]||null;
}

function situacao(p){
  var r=resumoParcelamento(p),pagas=+p.jaPagas||0,faltam=0,atrasadas=0;
  r.faltam.forEach(function(x){
    var c=contaDaParcela(p,x.i);
    if(c&&(c.status==="pago"||c.status==="auto"))pagas++;
    else{faltam+=x.valor;if(c&&c.status==="vencida")atrasadas++}
  });
  return {r:r,pagas:pagas,faltam:faltam,atrasadas:atrasadas};
}

function textoJuros(r){
  if(r.aVista===null)return "";
  if(r.semJuros)return "sem juros";
  if(r.juros<0)return money(-r.juros)+" mais barato que à vista";
  return money(r.juros)+" de juros"+(r.taxaMensal!=null?" (cerca de "+num(r.taxaMensal).replace(/,?0+$/,"")+"% ao mês)":"");
}

// ————— seção no perfil —————

export function secaoParcelamentos(){
  var lista=listaParcelamentos().map(function(p){
    var s=situacao(p),j=textoJuros(s.r);
    return '<div class="fixo parc" data-editparc="'+esc(p.id)+'"><div class="d">'+esc(p.desc||"parcelamento")+
      '<small>'+(p.forma==="debito"?"débito/boleto":"crédito")+(p.onde?" · "+esc(p.onde):"")+
      ' · '+s.pagas+' de '+s.r.n+' pagas · '+money(+p.parcela||0)+' por mês'+(j?" · "+j:"")+
      (s.atrasadas?' · <span class="atrasada">'+s.atrasadas+' atrasada'+(s.atrasadas>1?"s":"")+'</span>':'')+'</small></div>'+
      '<b>'+(s.faltam>0.005?"faltam "+money(s.faltam):'<span class="feito">quitado ✓</span>')+'</b></div>';
  }).join("");
  return '<section class="bloco"><h2>parcelamentos</h2>'+
    '<p class="hint">Compras parceladas no crédito ou no débito (Shopee, PagueLeve, boleto). Cada parcela entra como uma conta no mês dela, com "paguei" e "não vou pagar este mês", e só sai da diária quando você paga.</p>'+
    (lista||'<p class="empty">Nenhuma compra parcelada.</p>')+
    '<button class="btn ghost w" id="addParc" style="margin-top:14px">Adicionar parcelamento</button></section>';
}

// ————— formulário —————

function proxMes(){var a=somaMes(parseKey(HOJE_KEY),1);return key(a.y,a.m)}

// prefill (opcional, vindo do "+"): {desc, cat, valor, dia}
export function abrirParcelamento(id,prefill){
  var p=id?listaParcelamentos().filter(function(x){return x.id===id})[0]:null;
  var pf=prefill||{};
  fe.parcEditando=p?p.id:null;
  fe.parcForma=p?p.forma:"credito";
  fe.parcApagar=false;
  function seg(f,l){return '<button type="button" data-forma="'+f+'" aria-pressed="'+(fe.parcForma===f)+'">'+l+'</button>'}
  abrirSheet(
    '<h3>'+(p?"editar parcelamento":"compra parcelada")+'</h3>'+
    '<p class="sh-sub">Cada parcela entra como uma conta no mês dela. Se pagar um valor diferente (juros, atraso), corrija no "paguei" ou aqui embaixo.</p>'+
    '<div class="seg" id="segForma">'+seg("credito","crédito")+seg("debito","débito ou boleto")+'</div>'+
    '<label class="fld"><span>O que você comprou</span><input id="pcDesc" type="text" value="'+esc(p?p.desc:pf.desc||"")+'" placeholder="teclado, moto, faculdade…"></label>'+
    '<div class="row2">'+
      '<label class="fld"><span>Onde</span><input id="pcOnde" type="text" value="'+esc(p?p.onde||"":"")+'" placeholder="Nubank, Shopee, PagueLeve…"></label>'+
      '<label class="fld"><span>Categoria</span><select id="pcCat">'+opcoesCat("saida",p?p.cat||"":pf.cat||"")+'</select></label>'+
    '</div>'+
    '<div class="row2">'+
      '<label class="fld"><span>Preço à vista (se souber)</span><input id="pcAVista" inputmode="numeric" data-money value="'+num(p?p.aVista||0:pf.valor||0)+'"></label>'+
      '<label class="fld"><span>Quantas parcelas</span><input id="pcN" type="number" min="1" max="360" step="1" value="'+(p?p.n:"")+'" placeholder="12"></label>'+
    '</div>'+
    '<div class="row2">'+
      '<label class="fld"><span>Valor de cada parcela</span><input id="pcParcela" inputmode="numeric" data-money value="'+num(p?p.parcela:0)+'"></label>'+
      '<label class="fld"><span>Quantas já paguei</span><input id="pcJa" type="number" min="0" step="1" value="'+(p?p.jaPagas||0:0)+'"></label>'+
    '</div>'+
    '<div class="row2">'+
      '<label class="fld"><span>Próxima parcela em</span><input id="pcPrimeira" type="month" value="'+esc(p?p.primeira:proxMes())+'"></label>'+
      '<label class="fld"><span>Dia que a parcela cai</span><input id="pcDia" type="number" min="1" max="31" step="1" value="'+(p?p.dia:pf.dia||HOJE_DIA)+'"></label>'+
    '</div>'+
    '<div class="sh-sub tipoDesc" id="pcResumo"></div>'+
    '<div id="pcLista"></div>'+
    '<button class="btn w" id="parcSalvar">'+(p?"Salvar alterações":"Salvar parcelamento")+'</button>'+
    (p?'<button class="linkish" id="parcApagar" style="color:var(--neg-deep)">apagar parcelamento</button>':"")
  );
  atualizaParcelamento();
}

// lê o formulário; os valores diferentes vêm da lista de parcelas (inputs data-parcval).
// Só conta como valor diferente o que a pessoa mudou na lista: a lista é refeita enquanto ela digita o
// valor de cada parcela (0,01 → 0,10 → 1,00…) e esses números de passagem não podem virar exceção.
export function lerFormParcelamento(){
  var parcela=lerMoney($("pcParcela")),valores={};
  var p=fe.parcEditando?listaParcelamentos().filter(function(x){return x.id===fe.parcEditando})[0]:null;
  var antigos=p&&p.valores||{},mesmaBase=p&&Math.abs((+p.parcela||0)-parcela)<0.005;
  document.querySelectorAll("#pcLista [data-parcval]").forEach(function(inp){
    var i=inp.dataset.parcval;
    if(inp.value!==inp.dataset.base)valores[i]=lerMoney(inp);
    else if(mesmaBase&&antigos[i]!=null)valores[i]=+antigos[i];
  });
  // parcela já paga não tem input: mantém o valor diferente que ela já tinha
  Object.keys(antigos).forEach(function(i){
    if(!(i in valores)&&!document.querySelector('#pcLista [data-parcval="'+i+'"]'))valores[i]=antigos[i]});
  // valor igual ao de cada parcela não é exceção
  Object.keys(valores).forEach(function(i){if(Math.abs((+valores[i]||0)-parcela)<0.005)delete valores[i]});
  return {id:fe.parcEditando||null,desc:$("pcDesc").value,onde:$("pcOnde").value,cat:$("pcCat").value,forma:fe.parcForma,
          aVista:lerMoney($("pcAVista"))||null,n:+$("pcN").value,parcela:parcela,
          jaPagas:+$("pcJa").value||0,primeira:$("pcPrimeira").value,dia:+$("pcDia").value,valores:valores};
}

// resumo dos juros e lista de parcelas, refeitos enquanto a pessoa digita
export function atualizaParcelamento(){
  var res=$("pcResumo");
  if(!res)return;
  document.querySelectorAll("#segForma [data-forma]").forEach(function(b){
    b.setAttribute("aria-pressed",b.dataset.forma===fe.parcForma?"true":"false")});
  var d=lerFormParcelamento();
  if(!(d.n>=1)||!(d.parcela>0)||!/^\d{4}-\d{2}$/.test(d.primeira||"")){
    res.innerHTML="Preencha quantas parcelas são, o valor de cada uma e o mês da próxima pra ver o resumo.";
    $("pcLista").innerHTML="";return;
  }
  var tmp=Object.assign({id:d.id||"novo"},d,{jaPagas:Math.max(0,Math.min(d.n-1,d.jaPagas))});
  var r=resumoParcelamento(tmp),j=textoJuros(r);
  res.innerHTML=r.n+'x: total de <b>'+money(r.total)+'</b>'+
    (r.aVista!==null?(r.semJuros?' · <b>sem juros</b> ✓':' · à vista seria '+money(r.aVista)+' · <b>'+esc(j)+'</b>'+
      (r.taxaAnual!=null&&!r.semJuros&&r.juros>0?' ('+num(r.taxaAnual).replace(/,?0+$/,"")+'% ao ano)':'')):'')+
    '<br>Faltam <b>'+r.faltam.length+' parcela'+(r.faltam.length===1?'':'s')+'</b> ('+money(r.faltamValor)+'), de '+
    mesExtenso(r.primeiraMes)+' a '+mesExtenso(r.ultimaMes)+'.';
  // lista: só reconstrói quando muda o conjunto de parcelas, pra não apagar o que a pessoa está digitando
  var sig=[tmp.n,tmp.jaPagas,tmp.primeira,tmp.parcela].join("|");
  var lista=$("pcLista");
  if(lista.dataset.sig===sig)return;
  lista.dataset.sig=sig;
  var p=fe.parcEditando?listaParcelamentos().filter(function(x){return x.id===fe.parcEditando})[0]:null;
  lista.innerHTML='<p class="sh-sub" style="margin:14px 0 6px">Parcelas (mude o valor de uma que ainda vai vir, se for diferente):</p>'+
    r.faltam.map(function(x){
      var c=p&&p.primeira===tmp.primeira&&(+p.jaPagas||0)===tmp.jaPagas?contaDaParcela(p,x.i):null;
      var st=c?c.status:"aberta",paga=st==="pago"||st==="auto";
      var txt=paga?"paga"+(c.pago?" dia "+fmtIso(c.pago.data):""):st==="vencida"?"atrasada":st==="pulada"?"não vai pagar":"a pagar";
      return '<div class="parc-linha '+st+'"><span>'+x.i+'/'+r.n+' · '+mesExtenso(x.mes)+' · '+txt+'</span>'+
        (paga?'<b>'+money(c.pago?c.pago.valor:x.valor)+'</b>'
             :'<input inputmode="numeric" data-money data-parcval="'+x.i+'" data-base="'+num(valorDaParcela(tmp,x.i))+'" value="'+num(valorDaParcela(tmp,x.i))+'" aria-label="valor da parcela '+x.i+'">')+
        '</div>';
    }).join("");
  aplicarMascara(lista);
}
