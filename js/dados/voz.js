import {chamarServidor, erroIA} from "./ia.js";

// Transforma em texto o áudio gravado no chat da assistente.
// A tela (js/ui/voz.js) grava, mostra o áudio na conversa e chama esta função;
// aqui o áudio vai pro servidor (api/transcrever.js), que usa o Whisper do Groq.
//
// audio: Blob do MediaRecorder, mono, ~32 kbps, até 60 s
//        (audio/webm;codecs=opus no Chrome e no Firefox, audio/mp4 no Safari e no iPhone).
// info:  {segundos} duração da gravação.
// Devolve Promise<string> com o que a pessoa falou; texto vazio = não tinha fala no áudio.
// Em erro, rejeita com e.codigo: os códigos do chat ("limite" + e.espera, "login", "sem_acesso", "sem_chave"…)
// e os da voz ("sem_fala", "audio_grande", "audio_invalido") já têm mensagem pronta na tela.

// O servidor aceita até 3 MB (em base64 cabe nos 4,5 MB por pedido da Vercel).
// 60 s a 32 kbps dão ~250 KB; o teto folgado é pro Safari, que ignora o bitrate pedido.
var MAX_BYTES=3*1024*1024;

export function transcreverAudio(audio,info){
  if(!audio||!audio.size)return Promise.reject(erroIA("sem_fala"));
  if(audio.size>MAX_BYTES)return Promise.reject(erroIA("audio_grande"));
  return paraBase64(audio).then(function(b64){
    return chamarServidor("/api/transcrever",{audio:b64,tipo:audio.type||"audio/webm",segundos:+(info&&info.segundos)||0});
  }).then(function(d){
    return String(d.texto||"");
  }).catch(function(e){
    // pedido acima do limite da Vercel volta sem JSON
    if(e&&e.codigo==="servidor"&&e.detalhe==="http 413")throw erroIA("audio_grande");
    throw e;
  });
}

function paraBase64(blob){
  return new Promise(function(ok,falha){
    var r=new FileReader();
    r.onload=function(){var s=String(r.result||"");ok(s.slice(s.indexOf(",")+1))};
    r.onerror=function(){falha(erroIA("audio_invalido"))};
    r.readAsDataURL(blob);
  });
}
