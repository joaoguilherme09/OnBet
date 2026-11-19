# ON BETS — Arquitetura e decisões técnicas

## Visão geral

```
 Navegador (React SPA na Vercel)
   │  supabase-js com chave anon + JWT do usuário
   ▼
 Supabase
   ├─ Auth ............ cadastro, login, recuperação de senha
   ├─ PostgREST ....... leitura das tabelas (filtrada por RLS)
   ├─ RPC ............. funções SQL SECURITY DEFINER para toda escrita sensível
   └─ PostgreSQL ...... constraints + triggers garantem as regras mesmo contra bugs
```

Não há servidor próprio nem Edge Functions: as funções PostgreSQL rodam dentro do banco, numa única transação, o que dá atomicidade de graça. A chave `service_role` não é usada em lugar nenhum.

## Camadas de proteção

1. **Privilégios (GRANT):** `anon`/`authenticated` não têm `INSERT/UPDATE/DELETE` em `wallets`, `transactions`, `predictions`, `admin_audit_log`, `app_settings`. Em `profiles`, só as colunas `username`, `full_name`, `avatar_url` são editáveis, então ninguém muda o próprio `role`.
2. **RLS:** cada usuário lê só a própria carteira, transações e palpites; admin lê tudo; rascunhos de eventos só aparecem para admin; catálogo (times, campeonatos, partidas, eventos, opções) é público para leitura e só admin escreve.
3. **Constraints e triggers:** saldo `>= 0`; odd entre 1,01 e 1000; opção do palpite precisa ser do mesmo evento; opção vencedora precisa ser do evento; transações e auditoria imutáveis; dados do palpite (stake, odd, opção) imutáveis; palpite só sai de `pending` uma vez; evento só vira `settled`/`void` pela função de apuração; opções de evento apurado congeladas.
4. **Funções RPC (fases 2–5):** validam regra de negócio, travam a carteira (`SELECT … FOR UPDATE`) e gravam saldo + transação + palpite na mesma transação.

## Modelo de dados

```
auth.users 1─1 profiles 1─1 wallets 1─N transactions
                  │
                  └─1─N predictions N─1 prediction_options N─1 prediction_events
                                                                 │      │
teams N─N competitions (competition_teams)                       │      │
  │            1─N matches ──────────────────────────────────────┘      │
  └──────────────────────────────────────── competitions ───────────────┘
admin_audit_log (quem, quando, o quê, justificativa)
app_settings (linha única: saldo inicial, stake mínimo e máximo)
```

### Ajustes em relação à especificação original

| Mudança | Motivo |
|---|---|
| Tabela `teams` + `competition_teams`; `matches` usa `home_team_id`/`away_team_id` | escudo e nome cadastrados uma vez, reutilizados em todos os campeonatos e opções |
| `prediction_options.team_id` opcional | opções de partida/campeão apontam para o time; marcos históricos usam texto livre (ex.: "Kassio") |
| `prediction_events.rules` (obrigatório em marcos históricos) | regras de empate, desistência e anulação ficam explícitas para o participante |
| `transactions.kind` + `balance_after` + `created_by` | o tipo (crédito inicial, palpite, retorno, reembolso, ajuste) e o saldo após cada movimento tornam o extrato auditável e conferível |
| `predictions.idempotency_key` + `potential_payout` (coluna gerada) | proteção contra clique duplo; retorno calculado pelo banco, nunca pelo frontend |
| `app_settings` | saldo inicial e limites de palpite configuráveis pelo admin |
| `admin_audit_log` | auditoria de ajustes, apurações, anulações e mudanças de configuração |
| Status em inglês no banco (`open`, `settled`…) | padrão técnico; os rótulos em português ficam no frontend |

## Regras de negócio

- **ON Coins são inteiros.** Odds têm 2 casas. Retorno = `floor(stake × odd)`, já incluindo o stake (100 × 2,10 = 210).
- **Saldo inicial** vem de `app_settings.initial_balance` (padrão 1.000) no momento do cadastro.
- **Palpite é definitivo**: depois de confirmado não pode ser cancelado nem alterado (nem antes do fechamento).
- **Vários palpites por evento** são permitidos, cada um entre `min_stake` e `max_stake`.
- **Fechamento automático:** a função de palpite recusa se `now() >= closes_at`, se `now() < opens_at`, se o evento não está `open`, se a opção está inativa ou se a partida vinculada já começou. Não depende de cron.
- **Odd congelada:** `odds_snapshot` é copiada da opção no momento do registro; mudanças posteriores de odd não afetam palpites antigos.
- **Múltiplas:** de 2 a 10 palpites de eventos diferentes num só bilhete (`parlays` + `parlay_legs`, função `place_parlay`). A odd total é o produto das odds (2 casas) e o valor é debitado uma vez. Se **um** palpite errar, a múltipla perde na hora, mesmo com outros jogos pendentes. Se todos acertarem, paga `floor(stake × odd total)`. Evento anulado vale odd 1,00 (sai da conta); se todos forem anulados, o valor é devolvido. `settle_event`/`void_event` resolvem as múltiplas junto com os palpites simples.
- **Apuração única:** a função trava o evento, exige status `open`/`closed`, marca vencedores (`payout = potential_payout`) e perdedores (`payout = 0`), credita retornos e muda o evento para `settled`. Índice único `(kind, reference_id)` impede creditar o mesmo palpite duas vezes.
- **Anulação:** devolve exatamente o stake (`refund`), sem multiplicador; evento vai para `void`.
- **Ajuste administrativo:** crédito ou débito com justificativa obrigatória, registrado em `transactions` e em `admin_audit_log`. Débito nunca deixa saldo negativo.
- **Correção de resultado já apurado:** não existe UPDATE. Se precisar, será uma função específica de "estorno de apuração" auditada (avaliar na Fase 5).

## Funções do banco (RPC)

| Fase | Função | Quem chama | O que faz |
|---|---|---|---|
| 2 | trigger `handle_new_user` | Auth | cria `profiles` a partir do `username` do cadastro; ignora qualquer `role` enviado; nome inválido → usa o e-mail; repetido → acrescenta 5 dígitos |
| 2 | `is_username_available(text)` | todos | checagem no cadastro (sem diferenciar maiúsculas) |
| 3 | trigger `profiles_create_wallet` → `create_wallet_for` | banco | carteira + transação de crédito inicial, na mesma transação do cadastro |
| 3 | `get_wallet_summary()` | logado | saldo, total recebido, usado em palpites, retornos, valor pendente |
| 4 | `place_prediction(option, stake, key)` | logado | trava carteira, valida evento/prazo/partida/opção/limites/saldo, grava palpite com odd congelada, debita e registra transação; mesma chave = mesmo palpite |
| 4 | `get_event_distribution(event)` | todos | quantos palpites cada opção recebeu (sem expor quem) |
| 5 | `settle_event(event, option)` | admin | apuração única: trava o evento, marca won/lost, credita `floor(stake × odd)`, audita |
| 5 | `void_event(event, motivo)` | admin | anula e devolve exatamente o stake, audita |
| 5 | `admin_adjust_wallet(user, ±valor, motivo, key)` | admin | crédito/débito com justificativa, idempotente, nunca negativo, audita |
| 5 | `admin_update_settings(...)` | admin | saldo inicial e limites de palpite, audita antes/depois |
| 5 | `admin_set_role(user, role, motivo)` | admin | promove/rebaixa; impede ficar sem nenhum admin; audita |
| 5 | `admin_dashboard_stats()`, `admin_list_users()`, `admin_event_summary()` | admin | números do painel, busca com e-mail, exposição por opção |
| 5 | triggers `audit_*_change` | banco | auditam mudança de odd/status de opção, status/prazo de evento e placar/horário de partida feitas direto nas tabelas |
| 6 | `get_ranking(limit)`, `get_highlights()` | todos | ranking por saldo (com `rank()`, empates dividem posição) e maiores acertos recentes |
| 6 | `get_my_rank()`, `get_my_stats()` | logado | posição e estatísticas individuais |

Funções internas (`_wallet_move`, `_audit`, `require_admin`, triggers) não podem ser chamadas pela API.

### Concorrência

- `place_prediction` trava a carteira (`FOR UPDATE`) e o evento (`FOR SHARE`); `settle_event`/`void_event` travam o evento (`FOR UPDATE`). Resultado: uma apuração espera os palpites em andamento e nenhum palpite entra depois dela.
- Créditos da apuração percorrem os palpites em ordem fixa de usuário, evitando deadlock entre carteiras.
- Índices únicos garantem que débito, retorno e reembolso de um mesmo palpite (e um mesmo ajuste) existam no máximo uma vez, mesmo que o código tenha um bug.

## Autenticação (Fase 2)

- Login por **e-mail + senha** (Supabase Auth). Login por username exigiria expor e-mails, então não foi feito.
- `AuthContext` guarda sessão e perfil; `RequireAuth` e `RequireAdmin` protegem rotas. Os guards são só para a interface: a permissão real é a RLS.
- `?next=` só aceita caminhos internos (evita redirecionamento aberto).
- Senha: mínimo 8 caracteres com letras e números (validado no front; configure o mesmo mínimo no painel do Supabase).
- Recuperação: `resetPasswordForEmail` → link volta para `/redefinir-senha` com sessão temporária → `updateUser({ password })`.
- Erros do Auth são traduzidos em `authService.authErrorMessage`.

## Frontend (fases 3–7)

- **WalletContext**: saldo compartilhado (barra superior, home, cupom). Atualiza depois de cada palpite e por **Realtime** (tabela `wallets` na publicação `supabase_realtime`), então apuração e ajustes do admin aparecem sem recarregar.
- **BetSlipContext**: cupom global; qualquer odd abre o mesmo cupom. Gera uma `idempotency_key` por abertura do cupom; se a rede cair e o usuário clicar de novo, o banco devolve o mesmo palpite.
- Valores mostrados (retorno previsto, aberto/fechado) são **prévia**: a validação real está no banco.
- O painel admin é carregado sob demanda (`React.lazy`) e as bibliotecas ficam em arquivos separados para cache.
- Erros de constraint do Postgres são traduzidos em `services/supabase.js` (`translateError`).

## Decisões tomadas nas fases 3–7

| Decisão | Motivo |
|---|---|
| Administradores aparecem no ranking | a organização também participa; se preferir, filtre `role = 'admin'` em `get_ranking` |
| Opção que já recebeu palpites não pode ser apagada, só inativada | preserva o histórico; o banco recusa (FK `restrict`) |
| Placar não apura sozinho; a tela de Resultados **sugere** a opção pelo placar | evita apuração errada por placar digitado errado |
| Prazo vencido não muda o status no banco; a interface mostra "Aguardando resultado" | sem cron; `place_prediction` já recusa pelo horário |
| Correção de evento já apurado não existe | regra 'sem alteração retroativa'; se for necessário, criar função de estorno auditada |

## Riscos e pontos de atenção

- **E-mail do Supabase Auth:** o SMTP padrão tem limite baixo de envios por hora e é só para testes. Antes de abrir para o público (Fase 7), configurar SMTP próprio (ex.: Resend).
- **Plano gratuito do Supabase pausa o projeto** após 7 dias sem atividade; reativar pelo painel.
- **Usuário com saldo zero** fica sem jogar. Decisão em aberto: criar um bônus periódico?
- **Fuso horário:** banco em `timestamptz` (UTC); a interface mostra sempre `America/Sao_Paulo`.
- **Escudos:** por enquanto via URL; upload pelo Supabase Storage pode entrar na Fase 5.

## Identidade visual

| Token | Hex | Uso |
|---|---|---|
| `ink` | `#141518` | fundo grafite |
| `surface` / `raised` | `#1C1E22` / `#24272C` | cards / hover e campos |
| `line` | `#2A2D33` | bordas discretas |
| `gold` / `gold-bright` / `gold-deep` | `#D6A93F` / `#F0CF7A` / `#B08427` | ação principal, odds, destaques |
| `text` / `muted` / `faint` | `#F2F0EA` / `#9A9EA6` / `#6B6F78` | textos |
| `silver` / `bronze` | `#C9CDD3` / `#C07A42` | 2º e 3º no ranking |

- **Tipografia:** Chakra Petch (títulos, odds, saldos, números tabulares), Inter (texto).
- **Assinatura:** corte chanfrado (canto cortado, como ingresso/HUD) apenas em odds, escudos sem imagem e botão principal.
- **Movimento:** só o mascote no carregamento e respostas a ações do usuário; respeita `prefers-reduced-motion`.
