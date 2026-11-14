// Porta de entrada das funções de banco: só o dono do app passa.
// As contas ligadas na Pluggy são de uma pessoa só (o Meu Pluggy é pra uso pessoal), então
// tudo que lê ou grava dado de banco confere se quem pediu é o DONO_UID.
//
// Variáveis de ambiente:
//   DONO_UID  obrigatória: o uid do Firebase de quem é dono das contas

const {conferirLogin} = require("./_comum.js");

// Se algo não passar, já responde e devolve null.
async function exigirDono(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({erro: "metodo"});
    return null;
  }
  let usuario;
  try {
    usuario = await conferirLogin(String(req.headers.authorization || "").replace(/^Bearer\s+/i, ""));
  } catch (e) {
    console.error("[bancos] não deu pra conferir o login:", e.message);
    res.status(502).json({erro: "login_indisponivel"});
    return null;
  }
  if (!usuario) { res.status(401).json({erro: "login"}); return null; }
  const dono = (process.env.DONO_UID || "").trim();
  // sem dono configurado ninguém passa; o uid volta só pra própria pessoa, pra ela saber o que pôr na Vercel
  if (!dono) { res.status(503).json({erro: "sem_config", falta: ["DONO_UID"], seuUid: usuario.sub}); return null; }
  if (usuario.sub !== dono) { res.status(403).json({erro: "sem_acesso"}); return null; }
  return usuario;
}

module.exports = {exigirDono};
