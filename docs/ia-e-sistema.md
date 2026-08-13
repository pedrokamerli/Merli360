# Merli360 e IA 360

Este documento resume o que o Merli360 faz hoje e como a IA atua dentro do sistema.

## O que o sistema faz

O Merli360 e um SaaS privado de gestao financeira, comercial e operacional, pensado para uso individual ou por pequenos negocios. Ele funciona com usuarios separados por tenant, ou seja, cada pessoa/empresa acessa somente seus proprios dados.

Principais modulos:

- Dashboard com saldo, entradas, saidas, resultado, contas abertas e vencidos.
- Fluxo de caixa com entradas, saidas, categorias, contas/carteiras, formas de pagamento e observacoes.
- Contas a pagar e contas a receber.
- Carteiras/contas financeiras com saldo sincronizado pelo fluxo de caixa.
- Categorias e centros de custo.
- Importacao e conciliacao de extratos.
- Relatorios financeiros e exportacao CSV.
- Configuracoes por usuario.
- Super admin para gerenciar usuarios e configuracoes globais da IA.
- PWA e notificacoes para uso no celular.

Para o modo consultoria/comercial, o sistema tambem pode controlar:

- Clientes e contratos.
- Notas fiscais.
- Ads/verba de anuncios.
- CRM/pipeline comercial.
- Metas comerciais.
- Oferta 360.

Para o modo agro, o sistema pode controlar:

- Vendas rurais.
- Compradores.
- Produtos/culturas.
- Plantios.
- Colheitas.
- Estoque.
- Agenda rural.
- Custos por cultura.
- Contas e fluxo de caixa do produtor.

## Como os dados financeiros funcionam

O sistema trabalha com uma base financeira central:

- `CashMovement`: fluxo de caixa realizado.
- `FinancialTitle`: contas a pagar e a receber.
- `Settlement`: baixas/pagamentos/recebimentos.
- `FinancialAccount`: contas e carteiras.
- `BankTransaction`: itens importados de extratos.
- `Category`: categorias financeiras.
- `Budget` e `BudgetLine`: orcamento por categoria.

Quando uma conta e paga ou recebida, ela deve gerar movimento no fluxo de caixa. Quando um extrato e conciliado, a movimentacao revisada tambem deve ir para o fluxo de caixa. Assim, dashboard, carteiras e relatorios usam a mesma base.

## O que a IA faz no sistema

A IA 360 e uma assistente operacional integrada ao Merli360. Ela nao deve ser apenas um chat informativo. A funcao dela e ler dados reais, conversar com o usuario, sugerir organizacao e executar acoes dentro do sistema quando houver seguranca.

Ela pode:

- Responder perguntas sobre saldo, fluxo, contas, vencidos, categorias e relatorios.
- Criar entradas e saidas no fluxo de caixa.
- Criar contas a pagar.
- Criar contas a receber.
- Baixar contas recebidas ou pagas quando o usuario confirmar.
- Atualizar saldos iniciais de carteiras.
- Consultar dados do banco antes de responder.
- Gerar relatorios financeiros do zero usando dados reais.
- Analisar gastos por categoria.
- Apontar alertas de vencimento, atraso e saldo comprometido.
- Ajudar na importacao e classificacao de extratos.
- Ler anexos, imagens, comprovantes, PDFs, CSVs, XLSX e OFX quando o parser conseguir extrair os dados.
- Sugerir categorias, formas de pagamento e contas.
- Aprender com correcoes do usuario.
- Usar a memoria do usuario para adaptar as respostas.
- No modo agro, consultar plantios, colheitas, estoque, vendas e compradores.

## O que a IA nao deve fazer automaticamente

A IA nao deve agir sem confirmacao quando houver risco ou duvida. Ela deve pedir revisao antes de:

- Excluir registros.
- Alterar valor de lancamento conciliado.
- Marcar conta como paga ou recebida sem dados claros.
- Registrar anexo com valor ilegivel.
- Criar movimento sem saber valor, tipo ou conta.
- Tratar previsao como dinheiro recebido.
- Duplicar lancamentos parecidos.

A IA tambem nao executa pagamentos reais, transferencias bancarias externas ou cobrancas fora do sistema.

## Como a IA entende cada usuario

Cada usuario tem uma configuracao e memoria propria. Essa memoria serve para a IA entender:

- Nome do usuario.
- Tipo de uso: pessoal, empresa/MEI, cartao, agro, consultoria ou misto.
- Contas/carteiras usadas.
- Saldos iniciais.
- Rotina de entradas e despesas.
- Metas e objetivos financeiros.
- Preferencias de categorias.
- Clientes, fornecedores ou compradores recorrentes.
- Correcoes feitas pelo usuario.

No primeiro acesso, o ideal e o usuario preencher um formulario de aprendizado. Depois disso, a IA abre o chat, se apresenta, explica o que foi configurado e ensina como usar o sistema.

## Relatorios com IA

Os relatorios foram pensados para usar dados reais do banco, nao texto generico.

A IA pode gerar:

- Relatorio mensal.
- Relatorio de gastos.
- Relatorio por categoria.
- Relatorio de entradas e saidas.
- Relatorio de contas a pagar.
- Relatorio de contas a receber.
- Relatorio de vencidos.
- Relatorio de saldo por carteira.
- Relatorio operacional agro, quando o tenant for agro.

Os relatorios analisam:

- Entradas realizadas.
- Saidas realizadas.
- Resultado do periodo.
- Saldo consolidado das carteiras.
- Saldo projetado com contas abertas.
- Categorias com maior gasto.
- Maiores lancamentos.
- Contas vencidas.
- Contas proximas do vencimento.
- Itens de extrato a revisar.
- Categorias em "A conferir".

Na tela `/relatorios`, o usuario consegue visualizar tabelas, filtrar por mes, status, categoria/descricao e exportar CSV.

## Como conversar com a IA

O usuario pode escrever de forma natural, por exemplo:

```text
Recebi um Pix de R$ 1.000 hoje na conta PJ.
```

```text
Paguei R$ 89,90 do ChatGPT no Santander via Pix dia 8.
```

```text
Tenho que pagar R$ 600 de aluguel dia 10.
```

```text
Faz um relatorio dos meus gastos desse mes.
```

```text
Quanto tenho em contas a pagar vencidas?
```

```text
Crie uma conta a receber de R$ 800 do cliente Joao para dia 15.
```

Se faltar algum dado essencial, a IA deve perguntar de forma objetiva:

```text
Entendi que voce quer registrar uma despesa, mas faltou o valor. Qual foi o valor?
```

ou:

```text
Consigo registrar esse recebimento. Em qual conta caiu: PJ, pessoal, dinheiro ou outra?
```

## Configuracao da IA

O super admin configura a IA globalmente, incluindo:

- Provedor principal.
- Modelo da OpenAI.
- Modelo do Gemini.
- Provedor barato para tarefas simples.
- Provedor inteligente para raciocinio mais pesado.
- Provedor de visao para anexos e imagens.
- Contexto global da IA.
- Permissao para busca na web.
- Regras de execucao automatica.

Cada usuario tem suas proprias metas, memoria e preferencias. Um usuario nao deve ver nem usar os dados financeiros de outro.

## Arquitetura operacional da IA

A IA funciona em camadas:

1. Contexto unificado
   - Busca saldos, fluxo, titulos, categorias, contas, metas, importacoes e memoria do usuario.

2. Interpretacao
   - Entende se o usuario quer consultar, registrar, editar, excluir, gerar relatorio ou pedir ajuda.

3. Ferramentas reais
   - Consulta banco.
   - Cria registros.
   - Atualiza fluxo.
   - Gera relatorios.
   - Usa conciliacao e classificacao.

4. Confirmacao
   - Quando existe duvida, prepara uma acao para o usuario confirmar antes de salvar.

5. Memoria
   - Salva aprendizados e usa correcoes futuras para classificar melhor.

6. Resposta humana
   - Explica o que fez, o que encontrou, o que falta e qual o proximo passo.

## Regras de qualidade da IA

A IA deve:

- Responder em portugues do Brasil.
- Usar valores no formato `R$ 1.234,56`.
- Usar datas no formato `DD/MM/AAAA`.
- Ser clara, humana e objetiva.
- Consultar o banco antes de responder sobre dados.
- Nao inventar numeros.
- Dizer quando nao encontrou dados.
- Perguntar apenas o que estiver faltando.
- Dar dicas praticas com base nos dados reais.
- Aprender com o usuario.

## Objetivo final

O objetivo da IA no Merli360 e ser uma assistente financeira real: registrar, organizar, analisar, avisar, lembrar, ensinar e ajudar o usuario a tomar decisoes melhores com base no que esta salvo no sistema.

