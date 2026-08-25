'use strict';

const { query } = require('../config/db');

/**
 * Busca un cliente activo por su email.
 * @param {string} email
 * @returns {Promise<Object|null>}
 */
const findClientByEmail = async (email) => {
  const sql = `
    SELECT id_cliente, nombre_cliente, email, password_hash, rol, activo
    FROM comercial_marketing.clientes
    WHERE LOWER(email) = LOWER($1) AND activo = true
  `;
  const result = await query(sql, [email]);
  return result.rows[0] || null;
};

/**
 * Obtiene el arreglo de IDs de subcuentas asociadas a un cliente.
 * @param {number} clientId
 * @returns {Promise<number[]>}
 */
const findSubaccountIdsByClientId = async (clientId) => {
  const sql = `
    SELECT id_subcuenta
    FROM comercial_marketing.cliente_subcuentas
    WHERE id_cliente = $1
  `;
  const result = await query(sql, [clientId]);
  return result.rows.map((row) => row.id_subcuenta);
};

module.exports = {
  findClientByEmail,
  findSubaccountIdsByClientId,
};
