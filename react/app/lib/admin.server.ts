/**
 * Administrateurs de shOsu! : identifiants osu! listés dans la variable d'environnement `ADMIN_USER_IDS` (séparés par des virgules).
 * Ils ont accès au tableau de bord des quotas (`/admin`) et voient l'alerte quand un quota approche de sa limite.
 * Sans variable, personne n'est administrateur (l'accès par défaut est fermé).
 */
export function isAdminId(osuId: number | null | undefined): boolean {
  if (!osuId) return false;
  return (process.env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((value) => Number(value.trim()))
    .some((id) => Number.isInteger(id) && id > 0 && id === osuId);
}
