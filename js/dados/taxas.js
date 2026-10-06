// Taxas oficiais da API pública do Banco Central (SGS). Ela libera CORS, então o navegador busca direto.
// Cada taxa: {valor (em %), data "dd/mm/aaaa"}. Guarda no aparelho por 12h; se a busca falhar,
// devolve o que estava guardado com velho:true (ou null se nunca buscou).

var CHAVE="bach.taxas",VALIDADE=12*3600*1000,TEMPO_MAX=8000;
var SERIES={selic:432,cdi:4389,ipca12m:13522,poupancaMes:195};
var emAndamento=null;

export function taxasGuardadas(){
  try{var t=JSON.parse(localStorage.getItem(CHAVE));if(t&&t.cdi)return t}catch(e){}
  return null;
}

function hojeBR(){
  var d=new Date();
  return (d.getDate()<10?"0":"")+d.getDate()+"/"+(d.getMonth()<9?"0":"")+(d.getMonth()+1)+"/"+d.getFullYear();
}

// a série da meta Selic já traz o valor vigente até a próxima reunião, com data no futuro
function dataAteHoje(br){
  var p=String(br||"").split("/"),d=new Date(+p[2],+p[1]-1,+p[0]);
  return isNaN(d)||d>new Date()?hojeBR():br;
}

function buscarSerie(cod){
  var ctrl=typeof AbortController!=="undefined"?new AbortController():null;
  var tm=ctrl?setTimeout(function(){ctrl.abort()},TEMPO_MAX):0;
  return fetch("https://api.bcb.gov.br/dados/serie/bcdata.sgs."+cod+"/dados/ultimos/1?formato=json",
               ctrl?{signal:ctrl.signal}:undefined)
    .then(function(r){if(!r.ok)throw new Error("HTTP "+r.status);return r.json()})
    .then(function(a){
      clearTimeout(tm);
      var x=a[a.length-1],v=parseFloat(String(x.valor).replace(",","."));
      if(!isFinite(v))throw new Error("valor inválido");
      return {valor:v,data:dataAteHoje(x.data)};
    })
    .catch(function(){clearTimeout(tm);return null});
}

export function carregarTaxas(forcar){
  var g=taxasGuardadas();
  if(!forcar&&g&&!g.velho&&Date.now()-g.atualizadoEm<VALIDADE)return Promise.resolve(g);
  if(emAndamento)return emAndamento;
  var nomes=Object.keys(SERIES);
  emAndamento=Promise.all(nomes.map(function(n){return buscarSerie(SERIES[n])})).then(function(vals){
    var t={fonte:"Banco Central do Brasil",atualizadoEm:Date.now(),velho:false},faltou=false;
    nomes.forEach(function(n,i){
      if(vals[i])t[n]=vals[i];
      else if(g&&g[n]){t[n]=g[n];faltou=true}
      else{t[n]=null;faltou=true}
    });
    if(!t.cdi)return g?Object.assign({},g,{velho:true}):null;
    if(faltou)t.velho=true;
    else try{localStorage.setItem(CHAVE,JSON.stringify(t))}catch(e){}
    return t;
  }).then(function(t){emAndamento=null;return t},function(){emAndamento=null;return g?Object.assign({},g,{velho:true}):null});
  return emAndamento;
}
