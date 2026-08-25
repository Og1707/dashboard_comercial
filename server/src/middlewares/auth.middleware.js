'use strict';

const jwt = require('jsonwebtoken');
const env = require('../config/env');
const logger = require('../utils/logger');

/**
 * Middleware para autenticar peticiones mediante JWT.
 * Inyecta exclusivamente los datos validados del token en req.user.
 */
const authenticateJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Acceso no autorizado: Token ausente o formato inválido',
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);

    // Inyección estricta proveniente del token firmado por el servidor (no del request client)
    req.user = {
      id: decoded.id,
      email: decoded.email,
      rol: decoded.rol,
      subcuentas: Array.isArray(decoded.subcuentas) ? decoded.subcuentas : [],
      is_admin: decoded.rol === 'admin',
    };

    next();
  } catch (err) {
    logger.warn({ err: err.message }, 'Fallo en verificación de JWT');
    return res.status(401).json({
      error: 'Sesión expirada o token inválido',
    });
  }
};

module.exports = {
  authenticateJWT,
};
