# Decisoes pendentes

Atualizado em: 13/08/2026

## Gestao da Grafica

- Validar limites comerciais padrao por tenant: desconto maximo sem aprovacao e margem minima.
- Validar custos reais de materiais e processos. Valores preliminares devem permanecer como `PENDING_VALIDATION`.
- Definir modelo visual final do PDF de orcamento.
- Definir se pedidos aprovados devem gerar automaticamente `FinancialTitle` sempre ou apenas quando houver condicao de pagamento confirmada.
- Definir quais usuarios `studium`, `ana` e `marina` terao `gestao-grafica` em producao.
- Configurar ESLint nao interativo. Hoje `npm run lint` chama `next lint` e abre assistente de configuracao.
- Criar script `npm run test` com suites automatizadas do modulo grafica.
