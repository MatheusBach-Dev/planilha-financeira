import {calcular, inicialDe} from "../core/calculo.js";
import {dadosDia} from "../core/ciclo.js";
import {COR_NEGATIVO, corPorPercentual} from "../core/cores.js";
import {HOJE_DIA, HOJE_KEY, diasNoMes, key, parseKey} from "../core/datas.js";
import {mesDoc, state, ui} from "../core/estado.js";
import {$, DOW, MESES, esc, money, num} from "../core/formato.js";
import {explicaPagamento, mesExtenso, regraPagamento, valorPagamento} from "../core/pagamento.js";
import {aplicarMascara} from "./perfil.js";

export const fe={diaAberto:null,novoTipo:"diario",novoMes:null,novoEditando:null,
  fixoRegra:"fixo",fixoEditando:null,pagRegra:"util",pagEditando:null};

export var scrim=$("scrim"),sheet=$("sheet"),sheetMascara=false;

export function abrirSheet(html){
  sheetMascara=true;
  sheet.innerHTML='<div class="sheet-top"><span class="grab"></span>'+
    '<button class="min" id="minSheet" aria-label="Minimizar">'+
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>'+
    '</button></div>'+html;
  scrim.classList.add("open");
  document.body.style.overflow="hidden";
  aplicarMascara(sheet);
}

export function fecharSheet(){
  scrim.classList.remove("open");
  document.body.style.overflow="";
  fe.diaAberto=null;fe.novoEditando=null;
}

export function abrirDia(dia,mk){
  var k=mk||key(ui.atual.y,ui.atual.m),pk=parseKey(k);
  fe.diaAberto={dia:dia,k:k};
  var r=calcular(k,inicialDe(k)),l=r.linhas[dia-1];
  var ordem={entrada:0,saida:1,diario:2,economia:3};
  var itens=l.itens.slice().sort(function(a,b){return (ordem[a.tipo]||0)-(ordem[b.tipo]||0)});
  var dd=dadosDia(pk.y,pk.m,dia);
  var corpo=itens.length?itens.map(function(it){
    var cor=it.tipo==="entrada"?"var(--pos-deep)":it.tipo==="saida"?"var(--neg-deep)":it.tipo==="economia"?"var(--text-dim)":"var(--sea)";
    return '<div class="item"><i class="dot" style="background:'+cor+'"></i><div class="d">'+
      esc(it.desc||it.tipo)+'<small>'+(it.cat?esc(it.cat)+" · ":"")+rotuloTipo(it.tipo)+(it.pagamento?" · recebimento automático":it.fixo?(" · conta fixa"+(it.adiadaDe?" · adiada do dia "+it.adiadaDe:"")):"")+(it.cartao?" · no cartão":"")+'</small></div>'+
      '<b>'+money(it.valor)+'</b>'+
      (it.pagamento
        ? '<button class="ed" data-editpag="'+esc((regraPagamento(pk.y,pk.m)||{}).id||"")+'">editar</button>'
        : it.fixo
          ? '<button class="ed" data-editfixo="'+esc(it.id.slice(4))+'">editar</button>'
          : '<button class="ed" data-editlanc="'+esc(it.id)+'" data-dia="'+dia+'" data-mes="'+k+'">editar</button>')+
      '<button class="rm'+(it.fixo||it.pagamento?' off':'')+'" data-del="'+esc(it.id)+'" data-mes="'+k+'">remover</button></div>';
  }).join(""):'<p class="empty">Nada lançado neste dia.</p>';

  abrirSheet(
    '<h3>dia '+dia+' de '+MESES[pk.m]+'</h3>'+
    '<p class="sh-sub">'+DOW[l.dow]+' · saldo de '+money(l.saldo)+
      ' · '+(l.conferido?"você já anotou este dia":"você ainda não anotou este dia")+'</p>'+
    (dd?'<div class="pl destaque '+(l.diario>dd.v?"vermelho":"ok")+'" style="border-top:0;padding-top:0">'+
       '<span>'+(l.diario>dd.v?"passou do limite do dia":"ainda dá pra gastar")+'</span>'+
       '<b>'+money(l.diario>dd.v?l.diario-dd.v:dd.v-l.diario)+'</b></div>'+
       '<p class="sh-sub" style="margin-top:6px">limite de '+money(dd.v)+
       (l.diario?' · gastou '+money(l.diario):' · nada lançado')+
       (dd.d>0.005?' · limite abatido em '+money(dd.b-dd.v)+' porque você passou nos dias anteriores':'')+'</p>':"")+
    corpo+
    (l.pagamento?'<p class="sh-sub tipoDesc" style="margin-top:14px">'+esc(explicaPagamento(pk.y,pk.m,dia))+'</p>':"")+
    '<div style="display:flex;gap:8px;margin-top:18px">'+
      '<button class="btn ghost" style="flex:1" data-add-dia="'+dia+'" data-mes="'+k+'">Lançar neste dia</button>'+
      '<button class="btn" style="flex:1" data-toggledia="'+dia+'" data-mes="'+k+'">'+(l.conferido?"Desmarcar dia":"Marcar como anotado")+'</button>'+
    '</div>'+
    '<button class="linkish" data-ateaqui="'+dia+'" data-mes="'+k+'">marcar todos os dias até aqui</button>'
  );
}

export function abrirNovo(dia,mk,editId){
  var k=mk||key(ui.atual.y,ui.atual.m),pk=parseKey(k);
  fe.novoMes=k;
  var ed=editId?(mesDoc(k).lancamentos.filter(function(x){return x.id===editId})[0]||null):null;
  fe.novoEditando=ed?ed.id:null;
  if(ed)fe.novoTipo=ed.tipo;
  var d=(ed?ed.dia:dia)||(k===HOJE_KEY?HOJE_DIA:1);
  if(["entrada","saida","diario","economia"].indexOf(fe.novoTipo)<0)fe.novoTipo="diario";
  abrirSheet(
    '<h3>'+(ed?"editar lançamento":"novo lançamento")+'</h3><p class="sh-sub">em '+MESES[pk.m]+' de '+pk.y+'</p>'+
    '<div class="seg" id="segTipo">'+segb("entrada","entrada")+segb("saida","saída")+segb("diario","diário")+segb("economia","investimento")+'</div>'+
    '<p class="sh-sub tipoDesc" id="descTipo"></p>'+
    '<label class="fld"><span>Valor</span><input id="nVal" inputmode="numeric" data-money value="'+(ed?num(ed.valor):"0,00")+'" placeholder="0,00"></label>'+
    '<label class="fld"><span>Categoria</span><select id="nCat">'+opcoesCat(fe.novoTipo,ed?ed.cat||"":"")+'</select></label>'+
    '<label class="fld"><span>Do que se trata</span><input id="nDesc" type="text" value="'+esc(ed?ed.desc||"":"")+'" placeholder="almoço na faculdade, cinema…"></label>'+
    '<div class="row2">'+
      '<label class="fld"><span>Dia</span><input id="nDia" type="number" min="1" max="'+diasNoMes(pk.y,pk.m)+'" value="'+d+'"></label>'+
      (ed?'<label class="fld"><span>Repetir</span><select id="nFixo" disabled><option value="">só neste mês</option></select></label>'
          :'<label class="fld"><span>Repetir</span><select id="nFixo"><option value="">só neste mês</option><option value="1">todo mês</option></select></label>')+
    '</div>'+
    '<label class="chk" id="wrapCartao"><input type="checkbox" id="nCartao"'+(ed&&ed.cartao?" checked":"")+'> paguei no cartão</label>'+
    '<button class="btn w" id="nSalvar">'+(ed?"Salvar alterações":"Salvar lançamento")+'</button>'
  );
  atualizaSeg();
  setTimeout(function(){var v=$("nVal");if(v)v.focus()},90);
}

export function segb(t,l){return '<button type="button" data-tipo="'+t+'" aria-pressed="false">'+l+'</button>'}

export var CATS={
  entrada:["Salário","Freela ou extra","Venda","Reembolso","Rendimento","Presente recebido","13º ou férias","Outros"],
  saida:["Aluguel","Contas de casa","Internet e telefone","Mercado","Transporte","Saúde","Educação",
         "Assinaturas","Fatura do cartão","Parcela ou empréstimo","Impostos","Seguro","Pet","Presente","Outros"],
  diario:["Comida","Café","Transporte","Rolê","Namorada","Mercado","Faculdade","Saúde","Casa",
          "Roupa","Esporte","Beleza","Pet","Presente","Outros"],
  economia:["Reserva de emergência","Renda fixa","Ações e FIIs","Cripto","Previdência","Poupança","Outros"]
};

export function opcoesCat(tipo,sel){
  var l=CATS[tipo]||CATS.diario,out='<option value="">sem categoria</option>';
  for(var i=0;i<l.length;i++)out+='<option value="'+esc(l[i])+'"'+(sel===l[i]?" selected":"")+'>'+esc(l[i])+'</option>';
  return out;
}

export function rotuloTipo(t){return t==="economia"?"investimento":t}

export function descTipo(t){
  if(t==="entrada")return "Dinheiro que chega fora do salário: freela, venda, devolução. O salário já entra sozinho pela regra de recebimento.";
  if(t==="saida")return "Conta com data pra sair: aluguel, luz, parcela, assinatura. Ela encolhe o bolo do ciclo de uma vez, e <b>não</b> é medida pela sua diária.";
  if(t==="economia")return "Dinheiro que você tira de circulação pra investir ou guardar. Sai do saldo e abate a sua meta do ciclo.";
  return "O que você gastou vivendo o dia: comida, transporte, rolê. <b>É só isso que a sua diária mede.</b>";
}

export function atualizaSeg(){
  var s=$("segTipo");
  if(s)Array.prototype.forEach.call(s.children,function(b){
    b.setAttribute("aria-pressed",b.dataset.tipo===fe.novoTipo?"true":"false");
  });
  var dt=$("descTipo");
  if(dt)dt.innerHTML=descTipo(fe.novoTipo);
  var cs=$("nCat")||$("fCat");
  if(cs)cs.innerHTML=opcoesCat(fe.novoTipo,cs.value);
  var w=$("wrapCartao")||$("wrapCartaoF");
  if(w)w.style.display=(fe.novoTipo==="entrada"||fe.novoTipo==="economia")?"none":"flex";
}

export function abrirPagamento(id){
  var pg=id?(state.config.pagamentos||[]).filter(function(x){return x.id===id})[0]:null;
  fe.pagEditando=pg?pg.id:null;
  fe.pagRegra=pg?(pg.regra||"util"):"util";
  var primeiro=!(state.config.pagamentos||[]).length;
  function op(v,l){return '<option value="'+v+'"'+(fe.pagRegra===v?" selected":"")+'>'+l+'</option>'}
  abrirSheet(
    '<h3>'+(pg?"editar recebimento":(primeiro?"recebimento":"mudança de salário"))+'</h3>'+
    '<p class="sh-sub">'+(pg?"Vale de "+mesExtenso(pg.desde)+" em diante, até você cadastrar outro período."
      :"Vale do mês que você escolher em diante. Os meses anteriores continuam com o valor antigo.")+'</p>'+
    '<label class="fld"><span>Quanto você recebe</span><input id="pVal" inputmode="numeric" data-money value="'+num(pg?pg.valor:0)+'"></label>'+
    '<label class="fld"><span>Como chamar</span><input id="pDesc" type="text" value="'+esc(pg?pg.desc||"":"salário")+'" placeholder="salário"></label>'+
    '<label class="fld"><span>Quando cai</span><select id="pRegra">'+
      op("util","Nº dia útil do mês")+op("fixo","Dia fixo do mês")+op("ultimoUtil","Último dia útil")+
    '</select></label>'+
    '<div class="row2" id="pWrapN">'+
      '<label class="fld"><span id="pLblN">Qual dia útil</span><input id="pN" type="number" min="1" max="23" value="'+(pg?(+pg.n||5):5)+'"></label>'+
      '<label class="fld" id="pWrapAj"><span>Se cair em fim de semana</span><select id="pAjuste">'+
        '<option value="antecipa"'+(pg&&pg.ajuste==="adia"?"":" selected")+'>Antecipa</option>'+
        '<option value="adia"'+(pg&&pg.ajuste==="adia"?" selected":"")+'>Adia</option>'+
      '</select></label>'+
    '</div>'+
    '<label class="fld"><span>A partir do mês</span><input id="pDesde" type="month" value="'+esc(pg?pg.desde||HOJE_KEY:key(ui.atual.y,ui.atual.m))+'"></label>'+
    '<button class="btn w" id="pSalvar">'+(pg?"Salvar alterações":"Salvar recebimento")+'</button>'+
    (pg?'<button class="linkish" data-delpag="'+esc(pg.id)+'" style="color:var(--neg-deep)">apagar este período</button>':"")
  );
  atualizaRegraPag();
}

export function atualizaRegraPag(){
  var sel=$("pRegra");
  if(!sel)return;
  fe.pagRegra=sel.value;
  var w=$("pWrapN"),lbl=$("pLblN"),inp=$("pN"),aj=$("pWrapAj");
  if(fe.pagRegra==="ultimoUtil"){w.style.display="none";return}
  w.style.display="flex";
  aj.style.display=fe.pagRegra==="fixo"?"block":"none";
  if(fe.pagRegra==="fixo"){lbl.textContent="Dia do mês";inp.max=31}
  else{lbl.textContent="Qual dia útil";inp.max=23;if(+inp.value>23)inp.value=5}
}

export function abrirCores(){
  var sal=valorPagamento(ui.atual.y,ui.atual.m);
  var faixas=[[1,"tranquilo","o mês inteiro cabe"],[0.78,"confortável","dá pra respirar"],
              [0.58,"atenção","já passou da metade"],[0.38,"apertado","comece a segurar"],
              [0.22,"ruim","pouca margem pro que falta"],[0.08,"crítico","quase nada sobrando"]];
  abrirSheet(
    '<h3>o que as cores dizem</h3>'+
    '<p class="sh-sub">Cada dia é pintado por duas medidas ao mesmo tempo: <b>quanto do seu salário</b> ainda resta naquele dia, e <b>se o dinheiro cobre os dias que faltam</b> até o próximo pagamento. A cor é a média das duas.</p>'+
    '<p class="sh-sub">Por isso os dias antes do salário cair não ficam vermelhos só por serem poucos reais: o que importa ali é se eles seguram até o dinheiro entrar.</p>'+
    '<div class="escala">'+faixas.map(function(f){
      return '<div class="fx"><i style="background:'+corPorPercentual(f[0])+'"></i>'+
        '<span>'+Math.round(f[0]*100)+'%</span>'+(sal?'<small>'+money(sal*f[0])+'</small>':'')+'</div>';
    }).join("")+'</div>'+
    '<div style="margin-top:18px">'+faixas.map(function(f){
      return '<div class="item"><i class="dot" style="background:'+corPorPercentual(f[0])+'"></i>'+
        '<div class="d">'+f[1]+'<small>'+f[2]+'</small></div>'+
        '<b>'+Math.round(f[0]*100)+'%</b></div>';
    }).join("")+
    '<div class="item"><i class="dot" style="background:'+COR_NEGATIVO+'"></i>'+
      '<div class="d">negativo<small>você gastou mais do que tinha</small></div><b>&lt; 0</b></div>'+
    '</div>'+
    (sal?'<p class="sh-sub" style="margin-top:16px">Os valores ao lado usam seu salário de '+money(sal)+
      '. Se você cadastrar outro período de recebimento, eles mudam junto.</p>'
        :'<p class="sh-sub" style="margin-top:16px">Cadastre um recebimento em configurações pra as cores também medirem o seu salário, não só o mês.</p>')
  );
}

export function abrirCheckin(mk){
  var k=mk||key(ui.atual.y,ui.atual.m),pk=parseKey(k),r=calcular(k,inicialDe(k));
  var ateHoje=(k===HOJE_KEY?HOJE_DIA:r.dias);
  abrirSheet(
    '<h3>dias anotados em '+MESES[pk.m]+'</h3>'+
    '<p class="sh-sub">A bolinha ao lado de cada dia serve só pra você enxergar até onde já anotou. '+
    'Ela não entra em conta nenhuma: o saldo soma exatamente o que você lançou, nem um centavo a mais.</p>'+
    '<p class="sh-sub"><b>'+r.total.marcados+' de '+r.dias+'</b> dias de '+MESES[pk.m]+' estão marcados.</p>'+
    '<button class="btn w" data-ateaqui="'+ateHoje+'" data-mes="'+k+'" style="margin-bottom:9px">Marcar tudo até o dia '+ateHoje+'</button>'+
    '<button class="btn ghost w" data-limpardias="'+k+'">Desmarcar o mês inteiro</button>'
  );
}

export function abrirNovoFixo(id){
  var f=id?(state.config.fixos||[]).filter(function(x){return x.id===id})[0]:null;
  fe.fixoEditando=f?f.id:null;
  fe.novoTipo=f?f.tipo:"saida";
  fe.fixoRegra=f?(f.regra||"fixo"):"fixo";
  var nVal=f?(f.regra==="fixo"||!f.regra?(+f.dia||10):(+f.n||1)):10;
  function op(v,l){return '<option value="'+v+'"'+(fe.fixoRegra===v?" selected":"")+'>'+l+'</option>'}
  abrirSheet(
    '<h3>'+(f?"editar conta fixa":"conta fixa")+'</h3>'+
    '<p class="sh-sub">'+(f?"Vale de "+(f.desde?MESES[parseKey(f.desde).m]+" de "+parseKey(f.desde).y:"sempre")+" em diante."
      :"Entra sozinha todo mês, a partir de "+MESES[ui.atual.m]+" de "+ui.atual.y+". É aqui que vão aluguel, luz, internet, assinatura e o quanto você investe.")+'</p>'+
    '<div class="seg" id="segTipo">'+segb("entrada","entrada")+segb("saida","saída")+segb("economia","investimento")+'</div>'+
    '<p class="sh-sub tipoDesc" id="descTipo"></p>'+
    '<label class="fld"><span>Valor</span><input id="fVal" inputmode="numeric" data-money value="'+num(f?f.valor:0)+'"></label>'+
    '<label class="fld"><span>Categoria</span><select id="fCat">'+opcoesCat(fe.novoTipo,f?f.cat||"":"")+'</select></label>'+
    '<label class="fld"><span>Do que se trata</span><input id="fDesc" type="text" value="'+esc(f?f.desc||"":"")+'" placeholder="aluguel, Vivo, investimento…"></label>'+
    '<label class="fld"><span>Quando sai</span><select id="fRegra">'+
      op("fixo","Dia fixo do mês")+op("util","Nº dia útil do mês")+
      op("pagamento","No dia que o salário cai")+op("aposPagamento","Alguns dias depois do salário")+
      op("ultimoUtil","Último dia útil")+
    '</select></label>'+
    '<label class="fld" id="fWrapN"><span id="fLblN">Dia do mês</span><input id="fN" type="number" min="1" max="31" value="'+nVal+'"></label>'+
    '<label class="chk"><input type="checkbox" id="fEspera"'+(!f||f.espera?" checked":"")+'> nunca antes do salário</label>'+
    '<p class="sh-sub tipoDesc" style="margin-top:-6px">Com isso ligado, se o dia escolhido vier antes do dia em que o salário cai, a conta é jogada pro dia do salário. Desligue nas contas que você paga com a sobra do mês anterior.</p>'+
    '<label class="chk" id="wrapCartaoF"><input type="checkbox" id="fCartao"'+(f&&f.cartao?" checked":"")+'> cai no cartão</label>'+
    '<button class="btn w" id="fSalvar">'+(f?"Salvar alterações":"Salvar conta fixa")+'</button>'+
    (f?'<button class="linkish" data-delfixo="'+esc(f.id)+'" style="color:var(--neg-deep)">apagar esta conta fixa</button>':"")
  );
  atualizaSeg();
  atualizaRegraFixo();
}

export function atualizaRegraFixo(){
  var sel=$("fRegra");
  if(!sel)return;
  fe.fixoRegra=sel.value;
  var w=$("fWrapN"),lbl=$("fLblN"),inp=$("fN");
  if(fe.fixoRegra==="pagamento"||fe.fixoRegra==="ultimoUtil"){w.style.display="none";return}
  w.style.display="block";
  if(fe.fixoRegra==="util"){lbl.textContent="Qual dia útil";inp.max=23;if(+inp.value>23)inp.value=5}
  else if(fe.fixoRegra==="aposPagamento"){lbl.textContent="Quantos dias depois";inp.max=20;if(+inp.value>20)inp.value=2}
  else {lbl.textContent="Dia do mês";inp.max=31}
}
