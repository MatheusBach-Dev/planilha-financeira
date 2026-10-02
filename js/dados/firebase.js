import {FB_VER, FIREBASE_CONFIG} from "../config.js";
import {localLoad, localSave, normalizarConfig, state, temDados} from "../core/estado.js";
import {$} from "../core/formato.js";
import {conectar} from "./claude.js";
import {salvarConfig, salvarMes} from "./persistencia.js";
import {sessao} from "./sessao.js";
import {render} from "../ui/render.js";
import {aplicarTema} from "../ui/tema.js";
import {toast} from "../ui/toast.js";

export function temFirebase(){
  return !!(FIREBASE_CONFIG&&FIREBASE_CONFIG.apiKey&&FIREBASE_CONFIG.projectId);
}

export function mostrarLogin(txt,msg,erro){
  var l=$("login");
  if(!l)return;
  l.hidden=false;
  $("loginTxt").textContent=txt||"Entre com sua conta Google pra ver seus saldos em qualquer aparelho.";
  $("btnGoogle").hidden=!!erro||!sessao.pronto;
  var m=$("loginMsg");
  m.textContent=msg||"";
  m.classList.toggle("erro",!!erro);
}

export function esconderLogin(){var l=$("login");if(l)l.hidden=true}

export function conectarFirebase(){
  if(!temFirebase())return false;
  mostrarLogin("Carregando…","");
  Promise.all([
    import("https://www.gstatic.com/firebasejs/"+FB_VER+"/firebase-app.js"),
    import("https://www.gstatic.com/firebasejs/"+FB_VER+"/firebase-auth.js"),
    import("https://www.gstatic.com/firebasejs/"+FB_VER+"/firebase-firestore.js")
  ]).then(function(m){
    var app=m[0].initializeApp(FIREBASE_CONFIG);
    sessao.api={auth:m[1],fs:m[2]};
    sessao.auth=m[1].getAuth(app);
    sessao.fsdb=m[2].getFirestore(app);
    sessao.pronto=true;
    m[1].onAuthStateChanged(sessao.auth,function(u){
      sessao.user=u||null;
      if(u){sessao.usuarioId=u.uid;entrouNaConta()}
      else{sessao.usuarioId=null;soltarFirestore();mostrarLogin()}
    });
  }).catch(function(e){
    mostrarLogin("Não deu pra carregar o Firebase aqui.",
      "Isso é esperado dentro do Claude: o login só funciona no endereço onde você hospedar. Seus dados continuam salvos neste navegador.",true);
    setTimeout(esconderLogin,50);
    conectar();
  });
  return true;
}

export function entrarGoogle(){
  if(!sessao.pronto)return;
  var A=sessao.api.auth;
  A.signInWithPopup(sessao.auth,new A.GoogleAuthProvider()).catch(function(e){
    var c=(e&&e.code)||"";
    var msg=c.indexOf("popup-blocked")>=0?"Seu navegador bloqueou a janela. Libere os pop-ups e tente de novo."
      :c.indexOf("unauthorized-domain")>=0?"Este endereço não está liberado no Firebase. Adicione-o em Authentication > Settings > Authorized domains."
      :c.indexOf("popup-closed")>=0?"Você fechou a janela antes de concluir."
      :(e&&e.message)||"Não deu pra entrar.";
    mostrarLogin(null,msg,true);
  });
}

export function sairDaConta(){
  if(!sessao.pronto)return;
  sessao.api.auth.signOut(sessao.auth).then(function(){
    state.meses={};state.config=normalizarConfig({});
    render();
  });
}

export function entrouNaConta(){
  esconderLogin();
  state.meses={};
  state.config=normalizarConfig({});
  sessao.syncMeses=false;sessao.syncConfig=false;
  localLoad();
  aplicarTema();
  render();
  assinarFirestore();
}

export function soltarFirestore(){
  sessao.unsub.forEach(function(f){try{f()}catch(e){}});
  sessao.unsub=[];
}

export function assinarFirestore(){
  soltarFirestore();
  var F=sessao.api.fs;
  var erro=function(e){toast("Sem conexão com os dados agora.")};
  sessao.unsub.push(F.onSnapshot(F.doc(sessao.fsdb,"users",sessao.usuarioId,"config","geral"),function(snap){
    if(snap.exists())state.config=normalizarConfig(Object.assign({},state.config,snap.data()));
    else if(!sessao.syncConfig)salvarConfig();
    sessao.syncConfig=true;
    aplicarTema();localSave();render();
  },erro));
  sessao.unsub.push(F.onSnapshot(F.collection(sessao.fsdb,"users",sessao.usuarioId,"meses"),function(snap){
    var remoto={};
    snap.forEach(function(d){
      var x=d.data()||{};
      remoto[d.id]={lancamentos:(x.lancamentos||[]).slice(),
                    conferidos:(x.conferidos||[]).slice(),
                    pulados:(x.pulados||[]).slice(),
                    rebases:(x.rebases||[]).slice()};
    });
    if(!sessao.syncMeses){
      sessao.syncMeses=true;
      Object.keys(state.meses).forEach(function(k){
        if(!remoto[k]&&temDados(state.meses[k])){remoto[k]=state.meses[k];salvarMes(k)}
      });
    }
    state.meses=remoto;localSave();render();
  },erro));
}
