export interface RefreshTokenRow {
  id: string; usuario_id: string; token_hash: string; familia: string; expira_em: string; revogado_em: string | null;
  substituido_por: string | null; criado_em: string; ip: string | null; user_agent: string | null;
}
export interface AccessClaims { sub: string; grp: string; typ: "access" }
export interface LoginResult { accessToken: string; expiresIn: number; refreshToken: string; refreshExpiresAt: string; usuario: { id: string; email: string; usuario: string; grupo: string } }
