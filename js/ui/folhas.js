import {calcular, candidatosSubst, contasDoMes, dataPadraoPago, fixoEncerrado, historicoAte, inicialDe, mesmoFixo, planoFixo, substPadrao, textoPeriodoFixo} from "../core/calculo.js";
import {dadosDia} from "../core/ciclo.js";
import {COR_NEGATIVO, corPorPercentual} from "../core/cores.js";
import {HOJE_DIA, HOJE_ISO, HOJE_KEY, diasNoMes, fmtDia, key, mesAntes, parseKey} from "../core/datas.js";
import {mesDoc, state, ui} from "../core/estado.js";
import {$, DOW, MESES, esc, money, num} from "../core/formato.js";
import {explicaPagamento, mesExtenso, regraPagamento, valorPagamento} from "../core/pagamento.js";
import {aplicarMascara, lerMoney} from "./perfil.js";

export const fe={diaAberto:null,novoTipo:"diario",novoMes:null,novoEditando:null,
  fixoRegra:"fixo",fixoEditando:null,fixoSubst:undefined,fixoSubstSig:null,fixoSubstManual:false,pagRegra:"util",pagEditando:null};

export var scrim=$("scrim"),sheet=$("sheet"),sheetMascara=false;

export function abrirSheet(html){
  sheetMascara=true;
  sheet.innerHTML='<div class="sheet-top"><span class="grab"></span>'+
    '<button class="min" id="minSheet" aria-label="Fechar">'+
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>'+
    '<svg class="x" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>'+
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
  // linha do check-in embaixo de cada conta fixa de saída/investimento
  function acaoConta(it){
    if(!it.checkin||it.checkin==="auto")return "";
    var alvo=esc(it.mesConta+"|"+it.chave);
    if(it.checkin==="pago")
      return '<div class="conta-acao pago"><span>paga dia '+esc(fmtIso(it.pagoEm))+
        (it.mesConta!==k?" · conta de "+MESES[parseKey(it.mesConta).m]:"")+'</span>'+
        '<button class="ed" data-pagar="'+alvo+'">editar pagamento</button></div>';
    return '<div class="conta-acao"><span>'+(it.semDia?"a pagar até o fim do mês":"a pagar · vence dia "+it.venc)+
      ' · só sai da diária quando você pagar</span>'+
      '<button class="ed" data-pagar="'+alvo+'">paguei</button>'+
      '<button class="rm off" data-naopagar="'+alvo+'">não vou pagar este mês</button></div>';
  }
  var vencidas=l.vencidas.map(function(v){
    var alvo=esc(v.k+"|"+v.chave);
    return '<div class="item comconta"><i class="dot" style="background:var(--neg-deep)"></i><div class="d">'+esc(v.desc||"conta")+
      '<small class="atrasada">'+rotuloTipo(v.tipo)+' · conta fixa · venceu dia '+v.venc+' e não foi paga</small></div>'+
      '<b class="atrasada">'+money(v.valor)+'</b></div>'+
      '<div class="conta-acao atrasada"><span>não sai do saldo nem da diária até você marcar "paguei"</span>'+
      '<button class="ed" data-pagar="'+alvo+'">paguei</button>'+
      '<button class="rm off" data-naopagar="'+alvo+'">não vou pagar este mês</button></div>';
  }).join("");
  // "não vou pagar este mês": fica cinza no dia, com desfazer
  var puladas=l.puladas.map(function(p){
    return '<div class="item comconta pulada"><i class="dot" style="background:var(--line)"></i><div class="d">'+esc(p.desc||"conta")+
      '<small>'+rotuloTipo(p.tipo)+' · conta fixa · não vai pagar este mês</small></div>'+
      '<b class="pulada">'+money(p.valor)+'</b></div>'+
      '<div class="conta-acao pulada"><span>fora do saldo, da diária e do "devendo" neste mês</span>'+
      '<button class="ed" data-voltarcobrar="'+esc(p.k+"|"+p.chave)+'">desfazer</button></div>';
  }).join("");
  var extras=vencidas+puladas;
  var corpo=extras+(itens.length?itens.map(function(it){
    var cor=it.tipo==="entrada"?"var(--pos-deep)":it.tipo==="saida"?"var(--neg-deep)":it.tipo==="economia"?"var(--text-dim)":"var(--sea)";
    var acao=acaoConta(it),comCheckin=it.checkin&&it.checkin!=="auto";
    return '<div class="item'+(acao?" comconta":"")+'"><i class="dot" style="background:'+cor+'"></i><div class="d">'+
      esc(it.desc||it.tipo)+'<small>'+(it.cat?esc(it.cat)+" · ":"")+rotuloTipo(it.tipo)+(it.pagamento?" · recebimento automático":it.fixo?(" · conta fixa"+(it.adiadaDe?" · adiada do dia "+it.adiadaDe:"")):"")+(it.cartao?" · no cartão":"")+'</small></div>'+
      '<b>'+money(it.valor)+'</b>'+
      (it.pagamento
        ? '<button class="ed" data-editpag="'+esc((regraPagamento(pk.y,pk.m)||{}).id||"")+'">editar</button>'
        : it.fixo
          ? '<button class="ed" data-editfixo="'+esc(it.id.slice(4))+'">editar</button>'
          : '<button class="ed" data-editlanc="'+esc(it.id)+'" data-dia="'+dia+'" data-mes="'+k+'">editar</button>')+
      // conta com check-in não tem "remover": quem tira ela do mês é o "não vou pagar este mês"
      (comCheckin?'':'<button class="rm'+(it.fixo||it.pagamento?' off':'')+'" data-del="'+esc(it.id)+'" data-mes="'+k+'">remover</button>')+
      '</div>'+acao;
  }).join(""):(extras?"":'<p class="empty">Nada lançado neste dia.</p>'));

  abrirSheet(
    '<h3>dia '+dia+' de '+MESES[pk.m]+'</h3>'+
    '<p class="sh-sub">'+DOW[l.dow]+' · saldo de '+money(l.saldo)+
      ' · '+(l.conferido?"você já anotou este dia":"você ainda não anotou este dia")+'</p>'+
    (dd?'<div class="pl destaque '+(l.diario>dd.v?"vermelho":"ok")+'" style="border-top:0;padding-top:0">'+
       '<span>'+(l.diario>dd.v?"passou do limite do dia":"ainda dá pra gastar")+'</span>'+
       '<b>'+money(l.diario>dd.v?l.diario-dd.v:dd.v-l.diario)+'</b></div>'+
       '<p class="sh-sub" style="margin-top:6px">limite de '+money(dd.v)+
       (l.diario?' · gastou '+money(l.diario):' · nada lançado')+
       (dd.d>0.005?' · limite abatido em '+money(dd.b-dd.v)+' porque você passou nos dias anteriores':'')+
       (dd.s>0.005?' · limite aumentado em '+money(dd.s)+' porque sobrou dos dias anteriores':'')+'</p>':"")+
    corpo+
    (l.pagamento?'<p class="sh-sub tipoDesc" style="margin-top:14px">'+esc(explicaPagamento(pk.y,pk.m,dia))+'</p>':"")+
    '<div style="display:flex;gap:8px;margin-top:18px">'+
      '<button class="btn ghost" style="flex:1" data-add-dia="'+dia+'" data-mes="'+k+'">Lançar neste dia</button>'+
      '<button class="btn" style="flex:1" data-toggledia="'+dia+'" data-mes="'+k+'">'+(l.conferido?"Desmarcar dia":"Marcar como anotado")+'</button>'+
    '</div>'+
    '<button class="linkish" data-ateaqui="'+dia+'" data-mes="'+k+'">marcar todos os dias até aqui</button>'
  );
}

// "aaaa-mm-dd" → "2 de out"
export function fmtIso(iso){
  var p=String(iso||"").split("-");
  return p.length===3?fmtDia(new Date(+p[0],+p[1]-1,+p[2])):"";
}

// janela do "paguei": dia e valor já vêm preenchidos e dá pra trocar os dois
export function abrirPagarConta(k,chave){
  var c=contasDoMes(k).filter(function(x){return x.chave===chave})[0];
  if(!c)return;
  fe.pagarConta={k:k,chave:chave,volta:fe.diaAberto};
  var pk=parseKey(k),atrasou=!c.pago&&c.vencIso<HOJE_ISO;
  abrirSheet(
    '<h3>'+(c.pago?"pagamento de ":"paguei: ")+esc(c.desc||"conta")+'</h3>'+
    '<p class="sh-sub">'+rotuloTipo(c.tipo)+' · conta fixa de '+MESES[pk.m]+' · '+(c.semDia?"até o fim do mês":"vence dia "+c.venc)+' · '+money(c.valor)+'</p>'+
    '<div class="row2">'+
      '<label class="fld"><span>Dia do pagamento</span><input id="pgData" type="date" min="'+k+'-01" max="'+HOJE_ISO+'" value="'+
        esc(c.pago?c.pago.data:dataPadraoPago(c))+'"></label>'+
      '<label class="fld"><span>Valor pago</span><input id="pgVal" inputmode="numeric" data-money value="'+num(c.pago?c.pago.valor:c.valor)+'"></label>'+
    '</div>'+
    '<p class="sh-sub tipoDesc" style="margin-top:-6px">'+
      (c.pago?"Corrija o dia ou o valor se precisar.":atrasou
        ?"O dia já vem no vencimento, porque você está marcando depois dele. Se pagou atrasado, troque o dia."
        :"O dia já vem em hoje. Se pagou em outro dia, troque.")+
      ' Se pagou um valor diferente (juros, conta que variou), corrija aqui: muda só neste mês.</p>'+
    '<button class="btn w" id="pgSalvar">'+(c.pago?"Salvar alterações":"Confirmar pagamento")+'</button>'+
    (c.pago?'<button class="linkish" data-despagar="'+esc(k+"|"+chave)+'" style="color:var(--neg-deep)">desfazer pagamento</button>':"")
  );
}

export function abrirNovo(dia,mk,editId){
  var k=mk||key(ui.atual.y,ui.atual.m),pk=parseKey(k);
  fe.novoMes=k;
  var ed=editId?(mesDoc(k).lancamentos.filter(function(x){return x.id===editId})[0]||null):null;
  fe.novoEditando=ed?ed.id:null;
  // lançamento novo sempre começa em "diária", o caso mais comum (gasto que a pessoa escolhe fazer)
  fe.novoTipo=ed?ed.tipo:"diario";
  var d=(ed?ed.dia:dia)||(k===HOJE_KEY?HOJE_DIA:1);
  if(["entrada","saida","diario","economia"].indexOf(fe.novoTipo)<0)fe.novoTipo="diario";
  abrirSheet(
    '<h3>'+(ed?"editar lançamento":"novo lançamento")+'</h3><p class="sh-sub">em '+MESES[pk.m]+' de '+pk.y+'</p>'+
    '<div class="seg" id="segTipo">'+segb("diario","diária")+segb("saida","conta")+segb("entrada","entrada")+segb("economia","investimento")+'</div>'+
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

// nomes na tela; por dentro os tipos continuam "saida" e "diario"
export function rotuloTipo(t){return {economia:"investimento",saida:"conta",diario:"diária"}[t]||t}

export function descTipo(t){
  if(t==="entrada")return "Dinheiro que chega fora do salário: freela, venda, devolução. O salário já entra sozinho pela regra de recebimento.";
  if(t==="saida")return "O que tem <b>data pra pagar</b>: aluguel, luz, boleto, parcela, assinatura. É dividida por todos os dias do ciclo e <b>não</b> sai da diária de hoje. Gasto que você escolheu fazer (almoço, Pix, compra na Shopee) é diária.";
  if(t==="economia")return "Dinheiro que você tira de circulação pra investir ou guardar. Sai do saldo e abate a sua meta do ciclo.";
  return "Tudo que você <b>escolhe gastar</b>, todo dia ou de vez em quando: almoço, Pix, hortifruti da semana, uma compra na Shopee. Sai do limite de hoje; se passar, o dia fica vermelho e o excesso sai dos próximos dias.";
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
  fe.fixoSubst=undefined;fe.fixoSubstSig=null;fe.fixoSubstManual=false;
  var apagar="";
  if(f){
    var hist=historicoAte(f);
    if(!hist)apagar='<button class="linkish" data-delfixo="'+esc(f.id)+'" style="color:var(--neg-deep)">apagar esta conta fixa</button>';
    else{
      if(!fixoEncerrado(f))apagar='<button class="linkish" data-delfixo="'+esc(f.id)+'" style="color:var(--neg-deep)">parar a partir de hoje</button>'+
        '<p class="sh-sub tipoDesc" style="margin-top:0">Ela sai dos dias de hoje em diante. Até '+mesExtenso(hist)+' continua no histórico, do jeito que aconteceu.</p>';
      apagar+='<button class="linkish" data-apagarfixo="'+esc(f.id)+'" style="color:var(--text-dim)">apagar de todos os meses, inclusive os que já passaram</button>';
    }
  }
  function op(v,l){return '<option value="'+v+'"'+(fe.fixoRegra===v?" selected":"")+'>'+l+'</option>'}
  abrirSheet(
    '<h3>'+(f?"editar conta fixa":"conta fixa")+'</h3>'+
    '<p class="sh-sub">'+(f?"Vale "+textoPeriodoFixo(f)+"."
      :"Entra sozinha todo mês, a partir do mês que você escolher. É aqui que vão aluguel, luz, internet, assinatura e o quanto você investe.")+'</p>'+
    '<div class="seg" id="segTipo">'+segb("saida","conta")+segb("entrada","entrada")+segb("economia","investimento")+'</div>'+
    '<p class="sh-sub tipoDesc" id="descTipo"></p>'+
    '<label class="fld"><span>Valor</span><input id="fVal" inputmode="numeric" data-money value="'+num(f?f.valor:0)+'"></label>'+
    '<label class="fld"><span>Categoria</span><select id="fCat">'+opcoesCat(fe.novoTipo,f?f.cat||"":"")+'</select></label>'+
    '<label class="fld"><span>Do que se trata</span><input id="fDesc" type="text" value="'+esc(f?f.desc||"":"")+'" placeholder="aluguel, Vivo, investimento…"></label>'+
    '<label class="fld"><span>Quando sai</span><select id="fRegra">'+
      op("fixo","Dia fixo do mês")+op("util","Nº dia útil do mês")+
      op("pagamento","No dia que o salário cai")+op("aposPagamento","Alguns dias depois do salário")+
      op("ultimoUtil","Último dia útil")+op("mes","Todo mês, sem dia certo")+
    '</select></label>'+
    '<label class="fld" id="fWrapN"><span id="fLblN">Dia do mês</span><input id="fN" type="number" min="1" max="31" value="'+nVal+'"></label>'+
    '<label class="chk"><input type="checkbox" id="fEspera"'+(!f||f.espera?" checked":"")+'> nunca antes do salário</label>'+
    '<p class="sh-sub tipoDesc" style="margin-top:-6px">Com isso ligado, se o dia escolhido vier antes do dia em que o salário cai, a conta é jogada pro dia do salário. Desligue nas contas que você paga com a sobra do mês anterior.</p>'+
    '<label class="chk" id="wrapCartaoF"><input type="checkbox" id="fCartao"'+(f&&f.cartao?" checked":"")+'> cai no cartão</label>'+
    '<label class="fld"><span>A partir do mês</span><input id="fDesde" type="month" value="'+esc(f?f.desde||"":key(ui.atual.y,ui.atual.m))+'"></label>'+
    '<div id="fWrapSubst"></div>'+
    '<p class="sh-sub tipoDesc" id="fAvisoDesde" style="margin-top:-6px"></p>'+
    '<button class="btn w" id="fSalvar">'+(f?"Salvar alterações":"Salvar conta fixa")+'</button>'+
    apagar
  );
  atualizaSeg();
  atualizaRegraFixo();
  atualizaAvisoFixo();
}

export function lerFormFixo(antigo){
  var n=Math.max(1,+($("fN")||{value:1}).value||1);
  var cat=$("fCat")?$("fCat").value:"";
  return {
    desc:$("fDesc").value.trim()||cat,
    cat:cat,
    regra:fe.fixoRegra,
    dia:fe.fixoRegra==="fixo"?Math.min(31,n):(antigo?antigo.dia:1),
    n:n,
    espera:$("fEspera").checked,
    tipo:fe.novoTipo,valor:lerMoney($("fVal")),
    cartao:$("fCartao").checked&&fe.novoTipo==="saida",
    desde:$("fDesde").value||(antigo?antigo.desde:key(ui.atual.y,ui.atual.m))
  };
}

var NOME_TIPO={entrada:"entrada",saida:"contas",economia:"investimento",diario:"diária"};

function nomeEntreAspas(f){return "“"+(f.desc||"sem nome")+"” ("+money(f.valor)+")"}

export function atualizaAvisoFixo(){
  var av=$("fAvisoDesde");
  if(!av)return;
  var lista=state.config.fixos||[];
  var antigo=fe.fixoEditando?lista.filter(function(x){return x.id===fe.fixoEditando})[0]||null:null;
  var novo=lerFormFixo(antigo),msgs=[];
  var cands=candidatosSubst(novo,antigo,lista),subst=renderSubst(novo,antigo,cands);
  if(antigo){
    var p=planoFixo(antigo,novo,lista);
    if(p.erro)msgs.push(p.erro);
    else if(p.acao==="divide")
      msgs.push("A mudança vale de "+mesExtenso(novo.desde)+" em diante. Até "+mesExtenso(mesAntes(novo.desde))+" fica como estava.");
    else if(novo.desde!==antigo.desde)
      msgs.push("A conta passa a valer a partir de "+mesExtenso(novo.desde)+
        (p.anterior?", e o período anterior vai até "+mesExtenso(mesAntes(novo.desde)):"")+".");
    else if(!mesmoFixo(antigo,novo)&&(novo.desde||"")<HOJE_KEY)
      msgs.push("Assim muda também os meses que já passaram. Pra guardar o histórico, escolha aqui o mês em que a mudança começa.");
    else if(!cands.length)
      msgs.push("Vai investir ou pagar outro valor a partir de um mês? Troque o valor e escolha aqui o mês da mudança. Os meses antes dele continuam como estão.");
  }
  if(cands.length){
    var alvo=cands.filter(function(x){return x.id===subst})[0];
    if(alvo)msgs.push(nomeEntreAspas(alvo)+" para em "+mesExtenso(mesAntes(novo.desde))+". De "+mesExtenso(novo.desde)+" em diante vale só esta.");
    else{
      var tot=cands.reduce(function(s,x){return s+(+x.valor||0)},+novo.valor||0);
      msgs.push("Soma com "+cands.map(nomeEntreAspas).join(", ")+": a partir de "+mesExtenso(novo.desde)+
        " são "+money(tot)+" por mês em "+(NOME_TIPO[novo.tipo]||novo.tipo)+".");
    }
  }
  av.textContent=msgs.join(" ");
  av.style.display=msgs.length?"":"none";
}

function renderSubst(novo,antigo,cands){
  var w=$("fWrapSubst"),s=$("fSubst");
  if(s&&s.value!==fe.fixoSubst){fe.fixoSubst=s.value;fe.fixoSubstManual=true}
  if(!cands.length){w.innerHTML="";fe.fixoSubstSig=null;return ""}
  var ids=cands.map(function(x){return x.id});
  var sel=fe.fixoSubst;
  if(!fe.fixoSubstManual||sel===undefined||(sel&&ids.indexOf(sel)<0))sel=antigo?"":substPadrao(novo,cands);
  var sig=cands.map(function(x){return x.id+":"+x.valor+":"+x.desc}).join("|");
  if(s&&sig===fe.fixoSubstSig){if(s.value!==sel)s.value=sel}
  else{
    fe.fixoSubstSig=sig;
    w.innerHTML='<label class="fld"><span>Substitui outra conta?</span><select id="fSubst">'+
      '<option value="">Não, soma com '+(cands.length>1?"as outras":"a que já existe")+'</option>'+
      cands.map(function(x){
        return '<option value="'+esc(x.id)+'"'+(sel===x.id?" selected":"")+'>Sim, entra no lugar de '+esc(nomeEntreAspas(x))+'</option>';
      }).join("")+
    '</select></label>';
  }
  fe.fixoSubst=sel;
  return sel;
}

export function atualizaRegraFixo(){
  var sel=$("fRegra");
  if(!sel)return;
  fe.fixoRegra=sel.value;
  var w=$("fWrapN"),lbl=$("fLblN"),inp=$("fN");
  if(fe.fixoRegra==="pagamento"||fe.fixoRegra==="ultimoUtil"||fe.fixoRegra==="mes"){w.style.display="none";return}
  w.style.display="block";
  if(fe.fixoRegra==="util"){lbl.textContent="Qual dia útil";inp.max=23;if(+inp.value>23)inp.value=5}
  else if(fe.fixoRegra==="aposPagamento"){lbl.textContent="Quantos dias depois";inp.max=20;if(+inp.value>20)inp.value=2}
  else {lbl.textContent="Dia do mês";inp.max=31}
}
