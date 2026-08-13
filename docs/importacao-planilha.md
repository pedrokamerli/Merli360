# Importacao de planilha - Gestao da Grafica

## Abas previstas

- PARAMETROS
- MATERIAIS
- PROCESSOS
- FAIXAS_QTD
- PRODUTOS
- CLIENTES
- PEDIDOS
- PRODUCAO

## Regras

- Importar em modo simulacao antes de gravar.
- Detectar linhas vazias e linhas de modelo como `PED0001` e `CLI001`.
- Preservar origem da planilha e linha.
- Custos importados entram como `PENDING_VALIDATION`.
- Validar duplicidade por tenant.
- Registrar relatorio de erros e pendencias.

## Implementado neste ciclo

- Upload Excel `.xlsx`/`.xls` pela tela da Gestao da Grafica.
- Previa antes de gravar.
- Confirmacao separada da importacao.
- Gravacao das abas `PARAMETROS`, `MATERIAIS`, `PROCESSOS` e `PRODUTOS`.
- Atualizacao de cadastros existentes por nome/chave dentro do tenant.
- Historico de custo para materiais importados.
- Custos importados sempre como `PENDING_VALIDATION`.
- Aviso para abas reconhecidas que ainda nao sao gravadas: `FAIXAS_QTD`, `CLIENTES`, `PEDIDOS` e `PRODUCAO`.

## Pendente

- Importar clientes, pedidos e producao da planilha.
- Relatorio persistente de lote de importacao.
- Rollback administrativo de importacao confirmada.
