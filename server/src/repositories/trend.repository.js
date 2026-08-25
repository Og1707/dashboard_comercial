'use strict';

const db = require('../config/db');
const SCHEMA = 'comercial_marketing';

/**
 * Serie temporal de envíos agrupada por día y proceso filtrada por tenant.
 * @param {string} from
 * @param {string} to
 * @param {string|null} country
 * @param {string|null} subcuenta
 * @param {Object} user
 */
const getTrendSeries = async (from, to, country = null, subcuenta = null, user) => {
  const params = [from, to, user.is_admin, user.subcuentas];
  let dynamicJoins = `INNER JOIN ${SCHEMA}.fact_ordenes_entregadas foe ON foe.id_orden = m.id_orden`;
  let filterClause = '';

  if (subcuenta) {
    params.push(subcuenta);
    dynamicJoins += ` INNER JOIN ${SCHEMA}.dim_subcuentas s ON s.id_subcuenta = foe.id_subcuenta`;
    filterClause += ` AND s.nombre_subcuenta = $${params.length}`;
  } else if (country && country !== 'Todos') {
    params.push(country);
    dynamicJoins += ` INNER JOIN ${SCHEMA}.paises dp ON m.id_pais = dp.id_pais`;
    filterClause += ` AND dp.nombre_pais = $${params.length}`;
  }

  const sql = `
    SELECT
      TO_CHAR(m.fecha_envio::date, 'YYYY-MM-DD')         AS fecha_dia,
      COALESCE(dte.nombre_tipo_envio, 'Sin Clasificar') AS proceso,
      COUNT(m.id_mensaje)::integer                       AS total
    FROM ${SCHEMA}.fact_mensajes_ghl m
    INNER JOIN ${SCHEMA}.dim_tipo_envio dte ON m.id_tipo_envio = dte.id_tipo_envio
    ${dynamicJoins}
    WHERE m.fecha_envio >= $1::date
      AND m.fecha_envio < ($2::date + INTERVAL '1 day')
      AND dte.activo = TRUE
      AND (
        ($3::boolean = true)
        OR (
          foe.id_subcuenta = ANY($4::int[])
        )
      )
      ${filterClause}
    GROUP BY m.fecha_envio::date, dte.nombre_tipo_envio
    ORDER BY fecha_dia ASC, proceso ASC
  `;

  const { rows } = await db.query(sql, params);
  return rows;
};

module.exports = { getTrendSeries };