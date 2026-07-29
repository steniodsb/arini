# Atendimento — fluxo e permissões

Como o atendimento decide **quem vê o quê**. Definido pelo Stenio em
26/07/2026 e implementado nas migrações `0040` e `0041`.

```
Cliente
   │  WhatsApp · Instagram · Messenger · Site  (e-mail e SMS depois)
   ▼
CAIXA CENTRAL          ← só Administrador e Recepção
   │
   ▼
Triagem                ← a recepção classifica numa FILA e clica em Atribuir
   │
   ├── Venda Urbana        ├── Jurídico
   ├── Fazenda             ├── Financeiro
   ├── Locação             ├── Documentação
   ├── Consórcio           ├── Marketing
   │                       └── Administrativo
   ▼
Atendente da fila      ← vê só as filas dele
   │
   ▼
Administrador acompanha tudo
```

## Os três papéis

O papel do atendimento é **independente do setor do CRM**. O setor diz o
que a pessoa faz no CRM de imóveis (`captacao`, `juridico`, `marketing`…);
o papel diz quem tria, quem atende e quem administra. Antes os dois eram a
mesma coisa, e por isso quem era do setor "recepção" ou "administrativo"
enxergava todas as conversas.

| Papel | Enxerga | Pode |
|---|---|---|
| **Administrador** | tudo | assumir, transferir, retirar do atendente, devolver à caixa central, reabrir, ver produtividade |
| **Recepção** | a caixa central (não triadas) e, se configurado, o que já atribuiu | triar e encaminhar |
| **Atendente** | as conversas das filas de que participa e as atribuídas a ele | responder, assumir uma da fila que esteja livre |

Configuração em `atendimento_settings.recepcao_ve_atribuidas`
(padrão **true**): a recepção continua vendo a conversa depois de atribuir,
como segundo par de olhos. Em `false`, ela só enxerga a caixa central.

## A fila é compartilhada

Quem está numa fila vê **todas** as conversas dela, inclusive as que ainda
não têm responsável, e pode assumir. Foi decisão do Stenio, e é o que
cobre férias e ausência sem depender do administrador redistribuir.

Se um dia a operação exigir isolamento por pessoa mesmo dentro da fila,
basta remover o ramo da fila em `fn_pode_ver_conversa`.

## Onde a regra mora

Tudo em **uma função só**, `public.fn_pode_ver_conversa(uid, responsavel,
team, triada_em)`, usada pela política de `conversations`, pela de
`messages` e pela de `atendimento_transferencias`. Uma função só é
proposital: quando a regra estava duplicada, uma mensagem podia ficar
visível numa conversa que não estava.

**O isolamento é do banco, não da tela.** Um atendente não consegue ver
conversa de outra fila nem forçando a URL.

### Verificado

Cenários testados contra o banco (em transaction com rollback), todos
devolvendo booleano puro:

| Situação | Admin | Recepção | Atendente da fila | Atendente de outra |
|---|---|---|---|---|
| Na caixa central | vê | vê | **não vê** | **não vê** |
| Na fila, sem responsável | vê | vê | vê | **não vê** |
| Atribuída a alguém | vê | vê | vê (se for dele) | **não vê** |
| Anônimo | — | — | — | **não vê** |

## Histórico

Toda triagem, transferência, "assumir" e "devolver" é gravada em
`atendimento_transferencias`, com quem fez, de onde, para onde e o motivo.
Sem isso, transferir seria uma alteração silenciosa de coluna e ninguém
conseguiria responder "quem tirou esse cliente de mim?".

## Quem pode mexer nas filas

Só o **administrador** altera a composição das filas e cria/renomeia
equipes (migração `0042`). Antes disso qualquer atendente conseguia se
inserir numa fila via API e passar a ver as conversas dela — a tela
escondia o botão, mas tela não é fronteira de segurança. Depois que a
fila passou a decidir visibilidade, isso virou escalada de privilégio.

A troca de papel passa pela rota `/api/atendimento/agentes`, que confere
quem está pedindo e registra auditoria. Nunca altere `atendimento_papel`
direto pelo cliente.

## O que falta configurar (depende do Stenio)

1. **Definir o papel de cada pessoa** em Configurações › Agentes. Hoje só
   o `admin@arininegociosimobiliarios.com.br` é administrador; os demais
   nasceram como atendente.
2. **Colocar cada atendente nas filas dele.** Atendente sem fila
   **não vê nada** — é o efeito colateral direto do isolamento.
3. Decidir se a recepção acompanha o que já atribuiu.
