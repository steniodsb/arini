# Atendimento — o que depende de VOCÊ (Stenio)

Atualizado em **13/08/2026**, de madrugada, com o estado conferido direto
no banco de produção, no servidor da Evolution e nos endpoints públicos —
não no que a documentação dizia.

`npm run build` verde com **132 rotas**. Migrações **0031–0047 aplicadas**
em produção.

**O resumo de uma linha:** o WhatsApp está no ar e recebendo; o que trava
o resto é o time não ter acesso (item 1), o cron não estar ligado (item 2)
e as credenciais da Meta (item 4).

---

## 0. Banco de dados — ✅ nada a fazer

Todas as migrações estão aplicadas, incluindo as desta madrugada:

| Migração | O que fez |
|---|---|
| `0044` | Paleta de cores (padrão da conta + escolha do agente) |
| `0045` | Índice de busca da conversa por conexão |
| `0046` | **Unicidade por conexão** — o que destravou o 2º WhatsApp |
| `0047` | Renomear/remover etiqueta dentro das conversas |

## 1. Acesso, papel e FILA de cada pessoa ⚠️ BLOQUEANTE (10 min)

Conferido agora: **`admin@arininegociosimobiliarios.com.br` está com
`atendimento_access = false`**. Hoje só as três contas de teste
(`atendimento.administrador@`, `atendimento.recepcao@`,
`atendimento.atendente@`) entram no sistema. Das 9 filas, só *Venda
Urbana* tem 1 membro — e é a conta de teste.

Em **Configurações › Agentes**, para cada pessoa: ligue o acesso, preencha
o cargo, escolha o papel e — se for atendente — marque as **filas**.

> **Atendente sem fila não vê absolutamente nada.** A tela de Filas agora
> avisa disso na cara: ela lista quem está fora de todas as filas e quais
> filas estão sem ninguém.

Se você não conseguir nem entrar para usar a tela:

```sql
update public.profiles
   set atendimento_access = true, atendimento_papel = 'administrador'
 where email = 'seu@email.com';
```

⚠️ **As 10 contas compartilham a senha `Arini2026@!`.** Serve para
demonstrar, não para operar: antes de abrir para o time, cada pessoa
precisa da própria senha (Meu perfil › Segurança) e as contas `(teste)`
devem ser desativadas.

## 2. Cron dos jobs ⚠️ BLOQUEANTE (5 min)

`POST /api/atendimento/jobs` em produção responde **503** — nem
`ATENDIMENTO_JOBS_SECRET` nem `CRON_SECRET` existem no ambiente. Enquanto
isso: **SLA não é marcado, conversa adiada não desperta e campanha não
sai**. O 503 é proposital (endpoint aberto na internet seria pior).

No Dokploy, defina `ATENDIMENTO_JOBS_SECRET` (string longa e aleatória) e
agende de 5 em 5 minutos — os três jobs são idempotentes:

```bash
curl -X POST https://arininegociosimobiliarios.com.br/api/atendimento/jobs -H "x-jobs-secret: SEU_SEGREDO"
```

O que **já está certo** (conferido): DNS de
`atendimento.arininegociosimobiliarios.com.br` apontando para o mesmo
servidor, SSL funcionando, `/atendimento/login` respondendo 200 e o
webhook da Evolution entregando.

## 3. WhatsApp — ✅ CONECTADO

O número **55 34 99745-140** ("Arini Negócios Imobiliários") está `open`
na instância `arini-comercial`: 2.962 contatos, 1.138 mensagens
sincronizadas e, nas últimas 24 h, **100 mensagens de entrada e 100 de
saída** gravadas no banco. Não há mais nada a fazer aqui.

### Ligar um SEGUNDO número (ou terceiro)

Agora funciona ponta a ponta. **Atendimento › Canais › Conectar canal ›
Evolution API**, com o mesmo servidor e a mesma API key do primeiro,
mudando só o **nome da instância** (ex.: `arini-locacao`), e leia o QR com
o outro chip.

O que muda na tela quando existe mais de um número:
- cada conversa mostra **por qual número** entrou, e responde por ele;
- a caixa ganha o filtro **Número / conexão**;
- as automações ganham a condição **Número / conexão** — é assim que se
  faz "o que entrar no número de locação vai para a fila Locação".

⚠️ **Antes do 3º ou 4º número**, suba o teto de memória da Evolution: cada
número é uma sessão Baileys no mesmo container e o teto atual (768 MB)
segura um, não quatro. O `deploy/evolution/docker-compose.yml` já está
com 1,5 GB — falta aplicar na VPS, o que **reinicia o container e derruba
momentaneamente os números conectados**, então faça junto com a conexão
do próximo número:

```bash
cd /opt/evolution-arini && set -a && . ./segredos.env && set +a && docker stack deploy -c docker-compose.yml evoarini
```

### Remover um canal

Passou a existir: **Canais › (o canal) › Remover**. As conversas não são
apagadas — perdem o vínculo com o número. Apagar a instância na Evolution
é uma opção separada, porque é irreversível.

## 4. Instagram, Messenger e Facebook 🔑 DEPENDE DE VOCÊ

A tela agora é **Atendimento › Canais › Redes sociais** (antes só existia
em CRM › Integrações, que a maioria dos perfis nem enxerga). Ela diz o que
falta em cada plataforma e tem um botão **Testar** que consulta a Página
na Graph API de verdade.

⚠️ **Desativei a integração do Facebook.** Ela estava ativa com a URL do
webhook colada no campo `access_token` (alguém errou o campo) e **sem App
Secret** — ou seja, incapaz de responder e com o endpoint público
aceitando qualquer POST que chegasse. `page_id` e `verify_token` foram
preservados; reativar é um clique quando houver credencial real.

O que preciso de você, uma vez só (serve para Instagram e Messenger):

- [ ] Página do Facebook da Arini com você como **administrador** (a
      página `671747376016929` já está cadastrada);
- [ ] Instagram da imobiliária como conta **Profissional** e **vinculado a
      essa Página**;
- [ ] no app do Instagram: Configurações › Privacidade › Mensagens ›
      **Permitir acesso a mensagens** (sem isso a DM nunca chega);
- [ ] app no **Meta for Developers** (Business) com os produtos Messenger
      e Instagram;
- [ ] **Verificação do negócio** + App Review das permissões
      `pages_messaging`, `pages_manage_metadata`, `instagram_basic` e
      `instagram_manage_messages` — é a parte que leva semanas;
- [ ] me entregar (ou colar na tela): **Access Token de Página
      permanente** (System User), **App Secret**, **Page ID** e um
      **Verify Token** que você escolhe.

**TikTok** continua só gerando lead: não existe API pública de mensagens
para responder. A tela diz isso agora, em vez de prometer conversa.

## 5. Outros canais — prontos, faltando credencial 🔑

| Canal | O que falta |
|---|---|
| **Telegram** | Token do @BotFather. 5 minutos, sem burocracia. |
| **E-mail** | Conta na Resend + domínio verificado + API key. |
| **SMS** | Contratar gateway (Zenvia/Twilio/Comtele): URL, chave e remetente. |
| **Chat do site** | Token já gerado. Falta **colar a tag no site** — decisão sua: o site já tem o botão flutuante do WhatsApp, e dois botões flutuantes brigam pelo mesmo canto. A tag está em Configurações › Chat do site. |
| **Canal por API** | Gerar o segredo em Configurações › Canal por API. |

## 6. Custos a aprovar 🔑

- **Meta**: cobrança por mensagem de template; conversa dentro da janela
  de 24 h é grátis. Faturamento em BRL desde jul/2026.
- **Evolution**: sem custo por mensagem, só o servidor (já pago).
- **IA (copiloto, triagem, auto-resposta)**: exige `ANTHROPIC_API_KEY` e
  aprovação do custo por token. Hoje está desligada.

## 7. Aparência — já configurável, sem precisar de mim

- **Configurações › Aparência** — cor padrão da conta (só diretoria).
- **Meu perfil › Aparência** — cada agente escolhe a sua ou segue a conta.
- Paletas: WhatsApp (padrão), Verde Arini, Grafite, Azul e Dourado (o
  visual antigo).
- Interruptor claro/escuro de um clique na sidebar.
- Etiquetas com 16 cores, edição e prévia em **Configurações › Etiquetas**.
  Renomear ou excluir agora acerta também as conversas.

## 8. O que o código NÃO faz (honesto)

| Item | Situação |
|---|---|
| WhatsApp (Evolution), vários números | ✅ conectado e testado em produção |
| WhatsApp Cloud API, Telegram, e-mail, SMS, API, chat do site | ✅ prontos — 🔑 sem credencial, nada roda |
| Instagram / Messenger / Facebook | ✅ recebe e responde — 🔑 exige token de página e App Secret |
| TikTok | 🟡 só vira lead; não existe conversa de duas vias |
| Filas (criar, renomear, membros, excluir com impacto) | ✅ |
| Remover canal | ✅ (era o buraco antigo) |
| Cores de etiqueta, prioridade, status, SLA e bot | ✅ padronizadas em um módulo só |
| Tema claro/escuro + paleta por agente | ✅ |
| Jobs (SLA, snooze, campanhas) | 🟡 prontos — 🔑 falta o segredo do cron (item 2) |
| Copiloto de IA | ✅ pronto — 🔑 exige `ANTHROPIC_API_KEY` |
| Papéis mandando de verdade | 🟡 quem controla acesso ainda é a RLS, não o papel |
| Mídia recebida no WhatsApp | 🟡 caminho pronto, mas **nenhuma mídia real passou ainda** — mande uma foto, um áudio e um PDF para o número e confira |
| Anexo em e-mail | 🟡 sai como link, não como arquivo |

## 9. Duas coisas que eu NÃO decidi por você 🔑

1. **RLS × papéis.** Os papéis estão cadastrados, mas quem controla acesso
   de verdade é a RLS do Supabase (setor do CRM + `atendimento_access`).
   Fazer o papel mandar exige reescrever as policies de `conversations`,
   `messages` e `leads` — num banco com dado real e sem você por perto,
   uma policy errada esconde conversa de quem precisa ou mostra para quem
   não devia.
   Um caso concreto do mesmo tipo: a RLS de `atendimento_settings` permite
   escrita a **qualquer** pessoa com acesso ao atendimento. A tela
   restringe o padrão de cor à diretoria; o banco, não.

2. **Chat do site no ar.** Ver item 5: é uma mudança visível no site
   público da Arini e briga com o botão de WhatsApp que já existe lá.

---

## 10. O que continua SEM teste real

- **Nenhuma tela foi vista logada** — o shell exige sessão e eu não entro
  com a sua senha. O que foi verificado no navegador foi o CSS compilado
  (cores medidas com `getComputedStyle`) e as rotas novas respondendo 401
  sem sessão.
- **Instagram, Messenger, Telegram, Resend e SMS** nunca foram exercitados
  com credencial real. Espere ajuste fino na primeira rodada.
- **Mídia recebida** no WhatsApp: nas 100 mensagens de entrada das últimas
  24 h não veio nenhuma foto, áudio ou documento.
