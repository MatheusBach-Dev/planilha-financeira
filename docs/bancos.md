# Ligação com os bancos (Open Finance via Meu Pluggy)

As movimentações do banco chegam ao app pela Pluggy. O Meu Pluggy é gratuito e só serve pra ler as
contas da própria pessoa (até 5 conexões do mesmo titular, atualizadas uma vez por dia). Por isso
tudo aqui vale só pra conta dona (`DONO_UID`); os outros usuários continuam lançando à mão.

## Fase (a): prova de conceito

Só lê e mostra. Nada é lançado nem gravado no Firestore.

- `api/pluggy-teste.js` lê item, contas e transações na Pluggy e devolve pra tela de teste.
- `api/pluggy-webhook.js` recebe os avisos da Pluggy e só registra no log da Vercel qual evento chegou.
- `api/_dono.js` confere o login do Firebase e deixa passar só o `DONO_UID`.
- `api/_pluggy.js` fala com a API da Pluggy.
- A tela de teste fica no perfil, só quando o endereço termina em `?bancos`.

### Como ligar

1. Em https://meu.pluggy.ai, crie a conta e conecte Itaú, Mercado Pago e Inter.
2. Em https://dashboard.pluggy.ai, crie a conta de desenvolvedor.
3. No menu **Customization**, aba **Connectors**, ative **MeuPluggy** (e **Sandbox**, se quiser testar com dados de mentira).
4. Em **Applications**, crie a aplicação. Copie o **Client ID** e o **Client Secret** (o secret aparece uma vez só).
5. Na página **Demo** da aplicação, clique em **Connect Account**, escolha **MeuPluggy** e autorize. Repita uma vez pra cada banco.
6. Ainda no Demo, em **Connected Items**, clique em cada item e copie o **itemId**.
7. Na Vercel, em Settings > Environment Variables, crie:

| Variável | Valor |
|---|---|
| `DONO_UID` | o uid do Firebase da conta dona (a tela de teste mostra qual é) |
| `PLUGGY_CLIENT_ID` | Client ID da aplicação |
| `PLUGGY_CLIENT_SECRET` | Client Secret da aplicação |
| `PLUGGY_ITEM_IDS` | os itemIds, separados por vírgula |
| `PLUGGY_WEBHOOK_SEGREDO` | um texto longo e aleatório, inventado por você |

8. Faça um novo deploy (as variáveis só valem em deploy novo) e abra o site com `?bancos` no fim do endereço. A seção "bancos (teste)" aparece no perfil.

### O que a fase (a) precisa responder

- Os três bancos aparecem com contas e transações?
- As transações vêm com estabelecimento, sentido (entrada ou saída) e status (pendente ou confirmada)?
- Depois de "Registrar aviso automático", o aviso chega quando o Meu Pluggy atualiza? (painel da Pluggy, em Webhooks, e log da Vercel)
- Continua funcionando depois dos 15 dias de trial da conta de desenvolvedor?

## Segurança

- Client Secret, segredo do webhook e qualquer chave ficam só nas variáveis de ambiente da Vercel, nunca no git.
- A Pluggy não assina os avisos. O webhook confere o cabeçalho com o segredo e o `clientId`, e trata o aviso só como sinal: os dados são buscados na Pluggy.
- Nenhuma senha de banco passa pelo app: a autorização é feita no Meu Pluggy.
