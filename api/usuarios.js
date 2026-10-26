/*
  Função serverless da Vercel: gerenciamento de contas de acesso.

  Por que ela existe: criar contas e trocar senhas exige a chave "service_role"
  do Supabase, que NUNCA pode ficar no navegador. Esta função roda no servidor,
  confere se quem chamou é um administrador ativo e só então executa.

  Variáveis de ambiente (Vercel > Settings > Environment Variables):
    SUPABASE_URL                 URL do projeto
    SUPABASE_SERVICE_ROLE_KEY    chave service_role (secreta)

  Ações (POST, JSON):
    { acao: 'criar', email, nome, perfil, senha }
    { acao: 'senha', id, senha }
*/
import { createClient } from '@supabase/supabase-js';

const PERFIS = ['administrador', 'atendente', 'mecanico'];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const responder = (res, status, corpo) => {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(corpo);
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return responder(res, 405, { erro: 'Método não permitido.' });

  const url = process.env.SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) return responder(res, 500, { erro: 'O servidor ainda não foi configurado com as chaves do Supabase.' });

  const admin = createClient(url, chave, { auth: { autoRefreshToken: false, persistSession: false } });

  // 1. Quem está chamando? (token de login enviado pelo site)
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return responder(res, 401, { erro: 'Faça login para continuar.' });
  const { data: sessao, error: erroSessao } = await admin.auth.getUser(token);
  if (erroSessao || !sessao || !sessao.user) return responder(res, 401, { erro: 'Sessão inválida ou expirada. Entre novamente.' });

  // 2. É um administrador ativo?
  const { data: eu } = await admin.from('usuarios').select('perfil, ativo').eq('id', sessao.user.id).maybeSingle();
  if (!eu || !eu.ativo || eu.perfil !== 'administrador') return responder(res, 403, { erro: 'Somente administradores podem gerenciar usuários.' });

  let corpo = req.body;
  if (typeof corpo === 'string') {
    try { corpo = JSON.parse(corpo); } catch (e) { corpo = {}; }
  }
  corpo = corpo || {};

  // 3. Executa a ação pedida
  if (corpo.acao === 'criar') {
    const email = String(corpo.email || '').trim().toLowerCase();
    const nome = String(corpo.nome || '').trim();
    const senha = String(corpo.senha || '');
    if (!EMAIL.test(email)) return responder(res, 400, { erro: 'Informe um e-mail válido.' });
    if (!nome) return responder(res, 400, { erro: 'Informe o nome do usuário.' });
    if (!PERFIS.includes(corpo.perfil)) return responder(res, 400, { erro: 'Perfil inválido.' });
    if (senha.length < 6) return responder(res, 400, { erro: 'A senha deve ter no mínimo 6 caracteres.' });

    const { data: criado, error } = await admin.auth.admin.createUser({
      email, password: senha, email_confirm: true, user_metadata: { nome }
    });
    if (error || !criado || !criado.user) {
      const jaExiste = error && (error.status === 422 || /already|registered|exists/i.test(error.message || ''));
      return responder(res, jaExiste ? 409 : 400, { erro: jaExiste ? 'Já existe um usuário com este e-mail.' : 'Não foi possível criar o usuário: ' + (error ? error.message : 'erro desconhecido') });
    }

    // O gatilho do banco criou o perfil como "mecânico inativo". Aqui liberamos com o perfil escolhido.
    const { error: erroPerfil } = await admin.from('usuarios')
      .update({ nome, perfil: corpo.perfil, ativo: true }).eq('id', criado.user.id);
    if (erroPerfil) {
      await admin.auth.admin.deleteUser(criado.user.id);
      return responder(res, 500, { erro: 'Não foi possível liberar o acesso do novo usuário. Nada foi criado.' });
    }
    return responder(res, 200, { ok: true, id: criado.user.id });
  }

  if (corpo.acao === 'senha') {
    const senha = String(corpo.senha || '');
    if (!UUID.test(String(corpo.id || ''))) return responder(res, 400, { erro: 'Usuário inválido.' });
    if (senha.length < 6) return responder(res, 400, { erro: 'A senha deve ter no mínimo 6 caracteres.' });
    const { error } = await admin.auth.admin.updateUserById(corpo.id, { password: senha });
    if (error) return responder(res, 400, { erro: 'Não foi possível trocar a senha: ' + error.message });
    return responder(res, 200, { ok: true });
  }

  return responder(res, 400, { erro: 'Ação desconhecida.' });
}
