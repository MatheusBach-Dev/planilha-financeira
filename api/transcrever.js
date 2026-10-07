// Transforma em texto o áudio gravado no chat da assistente, usando o Whisper do Groq (plano grátis).
// Usa a mesma chave e o mesmo login do chat; o texto volta pro navegador, que manda pro chat como
// se a pessoa tivesse digitado.
//
// Variáveis de ambiente:
//   GROQ_API_KEY     obrigatória (a mesma do chat)
//   GROQ_MODEL_VOZ   opcional, troca o modelo (padrão: whisper-large-v3)
//   IA_EMAILS        opcional, mesma regra do chat

const {exigirLogin, lerCorpo} = require("./_comum.js");

const MODELO = process.env.GROQ_MODEL_VOZ || "whisper-large-v3";
const URL_GROQ = "https://api.groq.com/openai/v1/audio/transcriptions";

// 60 s a ~32 kbps dão ~250 KB; o teto folgado cobre o Safari, que ignora o bitrate pedido.
// Em base64 isso ainda fica abaixo dos 4,5 MB que a Vercel aceita por pedido.
const MAX_BYTES = 3 * 1024 * 1024;

const EXTENSAO = {
  "audio/webm": "webm", "video/webm": "webm", "audio/ogg": "ogg",
  "audio/mp4": "mp4", "video/mp4": "mp4", "audio/x-m4a": "m4a", "audio/m4a": "m4a",
  "audio/mpeg": "mp3", "audio/wav": "wav", "audio/x-wav": "wav", "audio/flac": "flac"
};

// Frases no jeito que o app usa: puxa o Whisper pra números em algarismos e pros nomes do dia a dia.
const DICA = "Gastei 32 reais no almoço. Lança 150 de freela. Apaga o Uber de ontem. Quanto gastei de mercado este mês?";

// No silêncio ou no ruído, o Whisper às vezes "ouve" frases de legenda de vídeo.
const INVENTADAS = /amara\.org|legendas? (pela|por|de)\b|obrigad[oa] por assistir|inscreva-se|se inscreva|subt[ií]tulos/i;

// Junta o que foi falado, sem os trechos que o próprio Whisper marca como provável silêncio
// (mesma regra do Whisper original) e sem as frases inventadas.
function textoFalado(dados) {
  const segs = Array.isArray(dados.segments) ? dados.segments : null;
  const bruto = segs
    ? segs.filter(function (s) { return !(+s.no_speech_prob > 0.6 && +s.avg_logprob < -1); })
        .map(function (s) { return String(s.text || ""); }).join(" ")
    : String(dados.text || "");
  const texto = bruto.replace(/\s+/g, " ").trim().split(/(?<=[.!?…])\s+/)
    .filter(function (f) { return !INVENTADAS.test(f); }).join(" ").trim();
  return /[\p{L}\p{N}]/u.test(texto) ? texto.slice(0, 500) : "";
}

module.exports = async function (req, res) {
  if (!(await exigirLogin(req, res))) return;

  const corpo = lerCorpo(req) || {};
  const b64 = typeof corpo.audio === "string" ? corpo.audio : "";
  if (!b64) return res.status(400).json({erro: "pedido"});
  if (b64.length > Math.ceil(MAX_BYTES / 3) * 4 + 4) return res.status(413).json({erro: "audio_grande"});
  const audio = Buffer.from(b64, "base64");
  if (!audio.length) return res.status(400).json({erro: "pedido"});

  const tipo = String(corpo.tipo || "").split(";")[0].trim().toLowerCase();
  const form = new FormData();
  form.append("file", new Blob([audio], {type: EXTENSAO[tipo] ? tipo : "audio/webm"}), "audio." + (EXTENSAO[tipo] || "webm"));
  form.append("model", MODELO);
  form.append("language", "pt");
  form.append("prompt", DICA);
  form.append("temperature", "0");
  form.append("response_format", "verbose_json");

  let r, dados;
  try {
    r = await fetch(URL_GROQ, {method: "POST", headers: {Authorization: "Bearer " + process.env.GROQ_API_KEY}, body: form});
    dados = await r.json().catch(function () { return {}; });
  } catch (e) {
    console.error("[voz] Groq fora do ar:", e.message);
    return res.status(502).json({erro: "ia_fora"});
  }

  if (r.status === 429) {
    return res.status(429).json({erro: "limite", espera: Math.ceil(+r.headers.get("retry-after") || 60)});
  }
  if (!r.ok) {
    const e = (dados && dados.error) || {};
    const codigo = String(e.code || e.type || "").slice(0, 60);
    console.error("[voz] Groq respondeu", r.status, codigo, "modelo", MODELO);
    if (r.status === 401) return res.status(503).json({erro: "chave_invalida"});
    if (r.status === 413) return res.status(413).json({erro: "audio_grande"});
    if (r.status === 404) return res.status(502).json({erro: "recusado", modelo: MODELO, detalhe: codigo || "http 404"});
    // 400: o Groq não conseguiu ler o arquivo (formato estranho, gravação corrompida)
    if (r.status === 400) return res.status(422).json({erro: "audio_invalido", detalhe: codigo || "http 400"});
    return res.status(502).json({erro: "ia_fora", detalhe: codigo || "http " + r.status});
  }

  return res.status(200).json({texto: textoFalado(dados || {})});
};
