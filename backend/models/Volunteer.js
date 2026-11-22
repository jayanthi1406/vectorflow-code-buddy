const mongoose = require('mongoose');
const Staff = require('./Staff');

/**
 * Volunteer Mongoose model
 * Inherits from the Staff base schema via Mongoose discriminator with discriminatorKey: 'role'.
 * Preserves compatibility with ref: 'Staff' across Evaluation, Question, Round, and Transaction models.
 */
const Volunteer =
  Staff.discriminators?.['VOLUNTEER'] ||
  Staff.discriminator(
    'VOLUNTEER',
    new mongoose.Schema({}, { discriminatorKey: 'role' })
  );

module.exports = Volunteer;