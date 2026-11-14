// Recebe os avisos da Pluggy. Na fase (a) ele só confere se o aviso é mesmo nosso e registra no log
// da Vercel qual evento chegou, pra descobrir se a Pluggy avisa quando um item do MeuPluggy atualiza.
// Não lê transação nem grava nada.
//
// A Pluggy não assina os avisos. O que existe é um cabeçalho com segredo, combinado quando o webhook
// é registrado pela API (api/pluggy-teste.js faz isso), e o clientId no corpo.
//
// Variáveis de ambiente:
//   PLUGGY_WEBHOOK_SEGREDO  obrigatória
//   PLUGGY_CLIENT_ID        obrigatória

const crypto = require("crypto");
const {lerCorpo} = require("./_comum.js");

function igual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

module.exports = async function (req, res) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({erro: "metodo"}); }
  const segredo = (process.env.PLUGGY_WEBHOOK_SEGREDO || "").trim();
  // sem segredo configurado nada entra (503 faz a Pluggy tentar de novo mais tarde)
  if (!segredo) return res.status(503).json({erro: "sem_config"});
  if (!igual(req.headers["x-saldos-segredo"] || "", segredo)) return res.status(401).json({erro: "segredo"});

  const aviso = lerCorpo(req) || {};
  if (aviso.clientId && aviso.clientId !== process.env.PLUGGY_CLIENT_ID) return res.status(200).json({ok: true, ignorado: true});

  // só o tipo do evento e o id do item: é um sinal, os dados se buscam na Pluggy
  console.log("[bancos] aviso da Pluggy:", String(aviso.event || "?").slice(0, 60), "item", String(aviso.itemId || "-").slice(0, 60));
  return res.status(200).json({ok: true});
};
