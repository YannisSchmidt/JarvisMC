'use strict';
/** Formatage de positions pour le chat et les logs. */
function formatPosition(pos) {
  if (!pos) return 'inconnue';
  return `${Math.floor(pos.x)} ${Math.floor(pos.y)} ${Math.floor(pos.z)}`;
}
module.exports = { formatPosition };
