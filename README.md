# ON BETS

A central de palpites da ORG ON Camps. Plataforma **recreativa** de palpites em campeonatos de eFootball com pontos virtuais (ON Coins). Não há dinheiro real: nada de depósitos, saques, transferências ou prêmios.

**Stack:** React + Vite + Tailwind CSS v4 · Supabase (PostgreSQL, Auth, RLS, funções SQL, Realtime) · Vercel.

Arquitetura, decisões técnicas e regras de negócio: [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md).

## O que tem

| Área | Funcionalidades |
|---|---|
| Conta | cadastro, login, logout, recuperação de senha, perfil editável |
| Carteira | 1.000 ON Coins no cadastro (configurável), saldo ao vivo na barra superior, extrato completo |
| Palpites | partidas (1X2), campeões, marcos históricos; cupom com retorno previsto; odd congelada; idempotente |
| Partidas | próximas e resultados, filtro por campeonato |
| Ranking | pódio ouro/prata/bronze, tabela, sua posição; destaques de maiores acertos |
| Histórico | todos os palpites, filtros, taxa de acerto, resultado líquido |
| Admin: painel | estatísticas, atividade recente (auditoria), configurações de saldo inicial e limites |
| Admin: catálogo | times, campeonatos (com times participantes), partidas, eventos com opções e odds |
| Admin: resultados | apuração única com sugestão pelo placar, exposição por opção, anulação com devolução |
| Admin: participantes | busca, saldo, extrato, palpites, crédito/débito com justificativa, promover/rebaixar admin |

## Colocando para rodar

Pré-requisito: Node.js 20 ou superior.

### 1. Banco de dados (Supabase)

No **SQL Editor** do seu projeto, rode **cada arquivo uma vez, nesta ordem** (cole o conteúdo inteiro → **Run**):

1. `supabase/migrations/20261116000001_fase1_schema.sql`
2. `supabase/migrations/20261116000002_fase2_auth.sql`
3. `supabase/migrations/20261116000003_fase3_carteira.sql`
4. `supabase/migrations/20261116000004_fase4_palpites.sql`
5. `supabase/migrations/20261116000005_fase5_admin.sql`
6. `supabase/migrations/20261116000006_fase6_ranking.sql`

Se você já rodou a 1 e a 2, comece pela 3. Quem já tinha conta ganha a carteira com o saldo inicial na migration 3.

Opcional: `supabase/seed/demo.sql` cria times, partidas e eventos **de demonstração** (tudo com "(demo)" no nome; o fim do arquivo tem o bloco para apagar).

### 2. Autenticação

**Authentication → URL Configuration**

- **Site URL:** `http://localhost:5173` (depois do deploy, troque pela URL da Vercel).
- **Redirect URLs:** `http://localhost:5173/**` e, depois do deploy, `https://SEU-APP.vercel.app/**`.

**Authentication → Sign In / Providers → Email**

- **Minimum password length:** `8` (o site já exige 8).
- **Confirm email:** pode desligar para testar; ligue antes de abrir ao público.

> O e-mail padrão do Supabase envia poucas mensagens por hora. Para uso real, configure um SMTP próprio em **Authentication → Emails → SMTP Settings** (ex.: Resend, plano grátis).

### 3. Variáveis de ambiente

```bash
cp .env.example .env.local
```

```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_xxxx
```

Use a **publishable key** (ou a `anon` legada). **Nunca** a `secret`/`service_role`.

### 4. Rodar

```bash
npm install
npm run dev        # http://localhost:5173
```

### 5. Virar administrador

1. Crie sua conta pelo site e confirme o e-mail.
2. No **SQL Editor**:

```sql
update public.profiles set role = 'admin' where username = 'SEU_USERNAME';
```

3. Saia e entre de novo → aparece **Administração** no menu. Daqui em diante, promova outros admins pelo painel (**Participantes → Função**), que fica auditado.

### 6. Primeiro campeonato (pelo painel)

1. **Campeonatos e times → Novo time** (cadastre os times, com sigla e URL do escudo).
2. **Novo campeonato** → marque os times participantes.
3. **Partidas → Nova partida** → **Criar palpite 1X2** (define as 3 odds e abre na hora).
4. Para previsão de campeão: em **Campeonatos**, botão **Evento de campeão** (cria rascunho com os times; ajuste as odds e mude para Aberto).
5. Marcos históricos: **Eventos → Novo evento → Marco histórico** (regras obrigatórias).
6. Depois do jogo: **Partidas → Editar** (placar + Finalizada) → **Resultados** → confirme a opção (o placar já sugere) → **Apurar resultado**.

## Testes

```bash
npm run test:db
```

Roda todas as migrations num Postgres embutido (PGlite) e executa **107 testes**: RLS, privilégios, imutabilidade, idempotência, limites de valor, prazos, apuração única, anulação, ajustes, auditoria, ranking e consistência saldo × extrato.

Além disso, durante o desenvolvimento, os serviços do frontend (`src/services/*`) foram executados contra **PostgreSQL + PostgREST reais** com JWT de visitante, participante e admin (70 cenários de ponta a ponta), e as telas foram conferidas no navegador em desktop e celular.

## Publicando (GitHub + Vercel)

```bash
git init
git add .
git commit -m "ON BETS: plataforma completa (fases 1 a 7)"
git branch -M main
git remote add origin https://github.com/cauaprs92/on-bets.git
git push -u origin main
```

Na Vercel: **Add New → Project** → importe o repositório → framework **Vite** (build `npm run build`, saída `dist`) → **Environment Variables**: `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` → **Deploy**.

Depois do deploy:

1. Supabase → **Authentication → URL Configuration**: Site URL = URL da Vercel; adicione `https://SEU-APP.vercel.app/**` nas Redirect URLs.
2. Teste cadastro, confirmação de e-mail e recuperação de senha no endereço publicado.

O `vercel.json` já redireciona as rotas do React para o `index.html` (F5 em `/ranking` funciona).

### Checklist antes de abrir ao público

- [ ] Confirm email **ligado** e SMTP próprio configurado.
- [ ] Senha mínima 8 no painel do Supabase.
- [ ] `demo.sql` apagado (bloco "LIMPAR DEMO").
- [ ] Mascote oficial em `public/assets/`.
- [ ] Apenas pessoas da organização como admin.
- [ ] Plano grátis do Supabase pausa após 7 dias sem uso: acesse com frequência ou ative o upgrade.

## Estrutura

```
on-bets/
├─ public/assets/            favicon, mascote (provisório)
├─ src/
│  ├─ components/            Layout, Navbar, Sidebar, BottomNav, cards (Match, Prediction, Wallet, Ranking)…
│  │  └─ ui/                 Button, Modal, Inputs, Field, ConfirmButton, estados de tela
│  ├─ context/               Auth, Wallet (saldo + Realtime), BetSlip (cupom global), Toast
│  ├─ pages/                 Home, Matches, Predictions, EventDetail, Wallet, Ranking, History, Profile, auth
│  │  └─ admin/              Dashboard, Events, Results, Matches, Competitions, Users (carregados sob demanda)
│  ├─ services/              supabase, auth, catalog, prediction, wallet, ranking, admin
│  ├─ hooks/useAsync.js
│  ├─ styles/index.css       tokens da identidade visual
│  └─ utils/format.js        ON Coins, odds e datas em pt-BR / America/Sao_Paulo
├─ supabase/
│  ├─ migrations/            6 migrations (uma por fase)
│  ├─ seed/demo.sql          dados de demonstração
│  └─ tests/                 stub do Supabase para os testes
├─ scripts/test-db.mjs
└─ docs/ARQUITETURA.md
```

## Rotas

| Rota | Acesso |
|---|---|
| `/`, `/partidas`, `/palpites`, `/palpites/:id`, `/ranking` | público (palpitar exige login) |
| `/entrar`, `/cadastro`, `/recuperar-senha`, `/redefinir-senha` | autenticação |
| `/carteira`, `/historico`, `/perfil` | logado |
| `/admin`, `/admin/eventos`, `/admin/resultados`, `/admin/partidas`, `/admin/campeonatos`, `/admin/participantes` | administrador |

## Mascote

`public/assets/mascote-provisorio.svg` é um espaço reservado. Substitua pela arte oficial do pato da ORG ON Camps (mesmo nome de arquivo, ou ajuste `src/components/Mascot.jsx`).
