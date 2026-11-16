import {DOW, $, esc, money} from "../core/formato.js";
import {HOJE_ISO, hoje, isoData, maisDias} from "../core/datas.js";
import {bancos, chaveRegra, desligarBancos, ignorarPendente, lancarPendente, ligarBancos, ligarPendente, parecido,
        pendentes, sincronizarBancos, sugestao, voltarPendente} from "../dados/bancos.js";
import {sessao} from "../dados/sessao.js";
import {bancosEmTeste} from "./bancos.js";
import {opcoesCat, rotuloTipo} from "./folhas.js";
import {render} from "./render.js";
import {toast} from "./toast.js";

// Movimentações que chegaram do banco e esperam a pessoa dizer o que são.
// Cartão no topo da aba saldos + seção "bancos" no perfil.

var tela={escolha:{},todos:false,ignoradas:false,ultimoHtml:""};
var MOSTRAR=6;

function escolhaDe(p){
  var e=tela.escolha[p.id];
  if(!e){var s=sugestao(p);e=tela.escolha[p.id]={tipo:s.tipo,desc:s.desc,cat:s.cat,aprendida:!!s.aprendida}}
  return e;
}

function dataCurta(iso){
  var p=String(iso).split("-"),dt=new Date(+p[0],+p[1]-1,+p[2]);
  return DOW[dt.getDay()]+" "+p[2]+"/"+p[1];
}

function horaDe(ms){
  if(!ms)return "";
  var d=new Date(ms),hj=new Date();
  var h=d.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});
  return d.toDateString()===hj.toDateString()?"hoje às "+h:d.toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"})+" às "+h;
}

// conexão com erro, pedindo ação ou parada há mais de 3 dias
function avisosConexao(){
  var c=bancos.cfg,out=[];
  ((c&&c.conexoes)||[]).forEach(function(x){
    var nome=(x.bancos&&x.bancos.length?x.bancos.join(" e "):"uma conexão");
    var velha=x.atualizadoEm&&(Date.now()-new Date(x.atualizadoEm).getTime()>3*86400000);
    if(x.erro||(x.status&&x.status!=="UPDATED"&&x.status!=="UPDATING"))
      out.push("A conexão com "+esc(nome)+" está com problema"+(x.erro?" ("+esc(x.erro)+")":"")+". Abra o Meu Pluggy e reconecte.");
    else if(velha)out.push(esc(nome)+" não atualiza desde "+new Date(x.atualizadoEm).toLocaleDateString("pt-BR")+". Confira no Meu Pluggy.");
  });
  return out;
}

function htmlItem(p){
  var e=escolhaDe(p),ent=p.s==="entrada",par=parecido(p);
  var tipos=ent?["entrada"]:["diario","saida","economia"];
  var acoes;
  if(par&&par.lanc){
    acoes='<p class="rv-aviso">Você já lançou “'+esc(par.lanc.desc||"sem nome")+'” dia '+par.lanc.dia+' com esse valor.</p>'+
      '<div class="rv-acoes"><button class="btn" data-rvligar="'+esc(p.id+"|"+par.k+"|"+par.lanc.id)+'">é o mesmo</button>'+
      '<button class="btn ghost" data-rvlancar="'+esc(p.id)+'">é outro, lançar</button></div>';
  }else if(par&&par.salario){
    acoes='<p class="rv-aviso">Parece o seu salário, que já entra sozinho pela regra de recebimento.</p>'+
      '<div class="rv-acoes"><button class="btn" data-rvignorar="'+esc(p.id)+'" data-mot="salário">é o salário</button>'+
      '<button class="btn ghost" data-rvlancar="'+esc(p.id)+'">lançar mesmo assim</button></div>';
  }else{
    acoes='<div class="rv-acoes"><button class="btn" data-rvlancar="'+esc(p.id)+'">lançar</button>'+
      '<button class="btn ghost" data-rvignorar="'+esc(p.id)+'">ignorar</button></div>';
  }
  return '<div class="rv-item'+(par?' duvida':'')+'">'+
    '<div class="rv-linha"><input type="text" class="rv-desc" data-rvdesc="'+esc(p.id)+'" value="'+esc(e.desc)+'" maxlength="60" aria-label="Nome do lançamento">'+
      '<b class="rv-valor '+(ent?'entrada':'saida')+'">'+(ent?"+":"−")+money(p.v)+'</b></div>'+
    '<small class="rv-info">'+dataCurta(p.d)+' · '+esc(p.b||"banco")+' · '+esc(p.t||p.e||"")+
      (e.aprendida?' · <span class="rv-aprendi">como da última vez</span>':'')+'</small>'+
    '<div class="rv-escolha">'+
      (tipos.length>1?'<div class="seg rv-tipos" role="group" aria-label="Tipo">'+tipos.map(function(t){
        return '<button type="button" data-rvtipo="'+esc(p.id+"|"+t)+'" aria-pressed="'+(e.tipo===t)+'">'+rotuloTipo(t)+'</button>';
      }).join("")+'</div>':'')+
      '<select class="rv-cat" data-rvcat="'+esc(p.id)+'" aria-label="Categoria">'+opcoesCat(e.tipo,e.cat)+'</select>'+
    '</div>'+acoes+'</div>';
}

function htmlIgnoradas(lista){
  if(!lista.length)return '<p class="hint">Nenhuma ignorada.</p>';
  return lista.slice(0,40).map(function(p){
    return '<div class="fixo rv-ign"><div class="d">'+esc(sugestao(p).desc)+'<small>'+dataCurta(p.d)+' · '+esc(p.b||"banco")+
      (p.mot?' · '+esc(p.mot):'')+'</small></div><b>'+(p.s==="entrada"?"+":"−")+money(p.v)+'</b>'+
      '<button class="ed" data-rvvoltar="'+esc(p.id)+'">trazer de volta</button></div>';
  }).join("");
}

function htmlCartao(){
  var c=bancos.cfg;
  if(!sessao.user||!c||!c.ativo)return "";
  var novos=pendentes("novo"),ign=pendentes("ignorado"),avisos=avisosConexao();
  if(bancos.erro)avisos.unshift(esc(bancos.erro));
  if(!novos.length&&!avisos.length&&!tela.ignoradas)return "";
  var lista=tela.todos?novos:novos.slice(0,MOSTRAR);
  var semDuvida=novos.filter(function(p){return !parecido(p)});
  var h='<section class="revisar" aria-label="Movimentações do banco pra revisar">'+
    '<div class="rv-topo"><div><h2>do banco</h2><p>'+
      (novos.length?novos.length+" pra revisar":"tudo revisado")+
      (c.buscaEm?" · buscado "+horaDe(c.buscaEm):"")+'</p></div>'+
      '<button class="ed" id="rvBuscar"'+(bancos.buscando?' disabled':'')+'>'+(bancos.buscando?"buscando…":"buscar agora")+'</button></div>'+
    avisos.map(function(a){return '<div class="note alerta rv-nota">'+a+'</div>'}).join("")+
    lista.map(htmlItem).join("");
  if(novos.length>lista.length)h+='<button class="linkish" id="rvTodos">mostrar mais '+(novos.length-lista.length)+'</button>';
  h+='<div class="rv-pe">';
  if(semDuvida.length>1)h+='<button class="btn ghost" id="rvLancarTodos">lançar as '+semDuvida.length+' sem dúvida como estão</button>';
  if(ign.length||tela.ignoradas)h+='<button class="linkish" id="rvIgnoradas">'+(tela.ignoradas?"esconder ignoradas":"ver ignoradas ("+ign.length+")")+'</button>';
  h+='</div>';
  if(tela.ignoradas)h+='<div class="rv-ignoradas">'+htmlIgnoradas(ign)+'</div>';
  return h+'</section>';
}

export function renderRevisar(){
  var el=$("revisar");
  if(!el)return;
  var h=htmlCartao();
  if(h===tela.ultimoHtml)return;      // não redesenha à toa: não perde o que está sendo digitado
  var foco=document.activeElement,fid=foco&&foco.dataset?foco.dataset.rvdesc:null,pos=fid?foco.selectionStart:0;
  tela.ultimoHtml=h;
  el.innerHTML=h;
  if(fid){
    var volta=el.querySelector('[data-rvdesc="'+CSS.escape(fid)+'"]');
    if(volta){volta.focus({preventScroll:true});try{volta.setSelectionRange(pos,pos)}catch(e){}}
  }
}

// ————— perfil —————

var SITUACAO={UPDATED:"ok",UPDATING:"atualizando",LOGIN_ERROR:"reconectar",OUTDATED:"desatualizada",
  WAITING_USER_INPUT:"esperando você",WAITING_USER_ACTION:"esperando você"};

function padraoDesde(){var d=maisDias(hoje,-7);return isoData(d.getFullYear(),d.getMonth(),d.getDate())}

export function secaoBancos(){
  var c=bancos.cfg;
  if(!sessao.user||!bancos.carregado)return "";
  if(!(c&&c.ativo)&&!bancosEmTeste())return "";
  var h='<section class="bloco"><h2>bancos</h2>';
  if(bancos.erroRegra){
    return h+'<div class="note alerta">O Firestore não deixou ler config/bancos. Atualize a regra no console do Firebase (está em docs/bancos.md).</div></section>';
  }
  if(!(c&&c.ativo)){
    return h+'<p class="hint">Liga a revisão automática: o que entrar ou sair do Itaú, do Inter e do Mercado Pago aparece no topo da aba saldos e você aprova ou ignora. Nada é lançado sem você tocar em “lançar”. Pix entre as suas contas é ignorado sozinho.</p>'+
      '<label class="fld"><span>Trazer movimentações a partir de</span><input type="date" id="rvDesde" max="'+HOJE_ISO+'" value="'+esc((c&&c.desde)||padraoDesde())+'"></label>'+
      '<p class="hint" style="margin-top:-6px">O que já estiver lançado com o mesmo valor e dia aparece com “é o mesmo”, pra não contar duas vezes.</p>'+
      (bancos.erro?'<div class="note alerta" style="margin:0 0 12px">'+esc(bancos.erro)+'</div>':'')+
      '<button class="btn w" id="rvLigar"'+(bancos.buscando?' disabled':'')+'>'+(bancos.buscando?"Buscando…":"Ligar revisão automática")+'</button></section>';
  }
  var nov=pendentes("novo").length;
  h+='<p class="hint">Revisão automática ligada desde '+esc(String(c.desde||"").split("-").reverse().join("/"))+'. '+
    'O app busca no banco quando você abre (no máximo a cada 30 min); o Meu Pluggy atualiza uma vez por dia.</p>';
  ((c.conexoes)||[]).forEach(function(x){
    h+='<div class="fixo"><div class="d">'+esc((x.bancos||[]).join(", ")||"conexão")+
      '<small>'+(x.erro?esc(x.erro):"atualizado "+(x.atualizadoEm?horaDe(new Date(x.atualizadoEm).getTime()):"—"))+'</small></div>'+
      '<b>'+esc(SITUACAO[x.status]||x.status||"?")+'</b></div>';
  });
  h+='<p class="hint" style="margin-top:12px">'+(nov?nov+" pra revisar na aba saldos.":"Nada pra revisar.")+
    (c.buscaEm?" Última busca "+horaDe(c.buscaEm)+".":"")+'</p>'+
    '<button class="btn ghost w" id="rvBuscar"'+(bancos.buscando?' disabled':'')+'>'+(bancos.buscando?"Buscando…":"Buscar agora")+'</button>'+
    '<button class="linkish" id="rvDesligar">desligar revisão automática</button>';
  return h+'</section>';
}

// ————— eventos —————

function lerEscolha(id){
  var e=tela.escolha[id]||{};
  var inp=document.querySelector('[data-rvdesc="'+CSS.escape(id)+'"]');
  if(inp)e.desc=inp.value;
  return e;
}

// depois de lançar, as outras da mesma loja passam a sugerir o que a pessoa acabou de escolher
function esquecerSugestoes(id){
  var p=bancos.cfg&&bancos.cfg.pend&&bancos.cfg.pend[id];
  if(!p)return;
  var ch=chaveRegra(p);
  pendentes("novo").forEach(function(x){var e=tela.escolha[x.id];if(chaveRegra(x)===ch&&!(e&&e.editada))delete tela.escolha[x.id]});
}

function lancar(id){
  var r=lancarPendente(id,lerEscolha(id));
  if(r.ok)esquecerSugestoes(id);
  return r;
}

function depois(r){
  if(!r.ok)return toast(r.msg);
  render();toast(r.msg);
  if(r.gravado)r.gravado.catch(function(e){
    toast(e&&e.code==="permission-denied"?"Lancei, mas o Firestore não deixou marcar como revisada. Confira a regra.":"Não deu pra marcar como revisada. Tente de novo.");
  });
}

function buscar(){
  sincronizarBancos(true,render).then(function(r){
    if(r.ok)toast(r.novos?r.novos+(r.novos===1?" nova movimentação.":" novas movimentações."):"Nada novo no banco.");
    else if(r.msg)toast(r.msg);
  });
}

export function cliqueRevisar(e){
  var t=e.target;
  if(!t.closest)return false;
  if(t.closest("#rvBuscar")){buscar();return true}
  if(t.closest("#rvTodos")){tela.todos=true;render();return true}
  if(t.closest("#rvIgnoradas")){tela.ignoradas=!tela.ignoradas;render();return true}
  if(t.closest("#rvLigar")){
    var d=$("rvDesde");
    ligarBancos(d?d.value:"",render).then(function(r){toast(r.msg)});
    return true;
  }
  if(t.closest("#rvDesligar")){
    desligarBancos().then(function(r){toast(r.msg);render()});
    return true;
  }
  var tp=t.closest("[data-rvtipo]");
  if(tp){
    var a=tp.dataset.rvtipo.split("|"),es=lerEscolha(a[0]);
    if(es.tipo!==a[1]){es.tipo=a[1];es.cat="";es.aprendida=false;es.editada=true}
    render();return true;
  }
  var la=t.closest("[data-rvlancar]");
  if(la){depois(lancar(la.dataset.rvlancar));return true}
  var ig=t.closest("[data-rvignorar]");
  if(ig){depois(ignorarPendente(ig.dataset.rvignorar,ig.dataset.mot||""));return true}
  var lg=t.closest("[data-rvligar]");
  if(lg){var b=lg.dataset.rvligar.split("|");depois(ligarPendente(b[0],b[1],b[2]));return true}
  var vt=t.closest("[data-rvvoltar]");
  if(vt){depois(voltarPendente(vt.dataset.rvvoltar));return true}
  if(t.closest("#rvLancarTodos")){
    var lista=pendentes("novo").filter(function(p){return !parecido(p)}),n=0,ultimo=null;
    lista.forEach(function(p){
      escolhaDe(p);
      var r=lancar(p.id);
      if(r.ok){n++;ultimo=r}
    });
    if(ultimo)depois({ok:true,msg:n+(n===1?" lançada.":" lançadas."),gravado:ultimo.gravado});
    return true;
  }
  return false;
}

// nome e categoria escolhidos ficam guardados até lançar, mesmo se a tela redesenhar
export function mudancaRevisar(e){
  var t=e.target;
  if(!t||!t.dataset)return false;
  if(t.dataset.rvdesc!==undefined){var es=tela.escolha[t.dataset.rvdesc];if(es){es.desc=t.value;es.editada=true}return true}
  if(t.dataset.rvcat!==undefined){var ec=tela.escolha[t.dataset.rvcat];if(ec){ec.cat=t.value;ec.editada=true}return true}
  return false;
}
