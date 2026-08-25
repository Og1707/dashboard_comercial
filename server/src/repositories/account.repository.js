'use strict';

const db = require('../config/db');

const SCHEMA = 'comercial_marketing';

/**
 * Lista todas las subcuentas disponibles filtradas por tenant.
 * @param {Object} user
 */
const getAccounts = async (user) => {
  const sql = `
    SELECT
      s.id_subcuenta,
      s.nombre_subcuenta  AS name,
      s.location_id,
      p.nombre_pais       AS country,
      p.codigo_iso2       AS code
    FROM ${SCHEMA}.dim_subcuentas s
    INNER JOIN ${SCHEMA}.paises p ON s.id_pais = p.id_pais
    WHERE 
      ($1::boolean = true)
      OR (
        s.id_subcuenta = ANY($2::int[])
      )
    ORDER BY p.nombre_pais ASC, s.nombre_subcuenta ASC
  `;
  const { rows } = await db.query(sql, [user.is_admin, user.subcuentas]);
  return rows;
};

/**
 * KPIs + métricas por proceso para una subcuenta específica.
 * @param {string} from
 * @param {string} to
 * @param {string} subcuentaName
 * @param {Object} user
 */
const getAccountKpis = async (from, to, subcuentaName, user) => {
  const sql = `
    SELECT
      dte.nombre_tipo_envio                                                       AS process,
      COUNT(m.id_mensaje)                                                         AS processed,
      COUNT(m.id_mensaje) FILTER (WHERE m.entregado = TRUE)                      AS delivered,
      COUNT(m.id_mensaje) FILTER (WHERE m.entregado = FALSE)                     AS failed,
      CASE
        WHEN COUNT(m.id_mensaje) = 0 THEN 0
        ELSE ROUND(
          COUNT(m.id_mensaje) FILTER (WHERE m.entregado = TRUE)
          * 100.0 / COUNT(m.id_mensaje), 1
        )
      END                                                                         AS rate,
      COALESCE(SUM(
        CASE WHEN m.entregado = TRUE THEN COALESCE(tw.costo_unitario_usd, 0) ELSE 0 END
      ), 0)                                                                       AS cost
    FROM ${SCHEMA}.dim_subcuentas s
    INNER JOIN ${SCHEMA}.dim_subcuenta_procesos sp
      ON sp.id_subcuenta = s.id_subcuenta AND sp.activo = TRUE
    INNER JOIN ${SCHEMA}.dim_tipo_envio dte
      ON dte.id_tipo_envio = sp.id_tipo_envio AND dte.activo = TRUE
    LEFT JOIN ${SCHEMA}.fact_ordenes_entregadas foe 
      ON foe.id_subcuenta = s.id_subcuenta
    LEFT JOIN ${SCHEMA}.fact_mensajes_ghl m 
      ON m.id_orden = foe.id_orden
      AND m.id_tipo_envio = dte.id_tipo_envio
      AND m.fecha_envio >= $1::date
      AND m.fecha_envio < ($2::date + INTERVAL '1 day')
    LEFT JOIN ${SCHEMA}.tarifas_whatsapp tw
      ON m.id_pais = tw.id_pais
      AND dte.categoria_template = tw.categoria_template
      AND tw.activo = TRUE
      AND m.fecha_envio::date BETWEEN tw.fecha_vigencia_desde AND COALESCE(tw.fecha_vigencia_hasta, '9999-12-31')
    WHERE s.nombre_subcuenta = $3
      AND (
        ($4::boolean = true)
        OR (
          s.id_subcuenta = ANY($5::int[])
        )
      )
    GROUP BY dte.id_tipo_envio, dte.nombre_tipo_envio
    ORDER BY rate ASC
  `;
  const { rows } = await db.query(sql, [from, to, subcuentaName, user.is_admin, user.subcuentas]);
  return rows;
};

/**
 * No entregados de hoy para una subcuenta (lista de trabajo operativa).
 * @param {string} subcuentaName
 * @param {Object} pagination
 * @param {Object} user
 */
const getAccountWorkList = async (subcuentaName, { limit = 10, offset = 0 } = {}, user) => {
  const params = [subcuentaName, user.is_admin, user.subcuentas];

  const joins = `
    FROM ${SCHEMA}.dim_subcuentas s
    INNER JOIN ${SCHEMA}.fact_ordenes_entregadas foe 
      ON foe.id_subcuenta = s.id_subcuenta
    INNER JOIN ${SCHEMA}.fact_mensajes_ghl m 
      ON m.id_orden = foe.id_orden
    INNER JOIN ${SCHEMA}.dim_tipo_envio dte 
      ON m.id_tipo_envio = dte.id_tipo_envio AND dte.activo = TRUE
    INNER JOIN ${SCHEMA}.dim_contactos c 
      ON m.id_contacto = c.id_contacto
    LEFT JOIN ${SCHEMA}.fact_registro_errores e
      ON e.id_contacto = m.id_contacto
      AND e.id_tipo_envio = m.id_tipo_envio
      AND e.fecha_error::date = m.fecha_envio::date
  `;

  const where = `
    WHERE s.nombre_subcuenta = $1
      AND (
        ($2::boolean = true)
        OR (
          s.id_subcuenta = ANY($3::int[])
        )
      )
      AND m.entregado = FALSE
      AND m.fecha_envio >= CURRENT_DATE - INTERVAL '30 days'
  `;

  const countSql = `SELECT COUNT(*) AS total ${joins} ${where}`;

  const dataParams = [...params, limit, offset];

  const dataSql = `
    SELECT
      c.telefono,
      c.ghl_id                          AS contact_id,
      dte.nombre_tipo_envio             AS process,
      COALESCE(e.codigo_error, 'ERR_NOT_DELIVERED') AS codigo_error,
      COALESCE(e.descripcion_error, 'Mensaje no entregado') AS reason,
      m.fecha_envio                     AS date
    ${joins}
    ${where}
    ORDER BY m.fecha_envio DESC
    LIMIT $4 OFFSET $5
  `;

  const [countRes, dataRes] = await Promise.all([
    db.query(countSql, params),
    db.query(dataSql, dataParams),
  ]);

  return {
    rows: dataRes.rows,
    total: parseInt(countRes.rows[0]?.total || 0, 10),
  };
};

module.exports = { getAccounts, getAccountKpis, getAccountWorkList };
