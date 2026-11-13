// Fase (a) da ligação com os bancos: prova de conceito. Só LÊ o que a Pluggy devolve das conexões
// do dono e mostra na tela de teste (perfil, com ?bancos no endereço). Não grava nada no Firestore.
//
// Corpo do pedido:
//   {acao: "listar", dias: 7}            item, contas e transações dos últimos dias de cada conexão
//   {acao: "webhook"}                    lista os webhooks registrados na Pluggy
//   {acao: "webhook", registrar: true}   registra o api/pluggy-webhook.js pra receber os avisos
//
// Variáveis de ambiente (além das de _dono.js e _pluggy.js):
//   PLUGGY_ITEM_IDS         ids das conexões (itens), separados por vírgula
//   PLUGGY_WEBHOOK_SEGREDO  só pra registrar o webhook: a Pluggy manda esse valor em cada aviso
//   SITE_URL                opcional, endereço do site pro webhook (padrão: o endereço que recebeu o pedido)

const {lerCorpo} = require("./_comum.js");
const {exigirDono} = require("./_dono.js");
const pluggy = require("./_pluggy.js");

const MAX_POR_CONTA = 60;

function dia(dt) { return dt.toISOString().slice(0, 10); }

function resumirTransacao(t) {
  return {
    id: t.id,
    data: String(t.date || "").slice(0, 10),
    descricao: t.description || "",
    descricaoBanco: t.descriptionRaw || "",
    valor: Math.abs(+t.amount || 0),
    // a Pluggy marca o sentido em type; o sinal do valor muda de banco pra banco
    sentido: t.type === "CREDIT" ? "entrada" : "saida",
    status: t.status || "",
    categoria: t.category || "",
    estabelecimento: (t.merchant && (t.merchant.name || t.merchant.businessName)) || "",
    meio: (t.paymentData && t.paymentData.paymentMethod) || ""
  };
}

async function lerItem(id, de, ate) {
  let it;
  try { it = await pluggy.item(id); }
  catch (e) { return {id: id, erro: e.detalhe || e.message, contas: []}; }
  const saida = {
    id: it.id,
    banco: (it.connector && it.connector.name) || "",
    conectorId: it.connector ? it.connector.id : null,
    status: it.status || "",
    execucao: it.executionStatus || "",
    atualizadoEm: it.lastUpdatedAt || null,
    consentimentoExpira: it.consentExpiresAt || null,
    erro: it.error ? String(it.error.message || it.error.code || "erro").slice(0, 120) : null,
    contas: []
  };
  let lista;
  try { lista = await pluggy.contas(id); }
  catch (e) { saida.erro = "contas: " + (e.detalhe || e.message); return saida; }
  saida.contas = await Promise.all(lista.map(async function (c) {
    const conta = {
      nome: c.marketingName || c.name || "",
      tipo: c.type || "",
      subtipo: c.subtype || "",
      // só o fim do número, o bastante pra reconhecer a conta
      final: String(c.number || "").replace(/\D/g, "").slice(-4),
      saldo: +c.balance || 0,
      transacoes: [], total: 0, erro: null
    };
    try {
      const txs = await pluggy.transacoes(c.id, de, ate, 2);
      txs.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
      conta.total = txs.length;
      conta.transacoes = txs.slice(0, MAX_POR_CONTA).map(resumirTransacao);
    } catch (e) { conta.erro = e.detalhe || e.message; }
    return conta;
  }));
  return saida;
}

function enderecoWebhook(req) {
  const base = (process.env.SITE_URL || "").replace(/\/+$/, "") ||
               "https://" + String(req.headers["x-forwarded-host"] || req.headers.host || "");
  return base + "/api/pluggy-webhook";
}

async function acaoWebhook(req, res, corpo) {
  const url = enderecoWebhook(req);
  if (corpo.registrar) {
    const segredo = (process.env.PLUGGY_WEBHOOK_SEGREDO || "").trim();
    if (!segredo) return res.status(503).json({erro: "sem_config", falta: ["PLUGGY_WEBHOOK_SEGREDO"]});
    const ja = (await pluggy.listarWebhooks()).filter(function (w) { return w.url === url && !w.disabledAt; });
    if (!ja.length) await pluggy.criarWebhook(url, {"x-saldos-segredo": segredo});
  }
  const lista = await pluggy.listarWebhooks();
  return res.status(200).json({
    endereco: url,
    webhooks: lista.map(function (w) {
      return {id: w.id, url: w.url, evento: w.event, criadoEm: w.createdAt || null,
              desligadoEm: w.disabledAt || null, daqui: w.url === url};
    })
  });
}

module.exports = async function (req, res) {
  if (!(await exigirDono(req, res))) return;

  const falta = ["PLUGGY_CLIENT_ID", "PLUGGY_CLIENT_SECRET"].filter(function (n) { return !process.env[n]; });
  if (falta.length) return res.status(503).json({erro: "sem_config", falta: falta});

  const corpo = lerCorpo(req) || {};
  try {
    if (corpo.acao === "webhook") return await acaoWebhook(req, res, corpo);

    const ids = (process.env.PLUGGY_ITEM_IDS || "").split(",").map(function (s) { return s.trim(); }).filter(Boolean);
    if (!ids.length) return res.status(503).json({erro: "sem_config", falta: ["PLUGGY_ITEM_IDS"]});
    const dias = Math.max(1, Math.min(31, Math.round(+corpo.dias || 7)));
    const hoje = new Date(), de = new Date(hoje.getTime() - dias * 86400000);
    const itens = await Promise.all(ids.slice(0, 8).map(function (id) { return lerItem(id, dia(de), dia(hoje)); }));
    return res.status(200).json({de: dia(de), ate: dia(hoje), itens: itens});
  } catch (e) {
    // só o status e a mensagem curta: nada de dado de conta no log
    console.error("[bancos] Pluggy respondeu", e.status || "", e.detalhe || e.message);
    return res.status(502).json({erro: "pluggy", detalhe: e.detalhe || "sem resposta"});
  }
};
