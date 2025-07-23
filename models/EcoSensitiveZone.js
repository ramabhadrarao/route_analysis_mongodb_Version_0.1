// File: models/EcoSensitiveZone.js
const mongoose = require('mongoose');

const ecoSensitiveZoneSchema = new mongoose.Schema({
  routeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Route',
    required: true
  },
  latitude: {
    type: Number,
    required: true,
    min: -90,
    max: 90
  },
  longitude: {
    type: Number,
    required: true,
    min: -180,
    max: 180
  },
  
  // Zone Information
  zoneType: {
    type: String,
    enum: ['wildlife_sanctuary', 'protected_forest', 'eco_sensitive', 'national_park', 'biosphere_reserve'],
    required: true
  },
  name: {
    type: String,
    required: true
  },
  
  // Distance Information
  distanceFromStartKm: {
    type: Number,
    min: 0
  },
  distanceFromRouteKm: {
    type: Number,
    min: 0
  },
  
  // Risk Assessment
  severity: {
    type: String,
    enum: ['critical', 'high', 'medium', 'low'],
    required: true
  },
  riskScore: {
    type: Number,
    min: 1,
    max: 10,
    required: true
  },
  
  // Restrictions & Compliance
  restrictions: [String],
  speedLimit: Number,
  timingRestrictions: String,
  permitRequired: Boolean,
  
  // Environmental Data
  wildlifeTypes: [String],
  migrationPeriod: String,
  criticalHabitat: Boolean,
  
  // Compliance Requirements
  ngtCompliance: [String], // National Green Tribunal
  forestDeptRequirements: [String],
  
  // Data Source
  dataSource: {
    type: String,
    default: 'GOOGLE_PLACES_API'
  },
  confidence: {
    type: Number,
    min: 0,
    max: 1,
    default: 0.8
  }
}, {
  timestamps: true
});

// Indexes
ecoSensitiveZoneSchema.index({ routeId: 1 });
ecoSensitiveZoneSchema.index({ latitude: 1, longitude: 1 });
ecoSensitiveZoneSchema.index({ severity: 1 });

module.exports = mongoose.model('EcoSensitiveZone', ecoSensitiveZoneSchema);