# Atendimento — o que depende de VOCÊ (Stenio)

Tudo aqui é ação **fora do código**. O código da Onda A→E está entregue,
compilando (`npm run build` verde, 45 rotas) e commitado.

Ordem sugerida: 1 → 2 → 3. Sem os itens 1 e 2 o sistema abre mas não recebe
mensagem nenhuma.

---

## 1. Banco de dados — aplicar as migrações (5 min) ⚠️ BLOQUEANTE

Rode no **SQL Editor do Supabase**, nesta ordem, o conteúdo de:

```
supabase/migrations/0031_atendimento_onda_b.sql
supabase/migrations/0032_atendimento_helpcenter_campanhas.sql
```

São idempotentes — pode rodar de novo sem medo. Confira antes que a `0027`,
`0028`, `0029` e `0030` já foram aplicadas.

**Sem isso, quase toda tela nova quebra**, porque as tabelas não existem.

Depois, libere o acesso de cada atendente (ainda não há tela para isso):

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

## 6. Configuração inicial dentro do sistema (10 min, depois do item 1)

Nada disso é obrigatório, mas deixa o sistema com a sua cara:

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
| Receber mensagem pela Evolution | ✅ pronto (`/api/webhooks/evolution`) |
| Enviar texto e mídia (Evolution e Cloud API) | ✅ pronto |
| Anexos na conversa (enviar/ver) | ✅ pronto |
| Prioridade, snooze, ações em massa, menções | ✅ pronto |
| Macros, automações, SLA, CSAT, horário — **cadastro** | ✅ pronto |
| Automação **disparar sozinha** | ❌ falta o gancho no webhook |
| Campanha **enviar de fato** | ❌ falta o worker/cron + template aprovado na Meta |
| SLA **marcar violação** | ❌ falta o job periódico |
| Snooze despertar sem ninguém abrir a tela | 🟡 desperta ao carregar a caixa; falta cron |
| Widget de chat no site | ❌ não existe |
| Telegram, e-mail, SMS | ❌ só o cadastro da caixa aceita; sem integração |
| Copiloto / bot de IA | ❌ Onda F |
| Upload de avatar do agente | ❌ só URL por enquanto |
| Webhooks de saída, tokens de API, auditoria | ❌ telas de "em construção" |

## 8. Verificação feita nesta entrega

- `npx tsc --noEmit` — limpo.
- `npm run build` — 45 rotas, sem erro.
- `npx next lint` — só avisos pré-existentes de import não usado.
- ❗ **Nada foi testado contra o banco real** (as migrações ainda não foram
  aplicadas) nem contra um WhatsApp conectado. Espere ajustes finos na
  primeira rodada com dados de verdade.
