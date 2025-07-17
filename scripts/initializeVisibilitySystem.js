// File: scripts/initializeVisibilitySystem.js
const mongoose = require('mongoose');
require('dotenv').config();

async function initializeVisibilitySystem() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    // Create indexes for better performance
    const SharpTurn = require('../models/SharpTurn');
    const BlindSpot = require('../models/BlindSpot');
    
    console.log('Creating indexes...');
    
    await SharpTurn.createIndexes();
    await BlindSpot.createIndexes();
    
    console.log('✅ Visibility system initialized successfully');
    console.log('✅ Database indexes created');
    console.log('✅ Ready to analyze routes for sharp turns and blind spots');
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Initialization failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  initializeVisibilitySystem();
}

module.exports = initializeVisibilitySystem;