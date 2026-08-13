# Merli360

Sistema local de gestão financeira e comercial para consultoria digital.

## Tecnologias

- Next.js + TypeScript
- SQLite local
- Prisma ORM
- Tailwind CSS
- Recharts
- Sem login nesta versão

## Como instalar

```bash
npm install
npx prisma generate
```

## Como criar o banco

Fluxo padrão esperado:

```bash
npx prisma migrate dev
npx prisma db seed
```

Nesta máquina, o engine de migração do Prisma retornou `Schema engine error` sem detalhes, apesar do schema validar. Por isso o projeto também inclui uma inicialização local equivalente:

```bash
npm run db:init
npx prisma db seed
```

O banco fica em:

```text
prisma/dev.db
```

## Como rodar

```bash
npm run dev
```

Depois acesse:

```text
http://localhost:3000
```

## Autenticacao basica

Para ver localmente sem senha, deixe no `.env`:

```text
BASIC_AUTH_ENABLED="false"
```

Na VPS, ative:

```text
BASIC_AUTH_ENABLED="true"
BASIC_AUTH_USER="pedro"
BASIC_AUTH_PASSWORD="uma-senha-forte-aqui"
PORT="3001"
```

Com isso o navegador, inclusive no celular, vai pedir usuario e senha antes de abrir o sistema.

## Deploy junto com outro SaaS na mesma VPS

Este sistema foi preparado para rodar separado do SaaS atual. A regra principal e nao reaproveitar a mesma porta, pasta, banco ou arquivo `.env`.

Sugestao:

```text
/var/www/seu-saas-atual
/var/www/pedro-gestao-360
```

Portas:

```text
SaaS atual: manter como esta
Merli360: 127.0.0.1:3100
```

Deploy isolado com Docker:

```bash
cd /opt/novo-saas
cp .env.example .env.production
nano .env.production
docker compose --env-file .env.production -p merli360 up -d --build
```

Teste local pela VPS:

```bash
curl -I http://127.0.0.1:3100
```

Para testar no seu computador sem mexer no Nginx do Evolync, use tunel SSH:

```powershell
ssh -L 3100:127.0.0.1:3100 root@IP_DA_VPS
```

Depois abra no navegador: `http://localhost:3100`.

O subdominio `gestao.evolync.com` deve ser ligado depois, criando um bloco separado no proxy atual. Como o Nginx do Evolync roda em container, nao instale outro Nginx no host nas portas 80/443 sem revisar o proxy existente.

## Módulos

- Dashboard financeiro e comercial
- Fluxo de caixa
- Importação de extrato CSV
- Clientes e contratos
- Notas fiscais
- Controle de Ads
- Contas a receber
- Contas a pagar
- Metas comerciais
- Pipeline/CRM
- Oferta 360
- Relatórios e exportação CSV

## Importar extrato CSV

1. Abra `Importar Extrato`.
2. Escolha um arquivo `.csv`.
3. Clique em `Pré-visualizar`.
4. Confira entradas, saídas, saldo líquido, duplicados e itens a conferir.
5. Clique em `Confirmar importação`.

Os lançamentos importados entram como `conferencia` e usam deduplicação por:

```text
data + descrição + valor
```

Regras automáticas já incluídas:

- FACEBK, FACEBOOK, META, FB, INSTAGRAM ADS -> Anúncios
- CANVA, OPENAI, CHATGPT, CAPCUT -> Ferramentas
- MEI, DAS -> MEI/impostos
- Pix recebido -> Entrada a conferir
- Pix enviado -> Saída a conferir
- Transferência própria identificada -> Transferência própria

## Gerar contas a receber recorrentes

Abra `A Receber`, selecione o mês e clique em `Gerar`.

O sistema cria mensalidades para clientes ativos e recorrentes com base no dia de vencimento cadastrado, sem duplicar descrições já existentes.

## Backup do banco

Com o servidor parado, copie este arquivo para uma pasta segura:

```text
prisma/dev.db
```

Exemplo no PowerShell:

```powershell
Copy-Item .\prisma\dev.db ".\backup-dev-$(Get-Date -Format yyyy-MM-dd-HHmm).db"
```

Na VPS com Docker, o banco fica no volume em `/app/data/dev.db`:

```bash
docker cp merli360_app:/app/data/dev.db ./backup-merli360.db
```

## PWA, notificacoes e comprovantes

- O app possui manifesto PWA e service worker. No celular, acesse pelo HTTPS e use a opcao do navegador para instalar/adicionar na tela inicial.
- A pagina `Notificacoes` permite ativar alertas no aparelho e acompanhar contas a pagar e a receber vencendo.
- Para push mesmo com o app fechado, gere chaves com `npm run push:keys` e coloque `VAPID_PUBLIC_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` e `VAPID_SUBJECT` no ambiente da VPS.
- Comprovantes em PDF ou imagem podem ser enviados na pagina `Comprovantes` ou direto nos campos `Comprovante/link` dos cadastros.

## Migracao para PostgreSQL

O caminho seguro de migracao esta em `docs/postgresql-migration.md`, com exportacao do SQLite para JSON, subida do `docker-compose.postgres.yml` e importacao no PostgreSQL. Faca backup do `dev.db` antes da virada.

## Exportar dados

Abra `Relatórios` e use os botões de exportação CSV para:

- Fluxo financeiro
- Clientes
- Ads
- Metas
- Notas fiscais

PDF ficou como melhoria futura do MVP.

## Dados iniciais

O seed cria:

- 6 clientes recorrentes ativos, totalizando R$ 3.050/mês
- Projeto avulso Landing page Amarílis de R$ 500
- Custos fixos da empresa
- Despesas pessoais informadas
- Contas a receber e pagar de julho/2026
- Notas fiscais pendentes
- Controle inicial de ads
- Metas comerciais
- Lead inicial no CRM
- Planos da Oferta 360
