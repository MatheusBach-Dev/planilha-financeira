import {esc, money} from "../core/formato.js";
import {testarBancos} from "../dados/bancos.js";
import {render} from "./render.js";

// Tela de teste da ligação com os bancos (fase a). Só aparece no perfil quando o endereço tem
// ?bancos, e só mostra o que o servidor leu da Pluggy: não lança nem grava nada.

var estado={carregando:false,dias:7,lista:null,webhook:null,erro:null};

export function bancosEmTeste(){return /[?&]bancos\b/.test(location.search)}

var ERROS={
  login:"Entre na sua conta pra testar.",
  sem_acesso:"Esta parte é só da conta dona das conexões.",
  sem_servidor:"O servidor não respondeu. Esse teste só funciona no site publicado na Vercel.",
  rede:"Sem conexão agora. Tente de novo.",
  login_indisponivel:"Não deu pra conferir o login agora. Tente de novo."
};

function textoErro(d){
  if(d.erro==="sem_config"){
    return "Falta configurar na Vercel: "+(d.falta||[]).join(", ")+"."+
      (d.seuUid?" O valor de DONO_UID pra esta conta é "+d.seuUid+".":"");
  }
  if(d.erro==="pluggy")return "A Pluggy recusou o pedido: "+(d.detalhe||"sem detalhe")+".";
  return ERROS[d.erro]||"Não deu certo ("+(d.erro||"erro")+").";
}

function dataHora(iso){
  if(!iso)return "nunca";
  var d=new Date(iso);
  return isNaN(d)?String(iso):d.toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"});
}

function diaBR(iso){var p=String(iso||"").split("-");return p.length===3?p[2]+"/"+p[1]:""}

function htmlConta(c){
  var h='<div class="fixo"><div class="d">'+esc(c.nome||"conta")+(c.final?" · final "+esc(c.final):"")+
    '<small>'+esc([c.tipo,c.subtipo].filter(Boolean).join(" · "))+' · '+c.total+' transaç'+(c.total===1?"ão":"ões")+' no período'+
    (c.total>c.transacoes.length?" (mostrando "+c.transacoes.length+")":"")+'</small></div><b>'+money(c.saldo)+'</b></div>';
  if(c.erro)return h+'<p class="hint">Não deu pra ler as transações: '+esc(c.erro)+'</p>';
  return h+c.transacoes.map(function(t){
    return '<div class="fixo"><div class="d">'+esc(t.descricao||t.descricaoBanco||"sem descrição")+
      '<small>'+diaBR(t.data)+' · '+(t.sentido==="entrada"?"entrada":"saída")+
      (t.status?" · "+esc(t.status==="PENDING"?"pendente":t.status==="POSTED"?"confirmada":t.status):"")+
      (t.estabelecimento?" · "+esc(t.estabelecimento):"")+(t.categoria?" · "+esc(t.categoria):"")+
      (t.meio?" · "+esc(t.meio):"")+'</small></div><b>'+(t.sentido==="entrada"?"+":"−")+money(t.valor)+'</b></div>';
  }).join("");
}

function htmlItem(it){
  var h='<h3 style="margin:22px 0 4px">'+esc(it.banco||"conexão")+'</h3>'+
    '<p class="hint">'+(it.status?"situação: "+esc(it.status)+(it.execucao?" ("+esc(it.execucao)+")":"")+" · ":"")+
    'atualizado em '+dataHora(it.atualizadoEm)+
    (it.consentimentoExpira?' · autorização vale até '+dataHora(it.consentimentoExpira):' · sem data de validade informada')+
    '<br>id da conexão: '+esc(it.id)+'</p>';
  if(it.erro)h+='<p class="hint" style="color:var(--neg-deep)">'+esc(it.erro)+'</p>';
  if(!it.contas.length&&!it.erro)h+='<p class="empty">Nenhuma conta nesta conexão.</p>';
  return h+it.contas.map(htmlConta).join("");
}

function htmlWebhook(w){
  var meus=w.webhooks.filter(function(x){return x.daqui&&!x.desligadoEm});
  return '<div class="note">'+(meus.length
      ?'Aviso registrado na Pluggy pra <b>'+esc(w.endereco)+'</b> desde '+dataHora(meus[0].criadoEm)+
        '. Quando o Meu Pluggy atualizar suas contas (uma vez por dia), veja no painel da Pluggy, em Webhooks, se o aviso foi entregue.'
      :'Nenhum aviso registrado pra este site ainda.')+
    (w.webhooks.length>meus.length?' Outros registrados na Pluggy: '+w.webhooks.filter(function(x){return !x.daqui||x.desligadoEm})
      .map(function(x){return esc(x.url)+(x.desligadoEm?" (desligado)":"")}).join(", ")+'.':'')+'</div>';
}

export function secaoBancosTeste(){
  if(!bancosEmTeste())return "";
  var h='<section class="bloco"><h2>bancos (teste)</h2>'+
    '<p class="hint">Prova de conceito: mostra o que a Pluggy devolve das suas conexões. Só leitura, nada é lançado nem gravado.</p>'+
    '<div class="row2"><label class="fld"><span>Últimos</span><select id="bancosDias">'+[3,7,15,31].map(function(n){
      return '<option value="'+n+'"'+(n===estado.dias?' selected':'')+'>'+n+' dias</option>';
    }).join("")+'</select></label></div>'+
    '<button class="btn ghost w" id="bancosListar"'+(estado.carregando?' disabled':'')+'>'+
      (estado.carregando?'Buscando…':'Listar transações dos bancos')+'</button>'+
    '<button class="btn ghost w" id="bancosWebhook" style="margin-top:8px"'+(estado.carregando?' disabled':'')+'>Ver aviso automático (webhook)</button>'+
    '<button class="btn ghost w" id="bancosWebhookRegistrar" style="margin-top:8px"'+(estado.carregando?' disabled':'')+'>Registrar aviso automático</button>';
  if(estado.erro)h+='<div class="note" style="margin-top:14px">'+esc(estado.erro)+'</div>';
  if(estado.webhook)h+='<div style="margin-top:14px">'+htmlWebhook(estado.webhook)+'</div>';
  if(estado.lista){
    h+='<p class="hint" style="margin-top:18px">De '+diaBR(estado.lista.de)+' a '+diaBR(estado.lista.ate)+'.</p>'+
      (estado.lista.itens.length?estado.lista.itens.map(htmlItem).join(""):'<p class="empty">Nenhuma conexão configurada.</p>');
  }
  return h+'</section>';
}

function pedir(corpo,campo){
  estado.carregando=true;estado.erro=null;render();
  testarBancos(corpo).then(function(r){
    estado.carregando=false;
    if(r.ok)estado[campo]=r.dados;else estado.erro=textoErro(r.dados);
    render();
  });
}

export function cliqueBancos(e){
  if(!bancosEmTeste())return false;
  var t=e.target;
  if(t.closest("#bancosListar")){
    var s=document.getElementById("bancosDias");
    estado.dias=s?+s.value:7;
    pedir({acao:"listar",dias:estado.dias},"lista");return true;
  }
  if(t.closest("#bancosWebhookRegistrar")){pedir({acao:"webhook",registrar:true},"webhook");return true}
  if(t.closest("#bancosWebhook")){pedir({acao:"webhook"},"webhook");return true}
  return false;
}
