'use strict';

const { z } = require('zod');

const loginBodySchema = z.object({
  email: z.string().email('Formato de email inválido'),
  password: z.string().min(1, 'La contraseña es requerida'),
});

module.exports = {
  loginBodySchema,
};
