// =====================================================================
// ON BETS — Login pelo nome de usuário (Supabase Edge Function)
// ---------------------------------------------------------------------
// O Supabase Auth só faz login com e-mail. Esta função recebe
// { username, password }, descobre o e-mail do usuário AQUI no servidor
// (com a chave de serviço) e faz o login. O e-mail nunca vai para o
// navegador: assim ninguém consegue descobrir o e-mail de outro jogador
// a partir do nome de usuário (que é público no ranking).
//
// Resposta de sucesso: { access_token, refresh_token }
// Erro: { error: { code, message } } com o mesmo código para "usuário
// não existe" e "senha errada" (não revela quais usuários existem).
//
// Publicar: supabase functions deploy login-usuario --no-verify-jwt
// (ou no painel: Edge Functions → Deploy a new function → Via Editor,
//  nome "login-usuario", colar este código e DESLIGAR "Verify JWT").
// "Verify JWT" precisa ficar desligado: o projeto usa as chaves novas
// (sb_publishable_...), que não são JWT, e o Supabase recusaria a chamada
// antes de chegar aqui. Não tem problema: é uma tela de login, pública.
// =====================================================================
import { createClient } from 'npm:@supabase/supabase-js@2.45.4'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const USERNAME_RE = /^[A-Za-z0-9_.]{3,20}$/

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

const invalid = () => json({ error: { code: 'invalid_credentials', message: 'Invalid login credentials' } }, 400)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: { code: 'method_not_allowed', message: 'Use POST' } }, 405)

  let username = ''
  let password = ''
  try {
    const body = await req.json()
    username = String(body?.username ?? '').trim().replace(/^@/, '')
    password = String(body?.password ?? '')
  } catch {
    return json({ error: { code: 'bad_request', message: 'Corpo inválido' } }, 400)
  }
  if (!USERNAME_RE.test(username) || !password) return invalid()

  const url = Deno.env.get('SUPABASE_URL')!
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // nome de usuário não diferencia maiúsculas (igual ao índice único do banco).
  // "_" é coringa no ilike: escapa para comparar o texto exato.
  const pattern = username.replace(/[\\%_]/g, '\\$&')
  const { data: profile } = await admin.from('profiles').select('id').ilike('username', pattern).maybeSingle()
  if (!profile) return invalid()

  const { data: found, error: userError } = await admin.auth.admin.getUserById(profile.id)
  const email = found?.user?.email
  if (userError || !email) return invalid()

  // login de verdade, num cliente separado e descartável (a senha é conferida
  // pelo Supabase Auth, com as mesmas regras do login por e-mail)
  const auth = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await auth.auth.signInWithPassword({ email, password })
  if (error || !data.session) {
    return json({ error: { code: error?.code ?? 'invalid_credentials', message: error?.message ?? 'Invalid login credentials' } }, 400)
  }
  return json({ access_token: data.session.access_token, refresh_token: data.session.refresh_token })
})
