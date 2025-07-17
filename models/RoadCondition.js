// File: models/RoadCondition.js
// Purpose: Store road condition data for risk assessment
const mongoose = require('mongoose');

const roadConditionSchema = new mongoose.Schema({
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
    roadType: {
      type: String,
      enum: ['highway', 'state', 'district', 'rural'],
      required: true
    },
    surfaceQuality: {
      type: String,
      enum: ['excellent', 'good', 'fair', 'poor', 'critical'],
      required: true
    },
    widthMeters: {
      type: Number,
      min: 2,
      max: 20
    },
    laneCount: {
      type: Number,
      min: 1,
      max: 8
    },
    hasPotholes: {
      type: Boolean,
      default: false
    },
    underConstruction: {
      type: Boolean,
      default: false
    },
    riskScore: {
      type: Number,
      min: 1,
      max: 10,
      required: true
    },
    dataSource: {
      type: String,
      required: true
    }
  }, {
    timestamps: true
  });
  
  roadConditionSchema.index({ routeId: 1 });
  roadConditionSchema.index({ latitude: 1, longitude: 1 });
  
  module.exports = mongoose.model('RoadCondition', roadConditionSchema);