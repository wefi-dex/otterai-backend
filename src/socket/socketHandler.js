const { logger } = require('../utils/logger');
const { LiveSession, User, SalesCall } = require('../database/models');
const { generateToken, verifyRefreshToken } = require('../middleware/auth');

/**
 * Initialize Socket.IO handlers
 */
const initializeSocketIO = (io) => {
  // Authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      
      if (!token) {
        return next(new Error('Authentication token required'));
      }

      // Verify token and get user
      const user = await authenticateSocketUser(token);
      if (!user) {
        return next(new Error('Invalid authentication token'));
      }

      socket.user = user;
      next();
    } catch (error) {
      logger.error('Socket authentication error:', error);
      next(new Error('Authentication failed'));
    }
  });

  // Connection handler
  io.on('connection', (socket) => {
    logger.info('Socket connected:', {
      userId: socket.user.id,
      email: socket.user.email,
      role: socket.user.role,
      socketId: socket.id
    });

    // Join organization room
    socket.join(`org_${socket.user.organizationId}`);

    // Update user online status
    updateUserOnlineStatus(socket.user.id, true, socket.id);

    // Handle live session join
    socket.on('join_live_session', async (data) => {
      try {
        await handleJoinLiveSession(socket, data);
      } catch (error) {
        logger.error('Error joining live session:', error);
        socket.emit('error', { message: 'Failed to join live session' });
      }
    });

    // Handle live session leave
    socket.on('leave_live_session', async (data) => {
      try {
        await handleLeaveLiveSession(socket, data);
      } catch (error) {
        logger.error('Error leaving live session:', error);
        socket.emit('error', { message: 'Failed to leave live session' });
      }
    });

    // Handle manager intervention
    socket.on('manager_intervention', async (data) => {
      try {
        await handleManagerIntervention(socket, data);
      } catch (error) {
        logger.error('Error sending manager intervention:', error);
        socket.emit('error', { message: 'Failed to send intervention' });
      }
    });

    // Handle sales rep response
    socket.on('sales_rep_response', async (data) => {
      try {
        await handleSalesRepResponse(socket, data);
      } catch (error) {
        logger.error('Error sending sales rep response:', error);
        socket.emit('error', { message: 'Failed to send response' });
      }
    });

    // Handle audio stream
    socket.on('audio_stream', (data) => {
      handleAudioStream(socket, data);
    });

    // Handle session notes
    socket.on('session_notes', async (data) => {
      try {
        await handleSessionNotes(socket, data);
      } catch (error) {
        logger.error('Error updating session notes:', error);
        socket.emit('error', { message: 'Failed to update notes' });
      }
    });

    // Handle disconnect
    socket.on('disconnect', async () => {
      try {
        await handleDisconnect(socket);
      } catch (error) {
        logger.error('Error handling disconnect:', error);
      }
    });
  });

  return io;
};

/**
 * Authenticate socket user
 */
const authenticateSocketUser = async (token) => {
  try {
    // For socket connections, we'll use a simplified token verification
    // In production, you might want to use a different token type for sockets
    const user = await User.findOne({
      where: { deviceToken: token },
      include: [
        {
          model: require('../database/models').Organization,
          as: 'organization',
          attributes: ['id', 'name', 'type', 'status']
        }
      ]
    });

    if (!user || user.status !== 'active' || user.organization.status !== 'active') {
      return null;
    }

    return user;
  } catch (error) {
    logger.error('Socket user authentication error:', error);
    return null;
  }
};

/**
 * Update user online status
 */
const updateUserOnlineStatus = async (userId, isOnline, socketId = null) => {
  try {
    await User.update(
      { 
        isOnline,
        deviceToken: socketId || null
      },
      { where: { id: userId } }
    );
  } catch (error) {
    logger.error('Error updating user online status:', error);
  }
};

/**
 * Handle joining live session
 */
const handleJoinLiveSession = async (socket, data) => {
  const { sessionToken, role } = data;
  
  // Find live session
  const liveSession = await LiveSession.findByToken(sessionToken);
  if (!liveSession) {
    throw new Error('Live session not found');
  }

  // Verify user has access to this session
  if (role === 'manager') {
    if (liveSession.managerId !== socket.user.id) {
      throw new Error('Access denied to live session');
    }
    liveSession.managerSocketId = socket.id;
  } else if (role === 'sales_rep') {
    if (liveSession.salesRepresentativeId !== socket.user.id) {
      throw new Error('Access denied to live session');
    }
    liveSession.salesRepSocketId = socket.id;
  }

  await liveSession.save();

  // Join session room
  socket.join(`session_${liveSession.id}`);

  // Update session status if needed
  if (liveSession.status === 'connecting') {
    liveSession.status = 'active';
    liveSession.startTime = new Date();
    await liveSession.save();
  }

  // Notify other participants
  socket.to(`session_${liveSession.id}`).emit('participant_joined', {
    sessionId: liveSession.id,
    userId: socket.user.id,
    role: role,
    userName: `${socket.user.firstName} ${socket.user.lastName}`
  });

  // Send session info to joining user
  socket.emit('session_joined', {
    sessionId: liveSession.id,
    salesCallId: liveSession.salesCallId,
    participants: await getSessionParticipants(liveSession.id)
  });

  logger.logLiveSessionEvent('participant_joined', liveSession.id, {
    userId: socket.user.id,
    role: role
  });
};

/**
 * Handle leaving live session
 */
const handleLeaveLiveSession = async (socket, data) => {
  const { sessionId } = data;
  
  // Find live session
  const liveSession = await LiveSession.findByPk(sessionId);
  if (!liveSession) {
    throw new Error('Live session not found');
  }

  // Leave session room
  socket.leave(`session_${sessionId}`);

  // Update socket IDs
  if (liveSession.managerSocketId === socket.id) {
    liveSession.managerSocketId = null;
  } else if (liveSession.salesRepSocketId === socket.id) {
    liveSession.salesRepSocketId = null;
  }

  await liveSession.save();

  // Notify other participants
  socket.to(`session_${sessionId}`).emit('participant_left', {
    sessionId: sessionId,
    userId: socket.user.id,
    userName: `${socket.user.firstName} ${socket.user.lastName}`
  });

  logger.logLiveSessionEvent('participant_left', sessionId, {
    userId: socket.user.id
  });
};

/**
 * Handle manager intervention
 */
const handleManagerIntervention = async (socket, data) => {
  const { sessionId, message, type = 'guidance' } = data;
  
  // Find live session
  const liveSession = await LiveSession.findByPk(sessionId);
  if (!liveSession) {
    throw new Error('Live session not found');
  }

  // Verify user is the manager
  if (liveSession.managerId !== socket.user.id) {
    throw new Error('Only the manager can send interventions');
  }

  const intervention = {
    id: Date.now().toString(),
    type: type,
    message: message,
    from: socket.user.id,
    fromName: `${socket.user.firstName} ${socket.user.lastName}`,
    timestamp: new Date().toISOString()
  };

  // Add to session interventions
  liveSession.addIntervention(intervention);
  await liveSession.save();

  // Send to sales representative
  socket.to(`session_${sessionId}`).emit('manager_intervention', intervention);

  // Send confirmation to manager
  socket.emit('intervention_sent', intervention);

  logger.logLiveSessionEvent('manager_intervention', sessionId, {
    managerId: socket.user.id,
    type: type
  });
};

/**
 * Handle sales rep response
 */
const handleSalesRepResponse = async (socket, data) => {
  const { sessionId, message } = data;
  
  // Find live session
  const liveSession = await LiveSession.findByPk(sessionId);
  if (!liveSession) {
    throw new Error('Live session not found');
  }

  // Verify user is the sales representative
  if (liveSession.salesRepresentativeId !== socket.user.id) {
    throw new Error('Only the sales representative can send responses');
  }

  const response = {
    id: Date.now().toString(),
    message: message,
    from: socket.user.id,
    fromName: `${socket.user.firstName} ${socket.user.lastName}`,
    timestamp: new Date().toISOString()
  };

  // Add to session messages
  liveSession.addMessage(response);
  await liveSession.save();

  // Send to manager
  socket.to(`session_${sessionId}`).emit('sales_rep_response', response);

  // Send confirmation to sales rep
  socket.emit('response_sent', response);

  logger.logLiveSessionEvent('sales_rep_response', sessionId, {
    salesRepId: socket.user.id
  });
};

/**
 * Handle audio stream
 */
const handleAudioStream = (socket, data) => {
  const { sessionId, audioData } = data;
  
  // Broadcast audio to other participants in the session
  socket.to(`session_${sessionId}`).emit('audio_stream', {
    audioData: audioData,
    from: socket.user.id,
    timestamp: new Date().toISOString()
  });
};

/**
 * Handle session notes
 */
const handleSessionNotes = async (socket, data) => {
  const { sessionId, notes } = data;
  
  // Find live session
  const liveSession = await LiveSession.findByPk(sessionId);
  if (!liveSession) {
    throw new Error('Live session not found');
  }

  // Verify user has access to this session
  if (liveSession.managerId !== socket.user.id && liveSession.salesRepresentativeId !== socket.user.id) {
    throw new Error('Access denied to live session');
  }

  // Update notes
  liveSession.notes = notes;
  await liveSession.save();

  // Notify other participants
  socket.to(`session_${sessionId}`).emit('notes_updated', {
    sessionId: sessionId,
    notes: notes,
    updatedBy: socket.user.id
  });

  logger.logLiveSessionEvent('notes_updated', sessionId, {
    userId: socket.user.id
  });
};

/**
 * Handle disconnect
 */
const handleDisconnect = async (socket) => {
  try {
    // Update user online status
    await updateUserOnlineStatus(socket.user.id, false);

    // Find and update any active live sessions
    const liveSessions = await LiveSession.findAll({
      where: {
        [require('sequelize').Op.or]: [
          { managerSocketId: socket.id },
          { salesRepSocketId: socket.id }
        ],
        status: 'active'
      }
    });

    for (const session of liveSessions) {
      if (session.managerSocketId === socket.id) {
        session.managerSocketId = null;
      } else if (session.salesRepSocketId === socket.id) {
        session.salesRepSocketId = null;
      }

      // If no participants left, end the session
      if (!session.managerSocketId && !session.salesRepSocketId) {
        session.status = 'ended';
        session.endTime = new Date();
        session.duration = session.calculateDuration();
      }

      await session.save();

      // Notify other participants
      socket.to(`session_${session.id}`).emit('participant_disconnected', {
        sessionId: session.id,
        userId: socket.user.id,
        userName: `${socket.user.firstName} ${socket.user.lastName}`
      });
    }

    logger.info('Socket disconnected:', {
      userId: socket.user.id,
      email: socket.user.email,
      socketId: socket.id
    });
  } catch (error) {
    logger.error('Error handling disconnect:', error);
  }
};

/**
 * Get session participants
 */
const getSessionParticipants = async (sessionId) => {
  const liveSession = await LiveSession.findByPk(sessionId, {
    include: [
      {
        model: User,
        as: 'salesRepresentative',
        attributes: ['id', 'firstName', 'lastName', 'email']
      },
      {
        model: User,
        as: 'manager',
        attributes: ['id', 'firstName', 'lastName', 'email']
      }
    ]
  });

  if (!liveSession) return [];

  return [
    {
      id: liveSession.salesRepresentative.id,
      name: `${liveSession.salesRepresentative.firstName} ${liveSession.salesRepresentative.lastName}`,
      role: 'sales_rep',
      online: !!liveSession.salesRepSocketId
    },
    {
      id: liveSession.manager.id,
      name: `${liveSession.manager.firstName} ${liveSession.manager.lastName}`,
      role: 'manager',
      online: !!liveSession.managerSocketId
    }
  ];
};

module.exports = { initializeSocketIO };
