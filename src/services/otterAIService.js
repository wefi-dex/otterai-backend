const axios = require('axios');
const { logger } = require('../utils/logger');
const { SalesCall, SalesScript, Organization } = require('../database/models');

class OtterAIService {
  constructor() {
    this.apiKey = process.env.OTTERAI_API_KEY;
    this.apiUrl = process.env.OTTERAI_API_URL || 'https://api.otter.ai';
    this.webhookSecret = process.env.OTTERAI_WEBHOOK_SECRET;
    
    this.client = axios.create({
      baseURL: this.apiUrl,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Start a new recording session
   */
  async startRecording(salesCallId, organizationId, options = {}) {
    try {
      const salesCall = await SalesCall.findByPk(salesCallId, {
        include: [
          {
            model: Organization,
            as: 'organization',
            attributes: ['id', 'name', 'otterAIConfig']
          }
        ]
      });

      if (!salesCall) {
        throw new Error('Sales call not found');
      }

      const recordingPayload = {
        name: `Sales Call - ${salesCall.customerName || 'Customer'}`,
        description: `Sales presentation for ${salesCall.customerName}`,
        language: 'en-US',
        ...options
      };

      const response = await this.client.post('/v1/recordings', recordingPayload);
      
      // Update sales call with OtterAI recording ID
      await salesCall.update({
        otterAIRecordingId: response.data.id,
        status: 'in_progress',
        callStartTime: new Date()
      });

      logger.info(`Started OtterAI recording for sales call ${salesCallId}: ${response.data.id}`);
      
      return {
        recordingId: response.data.id,
        status: response.data.status,
        joinUrl: response.data.join_url,
        recordingUrl: response.data.recording_url
      };
    } catch (error) {
      logger.error('Error starting OtterAI recording:', error);
      throw error;
    }
  }

  /**
   * Stop an active recording
   */
  async stopRecording(recordingId) {
    try {
      const response = await this.client.post(`/v1/recordings/${recordingId}/stop`);
      
      logger.info(`Stopped OtterAI recording: ${recordingId}`);
      
      return {
        recordingId: response.data.id,
        status: response.data.status,
        duration: response.data.duration
      };
    } catch (error) {
      logger.error('Error stopping OtterAI recording:', error);
      throw error;
    }
  }

  /**
   * Get recording details and transcript
   */
  async getRecordingDetails(recordingId) {
    try {
      const response = await this.client.get(`/v1/recordings/${recordingId}`);
      
      return {
        id: response.data.id,
        name: response.data.name,
        status: response.data.status,
        duration: response.data.duration,
        transcript: response.data.transcript,
        speakers: response.data.speakers,
        summary: response.data.summary,
        insights: response.data.insights,
        recordingUrl: response.data.recording_url,
        transcriptUrl: response.data.transcript_url
      };
    } catch (error) {
      logger.error('Error getting recording details:', error);
      throw error;
    }
  }

  /**
   * Analyze sales call against training scripts
   */
  async analyzeSalesCall(salesCallId, recordingId) {
    try {
      const salesCall = await SalesCall.findByPk(salesCallId, {
        include: [
          {
            model: Organization,
            as: 'organization',
            include: [
              {
                model: SalesScript,
                as: 'salesScripts',
                where: { status: 'active' },
                required: false
              }
            ]
          }
        ]
      });

      if (!salesCall) {
        throw new Error('Sales call not found');
      }

      // Get recording details from OtterAI
      const recordingDetails = await this.getRecordingDetails(recordingId);
      
      // Get active sales scripts for the organization
      const activeScripts = salesCall.organization.salesScripts || [];
      
      // Perform analysis
      const analysis = await this.performAnalysis(recordingDetails, activeScripts);
      
      // Update sales call with analysis results
      await salesCall.update({
        status: 'completed',
        callEndTime: new Date(),
        duration: recordingDetails.duration,
        recordingUrl: recordingDetails.recordingUrl,
        transcriptUrl: recordingDetails.transcriptUrl,
        analysisData: analysis,
        performanceScore: analysis.performanceScore,
        strengths: analysis.strengths,
        weaknesses: analysis.weaknesses,
        recommendations: analysis.recommendations,
        scriptCompliance: analysis.scriptCompliance,
        keyTopicsCovered: analysis.keyTopicsCovered,
        objectionsHandled: analysis.objectionsHandled,
        customerSentiment: analysis.customerSentiment
      });

      logger.info(`Completed analysis for sales call ${salesCallId}`);
      
      return analysis;
    } catch (error) {
      logger.error('Error analyzing sales call:', error);
      throw error;
    }
  }

  /**
   * Perform detailed analysis of the sales call
   */
  async performAnalysis(recordingDetails, salesScripts) {
    const transcript = recordingDetails.transcript || '';
    const speakers = recordingDetails.speakers || [];
    const insights = recordingDetails.insights || {};

    // Extract sales representative speech
    const salesRepSpeech = this.extractSalesRepSpeech(transcript, speakers);
    
    // Analyze against training scripts
    const scriptAnalysis = this.analyzeScriptCompliance(salesRepSpeech, salesScripts);
    
    // Analyze customer sentiment
    const sentimentAnalysis = this.analyzeCustomerSentiment(insights);
    
    // Identify key topics and objections
    const topicAnalysis = this.analyzeTopicsAndObjections(transcript, insights);
    
    // Calculate performance score
    const performanceScore = this.calculatePerformanceScore(scriptAnalysis, sentimentAnalysis, topicAnalysis);
    
    // Generate strengths and weaknesses
    const strengths = this.identifyStrengths(scriptAnalysis, sentimentAnalysis, topicAnalysis);
    const weaknesses = this.identifyWeaknesses(scriptAnalysis, sentimentAnalysis, topicAnalysis);
    
    // Generate recommendations
    const recommendations = this.generateRecommendations(weaknesses, scriptAnalysis);

    return {
      performanceScore,
      scriptCompliance: scriptAnalysis.complianceScore,
      strengths,
      weaknesses,
      recommendations,
      keyTopicsCovered: topicAnalysis.topics,
      objectionsHandled: topicAnalysis.objections,
      customerSentiment: sentimentAnalysis.overallSentiment,
      detailedAnalysis: {
        scriptAnalysis,
        sentimentAnalysis,
        topicAnalysis
      }
    };
  }

  /**
   * Extract sales representative speech from transcript
   */
  extractSalesRepSpeech(transcript, speakers) {
    // Implementation would identify sales rep vs customer speech
    // For now, return the full transcript
    return transcript;
  }

  /**
   * Analyze script compliance
   */
  analyzeScriptCompliance(salesRepSpeech, salesScripts) {
    let complianceScore = 0;
    const coveredTopics = [];
    const missedTopics = [];
    const keyPhrasesFound = [];

    if (salesScripts.length === 0) {
      return {
        complianceScore: 0.5, // Neutral score if no scripts available
        coveredTopics: [],
        missedTopics: [],
        keyPhrasesFound: []
      };
    }

    // Analyze against each script
    salesScripts.forEach(script => {
      const scriptKeyPhrases = script.keyPhrases || [];
      const scriptRequiredTopics = script.requiredTopics || [];

      // Check key phrases
      scriptKeyPhrases.forEach(phrase => {
        if (salesRepSpeech.toLowerCase().includes(phrase.toLowerCase())) {
          keyPhrasesFound.push(phrase);
        }
      });

      // Check required topics
      scriptRequiredTopics.forEach(topic => {
        if (salesRepSpeech.toLowerCase().includes(topic.toLowerCase())) {
          coveredTopics.push(topic);
        } else {
          missedTopics.push(topic);
        }
      });
    });

    // Calculate compliance score
    const totalTopics = coveredTopics.length + missedTopics.length;
    if (totalTopics > 0) {
      complianceScore = coveredTopics.length / totalTopics;
    }

    return {
      complianceScore,
      coveredTopics,
      missedTopics,
      keyPhrasesFound
    };
  }

  /**
   * Analyze customer sentiment
   */
  analyzeCustomerSentiment(insights) {
    // Use OtterAI insights or implement sentiment analysis
    const sentiment = insights.sentiment || 'neutral';
    
    return {
      overallSentiment: sentiment,
      confidence: insights.sentiment_confidence || 0.5,
      emotions: insights.emotions || {}
    };
  }

  /**
   * Analyze topics and objections
   */
  analyzeTopicsAndObjections(transcript, insights) {
    const topics = insights.topics || [];
    const objections = insights.objections || [];
    
    return {
      topics,
      objections,
      topicConfidence: insights.topic_confidence || {}
    };
  }

  /**
   * Calculate overall performance score
   */
  calculatePerformanceScore(scriptAnalysis, sentimentAnalysis, topicAnalysis) {
    let score = 0;
    let factors = 0;

    // Script compliance (40% weight)
    if (scriptAnalysis.complianceScore !== undefined) {
      score += scriptAnalysis.complianceScore * 0.4;
      factors += 0.4;
    }

    // Customer sentiment (30% weight)
    const sentimentScore = this.sentimentToScore(sentimentAnalysis.overallSentiment);
    score += sentimentScore * 0.3;
    factors += 0.3;

    // Topic coverage (20% weight)
    const topicScore = this.calculateTopicScore(topicAnalysis);
    score += topicScore * 0.2;
    factors += 0.2;

    // Objection handling (10% weight)
    const objectionScore = this.calculateObjectionScore(topicAnalysis);
    score += objectionScore * 0.1;
    factors += 0.1;

    return factors > 0 ? score / factors : 0;
  }

  /**
   * Convert sentiment to numerical score
   */
  sentimentToScore(sentiment) {
    switch (sentiment) {
      case 'positive': return 1.0;
      case 'neutral': return 0.5;
      case 'negative': return 0.0;
      default: return 0.5;
    }
  }

  /**
   * Calculate topic coverage score
   */
  calculateTopicScore(topicAnalysis) {
    // Implementation would score based on topic coverage
    return 0.7; // Placeholder
  }

  /**
   * Calculate objection handling score
   */
  calculateObjectionScore(topicAnalysis) {
    // Implementation would score based on objection handling
    return 0.8; // Placeholder
  }

  /**
   * Identify strengths
   */
  identifyStrengths(scriptAnalysis, sentimentAnalysis, topicAnalysis) {
    const strengths = [];

    if (scriptAnalysis.complianceScore > 0.8) {
      strengths.push('Excellent script compliance');
    }

    if (sentimentAnalysis.overallSentiment === 'positive') {
      strengths.push('Positive customer engagement');
    }

    if (scriptAnalysis.keyPhrasesFound.length > 0) {
      strengths.push(`Used ${scriptAnalysis.keyPhrasesFound.length} key phrases effectively`);
    }

    return strengths;
  }

  /**
   * Identify weaknesses
   */
  identifyWeaknesses(scriptAnalysis, sentimentAnalysis, topicAnalysis) {
    const weaknesses = [];

    if (scriptAnalysis.complianceScore < 0.6) {
      weaknesses.push('Low script compliance');
    }

    if (scriptAnalysis.missedTopics.length > 0) {
      weaknesses.push(`Missed key topics: ${scriptAnalysis.missedTopics.join(', ')}`);
    }

    if (sentimentAnalysis.overallSentiment === 'negative') {
      weaknesses.push('Customer showed negative sentiment');
    }

    return weaknesses;
  }

  /**
   * Generate recommendations
   */
  generateRecommendations(weaknesses, scriptAnalysis) {
    const recommendations = [];

    if (scriptAnalysis.complianceScore < 0.6) {
      recommendations.push('Review and practice the sales script more thoroughly');
    }

    if (scriptAnalysis.missedTopics.length > 0) {
      recommendations.push('Ensure all required topics are covered in future presentations');
    }

    recommendations.push('Continue practicing objection handling techniques');
    recommendations.push('Focus on building rapport and positive customer relationships');

    return recommendations;
  }

  /**
   * Handle webhook events from OtterAI
   */
  async handleWebhook(payload, signature) {
    try {
      // Verify webhook signature
      if (!this.verifyWebhookSignature(payload, signature)) {
        throw new Error('Invalid webhook signature');
      }

      const { event_type, recording_id, data } = payload;

      switch (event_type) {
        case 'recording.completed':
          await this.handleRecordingCompleted(recording_id, data);
          break;
        case 'transcript.ready':
          await this.handleTranscriptReady(recording_id, data);
          break;
        case 'analysis.completed':
          await this.handleAnalysisCompleted(recording_id, data);
          break;
        default:
          logger.info(`Unhandled webhook event: ${event_type}`);
      }

      return { success: true };
    } catch (error) {
      logger.error('Error handling webhook:', error);
      throw error;
    }
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(payload, signature) {
    // Implementation would verify the webhook signature
    // For now, return true (implement proper verification in production)
    return true;
  }

  /**
   * Handle recording completed event
   */
  async handleRecordingCompleted(recordingId, data) {
    logger.info(`Recording completed: ${recordingId}`);
    
    // Find sales call by recording ID
    const salesCall = await SalesCall.findOne({
      where: { otterAIRecordingId: recordingId }
    });

    if (salesCall) {
      await salesCall.update({
        callEndTime: new Date(),
        duration: data.duration
      });
    }
  }

  /**
   * Handle transcript ready event
   */
  async handleTranscriptReady(recordingId, data) {
    logger.info(`Transcript ready: ${recordingId}`);
    
    // Find sales call by recording ID
    const salesCall = await SalesCall.findOne({
      where: { otterAIRecordingId: recordingId }
    });

    if (salesCall) {
      await salesCall.update({
        transcriptUrl: data.transcript_url
      });
    }
  }

  /**
   * Handle analysis completed event
   */
  async handleAnalysisCompleted(recordingId, data) {
    logger.info(`Analysis completed: ${recordingId}`);
    
    // Find sales call by recording ID
    const salesCall = await SalesCall.findOne({
      where: { otterAIRecordingId: recordingId }
    });

    if (salesCall) {
      // Trigger our custom analysis
      await this.analyzeSalesCall(salesCall.id, recordingId);
    }
  }
}

module.exports = new OtterAIService();
