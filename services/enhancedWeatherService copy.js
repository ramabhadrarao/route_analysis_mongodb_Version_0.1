// File: services/enhancedWeatherService.js
// Purpose: Multi-seasonal weather data collection with vehicle/road condition predictions

const axios = require('axios');
const WeatherCondition = require('../models/WeatherCondition');

class EnhancedWeatherService {
  constructor() {
    this.openWeatherApiKey = process.env.OPENWEATHER_API_KEY;
    this.visualCrossingApiKey = process.env.VISUALCROSSING_API_KEY;
    this.tomorrowIoApiKey = process.env.TOMORROW_IO_API_KEY;
    
    // Seasonal date ranges for comprehensive data
    this.seasonalRanges = {
      winter: { months: [12, 1, 2], label: 'Winter (Dec-Feb)' },
      spring: { months: [3, 4, 5], label: 'Spring (Mar-May)' },
      summer: { months: [6, 7, 8], label: 'Summer (Jun-Aug)' },
      monsoon: { months: [9, 10, 11], label: 'Monsoon (Sep-Nov)' }
    };
    
    // Vehicle/Road condition prediction models
    this.conditionPredictors = {
      roadSurface: this.predictRoadSurfaceConditions.bind(this),
      vehiclePerformance: this.predictVehiclePerformance.bind(this),
      drivingConditions: this.predictDrivingConditions.bind(this),
      maintenanceNeeds: this.predictMaintenanceNeeds.bind(this)
    };
  }

  // ============================================================================
  // MULTI-SEASONAL DATA COLLECTION
  // ============================================================================

  async collectAllSeasonalWeatherData(routeId) {
    try {
      console.log('🌦️ Starting comprehensive multi-seasonal weather collection...');
      
      const Route = require('../models/Route');
      const route = await Route.findById(routeId);
      
      if (!route) {
        throw new Error('Route not found');
      }

      // Clear existing weather data for fresh analysis
      await WeatherCondition.deleteMany({ routeId });
      console.log('🗑️ Cleared existing weather data');

      const seasonalResults = {};
      const routeSegments = this.createRouteSegments(route.routePoints, 15);
      
      // Collect data for ALL seasons
      for (const [seasonName, seasonConfig] of Object.entries(this.seasonalRanges)) {
        console.log(`📊 Collecting ${seasonConfig.label} data...`);
        
        try {
          const seasonalData = await this.collectSeasonSpecificData(
            routeSegments, 
            seasonName, 
            seasonConfig,
            routeId
          );
          
          seasonalResults[seasonName] = seasonalData;
          
          // Rate limiting between seasons
          await new Promise(resolve => setTimeout(resolve, 2000));
          
        } catch (seasonError) {
          console.error(`❌ Failed to collect ${seasonName} data:`, seasonError.message);
          seasonalResults[seasonName] = { error: seasonError.message, collected: 0 };
        }
      }

      // Generate comprehensive analysis
      const comprehensiveAnalysis = await this.generateSeasonalAnalysis(seasonalResults, route);
      
      console.log('✅ Multi-seasonal weather data collection completed');
      return {
        seasonalData: seasonalResults,
        analysis: comprehensiveAnalysis,
        totalDataPoints: Object.values(seasonalResults).reduce((sum, season) => 
          sum + (season.collected || 0), 0),
        vehiclePredictions: await this.generateVehicleRoadPredictions(seasonalResults, route),
        recommendations: this.generateSeasonalRecommendations(comprehensiveAnalysis)
      };
      
    } catch (error) {
      console.error('Multi-seasonal weather collection failed:', error);
      throw error;
    }
  }

  // ============================================================================
  // SEASON-SPECIFIC DATA COLLECTION
  // ============================================================================

  async collectSeasonSpecificData(routeSegments, seasonName, seasonConfig, routeId) {
    const weatherPoints = [];
    const currentYear = new Date().getFullYear();
    
    // Get historical data for this season from multiple years
    const years = [currentYear - 2, currentYear - 1, currentYear];
    
    for (const segment of routeSegments) {
      for (const year of years) {
        for (const month of seasonConfig.months) {
          try {
            // Sample date from this month
            const sampleDate = new Date(year, month - 1, 15); // 15th of month
            
            // Get historical weather data
            const historicalWeather = await this.getHistoricalWeatherData(
              segment.latitude, 
              segment.longitude, 
              sampleDate
            );
            
            if (historicalWeather) {
              const weatherCondition = await this.createEnhancedWeatherCondition({
                routeId,
                location: segment,
                weatherData: historicalWeather,
                season: seasonName,
                year,
                month,
                sampleDate
              });
              
              if (weatherCondition) {
                weatherPoints.push(weatherCondition);
              }
            }
            
            // Rate limiting
            await new Promise(resolve => setTimeout(resolve, 500));
            
          } catch (pointError) {
            console.warn(`Failed to get weather for ${seasonName} ${year}-${month}:`, pointError.message);
          }
        }
      }
    }
    
    return {
      season: seasonName,
      collected: weatherPoints.length,
      weatherPoints,
      averageConditions: this.calculateSeasonalAverages(weatherPoints),
      extremeEvents: this.identifyExtremeWeatherEvents(weatherPoints)
    };
  }

  // ============================================================================
  // ENHANCED WEATHER DATA APIS
  // ============================================================================

  async getHistoricalWeatherData(latitude, longitude, date) {
    try {
      // Try Visual Crossing API first (best for historical data)
      if (this.visualCrossingApiKey) {
        return await this.getVisualCrossingHistoricalData(latitude, longitude, date);
      }
      
      // Fallback to Tomorrow.io API
      if (this.tomorrowIoApiKey) {
        return await this.getTomorrowIoHistoricalData(latitude, longitude, date);
      }
      
      // Final fallback to OpenWeather (limited historical)
      if (this.openWeatherApiKey) {
        return await this.getOpenWeatherHistoricalData(latitude, longitude, date);
      }
      
      throw new Error('No weather API keys configured');
      
    } catch (error) {
      console.error('Historical weather data failed:', error);
      return null;
    }
  }

  async getVisualCrossingHistoricalData(latitude, longitude, date) {
    try {
      const dateStr = date.toISOString().split('T')[0];
      const url = `https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/` +
        `${latitude},${longitude}/${dateStr}?` +
        `key=${this.visualCrossingApiKey}&` +
        `include=days&` +
        `elements=temp,tempmax,tempmin,humidity,precip,windspeed,winddir,visibility,conditions,snow,snowdepth,icon`;
      
      const response = await axios.get(url, { timeout: 15000 });
      
      if (response.data && response.data.days && response.data.days[0]) {
        const dayData = response.data.days[0];
        
        return {
          temperature: dayData.temp,
          maxTemperature: dayData.tempmax,
          minTemperature: dayData.tempmin,
          humidity: dayData.humidity,
          precipitation: dayData.precip || 0,
          windSpeed: dayData.windspeed || 0,
          windDirection: dayData.winddir || 0,
          visibility: dayData.visibility || 10,
          conditions: dayData.conditions,
          snow: dayData.snow || 0,
          snowDepth: dayData.snowdepth || 0,
          icon: dayData.icon,
          dataSource: 'VISUAL_CROSSING_HISTORICAL',
          confidence: 0.9
        };
      }
      
      return null;
      
    } catch (error) {
      console.error('Visual Crossing API error:', error);
      throw error;
    }
  }

  async getTomorrowIoHistoricalData(latitude, longitude, date) {
    try {
      const dateStr = date.toISOString().split('T')[0];
      const url = `https://api.tomorrow.io/v4/timelines?` +
        `location=${latitude},${longitude}&` +
        `fields=temperature,humidity,precipitationIntensity,windSpeed,visibility&` +
        `timesteps=1d&` +
        `startTime=${dateStr}T00:00:00Z&` +
        `endTime=${dateStr}T23:59:59Z&` +
        `apikey=${this.tomorrowIoApiKey}`;
      
      const response = await axios.get(url, { timeout: 15000 });
      
      if (response.data && response.data.data && response.data.data.timelines[0]) {
        const dayData = response.data.data.timelines[0].intervals[0].values;
        
        return {
          temperature: dayData.temperature,
          humidity: dayData.humidity,
          precipitation: dayData.precipitationIntensity || 0,
          windSpeed: dayData.windSpeed || 0,
          visibility: dayData.visibility || 10,
          dataSource: 'TOMORROW_IO_HISTORICAL',
          confidence: 0.85
        };
      }
      
      return null;
      
    } catch (error) {
      console.error('Tomorrow.io API error:', error);
      throw error;
    }
  }

  async getOpenWeatherHistoricalData(latitude, longitude, date) {
    try {
      // OpenWeather has limited free historical data (last 5 days only)
      // For older dates, use current conditions as approximation
      const url = `https://api.openweathermap.org/data/2.5/weather?` +
        `lat=${latitude}&lon=${longitude}&` +
        `appid=${this.openWeatherApiKey}&units=metric`;
      
      const response = await axios.get(url, { timeout: 10000 });
      
      if (response.data) {
        const data = response.data;
        
        return {
          temperature: data.main.temp,
          humidity: data.main.humidity,
          precipitation: 0, // Not available in current weather
          windSpeed: data.wind.speed * 3.6, // Convert m/s to km/h
          windDirection: data.wind.deg || 0,
          visibility: (data.visibility || 10000) / 1000, // Convert to km
          conditions: data.weather[0].description,
          dataSource: 'OPENWEATHER_CURRENT_APPROX',
          confidence: 0.6 // Lower confidence for approximated data
        };
      }
      
      return null;
      
    } catch (error) {
      console.error('OpenWeather API error:', error);
      throw error;
    }
  }

  // ============================================================================
  // VEHICLE & ROAD CONDITION PREDICTIONS
  // ============================================================================

  async generateVehicleRoadPredictions(seasonalResults, route) {
    try {
      console.log('🚗 Generating vehicle and road condition predictions...');
      
      const predictions = {};
      
      for (const [season, seasonData] of Object.entries(seasonalResults)) {
        if (seasonData.error || !seasonData.weatherPoints) continue;
        
        predictions[season] = {
          roadConditions: await this.predictRoadSurfaceConditions(seasonData, route),
          vehiclePerformance: await this.predictVehiclePerformance(seasonData, route),
          drivingConditions: await this.predictDrivingConditions(seasonData, route),
          maintenanceNeeds: await this.predictMaintenanceNeeds(seasonData, route),
          fuelConsumption: this.predictFuelConsumption(seasonData, route),
          tireWear: this.predictTireWear(seasonData, route),
          breakdownRisk: this.assessBreakdownRisk(seasonData, route)
        };
      }
      
      return {
        bySeasons: predictions,
        comparative: this.generateComparativeAnalysis(predictions),
        recommendations: this.generateVehicleMaintenanceRecommendations(predictions)
      };
      
    } catch (error) {
      console.error('Vehicle/road predictions failed:', error);
      return { error: error.message };
    }
  }

  async predictRoadSurfaceConditions(seasonData, route) {
    const conditions = {
      averageCondition: 'good',
      riskPeriods: [],
      surfaceTypes: {},
      hazards: []
    };
    
    let dryDays = 0, wetDays = 0, icyDays = 0, muddyDays = 0;
    
    for (const weatherPoint of seasonData.weatherPoints) {
      if (weatherPoint.precipitation > 10) {
        wetDays++;
        if (weatherPoint.averageTemperature < 2) icyDays++;
        if (route.terrain === 'rural' && weatherPoint.precipitation > 25) muddyDays++;
      } else {
        dryDays++;
      }
      
      // Identify high-risk periods
      if (weatherPoint.precipitation > 50 || weatherPoint.averageTemperature < 0) {
        conditions.riskPeriods.push({
          type: weatherPoint.averageTemperature < 0 ? 'freezing' : 'heavy_rain',
          severity: weatherPoint.precipitation > 100 ? 'extreme' : 'high',
          impact: 'severe_surface_degradation'
        });
      }
    }
    
    const totalDays = seasonData.weatherPoints.length;
    conditions.surfaceTypes = {
      dry: Math.round((dryDays / totalDays) * 100),
      wet: Math.round((wetDays / totalDays) * 100),
      icy: Math.round((icyDays / totalDays) * 100),
      muddy: Math.round((muddyDays / totalDays) * 100)
    };
    
    // Determine average condition
    if (icyDays > totalDays * 0.2) conditions.averageCondition = 'critical';
    else if (wetDays > totalDays * 0.5) conditions.averageCondition = 'poor';
    else if (wetDays > totalDays * 0.3) conditions.averageCondition = 'fair';
    
    return conditions;
  }

  async predictVehiclePerformance(seasonData, route) {
    const performance = {
      engineEfficiency: 100,
      brakingPerformance: 100,
      transmissionStress: 'low',
      coolingSystemStress: 'low',
      batteryPerformance: 100,
      overallReliability: 'high'
    };
    
    const avgTemp = seasonData.averageConditions?.averageTemperature || 25;
    const avgHumidity = seasonData.averageConditions?.humidity || 60;
    const avgPrecipitation = seasonData.averageConditions?.precipitation || 0;
    
    // Temperature effects on engine
    if (avgTemp > 40) {
      performance.engineEfficiency -= 15;
      performance.coolingSystemStress = 'high';
    } else if (avgTemp < 0) {
      performance.engineEfficiency -= 20;
      performance.batteryPerformance -= 30;
    }
    
    // Humidity effects
    if (avgHumidity > 80) {
      performance.engineEfficiency -= 5;
    }
    
    // Precipitation effects on braking
    if (avgPrecipitation > 20) {
      performance.brakingPerformance -= 25;
    }
    
    // Terrain adjustments
    if (route.terrain === 'hilly') {
      performance.transmissionStress = avgTemp > 35 ? 'high' : 'medium';
      performance.brakingPerformance -= 10;
    }
    
    // Overall reliability assessment
    const avgPerformance = (performance.engineEfficiency + performance.brakingPerformance + performance.batteryPerformance) / 3;
    if (avgPerformance < 70) performance.overallReliability = 'low';
    else if (avgPerformance < 85) performance.overallReliability = 'medium';
    
    return performance;
  }

  async predictDrivingConditions(seasonData, route) {
    const conditions = {
      visibility: 'good',
      roadGrip: 'good',
      recommendedSpeed: 'normal',
      drivingDifficulty: 'easy',
      riskLevel: 'low',
      specialPrecautions: []
    };
    
    const avgVisibility = seasonData.averageConditions?.visibility || 10;
    const avgPrecipitation = seasonData.averageConditions?.precipitation || 0;
    const avgWindSpeed = seasonData.averageConditions?.windSpeed || 0;
    
    // Visibility assessment
    if (avgVisibility < 2) {
      conditions.visibility = 'poor';
      conditions.specialPrecautions.push('Use fog lights');
      conditions.specialPrecautions.push('Reduce speed by 50%');
    } else if (avgVisibility < 5) {
      conditions.visibility = 'limited';
      conditions.specialPrecautions.push('Use headlights during day');
    }
    
    // Road grip assessment
    if (avgPrecipitation > 25) {
      conditions.roadGrip = 'poor';
      conditions.recommendedSpeed = 'reduce_30_percent';
      conditions.specialPrecautions.push('Increase following distance');
    } else if (avgPrecipitation > 10) {
      conditions.roadGrip = 'fair';
      conditions.recommendedSpeed = 'reduce_15_percent';
    }
    
    // Wind effects
    if (avgWindSpeed > 50) {
      conditions.specialPrecautions.push('Beware of crosswinds');
      conditions.drivingDifficulty = 'challenging';
    }
    
    // Overall risk assessment
    let riskScore = 0;
    if (conditions.visibility === 'poor') riskScore += 3;
    if (conditions.roadGrip === 'poor') riskScore += 3;
    if (avgWindSpeed > 50) riskScore += 2;
    
    if (riskScore >= 6) conditions.riskLevel = 'high';
    else if (riskScore >= 3) conditions.riskLevel = 'medium';
    
    return conditions;
  }

  async predictMaintenanceNeeds(seasonData, route) {
    const maintenance = {
      priority: [],
      seasonal: [],
      preventive: [],
      urgentBy: []
    };
    
    const avgTemp = seasonData.averageConditions?.averageTemperature || 25;
    const avgHumidity = seasonData.averageConditions?.humidity || 60;
    const extremeEvents = seasonData.extremeEvents || [];
    
    // Temperature-based maintenance
    if (avgTemp > 40) {
      maintenance.priority.push({
        item: 'Cooling System',
        reason: 'High temperature stress',
        urgency: 'high',
        action: 'Check coolant levels and radiator condition'
      });
      maintenance.seasonal.push('Air conditioning service');
    }
    
    if (avgTemp < 5) {
      maintenance.priority.push({
        item: 'Battery and Starting System',
        reason: 'Cold weather reduces battery capacity',
        urgency: 'high',
        action: 'Test battery and charging system'
      });
      maintenance.seasonal.push('Winter-grade oil change');
    }
    
    // Humidity effects
    if (avgHumidity > 80) {
      maintenance.preventive.push('Anti-corrosion treatment');
      maintenance.preventive.push('Electrical system protection');
    }
    
    // Extreme event preparations
    if (extremeEvents.some(e => e.type === 'heavy_rain')) {
      maintenance.urgentBy.push({
        item: 'Tire Tread and Brakes',
        deadline: '2 weeks before season',
        reason: 'Wet weather requires optimal traction'
      });
    }
    
    // Route-specific maintenance
    if (route.terrain === 'hilly') {
      maintenance.seasonal.push('Transmission service');
      maintenance.seasonal.push('Brake system inspection');
    }
    
    return maintenance;
  }

  // ============================================================================
  // ADDITIONAL PREDICTION METHODS
  // ============================================================================

  predictFuelConsumption(seasonData, route) {
    let baseConsumption = 100; // Percentage of normal consumption
    
    const avgTemp = seasonData.averageConditions?.averageTemperature || 25;
    
    // Temperature effects
    if (avgTemp > 35) baseConsumption += 15; // AC usage
    if (avgTemp < 0) baseConsumption += 20; // Cold engine, heating
    
    // Precipitation effects (wet roads increase resistance)
    const avgPrecipitation = seasonData.averageConditions?.precipitation || 0;
    if (avgPrecipitation > 10) baseConsumption += 8;
    
    return {
      expectedIncrease: baseConsumption - 100,
      factors: this.getFuelConsumptionFactors(avgTemp, avgPrecipitation),
      recommendations: this.getFuelSavingTips(avgTemp, avgPrecipitation)
    };
  }

  predictTireWear(seasonData, route) {
    let wearRate = 100; // Percentage of normal wear
    
    const avgTemp = seasonData.averageConditions?.averageTemperature || 25;
    const avgPrecipitation = seasonData.averageConditions?.precipitation || 0;
    
    // High temperature increases wear
    if (avgTemp > 40) wearRate += 25;
    
    // Wet conditions can reduce wear but increase hydroplaning risk
    if (avgPrecipitation > 20) wearRate -= 5;
    
    // Terrain effects
    if (route.terrain === 'hilly') wearRate += 15;
    if (route.terrain === 'rural') wearRate += 10; // Rough roads
    
    return {
      expectedWearRate: wearRate,
      tireType: this.recommendTireType(seasonData, route),
      maintenanceTips: this.getTireMaintenanceTips(seasonData)
    };
  }

  assessBreakdownRisk(seasonData, route) {
    let riskScore = 0;
    const riskFactors = [];
    
    const avgTemp = seasonData.averageConditions?.averageTemperature || 25;
    const extremeEvents = seasonData.extremeEvents || [];
    
    // Temperature extremes increase breakdown risk
    if (avgTemp > 45) {
      riskScore += 3;
      riskFactors.push('Extreme heat - overheating risk');
    }
    if (avgTemp < -5) {
      riskScore += 3;
      riskFactors.push('Extreme cold - starting problems');
    }
    
    // Extreme weather events
    if (extremeEvents.length > 5) {
      riskScore += 2;
      riskFactors.push('Frequent extreme weather');
    }
    
    // Route characteristics
    if (route.terrain === 'hilly' && route.totalDistance > 200) {
      riskScore += 2;
      riskFactors.push('Long distance on hilly terrain');
    }
    
    let riskLevel = 'low';
    if (riskScore >= 7) riskLevel = 'high';
    else if (riskScore >= 4) riskLevel = 'medium';
    
    return {
      riskLevel,
      riskScore,
      riskFactors,
      preventiveMeasures: this.getBreakdownPreventionTips(riskFactors)
    };
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  createRouteSegments(routePoints, numberOfSegments) {
    const segments = [];
    const step = Math.max(1, Math.floor(routePoints.length / numberOfSegments));
    
    for (let i = 0; i < routePoints.length; i += step) {
      segments.push(routePoints[i]);
    }
    
    return segments;
  }

  async createEnhancedWeatherCondition(data) {
    try {
      const weatherCondition = new WeatherCondition({
        routeId: data.routeId,
        latitude: data.location.latitude,
        longitude: data.location.longitude,
        
        // Seasonal data
        season: data.season,
        dataYear: data.year,
        
        // Weather data
        weatherCondition: this.mapWeatherCondition(data.weatherData.conditions),
        averageTemperature: data.weatherData.temperature,
        humidity: data.weatherData.humidity,
        precipitationMm: data.weatherData.precipitation,
        windSpeedKmph: data.weatherData.windSpeed,
        windDirection: data.weatherData.windDirection,
        visibilityKm: data.weatherData.visibility,
        
        // Road surface prediction
        roadSurfaceCondition: this.predictSurfaceFromWeather(data.weatherData),
        
        // Risk assessment
        riskScore: this.calculateWeatherRisk(data.weatherData),
        
        // Additional data
        dataSource: data.weatherData.dataSource || 'HISTORICAL_API',
        confidence: data.weatherData.confidence || 0.8
      });
      
      return await weatherCondition.save();
      
    } catch (error) {
      console.error('Failed to create weather condition:', error);
      return null;
    }
  }

  mapWeatherCondition(conditions) {
    if (!conditions) return 'clear';
    
    const condition = conditions.toLowerCase();
    if (condition.includes('rain') || condition.includes('drizzle')) return 'rainy';
    if (condition.includes('snow') || condition.includes('ice')) return 'icy';
    if (condition.includes('fog') || condition.includes('mist')) return 'foggy';
    if (condition.includes('storm') || condition.includes('thunder')) return 'stormy';
    return 'clear';
  }

  predictSurfaceFromWeather(weatherData) {
    if (weatherData.temperature < 2 && weatherData.precipitation > 0) return 'icy';
    if (weatherData.precipitation > 10) return 'wet';
    if (weatherData.precipitation > 50) return 'muddy';
    return 'dry';
  }

  calculateWeatherRisk(weatherData) {
    let risk = 3; // Base risk
    
    if (weatherData.visibility < 1) risk += 4;
    else if (weatherData.visibility < 5) risk += 2;
    
    if (weatherData.precipitation > 50) risk += 3;
    else if (weatherData.precipitation > 20) risk += 2;
    
    if (weatherData.windSpeed > 60) risk += 3;
    else if (weatherData.windSpeed > 40) risk += 2;
    
    if (weatherData.temperature < 0 || weatherData.temperature > 45) risk += 2;
    
    return Math.max(1, Math.min(10, risk));
  }

  calculateSeasonalAverages(weatherPoints) {
    if (weatherPoints.length === 0) return null;
    
    return {
      averageTemperature: weatherPoints.reduce((sum, w) => sum + w.averageTemperature, 0) / weatherPoints.length,
      humidity: weatherPoints.reduce((sum, w) => sum + w.humidity, 0) / weatherPoints.length,
      precipitation: weatherPoints.reduce((sum, w) => sum + w.precipitationMm, 0) / weatherPoints.length,
      windSpeed: weatherPoints.reduce((sum, w) => sum + w.windSpeedKmph, 0) / weatherPoints.length,
      visibility: weatherPoints.reduce((sum, w) => sum + w.visibilityKm, 0) / weatherPoints.length,
      riskScore: weatherPoints.reduce((sum, w) => sum + w.riskScore, 0) / weatherPoints.length
    };
  }

  identifyExtremeWeatherEvents(weatherPoints) {
    const extremeEvents = [];
    
    for (const weather of weatherPoints) {
      if (weather.precipitationMm > 100) {
        extremeEvents.push({
          type: 'heavy_rain',
          severity: weather.precipitationMm > 200 ? 'extreme' : 'severe',
          value: weather.precipitationMm,
          impact: 'flooding_risk'
        });
      }
      
      if (weather.averageTemperature > 45) {
        extremeEvents.push({
          type: 'extreme_heat',
          severity: 'high',
          value: weather.averageTemperature,
          impact: 'vehicle_overheating'
        });
      }
      
      if (weather.averageTemperature < -5) {
        extremeEvents.push({
          type: 'extreme_cold',
          severity: 'high',
          value: weather.averageTemperature,
          impact: 'starting_problems'
        });
      }
      
      if (weather.windSpeedKmph > 70) {
        extremeEvents.push({
          type: 'high_winds',
          severity: 'high',
          value: weather.windSpeedKmph,
          impact: 'vehicle_control'
        });
      }
    }
    
    return extremeEvents;
  }

// File: services/enhancedWeatherService.js - CONTINUATION PART 2
// Purpose: Seasonal Analysis, Recommendations and Helper Methods

  // ============================================================================
  // SEASONAL ANALYSIS & COMPARATIVE METHODS
  // ============================================================================

  generateSeasonalAnalysis(seasonalResults, route) {
    const analysis = {
      bestSeason: null,
      worstSeason: null,
      yearRoundChallenges: [],
      seasonalTrends: {},
      criticalPeriods: [],
      routeSpecificInsights: []
    };

    const seasonScores = {};
    
    // Calculate risk scores for each season
    for (const [season, data] of Object.entries(seasonalResults)) {
      if (data.error || !data.averageConditions) {
        seasonScores[season] = 10; // Maximum risk for missing data
        continue;
      }
      
      let score = 0;
      const avg = data.averageConditions;
      
      // Temperature risk
      if (avg.averageTemperature > 40) score += 3;
      else if (avg.averageTemperature < 5) score += 2;
      
      // Precipitation risk
      if (avg.precipitation > 50) score += 4;
      else if (avg.precipitation > 25) score += 2;
      
      // Visibility risk
      if (avg.visibility < 5) score += 3;
      else if (avg.visibility < 8) score += 1;
      
      // Wind risk
      if (avg.windSpeed > 50) score += 2;
      
      // Extreme events
      score += (data.extremeEvents?.length || 0) * 0.5;
      
      seasonScores[season] = Math.min(10, score);
    }
    
    // Identify best and worst seasons
    const sortedSeasons = Object.entries(seasonScores).sort((a, b) => a[1] - b[1]);
    analysis.bestSeason = {
      season: sortedSeasons[0][0],
      score: sortedSeasons[0][1],
      reasons: this.getBestSeasonReasons(seasonalResults[sortedSeasons[0][0]])
    };
    
    analysis.worstSeason = {
      season: sortedSeasons[sortedSeasons.length - 1][0],
      score: sortedSeasons[sortedSeasons.length - 1][1],
      reasons: this.getWorstSeasonReasons(seasonalResults[sortedSeasons[sortedSeasons.length - 1][0]])
    };
    
    // Identify year-round challenges
    analysis.yearRoundChallenges = this.identifyConsistentChallenges(seasonalResults);
    
    // Generate seasonal trends
    analysis.seasonalTrends = this.generateSeasonalTrends(seasonalResults);
    
    // Identify critical periods
    analysis.criticalPeriods = this.identifyCriticalPeriods(seasonalResults);
    
    // Route-specific insights
    analysis.routeSpecificInsights = this.generateRouteSpecificInsights(seasonalResults, route);
    
    return analysis;
  }

  getBestSeasonReasons(seasonData) {
    const reasons = [];
    if (!seasonData.averageConditions) return ['Data not available'];
    
    const avg = seasonData.averageConditions;
    
    if (avg.averageTemperature >= 15 && avg.averageTemperature <= 30) {
      reasons.push('Optimal temperature range for vehicle performance');
    }
    if (avg.precipitation < 20) {
      reasons.push('Low precipitation reduces road hazards');
    }
    if (avg.visibility > 8) {
      reasons.push('Excellent visibility conditions');
    }
    if (avg.windSpeed < 30) {
      reasons.push('Calm wind conditions');
    }
    if ((seasonData.extremeEvents?.length || 0) < 2) {
      reasons.push('Minimal extreme weather events');
    }
    
    return reasons.length > 0 ? reasons : ['Generally favorable conditions'];
  }

  getWorstSeasonReasons(seasonData) {
    const reasons = [];
    if (!seasonData.averageConditions) return ['Data not available'];
    
    const avg = seasonData.averageConditions;
    
    if (avg.averageTemperature > 40) {
      reasons.push('Extreme heat causes vehicle overheating');
    }
    if (avg.averageTemperature < 5) {
      reasons.push('Cold temperatures affect battery and engine');
    }
    if (avg.precipitation > 50) {
      reasons.push('Heavy precipitation creates hazardous driving');
    }
    if (avg.visibility < 5) {
      reasons.push('Poor visibility conditions');
    }
    if (avg.windSpeed > 50) {
      reasons.push('High winds affect vehicle control');
    }
    if ((seasonData.extremeEvents?.length || 0) > 5) {
      reasons.push('Frequent extreme weather events');
    }
    
    return reasons.length > 0 ? reasons : ['Generally challenging conditions'];
  }

  identifyConsistentChallenges(seasonalResults) {
    const challenges = [];
    const seasonCount = Object.keys(seasonalResults).length;
    
    // Check for issues present in most seasons
    let highTempSeasons = 0;
    let highPrecipSeasons = 0;
    let poorVisibilitySeasons = 0;
    
    for (const [season, data] of Object.entries(seasonalResults)) {
      if (!data.averageConditions) continue;
      
      if (data.averageConditions.averageTemperature > 35) highTempSeasons++;
      if (data.averageConditions.precipitation > 30) highPrecipSeasons++;
      if (data.averageConditions.visibility < 8) poorVisibilitySeasons++;
    }
    
    if (highTempSeasons >= seasonCount * 0.5) {
      challenges.push({
        type: 'high_temperatures',
        frequency: 'year_round',
        impact: 'Vehicle cooling system stress and driver fatigue',
        mitigation: 'Enhanced cooling system maintenance and AC service'
      });
    }
    
    if (highPrecipSeasons >= seasonCount * 0.5) {
      challenges.push({
        type: 'wet_conditions',
        frequency: 'year_round',
        impact: 'Reduced traction and increased accident risk',
        mitigation: 'High-quality tires and regular brake maintenance'
      });
    }
    
    if (poorVisibilitySeasons >= seasonCount * 0.5) {
      challenges.push({
        type: 'visibility_issues',
        frequency: 'year_round',
        impact: 'Increased collision risk and driver strain',
        mitigation: 'Enhanced lighting systems and fog light maintenance'
      });
    }
    
    return challenges;
  }

  generateSeasonalTrends(seasonalResults) {
    const trends = {};
    
    const seasons = ['winter', 'spring', 'summer', 'monsoon'];
    const metrics = ['averageTemperature', 'precipitation', 'visibility', 'windSpeed'];
    
    for (const metric of metrics) {
      trends[metric] = {
        pattern: [],
        variability: 'low',
        peak: null,
        valley: null
      };
      
      const values = [];
      for (const season of seasons) {
        const data = seasonalResults[season];
        if (data && data.averageConditions) {
          const value = data.averageConditions[metric];
          trends[metric].pattern.push({ season, value });
          values.push(value);
        }
      }
      
      if (values.length > 0) {
        const max = Math.max(...values);
        const min = Math.min(...values);
        const variance = this.calculateVariance(values);
        
        trends[metric].peak = trends[metric].pattern.find(p => p.value === max);
        trends[metric].valley = trends[metric].pattern.find(p => p.value === min);
        trends[metric].variability = variance > values.reduce((a, b) => a + b) / values.length * 0.3 ? 'high' : 'low';
      }
    }
    
    return trends;
  }

  identifyCriticalPeriods(seasonalResults) {
    const criticalPeriods = [];
    
    for (const [season, data] of Object.entries(seasonalResults)) {
      if (!data.averageConditions || !data.extremeEvents) continue;
      
      const avg = data.averageConditions;
      let criticalityScore = 0;
      const issues = [];
      
      // Check for critical conditions
      if (avg.averageTemperature > 42) {
        criticalityScore += 3;
        issues.push('Extreme heat - vehicle overheating risk');
      }
      
      if (avg.averageTemperature < 2) {
        criticalityScore += 3;
        issues.push('Near-freezing temperatures - icy roads');
      }
      
      if (avg.precipitation > 75) {
        criticalityScore += 4;
        issues.push('Heavy precipitation - flooding risk');
      }
      
      if (avg.visibility < 3) {
        criticalityScore += 3;
        issues.push('Very poor visibility - accident risk');
      }
      
      if (data.extremeEvents.length > 8) {
        criticalityScore += 2;
        issues.push('Frequent extreme weather events');
      }
      
      if (criticalityScore >= 5) {
        criticalPeriods.push({
          season,
          criticalityScore,
          issues,
          recommendation: criticalityScore >= 8 ? 'Avoid travel during this season' : 
                         criticalityScore >= 6 ? 'Exercise extreme caution' : 'Enhanced preparation required'
        });
      }
    }
    
    return criticalPeriods.sort((a, b) => b.criticalityScore - a.criticalityScore);
  }

  generateRouteSpecificInsights(seasonalResults, route) {
    const insights = [];
    
    // Terrain-specific insights
    if (route.terrain === 'hilly') {
      insights.push({
        category: 'terrain',
        insight: 'Hilly terrain amplifies weather impacts',
        details: [
          'Steep grades increase engine stress in hot weather',
          'Descent braking is more dangerous in wet conditions',
          'Higher elevation may have different weather patterns'
        ]
      });
    }
    
    if (route.terrain === 'rural') {
      insights.push({
        category: 'terrain',
        insight: 'Rural routes have limited weather shelter',
        details: [
          'Exposed to full impact of wind and precipitation',
          'Limited emergency services during extreme weather',
          'Unpaved sections may become impassable'
        ]
      });
    }
    
    // Distance-specific insights
    if (route.totalDistance > 300) {
      insights.push({
        category: 'distance',
        insight: 'Long routes cross multiple weather zones',
        details: [
          'Weather conditions may change significantly along route',
          'Extended exposure to adverse conditions',
          'Multiple fuel stops required regardless of weather'
        ]
      });
    }
    
    // Highway-specific insights
    if (route.majorHighways && route.majorHighways.length > 0) {
      insights.push({
        category: 'infrastructure',
        insight: 'Highway routes have better weather resilience',
        details: [
          'Better drainage and road maintenance',
          'More weather monitoring and alerts',
          'Better emergency response access'
        ]
      });
    }
    
    return insights;
  }

  // ============================================================================
  // RECOMMENDATION GENERATORS
  // ============================================================================

  generateSeasonalRecommendations(analysis) {
    const recommendations = [];
    
    // Best season recommendations
    if (analysis.bestSeason) {
      recommendations.push({
        priority: 'HIGH',
        category: 'timing',
        title: `Optimal Travel Season: ${analysis.bestSeason.season.charAt(0).toUpperCase() + analysis.bestSeason.season.slice(1)}`,
        description: 'Schedule critical trips during this season for minimal weather risk',
        actions: [
          `Plan major route usage during ${analysis.bestSeason.season}`,
          'Use this season for driver training and route familiarization',
          'Schedule heavy maintenance before this optimal period'
        ]
      });
    }
    
    // Worst season recommendations
    if (analysis.worstSeason) {
      recommendations.push({
        priority: 'CRITICAL',
        category: 'avoidance',
        title: `High-Risk Season: ${analysis.worstSeason.season.charAt(0).toUpperCase() + analysis.worstSeason.season.slice(1)}`,
        description: 'Implement enhanced safety measures or avoid travel during this period',
        actions: [
          `Consider alternative routes during ${analysis.worstSeason.season}`,
          'Implement enhanced vehicle preparation protocols',
          'Require convoy travel during this season',
          'Increase emergency supply requirements'
        ]
      });
    }
    
    // Year-round challenge recommendations
    if (analysis.yearRoundChallenges.length > 0) {
      recommendations.push({
        priority: 'HIGH',
        category: 'year_round',
        title: 'Persistent Weather Challenges',
        description: 'Address consistent weather-related risks throughout the year',
        actions: analysis.yearRoundChallenges.map(challenge => challenge.mitigation)
      });
    }
    
    // Critical period recommendations
    if (analysis.criticalPeriods.length > 0) {
      for (const period of analysis.criticalPeriods) {
        recommendations.push({
          priority: 'CRITICAL',
          category: 'critical_period',
          title: `Critical Period: ${period.season.charAt(0).toUpperCase() + period.season.slice(1)}`,
          description: period.recommendation,
          actions: [
            ...period.issues.map(issue => `Address: ${issue}`),
            'Implement emergency response protocols',
            'Consider route suspension during extreme events'
          ]
        });
      }
    }
    
    return recommendations;
  }

  generateVehicleMaintenanceRecommendations(predictions) {
    const recommendations = [];
    
    // Analyze patterns across seasons
    const seasonalMaintenance = new Map();
    
    for (const [season, prediction] of Object.entries(predictions.bySeasons || {})) {
      if (prediction.maintenanceNeeds && prediction.maintenanceNeeds.priority) {
        for (const maintenance of prediction.maintenanceNeeds.priority) {
          if (!seasonalMaintenance.has(maintenance.item)) {
            seasonalMaintenance.set(maintenance.item, []);
          }
          seasonalMaintenance.get(maintenance.item).push({
            season,
            urgency: maintenance.urgency,
            reason: maintenance.reason
          });
        }
      }
    }
    
    // Generate consolidated recommendations
    for (const [item, seasons] of seasonalMaintenance) {
      const highUrgencySeasons = seasons.filter(s => s.urgency === 'high');
      
      if (highUrgencySeasons.length > 0) {
        recommendations.push({
          priority: 'HIGH',
          category: 'maintenance',
          title: `Critical Maintenance: ${item}`,
          description: `Required for ${highUrgencySeasons.map(s => s.season).join(', ')} seasons`,
          actions: [
            `Schedule ${item.toLowerCase()} service before high-risk seasons`,
            ...highUrgencySeasons.map(s => `${s.season}: ${s.reason}`)
          ]
        });
      }
    }
    
    return recommendations;
  }

  // ============================================================================
  // HELPER UTILITY METHODS
  // ============================================================================

  calculateVariance(values) {
    if (values.length === 0) return 0;
    const mean = values.reduce((a, b) => a + b) / values.length;
    return values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / values.length;
  }

  getFuelConsumptionFactors(avgTemp, avgPrecipitation) {
    const factors = [];
    
    if (avgTemp > 35) factors.push('Air conditioning usage');
    if (avgTemp < 5) factors.push('Cold engine warm-up time');
    if (avgPrecipitation > 20) factors.push('Wet road resistance');
    
    return factors;
  }

  getFuelSavingTips(avgTemp, avgPrecipitation) {
    const tips = [];
    
    if (avgTemp > 35) {
      tips.push('Park in shade when possible');
      tips.push('Use recirculation mode for AC efficiency');
    }
    
    if (avgTemp < 5) {
      tips.push('Allow proper engine warm-up');
      tips.push('Use engine block heater if available');
    }
    
    if (avgPrecipitation > 20) {
      tips.push('Maintain steady speeds on wet roads');
      tips.push('Keep tires properly inflated for efficiency');
    }
    
    return tips;
  }

  recommendTireType(seasonData, route) {
    const avg = seasonData.averageConditions;
    if (!avg) return 'all_season';
    
    if (avg.averageTemperature < 7) return 'winter_tires';
    if (avg.precipitation > 40) return 'wet_weather_tires';
    if (route.terrain === 'rural') return 'all_terrain';
    
    return 'all_season';
  }

  getTireMaintenanceTips(seasonData) {
    const tips = ['Check tire pressure monthly'];
    const avg = seasonData.averageConditions;
    
    if (avg && avg.averageTemperature > 35) {
      tips.push('Check pressure more frequently in hot weather');
    }
    
    if (avg && avg.precipitation > 30) {
      tips.push('Monitor tread depth for wet weather performance');
    }
    
    return tips;
  }

  getBreakdownPreventionTips(riskFactors) {
    const tips = [
      'Carry comprehensive emergency kit',
      'Maintain emergency communication device'
    ];
    
    if (riskFactors.includes('Extreme heat - overheating risk')) {
      tips.push('Carry extra coolant and water');
      tips.push('Travel during cooler parts of the day');
    }
    
    if (riskFactors.includes('Extreme cold - starting problems')) {
      tips.push('Keep battery terminals clean');
      tips.push('Carry jumper cables and battery pack');
    }
    
    return tips;
  }

  generateComparativeAnalysis(predictions) {
    if (!predictions || Object.keys(predictions).length === 0) {
      return { error: 'No prediction data available' };
    }
    
    const comparison = {
      seasons: Object.keys(predictions),
      bestPerformanceSeason: null,
      worstPerformanceSeason: null,
      keyDifferences: []
    };
    
    // Find best and worst performing seasons
    let bestScore = -1;
    let worstScore = 101;
    
    for (const [season, prediction] of Object.entries(predictions)) {
      if (prediction.vehiclePerformance) {
        const avgPerformance = (
          prediction.vehiclePerformance.engineEfficiency +
          prediction.vehiclePerformance.brakingPerformance +
          prediction.vehiclePerformance.batteryPerformance
        ) / 3;
        
        if (avgPerformance > bestScore) {
          bestScore = avgPerformance;
          comparison.bestPerformanceSeason = season;
        }
        
        if (avgPerformance < worstScore) {
          worstScore = avgPerformance;
          comparison.worstPerformanceSeason = season;
        }
      }
    }
    
    return comparison;
  }
}

module.exports = new EnhancedWeatherService();