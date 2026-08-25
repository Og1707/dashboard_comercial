'use strict';

const authService = require('../services/auth.service');
const logger = require('../utils/logger');

/**
 * Controller para manejar la petición de login.
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.validated_body || req.body;
    const result = await authService.login(email, password);

    logger.info({ email: result.user.email, rol: result.user.rol }, 'Usuario autenticado exitosamente');

    return res.status(200).json({
      status: 'success',
      data: result,
    });
  } catch (err) {
    if (err.statusCode === 401) {
      return res.status(401).json({
        error: 'Credenciales inválidas',
      });
    }
    next(err);
  }
};

module.exports = {
  login,
};
