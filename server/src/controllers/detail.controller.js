'use strict';

const detailService = require('../services/detail.service');

const getDetail = async (req, res, next) => {
  try {
    const { from, to, country, process, search, limit, offset } = req.validated_query;
    const data = await detailService.getDetail(from, to, { country, process, search, limit, offset }, req.user);
    res.json(data);
  } catch (err) {
    next(err);
  }
};

module.exports = { getDetail };
