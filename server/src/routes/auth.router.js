'use strict';

const express = require('express');
const { validate } = require('../middlewares/validate.middleware');
const { loginBodySchema } = require('../schemas/auth.schema');
const authController = require('../controllers/auth.controller');

const router = express.Router();

router.post('/login', validate(loginBodySchema, 'body'), authController.login);

module.exports = router;
