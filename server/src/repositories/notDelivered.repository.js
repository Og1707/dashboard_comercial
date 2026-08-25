'use strict';

const db = require('../config/db');

const SCHEMA = 'comercial_marketing';

/**
 * Listado paginado de contactos con mensajes no entregados filtrados por tenant.
 * @param {string} from
 * @param {string} to
 * @param {Object} queryOptions
 * @param {Object} user
 */
const getNotDelivered = async (from, to, { country, reason, limit = 50, offset = 0 }, user) => {
  const params = [from, to, user.is_admin, user.subcuentas];
  const filters = [];

  if (country) {
    params.push(country);
    filters.push(`dp.nombre_pais = $${params.length}`);
  }
  if (reason) {
    params.push(`%${reason}%`);
    filters.push(`e.descripcion_error ILIKE $${params.length}`);
  }

  const whereExtra = filters.length ? 'AND ' + filters.join(' AND ') : '';

  const baseFromWhere = `
    FROM ${SCHEMA}.fact_mensajes_ghl m
    INNER JOIN ${SCHEMA}.fact_ordenes_entregadas foe ON foe.id_orden = m.id_orden
    INNER JOIN ${SCHEMA}.dim_contactos c    ON m.id_contacto  = c.id_contacto
    INNER JOIN ${SCHEMA}.dim_tipo_envio dte ON m.id_tipo_envio = dte.id_tipo_envio
    INNER JOIN ${SCHEMA}.paises dp          ON m.id_pais       = dp.id_pais
    LEFT  JOIN ${SCHEMA}.fact_registro_errores e
      ON e.id_contacto   = m.id_contacto
      AND e.id_tipo_envio = m.id_tipo_envio
      AND e.fecha_error::date = m.fecha_envio::date
    WHERE m.entregado = FALSE
      AND m.fecha_envio >= $1::date
      AND m.fecha_envio < ($2::date + INTERVAL '1 day')
      AND (
        ($3::boolean = true)
        OR (
          foe.id_subcuenta = ANY($4::int[])
        )
      )
      ${whereExtra}
  `;

  const countSql = `SELECT COUNT(DISTINCT m.id_mensaje) AS total ${baseFromWhere}`;

  const dataParams = [...params, limit, offset];
  const limitPH  = `$${dataParams.length - 1}`;
  const offsetPH = `$${dataParams.length}`;

  const dataSql = `
    SELECT
      c.telefono,
      c.ghl_id                                AS contact_id,
      dp.nombre_pais                          AS country,
      dp.codigo_iso2                          AS code,
      dte.nombre_tipo_envio                   AS process,
      COALESCE(m.plantilla, '—')                AS template,
      COALESCE(m.workflow_id, '—')            AS workflow_id,
      COALESCE(e.descripcion_error, 'Desconocido')       AS reason,
      m.fecha_envio                           AS date
    ${baseFromWhere}
    ORDER BY m.fecha_envio DESC
    LIMIT ${limitPH} OFFSET ${offsetPH}
  `;

  const [countResult, dataResult] = await Promise.all([
    db.query(countSql, params),
    db.query(dataSql, dataParams),
  ]);

  return {
    total: parseInt(countResult.rows[0]?.total || 0, 10),
    rows: dataResult.rows,
  };
};

/**
 * Lista de motivos de error únicos para el filtro desplegable.
 * @param {Object} user
 */
const getFailureReasons = async (user) => {
  const sql = `
    SELECT DISTINCT e.descripcion_error AS reason
    FROM ${SCHEMA}.fact_registro_errores e
    INNER JOIN ${SCHEMA}.fact_mensajes_ghl m ON e.id_contacto = m.id_contacto AND e.id_tipo_envio = m.id_tipo_envio AND e.fecha_error::date = m.fecha_envio::date
    INNER JOIN ${SCHEMA}.fact_ordenes_entregadas foe ON foe.id_orden = m.id_orden
    WHERE e.descripcion_error IS NOT NULL
      AND TRIM(e.descripcion_error) <> ''
      AND (
        ($1::boolean = true)
        OR (
          foe.id_subcuenta = ANY($2::int[])
        )
      )
    ORDER BY reason ASC
  `;
  const { rows } = await db.query(sql, [user.is_admin, user.subcuentas]);
  return rows.map((r) => r.reason);
};

/**
 * Todos los contactos no entregados para exportación CSV (sin paginación).
 * @param {string} from
 * @param {string} to
 * @param {Object} filters
 * @param {Object} user
 */
const getNotDeliveredForExport = async (from, to, { country, reason } = {}, user) => {
  const params = [from, to, user.is_admin, user.subcuentas];
  const filters = [];

  if (country) {
    params.push(country);
    filters.push(`dp.nombre_pais = $${params.length}`);
  }
  if (reason) {
    params.push(`%${reason}%`);
    filters.push(`e.descripcion_error ILIKE $${params.length}`);
  }

  const whereExtra = filters.length ? 'AND ' + filters.join(' AND ') : '';

  const sql = `
    SELECT
      c.telefono,
      c.ghl_id                                          AS contact_id,
      dp.nombre_pais                                    AS country,
      dp.codigo_iso2                                    AS code,
      dte.nombre_tipo_envio                             AS process,
      COALESCE(m.plantilla, '—')                        AS template,
      COALESCE(m.workflow_id, '—')                      AS workflow_id,
      COALESCE(e.descripcion_error, 'Desconocido')      AS reason,
      m.fecha_envio                                     AS date
    FROM ${SCHEMA}.fact_mensajes_ghl m
    INNER JOIN ${SCHEMA}.fact_ordenes_entregadas foe ON foe.id_orden = m.id_orden
    INNER JOIN ${SCHEMA}.dim_contactos c    ON m.id_contacto  = c.id_contacto
    INNER JOIN ${SCHEMA}.dim_tipo_envio dte ON m.id_tipo_envio = dte.id_tipo_envio
    INNER JOIN ${SCHEMA}.paises dp          ON m.id_pais       = dp.id_pais
    LEFT  JOIN ${SCHEMA}.fact_registro_errores e
      ON e.id_contacto    = m.id_contacto
      AND e.id_tipo_envio = m.id_tipo_envio
      AND e.fecha_error::date = m.fecha_envio::date
    WHERE m.entregado = FALSE
      AND m.fecha_envio >= $1::date
      AND m.fecha_envio < ($2::date + INTERVAL '1 day')
      AND (
        ($3::boolean = true)
        OR (
          foe.id_subcuenta = ANY($4::int[])
        )
      )
      ${whereExtra}
    ORDER BY m.fecha_envio DESC
  `;

  const { rows } = await db.query(sql, params);
  return rows;
};

module.exports = { getNotDelivered, getFailureReasons, getNotDeliveredForExport };
