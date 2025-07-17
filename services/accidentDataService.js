// File: services/accidentDataService.js - REAL APIs ONLY VERSION
// Purpose: Real accident data using ONLY TomTom and HERE APIs - NO MOCK DATA

const axios = require('axios');
const AccidentProneArea = require('../models/AccidentProneArea');

class AccidentDataService {
  constructor() {
    this.tomtomApiKey = process.env.TOMTOM_API_KEY;
    this.hereApiKey = process.env.HERE_API_KEY;
    
    // Validate API keys on startup
    this.validateApiKeys();
  }

  // Validate API keys are configured
  validateApiKeys() {
    if (!this.tomtomApiKey) {
      console.error('❌ TOMTOM_API_KEY not configured in .env file');
    } else {
      console.log('✅ TomTom API key configured');
    }
    
    if (!this.hereApiKey) {
      console.error('❌ HERE_API_KEY not configured in .env file');  
    } else {
      console.log('✅ HERE API key configured');
    }
    
    if (!this.tomtomApiKey && !this.hereApiKey) {
      console.error('❌ NO API KEYS CONFIGURED - Accident data collection will fail');
    }
  }

  // MAIN: Collect ONLY real accident data - NO MOCK DATA
  async collectRealAccidentProneAreas(route) {
    try {
      console.log('🚨 Collecting accident data using REAL APIs ONLY (NO MOCK DATA)...');
      
      // Verify API keys before proceeding
      if (!this.tomtomApiKey && !this.hereApiKey) {
        throw new Error('No API keys configured - cannot collect real accident data');
      }

      const accidentAreas = [];
      const routeSegments = this.createRouteSegments(route.routePoints, 15); // More segments for better coverage
      
      console.log(`📍 Analyzing ${routeSegments.length} route segments...`);
      
      for (let i = 0; i < routeSegments.length; i++) {
        const segment = routeSegments[i];
        console.log(`🔍 Segment ${i + 1}/${routeSegments.length}: ${segment.latitude.toFixed(4)}, ${segment.longitude.toFixed(4)}`);
        
        try {
          // Collect from REAL APIs only
          const apiPromises = [];
          
          if (this.tomtomApiKey) {
            apiPromises.push(this.getTomTomIncidents(segment));
          }
          
          if (this.hereApiKey) {
            apiPromises.push(this.getHereIncidents(segment));
          }
          
          const results = await Promise.allSettled(apiPromises);
          
          // Process TomTom results
          if (this.tomtomApiKey && results[0]?.status === 'fulfilled') {
            const tomtomIncidents = results[0].value || [];
            console.log(`📊 TomTom found ${tomtomIncidents.length} incidents`);
            
            for (const incident of tomtomIncidents) {
              if (this.isAccidentRelated(incident)) {
                const accidentArea = await this.createAccidentProneArea(
                  incident, route._id, 'tomtom'
                );
                if (accidentArea) {
                  accidentAreas.push(accidentArea);
                  console.log(`✅ Saved TomTom accident: ${incident.description}`);
                }
              }
            }
          } else if (this.tomtomApiKey && results[0]?.status === 'rejected') {
            console.error(`❌ TomTom API failed: ${results[0].reason.message}`);
          }

          // Process HERE results  
          const hereIndex = this.tomtomApiKey ? 1 : 0;
          if (this.hereApiKey && results[hereIndex]?.status === 'fulfilled') {
            const hereIncidents = results[hereIndex].value || [];
            console.log(`📊 HERE found ${hereIncidents.length} incidents`);
            
            for (const incident of hereIncidents) {
              if (this.isAccidentRelated(incident)) {
                const accidentArea = await this.createAccidentProneArea(
                  incident, route._id, 'here'
                );
                if (accidentArea) {
                  accidentAreas.push(accidentArea);
                  console.log(`✅ Saved HERE accident: ${incident.description}`);
                }
              }
            }
          } else if (this.hereApiKey && results[hereIndex]?.status === 'rejected') {
            console.error(`❌ HERE API failed: ${results[hereIndex].reason.message}`);
          }

          // Rate limiting between API calls
          await new Promise(resolve => setTimeout(resolve, 1000));

        } catch (segmentError) {
          console.error(`❌ Segment ${i + 1} failed:`, segmentError.message);
        }
      }

      const finalResults = {
        total: accidentAreas.length,
        bySource: this.groupBySource(accidentAreas),
        highRiskAreas: accidentAreas.filter(a => a.riskScore > 7).length,
        averageRisk: this.calculateAverageRisk(accidentAreas),
        apiStatus: {
          tomtom: this.tomtomApiKey ? 'CONFIGURED' : 'NOT_CONFIGURED',
          here: this.hereApiKey ? 'CONFIGURED' : 'NOT_CONFIGURED'
        }
      };

      console.log(`🎯 REAL API Results: ${finalResults.total} accident areas found`);
      console.log(`📈 Sources: ${JSON.stringify(finalResults.bySource)}`);
      
      // If no real data found, DO NOT use mock data
      if (finalResults.total === 0) {
        console.log('⚠️ No real accident data found - APIs returned no incidents for this route');
        console.log('🚫 Mock data disabled - returning empty results');
      }

      return finalResults;

    } catch (error) {
      console.error('❌ Real accident data collection failed:', error);
      
      // DO NOT FALLBACK TO MOCK DATA - Return empty results
      return {
        total: 0,
        bySource: {},
        highRiskAreas: 0,
        averageRisk: 0,
        error: error.message,
        note: 'Real API collection failed - no mock data used',
        apiStatus: {
          tomtom: this.tomtomApiKey ? 'ERROR' : 'NOT_CONFIGURED',
          here: this.hereApiKey ? 'ERROR' : 'NOT_CONFIGURED'
        }
      };
    }
  }

  // 1. TomTom Traffic Incidents API - ENHANCED WITH BETTER LOGGING
  async getTomTomIncidents(segment) {
    try {
      if (!this.tomtomApiKey) {
        throw new Error('TomTom API key not configured');
      }

      // Expanded search area for better coverage
      const searchRadius = 0.08; // ~9km radius
      const url = `https://api.tomtom.com/traffic/services/5/incidentDetails` +
        `?key=${this.tomtomApiKey}` +
        `&bbox=${segment.latitude - searchRadius},${segment.longitude - searchRadius},` +
        `${segment.latitude + searchRadius},${segment.longitude + searchRadius}` +
        `&fields={incidents{type,geometry{type,coordinates},properties{iconCategory,magnitudeOfDelay,events{description,code,iconCategory}}}}` +
        `&language=en-GB`;

      console.log(`🔗 TomTom API URL: ${url.substring(0, 100)}...`);

      const response = await axios.get(url, { 
        timeout: 15000,
        headers: {
          'User-Agent': 'HPCL-Journey-Risk-Management/2.0'
        }
      });

      console.log(`📡 TomTom API Response Status: ${response.status}`);
      console.log(`📄 TomTom Response Data:`, JSON.stringify(response.data, null, 2));

      if (response.data && response.data.incidents) {
        const incidents = response.data.incidents.map(incident => ({
          id: incident.id || `tomtom_${Date.now()}_${Math.random()}`,
          type: 'tomtom',
          coordinates: this.extractCoordinates(incident.geometry),
          severity: this.mapTomTomSeverity(incident.properties?.magnitudeOfDelay),
          description: incident.properties?.events?.[0]?.description || 'Traffic incident',
          category: incident.properties?.iconCategory || 'unknown',
          source: 'TomTom Traffic API',
          timestamp: new Date(),
          rawData: incident // Keep raw data for debugging
        }));

        console.log(`✅ TomTom parsed ${incidents.length} incidents`);
        return incidents;
      }

      console.log('ℹ️ TomTom API returned no incidents for this area');
      return [];

    } catch (error) {
      console.error('❌ TomTom API Error Details:', {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data
      });
      throw error;
    }
  }

  // 2. HERE Traffic Incidents API - ENHANCED WITH BETTER LOGGING
  async getHereIncidents(segment) {
    try {
      if (!this.hereApiKey) {
        throw new Error('HERE API key not configured');
      }

      // Expanded search area for better coverage
      const searchRadius = 0.08; // ~9km radius
      const url = `https://data.traffic.hereapi.com/v7/incidents` +
        `?apikey=${this.hereApiKey}` +
        `&in=bbox:${segment.longitude - searchRadius},${segment.latitude - searchRadius},${segment.longitude + searchRadius},${segment.latitude + searchRadius}` +
        `&locationReferencing=shape`;

      console.log(`🔗 HERE API URL: ${url.substring(0, 100)}...`);

      const response = await axios.get(url, { 
        timeout: 15000,
        headers: {
          'User-Agent': 'HPCL-Journey-Risk-Management/2.0'
        }
      });

      console.log(`📡 HERE API Response Status: ${response.status}`);
      console.log(`📄 HERE Response Data:`, JSON.stringify(response.data, null, 2));

      if (response.data && response.data.results) {
        const incidents = response.data.results.map(incident => ({
          id: incident.incidentDetails?.id || `here_${Date.now()}_${Math.random()}`,
          type: 'here',
          coordinates: this.extractHereCoordinates(incident.location),
          severity: this.mapHereSeverity(incident.incidentDetails?.criticality),
          description: incident.incidentDetails?.description?.value || 'Traffic incident',
          category: incident.incidentDetails?.type || 'unknown',
          source: 'HERE Traffic API',
          timestamp: new Date(),
          rawData: incident // Keep raw data for debugging
        }));

        console.log(`✅ HERE parsed ${incidents.length} incidents`);
        return incidents;
      }

      console.log('ℹ️ HERE API returned no incidents for this area');
      return [];

    } catch (error) {
      console.error('❌ HERE API Error Details:', {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data
      });
      throw error;
    }
  }

  // 3. Create AccidentProneArea from REAL incident data only
  async createAccidentProneArea(incident, routeId, source) {
    try {
      // Calculate enhanced risk factors from real incident data
      const riskAnalysis = this.analyzeRealIncidentRisk(incident);
      
      const accidentArea = new AccidentProneArea({
        routeId,
        latitude: incident.coordinates.latitude,
        longitude: incident.coordinates.longitude,
        distanceFromStartKm: 0, // Calculate based on route if needed
        
        // Real incident data
        accidentFrequencyYearly: riskAnalysis.estimatedFrequency,
        accidentSeverity: this.mapSeverityToEnum(incident.severity),
        
        // Analysis from real data
        commonAccidentTypes: riskAnalysis.accidentTypes,
        contributingFactors: riskAnalysis.contributingFactors,
        
        // Risk analysis
        timeOfDayRisk: riskAnalysis.timeRisks,
        weatherRelatedRisk: riskAnalysis.weatherRisk,
        infrastructureRisk: riskAnalysis.infrastructureRisk,
        trafficVolumeRisk: riskAnalysis.trafficRisk,
        
        // Overall risk from real incident
        riskScore: riskAnalysis.overallRisk,
        
        // Real incident data
        lastAccidentDate: incident.timestamp,
        accidentTrend: 'recent', // Since it's from live API
        
        // Safety analysis
        safetyMeasuresPresent: this.analyzeSafetyFromIncident(incident),
        recommendedImprovements: this.generateRealDataRecommendations(riskAnalysis),
        
        // Data source tracking
        dataSource: `${source.toUpperCase()}_API`,
        dataQuality: 'high'
      });

      return await accidentArea.save();

    } catch (error) {
      console.error('❌ Failed to create accident area from real data:', error);
      return null;
    }
  }

  // Enhanced risk analysis for REAL incident data
  analyzeRealIncidentRisk(incident) {
    let overallRisk = 5; // Start with medium risk for real incidents
    
    // Severity-based risk from real data
    const severityRisk = {
      'fatal': 5,
      'major': 4,
      'moderate': 3,
      'minor': 2
    };
    overallRisk += severityRisk[incident.severity] || 3;

    // Category-based risk analysis
    if (incident.category) {
      const category = incident.category.toLowerCase();
      if (category.includes('accident') || category.includes('collision')) overallRisk += 2;
      if (category.includes('construction')) overallRisk += 1;
      if (category.includes('hazard')) overallRisk += 2;
    }

    // Description-based risk analysis
    if (incident.description) {
      const desc = incident.description.toLowerCase();
      if (desc.includes('blocked') || desc.includes('closed')) overallRisk += 2;
      if (desc.includes('emergency')) overallRisk += 1;
      if (desc.includes('multiple')) overallRisk += 2;
    }
    
    return {
      overallRisk: Math.max(3, Math.min(10, overallRisk)), // Real incidents get minimum risk of 3
      estimatedFrequency: this.estimateFrequencyFromRealData(incident),
      accidentTypes: this.extractAccidentTypesFromReal(incident),
      contributingFactors: this.extractFactorsFromReal(incident),
      timeRisks: { night: 7, day: 5, peak: 6 }, // Real incident time patterns
      weatherRisk: this.assessWeatherFromReal(incident),
      infrastructureRisk: this.assessInfraFromReal(incident),
      trafficRisk: this.assessTrafficFromReal(incident)
    };
  }

  // Helper methods for real data analysis
  estimateFrequencyFromRealData(incident) {
    // Real incidents suggest ongoing issues - higher frequency
    const baseFrequency = 5;
    if (incident.severity === 'major') return baseFrequency + 3;
    if (incident.severity === 'moderate') return baseFrequency + 1;
    return baseFrequency;
  }

  extractAccidentTypesFromReal(incident) {
    const types = [];
    const desc = incident.description?.toLowerCase() || '';
    const cat = incident.category?.toLowerCase() || '';
    
    if (desc.includes('collision') || cat.includes('accident')) types.push('collision');
    if (desc.includes('breakdown')) types.push('breakdown');
    if (desc.includes('construction')) types.push('construction_related');
    if (desc.includes('weather')) types.push('weather_related');
    
    return types.length > 0 ? types : ['general_incident'];
  }

  extractFactorsFromReal(incident) {
    const factors = [];
    const desc = incident.description?.toLowerCase() || '';
    
    if (desc.includes('weather') || desc.includes('rain')) factors.push('weather_conditions');
    if (desc.includes('construction') || desc.includes('work')) factors.push('construction_zone');
    if (desc.includes('traffic') || desc.includes('congestion')) factors.push('traffic_density');
    if (desc.includes('visibility') || desc.includes('fog')) factors.push('poor_visibility');
    
    return factors.length > 0 ? factors : ['real_incident_reported'];
  }

  assessWeatherFromReal(incident) {
    const desc = incident.description?.toLowerCase() || '';
    if (desc.includes('weather') || desc.includes('rain') || desc.includes('fog')) return 8;
    return 5;
  }

  assessInfraFromReal(incident) {
    const desc = incident.description?.toLowerCase() || '';
    if (desc.includes('construction') || desc.includes('roadwork')) return 7;
    return 5;
  }

  assessTrafficFromReal(incident) {
    const desc = incident.description?.toLowerCase() || '';
    if (desc.includes('congestion') || desc.includes('blocked')) return 8;
    return 6;
  }

  analyzeSafetyFromIncident(incident) {
    const measures = ['Real-time Traffic Monitoring'];
    if (incident.source.includes('TomTom')) measures.push('TomTom Traffic Management');
    if (incident.source.includes('HERE')) measures.push('HERE Traffic Intelligence');
    return measures;
  }

  generateRealDataRecommendations(riskAnalysis) {
    const recommendations = [];
    
    if (riskAnalysis.overallRisk >= 8) {
      recommendations.push('Immediate attention required - live incident detected');
      recommendations.push('Consider real-time route adjustment');
    }
    
    if (riskAnalysis.trafficRisk > 7) {
      recommendations.push('Heavy traffic conditions - allow extra time');
    }
    
    return recommendations;
  }

  // Existing helper methods (same as before)
  mapTomTomSeverity(magnitudeOfDelay) {
    if (!magnitudeOfDelay) return 'minor';
    if (magnitudeOfDelay > 3) return 'major';
    if (magnitudeOfDelay > 2) return 'moderate';
    return 'minor';
  }

  mapHereSeverity(criticality) {
    if (!criticality) return 'minor';
    if (criticality >= 4) return 'major';
    if (criticality >= 3) return 'moderate';
    return 'minor';
  }

  isAccidentRelated(incident) {
    const accidentKeywords = [
      'accident', 'collision', 'crash', 'incident', 'emergency',
      'vehicle', 'disabled', 'breakdown', 'hazard', 'blocked', 'obstruction'
    ];
    
    const description = (incident.description || '').toLowerCase();
    const category = (incident.category || '').toLowerCase();
    
    return accidentKeywords.some(keyword => 
      description.includes(keyword) || category.includes(keyword)
    );
  }

  mapSeverityToEnum(severity) {
    const severityMap = {
      'fatal': 'fatal',
      'major': 'major', 
      'moderate': 'major',
      'minor': 'minor'
    };
    return severityMap[severity] || 'minor';
  }

  extractCoordinates(geometry) {
    try {
      if (geometry?.type === 'Point') {
        return {
          latitude: geometry.coordinates[1],
          longitude: geometry.coordinates[0]
        };
      } else if (geometry?.type === 'LineString') {
        return {
          latitude: geometry.coordinates[0][1],
          longitude: geometry.coordinates[0][0]
        };
      }
      return { latitude: 0, longitude: 0 };
    } catch (error) {
      console.error('❌ Coordinate extraction failed:', error);
      return { latitude: 0, longitude: 0 };
    }
  }

  extractHereCoordinates(location) {
    try {
      if (location?.shape?.links?.[0]?.points?.[0]) {
        const firstPoint = location.shape.links[0].points[0];
        return {
          latitude: firstPoint.lat,
          longitude: firstPoint.lng
        };
      }
      return { latitude: 0, longitude: 0 };
    } catch (error) {
      console.error('❌ HERE coordinate extraction failed:', error);
      return { latitude: 0, longitude: 0 };
    }
  }

  createRouteSegments(routePoints, numberOfSegments) {
    const segments = [];
    const step = Math.max(1, Math.floor(routePoints.length / numberOfSegments));
    
    for (let i = 0; i < routePoints.length; i += step) {
      segments.push(routePoints[i]);
    }
    
    return segments;
  }

  groupBySource(accidentAreas) {
    return accidentAreas.reduce((acc, area) => {
      const source = area.dataSource.toLowerCase();
      acc[source] = (acc[source] || 0) + 1;
      return acc;
    }, {});
  }

  calculateAverageRisk(accidentAreas) {
    if (accidentAreas.length === 0) return 0;
    return Math.round((accidentAreas.reduce((sum, area) => sum + area.riskScore, 0) / accidentAreas.length) * 100) / 100;
  }
}

module.exports = new AccidentDataService();