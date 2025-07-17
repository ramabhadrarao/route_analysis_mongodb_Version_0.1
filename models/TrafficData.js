// File: models/TrafficData.js
// Purpose: Store traffic density and flow data
// File: models/TrafficData.js - Enhanced Version
// Purpose: Enhanced traffic data model with comprehensive fields

const mongoose = require('mongoose');

const trafficDataSchema = new mongoose.Schema({
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
  
  // Traffic Flow Data
  peakHourTrafficCount: {
    type: Number,
    min: 0
  },
  averageSpeedKmph: {
    type: Number,
    min: 0
  },
  congestionLevel: {
    type: String,
    enum: ['free_flow', 'light', 'moderate', 'heavy', 'severe'],
    required: true
  },
  
  // Road Infrastructure
  speedLimit: {
    type: Number,
    min: 0
  },
  roadType: {
    type: String,
    enum: ['highway', 'arterial', 'collector', 'local']
  },
  trafficLights: {
    type: Number,
    min: 0,
    default: 0
  },
  tollPoints: {
    type: Number,
    min: 0,
    default: 0
  },
  constructionZones: {
    type: Number,
    min: 0,
    default: 0
  },
  
  // Traffic Issues
  bottleneckCauses: [{
    type: String
  }],
  alternativeRoutesAvailable: {
    type: Boolean,
    default: false
  },
  
  // Risk Assessment
  riskScore: {
    type: Number,
    min: 1,
    max: 10,
    required: true
  },
  
  // Timing Information
  measurementTime: {
    type: Date,
    default: Date.now
  },
  timeOfDay: {
    type: String,
    enum: ['morning_peak', 'afternoon', 'evening_peak', 'night', 'weekend'],
    default: function() {
      const hour = new Date().getHours();
      if (hour >= 7 && hour <= 10) return 'morning_peak';
      if (hour >= 17 && hour <= 20) return 'evening_peak';
      if (hour >= 21 || hour <= 6) return 'night';
      return 'afternoon';
    }
  },
  
  // Additional Metrics
  accidentReports: {
    type: Number,
    min: 0,
    default: 0
  },
  weatherImpact: {
    type: String,
    enum: ['none', 'minor', 'moderate', 'severe'],
    default: 'none'
  },
  specialEvents: [String],
  
  // Data Quality
  dataSource: {
    type: String,
    default: 'TRAFFIC_API'
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
trafficDataSchema.index({ routeId: 1 });
trafficDataSchema.index({ congestionLevel: 1 });
trafficDataSchema.index({ distanceFromStartKm: 1 });
trafficDataSchema.index({ riskScore: -1 });
trafficDataSchema.index({ measurementTime: -1 });

// Virtual for traffic efficiency
trafficDataSchema.virtual('trafficEfficiency').get(function() {
  if (!this.speedLimit || !this.averageSpeedKmph) return 0;
  return Math.round((this.averageSpeedKmph / this.speedLimit) * 100);
});

// Method to assess congestion impact
trafficDataSchema.methods.getCongestionImpact = function() {
  const impacts = {
    'free_flow': { delay: 0, fuelImpact: 'none', stress: 'low' },
    'light': { delay: 5, fuelImpact: 'minimal', stress: 'low' },
    'moderate': { delay: 15, fuelImpact: 'moderate', stress: 'medium' },
    'heavy': { delay: 30, fuelImpact: 'high', stress: 'high' },
    'severe': { delay: 60, fuelImpact: 'very_high', stress: 'very_high' }
  };
  return impacts[this.congestionLevel] || impacts.moderate;
};
  
  module.exports = mongoose.model('TrafficData', trafficDataSchema);