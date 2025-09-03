const express = require('express');
const multer = require('multer');
const { body, validationResult } = require('express-validator');
const fileStorageService = require('../services/fileStorageService');
const { logger } = require('../utils/logger');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

// Configure multer for memory storage (no local file saving)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 100 * 1024 * 1024, // 100MB default
  },
  fileFilter: (req, file, cb) => {
    // Allow common file types
    const allowedTypes = [
      // Audio files
      'audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/m4a', 'audio/aac',
      // Video files
      'video/mp4', 'video/avi', 'video/mov', 'video/wmv', 'video/flv',
      // Image files
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      // Document files
      'application/pdf', 'application/msword', 
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain', 'text/csv'
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} is not allowed`), false);
    }
  }
});

/**
 * @route   POST /api/v1/files/upload
 * @desc    Upload a file to IDrive E2
 * @access  Private (All authenticated users)
 */
router.post('/upload', [
  upload.single('file'),
  body('category').isIn(['sales-call', 'analytics', 'profile', 'general']).withMessage('Valid category is required'),
  body('description').optional().isLength({ max: 500 }).withMessage('Description too long')
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: errors.array()
        }
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'No file provided',
          code: 'NO_FILE'
        }
      });
    }

    const { category, description, relatedId } = req.body;
    const { originalname, mimetype, buffer, size } = req.file;

    // Generate appropriate prefix based on category
    let prefix = 'uploads';
    let fileKey = null;

    try {
      switch (category) {
        case 'sales-call':
          if (!relatedId) {
            return res.status(400).json({
              success: false,
              error: {
                message: 'Sales call ID is required for sales-call category',
                code: 'MISSING_SALES_CALL_ID'
              }
            });
          }
          const salesCallResult = await fileStorageService.uploadSalesCallRecording(
            buffer, 
            originalname, 
            relatedId
          );
          fileKey = salesCallResult.fileKey;
          break;

        case 'analytics':
          if (!relatedId) {
            return res.status(400).json({
              success: false,
              error: {
                message: 'Report ID is required for analytics category',
                code: 'MISSING_REPORT_ID'
              }
            });
          }
          const analyticsResult = await fileStorageService.uploadAnalyticsReport(
            buffer, 
            originalname, 
            relatedId
          );
          fileKey = analyticsResult.fileKey;
          break;

        case 'profile':
          if (!relatedId) {
            return res.status(400).json({
              success: false,
              error: {
                message: 'User ID is required for profile category',
                code: 'MISSING_USER_ID'
              }
            });
          }
          const profileResult = await fileStorageService.uploadProfileImage(
            buffer, 
            originalname, 
            relatedId
          );
          fileKey = profileResult.fileKey;
          break;

        default:
          const generalResult = await fileStorageService.uploadFile(
            buffer, 
            originalname, 
            mimetype, 
            'general'
          );
          fileKey = generalResult.fileKey;
      }

      // Get file metadata
      const metadata = await fileStorageService.getFileMetadata(fileKey);

      // Log user activity if user is available
      if (req.user && req.user.id) {
        logger.logUserActivity(req.user.id, 'file_uploaded', {
          category,
          originalName: originalname,
          fileKey,
          fileSize: size
        });
      }

      res.status(201).json({
        success: true,
        message: 'File uploaded successfully',
        data: {
          fileKey,
          fileUrl: `${fileStorageService.baseUrl}/${fileStorageService.bucket}/${fileKey}`,
          originalName: originalname,
          contentType: mimetype,
          fileSize: size,
          category,
          description,
          relatedId,
          uploadedAt: new Date().toISOString(),
          metadata
        }
      });

    } catch (uploadError) {
      logger.error('File upload failed:', uploadError);
      res.status(500).json({
        success: false,
        error: {
          message: 'File upload failed',
          code: 'UPLOAD_FAILED',
          details: uploadError.message
        }
      });
    }

  } catch (error) {
    logger.error('File upload route error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'File upload request failed',
        code: 'UPLOAD_REQUEST_FAILED'
      }
    });
  }
});

/**
 * @route   POST /api/v1/files/upload-sales-call
 * @desc    Upload sales call recording file
 * @access  Private (Sales representatives, managers)
 */
router.post('/upload-sales-call', [
  requireRole(['sales_representative', 'sales_manager', 'admin']),
  upload.single('recording'),
  body('salesCallId').isUUID().withMessage('Valid sales call ID is required'),
  body('description').optional().isLength({ max: 500 }).withMessage('Description too long')
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: errors.array()
        }
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'No recording file provided',
          code: 'NO_RECORDING_FILE'
        }
      });
    }

    const { salesCallId, description } = req.body;
    const { originalname, mimetype, buffer, size } = req.file;

    // Validate file type (audio/video only)
    if (!mimetype.startsWith('audio/') && !mimetype.startsWith('video/')) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Only audio and video files are allowed for sales call recordings',
          code: 'INVALID_FILE_TYPE'
        }
      });
    }

    try {
      const result = await fileStorageService.uploadSalesCallRecording(
        buffer,
        originalname,
        salesCallId
      );

      // Log user activity if user is available
      if (req.user && req.user.id) {
        logger.logUserActivity(req.user.id, 'sales_call_recording_uploaded', {
          salesCallId,
          originalName: originalname,
          fileKey: result.fileKey,
          fileSize: size
        });
      }

      res.status(201).json({
        success: true,
        message: 'Sales call recording uploaded successfully',
        data: {
          ...result,
          salesCallId,
          description
        }
      });

    } catch (uploadError) {
      logger.error('Sales call recording upload failed:', uploadError);
      res.status(500).json({
        success: false,
        error: {
          message: 'Recording upload failed',
          code: 'RECORDING_UPLOAD_FAILED',
          details: uploadError.message
        }
      });
    }

  } catch (error) {
    logger.error('Sales call recording upload route error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Recording upload request failed',
        code: 'RECORDING_UPLOAD_REQUEST_FAILED'
      }
    });
  }
});

/**
 * @route   GET /api/v1/files/:fileKey
 * @desc    Get file information and generate download URL
 * @access  Private (All authenticated users)
 */
router.get('/:fileKey', async (req, res) => {
  try {
    const { fileKey } = req.params;
    const { download } = req.query;

    // Check if file exists
    const exists = await fileStorageService.fileExists(fileKey);
    if (!exists) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'File not found',
          code: 'FILE_NOT_FOUND'
        }
      });
    }

    // Get file metadata
    const metadata = await fileStorageService.getFileMetadata(fileKey);

    if (download === 'true') {
      // Generate presigned download URL
      const downloadUrl = await fileStorageService.getPresignedDownloadUrl(fileKey);
      
      res.status(200).json({
        success: true,
        data: {
          ...metadata,
          downloadUrl,
          expiresIn: 3600 // 1 hour
        }
      });
    } else {
      // Return file information only
      res.status(200).json({
        success: true,
        data: metadata
      });
    }

  } catch (error) {
    logger.error('File info retrieval error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to retrieve file information',
        code: 'FILE_INFO_RETRIEVAL_FAILED'
      }
    });
  }
});

/**
 * @route   DELETE /api/v1/files/:fileKey
 * @desc    Delete a file from IDrive E2
 * @access  Private (File owner or admin)
 */
router.delete('/:fileKey', [
  requireRole(['admin', 'super_admin'])
], async (req, res) => {
  try {
    const { fileKey } = req.params;

    // Check if file exists
    const exists = await fileStorageService.fileExists(fileKey);
    if (!exists) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'File not found',
          code: 'FILE_NOT_FOUND'
        }
      });
    }

    // Delete file
    const result = await fileStorageService.deleteFile(fileKey);

    // Log user activity if user is available
    if (req.user && req.user.id) {
      logger.logUserActivity(req.user.id, 'file_deleted', {
        fileKey
      });
    }

    res.status(200).json({
      success: true,
      message: 'File deleted successfully',
      data: result
    });

  } catch (error) {
    logger.error('File deletion error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to delete file',
        code: 'FILE_DELETION_FAILED'
      }
    });
  }
});

/**
 * @route   GET /api/v1/files/status
 * @desc    Get file storage service status
 * @access  Private (Admin only)
 */
router.get('/status', [
  requireRole(['admin', 'super_admin'])
], async (req, res) => {
  try {
    const status = fileStorageService.getStatus();
    
    res.status(200).json({
      success: true,
      data: status
    });

  } catch (error) {
    logger.error('Status retrieval error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to retrieve service status',
        code: 'STATUS_RETRIEVAL_FAILED'
      }
    });
  }
});

module.exports = router;
