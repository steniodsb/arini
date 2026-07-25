# Atendimento — Checklist de configurações pendentes

Tudo que precisa de ação **fora do código** para o sistema de atendimento
funcionar de ponta a ponta. Marcado com o responsável provável.

---

## 1. Infraestrutura e deploy

- [ ] **Domínio `atendimento.arininegociosimobiliarios.com.br`** apontando para o
      MESMO projeto de deploy do site/CRM (não criar projeto novo). O
      roteamento por subdomínio já está no `middleware.ts`.
- [ ] **Certificado SSL** emitido para o subdomínio (automático na Vercel após o DNS propagar).
- [ ] **Variável `NEXT_PUBLIC_SITE_URL`** definida em produção com a URL do
      atendimento. Sem ela, as URLs de webhook mostradas na tela de canais
      saem erradas e a Meta/Evolution não conseguem entregar mensagem.
- [ ] Confirmar que `SUPABASE_SERVICE_ROLE_KEY` está no ambiente de produção
      (as rotas de canal e o webhook dependem dela).

## 2. Banco de dados

- [ ] Aplicar a migração **`0027_atendimento_canais.sql`** no Supabase.
- [ ] Conferir que as migrações `0025` e `0026` já foram aplicadas
      (conversas/mensagens e a flag `atendimento_access`).
- [ ] **Liberar acesso dos atendentes**: hoje só a diretoria entra sozinha. Os
      demais precisam de `profiles.atendimento_access = true`.
      ⚠️ **Não existe tela para isso ainda** — só via SQL no Supabase:
      ```sql
      update public.profiles set atendimento_access = true
      where email = 'pessoa@arininegociosimobiliarios.com.br';
      ```

## 3. WhatsApp — decidir o caminho

Escolher **uma** das três opções por número. Dá para ter mais de um número,
cada um do seu jeito.

### Opção A — Evolution API (mais rápido)

- [ ] Subir um servidor da Evolution API (Docker + Postgres + Redis).
- [ ] **Trocar a `AUTHENTICATION_API_KEY` padrão** — servidores com a chave de
      fábrica são varridos ativamente na internet.
- [ ] Fixar a tag da imagem (`:v2.3.7`), nunca `:latest`.
- [ ] HTTPS obrigatório no endereço da Evolution.
- [ ] Cadastrar o canal no atendimento e ler o QR Code.
- [ ] ⚠️ **Aceitar formalmente o risco**: é não-oficial, o WhatsApp pode
      bloquear o número sem aviso e sem recurso. Recomendado ter número reserva.

### Opção B — API Oficial da Meta (número migra)

- [ ] App criado no Meta for Developers com o produto WhatsApp.
- [ ] **Business Verification** aprovada.
- [ ] Token permanente de **System User** (não o token de teste, que expira em 24h).
- [ ] Webhook apontado para `/api/webhooks/whatsapp` com o mesmo Verify Token
      cadastrado no sistema.
- [ ] App Secret cadastrado (valida a assinatura dos webhooks).
- [ ] ⚠️ **Avisar a equipe**: o número deixa de funcionar no app do celular.

### Opção C — API Oficial + celular (Coexistence)

Tudo da Opção B, **mais**:

- [ ] Aprovação como **Tech Provider ou Solution Partner** na Meta — é o
      pré-requisito que a Meta exige para liberar Coexistence. Leva semanas.
- [ ] **App Review** com 2 vídeos de demonstração (enviar mensagem e criar template).
- [ ] **Access Verification** (eleva o limite de onboarding de 10 → 200 clientes).
- [ ] Implementar o **Embedded Signup** (Facebook Login for Business).
      ⚠️ Nascer direto no **v4** — o v2 é descontinuado em **15/10/2026**.
- [ ] Assinar os eventos de webhook `history`, `smb_app_state_sync` e
      `smb_message_echoes` (são eles que trazem o histórico e o que for
      respondido pelo celular).
- [ ] App WhatsApp Business **2.24.17+** no celular.
- [ ] ⚠️ Ciente das limitações: não sincroniza grupos nem chamadas, e desativa
      etiquetas/respostas rápidas do app.

## 4. Custos a aprovar

- [ ] **Meta (opções B e C)**: cobrança **por mensagem** de template. Mensagens
      comuns dentro da janela de atendimento aberta são **grátis**.
      Faturamento no Brasil em **BRL** desde jul/2026.
- [ ] **Evolution (opção A)**: sem custo por mensagem, mas tem custo de servidor.

## 5. Segurança — pendências conhecidas

- [ ] **Trocar a senha da conta do Chatwoot** que foi compartilhada em conversa
      (`cearini22@gmail.com`).
- [ ] Definir quem é `admin_central` — hoje só esse perfil cadastra canais e
      enxerga tokens.
- [ ] O webhook da Evolution precisa validar o header `Authorization` com o
      segredo gerado no canal (o segredo já é criado; **a validação no
      endpoint ainda não foi escrita** — ver seção 6).

## 6. Código — o que ainda NÃO existe

Estado real, sem otimismo:

| Item | Situação |
|---|---|
| Conectar canal (3 opções) | ✅ construído |
| Caixa de conversas | ✅ existe (básica) |
| Enviar/receber texto | ✅ existe |
| **Webhook da Evolution** (`/api/webhooks/evolution`) | ❌ **não existe** — sem ele a Evolution não entrega mensagem |
| Envio via Evolution (o `send` só fala Cloud API) | ❌ não integrado |
| Atribuir conversa a atendente | ❌ |
| Abas Minhas / Não atribuídas / Todos | ❌ |
| Filtros, busca, ordenação | ❌ |
| Contatos como módulo | ❌ |
| Times, etiquetas, respostas prontas, macros | ❌ |
| Relatórios, campanhas, central de ajuda, automações | ❌ |
| Tempo real (hoje é polling de 12s) | ❌ |
| Anexos e mídia na conversa | ❌ |
| Notas privadas | ❌ |

## 7. ⚠️ Nenhum código foi compilado

**Isto é importante.** Este ambiente não tem Node/npm instalado, então **nada
do que foi escrito passou por typecheck, build ou execução**. O código foi
escrito seguindo os tipos e padrões do projeto, mas há risco real de erro de
compilação.

Antes de subir para produção, rodar na sua máquina:

```bash
cd arini-app && npm run build
```

E corrigir o que aparecer.
