const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

// Load environment variables from backend/.env and current environment
dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config();

const { Staff, Admin } = require('../models');

/**
 * Seed script to create initial administrator account.
 * Safe to execute multiple times (idempotent, never overwrites).
 * Never logs passwords or password hashes.
 */
const seedAdmin = async () => {
  const mongoUri = process.env.MONGO_URI;
  const adminUsername = process.env.ADMIN_USERNAME;
  const adminPassword = process.env.ADMIN_PASSWORD;
  const adminName = process.env.ADMIN_NAME || 'System Administrator';

  // 1. Fail safely if required environment variables are missing
  if (!mongoUri) {
    console.error('[seedAdmin] Error: MONGO_URI environment variable is required.');
    process.exit(1);
  }

  if (!adminUsername || typeof adminUsername !== 'string' || adminUsername.trim() === '') {
    console.error('[seedAdmin] Error: ADMIN_USERNAME environment variable is required.');
    process.exit(1);
  }

  if (!adminPassword || typeof adminPassword !== 'string' || adminPassword === '') {
    console.error('[seedAdmin] Error: ADMIN_PASSWORD environment variable is required.');
    process.exit(1);
  }

  const normalizedUsername = adminUsername.trim().toLowerCase();

  try {
    // 2. Connect to MongoDB
    await mongoose.connect(mongoUri);

    // 3. Check whether an Admin account already exists (by username or role)
    const existingAdmin = await Staff.findOne({
      $or: [
        { username: normalizedUsername },
        { role: { $in: ['ADMIN', 'admin'] } },
      ],
    });

    if (existingAdmin) {
      console.log(`[seedAdmin] Admin account already exists (username: ${existingAdmin.username}). Seed script did not modify existing account.`);
      await mongoose.disconnect();
      process.exit(0);
    }

    // 4. Securely hash password (never store plaintext)
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(adminPassword, saltRounds);

    // 5. Create new Admin document
    const newAdmin = new Admin({
      name: adminName.trim(),
      username: normalizedUsername,
      passwordHash,
      role: 'ADMIN',
      isActive: true,
    });

    await newAdmin.save();

    console.log(`[seedAdmin] Initial admin account successfully created for username: ${normalizedUsername}.`);
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error(`[seedAdmin] Failed to seed admin account: ${error.message}`);
    try {
      await mongoose.disconnect();
    } catch (_) { }
    process.exit(1);
  }
};

// Execute seed if run directly
if (require.main === module) {
  seedAdmin();
}

module.exports = seedAdmin;