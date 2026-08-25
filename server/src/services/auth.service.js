'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const authRepository = require('../repositories/auth.repository');

/**
 * Autentica un usuario y genera un JWT.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{ token: string, user: Object }>}
 */
const login = async (email, password) => {
  const client = await authRepository.findClientByEmail(email);

  if (!client) {
    const error = new Error('Credenciales inválidas');
    error.statusCode = 401;
    throw error;
  }

  const isPasswordValid = await bcrypt.compare(password, client.password_hash);
  if (!isPasswordValid) {
    const error = new Error('Credenciales inválidas');
    error.statusCode = 401;
    throw error;
  }

  const subcuentas = await authRepository.findSubaccountIdsByClientId(client.id_cliente);

  const payload = {
    id: client.id_cliente,
    email: client.email,
    rol: client.rol,
    subcuentas: subcuentas,
  };

  const token = jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN || '8h',
  });

  return {
    token,
    user: {
      id: client.id_cliente,
      nombre: client.nombre_cliente,
      email: client.email,
      rol: client.rol,
      subcuentas,
    },
  };
};

module.exports = {
  login,
};
