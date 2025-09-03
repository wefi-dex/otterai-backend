const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { Readable } = require("stream");
const { logger } = require('../utils/logger');
const path = require('path');
const crypto = require('crypto');

class FileStorageService {
  constructor() {
    // Ensure endpoint has proper protocol
    const endpoint = process.env.IDRIVE_E2_ENDPOINT;
    const formattedEndpoint = endpoint && !endpoint.startsWith('http') ? `https://${endpoint}` : endpoint;
    
    this.client = new S3Client({
      region: process.env.IDRIVE_E2_REGION || "us-east-1",
      endpoint: formattedEndpoint,
      credentials: {
        accessKeyId: process.env.IDRIVE_E2_ACCESS_KEY_ID,
        secretAccessKey: process.env.IDRIVE_E2_SECRET_ACCESS_KEY,
      },
    });

    this.bucket = process.env.IDRIVE_E2_BUCKET || "otterai-history";
    this.baseUrl = process.env.IDRIVE_E2_BASE_URL || "https://d3t1.va01.idrivee2-92.com";
    
    if (!this.isConfigured()) {
      logger.warn('IDrive E2 file storage service not configured. File uploads will fail.');
    } else {
      logger.info('IDrive E2 file storage service initialized');
    }
  }

  /**
   * Check if the service is properly configured
   * @returns {boolean} True if configured, false otherwise
   */
  isConfigured() {
    const endpoint = process.env.IDRIVE_E2_ENDPOINT;
    const accessKey = process.env.IDRIVE_E2_ACCESS_KEY_ID;
    const secretKey = process.env.IDRIVE_E2_SECRET_ACCESS_KEY;
    const bucket = process.env.IDRIVE_E2_BUCKET;
    
    return !!(endpoint && accessKey && secretKey && bucket);
  }

  /**
   * Generate a unique file key for storage
   * @param {string} originalName - Original filename
   * @param {string} prefix - Folder prefix (e.g., 'sales-calls', 'analytics')
   * @returns {string} Unique file key
   */
  generateFileKey(originalName, prefix = 'uploads') {
    const timestamp = Date.now();
    const randomString = crypto.randomBytes(8).toString('hex');
    const extension = path.extname(originalName);
    const baseName = path.basename(originalName, extension);
    
    return `${prefix}/${timestamp}-${randomString}-${baseName}${extension}`;
  }

  /**
   * Upload a file to IDrive E2
   * @param {Buffer|string} fileData - File data (Buffer or string)
   * @param {string} originalName - Original filename
   * @param {string} contentType - MIME type of the file
   * @param {string} prefix - Folder prefix for organization
   * @returns {Promise<Object>} Upload result with URL and metadata
   */
  async uploadFile(fileData, originalName, contentType, prefix = 'uploads') {
    if (!this.isConfigured()) {
      throw new Error('IDrive E2 file storage service not configured');
    }

    try {
      const fileKey = this.generateFileKey(originalName, prefix);
      const fileSize = Buffer.isBuffer(fileData) ? fileData.length : Buffer.byteLength(fileData, 'utf8');
      
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: fileKey,
        Body: fileData,
        ContentType: contentType
      });

      await this.client.send(command);
      const fileUrl = `${this.baseUrl}/${this.bucket}/${fileKey}`;
      
      logger.info(`File uploaded successfully: ${fileKey} (${fileSize} bytes)`);

      return {
        success: true,
        fileKey,
        fileUrl,
        originalName,
        contentType,
        fileSize,
        uploadedAt: new Date().toISOString()
      };
    } catch (error) {
      logger.error(`File upload failed: ${error.message}`);
      throw new Error(`File upload failed: ${error.message}`);
    }
  }

  /**
   * Upload a file from a readable stream
   * @param {ReadableStream} stream - File stream
   * @param {string} originalName - Original filename
   * @param {string} contentType - MIME type of the file
   * @param {string} prefix - Folder prefix for organization
   * @returns {Promise<Object>} Upload result
   */
  async uploadFileFromStream(stream, originalName, contentType, prefix = 'uploads') {
    if (!this.isConfigured()) {
      throw new Error('IDrive E2 file storage service not configured');
    }

    try {
      const fileKey = this.generateFileKey(originalName, prefix);
      
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: fileKey,
        Body: stream,
        ContentType: contentType,
        Metadata: {
          originalName,
          uploadedAt: new Date().toISOString()
        }
      });

      await this.client.send(command);

      const fileUrl = `${this.baseUrl}/${this.bucket}/${fileKey}`;
      
      logger.info(`File uploaded from stream successfully: ${fileKey}`);

      return {
        success: true,
        fileKey,
        fileUrl,
        originalName,
        contentType,
        uploadedAt: new Date().toISOString()
      };
    } catch (error) {
      logger.error(`File upload from stream failed: ${error.message}`);
      throw new Error(`File upload from stream failed: ${error.message}`);
    }
  }

  /**
   * Get a file from IDrive E2
   * @param {string} fileKey - File key in storage
   * @returns {Promise<Object>} File data and metadata
   */
  async getFile(fileKey) {
    if (!this.isConfigured()) {
      throw new Error('IDrive E2 file storage service not configured');
    }

    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: fileKey,
      });

      const response = await this.client.send(command);
      
      // Convert stream to buffer
      const chunks = [];
      for await (const chunk of response.Body) {
        chunks.push(chunk);
      }
      const fileData = Buffer.concat(chunks);

      logger.info(`File retrieved successfully: ${fileKey}`);

      return {
        success: true,
        fileData,
        contentType: response.ContentType,
        contentLength: response.ContentLength,
        metadata: response.Metadata,
        lastModified: response.LastModified
      };
    } catch (error) {
      logger.error(`File retrieval failed: ${error.message}`);
      throw new Error(`File retrieval failed: ${error.message}`);
    }
  }

  /**
   * Get a presigned URL for file download (expires in 1 hour)
   * @param {string} fileKey - File key in storage
   * @param {number} expiresIn - Expiration time in seconds (default: 3600)
   * @returns {Promise<string>} Presigned download URL
   */
  async getPresignedDownloadUrl(fileKey, expiresIn = 3600) {
    if (!this.isConfigured()) {
      throw new Error('IDrive E2 file storage service not configured');
    }

    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: fileKey,
      });

      const presignedUrl = await getSignedUrl(this.client, command, { expiresIn });
      
      logger.info(`Presigned download URL generated for: ${fileKey}`);

      return presignedUrl;
    } catch (error) {
      logger.error(`Failed to generate presigned URL: ${error.message}`);
      throw new Error(`Failed to generate presigned URL: ${error.message}`);
    }
  }

  /**
   * Delete a file from IDrive E2
   * @param {string} fileKey - File key in storage
   * @returns {Promise<Object>} Deletion result
   */
  async deleteFile(fileKey) {
    if (!this.isConfigured()) {
      throw new Error('IDrive E2 file storage service not configured');
    }

    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: fileKey,
      });

      await this.client.send(command);
      
      logger.info(`File deleted successfully: ${fileKey}`);

      return {
        success: true,
        fileKey,
        deletedAt: new Date().toISOString()
      };
    } catch (error) {
      logger.error(`File deletion failed: ${error.message}`);
      throw new Error(`File deletion failed: ${error.message}`);
    }
  }

  /**
   * Check if a file exists in IDrive E2
   * @param {string} fileKey - File key in storage
   * @returns {Promise<boolean>} True if file exists, false otherwise
   */
  async fileExists(fileKey) {
    if (!this.isConfigured()) {
      return false;
    }

    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: fileKey,
      });

      await this.client.send(command);
      return true;
    } catch (error) {
      if (error.name === 'NotFound') {
        return false;
      }
      logger.error(`Error checking file existence: ${error.message}`);
      return false;
    }
  }

  /**
   * Get file metadata from IDrive E2
   * @param {string} fileKey - File key in storage
   * @returns {Promise<Object>} File metadata
   */
  async getFileMetadata(fileKey) {
    if (!this.isConfigured()) {
      throw new Error('IDrive E2 file storage service not configured');
    }

    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: fileKey,
      });

      const response = await this.client.send(command);
      
      return {
        success: true,
        fileKey,
        contentType: response.ContentType,
        contentLength: response.ContentLength,
        metadata: response.Metadata,
        lastModified: response.LastModified,
        etag: response.ETag
      };
    } catch (error) {
      logger.error(`Failed to get file metadata: ${error.message}`);
      throw new Error(`Failed to get file metadata: ${error.message}`);
    }
  }

  /**
   * Upload sales call recording file
   * @param {Buffer|string} fileData - Audio/video file data
   * @param {string} originalName - Original filename
   * @param {string} salesCallId - Sales call ID for organization
   * @returns {Promise<Object>} Upload result
   */
  async uploadSalesCallRecording(fileData, originalName, salesCallId) {
    const prefix = `sales-calls/${salesCallId}`;
    const contentType = this.getContentType(originalName);
    
    return this.uploadFile(fileData, originalName, contentType, prefix);
  }

  /**
   * Upload analytics report file
   * @param {Buffer|string} fileData - Report file data
   * @param {string} originalName - Original filename
   * @param {string} reportId - Report ID for organization
   * @returns {Promise<Object>} Upload result
   */
  async uploadAnalyticsReport(fileData, originalName, reportId) {
    const prefix = `analytics/${reportId}`;
    const contentType = this.getContentType(originalName);
    
    return this.uploadFile(fileData, originalName, contentType, prefix);
  }

  /**
   * Upload user profile image
   * @param {Buffer|string} fileData - Image file data
   * @param {string} originalName - Original filename
   * @param {string} userId - User ID for organization
   * @returns {Promise<Object>} Upload result
   */
  async uploadProfileImage(fileData, originalName, userId) {
    const prefix = `profiles/${userId}`;
    const contentType = this.getContentType(originalName);
    
    return this.uploadFile(fileData, originalName, contentType, prefix);
  }

  /**
   * Get content type based on file extension
   * @param {string} filename - Filename with extension
   * @returns {string} MIME content type
   */
  getContentType(filename) {
    const ext = path.extname(filename).toLowerCase();
    
    const mimeTypes = {
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.m4a': 'audio/mp4',
      '.mp4': 'video/mp4',
      '.avi': 'video/x-msvideo',
      '.mov': 'video/quicktime',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.txt': 'text/plain',
      '.csv': 'text/csv'
    };

    return mimeTypes[ext] || 'application/octet-stream';
  }

  /**
   * Get service status information
   * @returns {Object} Service status
   */
  getStatus() {
    return {
      configured: this.isConfigured(),
      provider: 'IDrive E2',
      bucket: this.bucket,
      endpoint: process.env.IDRIVE_E2_ENDPOINT,
      baseUrl: this.baseUrl
    };
  }

  /**
   * Test the connection to IDrive E2
   * @returns {Promise<Object>} Connection test result
   */
  async testConnection() {
    if (!this.isConfigured()) {
      return {
        success: false,
        error: 'Service not configured'
      };
    }

    try {
      // Try to list objects (limited to 1 to minimize data transfer)
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: 'test-connection'
      });

      await this.client.send(command);
      
      return {
        success: true,
        message: 'Connection to IDrive E2 successful'
      };
    } catch (error) {
      if (error.name === 'NotFound') {
        // This is expected for a test key, but means the connection works
        return {
          success: true,
          message: 'Connection to IDrive E2 successful (bucket accessible)'
        };
      }
      
      return {
        success: false,
        error: error.message
      };
    }
  }
}

// Create and export a singleton instance
const fileStorageService = new FileStorageService();

module.exports = fileStorageService;