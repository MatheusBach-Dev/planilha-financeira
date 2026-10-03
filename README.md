# planilha-financeira

## Assistente de IA

O botão **IA** no topo abre um chat que lança, edita e apaga lançamentos e responde perguntas sobre o mês ("gastei 32 no almoço", "quanto foi de mercado este mês?", "apaga o uber de ontem"). Salário, contas fixas e configurações ficam de fora de propósito. Apagar e editar sempre pedem confirmação; lançar mostra um botão de desfazer.

Usa o plano grátis do [Groq](https://console.groq.com). Cada mensagem gasta um pedido só (dois quando a pergunta é sobre um mês que não está na tela).

### Como ligar

1. Crie uma chave em console.groq.com → **API Keys** (não pede cartão).
2. Na Vercel: projeto → **Settings → Environment Variables** → adicione `GROQ_API_KEY` com a chave.
3. Recomendado: adicione `IA_EMAILS` com os e-mails que podem usar, separados por vírgula. Sem isso, qualquer conta Google que entrar no app gasta a sua cota.
4. Faça um novo deploy (variável nova só vale a partir do próximo deploy).

A chave fica só no servidor (`api/chat.js`). Ela **não** vai no Firebase nem no código.

Opcional: `GROQ_MODEL` troca o modelo (padrão `openai/gpt-oss-120b`).
