// Conversa com a API da Pluggy (Open Finance). Só leitura de dados: item, contas e transações.
//
// Variáveis de ambiente:
//   PLUGGY_CLIENT_ID      obrigatória
//   PLUGGY_CLIENT_SECRET  obrigatória

const URL_PLUGGY = "https://api.pluggy.ai";

function erroPluggy(status, corpo) {
  const e = new Error("pluggy " + status);
  e.status = status;
  // só o código e a mensagem curta da Pluggy; nunca o corpo inteiro, que pode trazer dado de conta
  e.detalhe = String((corpo && (corpo.codeDescription || corpo.message)) || "http " + status).slice(0, 120);
  return e;
}

let chave = null, chaveAte = 0;

async function pegarChave(forcar) {
  if (chave && !forcar && Date.now() < chaveAte) return chave;
  const r = await fetch(URL_PLUGGY + "/auth", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({clientId: process.env.PLUGGY_CLIENT_ID, clientSecret: process.env.PLUGGY_CLIENT_SECRET})
  });
  const d = await r.json().catch(function () { return null; });
  if (!r.ok || !d || !d.apiKey) throw erroPluggy(r.status, d);
  chave = d.apiKey;
  // a chave da Pluggy dura mais que isso; meia hora evita pedir uma nova a cada chamada
  chaveAte = Date.now() + 30 * 60 * 1000;
  return chave;
}

async function chamar(metodo, caminho, corpo) {
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const r = await fetch(URL_PLUGGY + caminho, {
      method: metodo,
      headers: {"Content-Type": "application/json", "X-API-KEY": await pegarChave(tentativa > 0)},
      body: corpo ? JSON.stringify(corpo) : undefined
    });
    // chave vencida: pede outra e tenta mais uma vez
    if ((r.status === 401 || r.status === 403) && tentativa === 0) continue;
    const d = await r.json().catch(function () { return null; });
    if (!r.ok || !d) throw erroPluggy(r.status, d);
    return d;
  }
}

function item(id) { return chamar("GET", "/items/" + encodeURIComponent(id)); }

async function contas(itemId) {
  const d = await chamar("GET", "/accounts?itemId=" + encodeURIComponent(itemId));
  return d.results || [];
}

// transações da conta entre duas datas (aaaa-mm-dd), seguindo o cursor até o limite de páginas
async function transacoes(contaId, de, ate, maxPaginas) {
  let caminho = "/v2/transactions?accountId=" + encodeURIComponent(contaId) +
                "&dateFrom=" + encodeURIComponent(de) + "&dateTo=" + encodeURIComponent(ate);
  const todas = [];
  for (let p = 0; p < (maxPaginas || 3) && caminho; p++) {
    const d = await chamar("GET", caminho);
    (d.results || []).forEach(function (t) { todas.push(t); });
    // "next" já vem pronto pra colar no fim do endereço
    caminho = d.next ? "/v2/transactions" + d.next : null;
  }
  return todas;
}

async function listarWebhooks() {
  const d = await chamar("GET", "/webhooks");
  return d.results || [];
}

function criarWebhook(url, cabecalhos) {
  return chamar("POST", "/webhooks", {url: url, event: "all", headers: cabecalhos});
}

module.exports = {item, contas, transacoes, listarWebhooks, criarWebhook};
