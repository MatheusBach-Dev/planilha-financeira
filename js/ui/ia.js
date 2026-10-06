import {planoCiclo} from "../core/aperto.js";
import {calcular, inicialDe} from "../core/calculo.js";
import {infoCiclo} from "../core/ciclo.js";
import {HOJE_DIA, HOJE_KEY, diasNoMes, fmtDia, hoje, key, parseKey} from "../core/datas.js";
import {mesLeitura, ui} from "../core/estado.js";
import {$, DOW, MESES, esc, money} from "../core/formato.js";
import {acharLancamento, adicionarLancamento, editarLancamento, removerLancamento} from "../core/lancamentos.js";
import {iaDisponivel, perguntarIA} from "../dados/ia.js";
import {salvarMes} from "../dados/persistencia.js";
import {sessao} from "../dados/sessao.js";
import {CATS, abrirSheet} from "./folhas.js";
import {render} from "./render.js";
import {toast} from "./toast.js";

// O plano grátis do Groq tem cota diária pequena, então cada mensagem custa um pedido só:
// o resumo do mês já vai junto, e o app executa as ações e escreve a confirmação sozinho.
// Só "ver_mes" (pedir outro mês) gasta um segundo pedido.

var TIPOS=["diario","saida","entrada","economia"];
var NOME_TIPO={entrada:"entrada",saida:"saída",diario:"diário",economia:"investimento"};
// O plano grátis aceita ~8 mil tokens por minuto, e o servidor corta o contexto em 12 mil caracteres.
// A lista de lançamentos divide este espaço entre os meses; os totais sempre contam tudo.
var ESPACO_LISTA=6000;
var HISTORICO=8;

var conversa={uid:null,itens:[],enviando:false};

export function abrirIA(){
  if(!iaDisponivel())return toast("Entre com sua conta Google pra usar a assistente.");
  if(conversa.uid!==sessao.usuarioId)conversa={uid:sessao.usuarioId,itens:[],enviando:false};
  abrirSheet(
    '<h3>assistente</h3>'+
    '<p class="sh-sub">Escreva do seu jeito: “gastei 32 no almoço”, “quanto foi de mercado este mês?”, “apaga o uber de ontem”. '+
    'Ela só mexe nos lançamentos. Salário e contas fixas continuam no perfil.</p>'+
    '<div class="ia-msgs" id="iaMsgs" aria-live="polite"></div>'+
    '<div class="ia-campo">'+
      '<input id="iaTexto" type="text" maxlength="500" autocomplete="off" enterkeyhint="send" placeholder="Escreva aqui…" aria-label="Mensagem para a assistente">'+
      '<button class="btn" id="iaEnviar">Enviar</button>'+
    '</div>'+
    '<button class="linkish" id="iaLimpar">começar outra conversa</button>'
  );
  renderConversa();
  setTimeout(function(){var t=$("iaTexto");if(t)t.focus()},90);
}

export function enviarIA(){
  var t=$("iaTexto");
  if(!t||conversa.enviando)return;
  var texto=t.value.trim();
  if(!texto)return;
  if(!iaDisponivel())return toast("Entre com sua conta Google pra usar a assistente.");
  if(sessao.readOnly)return toast("Você tem acesso só de leitura aqui.");
  t.value="";
  conversa.itens.push({de:"eu",texto:texto});
  pedir(conversa,[]);
}

export function limparIA(){
  if(conversa.enviando)return;
  conversa.itens=[];
  renderConversa();
}

export function confirmarIA(i){
  var it=conversa.itens[+i];
  if(!it||it.estado!=="pendente")return;
  if(sessao.readOnly)return toast("Você tem acesso só de leitura aqui.");
  var ok=it.acao==="apagar"?removerLancamento(it.k,it.id):!!editarLancamento(it.k,it.id,it.campos);
  if(ok){it.estado="feito";salvarMes(it.k);render()}
  else{it.estado="erro";it.texto="Não achei mais "+it.sobre+"."}
  renderConversa();
}

export function cancelarIA(i){
  var it=conversa.itens[+i];
  if(!it||it.estado!=="pendente")return;
  it.estado="cancelado";
  renderConversa();
}

export function desfazerIA(i){
  var it=conversa.itens[+i];
  if(!it||it.acao!=="adicionar"||it.estado!=="feito")return;
  if(sessao.readOnly)return toast("Você tem acesso só de leitura aqui.");
  if(removerLancamento(it.k,it.id)){it.estado="desfeito";salvarMes(it.k);render()}
  else{it.estado="erro";it.texto="Não dá pra desfazer: "+it.sobre+" já foi apagado."}
  renderConversa();
}

function pedir(c,extras){
  c.enviando=true;
  renderConversa();
  var meses=mesesDoContexto(extras),refs=[];
  perguntarIA(historico(c),montarContexto(meses,refs)).then(function(resp){
    if(c!==conversa)return;
    var acoes=resp.acoes||[];
    var faltam=acoes.filter(function(a){return a.nome==="ver_mes"})
      .map(function(a){return mesValido((a.args||{}).mes)})
      .filter(function(m){return m&&meses.indexOf(m)<0});
    if(faltam.length&&!extras.length)return pedir(c,faltam);
    c.enviando=false;
    var antes=c.itens.length;
    if(resp.texto)c.itens.push({de:"ia",texto:semMarkdown(resp.texto)});
    executar(c,acoes.filter(function(a){return a.nome!=="ver_mes"}),refs);
    if(c.itens.length===antes)c.itens.push({de:"ia",texto:"Não entendi. Pode dizer de outro jeito?"});
    renderConversa();
  }).catch(function(e){
    if(c!==conversa)return;
    c.enviando=false;
    // a mensagem que falhou sai do histórico, pra IA não executar duas vezes quando a pessoa repetir
    for(var i=c.itens.length-1;i>=0;i--)if(c.itens[i].de==="eu"){c.itens[i].falhou=true;break}
    c.itens.push({de:"ia",erro:true,texto:mensagemErro(e)});
    renderConversa();
  });
}

// ————— ações pedidas pela IA —————

function executar(c,acoes,refs){
  var mexeu=false;
  acoes.forEach(function(a){
    var args=a.args||{};
    if(a.nome==="adicionar_lancamento"){
      var k=mesValido(args.mes)||HOJE_KEY,campos=lerCampos(args,null,k);
      if(campos.erro){c.itens.push({acao:"erro",estado:"erro",texto:"Não lancei: "+campos.erro});return}
      var novo=adicionarLancamento(k,campos);
      salvarMes(k);mexeu=true;
      c.itens.push({acao:"adicionar",estado:"feito",k:k,id:novo.id,sobre:descrever(novo,k)});
      return;
    }
    var ref=refs[(+args.ref||0)-1],atual=ref?acharLancamento(ref.k,ref.id):null;
    if(!atual){c.itens.push({acao:"erro",estado:"erro",texto:"Não achei o lançamento #"+(args.ref||"?")+"."});return}
    if(a.nome==="apagar_lancamento"){
      c.itens.push({acao:"apagar",estado:"pendente",k:ref.k,id:ref.id,sobre:descrever(atual,ref.k)});
      return;
    }
    var novos=lerCampos(args,atual,ref.k);
    if(novos.erro){c.itens.push({acao:"erro",estado:"erro",texto:"Não editei: "+novos.erro});return}
    c.itens.push({acao:"editar",estado:"pendente",k:ref.k,id:ref.id,campos:novos,
                  sobre:descrever(atual,ref.k),para:descrever(novos,ref.k)});
  });
  if(mexeu)render();
}

function lerCampos(a,base,k){
  base=base||{};
  var pk=parseKey(k);
  var tipo=TIPOS.indexOf(a.tipo)>=0?a.tipo:(base.tipo||"diario");
  var valor=a.valor!==undefined?numero(a.valor):+base.valor;
  if(!(valor>0))return {erro:"faltou o valor."};
  if(valor>=1e9)return {erro:"o valor ficou alto demais."};
  var dia=a.dia!==undefined?Math.round(+a.dia):(base.dia||(k===HOJE_KEY?HOJE_DIA:1));
  if(!(dia>=1&&dia<=diasNoMes(pk.y,pk.m)))return {erro:"o dia "+a.dia+" não existe em "+MESES[pk.m]+"."};
  var cat=a.categoria!==undefined?categoria(tipo,a.categoria)
    :(tipo===base.tipo?(base.cat||""):categoria(tipo,base.cat));
  var desc=a.descricao!==undefined?limpo(a.descricao):(base.desc||"");
  var cartao=(a.cartao!==undefined?a.cartao===true:!!base.cartao)&&tipo!=="entrada"&&tipo!=="economia";
  return {desc:desc||cat,dia:dia,tipo:tipo,valor:Math.round(valor*100)/100,cartao:cartao,cat:cat};
}

function numero(v){
  if(typeof v==="number")return v;
  var s=String(v||"").replace(/[^\d,.-]/g,"");
  if(s.indexOf(",")>=0)s=s.replace(/\./g,"").replace(",",".");
  return parseFloat(s);
}

function categoria(tipo,c){
  var alvo=normal(c);
  if(!alvo)return "";
  return (CATS[tipo]||[]).filter(function(x){return normal(x)===alvo})[0]||"";
}

function normal(s){return String(s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").trim().toLowerCase()}

function limpo(s){return String(s||"").replace(/\s+/g," ").trim().slice(0,60)}

function semMarkdown(s){return String(s).replace(/\*\*(.+?)\*\*/g,"$1").replace(/`([^`]+)`/g,"$1")}

function mesValido(m){
  m=String(m||"");
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(m)?m:null;
}

function descrever(l,k){
  var pk=parseKey(k);
  return "“"+(l.desc||"sem descrição")+"” · "+money(l.valor)+" · "+fmtDia(new Date(pk.y,pk.m,l.dia))+
    (pk.y!==hoje.getFullYear()?" de "+pk.y:"")+" · "+NOME_TIPO[l.tipo]+(l.cat?" · "+l.cat:"")+(l.cartao?" · no cartão":"");
}

function textoAcao(it){
  if(it.estado==="erro")return it.texto;
  if(it.acao==="adicionar")return (it.estado==="desfeito"?"Desfiz o lançamento ":"Lancei ")+it.sobre;
  if(it.acao==="apagar")
    return it.estado==="pendente"?"Apagar "+it.sobre+"?":it.estado==="feito"?"Apaguei "+it.sobre:"Não apaguei "+it.sobre;
  return it.estado==="pendente"?"Mudar "+it.sobre+" para "+it.para+"?"
    :it.estado==="feito"?"Mudei "+it.sobre+" para "+it.para:"Não mudei "+it.sobre;
}

function mensagemErro(e){
  var c=e&&e.codigo;
  if(c==="limite")return "A IA chegou no limite grátis por agora. Tente de novo em "+tempo(e.espera)+
    ". O botão + adicionar continua funcionando.";
  if(c==="sem_chave")return "A assistente ainda não está configurada: falta a chave GROQ_API_KEY na Vercel.";
  if(c==="chave_invalida")return "O Groq não aceitou a chave GROQ_API_KEY que está na Vercel. Confira se ela foi copiada inteira ou crie outra.";
  if(c==="login")return "Sua sessão expirou. Saia e entre de novo.";
  if(c==="sem_acesso")return "Sua conta não está liberada pra usar a assistente (veja IA_EMAILS na Vercel).";
  if(c==="nao_entendi")return "Não entendi direito. Pode dizer de outro jeito?";
  if(c==="grande")return "A conversa ficou grande demais pro plano grátis. Toque em “começar outra conversa” e tente de novo.";
  if(c==="sem_servidor")return "O servidor da IA não existe neste endereço ("+e.detalhe+"). Ela só funciona no site publicado na Vercel, não em prévia local.";
  if(c==="recusado")return "O Groq recusou o pedido com o modelo "+e.modelo+" ("+e.detalhe+"). Se você trocou o GROQ_MODEL na Vercel, apague essa variável ou volte para openai/gpt-oss-120b e faça um novo deploy.";
  if(c==="rede")return "Sem conexão com a internet agora. Tente de novo daqui a pouco.";
  return "Não consegui falar com a IA agora"+(c||e&&e.detalhe?" (erro: "+[c,e.detalhe].filter(Boolean).join(" · ")+")":"")+
    ". Tente de novo daqui a pouco.";
}

function tempo(s){
  s=+s||60;
  if(s<60)return "alguns segundos";
  if(s<3600){var m=Math.ceil(s/60);return m+" minuto"+(m>1?"s":"")}
  var h=Math.ceil(s/3600);return h+" hora"+(h>1?"s":"");
}

// ————— o que vai pra IA —————

function historico(c){
  var out=[];
  c.itens.forEach(function(it){
    var m=it.de==="eu"?(it.falhou?null:{role:"user",content:it.texto})
      :it.de==="ia"?(it.erro?null:{role:"assistant",content:it.texto})
      :{role:"assistant",content:textoAcao(it)};
    if(!m)return;
    var u=out[out.length-1];
    if(u&&u.role===m.role)u.content+="\n"+m.content;
    else out.push(m);
  });
  return out.slice(-HISTORICO);
}

function mesesDoContexto(extras){
  var l=[HOJE_KEY],tela=key(ui.atual.y,ui.atual.m);
  if(l.indexOf(tela)<0)l.push(tela);
  extras.forEach(function(m){if(l.indexOf(m)<0)l.push(m)});
  return l;
}

function montarContexto(meses,refs){
  var l=["hoje: "+DOW[hoje.getDay()]+", "+HOJE_DIA+" de "+MESES[hoje.getMonth()]+" de "+hoje.getFullYear()+" ("+HOJE_KEY+")",
         "mês aberto na tela: "+MESES[ui.atual.m]+" de "+ui.atual.y];
  var ciclo=resumoCiclo();
  if(ciclo)l.push(ciclo);
  l.push("categorias por tipo:");
  TIPOS.forEach(function(t){l.push("- "+t+": "+CATS[t].join(", "))});
  var espaco=Math.floor(ESPACO_LISTA/meses.length);
  meses.forEach(function(k){l.push("");l=l.concat(contextoMes(k,refs,espaco))});
  return l.join("\n");
}

function resumoCiclo(){
  try{
    var c=infoCiclo();
    if(!c)return "";
    var p=planoCiclo(c);
    return "ciclo do salário: de "+fmtDia(c.inicio)+" a "+fmtDia(c.fim)+", próximo salário em "+fmtDia(c.proxPag)+
      ", fecha o ciclo com "+n(c.saldoFim)+(p?"; hoje ainda dá pra gastar "+n(p.resta)+" (limite do dia "+n(p.diaria)+")":"");
  }catch(e){return ""}
}

function contextoMes(k,refs,espaco){
  var pk=parseKey(k),r=calcular(k,inicialDe(k)),doc=mesLeitura(k),t=r.total;
  var out=["## "+MESES[pk.m]+" de "+pk.y+" ("+k+")",
    "começou com "+n(r.inicial)+" e "+(k<HOJE_KEY?"terminou":"termina")+" com "+n(r.final),
    "totais do mês: entradas "+n(t.entrada)+", saídas "+n(t.saida)+", diário "+n(t.diario)+
      ", investido "+n(t.economia)+", no cartão "+n(t.cartao)];

  var porCat={};
  doc.lancamentos.forEach(function(x){
    var c=(x.cat||"sem categoria")+" ("+x.tipo+")";
    porCat[c]=(porCat[c]||0)+(+x.valor||0);
  });
  var cats=Object.keys(porCat).sort(function(a,b){return porCat[b]-porCat[a]});
  if(cats.length)out.push("lançamentos por categoria: "+cats.map(function(c){return c+" "+n(porCat[c])}).join("; "));

  // do fim pro começo: se não couber tudo, ficam os dias mais recentes
  var lanc=doc.lancamentos.slice().sort(function(a,b){return (+a.dia||0)-(+b.dia||0)});
  var lista=[],usado=0;
  for(var i=lanc.length-1;i>=0;i--){
    var x=lanc[i];
    var linha=" · dia "+x.dia+" · "+x.tipo+" · "+n(x.valor)+" · "+(limpo(x.desc).slice(0,40)||"sem descrição")+
      (x.cat?" · "+x.cat:"")+(x.cartao?" · cartão":"");
    if(usado+linha.length+5>espaco)break;
    usado+=linha.length+5;
    lista.unshift({id:x.id,linha:linha});
  }
  var fora=lanc.length-lista.length;
  out.push("lançamentos (#ref · dia · tipo · valor · descrição · categoria):");
  if(!lanc.length)out.push("nenhum");
  lista.forEach(function(e){
    refs.push({k:k,id:e.id});
    out.push("#"+refs.length+e.linha);
  });
  if(fora)out.push("("+fora+" lançamentos dos primeiros dias ficaram fora da lista; os totais incluem todos)");

  var auto=[];
  r.linhas.forEach(function(lin){
    lin.itens.forEach(function(it){
      if(it.fixo||it.pagamento)auto.push("dia "+lin.dia+" · "+it.tipo+" · "+n(it.valor)+" · "+limpo(it.desc)+
        (it.pagamento?" (salário)":" (conta fixa)"));
    });
  });
  if(auto.length)out=out.concat(["salário e contas fixas do mês (só leitura):"],auto);
  return out;
}

function n(v){return (Math.round((+v||0)*100)/100).toFixed(2)}

// ————— tela —————

function renderConversa(){
  var box=$("iaMsgs");
  if(!box)return;
  var h=conversa.itens.map(function(it,i){
    if(it.de==="eu")return '<div class="ia-msg eu">'+esc(it.texto)+'</div>';
    if(it.de==="ia")return '<div class="ia-msg'+(it.erro?' erro':'')+'">'+esc(it.texto)+'</div>';
    return cartaoAcao(it,i);
  }).join("");
  if(conversa.enviando)h+='<div class="ia-msg pensando" role="status" aria-label="pensando"><i></i><i></i><i></i></div>';
  box.innerHTML=h;
  box.hidden=!h;
  box.scrollTop=box.scrollHeight;
  var b=$("iaEnviar");
  if(b)b.disabled=conversa.enviando;
}

function cartaoAcao(it,i){
  var selo={feito:"feito ✓",desfeito:"desfeito",cancelado:"cancelado",erro:"não deu",pendente:"confirme"}[it.estado];
  var rodape="";
  if(it.estado==="pendente")
    rodape='<div class="ia-bts"><button class="btn'+(it.acao==="apagar"?' danger':'')+'" data-iaok="'+i+'">'+(it.acao==="apagar"?"Apagar":"Salvar mudança")+'</button>'+
      '<button class="btn ghost" data-iano="'+i+'">Cancelar</button></div>';
  else if(it.acao==="adicionar"&&it.estado==="feito")
    rodape='<button class="linkish" data-iadesfaz="'+i+'">desfazer</button>';
  return '<div class="ia-acao '+it.estado+'"><small>'+selo+'</small>'+esc(textoAcao(it))+rodape+'</div>';
}
