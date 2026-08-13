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

O importador completo sera implementado em ciclo proprio.
