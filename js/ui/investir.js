import {corPorPercentual} from "../core/cores.js";
import {$, esc, money, num} from "../core/formato.js";
import {abrirSheet, fecharSheet} from "./folhas.js";
import {aplicarMascara, lerMoney} from "./perfil.js";
import {render} from "./render.js";
import {toast} from "./toast.js";

// Aba "investir": só tela. As contas vêm de core/investimentos.js e o que salva, de dados/investimentos.js.
// Linguagem educativa: explica e simula, nunca indica um investimento específico.

// Os módulos de cálculo e dados chegam por import() protegido: se ainda não existirem
// (a branch do cálculo não entrou), a aba mostra "em breve" e o resto do site segue funcionando.
var inv=null,invDados=null,taxasDados=null,carregando=null,falhou=false;

export function modInvest(){return inv}

export function carregarInvestir(){
  if(!carregando)carregando=Promise.all([import("../core/investimentos.js"),import("../dados/investimentos.js"),import("../dados/taxas.js")])
    .then(function(m){inv=m[0];invDados=m[1];taxasDados=m[2];render()})
    .catch(function(){falhou=true;render()});
  return carregando;
}

var sim={inicial:null,aporte:null,meses:12,rende:"100",taxa:"",isento:false};
var etapaVista=null,invEditando=null,taxas=null,taxasPedidas=false;

var TEXTO_ETAPA={
  reserva:"É o dinheiro do imprevisto: perder o emprego, consertar o carro, uma conta de saúde. Fica num lugar seguro, "+
    "que você saca no mesmo dia. Com ela pronta, você nunca precisa vender um investimento no pior momento.",
  rendafixa:"Você empresta dinheiro pro governo ou pra um banco e recebe juros combinados antes. É previsível: "+
    "as regras ficam claras na entrada. Serve pra objetivos de alguns anos.",
  variavel:"Você vira sócio de empresas, direto ou por fundos que copiam um índice inteiro (os ETFs). "+
    "O valor sobe e desce no caminho, por isso é dinheiro pra deixar quieto por muitos anos."
};
var TIPO_DA_ETAPA={reserva:"reserva",rendafixa:"rendafixa",variavel:"etf"};
var PRAZOS=[[6,"6 meses"],[12,"1 ano"],[24,"2 anos"],[36,"3 anos"],[60,"5 anos"],[120,"10 anos"]];

function pctTxt(v){return String(Math.round(v*10)/10).replace(".",",")}

// taxas com até duas casas (13,65%), sem zero sobrando no fim
function taxaTxt(v){return num(v).replace(/,?0+$/,"")}

function curto(v){
  if(v>=1e6)return "R$ "+pctTxt(v/1e6)+" mi";
  if(v>=1e3)return "R$ "+(v>=1e4?Math.round(v/1e3):pctTxt(v/1e3))+" mil";
  return "R$ "+Math.round(v);
}

function nomeTipo(id){return (inv.TIPOS_INVEST.filter(function(t){return t.id===id})[0]||{nome:"Outro"}).nome}

function diasDesde(iso){
  if(!iso)return null;
  var p=iso.split("-"),d=new Date(+p[0],+p[1]-1,+p[2]),h=new Date();
  return Math.max(0,Math.floor((new Date(h.getFullYear(),h.getMonth(),h.getDate())-d)/86400000));
}

function dataBR(iso){var p=String(iso||"").split("-");return p.length===3?p[2]+"/"+p[1]:""}

// ————— tela —————

export function renderInvestir(){
  var v=$("viewInvestir");
  if(!inv){
    if(!falhou)carregarInvestir();
    v.innerHTML='<div class="blocos"><section class="bloco"><h2>investir</h2><p class="hint">'+
      (falhou?'Esta parte ainda está chegando. Em breve.':'Carregando…')+'</p></section></div>';
    return;
  }
  if(!taxasPedidas){
    taxasPedidas=true;
    taxas=taxasDados.taxasGuardadas();
    taxasDados.carregarTaxas().then(function(t){if(t){taxas=t;desenharSimulador()}});
  }
  var foco=document.activeElement&&v.contains(document.activeElement)?document.activeElement.id:null;
  var t=inv.trilha();
  if(sim.aporte==null)sim.aporte=inv.aporteSugerido()||0;
  if(sim.inicial==null)sim.inicial=inv.totaisInvestidos().total||0;
  if(etapaVista==null)etapaVista=t.atual||3;
  v.innerHTML='<div class="blocos">'+secNivel()+secTrilha(t)+secSimulador()+secCarteira()+
    '<p class="inv-aviso">Conteúdo educativo: o app explica e simula, mas não recomenda nenhum investimento específico. '+
    'Antes de investir, leia as regras e os custos do produto.</p></div>';
  aplicarMascara(v);
  desenharSimulador();
  if(foco&&$(foco))$(foco).focus();
}

function secNivel(){
  var n=inv.nivelInvestidor();
  if(!n)return '<section class="bloco"><h2>seu nível</h2>'+
    '<p class="hint">Cadastre seu salário no perfil pra ver quanto faz sentido guardar pra sua renda.</p></section>';
  var idx=Math.max(0,n.niveis.map(function(x){return x.id}).indexOf(n.nivel)),atual=n.niveis[idx];
  // segmentos de largura igual (é uma escala de ordem); o marcador anda dentro do segmento pelo % guardado
  var ult=n.niveis[n.niveis.length-1],teto=Math.max(ult.de+10,ult.de*1.5);
  var p=Math.round(n.pct*10)/10,ini=atual.de,fim=atual.ate==null?teto:atual.ate;
  var dentro=fim>ini?Math.max(0,Math.min(0.94,(p-ini)/(fim-ini))):0.5;
  var pos=(idx+dentro)/n.niveis.length*100;
  var regua='<div class="regua" role="img" aria-label="Seu nível: '+esc(atual.nome)+', guardando '+pctTxt(p)+'% da renda">'+
    '<div class="regua-faixas">'+n.niveis.map(function(x,i){
      return '<div class="rf n'+(i+1)+(i===idx?' atual':'')+'"><span>'+esc(x.nome)+'</span></div>';
    }).join("")+'</div>'+
    '<div class="regua-marca" style="left:'+Math.max(7,Math.min(93,pos)).toFixed(1)+'%"><em>você · '+pctTxt(p)+'%</em><i></i></div>'+
    '<div class="regua-cortes">'+n.niveis.map(function(x,i){
      return '<span style="left:'+(i/n.niveis.length*100)+'%">'+pctTxt(x.de)+'%</span>';
    }).join("")+'</div></div>';
  var faixaAtual=0;
  for(var i=0;i<n.faixas.length;i++){if(n.faixas[i].ate==null||n.renda<=n.faixas[i].ate){faixaAtual=i;break}}
  var maxPct=Math.max.apply(null,n.faixas.map(function(f){return f.pct}));
  var escada='<div class="escada" role="table" aria-label="Quanto faz sentido guardar por faixa de renda">'+
    '<p class="escada-tit">Quanto faz sentido guardar, pela renda</p>'+
    n.faixas.map(function(f,i){
      var de=i?n.faixas[i-1].ate:0;
      var rot=f.ate==null?"mais de "+curto(de):(i?curto(de).replace(" mil","")+" a "+curto(f.ate).replace("R$ ",""):"até "+curto(f.ate));
      return '<div class="degrau'+(i===faixaAtual?' atual':'')+'" role="row"><span role="cell">'+rot+'</span>'+
        '<div class="degrau-barra"><i style="width:'+(f.pct/maxPct*100).toFixed(1)+'%"></i></div>'+
        '<b role="cell">'+f.pct+'%</b>'+(i===faixaAtual?'<em>sua faixa</em>':'')+'</div>';
    }).join("")+'</div>';
  return '<section class="bloco"><h2>seu nível</h2>'+
    '<div class="nivel-topo"><b class="nivel-nome n'+(idx+1)+'">'+esc(atual.nome)+'</b>'+
    '<span>Você guarda <b>'+money(n.guarda)+'</b> por mês, '+pctTxt(p)+'% da sua renda, '+
    (n.fonte==="ciclo"?"pelo que você investe neste ciclo.":"pela sua meta de investir.")+'</span></div>'+
    regua+'<p class="nivel-texto">'+esc(atual.texto)+'</p>'+escada+
    '<p class="nivel-sug">Pra '+esc(n.sugerido.faixa)+', guardar <b>'+pctTxt(n.sugerido.pct)+'%</b> ('+money(n.sugerido.valor)+
    ' por mês) já é um bom ritmo. Quanto mais a renda passa do custo de vida, maior a parte que dá pra guardar.</p></section>';
}

var ICONE_OK='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
var ICONE_CADEADO='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';

function secTrilha(t){
  var s=t.saude;
  var cor=s.fracao==null?"var(--text-dim)":corPorPercentual(s.fracao);
  var saude='<div class="saude"><i style="background:'+cor+'"></i><span>'+(s.emDia
    ?"Sua planilha está em dia: dá pra seguir no caminho."
    :"Antes de avançar: "+esc(s.motivos.join(" ")))+'</span></div>';
  var passos='<ol class="trilha">'+t.etapas.map(function(e){
    // começou antes da hora (tem dinheiro aqui, mas a etapa anterior não terminou): sem o ✓ de concluída
    var adiantada=e.feita&&!e.liberada;
    var est=adiantada?"livre":e.feita?"feita":e.liberada?(e.atual?"atual":"livre"):"bloq";
    var sub=adiantada?"já tem "+curto(e.tem):e.feita?"feito":e.liberada?(e.atual?"você está aqui":"liberada"):"bloqueada";
    return '<li class="passo '+est+(e.n===etapaVista?' sel':'')+'"><button type="button" data-etapa="'+e.n+'" aria-pressed="'+(e.n===etapaVista)+'">'+
      '<span class="passo-n">'+(e.feita&&!adiantada?ICONE_OK:e.liberada||adiantada?e.n:ICONE_CADEADO)+'</span>'+
      '<span class="passo-t">'+esc(e.titulo)+'</span><small>'+sub+'</small></button></li>';
  }).join("")+'</ol>';
  var e=t.etapas[etapaVista-1]||t.etapas[0],c=t.custo,corpo='';
  if(e.id==="reserva"){
    corpo+='<div class="meta-barra" role="img" aria-label="'+pctTxt(e.pct)+'% da reserva"><i style="width:'+e.pct.toFixed(1)+'%"></i></div>'+
      '<p class="meta-txt"><b>'+money(e.tem)+'</b> de '+money(e.meta)+' · '+t.reservaMeses+' meses do seu custo de vida</p>'+
      '<p class="passo-p">Seu custo por mês ≈ <b>'+money(c.valor)+'</b> ('+money(c.saidas)+' de contas + '+money(c.diaADia)+' do dia a dia)'+
      (c.fonteDiario==="salario"?'. Estimado pelo seu salário: anote seus gastos pra ficar mais preciso.'
        :c.fonteDiario==="sem"?'. Cadastre seu salário no perfil pra o app calcular.':'.')+'</p>'+
      '<label class="fld fld-curto"><span>Quantos meses de reserva</span><select id="reservaSel">'+
      [3,6,9,12].concat([3,6,9,12].indexOf(t.reservaMeses)<0?[t.reservaMeses]:[]).map(function(m){
        return '<option value="'+m+'"'+(m===t.reservaMeses?' selected':'')+'>'+m+' meses</option>';
      }).join("")+'</select></label>';
  }else if(e.tem>0)corpo+='<p class="passo-p">Você já tem <b>'+money(e.tem)+'</b> aqui.</p>';
  if(e.bloqueio)corpo+='<p class="passo-bloq"><b>Pra liberar:</b> '+esc(e.bloqueio)+'</p>';
  else if(!e.feita&&e.id!=="reserva")corpo+='<p class="passo-p">Liberada. Quando começar, anote o investimento em “onde está seu dinheiro”, logo abaixo.</p>';
  var dica=(inv.TIPOS_INVEST.filter(function(x){return x.id===TIPO_DA_ETAPA[e.id]})[0]||{}).dica;
  return '<section class="bloco"><h2>seu caminho</h2>'+
    '<p class="hint">Um passo de cada vez: primeiro a segurança, depois o crescimento.</p>'+saude+passos+
    '<div class="passo-card"><h3>'+e.n+'. '+esc(e.titulo)+'</h3><p class="passo-p">'+TEXTO_ETAPA[e.id]+'</p>'+corpo+
    (dica?'<p class="passo-ex">Exemplos desse tipo: '+esc(dica)+'.</p>':'')+'</div></section>';
}

function secSimulador(){
  function op(v,l,cur){return '<option value="'+v+'"'+(String(cur)===String(v)?' selected':'')+'>'+l+'</option>'}
  return '<section class="bloco"><h2>simulador</h2>'+
    '<p class="hint">E se você investir um pouco todo mês? Mexa nos números e veja onde chega.</p>'+
    '<p class="sim-explica"><b>Já tenho guardado</b> é o que você já investiu e vai deixar rendendo (a caixinha, por exemplo). '+
    '<b>Vou investir por mês</b> é o que sai do salário todo mês e soma por cima. Um não sai do outro.</p>'+
    '<div class="sim-campos">'+
      '<label class="fld"><span>Já tenho guardado</span><input id="simIni" inputmode="numeric" data-money value="'+num(sim.inicial)+'"></label>'+
      '<label class="fld"><span>Vou investir por mês</span><input id="simAporte" inputmode="numeric" data-money value="'+num(sim.aporte)+'"></label>'+
      '<label class="fld"><span>Por quanto tempo</span><select id="simMeses">'+PRAZOS.map(function(p){return op(p[0],p[1],sim.meses)}).join("")+'</select></label>'+
      '<label class="fld"><span>Rendendo</span><select id="simRende">'+
        op("100","100% do CDI",sim.rende)+op("90","90% do CDI",sim.rende)+op("110","110% do CDI",sim.rende)+
        op("120","120% do CDI",sim.rende)+op("outra","outra taxa",sim.rende)+'</select></label>'+
      '<label class="fld" id="simWrapTaxa"'+(sim.rende==="outra"?'':' hidden')+'><span>Taxa ao ano (%)</span>'+
        '<input id="simTaxa" inputmode="decimal" placeholder="ex.: 12" value="'+esc(sim.taxa)+'"></label>'+
    '</div>'+
    '<label class="chk"><input type="checkbox" id="simIsento"'+(sim.isento?' checked':'')+'> isento de imposto de renda (como LCI, LCA e poupança)</label>'+
    '<div id="simRes" aria-live="polite"></div></section>';
}

function lerSimulador(){
  if(!$("simIni"))return false;
  sim.inicial=lerMoney($("simIni"));sim.aporte=lerMoney($("simAporte"));
  sim.meses=+$("simMeses").value;sim.rende=$("simRende").value;
  sim.taxa=$("simTaxa").value;sim.isento=$("simIsento").checked;
  return true;
}

export function desenharSimulador(){
  var box=$("simRes");
  if(!box||!lerSimulador())return;
  $("simWrapTaxa").hidden=sim.rende!=="outra";
  var o={aporteMensal:sim.aporte,valorInicial:sim.inicial,meses:sim.meses,isento:sim.isento};
  if(sim.rende==="outra"){
    var tx=parseFloat(String(sim.taxa).replace(",","."));
    if(!isFinite(tx)){box.innerHTML='<p class="sim-vazio">Digite quanto rende ao ano pra simular.</p>';return}
    o.taxaAnual=tx;
  }else o.pctCDI=+sim.rende;
  var r=inv.simular(o,taxas);
  if(!r){box.innerHTML='<p class="sim-vazio">Não consegui buscar as taxas do Banco Central agora. '+
    'Escolha “outra taxa” e digite quanto rende ao ano.</p>';return}
  if(!(r.aportado>0)){box.innerHTML='<p class="sim-vazio">Coloque quanto você já tem ou quanto vai investir por mês.</p>';return}
  var ganho=r.liquido-r.aportado,temPoup=r.poupanca!=null;
  box.innerHTML='<div class="sim-kpis">'+
      '<div><span>Você coloca no total</span><b>'+money(r.aportado)+'</b><small>'+
        (sim.inicial>0?money(sim.inicial)+' de início + ':'')+money(sim.aporte)+' por mês</small></div>'+
      '<div class="dest"><span>Você teria</span><b>'+money(r.liquido)+'</b><small>'+(ganho>=0?"+":"")+money(ganho)+' de rendimento'+
        (r.ir>0.005?', já tirando '+money(r.ir)+' de IR':'')+'</small></div>'+
      (temPoup?'<div><span>Na poupança</span><b>'+money(r.poupanca)+'</b></div>':'')+
    '</div>'+
    (temPoup?'<p class="sim-comp">'+(r.ganhoSobrePoupanca>=0
      ?'<b>'+money(r.ganhoSobrePoupanca)+'</b> a mais do que deixando na poupança.'
      :'<b>'+money(-r.ganhoSobrePoupanca)+'</b> a menos que a poupança: com essa taxa, a poupança renderia mais.')+'</p>':'')+
    '<div class="sim-leg"><span><i class="k-inv"></i>seu investimento</span>'+(temPoup?'<span><i class="k-poup"></i>poupança</span>':'')+
      '<span><i class="k-ap"></i>o que você colocou</span></div>'+
    '<div class="sim-graf" id="simGraf"></div>'+fonteSimulacao(r)+tabelaSimulacao(r);
  desenharGrafico($("simGraf"),r);
}

function fonteSimulacao(r){
  var p=["Rendendo "+taxaTxt(r.taxaAnual)+"% ao ano"+(sim.rende!=="outra"?" ("+sim.rende+"% do CDI)":"")+
    (r.taxaRealAnual!=null?", uns "+pctTxt(Math.abs(r.taxaRealAnual))+"% "+(r.taxaRealAnual>=0?"acima":"abaixo")+" da inflação":"")+"."];
  if(taxas&&taxas.cdi){
    var l=["CDI "+taxaTxt(taxas.cdi.valor)+"%"];
    if(taxas.selic)l.push("Selic "+taxaTxt(taxas.selic.valor)+"%");
    if(taxas.ipca12m)l.push("IPCA 12 meses "+taxaTxt(taxas.ipca12m.valor)+"%");
    p.push("Taxas: "+taxas.fonte+", "+taxas.cdi.data+" ("+l.join(", ")+")"+(taxas.velho?", guardadas: não deu pra atualizar agora":"")+".");
  }
  p.push("Conta com aporte no começo de cada mês e imposto de renda pela tabela regressiva. É uma simulação educativa, não uma recomendação: o rendimento de hoje não garante o de amanhã.");
  return '<p class="sim-fonte">'+esc(p.join(" "))+'</p>';
}

function tabelaSimulacao(r){
  var passo=r.meses<=12?3:r.meses<=36?6:12,linhas=r.serie.filter(function(x){return x.mes%passo===0||x.mes===r.meses});
  return '<details class="sim-tab"><summary>ver em tabela</summary><table><thead><tr><th>mês</th><th>você colocou</th>'+
    '<th>seu investimento</th>'+(r.poupanca!=null?'<th>poupança</th>':'')+'</tr></thead><tbody>'+
    linhas.map(function(x){
      return '<tr><td>'+x.mes+'</td><td>'+money(x.aportado)+'</td><td>'+money(x.liquido)+'</td>'+
        (r.poupanca!=null?'<td>'+money(x.poupanca)+'</td>':'')+'</tr>';
    }).join("")+'</tbody></table></details>';
}

// ————— gráfico (SVG à mão: linhas de 2px, área de 10%, grade fininha, rótulo só na ponta) —————

function passoBonito(v){
  var e=Math.pow(10,Math.floor(Math.log10(Math.max(v,1)))),f=v/e;
  return (f<=1?1:f<=2?2:f<=2.5?2.5:f<=5?5:10)*e;
}

function desenharGrafico(el,r){
  var W=Math.max(280,el.clientWidth||600),H=220,m={t:14,r:92,b:24,l:58};
  var s=r.serie,n=s.length,temPoup=r.poupanca!=null;
  var maxY=Math.max.apply(null,s.map(function(p){return Math.max(p.liquido,p.aportado,temPoup?p.poupanca:0)}));
  var passo=passoBonito(maxY/3),topo=Math.ceil(maxY/passo)*passo||1;
  function x(i){return m.l+(n>1?i/(n-1):0)*(W-m.l-m.r)}
  function y(v){return m.t+(1-v/topo)*(H-m.t-m.b)}
  function linha(campo){return s.map(function(p,i){return (i?"L":"M")+x(i).toFixed(1)+" "+y(p[campo]).toFixed(1)}).join("")}
  var g='';
  for(var v=0;v<=topo+0.5;v+=passo){
    g+='<line class="g-grade" x1="'+m.l+'" x2="'+(W-m.r)+'" y1="'+y(v).toFixed(1)+'" y2="'+y(v).toFixed(1)+'"/>'+
       '<text class="g-eixo" x="'+(m.l-8)+'" y="'+(y(v)+4).toFixed(1)+'" text-anchor="end">'+curto(v)+'</text>';
  }
  g+='<path class="g-area" d="'+linha("aportado")+"L"+x(n-1).toFixed(1)+" "+y(0)+"L"+x(0).toFixed(1)+" "+y(0)+'Z"/>';
  if(temPoup)g+='<path class="g-linha g-poup" d="'+linha("poupanca")+'"/>';
  g+='<path class="g-linha g-inv" d="'+linha("liquido")+'"/>';
  var fim=s[n-1],yi=y(fim.liquido),yp=temPoup?y(fim.poupanca):null;
  // rótulos na ponta das linhas; se encostam, fica só o do seu investimento (legenda e dica cobrem o resto)
  var juntos=temPoup&&Math.abs(yi-yp)<15;
  if(temPoup)g+='<circle class="g-ponto g-poup" cx="'+x(n-1).toFixed(1)+'" cy="'+yp.toFixed(1)+'" r="4"/>';
  g+='<circle class="g-ponto g-inv" cx="'+x(n-1).toFixed(1)+'" cy="'+yi.toFixed(1)+'" r="4"/>';
  g+='<text class="g-rot forte" x="'+(x(n-1)+10).toFixed(1)+'" y="'+(yi+4).toFixed(1)+'">'+curto(fim.liquido)+'</text>';
  if(temPoup&&!juntos)g+='<text class="g-rot" x="'+(x(n-1)+10).toFixed(1)+'" y="'+(yp+4).toFixed(1)+'">'+curto(fim.poupanca)+'</text>';
  g+='<text class="g-eixo" x="'+m.l+'" y="'+(H-6)+'">mês 1</text>'+
     '<text class="g-eixo" x="'+(W-m.r)+'" y="'+(H-6)+'" text-anchor="end">'+(PRAZOS.filter(function(p){return p[0]===r.meses})[0]||[0,r.meses+" meses"])[1]+'</text>';
  g+='<line class="g-mira" id="gMira" y1="'+m.t+'" y2="'+(H-m.b)+'" x1="0" x2="0" visibility="hidden"/>';
  el.innerHTML='<svg viewBox="0 0 '+W+' '+H+'" width="'+W+'" height="'+H+'" role="img" aria-label="Gráfico: seu investimento chega a '+
    money(fim.liquido)+(temPoup?', a poupança a '+money(fim.poupanca):'')+' em '+r.meses+' meses">'+g+
    '<rect class="g-alvo" x="'+m.l+'" y="'+m.t+'" width="'+(W-m.l-m.r)+'" height="'+(H-m.t-m.b)+'"/></svg>'+
    '<div class="g-dica" id="gDica" hidden></div>';
  var alvo=el.querySelector(".g-alvo"),mira=el.querySelector("#gMira"),dica=el.querySelector("#gDica");
  function mostrar(ev){
    var b=el.getBoundingClientRect(),px=(ev.clientX-b.left)*(W/b.width);
    var i=Math.max(0,Math.min(n-1,Math.round((px-m.l)/((W-m.l-m.r)/Math.max(1,n-1)))));
    var p=s[i],cx=x(i);
    mira.setAttribute("x1",cx);mira.setAttribute("x2",cx);mira.setAttribute("visibility","visible");
    dica.innerHTML='<b>mês '+p.mes+'</b><span><i class="k-inv"></i>seu investimento '+money(p.liquido)+'</span>'+
      (temPoup?'<span><i class="k-poup"></i>poupança '+money(p.poupanca)+'</span>':'')+
      '<span><i class="k-ap"></i>você colocou '+money(p.aportado)+'</span>';
    dica.hidden=false;
    var esq=cx*(b.width/W)+12;
    if(esq+dica.offsetWidth>b.width)esq=cx*(b.width/W)-dica.offsetWidth-12;
    dica.style.left=Math.max(0,esq)+"px";
  }
  alvo.addEventListener("pointermove",mostrar);
  alvo.addEventListener("pointerdown",mostrar);
  alvo.addEventListener("pointerleave",function(){mira.setAttribute("visibility","hidden");dica.hidden=true});
}

// ————— onde está seu dinheiro —————

function secCarteira(){
  var lista=inv.listaInvestimentos(),t=inv.totaisInvestidos();
  var h='<section class="bloco"><h2>onde está seu dinheiro</h2>'+
    '<p class="hint">Anote o que você já tem investido e atualize o valor de vez em quando. É isso que faz a sua trilha andar.</p>';
  if(lista.length){
    h+='<div class="cart-total"><span>total investido</span><b>'+money(t.total)+'</b></div>'+
      '<div class="cart-tipos">'+inv.TIPOS_INVEST.filter(function(tp){return t.porTipo[tp.id]>0}).map(function(tp){
        var v=t.porTipo[tp.id],p=t.total>0?v/t.total*100:0;
        return '<div class="ct"><span>'+esc(tp.nome)+'</span><div class="ct-barra"><i style="width:'+p.toFixed(1)+'%"></i></div>'+
          '<b>'+money(v)+'</b><em>'+pctTxt(p)+'%</em></div>';
      }).join("")+'</div>'+
      lista.slice().sort(function(a,b){return (+b.valor||0)-(+a.valor||0)}).map(itemCarteira).join("");
    if(t.desatualizados.length){
      var mais=t.desatualizados.map(function(i){return i.atualizadoEm||""}).sort()[0];
      var lancou=mais?inv.aportesDesde(mais):0;
      h+='<div class="note">'+(t.desatualizados.length===1?'Um investimento está':t.desatualizados.length+' investimentos estão')+
        ' sem atualizar há mais de 30 dias.'+(lancou>0.005?' Desde '+dataBR(mais)+', você lançou <b>'+money(lancou)+
        '</b> como investimento no app: lembre de somar isso quando atualizar.':'')+'</div>';
    }
  }else h+='<p class="empty">Nada anotado ainda.</p>';
  return h+'<button class="btn ghost" id="invAdd">Anotar investimento</button></section>';
}

function itemCarteira(i){
  var dias=diasDesde(i.atualizadoEm),velho=dias==null||dias>30;
  return '<div class="fixo inv-item" data-invedit="'+esc(i.id)+'"><div class="d">'+esc(i.nome||nomeTipo(i.tipo))+
    '<small>'+esc([nomeTipo(i.tipo),i.onde].filter(Boolean).join(" · "))+' · '+
    (dias==null?'sem data':dias===0?'atualizado hoje':'atualizado há '+dias+' dia'+(dias>1?'s':''))+
    (velho?' <span class="inv-velho">atualize</span>':'')+'</small></div><b>'+money(i.valor)+'</b>'+
    '<button class="ed" data-invval="'+esc(i.id)+'">atualizar</button></div>';
}

// ————— folhas —————

function achar(id){return inv.listaInvestimentos().filter(function(x){return x.id===id})[0]||null}

export function abrirInvestimento(id){
  var it=id?achar(id):null,t=inv.trilha();
  invEditando=it?it.id:null;
  var tipo=it?it.tipo:TIPO_DA_ETAPA[(t.etapas[(t.atual||1)-1]||{}).id]||"reserva";
  abrirSheet('<h3>'+(it?'editar investimento':'anotar investimento')+'</h3>'+
    '<p class="sh-sub">Só pra você acompanhar aqui: o app não mexe no seu dinheiro.</p>'+
    '<label class="fld"><span>Tipo</span><select id="invTipo">'+inv.TIPOS_INVEST.map(function(x){
      return '<option value="'+x.id+'"'+(x.id===tipo?' selected':'')+'>'+esc(x.nome)+'</option>';
    }).join("")+'</select></label><p class="sh-sub tipoDesc" id="invDica"></p>'+
    '<label class="fld"><span>Nome</span><input id="invNome" type="text" maxlength="60" value="'+esc(it?it.nome:"")+'" placeholder="ex.: caixinha da reserva"></label>'+
    '<label class="fld"><span>Onde está</span><input id="invOnde" type="text" maxlength="60" value="'+esc(it?it.onde:"")+'" placeholder="banco ou corretora"></label>'+
    '<label class="fld"><span>Quanto tem hoje</span><input id="invValor" inputmode="numeric" data-money value="'+num(it?it.valor:0)+'"></label>'+
    '<button class="btn w" id="invSalvar">'+(it?'Salvar alterações':'Salvar')+'</button>'+
    (it?'<button class="linkish" data-invdel="'+esc(it.id)+'" style="color:var(--neg-deep)">apagar este investimento</button>':''));
  atualizarDica();
}

function atualizarDica(){
  var s=$("invTipo"),d=$("invDica");
  if(s&&d)d.textContent="Exemplos: "+((inv.TIPOS_INVEST.filter(function(x){return x.id===s.value})[0]||{}).dica||"")+".";
}

export function abrirAtualizarValor(id){
  var it=achar(id);
  if(!it)return toast("Esse investimento não existe mais.");
  invEditando=it.id;
  var lancou=it.atualizadoEm?inv.aportesDesde(it.atualizadoEm):0;
  abrirSheet('<h3>atualizar valor</h3>'+
    '<p class="sh-sub">Quanto tem hoje em '+esc(it.nome||nomeTipo(it.tipo))+'? Olhe no app do banco ou da corretora.'+
    (lancou>0.005?' Desde a última atualização ('+dataBR(it.atualizadoEm)+'), você lançou '+money(lancou)+' como investimento no app.':'')+'</p>'+
    '<label class="fld"><span>Valor hoje</span><input id="invNovoValor" inputmode="numeric" data-money value="'+num(it.valor)+'"></label>'+
    '<button class="btn w" id="invValSalvar">Salvar valor</button>');
}

function resultado(r){
  toast(r.msg);
  if(r.ok){fecharSheet();render()}
}

// ————— eventos (chamados pelo eventos.js) —————

export function cliqueInvestir(e){
  if(!inv)return false;
  var t=e.target,b;
  if((b=t.closest("[data-etapa]"))){etapaVista=+b.dataset.etapa;render();return true}
  if(t.closest("#invAdd")){abrirInvestimento();return true}
  if((b=t.closest("[data-invval]"))){abrirAtualizarValor(b.dataset.invval);return true}
  if((b=t.closest("[data-invedit]"))){abrirInvestimento(b.dataset.invedit);return true}
  if(t.closest("#invSalvar")){
    resultado(invDados.salvarInvestimento({id:invEditando||undefined,nome:$("invNome").value.trim(),onde:$("invOnde").value.trim(),
      tipo:$("invTipo").value,valor:lerMoney($("invValor"))}));
    return true;
  }
  if(t.closest("#invValSalvar")){resultado(invDados.atualizarValorInvestimento(invEditando,lerMoney($("invNovoValor"))));return true}
  if((b=t.closest("[data-invdel]"))){
    if(confirm("Apagar este investimento da lista? Isso não mexe no seu dinheiro, só tira a anotação."))
      resultado(invDados.removerInvestimento(b.dataset.invdel));
    return true;
  }
  return false;
}

export function mudancaInvestir(e){
  var id=e.target&&e.target.id;
  if(!id||!inv)return false;
  if(/^sim(Ini|Aporte|Meses|Rende|Taxa|Isento)$/.test(id)){desenharSimulador();return true}
  if(id==="invTipo"){atualizarDica();return true}
  if(id==="reservaSel"&&e.type==="change"){
    var r=invDados.definirMesesReserva(+e.target.value);
    toast(r.msg);if(r.ok)render();
    return true;
  }
  return false;
}

var esperaRedim=0;
window.addEventListener("resize",function(){
  clearTimeout(esperaRedim);
  esperaRedim=setTimeout(function(){var v=$("viewInvestir");if(v&&!v.hidden)desenharSimulador()},150);
});
