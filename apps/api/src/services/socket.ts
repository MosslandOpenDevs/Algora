import { Server as SocketServer, Socket } from 'socket.io';
import type Database from 'better-sqlite3';
import { AgoraService } from './agora';
import { SummoningService } from './summoning';

// Store service references for socket handlers
let agoraService: AgoraService | null = null;
let summoningService: SummoningService | null = null;

export function initializeSocketServices(db: Database.Database, io: SocketServer): void {
  agoraService = new AgoraService(db, io);
  summoningService = new SummoningService(db, io);
}

export function getAgoraService(): AgoraService | null {
  return agoraService;
}

export function getSummoningService(): SummoningService | null {
  return summoningService;
}

export function setupSocketHandlers(io: SocketServer, db: Database.Database): void {
  // Initialize services
  initializeSocketServices(db, io);

  io.on('connection', (socket: Socket) => {
    console.info(`Client connected: ${socket.id}`);

    // Join agora session room
    socket.on('agora:join', (sessionId: string) => {
      socket.join(`agora:${sessionId}`);
      console.info(`Client ${socket.id} joined agora session: ${sessionId}`);

      // Send recent messages to the client
      if (agoraService) {
        const messages = agoraService.getMessages(sessionId, 50);
        socket.emit('agora:history', { sessionId, messages });
      }
    });

    // Leave agora session room
    socket.on('agora:leave', (sessionId: string) => {
      socket.leave(`agora:${sessionId}`);
      console.info(`Client ${socket.id} left agora session: ${sessionId}`);
    });

    // Handle human message in agora
    socket.on('agora:sendMessage', async (data: { sessionId: string; content: string }) => {
      if (agoraService && data.sessionId && data.content) {
        try {
          const message = await agoraService.addMessage(data.sessionId, {
            content: data.content,
            messageType: 'human',
          });
          socket.emit('agora:messageSent', { success: true, message });
        } catch (error) {
          socket.emit('agora:messageSent', { success: false, error: 'Failed to send message' });
        }
      }
    });

    // Request agent response in agora
    socket.on('agora:requestResponse', async (data: { sessionId: string; agentId: string }) => {
      if (agoraService && data.sessionId && data.agentId) {
        try {
          const message = await agoraService.generateAgentResponse(data.sessionId, data.agentId);
          socket.emit('agora:responseGenerated', { success: true, message });
        } catch (error) {
          socket.emit('agora:responseGenerated', { success: false, error: 'Failed to generate response' });
        }
      }
    });

    // Start automated discussion
    socket.on('agora:startAutomated', (data: { sessionId: string; intervalMs?: number }) => {
      if (agoraService && data.sessionId) {
        agoraService.startAutomatedDiscussion(data.sessionId, data.intervalMs || 15000);
        socket.emit('agora:automatedStarted', { sessionId: data.sessionId });
      }
    });

    // Stop automated discussion
    socket.on('agora:stopAutomated', (data: { sessionId: string }) => {
      if (agoraService && data.sessionId) {
        agoraService.stopAutomatedDiscussion(data.sessionId);
        socket.emit('agora:automatedStopped', { sessionId: data.sessionId });
      }
    });

    // Handle agent summon request
    socket.on('agent:summon', async (data: { sessionId?: string; agentId: string; reason?: string }) => {
      if (summoningService && data.agentId) {
        try {
          const agent = await summoningService.summonAgent(data.agentId, data.sessionId);
          if (agent) {
            socket.emit('agent:summon:ack', { success: true, agent });

            // Add to agora session if specified
            if (data.sessionId && agoraService) {
              await agoraService.addParticipant(data.sessionId, data.agentId);
            }
          } else {
            socket.emit('agent:summon:ack', { success: false, error: 'Agent not found' });
          }
        } catch (error) {
          socket.emit('agent:summon:ack', { success: false, error: 'Failed to summon agent' });
        }
      }
    });

    // Handle agent dismiss request
    socket.on('agent:dismiss', (data: { sessionId?: string; agentId: string }) => {
      if (summoningService && data.agentId) {
        const success = summoningService.dismissAgent(data.agentId);

        // Remove from agora session if specified
        if (data.sessionId && agoraService) {
          agoraService.removeParticipant(data.sessionId, data.agentId);
        }

        socket.emit('agent:dismiss:ack', { success, agentId: data.agentId });
      }
    });

    // Get session participants
    socket.on('agora:getParticipants', (sessionId: string) => {
      if (agoraService) {
        const participants = agoraService.getParticipants(sessionId);
        socket.emit('agora:participants', { sessionId, participants });
      }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      console.info(`Client disconnected: ${socket.id}`);
    });

    // Error handling
    socket.on('error', (error) => {
      console.error(`Socket error for ${socket.id}:`, error);
    });
  });

  // Middleware for authentication (if needed in the future)
  io.use((socket, next) => {
    // For now, allow all connections
    // In production, add token verification here
    next();
  });
}

// Helper function to broadcast activity events
export function broadcastActivity(
  io: SocketServer,
  type: string,
  severity: string,
  message: string,
  details?: Record<string, unknown>
): void {
  io.emit('activity:event', {
    type,
    severity,
    message,
    details,
    timestamp: new Date().toISOString(),
  });
}

// Helper function to broadcast agent chatter
export function broadcastChatter(
  io: SocketServer,
  agentId: string,
  agentName: string,
  message: string,
  color?: string
): void {
  io.emit('agent:chatter', {
    agentId,
    agentName,
    message,
    color,
    timestamp: new Date().toISOString(),
  });
}

// ===========================================
// Governance OS Real-Time Events
// ===========================================

/**
 * Broadcast when a new document is created in the registry
 */
export function broadcastDocumentCreated(
  io: SocketServer,
  document: {
    id: string;
    type: string;
    title: string;
    state: string;
    createdBy: string;
  }
): void {
  io.emit('governance:document:created', {
    ...document,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Broadcast when a document state changes
 */
export function broadcastDocumentStateChanged(
  io: SocketServer,
  data: {
    documentId: string;
    previousState: string;
    newState: string;
    changedBy: string;
  }
): void {
  io.emit('governance:document:state_changed', {
    ...data,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Broadcast when a new voting session is created
 */
export function broadcastVotingCreated(
  io: SocketServer,
  voting: {
    id: string;
    proposalId: string;
    title: string;
    status: string;
    riskLevel: string;
  }
): void {
  io.emit('governance:voting:created', {
    ...voting,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Broadcast when a vote is cast
 */
export function broadcastVoteCast(
  io: SocketServer,
  data: {
    votingId: string;
    house: 'mosscoin' | 'opensource';
    voterId: string;
    choice: 'for' | 'against' | 'abstain';
  }
): void {
  io.emit('governance:voting:vote_cast', {
    ...data,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Broadcast when voting status changes
 */
export function broadcastVotingStatusChanged(
  io: SocketServer,
  data: {
    votingId: string;
    previousStatus: string;
    newStatus: string;
    mossCoinPassed?: boolean;
    openSourcePassed?: boolean;
  }
): void {
  io.emit('governance:voting:status_changed', {
    ...data,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Broadcast when a high-risk action is locked
 */
export function broadcastActionLocked(
  io: SocketServer,
  data: {
    actionId: string;
    proposalId: string;
    actionType: string;
    reason: string;
    requiredApprovals: string[];
  }
): void {
  io.emit('governance:action:locked', {
    ...data,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Broadcast when a high-risk action is unlocked
 */
export function broadcastActionUnlocked(
  io: SocketServer,
  data: {
    actionId: string;
    unlockedBy: string;
  }
): void {
  io.emit('governance:action:unlocked', {
    ...data,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Broadcast when Director 3 approves an action
 */
export function broadcastDirector3Approval(
  io: SocketServer,
  data: {
    approvalId: string;
    approverId: string;
    actionDescription: string;
  }
): void {
  io.emit('governance:approval:director3', {
    ...data,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Broadcast pipeline stage progress
 */
export function broadcastPipelineProgress(
  io: SocketServer,
  data: {
    pipelineId: string;
    issueId: string;
    stage: string;
    stageIndex: number;
    totalStages: number;
    status: 'started' | 'completed' | 'failed';
    result?: Record<string, unknown>;
  }
): void {
  io.emit('governance:pipeline:progress', {
    ...data,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Broadcast workflow state change
 */
export function broadcastWorkflowStateChanged(
  io: SocketServer,
  data: {
    workflowId: string;
    workflowType: string;
    previousState: string;
    newState: string;
    issueId: string;
  }
): void {
  io.emit('governance:workflow:state_changed', {
    ...data,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Broadcast system health update
 */
export function broadcastHealthUpdate(
  io: SocketServer,
  data: {
    status: 'healthy' | 'degraded' | 'unhealthy';
    uptime: number;
    lastCheck: string;
    components: Record<string, 'healthy' | 'degraded' | 'unhealthy'>;
  }
): void {
  io.emit('governance:health:update', {
    ...data,
    timestamp: new Date().toISOString(),
  });
}
