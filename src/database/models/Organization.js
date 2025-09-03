const { DataTypes } = require('sequelize');

let Organization;

const defineOrganization = (sequelize) => {
  
  Organization = sequelize.define('Organization', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    type: {
      type: DataTypes.STRING(100),
      allowNull: false,
      defaultValue: 'branch',
      validate: {
        isIn: [['branch', 'headquarters', 'subsidiary']]
      }
    },
    industry: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    size: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    website: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    phone: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: true,
      validate: {
        isEmail: true
      }
    },
    address: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    city: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    state: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    country: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    postal_code: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    timezone: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'active',
      validate: {
        isIn: [['active', 'inactive', 'suspended']]
      }
    },
    subscription_plan: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'basic',
      validate: {
        isIn: [['beta', 'basic', 'professional', 'enterprise']]
      }
    },
    subscription_status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'active',
      validate: {
        isIn: [['active', 'inactive', 'expired', 'cancelled']]
      }
    },
    subscription_expires_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    settings: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {}
    },
    parent_organization_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'organizations',
        key: 'id'
      }
    },
    subscription_start_date: {
      type: DataTypes.DATE,
      allowNull: true
    },
    subscription_end_date: {
      type: DataTypes.DATE,
      allowNull: true
    },
    max_users: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 10
    },
    otter_a_i_config: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: {}
    },
    logo: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    currency: {
      type: DataTypes.STRING(255),
      allowNull: false,
      defaultValue: 'USD'
    }
  }, {
    tableName: 'organizations',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        name: 'idx_organizations_name',
        fields: ['name']
      },
      {
        name: 'idx_organizations_type',
        fields: ['type']
      },
      {
        name: 'idx_organizations_status',
        fields: ['status']
      },
      {
        name: 'idx_organizations_subscription_status',
        fields: ['subscription_status']
      }
    ]
  });

  // Instance methods
  Organization.prototype.isSubscriptionActive = function() {
    if (this.subscription_status !== 'active') {
      return false;
    }
    
    if (this.subscription_end_date) {
      const now = new Date();
      return now <= this.subscription_end_date;
    }
    
    if (this.subscription_expires_at) {
      const now = new Date();
      return now <= this.subscription_expires_at;
    }
    
    return this.subscription_status === 'active';
  };

  Organization.prototype.canAddUser = function() {
    if (!this.isSubscriptionActive()) {
      return false;
    }
    
    if (this.max_users) {
      // This would need to be implemented with a count query
      // For now, return true if subscription is active
      return true;
    }
    
    return true;
  };

  Organization.prototype.isHeadquarters = function() {
    return this.type === 'headquarters';
  };

  Organization.prototype.isBranch = function() {
    return this.type === 'branch';
  };

  Organization.prototype.isSubsidiary = function() {
    return this.type === 'subsidiary';
  };

  // Class methods
  Organization.findActive = function() {
    return this.findAll({
      where: { status: 'active' }
    });
  };

  Organization.findByType = function(type) {
    return this.findAll({
      where: { type }
    });
  };

  Organization.findBySubscriptionStatus = function(status) {
    return this.findAll({
      where: { subscription_status: status }
    });
  };

  Organization.findBranches = function(parentOrganizationId) {
    return this.findAll({
      where: {
        parent_organization_id: parentOrganizationId,
        type: 'branch'
      }
    });
  };

  Organization.findSubsidiaries = function(parentOrganizationId) {
    return this.findAll({
      where: {
        parent_organization_id: parentOrganizationId,
        type: 'subsidiary'
      }
    });
  };

  Organization.findByParent = function(parentOrganizationId) {
    return this.findAll({
      where: { parent_organization_id: parentOrganizationId }
    });
  };

  return Organization;
};

module.exports = defineOrganization;
