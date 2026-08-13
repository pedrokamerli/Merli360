# Arquivos da Gestao da Grafica

## Implementado

- Upload autenticado em `/api/gestao-grafica/attachments`.
- Vinculo por tenant com oportunidade, orcamento, pedido, producao, entrega ou pos-venda.
- Gravacao em `Attachment` e `GraphicAttachment`.
- Validacao de MIME e extensao para JPG, PNG, WebP e PDF.
- Limite de 10 MB por arquivo.
- Download pela rota autenticada `/api/attachments/:id`, filtrada por tenant.
- Auditoria de upload com arquivo, tamanho, finalidade e registro vinculado.

## Finalidades previstas

- `ARTWORK`
- `LOGO`
- `PROOF`
- `PHOTO`
- `DELIVERY_PROOF`
- `DOCUMENT`
- `OTHER`

## Pendente

- Tela completa de galeria por entidade.
- Exclusao logica de anexos da grafica.
- Politica formal de retencao e classificacao LGPD.
