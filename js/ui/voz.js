import {$} from "../core/formato.js";
import {iaDisponivel} from "../dados/ia.js";
import {sessao} from "../dados/sessao.js";
import {toast} from "./toast.js";

// Microfone da assistente. Dois jeitos de usar: toque, fale e toque de novo (ou "Enviar");
// ou segure, fale e solte. O áudio gravado vai pro chat, que mostra e manda transcrever.

var MAX_SEG=60;      // corta e envia sozinho
var AVISO_SEG=50;    // o relógio fica vermelho nos últimos 10 s
var MIN_SEG=0.6;     // menos que isso foi toque sem querer
var SEGURAR_MS=450;  // gravou segurando por mais que isso: soltar envia
var PASSO_MS=70;     // uma barrinha nova na onda a cada passo
var BARRAS=44;       // barrinhas da onda enquanto grava
var BARRAS_MSG=26;   // barrinhas da onda que fica na mensagem

export var ICONE_MIC='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+
  '<rect x="9" y="3" width="6" height="11.5" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></svg>';
var ICONE_X='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg>';

// v.estado: parado | pedindo (esperando a permissão do microfone) | gravando
var v={estado:"parado"};
var aoGravar=null;

export function vozSuportada(){
  return !!(window.MediaRecorder&&navigator.mediaDevices&&navigator.mediaDevices.getUserMedia);
}

export function gravandoVoz(){return v.estado!=="parado"}

// botão do microfone + faixa de gravação, dentro da caixa do texto
export function micHTML(){
  if(!vozSuportada())return "";
  return '<div class="voz-faixa" id="vozFaixa" hidden>'+
      '<button type="button" class="voz-cancelar" id="vozCancelar" aria-label="Cancelar a gravação" title="Cancelar (esc)">'+ICONE_X+'</button>'+
      '<span class="voz-ponto" aria-hidden="true"></span>'+
      '<span class="voz-tempo" id="vozTempo">0:00</span>'+
      '<span class="voz-onda" id="vozOnda" aria-hidden="true">'+barras(BARRAS)+'</span>'+
    '</div>'+
    '<button type="button" class="ia-mic" id="iaMic" aria-pressed="false" aria-label="Falar com a Alice" title="Falar: toque ou segure">'+ICONE_MIC+'</button>';
}

// linha de ajuda embaixo do campo (como usar enquanto grava, ou o que deu errado)
export function notaVozHTML(){
  return vozSuportada()?'<p class="voz-nota" id="vozNota" aria-live="polite" hidden></p>':"";
}

// onda pequena que fica na mensagem enviada por voz
export function ondaHTML(niveis){
  return (niveis||[]).map(function(n,i){return '<i style="--n:'+n+';--i:'+i+'"></i>'}).join("");
}

export function duracao(s){
  s=Math.max(0,Math.round(+s||0));
  return Math.floor(s/60)+":"+(s%60<10?"0":"")+s%60;
}

function barras(q){
  var h="";
  for(var i=0;i<q;i++)h+="<i></i>";
  return h;
}

export function ligarVoz(fn){
  aoGravar=fn;
  if(!vozSuportada())return;
  document.addEventListener("pointerdown",function(e){
    var b=e.target.closest&&e.target.closest("#iaMic");
    if(!b||b.disabled||e.button>0)return;
    e.preventDefault();
    if(v.estado==="gravando")return terminarVoz();
    if(v.estado!=="parado")return;
    try{b.setPointerCapture(e.pointerId)}catch(x){}
    v.segurando=true;
    comecar();
  });
  window.addEventListener("pointerup",soltou);
  window.addEventListener("pointercancel",soltou);
  // clique sem ponteiro = teclado (Enter/Espaço no botão): liga e desliga
  document.addEventListener("click",function(e){
    if(!e.target.closest)return;
    if(e.target.closest("#vozCancelar"))return cancelarVoz();
    if(e.detail!==0||!e.target.closest("#iaMic"))return;
    if(v.estado==="parado")comecar();
    else if(v.estado==="gravando")terminarVoz();
  });
  document.addEventListener("visibilitychange",function(){if(document.hidden)cancelarVoz()});
}

function soltou(){
  if(!v.segurando)return;
  v.segurando=false;
  // só conta como "segurar" se já estava gravando há um tempo; se o aviso de permissão
  // apareceu no meio, a gravação segue e a pessoa toca de novo pra enviar
  if(v.estado==="gravando"&&performance.now()-v.inicio>=SEGURAR_MS)terminarVoz();
  else pintar();
}

function comecar(){
  if(!iaDisponivel()){v.segurando=false;return toast("Entre com sua conta Google pra falar com a Alice.")}
  if(sessao.readOnly){v.segurando=false;return toast("Você tem acesso só de leitura aqui.")}
  var tentativa={};
  v={estado:"pedindo",segurando:v.segurando,tentativa:tentativa,niveis:[],historico:[]};
  // o AudioContext nasce aqui, ainda dentro do toque, senão o navegador o deixa mudo
  try{var AC=window.AudioContext||window.webkitAudioContext;if(AC)v.ctx=new AC()}catch(e){}
  pintar();
  navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true,channelCount:1}})
    .then(function(stream){
      if(v.tentativa!==tentativa){stream.getTracks().forEach(function(t){t.stop()});return}
      gravar(stream);
    })
    .catch(function(e){
      if(v.tentativa!==tentativa)return;
      soltar();
      nota(erroMicrofone(e),true);
    });
}

function gravar(stream){
  var tipo=["audio/webm;codecs=opus","audio/mp4","audio/webm","audio/ogg;codecs=opus"].filter(function(t){
    return MediaRecorder.isTypeSupported&&MediaRecorder.isTypeSupported(t);
  })[0];
  var rec;
  try{rec=new MediaRecorder(stream,tipo?{mimeType:tipo,audioBitsPerSecond:32000}:{audioBitsPerSecond:32000})}
  catch(e){stream.getTracks().forEach(function(t){t.stop()});soltar();return nota("Este navegador não consegue gravar áudio.",true)}
  // o último pedaço chega depois do stop(), quando v já foi limpo: as partes ficam presas aqui
  var partes=[];
  v.stream=stream;v.rec=rec;v.partes=partes;
  rec.ondataavailable=function(e){if(e.data&&e.data.size)partes.push(e.data)};
  if(v.ctx){
    try{
      var fonte=v.ctx.createMediaStreamSource(stream);
      v.analise=v.ctx.createAnalyser();
      v.analise.fftSize=1024;
      fonte.connect(v.analise);
      v.amostra=new Uint8Array(v.analise.fftSize);
      if(v.ctx.resume)v.ctx.resume();
    }catch(e){v.analise=null}
  }
  rec.start();
  v.estado="gravando";
  v.inicio=performance.now();v.ultimoPasso=v.inicio;v.pico=0;
  pintar();
  v.quadro=requestAnimationFrame(passo);
}

// a cada quadro: volume do microfone (anel do botão), relógio e onda
function passo(agora){
  if(v.estado!=="gravando")return;
  var faixa=$("vozFaixa");
  // a conversa sumiu da tela (folha fechada, painel escondido, outra folha aberta): descarta
  if(!faixa||faixa.closest(".scrim:not(.open)"))return cancelarVoz();
  var nivel=lerNivel();
  v.pico=Math.max(v.pico,nivel);
  var mic=$("iaMic");
  if(mic)mic.style.setProperty("--nivel",nivel.toFixed(3));
  if(agora-v.ultimoPasso>=PASSO_MS){
    v.ultimoPasso=agora;
    v.historico.push(v.pico);
    v.niveis.push(v.pico);
    if(v.niveis.length>BARRAS)v.niveis.shift();
    v.pico=0;
    var bs=$("vozOnda").children,ini=BARRAS-v.niveis.length;
    for(var i=0;i<bs.length;i++)bs[i].style.setProperty("--n",i<ini?.1:Math.max(.1,v.niveis[i-ini]).toFixed(2));
  }
  var seg=(agora-v.inicio)/1000,t=$("vozTempo");
  t.textContent=duracao(Math.floor(seg));
  t.classList.toggle("fim",seg>=AVISO_SEG);
  if(seg>=MAX_SEG)return terminarVoz();
  v.quadro=requestAnimationFrame(passo);
}

function lerNivel(){
  if(!v.analise)return .12+Math.random()*.1;
  v.analise.getByteTimeDomainData(v.amostra);
  var soma=0;
  for(var i=0;i<v.amostra.length;i++){var x=(v.amostra[i]-128)/128;soma+=x*x}
  return Math.min(1,Math.sqrt(Math.sqrt(soma/v.amostra.length))*1.6);
}

// para e manda o áudio pro chat
export function terminarVoz(){
  if(v.estado==="pedindo")return cancelarVoz();
  if(v.estado!=="gravando")return;
  var seg=(performance.now()-v.inicio)/1000,rec=v.rec,partes=v.partes,onda=resumir(v.historico,BARRAS_MSG);
  if(seg<MIN_SEG){
    soltar();
    return nota("Curto demais. Toque no microfone, fale e toque de novo pra enviar; ou segure enquanto fala.");
  }
  rec.onstop=function(){
    var audio=new Blob(partes,{type:rec.mimeType||(partes[0]&&partes[0].type)||"audio/webm"});
    if(audio.size&&aoGravar)aoGravar(audio,{segundos:Math.round(seg*10)/10,onda:onda});
  };
  soltar();
  var t=$("iaTexto");
  if(t&&!t.disabled&&matchMedia("(hover:hover)").matches)t.focus();
}

export function cancelarVoz(){
  if(v.estado==="parado")return;
  if(v.rec)v.rec.onstop=null;
  soltar();
}

// devolve microfone, áudio e tela ao normal
function soltar(){
  var r=v;
  v={estado:"parado"};
  cancelAnimationFrame(r.quadro);
  if(r.rec&&r.rec.state!=="inactive"){try{r.rec.stop()}catch(e){}}
  if(r.stream)r.stream.getTracks().forEach(function(t){t.stop()});
  if(r.ctx&&r.ctx.close){try{r.ctx.close()}catch(e){}}
  pintar();
}

function pintar(){
  var mic=$("iaMic");
  if(!mic)return;
  var campo=mic.closest(".ia-campo"),faixa=$("vozFaixa"),ativo=v.estado!=="parado";
  campo.classList.toggle("gravando",v.estado==="gravando");
  campo.classList.toggle("pedindo",v.estado==="pedindo");
  faixa.hidden=v.estado!=="gravando";
  mic.setAttribute("aria-pressed",ativo?"true":"false");
  mic.setAttribute("aria-label",ativo?"Parar e enviar o áudio":"Falar com a Alice");
  mic.title=ativo?"Parar e enviar":"Falar: toque ou segure";
  if(!ativo){
    mic.style.removeProperty("--nivel");
    var bs=$("vozOnda").children;
    for(var i=0;i<bs.length;i++)bs[i].style.removeProperty("--n");
    $("vozTempo").textContent="0:00";
    $("vozTempo").classList.remove("fim");
  }
  if(v.estado==="pedindo")nota("Permita o uso do microfone no aviso do navegador.");
  else if(v.estado==="gravando")nota(v.segurando?"solte pra enviar":
    "toque no microfone pra enviar"+(matchMedia("(hover:hover)").matches?" · esc cancela":""));
  else if(!$("vozNota")||!$("vozNota").classList.contains("erro"))nota("");
}

function nota(txt,erro){
  var n=$("vozNota");
  if(!n)return erro&&txt?toast(txt):undefined;
  n.textContent=txt||"";
  n.hidden=!txt;
  n.classList.toggle("erro",!!erro);
}

export function limparNotaVoz(){
  if(v.estado==="parado")nota("");
}

function erroMicrofone(e){
  var n=e&&e.name;
  if(n==="NotAllowedError"||n==="SecurityError")
    return "O navegador bloqueou o microfone. Libere nas permissões do site (no Safari: Ajustes › Sites › Microfone) e tente de novo.";
  if(n==="NotFoundError"||n==="OverconstrainedError")return "Não achei nenhum microfone neste aparelho.";
  if(n==="NotReadableError"||n==="AbortError")return "O microfone está ocupado por outro app. Feche o outro app e tente de novo.";
  return "Não deu pra abrir o microfone agora.";
}

// a gravação inteira vira poucas barrinhas: o pico de cada pedaço
function resumir(h,q){
  if(!h.length)return [];
  var out=[],tam=h.length/q;
  for(var i=0;i<q;i++){
    var a=Math.floor(i*tam),b=Math.max(a+1,Math.floor((i+1)*tam)),m=0;
    for(var j=a;j<b&&j<h.length;j++)m=Math.max(m,h[j]);
    out.push(+Math.max(.14,m).toFixed(2));
  }
  return out;
}
