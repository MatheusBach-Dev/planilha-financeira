// Partes comuns às funções da assistente (chat.js e transcrever.js).
// O "_" no nome faz a Vercel não publicar este arquivo como endereço próprio.
//
// Variáveis de ambiente usadas aqui:
//   GROQ_API_KEY  obrigatória (a conferência acontece antes do login, pra avisar cedo)
//   IA_EMAILS     opcional, e-mails liberados separados por vírgula (vazio = qualquer conta logada)

const crypto = require("crypto");

const PROJETO = process.env.FIREBASE_PROJECT_ID || "planilha-financeira-3b0b7";
const URL_CERTS = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";

// ————— login do Firebase —————
// Confere o token que o navegador manda com as chaves públicas do Google,
// sem precisar de conta de serviço nem de pacote extra.

let certs = null, certsAte = 0, certsBuscadosEm = 0;

async function buscarCerts(forcar) {
  // forçar (chave nova do Google) no máximo uma vez por minuto, pra token inventado não virar enxurrada de buscas
  if (forcar && certs && Date.now() - certsBuscadosEm < 60000) return certs;
  if (certs && !forcar && Date.now() < certsAte) return certs;
  certsBuscadosEm = Date.now();
  const r = await fetch(URL_CERTS);
  if (!r.ok) throw new Error("certificados do Google responderam " + r.status);
  const idade = /max-age=(\d+)/.exec(r.headers.get("cache-control") || "");
  certs = await r.json();
  certsAte = Date.now() + (idade ? +idade[1] : 3600) * 1000;
  return certs;
}

function lerParte(parte) {
  return JSON.parse(Buffer.from(parte, "base64url").toString("utf8"));
}

async function conferirLogin(token) {
  const partes = String(token || "").split(".");
  if (partes.length !== 3) return null;
  let cab, dados;
  try { cab = lerParte(partes[0]); dados = lerParte(partes[1]); } catch (e) { return null; }
  if (cab.alg !== "RS256" || !cab.kid) return null;
  const agora = Math.floor(Date.now() / 1000);
  if (dados.aud !== PROJETO || dados.iss !== "https://securetoken.google.com/" + PROJETO) return null;
  if (typeof dados.sub !== "string" || !dados.sub) return null;
  if (!(dados.exp > agora) || !(dados.iat <= agora + 300)) return null;
  let cert = (await buscarCerts())[cab.kid];
  if (!cert) cert = (await buscarCerts(true))[cab.kid];
  if (!cert) return null;
  const ok = crypto.verify("RSA-SHA256", Buffer.from(partes[0] + "." + partes[1]), cert, Buffer.from(partes[2], "base64url"));
  return ok ? dados : null;
}

function liberado(usuario) {
  const lista = (process.env.IA_EMAILS || "").split(",")
    .map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);
  if (!lista.length) return true;
  return usuario.email_verified === true && lista.indexOf(String(usuario.email || "").toLowerCase()) >= 0;
}

// Tudo que vem antes de gastar a cota: método, chave e login.
// Se algo não passar, já responde e devolve null.
async function exigirLogin(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({erro: "metodo"});
    return null;
  }
  if (!process.env.GROQ_API_KEY) { res.status(503).json({erro: "sem_chave"}); return null; }
  let usuario;
  try {
    usuario = await conferirLogin(String(req.headers.authorization || "").replace(/^Bearer\s+/i, ""));
  } catch (e) {
    console.error("[ia] não deu pra conferir o login:", e.message);
    res.status(502).json({erro: "login_indisponivel"});
    return null;
  }
  if (!usuario) { res.status(401).json({erro: "login"}); return null; }
  if (!liberado(usuario)) { res.status(403).json({erro: "sem_acesso"}); return null; }
  return usuario;
}

function lerCorpo(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") { try { return JSON.parse(req.body); } catch (e) { return null; } }
  return null;
}

module.exports = {exigirLogin, lerCorpo};
