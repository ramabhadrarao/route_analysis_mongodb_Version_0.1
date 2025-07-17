// File: models/AccidentProneArea.js
// Purpose: FIXED AccidentProneArea model with enum compatibility for moderate severity
// ✅ UPDATED: Added 'moderate' to severity enum and enhanced validation

const mongoose = require('mongoose');

const accidentProneAreaSchema = new mongoose.Schema({
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
  
  // Accident Statistics
  accidentFrequencyYearly: {
    type: Number,
    min: 0
  },
  
  // ✅ FIXED: Updated enum to include 'moderate' with custom error message
  accidentSeverity: {
    type: String,
    enum: {
      values: ['minor', 'moderate', 'major', 'fatal'],
      message: 'Accident severity must be one of: minor, moderate, major, fatal. Received: {VALUE}'
    },
    required: true
  },
  
  // Accident Analysis
  commonAccidentTypes: [{
    type: String
  }],
  contributingFactors: [{
    type: String
  }],
  
  // Enhanced Risk Analysis
  timeOfDayRisk: {
    night: { type: Number, min: 1, max: 10, default: 5 },
    day: { type: Number, min: 1, max: 10, default: 3 },
    peak: { type: Number, min: 1, max: 10, default: 4 }
  },
  weatherRelatedRisk: {
    type: Number,
    min: 1,
    max: 10,
    default: 5
  },
  infrastructureRisk: {
    type: Number,
    min: 1,
    max: 10,
    default: 5
  },
  trafficVolumeRisk: {
    type: Number,
    min: 1,
    max: 10,
    default: 5
  },
  
  // Overall Risk
  riskScore: {
    type: Number,
    min: 1,
    max: 10,
    required: true
  },
  
  // Historical Data
  lastAccidentDate: Date,
  accidentTrend: {
    type: String,
    enum: ['increasing', 'stable', 'decreasing'],
    default: 'stable'
  },
  
  // Safety Measures
  safetyMeasuresPresent: [String],
  recommendedImprovements: [String],
  
  // Data Source
  dataSource: {
    type: String,
    required: true
  },
  dataQuality: {
    type: String,
    enum: ['high', 'medium', 'low'],
    default: 'medium'
  }
}, {
  timestamps: true
});

// Indexes for efficient querying
accidentProneAreaSchema.index({ routeId: 1 });
accidentProneAreaSchema.index({ latitude: 1, longitude: 1 });
accidentProneAreaSchema.index({ riskScore: -1 });
accidentProneAreaSchema.index({ distanceFromStartKm: 1 });
accidentProneAreaSchema.index({ accidentSeverity: 1 });

// ✅ ENHANCED: Virtual for risk category based on updated severity levels
accidentProneAreaSchema.virtual('riskCategory').get(function() {
  if (this.riskScore >= 8) return 'critical';
  if (this.riskScore >= 6) return 'high';
  if (this.riskScore >= 4) return 'medium';
  return 'low';
});

// ✅ NEW: Virtual for severity-based risk multiplier
accidentProneAreaSchema.virtual('severityRiskMultiplier').get(function() {
  const multipliers = {
    'fatal': 4.0,
    'major': 3.0,
    'moderate': 2.0,
    'minor': 1.0
  };
  return multipliers[this.accidentSeverity] || 1.5;
});

// ✅ ENHANCED: Method to get safety recommendations with severity-specific advice
accidentProneAreaSchema.methods.getSafetyRecommendations = function() {
  const recommendations = [];
  
  // Severity-specific recommendations
  switch (this.accidentSeverity) {
    case 'fatal':
      recommendations.push('CRITICAL: Extreme caution required - fatal accidents have occurred');
      recommendations.push('Consider alternative route if possible');
      recommendations.push('Mandatory convoy travel with emergency communication');
      recommendations.push('Speed limit: Maximum 30 km/h');
      break;
      
    case 'major':
      recommendations.push('HIGH RISK: Major accidents reported in this area');
      recommendations.push('Reduce speed to 40 km/h and maintain extra vigilance');
      recommendations.push('Convoy travel recommended');
      break;
      
    case 'moderate':
      recommendations.push('MODERATE RISK: Exercise increased caution');
      recommendations.push('Reduce speed to 50 km/h in this area');
      recommendations.push('Maintain safe following distance');
      break;
      
    case 'minor':
      recommendations.push('Standard caution advised');
      recommendations.push('Follow normal safety protocols');
      break;
  }
  
  // Risk score based recommendations
  if (this.riskScore >= 8) {
    recommendations.push('Exercise extreme caution in this area');
    recommendations.push('Consider alternative route if possible');
    recommendations.push('Reduce speed significantly');
  }
  
  // Time-based recommendations
  if (this.timeOfDayRisk.night > 7) {
    recommendations.push('Avoid night travel through this area if possible');
  }
  
  if (this.weatherRelatedRisk > 6) {
    recommendations.push('Postpone travel during adverse weather conditions');
  }
  
  // Infrastructure recommendations
  if (this.infrastructureRisk > 6) {
    recommendations.push('Check road conditions before travel');
    recommendations.push('Carry emergency repair kit');
  }
  
  // Traffic recommendations
  if (this.trafficVolumeRisk > 6) {
    recommendations.push('Avoid peak traffic hours if possible');
    recommendations.push('Plan for potential delays');
  }
  
  // Contributing factor recommendations
  if (this.contributingFactors.includes('poor_visibility')) {
    recommendations.push('Use headlights and reduce speed during low visibility');
  }
  
  if (this.contributingFactors.includes('overtaking')) {
    recommendations.push('Avoid overtaking in this zone');
  }
  
  return recommendations;
};

// ✅ NEW: Static method to validate severity value
accidentProneAreaSchema.statics.isValidSeverity = function(severity) {
  const validSeverities = ['minor', 'moderate', 'major', 'fatal'];
  return validSeverities.includes(severity);
};

// ✅ NEW: Static method to get standardized severity mapping
accidentProneAreaSchema.statics.getStandardizedSeverity = function(inputSeverity) {
  const severityMap = {
    // Minor severity mappings
    'minor': 'minor',
    'low': 'minor',
    'light': 'minor',
    'slight': 'minor',
    'small': 'minor',
    
    // Moderate severity mappings
    'moderate': 'moderate',
    'medium': 'moderate',
    'fair': 'moderate',
    'average': 'moderate',
    'standard': 'moderate',
    
    // Major severity mappings
    'major': 'major',
    'high': 'major',
    'serious': 'major',
    'severe': 'major',
    'significant': 'major',
    'heavy': 'major',
    
    // Fatal severity mappings
    'fatal': 'fatal',
    'critical': 'fatal',
    'extreme': 'fatal',
    'deadly': 'fatal',
    'catastrophic': 'fatal',
    'maximum': 'fatal'
  };
  
  const inputLower = (inputSeverity || '').toString().toLowerCase().trim();
  return severityMap[inputLower] || 'moderate'; // Default to moderate for unknown values
};

// ✅ NEW: Static method to get severity risk score
accidentProneAreaSchema.statics.getSeverityRiskScore = function(severity) {
  const severityScores = {
    'minor': 2,
    'moderate': 4,
    'major': 7,
    'fatal': 10
  };
  return severityScores[severity] || 4;
};

// ✅ ENHANCED: Static method for accident hotspot analysis with severity breakdown
accidentProneAreaSchema.statics.getHotspotAnalysis = function(routeId) {
  return this.aggregate([
    { $match: { routeId: new mongoose.Types.ObjectId(routeId) }},
    {
      $group: {
        _id: null,
        totalHotspots: { $sum: 1 },
        avgRiskScore: { $avg: '$riskScore' },
        criticalAreas: {
          $sum: {
            $cond: [{ $gte: ['$riskScore', 8] }, 1, 0]
          }
        },
        highRiskAreas: {
          $sum: {
            $cond: [{ $and: [{ $gte: ['$riskScore', 6] }, { $lt: ['$riskScore', 8] }] }, 1, 0]
          }
        },
        mostCommonFactors: { $addToSet: '$contributingFactors' },
        
        // ✅ ENHANCED: Severity distribution with all 4 levels
        severityDistribution: {
          fatal: {
            $sum: {
              $cond: [{ $eq: ['$accidentSeverity', 'fatal'] }, 1, 0]
            }
          },
          major: {
            $sum: {
              $cond: [{ $eq: ['$accidentSeverity', 'major'] }, 1, 0]
            }
          },
          moderate: {
            $sum: {
              $cond: [{ $eq: ['$accidentSeverity', 'moderate'] }, 1, 0]
            }
          },
          minor: {
            $sum: {
              $cond: [{ $eq: ['$accidentSeverity', 'minor'] }, 1, 0]
            }
          }
        },
        
        // Risk analysis by severity
        avgRiskBySeverity: {
          fatal: {
            $avg: {
              $cond: [
                { $eq: ['$accidentSeverity', 'fatal'] },
                '$riskScore',
                null
              ]
            }
          },
          major: {
            $avg: {
              $cond: [
                { $eq: ['$accidentSeverity', 'major'] },
                '$riskScore',
                null
              ]
            }
          },
          moderate: {
            $avg: {
              $cond: [
                { $eq: ['$accidentSeverity', 'moderate'] },
                '$riskScore',
                null
              ]
            }
          },
          minor: {
            $avg: {
              $cond: [
                { $eq: ['$accidentSeverity', 'minor'] },
                '$riskScore',
                null
              ]
            }
          }
        }
      }
    }
  ]);
};

// ✅ NEW: Static method to get severity-based recommendations
accidentProneAreaSchema.statics.getSeverityRecommendations = function(severityStats) {
  const recommendations = [];
  
  if (severityStats.fatal > 0) {
    recommendations.push({
      priority: 'CRITICAL',
      category: 'route_planning',
      message: `${severityStats.fatal} fatal accident areas detected`,
      action: 'Consider alternative route - this route has fatal accident history'
    });
  }
  
  if (severityStats.major > 2) {
    recommendations.push({
      priority: 'HIGH',
      category: 'safety_measures',
      message: `${severityStats.major} major accident areas identified`,
      action: 'Implement enhanced safety protocols and convoy travel'
    });
  }
  
  if (severityStats.moderate > 5) {
    recommendations.push({
      priority: 'MEDIUM',
      category: 'caution',
      message: `${severityStats.moderate} moderate risk areas along route`,
      action: 'Exercise increased caution and reduce speed in identified areas'
    });
  }
  
  if (severityStats.minor > 10) {
    recommendations.push({
      priority: 'LOW',
      category: 'awareness',
      message: `${severityStats.minor} minor incident areas noted`,
      action: 'Maintain standard safety protocols with heightened awareness'
    });
  }
  
  return recommendations;
};

// ✅ NEW: Pre-save middleware to validate and standardize severity
accidentProneAreaSchema.pre('save', function(next) {
  try {
    // Standardize severity if needed
    if (this.accidentSeverity) {
      const standardized = this.constructor.getStandardizedSeverity(this.accidentSeverity);
      if (standardized !== this.accidentSeverity) {
        console.log(`Standardizing severity: ${this.accidentSeverity} -> ${standardized}`);
        this.accidentSeverity = standardized;
      }
    }
    
    // Ensure risk score aligns with severity
    if (this.accidentSeverity && !this.riskScore) {
      this.riskScore = this.constructor.getSeverityRiskScore(this.accidentSeverity);
    }
    
    next();
  } catch (error) {
    next(error);
  }
});

// ✅ NEW: Post-save middleware for logging
accidentProneAreaSchema.post('save', function(doc) {
  console.log(`✅ AccidentProneArea saved: ${doc.accidentSeverity} severity, risk score ${doc.riskScore}`);
});

// ✅ NEW: Error handling middleware for validation errors
accidentProneAreaSchema.post('save', function(error, doc, next) {
  if (error.name === 'ValidationError' && error.errors?.accidentSeverity) {
    console.error('❌ AccidentProneArea severity validation failed:', {
      attemptedValue: error.errors.accidentSeverity.value,
      validValues: ['minor', 'moderate', 'major', 'fatal'],
      errorMessage: error.errors.accidentSeverity.message
    });
    
    // Create a more user-friendly error
    const friendlyError = new Error(
      `Invalid accident severity '${error.errors.accidentSeverity.value}'. ` +
      `Must be one of: minor, moderate, major, fatal`
    );
    friendlyError.name = 'AccidentSeverityValidationError';
    return next(friendlyError);
  }
  next(error);
});

// ✅ ENHANCED: Transform JSON output with severity info
accidentProneAreaSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    delete ret.__v;
    
    // Add severity metadata
    ret.severityInfo = {
      level: ret.accidentSeverity,
      riskMultiplier: doc.severityRiskMultiplier,
      isHighSeverity: ['major', 'fatal'].includes(ret.accidentSeverity),
      recommendations: doc.getSafetyRecommendations().slice(0, 3) // Top 3 recommendations
    };
    
    return ret;
  }
});

// ✅ NEW: Instance method to check if area requires immediate attention
accidentProneAreaSchema.methods.requiresImmediateAttention = function() {
  return this.accidentSeverity === 'fatal' || 
         (this.accidentSeverity === 'major' && this.riskScore >= 8) ||
         (this.riskScore >= 9);
};

// ✅ NEW: Instance method to get severity color code for UI
accidentProneAreaSchema.methods.getSeverityColor = function() {
  const colorMap = {
    'minor': '#28a745',    // Green
    'moderate': '#ffc107', // Yellow
    'major': '#fd7e14',    // Orange
    'fatal': '#dc3545'     // Red
  };
  return colorMap[this.accidentSeverity] || '#6c757d'; // Gray for unknown
};

// ✅ NEW: Instance method to get severity icon
accidentProneAreaSchema.methods.getSeverityIcon = function() {
  const iconMap = {
    'minor': '⚠️',
    'moderate': '🔶',
    'major': '🔺',
    'fatal': '🚨'
  };
  return iconMap[this.accidentSeverity] || '❓';
};

module.exports = mongoose.model('AccidentProneArea', accidentProneAreaSchema);