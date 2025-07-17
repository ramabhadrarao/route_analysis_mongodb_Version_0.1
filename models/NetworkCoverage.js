// File: models/NetworkCoverage.js
// Purpose: Network coverage data storage model

const mongoose = require('mongoose');

const networkCoverageSchema = new mongoose.Schema({
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
  
  // Distance Information
  distanceFromStartKm: {
    type: Number,
    min: 0
  },
  
  // Network Coverage Analysis
  coverageType: {
    type: String,
    enum: ['full_coverage', 'partial_coverage', 'weak_signal', 'dead_zone'],
    required: true
  },
  
  // Signal Strength (1-10 scale)
  signalStrength: {
    type: Number,
    min: 0,
    max: 10,
    required: true
  },
  
  // Operator Coverage
  operatorCoverage: {
    airtel: {
      coverage: { type: Number, min: 0, max: 100, default: 0 },
      signalStrength: { type: Number, min: 0, max: 10, default: 0 },
      technology: { type: String, enum: ['2G', '3G', '4G', '5G', 'No Service'], default: 'No Service' }
    },
    jio: {
      coverage: { type: Number, min: 0, max: 100, default: 0 },
      signalStrength: { type: Number, min: 0, max: 10, default: 0 },
      technology: { type: String, enum: ['2G', '3G', '4G', '5G', 'No Service'], default: 'No Service' }
    },
    vi: {
      coverage: { type: Number, min: 0, max: 100, default: 0 },
      signalStrength: { type: Number, min: 0, max: 10, default: 0 },
      technology: { type: String, enum: ['2G', '3G', '4G', '5G', 'No Service'], default: 'No Service' }
    },
    bsnl: {
      coverage: { type: Number, min: 0, max: 100, default: 0 },
      signalStrength: { type: Number, min: 0, max: 10, default: 0 },
      technology: { type: String, enum: ['2G', '3G', '4G', '5G', 'No Service'], default: 'No Service' }
    }
  },
  
  // Dead Zone Analysis
  isDeadZone: {
    type: Boolean,
    default: false
  },
  deadZoneRadius: {
    type: Number, // Radius in meters
    min: 0
  },
  deadZoneSeverity: {
    type: String,
    enum: ['minor', 'moderate', 'severe', 'critical'],
    default: 'minor'
  },
  deadZoneDuration: {
    type: Number, // Estimated duration to cross in minutes
    min: 0
  },
  
  // Geographic Factors
  terrain: {
    type: String,
    enum: ['urban', 'suburban', 'rural', 'hilly', 'mountainous', 'forest', 'desert'],
    required: true
  },
  elevation: {
    type: Number,
    default: 0
  },
  nearestCellTower: {
    distance: { type: Number, min: 0 }, // km
    operator: String,
    technology: String
  },
  
  // Population Density (affects tower placement)
  populationDensity: {
    type: String,
    enum: ['very_high', 'high', 'medium', 'low', 'very_low'],
    default: 'medium'
  },
  
  // Interference Factors
  interferenceFactors: [{
    type: String,
    enum: ['mountains', 'forests', 'buildings', 'weather', 'electronic_interference', 'distance_from_tower']
  }],
  
  // Risk Assessment
  communicationRisk: {
    type: Number,
    min: 1,
    max: 10,
    required: true
  },
  emergencyRisk: {
    type: Number,
    min: 1,
    max: 10,
    required: true
  },
  
  // Alternative Communication Methods
  alternativeMethods: [{
    type: String,
    enum: ['satellite_phone', 'two_way_radio', 'emergency_beacon', 'landline', 'wifi_hotspot']
  }],
  
  // Recommendations
  recommendations: [String],
  
  // Data Source
  analysisMethod: {
    type: String,
    enum: ['terrain_analysis', 'population_density', 'tower_mapping', 'signal_prediction', 'real_measurement'],
    default: 'terrain_analysis'
  },
  confidence: {
    type: Number,
    min: 0,
    max: 1,
    default: 0.7
  },
  
  // Metadata
  dataSource: {
    type: String,
    default: 'NETWORK_ANALYSIS_SERVICE'
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes
networkCoverageSchema.index({ routeId: 1 });
networkCoverageSchema.index({ latitude: 1, longitude: 1 });
networkCoverageSchema.index({ isDeadZone: 1 });
networkCoverageSchema.index({ communicationRisk: -1 });
networkCoverageSchema.index({ distanceFromStartKm: 1 });

// Virtual for coverage quality
networkCoverageSchema.virtual('coverageQuality').get(function() {
  if (this.signalStrength >= 8) return 'excellent';
  if (this.signalStrength >= 6) return 'good';
  if (this.signalStrength >= 4) return 'fair';
  return 'poor';
});

// Method to get communication recommendations
networkCoverageSchema.methods.getCommunicationRecommendations = function() {
  const recommendations = [];
  
  if (this.isDeadZone) {
    recommendations.push('CRITICAL: No cellular coverage - use satellite communication');
    recommendations.push('Inform control room before entering dead zone');
    
    if (this.deadZoneDuration > 30) {
      recommendations.push('Extended dead zone - consider convoy travel');
    }
  } else if (this.signalStrength < 4) {
    recommendations.push('Weak signal area - test communication frequently');
    recommendations.push('Keep devices fully charged');
  }
  
  if (this.terrain === 'mountainous' || this.terrain === 'hilly') {
    recommendations.push('Mountainous terrain - signal may vary rapidly');
  }
  
  return recommendations;
};

// Static method for route coverage analysis
networkCoverageSchema.statics.getRouteCoverageAnalysis = function(routeId) {
  return this.aggregate([
    { $match: { routeId: new mongoose.Types.ObjectId(routeId) }},
    {
      $group: {
        _id: null,
        totalPoints: { $sum: 1 },
        avgSignalStrength: { $avg: '$signalStrength' },
        deadZones: {
          $sum: { $cond: ['$isDeadZone', 1, 0] }
        },
        weakSignalAreas: {
          $sum: { $cond: [{ $lt: ['$signalStrength', 4] }, 1, 0] }
        },
        avgCommunicationRisk: { $avg: '$communicationRisk' },
        avgEmergencyRisk: { $avg: '$emergencyRisk' },
        terrainBreakdown: {
          $addToSet: '$terrain'
        }
      }
    }
  ]);
};

module.exports = mongoose.model('NetworkCoverage', networkCoverageSchema);