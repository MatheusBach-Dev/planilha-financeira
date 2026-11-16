import {HOJE_ISO, cent, hoje, isoData, key, maisDias} from "../core/datas.js";
import {mesLeitura} from "../core/estado.js";
import {adicionarLancamento} from "../core/lancamentos.js";
import {valorPagamento} from "../core/pagamento.js";
import {salvarMes} from "./persistencia.js";
import {sessao} from "./sessao.js";

// Ligação com os bancos (Meu Pluggy). O servidor só LÊ as movimentações (api/pluggy-movimentos.js);
// quem guarda é o app, com o login da pessoa, num documento só dela: users/{uid}/config/bancos.
//
// Documento:
//   ativo, desde ("aaaa-mm-dd": não traz nada antes), buscaEm (ms da última busca), conexoes: [...]
//   pend: {id da transação no banco: pendente}   o id do banco é a chave, então nada entra duas vezes
//   regras: {chave do estabelecimento: {tipo, desc, cat}}   o que a pessoa escolheu da última vez
// Pendente: d (data), v (valor), s ("entrada"|"saida"), t (descrição do banco), e (estabelecimento),
//   c (categoria da Pluggy), b (banco), m (meio), st ("novo"|"lancado"|"ignorado"|"ligado"),
//   mot (por que foi ignorado), l ({k, id} do lançamento), em (ms da última mudança)

export var bancos={cfg:null,carregado:false,buscando:false,erro:null,erroRegra:false};

var INTERVALO=30*60000;      // ao abrir o app, busca de novo se a última busca foi há mais de 30 min
var JANELA=30;               // dias pra trás que cada busca olha
var GUARDAR=50;              // revisados com mais de 50 dias saem do documento
var SO_LEITURA={ok:false,msg:"Você tem acesso só de leitura aqui."};

function ref(){return sessao.api.fs.doc(sessao.fsdb,"users",sessao.usuarioId,"config","bancos")}

function isoDe(dt){return isoData(dt.getFullYear(),dt.getMonth(),dt.getDate())}

function dataDe(iso){var p=String(iso).split("-");return new Date(+p[0],+p[1]-1,+p[2])}

// ————— servidor —————

function pedirServidor(caminho,corpo){
  if(!sessao.user)return Promise.resolve({ok:false,status:0,dados:{erro:"login"}});
  return sessao.user.getIdToken().then(function(token){
    return fetch(caminho,{
      method:"POST",
      headers:{"Content-Type":"application/json","Authorization":"Bearer "+token},
      body:JSON.stringify(corpo)
    });
  }).then(function(r){
    return r.json().catch(function(){return null}).then(function(d){
      return {ok:r.ok&&!!d,status:r.status,dados:d||{erro:"sem_servidor"}};
    });
  }).catch(function(){return {ok:false,status:0,dados:{erro:"rede"}}});
}

// tela de teste da fase (a): devolve sempre {ok, status, dados}
export function testarBancos(corpo){return pedirServidor("/api/pluggy-teste",corpo)}

// ————— sugestão: tipo, nome e categoria —————

var PREFIXO=/^(compra\s+(no\s+)?d[eé]bito|compra\s+no\s+cr[eé]dito|pagamento\s+de\s+pix(\s+qr\s+code)?|pix\s+(enviado|recebido)|pagamento\s+de\s+boleto|pagamento|transfer[eê]ncia\s+(enviada|recebida)|ted\s+(enviada|recebida)|ted|doc)\b\s*[-:–]?\s*/i;
var SUFIXO=/[\s,]+(ltda|s\.?\s?a|me|eireli|epp|tecnologia|servicos|serviços|comercio|comércio)\.?$/i;
var MINUSCULAS={de:1,da:1,do:1,das:1,dos:1,e:1};

export function limparDesc(t){
  var s=String(t||"").replace(PREFIXO,"").trim();
  for(var i=0;i<3;i++)s=s.replace(SUFIXO,"").trim();
  if(s&&s===s.toUpperCase()){
    s=s.toLowerCase().split(/\s+/).map(function(p,i){
      return i&&MINUSCULAS[p]?p:p.charAt(0).toUpperCase()+p.slice(1);
    }).join(" ");
  }
  return (s||String(t||"").trim()||"banco").slice(0,60);
}

// mesma loja ou mesma pessoa do Pix dá a mesma chave, independente de número de pedido ou data
export function chaveRegra(p){
  var base=p.e||String(p.t||"").replace(PREFIXO,"");
  return base.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"")
    .replace(/[^a-z]+/g," ").replace(/\b(ltda|sa|s a|me|eireli|epp)\b/g," ").replace(/\s+/g," ").trim().slice(0,40);
}

// categoria da Pluggy (em inglês) → tipo e categoria do app. A ordem importa: "taxi" antes de "tax".
var MAPA=[
  [/groceries|supermarket/i,"diario","Mercado"],
  [/eating out|restaurant|food delivery|bakery|coffee|\bbars?\b/i,"diario","Comida"],
  [/taxi|ride.hailing|transport|fuel|gas station|parking|toll|mobility/i,"diario","Transporte"],
  [/pharmacy|drugstore|health|hospital|doctor|dentist|clinic/i,"diario","Saúde"],
  [/clothing|apparel/i,"diario","Roupa"],
  [/gym|sport|fitness/i,"diario","Esporte"],
  [/\bpets?\b/i,"diario","Pet"],
  [/beauty|salon|barber/i,"diario","Beleza"],
  [/education|university|school|course|tuition/i,"saida","Educação"],
  [/\brent\b|housing|condominium/i,"saida","Aluguel"],
  [/electricity|water|utilities|\bgas\b/i,"saida","Contas de casa"],
  [/telecom|internet|mobile|phone|cable/i,"saida","Internet e telefone"],
  [/streaming|subscription|digital services|software/i,"saida","Assinaturas"],
  [/insurance/i,"saida","Seguro"],
  [/\btax(es)?\b|government/i,"saida","Impostos"],
  [/credit card/i,"saida","Fatura do cartão"],
  [/loan|financing|installment/i,"saida","Parcela ou empréstimo"],
  [/investment|savings/i,"economia","Renda fixa"]
];

export function entreContas(p){return /same person transfer/i.test(p.c||"")}

export function sugestao(p){
  var regra=bancos.cfg&&bancos.cfg.regras&&bancos.cfg.regras[chaveRegra(p)];
  if(regra&&regra.tipo&&((regra.tipo==="entrada")===(p.s==="entrada")))
    return {tipo:regra.tipo,desc:regra.desc||limparDesc(p.e||p.t),cat:regra.cat||"",aprendida:true};
  // no Pix o "estabelecimento" costuma ser só a razão social; a descrição traz o nome que a pessoa reconhece
  var desc=limparDesc(p.e&&!/pix/i.test(p.m||"")?p.e:p.t);
  if(p.s==="entrada"){
    if(/salary|payroll/i.test(p.c||""))return {tipo:"entrada",desc:desc,cat:"Salário"};
    if(/investment/i.test(p.c||""))return {tipo:"entrada",desc:desc,cat:"Outros"};
    return {tipo:"entrada",desc:desc,cat:""};
  }
  for(var i=0;i<MAPA.length;i++){
    if(MAPA[i][0].test(p.c||""))return {tipo:MAPA[i][1],desc:desc,cat:MAPA[i][2]};
  }
  return {tipo:"diario",desc:desc,cat:""};
}

// ————— conciliação simples: o que talvez já esteja na planilha —————

function lancamentosLigados(){
  var usados={},pend=(bancos.cfg&&bancos.cfg.pend)||{};
  Object.keys(pend).forEach(function(id){var l=pend[id].l;if(l&&l.id)usados[l.id]=1});
  return usados;
}

// {lanc, k} se já tem lançamento com o mesmo valor no mesmo dia (ou um dia antes ou depois);
// {salario:true} se parece o salário, que já entra sozinho pela regra de recebimento
export function parecido(p){
  var usados=lancamentosLigados(),base=dataDe(p.d),achado=null;
  [0,-1,1].some(function(off){
    var dt=maisDias(base,off),k=key(dt.getFullYear(),dt.getMonth());
    mesLeitura(k).lancamentos.some(function(l){
      if(l.dia!==dt.getDate()||usados[l.id])return false;
      if((l.tipo==="entrada")!==(p.s==="entrada"))return false;
      if(Math.abs((+l.valor||0)-p.v)>=0.005)return false;
      achado={lanc:l,k:k};return true;
    });
    return !!achado;
  });
  if(achado)return achado;
  if(p.s==="entrada"){
    var sal=valorPagamento(base.getFullYear(),base.getMonth());
    if(sal>0&&Math.abs(p.v-sal)<=sal*0.05)return {salario:true};
  }
  return null;
}

// ————— leitura e busca —————

export function assinarBancos(aoMudar){
  var F=sessao.api.fs;
  bancos.cfg=null;bancos.carregado=false;bancos.erroRegra=false;bancos.erro=null;
  return F.onSnapshot(ref(),function(snap){
    bancos.cfg=snap.exists()?snap.data():null;
    bancos.carregado=true;bancos.erroRegra=false;
    if(bancos.cfg&&bancos.cfg.ativo)sincronizarBancos(false,aoMudar);
    aoMudar();
  },function(e){
    bancos.carregado=true;
    bancos.erroRegra=!!(e&&e.code==="permission-denied");
    aoMudar();
  });
}

function paraPendente(m){
  var p={d:m.data,v:cent(+m.valor),s:m.sentido==="entrada"?"entrada":"saida",t:String(m.descricao||""),
         e:String(m.estabelecimento||""),c:String(m.categoria||""),b:String(m.banco||""),m:String(m.meio||""),
         st:"novo",em:Date.now()};
  if(entreContas(p)){p.st="ignorado";p.mot="entre suas contas"}
  return p;
}

// grava só o que ainda não existe: uma transação revisada nunca volta pra lista
function gravarMovimentos(dados,desde){
  var F=sessao.api.fs,r=ref();
  return F.runTransaction(sessao.fsdb,function(tx){
    return tx.get(r).then(function(snap){
      var atual=snap.exists()?snap.data():{},pend=atual.pend||{},novos={},n=0;
      var inicio=desde||atual.desde||"";
      (dados.movimentos||[]).forEach(function(m){
        if(!m||!m.id||pend[m.id]||novos[m.id])return;
        if(m.status==="PENDING")return;           // espera o banco confirmar
        if(!/^\d{4}-\d{2}-\d{2}$/.test(m.data||"")||m.data<inicio)return;
        if(!(+m.valor>0))return;
        novos[m.id]=paraPendente(m);
        if(novos[m.id].st==="novo")n++;
      });
      var limite=isoDe(maisDias(hoje,-GUARDAR));
      Object.keys(pend).forEach(function(id){
        if(pend[id].st!=="novo"&&String(pend[id].d)<limite)novos[id]=F.deleteField();
      });
      var muda={buscaEm:Date.now(),conexoes:dados.conexoes||[],pend:novos};
      if(desde){muda.desde=desde;muda.ativo=true}
      tx.set(r,muda,{merge:true});
      return n;
    });
  });
}

var ERROS={
  login:"Entre na sua conta pra buscar no banco.",
  sem_acesso:"Esta parte é só da conta dona das conexões.",
  sem_servidor:"O servidor não respondeu. A busca só funciona no site publicado na Vercel.",
  rede:"Sem conexão agora. Tente de novo.",
  regra:"O Firestore não deixou gravar em config/bancos. Confira a regra no console do Firebase (docs/bancos.md).",
  login_indisponivel:"Não deu pra conferir o login agora. Tente de novo."
};

export function textoErro(d){
  d=d||{};
  if(d.erro==="sem_config")return "Falta configurar na Vercel: "+(d.falta||[]).join(", ")+"."+
    (d.seuUid?" O valor de DONO_UID pra esta conta é "+d.seuUid+".":"");
  if(d.erro==="pluggy")return "A Pluggy recusou o pedido: "+(d.detalhe||"sem detalhe")+".";
  return ERROS[d.erro]||"Não deu certo ("+(d.erro||"erro")+").";
}

function erroGravar(e){return textoErro({erro:e&&e.code==="permission-denied"?"regra":"rede"})}

function janela(desde){
  var min=isoDe(maisDias(hoje,-JANELA));
  return desde&&desde>min?desde:min;
}

// forcar=true ignora o intervalo de 30 min. Devolve {ok, novos, msg}
export function sincronizarBancos(forcar,aoMudar){
  var c=bancos.cfg;
  if(!c||!c.ativo||bancos.buscando||sessao.readOnly)return Promise.resolve({ok:false,novos:0});
  if(!forcar&&Date.now()-(+c.buscaEm||0)<INTERVALO)return Promise.resolve({ok:true,novos:0});
  bancos.buscando=true;bancos.erro=null;
  if(aoMudar)aoMudar();
  return pedirServidor("/api/pluggy-movimentos",{desde:janela(c.desde)}).then(function(r){
    if(!r.ok){bancos.erro=textoErro(r.dados);return {ok:false,novos:0,msg:bancos.erro}}
    return gravarMovimentos(r.dados,null).then(function(n){return {ok:true,novos:n}});
  }).catch(function(e){
    bancos.erro=erroGravar(e);
    return {ok:false,novos:0,msg:bancos.erro};
  }).then(function(res){
    bancos.buscando=false;
    if(aoMudar)aoMudar();
    return res;
  });
}

// liga a revisão automática: o servidor confere que é a conta dona antes de qualquer gravação
export function ligarBancos(desde,aoMudar){
  if(sessao.readOnly)return Promise.resolve(SO_LEITURA);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(desde||""))return Promise.resolve({ok:false,msg:"Escolha a data de início."});
  if(desde>HOJE_ISO)desde=HOJE_ISO;
  bancos.buscando=true;bancos.erro=null;aoMudar();
  return pedirServidor("/api/pluggy-movimentos",{desde:janela(desde)}).then(function(r){
    if(!r.ok)return {ok:false,msg:textoErro(r.dados)};
    return gravarMovimentos(r.dados,desde).then(function(n){
      return {ok:true,msg:n?n+(n===1?" movimentação chegou":" movimentações chegaram")+" pra revisar.":"Ligado. Nada novo pra revisar agora."};
    });
  }).catch(function(e){
    return {ok:false,msg:erroGravar(e)};
  }).then(function(res){
    bancos.buscando=false;
    if(!res.ok)bancos.erro=res.msg;
    aoMudar();
    return res;
  });
}

export function desligarBancos(){
  if(sessao.readOnly)return Promise.resolve(SO_LEITURA);
  return sessao.api.fs.setDoc(ref(),{ativo:false},{merge:true})
    .then(function(){return {ok:true,msg:"Revisão automática desligada."}})
    .catch(function(e){return {ok:false,msg:erroGravar(e)}});
}

// ————— revisar —————

export function pendentes(st){
  var pend=(bancos.cfg&&bancos.cfg.pend)||{};
  return Object.keys(pend).filter(function(id){return pend[id].st===st}).map(function(id){
    return Object.assign({id:id},pend[id]);
  }).sort(function(a,b){return a.d<b.d?1:a.d>b.d?-1:a.id<b.id?-1:1});
}

// muda campos de um pendente (null apaga o campo) e, se vier, guarda uma regra aprendida
function mudarPendente(id,campos,regra){
  var F=sessao.api.fs,args=[];
  Object.keys(campos).forEach(function(c){
    args.push(new F.FieldPath("pend",id,c),campos[c]===null?F.deleteField():campos[c]);
  });
  if(regra)args.push(new F.FieldPath("regras",regra.chave),{tipo:regra.tipo,desc:regra.desc,cat:regra.cat});
  // já mostra mudado; o snapshot do Firestore confirma em seguida
  var p=bancos.cfg&&bancos.cfg.pend&&bancos.cfg.pend[id];
  if(p)Object.keys(campos).forEach(function(c){if(campos[c]===null)delete p[c];else p[c]=campos[c]});
  if(regra&&bancos.cfg){
    bancos.cfg.regras=bancos.cfg.regras||{};
    bancos.cfg.regras[regra.chave]={tipo:regra.tipo,desc:regra.desc,cat:regra.cat};
  }
  return F.updateDoc.apply(null,[ref()].concat(args));
}

function pegar(id){
  var p=bancos.cfg&&bancos.cfg.pend&&bancos.cfg.pend[id];
  return p?Object.assign({id:id},p):null;
}

var TIPOS={diario:1,saida:1,entrada:1,economia:1};

// escolha: {tipo, desc, cat}. Lança no mês da data do banco e guarda a escolha pra próxima vez.
// Devolve {ok, msg, gravado}: gravado é a promessa da marcação no Firestore.
export function lancarPendente(id,escolha){
  if(sessao.readOnly)return SO_LEITURA;
  var p=pegar(id);
  if(!p||p.st!=="novo")return {ok:false,msg:"Essa movimentação já foi revisada."};
  var tipo=TIPOS[escolha.tipo]?escolha.tipo:"diario";
  var desc=String(escolha.desc||"").trim().slice(0,60)||limparDesc(p.t);
  var dt=dataDe(p.d),k=key(dt.getFullYear(),dt.getMonth());
  var novo=adicionarLancamento(k,{desc:desc,dia:dt.getDate(),tipo:tipo,valor:p.v,cartao:false,cat:escolha.cat||""});
  salvarMes(k);
  var chave=chaveRegra(p);
  var gravado=mudarPendente(id,{st:"lancado",l:{k:k,id:novo.id},em:Date.now()},
    chave?{chave:chave,tipo:tipo,desc:desc,cat:escolha.cat||""}:null);
  return {ok:true,msg:"Lançado: "+desc+".",gravado:gravado};
}

// "é o mesmo": a movimentação do banco já está na planilha
export function ligarPendente(id,k,lancId){
  if(sessao.readOnly)return SO_LEITURA;
  var p=pegar(id);
  if(!p||p.st!=="novo")return {ok:false,msg:"Essa movimentação já foi revisada."};
  return {ok:true,msg:"Ok, já estava na planilha.",gravado:mudarPendente(id,{st:"ligado",l:{k:k,id:lancId},em:Date.now()})};
}

export function ignorarPendente(id,motivo){
  if(sessao.readOnly)return SO_LEITURA;
  var p=pegar(id);
  if(!p||p.st!=="novo")return {ok:false,msg:"Essa movimentação já foi revisada."};
  var campos={st:"ignorado",em:Date.now()};
  if(motivo)campos.mot=motivo;
  return {ok:true,msg:"Ignorada. Dá pra trazer de volta em “ignoradas”.",gravado:mudarPendente(id,campos)};
}

export function voltarPendente(id){
  if(sessao.readOnly)return SO_LEITURA;
  var p=pegar(id);
  if(!p||p.st!=="ignorado")return {ok:false,msg:"Essa movimentação não está nas ignoradas."};
  return {ok:true,msg:"Voltou pra lista a revisar.",gravado:mudarPendente(id,{st:"novo",mot:null,em:Date.now()})};
}
