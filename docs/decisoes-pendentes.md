# Decisoes pendentes

Atualizado em: 13/08/2026

## Gestao da Grafica

- Validar limites comerciais padrao por tenant: desconto maximo sem aprovacao e margem minima.
- Validar custos reais de materiais e processos. Valores preliminares devem permanecer como `PENDING_VALIDATION`.
- Evoluir o modelo visual do PDF de orcamento; neste ciclo existe PDF comercial simples por token.
- Definir se pedidos aprovados devem gerar automaticamente `FinancialTitle` sempre ou apenas quando houver condicao de pagamento confirmada.
- Definir quais usuarios `studium`, `ana` e `marina` terao `gestao-grafica` em producao.
- Adotar ESLint real em ciclo futuro. Neste momento `npm run lint` e nao interativo e executa `tsc --noEmit`.
- Criar script `npm run test` com suites automatizadas do modulo grafica.
