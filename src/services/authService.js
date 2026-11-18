import { requireSupabase, unwrap } from './supabase'

export const USERNAME_RE = /^[A-Za-z0-9_.]{3,20}$/
export const PASSWORD_MIN = 8

const origin = () => window.location.origin

/** Traduz erros do Supabase Auth para mensagens claras. */
export function authErrorMessage(error) {
  const code = error?.code
  const msg = error?.message ?? ''
  const map = {
    invalid_credentials: 'E-mail ou senha incorretos.',
    email_not_confirmed: 'Confirme seu e-mail antes de entrar. Procure a mensagem do ON BETS na sua caixa de entrada.',
    user_already_exists: 'Já existe uma conta com este e-mail.',
    email_exists: 'Já existe uma conta com este e-mail.',
    weak_password: `A senha precisa ter pelo menos ${PASSWORD_MIN} caracteres, misturando letras e números.`,
    over_email_send_rate_limit: 'Muitos e-mails enviados em pouco tempo. Aguarde alguns minutos e tente de novo.',
    over_request_rate_limit: 'Muitas tentativas seguidas. Aguarde um pouco e tente de novo.',
    email_address_invalid: 'Este endereço de e-mail não é aceito.',
    same_password: 'A nova senha precisa ser diferente da atual.',
    session_not_found: 'Sua sessão expirou. Entre novamente.',
  }
  if (map[code]) return map[code]
  if (msg.includes('Database error saving new user')) return 'Não foi possível criar o perfil. Tente outro nome de usuário.'
  if (msg.includes('Failed to fetch')) return 'Sem conexão com o servidor. Verifique sua internet.'
  return msg || 'Erro inesperado.'
}

function authUnwrap({ data, error }) {
  if (error) throw new Error(authErrorMessage(error))
  return data
}

export async function isUsernameAvailable(username) {
  if (!USERNAME_RE.test(username)) return false
  const sb = requireSupabase()
  return unwrap(await sb.rpc('is_username_available', { p_username: username }))
}

/**
 * Cria a conta. O perfil é criado no banco pelo trigger handle_new_user,
 * a partir do username enviado em user_metadata.
 * Retorna { needsConfirmation } — true quando o projeto exige confirmar o e-mail.
 */
export async function signUp({ username, email, password }) {
  const sb = requireSupabase()
  const data = authUnwrap(
    await sb.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { username: username.trim() },
        emailRedirectTo: `${origin()}/entrar?confirmado=1`,
      },
    }),
  )
  // Com "Confirm email" ligado o Supabase não abre sessão; e, por segurança,
  // um e-mail já cadastrado devolve um usuário sem identidades.
  if (data.user && data.user.identities?.length === 0) {
    throw new Error('Já existe uma conta com este e-mail.')
  }
  return { needsConfirmation: !data.session }
}

export async function signIn({ email, password }) {
  const sb = requireSupabase()
  return authUnwrap(await sb.auth.signInWithPassword({ email: email.trim(), password }))
}

export async function signOut() {
  const sb = requireSupabase()
  const { error } = await sb.auth.signOut()
  if (error) throw new Error(authErrorMessage(error))
}

/** Envia o e-mail com o link de redefinição de senha. */
export async function requestPasswordReset(email) {
  const sb = requireSupabase()
  authUnwrap(
    await sb.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${origin()}/redefinir-senha`,
    }),
  )
}

/** Define a nova senha (o usuário chega aqui com a sessão de recuperação do link). */
export async function updatePassword(password) {
  const sb = requireSupabase()
  return authUnwrap(await sb.auth.updateUser({ password }))
}

/**
 * Troca a senha de quem está logado. Antes confere a senha atual
 * entrando de novo com ela; só então grava a nova.
 */
export async function changePassword(email, currentPassword, newPassword) {
  const sb = requireSupabase()
  const { error } = await sb.auth.signInWithPassword({ email, password: currentPassword })
  if (error) {
    throw new Error(error.code === 'invalid_credentials' ? 'Senha atual incorreta.' : authErrorMessage(error))
  }
  return authUnwrap(await sb.auth.updateUser({ password: newPassword }))
}

export async function getProfile(userId) {
  const sb = requireSupabase()
  return unwrap(
    await sb
      .from('profiles')
      .select('id, username, full_name, avatar_url, role, created_at')
      .eq('id', userId)
      .maybeSingle(),
  )
}

/** O banco só permite editar username, full_name e avatar_url do próprio perfil. */
export async function updateProfile(userId, { username, full_name }) {
  const sb = requireSupabase()
  const { data, error } = await sb
    .from('profiles')
    .update({ username: username.trim(), full_name: full_name?.trim() || null })
    .eq('id', userId)
    .select('id, username, full_name, avatar_url, role, created_at')
    .single()
  if (error?.code === '23505') throw new Error('Este nome de usuário já está em uso.')
  if (error?.code === '23514') throw new Error('Nome de usuário inválido: use de 3 a 20 letras, números, _ ou .')
  if (error) throw new Error(error.message)
  return data
}
