# Decisoes pendentes

Atualizado em: 13/08/2026

## Gestao da Grafica

- Validar limites comerciais padrao por tenant: desconto maximo sem aprovacao e margem minima.
- Validar custos reais de materiais e processos cadastrados na tela. Valores zerados ou preliminares permanecem como `PENDING_VALIDATION`.
- Evoluir o modelo visual do PDF de orcamento; neste ciclo existe PDF comercial simples por token.
- Definir quais usuarios `studium`, `ana` e `marina` terao `gestao-grafica` em producao.
- Revisar os papeis operacionais reais por usuario na tela da Gestao da Grafica depois da definicao do dono da operacao.
- Definir se todas as etapas de producao serao obrigatorias por produto ou se algumas podem ser puladas por tipo de servico.
- Definir regras finais para importacao de `CLIENTES`, `PEDIDOS`, `PRODUCAO` e `FAIXAS_QTD`.
- Definir politica de retencao, exclusao logica e classificacao LGPD dos arquivos anexados da grafica.
- Definir modelo de revisao comercial para reabrir orcamentos recusados/cancelados; por enquanto deve duplicar.
- Adotar ESLint real em ciclo futuro. Neste momento `npm run lint` e nao interativo e executa `tsc --noEmit`.
- Ampliar a suite `npm run test` para cobrir mais fluxos integrados do modulo grafica, alem das regras puras ja cobertas.
