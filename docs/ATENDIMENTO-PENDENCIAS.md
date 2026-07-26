# Atendimento — o que depende de VOCÊ (Stenio)

Tudo aqui é ação **fora do código**. As ondas **A a H** estão entregues:
`npm run build` verde com **117 rotas**, migrações **0031–0036 já aplicadas**
em produção.

Ordem sugerida: 1 → 2 → 3. Sem os itens 1 e 2 o sistema abre mas não recebe
mensagem nenhuma.

---

## 0. Banco de dados — ✅ JÁ FEITO, não precisa fazer nada

As migrações `0031` e `0032` **já foram aplicadas** no Supabase de produção
(`vdqbwlxmaagjnfpcajwt`). Verificado em 26/07/2026 direto no banco:

| Item | Estado |
|---|---|
| Tabelas `atendimento_*` | 22 criadas |
| Colunas novas em `conversations` | `prioridade`, `snoozed_until`, `inbox_id` ✅ |
| Função `fn_despertar_conversas_adiadas` | existe |
| Caixa de entrada padrão | 1 |
| Horário comercial | 7 linhas (seg–sex 8–18, sáb 8–12) |
| Política de SLA "Padrão" | 1 |
| Etiquetas / respostas rápidas / macros | 5 / 4 / 1 |
| Atributos personalizados | 3 |
| Central de Ajuda | 1 portal, 3 categorias |
| Migração `0033` (SLA ligado à caixa + trigger) | aplicada |

## 1. Liberar o acesso dos atendentes ⚠️ BLOQUEANTE (2 min)

Hoje **só 1 pessoa** tem acesso ao atendimento (a diretoria). Todo o resto do
time vai bater na tela "sem acesso".

**Tem tela para isso**: entre em **Configurações › Agentes** e ligue o
interruptor de cada atendente. (Uma versão anterior deste documento dizia que
só dava por SQL — estava errado.)

Se preferir pelo banco, ou se ainda não conseguir entrar:

```sql
update public.profiles set atendimento_access = true
where email = 'pessoa@arininegociosimobiliarios.com.br';
```

## 2. Deploy e domínio ⚠️ BLOQUEANTE

- [ ] **`atendimento.arininegociosimobiliarios.com.br`** apontando para o MESMO
      projeto do site/CRM (não crie projeto novo — o `middleware.ts` já roteia
      por subdomínio).
- [ ] SSL do subdomínio (automático na Vercel depois do DNS propagar).
- [ ] **`NEXT_PUBLIC_SITE_URL`** em produção com a URL do atendimento.
      Sem ela a URL de webhook mostrada na tela de Canais sai errada e a
      Evolution/Meta não conseguem entregar mensagem.
- [ ] Confirmar `SUPABASE_SERVICE_ROLE_KEY` no ambiente de produção.
- [ ] Confirmar as variáveis do **Cloudflare R2** (`R2_*` +
      `NEXT_PUBLIC_STORAGE_DRIVER=r2`). É por onde sobem os **anexos** da
      conversa. Sem R2 ele cai no Supabase Storage — funciona, mas o bucket
      precisa aceitar os MIMEs de áudio/vídeo/PDF.

### 2.1 Ligar o cron dos jobs (5 min) — destrava 3 coisas de uma vez

Existe um endpoint que roda as tarefas de fundo: **despertar conversa adiada**,
**marcar violação de SLA** e **enviar as campanhas**. Ele não roda sozinho —
precisa de alguém chamando de minuto em minuto.

**Na Vercel**, o agendamento já está pronto em `vercel.json` (a cada 5 min).
Você só precisa:

- [ ] Definir **`CRON_SECRET`** nas variáveis de ambiente. A Vercel manda esse
      valor sozinha no `Authorization: Bearer`, então não há mais nada a fazer.

**No VPS/Dokploy** (que é onde o resto do projeto roda hoje):

- [ ] Definir **`ATENDIMENTO_JOBS_SECRET`** (qualquer string longa e aleatória).
- [ ] Agendar no cron:

```bash
curl -X POST https://atendimento.arininegociosimobiliarios.com.br/api/atendimento/jobs -H "x-jobs-secret: SEU_SEGREDO"
```

De minuto em minuto é seguro: os três jobs são idempotentes. **Sem nenhuma das
duas variáveis o endpoint responde 503** — é proposital, para não ficar aberto
na internet.

## 3. WhatsApp — decidir o caminho 🔑 DECISÃO SUA

Escolha **uma** opção por número (dá para ter vários números, cada um do seu jeito).
Nada disso eu consigo fazer por você: envolve conta, cartão e aprovação da Meta.

### Opção A — Evolution API (mais rápido, o que eu recomendo para começar)

O código está **pronto dos dois lados** (envio e recebimento, texto e mídia).

- [ ] Subir um servidor da Evolution API (Docker + Postgres + Redis).
- [ ] **Trocar a `AUTHENTICATION_API_KEY` padrão** — servidores com a chave de
      fábrica são varridos ativamente na internet.
- [ ] Fixar a tag da imagem (`:v2.3.7`), nunca `:latest`.
- [ ] HTTPS obrigatório no endereço da Evolution.
- [ ] Cadastrar o canal em **Atendimento › Canais** e ler o QR Code.
- [ ] (Opcional, mas recomendado) Ligar o **S3/Minio na Evolution**. Sem isso a
      mídia recebida vem com URL criptografada do WhatsApp e o navegador não
      exibe — a mensagem chega, mas o anexo não abre.
- [ ] ⚠️ **Aceitar o risco**: é não-oficial, o WhatsApp pode bloquear o número
      sem aviso e sem recurso. Tenha um número reserva.

### Opção B — API Oficial da Meta (o número migra)

- [ ] App no Meta for Developers com o produto WhatsApp.
- [ ] **Business Verification** aprovada.
- [ ] Token permanente de **System User** (o de teste expira em 24 h).
- [ ] Webhook em `/api/webhooks/whatsapp` com o mesmo Verify Token do sistema.
- [ ] App Secret cadastrado (valida a assinatura dos webhooks).
- [ ] ⚠️ **Avisar a equipe**: o número deixa de funcionar no app do celular.

### Opção C — API Oficial + celular (Coexistence)

Tudo da Opção B, **mais**:

- [ ] Aprovação como **Tech Provider ou Solution Partner** na Meta. Leva semanas.
- [ ] **App Review** com 2 vídeos de demonstração.
- [ ] **Access Verification** (limite de onboarding 10 → 200 clientes).
- [ ] **Embedded Signup** nascendo direto no **v4** (o v2 morre em 15/10/2026).
- [ ] Assinar os webhooks `history`, `smb_app_state_sync` e `smb_message_echoes`.
- [ ] App WhatsApp Business **2.24.17+** no celular.
- [ ] ⚠️ Não sincroniza grupos nem chamadas, e desativa etiquetas/respostas
      rápidas do app.

## 4. Custos a aprovar 🔑

- [ ] **Meta (B e C)**: cobrança **por mensagem de template**. Mensagem comum
      dentro da janela de atendimento aberta é **grátis**. Faturamento no
      Brasil em BRL desde jul/2026.
- [ ] **Evolution (A)**: sem custo por mensagem, só o servidor.
- [ ] **IA (Onda F)**: para ligar o Copiloto/triagem, precisa de
      `ANTHROPIC_API_KEY` e aprovar o custo por token.

## 5. Segurança 🔑

- [ ] **Trocar a senha da conta do Chatwoot** compartilhada em conversa
      (`cearini22@gmail.com`).
- [ ] Definir quem é `admin_central` — só esse perfil cadastra canais e vê tokens.

## 6. Configuração inicial dentro do sistema (10 min)

Nada disso é obrigatório — tudo já veio semeado e funcionando. É só ajustar
para a cara da Arini:

- [ ] **Configurações › Caixas de entrada** — renomear a caixa padrão, escolher
      os agentes, ligar saudação e mensagem de ausência.
- [ ] **Configurações › Horário comercial** — conferir seg–sex 8–18 e sáb 8–12.
- [ ] **Configurações › SLA** — a política "Padrão" nasce com 15 min de primeira
      resposta e 24 h de resolução. Ajuste se for irreal.
- [ ] **Configurações › Etiquetas** — o catálogo veio com quente/morno/frio/
      financiamento/rural.
- [ ] **Respostas rápidas** e **Macros** — 4 respostas e 1 macro já semeadas.

---

## 7. O que o código ainda NÃO faz (honesto, sem otimismo)

| Item | Situação |
|---|---|
| WhatsApp (Evolution e Cloud API), Telegram, chat do site | ✅ envio e recebimento prontos |
| E-mail (Resend), SMS, canal via API | ✅ código pronto — 🔑 sem credencial, nada roda |
| Anexos, prioridade, snooze, massa, menções, participantes | ✅ pronto |
| Apagar mensagem, marcar não lida, busca na thread | ✅ pronto |
| Som e notificação do sistema | ✅ pronto |
| Copiloto de IA (sugerir / resumir / classificar) | ✅ pronto — 🔑 exige `ANTHROPIC_API_KEY` |
| Triagem e auto-resposta por IA rodando sozinhas | ✅ ligadas no Telegram e no chat do site, com trava anti-loop |
| Automações disparando nos webhooks | ✅ ligado |
| Central de Ajuda pública (portal, categorias, artigos, votos) | ✅ pronto, com 6 artigos semeados |
| Webhooks de saída | ✅ disparando em conversa criada/atualizada/resolvida, mensagem e contato |
| Tokens de API | 🟡 cadastro pronto; **não existe API pública que os valide** |
| Registro de auditoria | ✅ canais, acesso de agente, contatos, conversas e login — 🟡 falta caixas/macros/SLA |
| Papéis e permissões | 🟡 cadastro pronto; **quem controla acesso ainda é a RLS** — reescrevê-la é decisão sua (seção 9) |
| Integrações (Slack, Dialogflow) | 🟡 credenciais guardadas; nada é chamado em evento algum |
| Campanha, SLA e snooze automáticos | 🟡 jobs prontos — 🔑 falta ligar o cron (seção 2.1) |
| Templates de WhatsApp | ✅ cadastro + sincronizar/enviar à Meta — 🔑 exige canal Cloud API |
| Anexo em e-mail | 🟡 sai como link, não como arquivo MIME |
| Bloquear contato | ✅ bloqueia de fato em todos os canais (checagem no `inbound.ts`) |
| Relatório de SLA | ✅ por política, por agente e violações no tempo |
| Categorias de respostas rápidas | ✅ agrupamento e filtro |
| `dominio_customizado` do portal de ajuda | ❌ a coluna existe, mas nada a usa |
| Excluir canal | ❌ não existe rota nem botão |

## 8. Verificação feita nesta entrega

- `npx tsc --noEmit` — limpo.
- `npm run build` — **113 rotas**, sem erro.
- `npx next lint` — 7 avisos, **todos pré-existentes do CRM**, nenhum do atendimento.
- Banco de produção — conferido por consulta direta: migrações **0031 a 0036
  aplicadas**, seeds no lugar, enum `lead_origin` com `telegram` e `email`.
- Central de Ajuda — 6 artigos reais publicados, para o portal não nascer vazio.
- Portal público — testado contra o banco real num dev server: home, categoria,
  busca e 404 respondendo certo; escape de HTML e bloqueio de `javascript:`
  validados.
- Tema — testado no navegador: `escuro` → classe `dark`, `claro` → `light`,
  `sistema` segue o SO, variáveis CSS trocando de fato.

### O que continua SEM teste real

- **Nenhuma tela do painel foi vista logada** — o shell exige sessão e eu não
  entro com a sua senha.
- **Nenhuma integração externa foi exercitada**: WhatsApp, Telegram, Resend,
  SMS e Graph API da Meta não têm credencial cadastrada. Todo o código desses
  canais segue a documentação, sem uma única chamada real. Espere ajuste fino
  na primeira rodada — em especial no corpo do SMS, que não tem padrão de
  mercado, e no inbound do e-mail.
- **Widget do site**: compila e o script passa em `node --check`, mas não foi
  aberto num navegador nem embutido num site de verdade.

---

## 9. Uma decisão que eu NÃO tomei por você 🔑

Os **papéis personalizados** estão cadastrados e podem ser atribuídos ao
agente, mas hoje quem realmente controla o acesso é a **RLS do Supabase**
(setor do CRM + `atendimento_access`), não o papel.

Fazer o papel mandar de verdade significa **reescrever as políticas de RLS**
de `conversations`, `messages`, `leads` e companhia. Num banco com dados
reais, sem você por perto para validar, uma policy errada ou esconde
conversa de quem precisa, ou mostra para quem não devia. Não é o tipo de
coisa que se faz de madrugada e sozinho.

Quando quiser encarar, o caminho é: criar uma função `fn_tem_permissao(uid,
'conversa:ver_todas')` que lê `profiles.atendimento_role_id`, e trocar as
policies uma a uma, testando com um usuário de cada papel antes de aplicar
na próxima.
