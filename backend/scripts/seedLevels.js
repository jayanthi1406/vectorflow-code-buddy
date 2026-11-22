const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

// Load environment variables from backend/.env and current environment
dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config();

const { Level } = require('../models');

// Canonical configuration for the six competition levels
const INITIAL_LEVELS = [
  {
    number: 1,
    name: 'Level 1',
    entryRiskAmount: 0,
    winningPayout: 50,
    losingPayout: 50,
    safeZoneAmount: 50,
    isSafeZone: true,
    isFinal: false,
    durationSeconds: 180,
    isActive: true,
  },
  {
    number: 2,
    name: 'Level 2',
    entryRiskAmount: 50,
    winningPayout: 100,
    losingPayout: 50,
    safeZoneAmount: 0,
    isSafeZone: false,
    isFinal: false,
    durationSeconds: 180,
    isActive: true,
  },
  {
    number: 3,
    name: 'Level 3',
    entryRiskAmount: 100,
    winningPayout: 150,
    losingPayout: 50,
    safeZoneAmount: 0,
    isSafeZone: false,
    isFinal: false,
    durationSeconds: 180,
    isActive: true,
  },
  {
    number: 4,
    name: 'Level 4',
    entryRiskAmount: 150,
    winningPayout: 250,
    losingPayout: 50,
    safeZoneAmount: 250,
    isSafeZone: true,
    isFinal: false,
    durationSeconds: 180,
    isActive: true,
  },
  {
    number: 5,
    name: 'Level 5',
    entryRiskAmount: 0,
    winningPayout: 350,
    losingPayout: 250,
    safeZoneAmount: 0,
    isSafeZone: false,
    isFinal: false,
    durationSeconds: 180,
    isActive: true,
  },
  {
    number: 6,
    name: 'Level 6',
    entryRiskAmount: 100,
    winningPayout: 500,
    losingPayout: 250,
    safeZoneAmount: 0,
    isSafeZone: false,
    isFinal: true,
    durationSeconds: 180,
    isActive: true,
  },
];

/**
 * Seed script to create initial competition Level documents.
 * Safe to execute multiple times (strictly idempotent, never overwrites or resets existing levels).
 */
const seedLevels = async () => {
  const mongoUri = process.env.MONGO_URI;

  if (!mongoUri) {
    console.error('[seedLevels] Error: MONGO_URI environment variable is required.');
    process.exit(1);
  }

  try {
    await mongoose.connect(mongoUri);

    let insertedCount = 0;
    let existingCount = 0;

    for (const levelData of INITIAL_LEVELS) {
      const existing = await Level.findOne({ number: levelData.number });

      if (existing) {
        existingCount++;
        console.log(`[seedLevels] Level ${levelData.number} (${existing.name}) already exists. Skipped without modifying.`);
      } else {
        await Level.create(levelData);
        insertedCount++;
        console.log(`[seedLevels] Level ${levelData.number} (${levelData.name}) successfully inserted.`);
      }
    }

    console.log(`[seedLevels] Seeding summary: ${insertedCount} newly inserted, ${existingCount} already existed (total: ${insertedCount + existingCount}).`);

    await mongoose.disconnect();
    if (require.main === module) {
      process.exit(0);
    }
    return { insertedCount, existingCount };
  } catch (error) {
    console.error(`[seedLevels] Failed to seed level documents: ${error.message}`);
    try {
      await mongoose.disconnect();
    } catch (_) {}
    if (require.main === module) {
      process.exit(1);
    }
    throw error;
  }
};

// Execute seed if run directly
if (require.main === module) {
  seedLevels();
}

module.exports = seedLevels;
