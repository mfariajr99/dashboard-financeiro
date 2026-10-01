/** Política mínima de senha (mesma regra no servidor e no ambiente de teste). */
export function validateNewPassword(pwd: string, username: string): string | null {
  if (pwd.length < 8) return 'A nova senha precisa ter pelo menos 8 caracteres.';
  if (pwd.length > 128) return 'A nova senha é muito longa.';
  if (!/[A-Za-z]/.test(pwd) || !/\d/.test(pwd)) return 'Use letras e números na nova senha.';
  if (pwd.toLowerCase().includes(username.toLowerCase())) return 'A senha não pode conter o nome de usuário.';
  return null;
}
