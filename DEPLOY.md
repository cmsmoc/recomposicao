# 📋 Guia de Deploy e Arquitetura — CMS Recomposição v2.1

---

## 🧠 Como este sistema funciona — explicação para leigos

Este sistema é como um **painel de controle** que lê automaticamente as informações de uma planilha Google Sheets e as exibe de forma organizada numa série de páginas web. Não há banco de dados separado: tudo vive na planilha.

### O fluxo completo em 4 passos

```
1. Planilha Google Sheets
   (os dados ficam aqui — entidades, conselheiros, formulários)
          ↓
2. Google Apps Script (Code.gs)
   (um programa que roda "dentro" da planilha e responde perguntas)
          ↓
3. Páginas HTML (GitHub Pages)
   (o frontend — o que as pessoas veem no navegador)
          ↓
4. Usuário (comissão, gestores, conselheiros)
   (acessa pelo link, sem instalar nada)
```

### O que é cada arquivo HTML

| Arquivo | O que é | Quem acessa |
|---------|---------|------------|
| `index.html` | Dashboard — visão geral do processo, números e alertas | Todos |
| `entidades.html` | Status de cada entidade na recomposição | Todos |
| `conselheiros.html` | Lista de quem é conselheiro hoje, com mandatos | Todos |
| `inscricoes.html` | Novas entidades candidatas e documentação | Todos |
| `painel.html` | Painel administrativo (senha) — funções avançadas | Só a comissão |

### O que é cada aba da planilha

| Aba | O que contém | Quem preenche |
|-----|-------------|--------------|
| `entidades` | Lista mestre das 32 entidades do conselho | Você (fixo) |
| `todosconselheiros` | Os conselheiros atuais e seus mandatos | Você (fixo) |
| `renovacoes` | Respostas do formulário de renovação | As entidades (formulário) |
| `inscritos` | Formulário de inscrição de novas candidatas | Novas entidades |
| `config` | Configurações do sistema (senha, total de cadeiras etc.) | Você |
| `avaliacoes` | Anotações e notas da comissão por entidade | Comissão (pelo painel) |
| `regras_inconsistencias` | Regras do detector de problemas (v2) | Você (pelo painel) |
| `status_manual` | Quando você quer forçar um status diferente do automático (v2) | Comissão (pelo painel) |
| `cadeiras` | Mapeamento dos IDs das cadeiras especiais (v2) | Você (referência) |

---

## 🔗 Como o sistema "liga" entidades com renovações

Esta é a parte que causava confusão. Veja como funciona:

A aba `entidades` contém **apenas os nomes** das 32 entidades, uma por linha:
```
Associação X
Sindicato Y
Hospital Z
...
```

A aba `renovacoes` contém as **respostas ao formulário**, onde cada linha é uma resposta. No formulário existe um campo "Nome completo da entidade", e o sistema pega esse campo e **compara com a lista da aba `entidades`** usando uma função de normalização (que ignora acentos, maiúsculas e espaços extras).

**Se os nomes batem → a entidade aparece como PENDENTE, COMPLETO ou IMPEDIDO.**
**Se os nomes não batem → a entidade aparece como SEM_RESPOSTA** (mesmo que tenha respondido!).

Por isso, se você vir muitas entidades como "Sem Resposta" mesmo tendo respostas no formulário, o problema é que o nome digitado no formulário é diferente do nome na aba `entidades`. A solução é padronizar: o nome na aba `entidades` deve ser escrito exatamente da mesma forma que aparece no campo "Nome completo da entidade" do formulário.

---

## ❓ Respostas às suas dúvidas

### "A coluna MANDATO mudou para SUBTIPO"

Isso não deveria ter acontecido. O `setupConfig2()` foi corrigido na v2.1: ele **apenas adiciona** colunas novas ao final da aba, nunca altera as existentes. Se a coluna MANDATO ficou com o nome errado na sua planilha, basta renomeá-la de volta para `MANDATO`.

As colunas novas que serão adicionadas ao final são:
- `ID_CADEIRA` — identificador único da cadeira (para referência interna)
- `SUBTIPO` — se é GESTOR ou PRESTADOR (dentro do segmento GESTOR/PRESTADOR)

A coluna MANDATO permanece intacta onde sempre esteve.

### "Não entendi o funcionamento do Status Manual"

O status de cada entidade normalmente é **calculado automaticamente** com base na planilha:
- Se ela respondeu o formulário de renovação → COMPLETO, PENDENTE ou IMPEDIDO
- Se não respondeu nada → SEM_RESPOSTA

O **Status Manual** é uma forma de **sobrescrever** esse status automático quando você sabe de algo que o sistema não consegue detectar. Exemplo:

> A entidade X não respondeu o formulário ainda, mas você sabe que entregou os documentos fisicamente. O sistema mostraria "Sem Resposta", mas você quer que apareça "Pendente" com uma nota explicando.

Como usar:
1. Acesse Painel Admin → **Status Manual**
2. Selecione a entidade
3. Escolha o status que você quer mostrar
4. Escreva uma observação (vai aparecer como tooltip no card)
5. Clique Salvar

O card da entidade vai ganhar uma **borda roxa** e um badge "✏️ Manual" para indicar que o status foi definido manualmente. O status automático ainda é calculado por baixo (campo `statusAuto`) — você pode vê-lo ao abrir o detalhe da entidade.

Para **remover** um status manual, selecione a entidade no painel, deixe o campo status em branco e salve.

### "Tentei incluir mais uma página mas não funcionou — menu_itens"

O campo `menu_itens` na aba `config` não tem efeito no frontend. Ele foi criado como uma ideia futura mas **os links da navegação estão diretamente no HTML de cada página** — eles são fixos. Para adicionar uma nova página ao menu de navegação, você precisa editar a tag `<nav class="topbar">` em cada um dos 5 HTMLs e adicionar o link. Não é possível fazer isso pela planilha.

---

## 🚀 Deploy v2.1 — passo a passo

### Passo 1 — Atualizar o Code.gs

1. Abra a planilha → **Extensões → Apps Script**
2. Apague tudo e cole o conteúdo do novo `Code.gs`
3. Salve (Ctrl+S)

### Passo 2 — Executar setupConfig2()

1. No editor GAS, selecione a função `setupConfig2` no dropdown
2. Clique em **▶ Executar**
3. Autorize as permissões se solicitado

O que será criado:
- Abas `regras_inconsistencias`, `status_manual` e `cadeiras` (se não existirem)
- Colunas `ID_CADEIRA` e `SUBTIPO` **ao final** da aba `todosconselheiros`
- A coluna `MANDATO` e todas as outras **não são tocadas**

O resultado no log vai mostrar algo como:
```json
{
  "criadas": ["regras_inconsistencias", "status_manual", "cadeiras"],
  "jaExistiam": ["config", "avaliacoes"],
  "colunasAdicionadas": ["ID_CADEIRA (col 11)", "SUBTIPO (col 12)"]
}
```

### Passo 3 — Verificar e preencher as novas colunas

Na aba `todosconselheiros`, você vai encontrar duas novas colunas no final:

**Coluna SUBTIPO** — preencha para entidades do segmento GESTOR/PRESTADOR:
- Gestores (GESTOR): CODEVASF, GRS, HUCF, SMS-MOC, SRS
- Prestadores (PRESTADOR): HDG, APAE, GRAPPA, Capelo Gaivota, Santa Casa (HSC), Vovó Clarice

**Coluna ID_CADEIRA** — identificador de cada cadeira. Preencha conforme abaixo:

Cadeiras padrão (uma entidade = titular + suplente):
```
ID1A = titular da entidade 1
ID1B = suplente da entidade 1
ID2A = titular da entidade 2
ID2B = suplente da entidade 2
... e assim por diante
```

Cadeiras especiais de PRESTADOR (6 cadeiras — entidades diferentes por posição):
```
ID-P1-T → HDG (titular)
ID-P1-S → APAE (suplente)
ID-P2-T → GRAPPA (titular)
ID-P2-S → Capelo Gaivota (suplente)
ID-P3-T → Santa Casa / HSC (titular)
ID-P3-S → Vovó Clarice (suplente)
```

Cadeiras especiais de USUÁRIO / CLS (6 cadeiras — CLS Ind ocupa 3 por exceção):
```
ID-U1-T → CLS Ind — Amanda Mendes Soares
ID-U1-S → CLS Ind — Terezinha Ramos Cordeiro
ID-U2-T → CLS Ren — Emanuela Tomas da Silva Conceição
ID-U2-S → CLS Ind — Wilhas Ferreira  (exceção: CLS Ind na suplente também)
ID-U3-T → CLS JD PR. II — Joel Francisco Borges
ID-U3-S → CLS Bl.V/V. Atl — Danielle Santos Sousa
```

> **Nota sobre o CLS Ind**: normalmente cada cadeira titular + suplente pertence à mesma entidade. No caso dos CLS usuários, titular e suplente são entidades diferentes (por isso o sufixo -T e -S em vez de A e B). Por exceção, o CLS Ind assume 3 dessas 6 posições — a regra `CLS_MULTIPLAS_CADEIRAS` aceita isso, com limite configurado para 3.

### Passo 4 — Publicar nova versão do Web App

1. No GAS → **Implantar → Gerenciar implantações**
2. Clique em ✏️ editar a implantação existente
3. Em "Versão", selecione **Nova versão**
4. Clique em **Implantar**
5. A URL não muda ✅

### Passo 5 — Rodar o Health Check

No **Painel Admin → Health Check**, clique em "Rodar Diagnóstico". Você deve ver tudo verde. Se aparecer ⚠️ avisos de colunas v2 ausentes, rode o `setupConfig2()` novamente.

### Passo 6 — Subir os HTMLs

Faça upload dos arquivos HTML para o repositório GitHub e aguarde o GitHub Pages atualizar (~2 minutos).

---

## 🔧 Configurar Regras de Inconsistência

Acesse **Painel Admin → Regras de Inconsistência**. Cada regra tem:
- **Toggle on/off** — para ativar ou desativar completamente
- **Severidade** — CRITICO (vermelho), ALERTA (laranja) ou INFO (azul)
- **Parâmetros** — valores que a regra usa (ex: limite de mandatos, nome do CLS)

| Regra | Detecta | Parâmetros |
|-------|---------|-----------|
| CPF_DUPLICADO | CPF repetido entre renovações | — |
| MANDATO_INVALIDO | 2º mandato querendo renovar | `mandatos_max` |
| DADOS_FALTANTES | Renovação incompleta | — |
| CNPJ_INVALIDO | CNPJ com formato errado | — |
| DOCS_FALTANTES | Docs ausentes em inscrições | — |
| SEM_RESPOSTA | Entidade sem nenhuma resposta | — |
| CLS_MULTIPLAS_CADEIRAS | CLS Ind com mais cadeiras que o limite | `cls_ind_max=3`, `cls_ind_nome` |
| PRESTADOR_SEM_PAR | Cadeira prestador sem par T/S | — |
| TITULAR_EXERCE_DIRECAO | Titular que também dirige a entidade | — |

---

## 🛠 Solução de Problemas

### Entidades aparecem como "Sem Resposta" mesmo tendo respondido
→ O nome na aba `entidades` não bate com o digitado no formulário. Padronize os nomes.

### A coluna MANDATO sumiu ou ficou com nome errado
→ Renomeie de volta para `MANDATO` na aba `todosconselheiros`. A v2.1 não toca nessa coluna.

### Colunas ID_CADEIRA / SUBTIPO não foram criadas
→ Execute `setupConfig2()` novamente. Verifique se a aba `todosconselheiros` existe.

### CORS / fetch bloqueado no navegador
→ O Web App deve estar configurado para "Qualquer pessoa" (não "Autenticado").

### Health Check mostra erros de "Aba ausente"
→ Execute `setupConfig2()` no GAS.

### Senha não funciona
→ Verifique a aba `config`, linha `senha_admin`. Padrão: `cms2024`.

---

## 💡 Sugestões de melhorias futuras

1. **Histórico de alterações de status manual** — guardar o log de quem alterou o quê e quando, em vez de só o valor atual
2. **Notificações por e-mail** — trigger no GAS que envia e-mail para a comissão quando uma entidade preenche o formulário
3. **Prazo por entidade** — coluna na aba `entidades` com data limite individual, exibida no card
4. **Exportação CSV** — além do PDF atual, exportar a lista de renovações em CSV para importar em outros sistemas
5. **Aprovação formal** — um workflow de "aprovação" na planilha onde cada entidade passa por PENDENTE → EM_ANÁLISE → APROVADA → HOMOLOGADA, com o painel refletindo cada fase
6. **Login por e-mail** — substituir a senha única por autenticação por conta Google, usando a API do GAS
7. **Modo público com dados mascarados** — link separado para as próprias entidades acompanharem seu status sem ver dados de terceiros

---

## 🔐 Segurança

- CPF, RG e endereços são **mascarados** nas páginas públicas
- Dados sensíveis completos só aparecem no **Painel Admin** (com senha)
- IDs de cadeiras (`ID_CADEIRA`) são internos — não expostos publicamente
- Troque a senha `cms2024` antes de usar em produção real
