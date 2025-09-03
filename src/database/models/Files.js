const { DataTypes } = require('sequelize');

let Files;

const defineFiles = (sequelize) => {
  
  Files = sequelize.define('Files', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false
    },
    organization_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'organizations',
        key: 'id'
      }
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    file_key: {
      type: DataTypes.STRING(500),
      allowNull: false,
      comment: 'Unique identifier for the file in IDrive E2'
    },
    file_url: {
      type: DataTypes.STRING(1000),
      allowNull: false,
      comment: 'Full URL to access the file'
    },
    original_name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: 'Original filename as uploaded'
    },
    content_type: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'MIME type of the file'
    },
    file_size: {
      type: DataTypes.BIGINT,
      allowNull: true,
      comment: 'File size in bytes'
    },
    category: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: 'File category (sales-call, analytics, profile, general)'
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Optional description of the file'
    },
    related_id: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: 'ID of related entity (sales call, analytics report, etc.)'
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
      comment: 'Additional metadata about the file'
    },
    is_deleted: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'Soft delete flag'
    },
    deleted_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Timestamp when file was soft deleted'
    }
  }, {
    tableName: 'files',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        name: 'idx_files_organization_id',
        fields: ['organization_id']
      },
      {
        name: 'idx_files_user_id',
        fields: ['user_id']
      },
      {
        name: 'idx_files_category',
        fields: ['category']
      },
      {
        name: 'idx_files_file_key',
        fields: ['file_key']
      },
      {
        name: 'idx_files_is_deleted',
        fields: ['is_deleted']
      }
    ]
  });

  // Instance methods
  Files.prototype.isDeleted = function() {
    return this.is_deleted === true;
  };

  Files.prototype.softDelete = function() {
    this.is_deleted = true;
    this.deleted_at = new Date();
    return this.save();
  };

  Files.prototype.restore = function() {
    this.is_deleted = false;
    this.deleted_at = null;
    return this.save();
  };

  // Class methods
  Files.findByOrganization = function(organizationId, options = {}) {
    return this.findAll({
      where: {
        organization_id: organizationId,
        is_deleted: false
      },
      ...options
    });
  };

  Files.findByUser = function(userId, options = {}) {
    return this.findAll({
      where: {
        user_id: userId,
        is_deleted: false
      },
      ...options
    });
  };

  Files.findByCategory = function(organizationId, category, options = {}) {
    return this.findAll({
      where: {
        organization_id: organizationId,
        category,
        is_deleted: false
      },
      ...options
    });
  };

  Files.findByRelatedEntity = function(relatedId, options = {}) {
    return this.findAll({
      where: {
        related_id: relatedId,
        is_deleted: false
      },
      ...options
    });
  };

  return Files;
};

module.exports = defineFiles;
