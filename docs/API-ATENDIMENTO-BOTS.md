# Atendimento Arini — API de Agent Bots (integração com n8n)

Documentação para integradores externos. Explica como um fluxo do **n8n**
(ou qualquer sistema próprio) recebe as mensagens dos leads do Atendimento
Arini e responde ao cliente pelo mesmo canal.

- **Versão publicada** (link para mandar ao integrador):
  `https://atendimento.arininegociosimobiliarios.com.br/docs/api-bots.html`
  — é o arquivo `public/docs/api-bots.html`, gerado a partir deste documento.
  Ao alterar este `.md`, atualize também aquele HTML.
- **Host da API**: `https://atendimento.arininegociosimobiliarios.com.br`
- **Modelo**: igual ao *Agent Bot* do Chatwoot — o bot é registrado como se
  fosse um agente de uma **caixa de entrada**. Toda mensagem que o cliente
  manda naquela caixa é enviada por `POST` para a URL do bot; o bot responde
  chamando a API `/api/bot/v1/*` de volta.

> **Segredos**: `token` e `secret` do bot são entregues pela Arini na criação
> e **não** aparecem neste documento. O `token` só é exibido **uma vez**, na
> tela de cadastro. Perdeu, cria outro bot.

---

## 1. Como funciona (visão geral)

```
Cliente (WhatsApp · Instagram · Messenger · Telegram · chat do site)
        │
        ▼
  Atendimento Arini  ── grava a mensagem na conversa
        │
        │  POST assinado (HMAC-SHA256) → outgoing_url do bot
        ▼
  Seu fluxo no n8n  (Webhook node)
        │
        │  POST Authorization: Bearer <token do bot>
        ▼
  https://atendimento.arininegociosimobiliarios.com.br/api/bot/v1/...
        │
        ▼
  Mensagem entregue ao cliente pelo canal original + gravada no histórico
```

Dois canais de comunicação, em direções opostas:

| Direção | Quem chama | Autenticação |
|---|---|---|
| **Arini → bot** (recebe eventos) | Arini chama a `outgoing_url` do bot | Header `X-Arini-Signature` (HMAC-SHA256 do corpo, com o `secret`) |
| **Bot → Arini** (responde, transfere, etiqueta) | O bot chama `/api/bot/v1/*` | Header `Authorization: Bearer <token>` |

---

## 2. Cadastro do bot (feito pela diretoria da Arini)

Em **Atendimento › Configurações › Bots** (só perfil de diretoria):

| Campo | O que é |
|---|---|
| **Nome** | identificação interna ("Bot n8n — Triagem") |
| **URL do bot** (`outgoing_url`) | a URL do Webhook do n8n. **Precisa ser `https://` e pública** |
| **Caixa de entrada** | ⚠️ **obrigatório para funcionar.** É o vínculo que faz as mensagens serem entregues. Uma caixa aceita **um** bot |

Ao salvar, a tela devolve:

- **`token`** — exibido **uma única vez**. É o que o bot usa em `Authorization: Bearer`. O sistema guarda só o hash (sha256); nem a Arini recupera depois.
- **`secret`** — continua visível na tela do bot. Serve para o bot **conferir** a assinatura do que recebe.
- **`bot_id`** — chega em todo evento no header `X-Arini-Bot`.

Há um botão **Testar** na tela: dispara um payload de exemplo, com a mesma
forma e a mesma assinatura do evento real, e mostra o status HTTP e o tempo de
resposta. Use-o antes de qualquer outra coisa.

---

## 3. Arini → bot: recebendo as mensagens

### Requisição que chega no seu webhook

```
POST <a sua outgoing_url>
Content-Type: application/json
X-Arini-Signature: sha256=<hmac-sha256 hex do corpo cru>
X-Arini-Bot: <uuid do bot>
X-Arini-Evento: mensagem        # ou "teste", no botão Testar
```

### Corpo (payload completo)

```json
{
  "evento": "mensagem",
  "enviado_em": "2026-09-09T19:41:07.512Z",
  "conversa": {
    "id": "0f2b9d4e-1c3a-4b77-9f21-b0a5e6d84c10",
    "canal": "whatsapp",
    "status": "aberta",
    "prioridade": null,
    "etiquetas": ["locacao"],
    "inbox_id": "7a1c0f88-4b2d-4a0e-9f55-2e1d3c4b5a6f",
    "bot_status": "ativo",
    "criada_em": "2026-09-09T19:40:55.108Z",
    "atributos": {}
  },
  "contato": {
    "id": "3d9e7c21-88f4-4a1b-9c33-5e7a2b1d0f44",
    "nome": "Gabriel Souza",
    "telefone": "+5534999998888",
    "email": "gabriel@exemplo.com.br"
  },
  "mensagem": {
    "id": "c11a2b33-4455-4677-8899-aabbccddeeff",
    "direcao": "in",
    "remetente": "cliente",
    "tipo": "texto",
    "texto": "Oi, vi o anúncio do apartamento no centro. Ainda está disponível?",
    "media_url": null,
    "media_nome": null,
    "media_mime": null,
    "criada_em": "2026-09-09T19:41:07.480Z"
  }
}
```

### Campos

| Campo | Tipo | Observação |
|---|---|---|
| `evento` | `"mensagem"` \| `"teste"` | `teste` vem do botão Testar, com ids zerados |
| `conversa.id` | uuid | **é o `conversationId` de todas as chamadas de volta** |
| `conversa.canal` | `whatsapp` \| `instagram` \| `facebook` \| `messenger` \| `telegram` \| `email` \| `sms` \| `site` \| `api` | |
| `conversa.status` | `aberta` \| `pendente` \| `adiada` \| `resolvida` | |
| `conversa.bot_status` | `ativo` \| `transferida` \| `sem_bot` | só chega evento quando é `ativo` |
| `conversa.etiquetas` | `string[]` | minúsculas |
| `contato.id` | uuid \| null | é o `lead_id` no CRM — a chave para casar com a ficha |
| `mensagem.direcao` | `in` \| `out` | hoje o bot só recebe `in` (cliente falando) |
| `mensagem.tipo` | `texto` \| `imagem` \| `audio` \| `video` \| `documento` | |
| `mensagem.texto` | string \| null | null quando é mídia sem legenda |
| `mensagem.media_url` | string \| null | URL pública do arquivo no storage |

**O que nunca é enviado ao bot**: nota interna da equipe, `raw_payload` do
provedor, tokens, segredos de canal e a ficha completa do lead (valores de
negociação, anotações internas). É lista branca fechada, por segurança.

### Conferindo a assinatura (opcional, mas recomendado)

`X-Arini-Signature` é `sha256=` + HMAC-SHA256 do **corpo cru** da requisição
(o texto exatamente como chegou, antes de qualquer `JSON.parse`), usando o
`secret` do bot como chave.

Em Node (Code node do n8n, ou seu servidor):

```js
const crypto = require("crypto");
const esperado = "sha256=" + crypto
  .createHmac("sha256", SECRET_DO_BOT)
  .update(corpoBruto)        // string crua, NÃO o objeto já parseado
  .digest("hex");
crypto.timingSafeEqual(Buffer.from(esperado), Buffer.from(headerRecebido));
```

No n8n, para ter o corpo cru é preciso ligar **Options → Raw Body** no node
Webhook (o corpo chega em base64 na propriedade binária `data`). Sem isso,
re-serializar o JSON funciona na maioria dos casos — nosso corpo é gerado com
`JSON.stringify` e a ordem das chaves se mantém — mas não é garantido.
Alternativa mais simples: usar uma URL de webhook secreta (path aleatório) e
tratar a assinatura como conferência extra, não como única defesa.

### Regras de entrega

- **Timeout de 10 s.** Se o seu fluxo demorar mais para responder, conta como
  falha. No n8n, deixe o Webhook em **Respond: Immediately** (responde 200 na
  hora e processa depois) sempre que o fluxo for longo.
- **10 falhas seguidas desativam o bot automaticamente.** O motivo fica em
  `ultimo_erro`, visível na tela de Bots. Basta reativar depois de corrigir.
- **Toda tentativa vira log** em `atendimento_bot_deliveries` (payload, status
  HTTP, erro, duração). É por onde se prova "chegou / não chegou".
- Qualquer resposta **2xx** é sucesso. O corpo da resposta é ignorado — o bot
  responde ao cliente pela API, não pelo retorno do webhook.

---

## 4. Bot → Arini: a API `/api/bot/v1`

Base: `https://atendimento.arininegociosimobiliarios.com.br`
Autenticação em todas as rotas:

```
Authorization: Bearer <token do bot>
Content-Type: application/json
```

Erros comuns:

| Status | Significa |
|---|---|
| `401` | token ausente, inválido ou bot desativado |
| `404` | a conversa não existe **ou** não pertence a uma caixa deste bot |
| `400` | corpo inválido / campo obrigatório faltando |

### 4.1 `POST /api/bot/v1/mensagens` — responder ao cliente

```json
{
  "conversationId": "0f2b9d4e-1c3a-4b77-9f21-b0a5e6d84c10",
  "texto": "Olá, Gabriel! Sim, o apartamento está disponível. Posso agendar uma visita?",
  "mediaUrl": null,
  "mediaTipo": null,
  "privada": false
}
```

| Campo | Obrigatório | Observação |
|---|---|---|
| `conversationId` | sim | o `conversa.id` do evento |
| `texto` | `texto` **ou** `mediaUrl` | |
| `mediaUrl` | — | URL pública do arquivo |
| `mediaTipo` | — | `imagem` \| `audio` \| `video` \| `documento` (padrão: `documento`) |
| `privada` | — | `true` grava **nota interna** (o cliente não vê) e não envia nada |

Resposta:

```json
{ "ok": true, "mensagemId": "…", "entregue": true, "via": "evolution", "motivo": null }
```

`entregue: false` com `motivo` preenchido significa que a mensagem foi
**gravada no histórico** mas o canal recusou o envio (número inválido, janela
de 24h da Meta fechada, canal desconectado). Nada some — o time enxerga a
tentativa e o motivo.

Use `privada: true` para deixar contexto ao atendente que vai assumir:
*"cliente já informou o CPF"*, *"não entendi a intenção em 3 tentativas"*.

### 4.2 `POST /api/bot/v1/transferir` — passar para um humano

```json
{
  "conversationId": "0f2b9d4e-1c3a-4b77-9f21-b0a5e6d84c10",
  "motivo": "Cliente pediu falar com corretor",
  "equipeId": null,
  "agenteId": null
}
```

Efeitos:

- `bot_status` vira **`transferida`** e o sistema **para de entregar eventos**
  ao bot nessa conversa (é a trava que impede o bot de falar por cima do
  atendente);
- a conversa **reabre** (sai de resolvida/adiada) e volta para a fila;
- fica uma **nota interna** com o motivo, para o atendente entender por que a
  conversa caiu no colo dele.

`equipeId` e `agenteId` são opcionais: sem eles a conversa volta para a fila
geral. Se o id informado não existir ou o agente não tiver acesso ao
atendimento, a transferência **acontece do mesmo jeito** e o aviso vem em
`avisos[]` — o essencial (sair do bot) não é desfeito por um id errado.

Resposta:

```json
{ "ok": true, "conversationId": "…", "botStatus": "transferida",
  "equipeId": null, "agenteId": null, "avisos": [] }
```

> Devolver a conversa ao bot é ação **manual**, feita por uma pessoa no inbox.
> O cliente escrever de novo **não** reativa o bot.

### 4.3 `POST /api/bot/v1/etiquetas` — classificar a conversa

```json
{
  "conversationId": "0f2b9d4e-1c3a-4b77-9f21-b0a5e6d84c10",
  "adicionar": ["locacao", "urgente"],
  "remover": ["sem_classificacao"]
}
```

- máximo 20 etiquetas por chamada, até 40 caracteres cada, sempre minúsculas;
- etiqueta nova entra automaticamente no catálogo (com cor neutra), para
  aparecer nos filtros do inbox;
- se a mesma etiqueta vier em `adicionar` e `remover`, **remover ganha**.

Resposta: `{ "ok": true, "etiquetas": ["locacao", "urgente"] }`

### 4.4 `GET /api/bot/v1/conversas/{id}` — ler o contexto

Devolve a conversa, o contato e as **últimas 30 mensagens não internas**, em
ordem cronológica. Útil para montar o histórico antes de chamar um LLM.

```json
{
  "ok": true,
  "conversa": { "id": "…", "canal": "whatsapp", "status": "aberta",
                "prioridade": null, "etiquetas": [], "inbox_id": "…",
                "bot_status": "ativo", "criada_em": "…", "atributos": {} },
  "contato": { "id": "…", "nome": "Gabriel Souza",
               "telefone": "+5534999998888", "email": null },
  "mensagens": [
    { "id": "…", "direcao": "in", "remetente": "cliente", "tipo": "texto",
      "texto": "Oi, vi o anúncio…", "media_url": null, "media_nome": null,
      "media_mime": null, "status": "recebida", "apagada": false,
      "criada_em": "…" }
  ]
}
```

Mensagem apagada aparece com `apagada: true` e `texto: null` — o rastro fica,
o conteúdo some. **Nota interna nunca é retornada.**

---

## 5. Ciclo de vida do bot na conversa

`conversations.bot_status` manda em tudo:

| Estado | Significa | Chega evento no bot? |
|---|---|---|
| `sem_bot` | a caixa da conversa não tem bot ativo | **não** |
| `ativo` | o bot está conduzindo | **sim** |
| `transferida` | um humano assumiu (ou o bot transferiu) | **não** |

Regra que costuma pegar quem está integrando:

> A ativação acontece **na criação da conversa**. Conversas que já existiam
> antes de o bot ser vinculado à caixa continuam em `sem_bot` para sempre —
> elas **não** começam a disparar eventos. Para testar, use um número/contato
> que ainda não tem conversa aberta, ou peça à Arini para resolver a conversa
> antiga antes.

---

## 6. Não estou recebendo evento nenhum — checklist

Na ordem do mais provável para o menos:

1. **O bot está vinculado a uma caixa de entrada?**
   Sem o vínculo (`Configurações › Bots → campo Caixa de entrada`) nada é
   entregue. É a causa nº 1.

2. **A caixa está ligada ao canal certo?**
   Conversas de WhatsApp/Telegram/e-mail nascem **sem** `inbox_id`; o sistema
   descobre a caixa pelo canal (`atendimento_inboxes.channel_id` apontando
   para a conexão em `Atendimento › Canais`). Caixa sem canal amarrado só
   funciona para o chat do site. Confira também se a caixa está **ativa**.

3. **A conversa é nova?**
   Ver a regra de ciclo de vida acima (§5). Conversa antiga fica em `sem_bot`.

4. **Alguém já assumiu a conversa?**
   `bot_status = transferida` interrompe a entrega de forma definitiva.

5. **O bot foi desativado sozinho?**
   10 falhas seguidas desligam. Veja `ultimo_status` / `ultimo_erro` na tela de
   Bots — costuma ser `TimeoutError` (fluxo do n8n > 10 s) ou `HTTP 404`.

6. **A URL do n8n é a de produção?**
   A *Test URL* (`/webhook-test/...`) só aceita chamada enquanto o
   **"Listen for test event"** está aberto na tela; fora disso devolve 404.
   Use a **Production URL** (`/webhook/...`) e o fluxo **ativado**.

7. **A URL é `https://` e alcançável pela internet?**
   `http://`, IP local, `localhost` e túnel expirado não passam — o cadastro
   exige `https://` e o servidor precisa resolver o DNS.

8. **O n8n responde 200 em menos de 10 s?**
   Se o Webhook estiver em *Respond: When Last Node Finishes* e o fluxo
   demorar, a Arini registra falha mesmo tendo o fluxo rodado. Troque para
   **Respond Immediately**.

9. **Ainda em dúvida?** Peça à Arini o log de `atendimento_bot_deliveries` do
   bot: ele mostra payload, status HTTP, erro e duração de cada tentativa. Se
   não há linha nenhuma, o problema está nos itens 1–4 (nem chegou a sair). Se
   há linha com erro, o problema está do lado do n8n.

O botão **Testar** ignora os itens 1–4 (dispara direto na URL): se o teste
chega no n8n mas a mensagem real não, o problema é vínculo de caixa ou estado
da conversa.

---

## 7. Alternativa: webhooks de saída (só observar)

Se a automação **não precisa responder** ao cliente — só quer ser avisada —
existe um caminho mais simples, em **Atendimento › Configurações › Webhooks**:
cadastra-se uma URL e escolhem-se os eventos.

| Evento | Quando dispara |
|---|---|
| `conversa_criada` | nasce uma conversa (qualquer canal) |
| `conversa_atualizada` | muda status, responsável, etc. |
| `conversa_resolvida` | a conversa é resolvida |
| `mensagem_criada` | qualquer mensagem, de entrada ou de saída (nota interna **não**) |
| `contato_criado` | um contato novo nasce pelo atendimento |

Formato do corpo:

```json
{
  "evento": "mensagem_criada",
  "enviado_em": "2026-09-09T19:41:07.512Z",
  "dados": {
    "conversa": {
      "id": "…", "canal": "whatsapp", "status": "aberta",
      "contato": { "id": "…", "nome": "Gabriel Souza", "telefone": "+5534999998888" }
    },
    "mensagem": {
      "id": "…", "direcao": "in", "remetente": "cliente",
      "tipo": "texto", "texto": "…", "criada_em": "…"
    }
  }
}
```

Mesmas regras de assinatura (`X-Arini-Signature`), timeout de 10 s e
desativação após 10 falhas. Headers: `X-Arini-Signature` e `X-Arini-Evento`.

**Diferença prática**: o webhook de saída avisa sobre **tudo**, mas não dá
acesso à API de resposta. O Agent Bot recebe só a caixa dele e **pode
responder, transferir e etiquetar**. Para um fluxo de atendimento no n8n, o
Agent Bot é o caminho certo.

---

## 8. Checklist de segurança para o integrador

- Guarde o `token` como senha (credencial do n8n, nunca no corpo do fluxo).
- Confira o `X-Arini-Signature` antes de agir no payload.
- Use URL de webhook com path aleatório; não publique a URL.
- Nunca devolva ao cliente conteúdo vindo de nota interna (o bot nem recebe,
  mas vale para o que o seu fluxo montar).
- Responda 2xx rápido; processe depois.
- Token comprometido: avise a Arini — o bot é desativado e recriado com token
  novo (não há como "rotacionar" o token existente, por desenho).

---

## 9. Suporte

Dúvidas sobre a integração, ou para pedir o cadastro/vínculo do bot: falar com
a equipe técnica da Arini (Stenio). Para diagnosticar, tenha em mãos o **nome
do bot**, o **horário aproximado** do teste e o **número/contato** usado.
