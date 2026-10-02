import {diaDoFixo, textoRegraFixo} from "../core/calculo.js";
import {HOJE_KEY, somaMes} from "../core/datas.js";
import {state, ui} from "../core/estado.js";
import {$, DOW, MESES, esc, money, num} from "../core/formato.js";
import {diaPagamento, mesExtenso, temPagamento, textoRegraPag} from "../core/pagamento.js";
import {sessao} from "../dados/sessao.js";
import {rotuloTipo} from "./folhas.js";

export function atualizaSaveBar(){
  var b=$("btnSalvarCfg");
  if(!b)return;
  b.classList.toggle("ok",!ui.cfgSujo);
  b.firstChild.textContent=ui.cfgSujo?"Salvar alterações":"Tudo salvo ✓";
}

export function renderSet(){
  var c=state.config,v=$("viewSet");
  var pags=(c.pagamentos||[]).slice().sort(function(a,b){return (a.desde||"")<(b.desde||"")?-1:1});
  var fixos=(c.fixos||[]).slice().sort(function(a,b){return diaDoFixo(a,ui.atual.y,ui.atual.m)-diaDoFixo(b,ui.atual.y,ui.atual.m)});
  v.innerHTML=
    (sessao.user?'<div class="conta"><div class="d">'+esc(sessao.user.displayName||sessao.user.email||"conta")+
       '<small>'+esc(sessao.user.email||"")+'</small></div><button class="rm" id="btnSair">sair</button></div>':'')+
    '<h2>configurações</h2><p class="hint">Vale para todos os meses.</p>'+
    '<label class="fld"><span>Seu nome</span><input type="text" data-set="nome" value="'+esc(c.nome||"")+'"></label>'+
    '<div class="row2">'+fldValor("Saldo inicial","saldoInicial",c.saldoInicial)+
      '<label class="fld"><span>A partir do mês</span><input type="month" data-set="saldoInicialMes" value="'+esc(c.saldoInicialMes||HOJE_KEY)+'"></label></div>'+
    '<p class="hint" style="margin-top:-6px">Quanto você tinha no primeiro dia desse mês. Daí em diante cada mês começa com o fechamento do anterior.</p>'+
    '<div class="row2">'+
      '<label class="fld"><span>Investir por ciclo (%)</span><input type="number" min="0" max="100" data-set="metaEconomia" value="'+(+c.metaEconomia||0)+'"></label>'+
      '<label class="fld"><span>Fechar o ciclo com (%)</span><input type="number" min="0" max="100" data-set="metaReserva" value="'+(+c.metaReserva||0)+'"></label></div>'+
    '<p class="hint" style="margin-top:-6px">O primeiro é quanto do salário você tira pra investir. O segundo é o mínimo que precisa sobrar na véspera do próximo pagamento. Os dois saem da conta antes de o app calcular sua diária.</p>'+
    '<label class="fld"><span>Tema</span><select data-set="tema">'+
      opt("dark","Escuro",c.tema)+opt("light","Claro",c.tema)+opt("auto","Igual ao sistema",c.tema)+'</select></label>'+
    '<div class="savebar"><button class="btn w" id="btnSalvarCfg"><span>Tudo salvo</span></button></div>'+
    '<hr class="sep"><h2>recebimento</h2>'+
    '<p class="hint">O app acha sozinho o dia em que o dinheiro cai, pulando fins de semana e feriados nacionais. Cada período vale do mês escolhido em diante, então registrar um aumento não mexe nos meses antigos.</p>'+
    (pags.length?pags.map(function(pg){
      return '<div class="fixo" data-editpag="'+esc(pg.id)+'"><div class="d">'+esc(pg.desc||"salário")+
        '<small>'+textoRegraPag(pg)+' · de '+mesExtenso(pg.desde)+' em diante</small></div><b>'+money(pg.valor)+'</b>'+
        '<button class="rm" data-delpag="'+esc(pg.id)+'">remover</button></div>';
    }).join(""):'<p class="empty">Nenhum recebimento cadastrado.</p>')+
    '<button class="btn ghost w" id="addPag" style="margin-top:14px">'+(pags.length?"Meu salário mudou a partir de um mês":"Cadastrar recebimento")+'</button>'+
    previaPagamento()+
    '<hr class="sep"><h2>contas fixas</h2>'+
    '<p class="hint">Entram sozinhas todo mês, a partir do mês em que você cadastrou. Toque numa delas pra editar. Pra pular uma só num mês, abra o dia e remova ali.</p>'+
    (fixos.length?fixos.map(function(f){
      return '<div class="fixo" data-editfixo="'+esc(f.id)+'"><div class="d">'+esc(f.desc||"sem nome")+
        '<small>'+(f.cat?esc(f.cat)+' · ':'')+textoRegraFixo(f)+' · '+rotuloTipo(f.tipo)+(f.espera?" · nunca antes do salário":"")+(f.cartao?" · no cartão":"")+'</small></div><b>'+money(f.valor)+'</b>'+
        '<button class="rm" data-delfixo="'+esc(f.id)+'">remover</button></div>';
    }).join(""):'<p class="empty">Nenhuma conta fixa ainda.</p>')+
    '<button class="btn ghost w" id="addFixo" style="margin-top:14px">Adicionar conta fixa</button>'+
    '<hr class="sep"><h2>quem vê isso</h2><p class="hint">'+
    (sessao.db?"Está tudo salvo online: quem tiver o link enxerga os mesmos números, ao vivo.":
        "Sem conexão com os dados compartilhados — por ora tudo fica salvo só neste navegador.")+
    (sessao.readOnly?" Você está no modo leitura.":"")+'</p>'+
    '<button class="btn danger w" id="wipe" style="margin-top:20px">Apagar tudo e recomeçar</button>'+
    '<p class="hint" style="margin-top:26px;text-align:center">projeção, não adivinhação</p>';
  aplicarMascara(v);
  atualizaSaveBar();
}

export function regraOpts(p){
  var val=p.regra==="fixo"?"fixo":(p.regra==="ultimoUtil"?"ultimoUtil":"util:"+(+p.n||5));
  var out="";
  for(var i=1;i<=10;i++){
    var v="util:"+i;
    out+='<option value="'+v+'"'+(val===v?" selected":"")+'>'+i+'º dia útil</option>';
  }
  out+='<option value="ultimoUtil"'+(val==="ultimoUtil"?" selected":"")+'>Último dia útil</option>';
  out+='<option value="fixo"'+(val==="fixo"?" selected":"")+'>Dia fixo do mês</option>';
  return out;
}

export function previaPagamento(){
  if(!temPagamento())return '<p class="hint">Cadastre um recebimento pra o app calcular seus ciclos e sua diária.</p>';
  var linhas=[];
  for(var i=0;i<3;i++){
    var a=somaMes(ui.atual,i),d=diaPagamento(a.y,a.m);
    linhas.push(MESES[a.m].slice(0,3)+": dia "+d+" ("+DOW[new Date(a.y,a.m,d).getDay()]+")");
  }
  return '<div class="note">Com essa regra, o dinheiro cai em <b>'+linhas.join("</b>, <b>")+'</b>.'+
    ' Se você também cadastrou o salário como conta fixa, remova de lá pra não contar duas vezes.</div>';
}

export function fldValor(lbl,k,val){
  return '<label class="fld"><span>'+lbl+'</span><input inputmode="numeric" data-money data-set="'+k+'" value="'+num(val||0)+'"></label>';
}

export function aplicarMascara(root){
  (root||document).querySelectorAll("[data-money]").forEach(function(i){
    if(i.dataset.masked)return;
    i.dataset.masked="1";
    function aoFim(){try{var n=i.value.length;i.setSelectionRange(n,n)}catch(e){}}
    i.addEventListener("input",function(){
      var dg=i.value.replace(/\D/g,"").replace(/^0+(?=\d)/,"").slice(0,11);
      i.value=dg?num(Number(dg)/100):"0,00";
      aoFim();
    });
    i.addEventListener("focus",function(){setTimeout(aoFim,0)});
    i.addEventListener("click",aoFim);
  });
}

export function lerMoney(i){
  if(!i)return 0;
  return Number(String(i.value).replace(/\./g,"").replace(",","."))||0;
}

export function opt(v,l,cur){return '<option value="'+v+'"'+(cur===v?" selected":"")+'>'+l+'</option>'}
