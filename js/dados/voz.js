// Transforma em texto o áudio gravado no chat da assistente.
// A tela (js/ui/voz.js) grava, mostra o áudio na conversa e chama esta função;
// o envio pro servidor e o Whisper do Groq entram aqui.
//
// audio: Blob do MediaRecorder, mono, ~32 kbps, até 60 s
//        (audio/webm;codecs=opus no Chrome e no Firefox, audio/mp4 no Safari e no iPhone).
// info:  {segundos} duração da gravação.
// Devolve Promise<string> com o que a pessoa falou; texto vazio = não tinha fala no áudio.
// Em erro, rejeite com e.codigo: os códigos do chat ("limite" + e.espera, "login", "sem_acesso", "sem_chave"…)
// e os da voz ("sem_fala", "audio_grande", "voz_desligada") já têm mensagem pronta na tela.
export function transcreverAudio(audio,info){
  var e=new Error("voz_desligada");
  e.codigo="voz_desligada";
  return Promise.reject(e);
}
