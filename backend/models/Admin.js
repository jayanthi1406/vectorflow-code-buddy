const mongoose = require('mongoose');
const Staff = require('./Staff');

/**
 * Admin Mongoose model
 * Inherits from the Staff base schema via Mongoose discriminator with discriminatorKey: 'role'.
 * Preserves compatibility with ref: 'Staff' across Evaluation, Question, Round, and Transaction models.
 */
const Admin =
  Staff.discriminators?.['ADMIN'] ||
  Staff.discriminator(
    'ADMIN',
    new mongoose.Schema({}, { discriminatorKey: 'role' })
  );

module.exports = Admin;