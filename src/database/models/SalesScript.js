const { DataTypes } = require('sequelize');

let SalesScript;

const defineSalesScript = (sequelize) => {
  
  SalesScript = sequelize.define('SalesScript', {
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
    name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    category: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    tags: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: []
    },
    version: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: '1.0'
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },
    created_by: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    }
  }, {
    tableName: 'sales_scripts',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        name: 'idx_sales_scripts_organization_id',
        fields: ['organization_id']
      },
      {
        name: 'idx_sales_scripts_category',
        fields: ['category']
      },
      {
        name: 'idx_sales_scripts_is_active',
        fields: ['is_active']
      }
    ]
  });

  // Instance methods
  SalesScript.prototype.isActive = function() {
    return this.is_active === true;
  };

  // Class methods
  SalesScript.findActiveByOrganization = function(organizationId) {
    return this.findAll({
      where: {
        organization_id: organizationId,
        is_active: true
      },
      include: [
        {
          model: sequelize.models.User,
          as: 'creator',
          attributes: ['id', 'first_name', 'last_name']
        }
      ]
    });
  };

  return SalesScript;
};

module.exports = defineSalesScript;
