// Fase (b) da ligação com os bancos: entrega as movimentações das conexões do dono pro app montar
// a lista "a revisar". Só LÊ na Pluggy. Quem grava é o próprio app, com o login da pessoa, na pasta
// dela no Firestore (users/{uid}/config/bancos): assim nenhuma função do servidor escreve em pasta de ninguém.
//
// Corpo do pedido: {desde: "aaaa-mm-dd"}  (no máximo 40 dias atrás; sem data, 7 dias)
//
// Variáveis de ambiente: as de _dono.js e _pluggy.js, mais PLUGGY_ITEM_IDS (ids das conexões, separados por vírgula).

const {lerCorpo} = require("./_comum.js");
const {exigirDono} = require("./_dono.js");
const pluggy = require("./_pluggy.js");

const MAX_DIAS = 40;

function dia(dt) { return dt.toISOString().slice(0, 10); }

// o Meu Pluggy chama toda conexão de "MeuPluggy"; o nome do banco vem na conta
function nomeBanco(conta, item) {
  const n = [conta.marketingName, conta.name, item.connector && item.connector.name].join(" ");
  if (/ita[uú]/i.test(n)) return "Itaú";
  if (/\binter\b/i.test(n)) return "Inter";
  if (/mercado\s*pago/i.test(n)) return "Mercado Pago";
  if (/nubank|nu pagamentos/i.test(n)) return "Nubank";
  return String(conta.marketingName || conta.name || "banco").slice(0, 40);
}

function movimento(t, banco, final) {
  return {
    id: String(t.id),
    data: String(t.date || "").slice(0, 10),
    valor: Math.round(Math.abs(+t.amount || 0) * 100) / 100,
    // a Pluggy marca o sentido em type; o sinal do valor muda de banco pra banco
    sentido: t.type === "CREDIT" ? "entrada" : "saida",
    descricao: String(t.description || t.descriptionRaw || "").slice(0, 120),
    estabelecimento: String((t.merchant && (t.merchant.name || t.merchant.businessName)) || "").slice(0, 80),
    categoria: String(t.category || "").slice(0, 60),
    meio: String((t.paymentData && t.paymentData.paymentMethod) || "").slice(0, 20),
    status: t.status || "",
    banco: banco,
    final: final
  };
}

async function lerConexao(id, de, ate) {
  let it;
  try { it = await pluggy.item(id); }
  catch (e) { return {conexao: {id: id, erro: e.detalhe || e.message}, movimentos: []}; }
  const conexao = {
    id: it.id, bancos: [], status: it.status || "", execucao: it.executionStatus || "",
    atualizadoEm: it.lastUpdatedAt || null,
    erro: it.error ? String(it.error.message || it.error.code || "erro").slice(0, 120) : null
  };
  const movimentos = [];
  let contas;
  try { contas = await pluggy.contas(id); }
  catch (e) { conexao.erro = "contas: " + (e.detalhe || e.message); return {conexao, movimentos}; }
  await Promise.all(contas.map(async function (c) {
    // cartão de crédito fica de fora por enquanto: a fatura já entra como conta a pagar
    if (c.type === "CREDIT") return;
    const banco = nomeBanco(c, it), final = String(c.number || "").replace(/\D/g, "").slice(-4);
    if (conexao.bancos.indexOf(banco) < 0) conexao.bancos.push(banco);
    try {
      const txs = await pluggy.transacoes(c.id, de, ate, 5);
      txs.forEach(function (t) { if (t && t.id) movimentos.push(movimento(t, banco, final)); });
    } catch (e) { conexao.erro = banco + ": " + (e.detalhe || e.message); }
  }));
  return {conexao, movimentos};
}

module.exports = async function (req, res) {
  if (!(await exigirDono(req, res))) return;

  const falta = ["PLUGGY_CLIENT_ID", "PLUGGY_CLIENT_SECRET", "PLUGGY_ITEM_IDS"].filter(function (n) { return !process.env[n]; });
  if (falta.length) return res.status(503).json({erro: "sem_config", falta: falta});
  const ids = process.env.PLUGGY_ITEM_IDS.split(",").map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 8);

  const corpo = lerCorpo(req) || {};
  const hoje = new Date(), limite = new Date(hoje.getTime() - MAX_DIAS * 86400000);
  let de = /^\d{4}-\d{2}-\d{2}$/.test(String(corpo.desde || "")) ? new Date(corpo.desde + "T12:00:00Z") : null;
  if (!de || isNaN(de)) de = new Date(hoje.getTime() - 7 * 86400000);
  if (de < limite) de = limite;
  if (de > hoje) de = hoje;

  try {
    const lidos = await Promise.all(ids.map(function (id) { return lerConexao(id, dia(de), dia(hoje)); }));
    const movimentos = [].concat.apply([], lidos.map(function (x) { return x.movimentos; }));
    movimentos.sort(function (a, b) { return b.data.localeCompare(a.data); });
    return res.status(200).json({
      de: dia(de), ate: dia(hoje),
      conexoes: lidos.map(function (x) { return x.conexao; }),
      movimentos: movimentos
    });
  } catch (e) {
    console.error("[bancos] Pluggy respondeu", e.status || "", e.detalhe || e.message);
    return res.status(502).json({erro: "pluggy", detalhe: e.detalhe || "sem resposta"});
  }
};
