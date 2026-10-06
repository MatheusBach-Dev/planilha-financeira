// Assistente de IA da planilha, usando o plano grátis do Groq.
//
// A chave fica só aqui no servidor (GROQ_API_KEY nas variáveis de ambiente da Vercel),
// nunca no navegador. Este arquivo confere o login do Firebase e conversa com a IA;
// quem lança, edita e apaga é o próprio app, no navegador, com o login do usuário.
//
// Variáveis de ambiente:
//   GROQ_API_KEY  obrigatória
//   GROQ_MODEL    opcional, troca o modelo (padrão: openai/gpt-oss-120b)
//   IA_EMAILS     opcional, e-mails liberados separados por vírgula (vazio = qualquer conta logada)

const crypto = require("crypto");

const PROJETO = process.env.FIREBASE_PROJECT_ID || "planilha-financeira-3b0b7";
const MODELO = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
const URL_GROQ = "https://api.groq.com/openai/v1/chat/completions";
const URL_CERTS = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";

const INSTRUCOES = `Você é a assistente do "saldos", um app de controle financeiro pessoal. Responda em português do Brasil, em 1 a 3 frases curtas, em texto simples sem markdown, com valores no formato R$ 1.234,56.

Você pode:
- responder perguntas usando só os dados enviados abaixo. Use os totais prontos em vez de somar de cabeça e nunca invente números;
- adicionar, editar ou apagar lançamentos com as ferramentas.

Você não pode mudar salário, contas fixas, metas nem configurações. Se pedirem, diga que isso é feito na aba perfil.

Tipos de lançamento:
- diario: gasto do dia a dia (comida, transporte, rolê, mercado). Use este quando a pessoa disser só "gastei", "paguei" ou "comprei".
- saida: conta com data marcada (aluguel, luz, parcela, boleto).
- entrada: dinheiro que entrou fora do salário (freela, venda, reembolso, presente).
- economia: dinheiro guardado ou investido.

Regras:
- Sem data dita, use hoje. "Ontem" é o dia anterior; se cair no mês anterior, use esse mês.
- Para editar ou apagar, use o número #ref da lista. Se mais de um lançamento combinar com o pedido, pergunte qual antes de agir.
- Se faltar o valor, pergunte em vez de chutar.
- A categoria tem que ser uma da lista do tipo. Se nenhuma servir, deixe vazia.
- Se a pergunta for sobre um mês que não está nos dados, chame ver_mes.
- Depois de usar uma ferramenta, não repita os detalhes: o app já mostra o que foi feito.`;

const MES = {type: "string", description: "Mês no formato AAAA-MM."};
const REF = {type: "integer", description: "Número #ref do lançamento na lista."};
const CAMPOS = {
  dia: {type: "integer", description: "Dia do mês, de 1 a 31."},
  tipo: {type: "string", enum: ["diario", "saida", "entrada", "economia"]},
  valor: {type: "number", description: "Valor em reais, positivo. Ex.: 45.9"},
  descricao: {type: "string", description: "Do que se trata, curto. Ex.: Uber, almoço."},
  categoria: {type: "string", description: "Uma das categorias do tipo, da lista enviada. Vazio se nenhuma servir."},
  cartao: {type: "boolean", description: "true se foi pago no cartão de crédito."}
};

const FERRAMENTAS = [
  ferramenta("adicionar_lancamento", "Lança um gasto, entrada ou investimento num dia.",
    Object.assign({mes: MES}, CAMPOS), ["mes", "dia", "tipo", "valor", "descricao"]),
  ferramenta("editar_lancamento", "Muda um lançamento que já existe. Mande só os campos que mudam.",
    Object.assign({ref: REF}, CAMPOS), ["ref"]),
  ferramenta("apagar_lancamento", "Apaga um lançamento que já existe.", {ref: REF}, ["ref"]),
  ferramenta("ver_mes", "Busca os dados de um mês que não está na lista.", {mes: MES}, ["mes"])
];
const NOMES = FERRAMENTAS.map(function (f) { return f.function.name; });

function ferramenta(name, description, properties, required) {
  return {type: "function", function: {name, description, parameters: {type: "object", properties, required}}};
}

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

// ————— pedido —————

function lerCorpo(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") { try { return JSON.parse(req.body); } catch (e) { return null; } }
  return null;
}

function limparMensagens(lista) {
  if (!Array.isArray(lista)) return null;
  const out = lista.slice(-10).filter(function (m) {
    return m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim();
  }).map(function (m) { return {role: m.role, content: m.content.slice(0, 1000)}; });
  if (!out.length || out[out.length - 1].role !== "user") return null;
  return out;
}

function lerAcoes(chamadas) {
  return (chamadas || []).map(function (c) {
    try { return {nome: c.function.name, args: JSON.parse(c.function.arguments || "{}") || {}}; }
    catch (e) { return null; }
  }).filter(function (a) { return a && NOMES.indexOf(a.nome) >= 0; });
}

module.exports = async function (req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({erro: "metodo"});
  }
  if (!process.env.GROQ_API_KEY) return res.status(503).json({erro: "sem_chave"});

  let usuario;
  try {
    usuario = await conferirLogin(String(req.headers.authorization || "").replace(/^Bearer\s+/i, ""));
  } catch (e) {
    console.error("[ia] não deu pra conferir o login:", e.message);
    return res.status(502).json({erro: "login_indisponivel"});
  }
  if (!usuario) return res.status(401).json({erro: "login"});
  if (!liberado(usuario)) return res.status(403).json({erro: "sem_acesso"});

  const corpo = lerCorpo(req) || {};
  const mensagens = limparMensagens(corpo.mensagens);
  if (!mensagens) return res.status(400).json({erro: "pedido"});
  const contexto = typeof corpo.contexto === "string" ? corpo.contexto.slice(0, 12000) : "";

  const pedido = {
    model: MODELO,
    messages: [{role: "system", content: INSTRUCOES + "\n\nDados do app agora:\n" + contexto}].concat(mensagens),
    tools: FERRAMENTAS,
    tool_choice: "auto",
    temperature: 0.2,
    max_completion_tokens: 800
  };
  // gpt-oss pensa antes de responder; "low" gasta menos da cota diária
  if (/gpt-oss/.test(MODELO)) pedido.reasoning_effort = "low";

  let r, dados;
  try {
    r = await fetch(URL_GROQ, {
      method: "POST",
      headers: {Authorization: "Bearer " + process.env.GROQ_API_KEY, "Content-Type": "application/json"},
      body: JSON.stringify(pedido)
    });
    dados = await r.json().catch(function () { return {}; });
  } catch (e) {
    console.error("[ia] Groq fora do ar:", e.message);
    return res.status(502).json({erro: "ia_fora"});
  }

  // pedido maior que o limite de tokens por minuto do plano
  if (r.status === 413) return res.status(413).json({erro: "grande"});
  if (r.status === 429) {
    return res.status(429).json({erro: "limite", espera: Math.ceil(+r.headers.get("retry-after") || 60)});
  }
  if (!r.ok) {
    const e = (dados && dados.error) || {};
    const codigo = String(e.code || e.type || "").slice(0, 60);
    // só o status e o código: a mensagem de erro pode trazer o texto do usuário
    console.error("[ia] Groq respondeu", r.status, codigo, "modelo", MODELO);
    if (codigo === "tool_use_failed") return res.status(422).json({erro: "nao_entendi"});
    if (r.status === 401) return res.status(503).json({erro: "chave_invalida"});
    // 400/404: o Groq não aceitou o pedido com esse modelo (nome errado, sem ferramentas, contexto curto…)
    if (r.status === 400 || r.status === 404) {
      return res.status(502).json({erro: "recusado", modelo: MODELO, detalhe: codigo || "http " + r.status});
    }
    return res.status(502).json({erro: "ia_fora", detalhe: codigo || "http " + r.status});
  }

  const msg = (dados.choices && dados.choices[0] && dados.choices[0].message) || {};
  return res.status(200).json({texto: String(msg.content || "").trim(), acoes: lerAcoes(msg.tool_calls)});
};
