'use client';

import { useEffect, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

const SOCKET_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3201';

let socket: Socket | null = null;

export function useSocket() {
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!socket) {
      socket = io(SOCKET_URL, {
        transports: ['websocket', 'polling'],
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });
    }

    function onConnect() {
      setIsConnected(true);
    }

    function onDisconnect() {
      setIsConnected(false);
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    if (socket.connected) {
      setIsConnected(true);
    }

    return () => {
      socket?.off('connect', onConnect);
      socket?.off('disconnect', onDisconnect);
    };
  }, []);

  const subscribe = useCallback((event: string, callback: (data: unknown) => void) => {
    socket?.on(event, callback);
    return () => {
      socket?.off(event, callback);
    };
  }, []);

  const emit = useCallback((event: string, data?: unknown) => {
    socket?.emit(event, data);
  }, []);

  return { isConnected, subscribe, emit, socket };
}

// Token-specific socket events
export type TokenEvent =
  | 'wallet:verified'
  | 'token:holder_registered'
  | 'token:balance_updated'
  | 'token:snapshot_created'
  | 'token:voting_started'
  | 'token:vote_cast'
  | 'token:voting_finalized'
  | 'treasury:allocation_created'
  | 'treasury:allocation_approved'
  | 'treasury:allocation_disbursed'
  | 'treasury:transaction';

export function useTokenEvents(events: TokenEvent[], callback: (event: TokenEvent, data: unknown) => void) {
  const { subscribe } = useSocket();

  useEffect(() => {
    const unsubscribes = events.map(event =>
      subscribe(event, (data) => callback(event, data))
    );

    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
  }, [events, callback, subscribe]);
}

// ===========================================
// Governance OS Events
// ===========================================

export type GovernanceEvent =
  // Document events
  | 'governance:document:created'
  | 'governance:document:state_changed'
  // Voting events
  | 'governance:voting:created'
  | 'governance:voting:vote_cast'
  | 'governance:voting:status_changed'
  // Action lock events
  | 'governance:action:locked'
  | 'governance:action:unlocked'
  | 'governance:approval:director3'
  // Pipeline events
  | 'governance:pipeline:progress'
  | 'governance:workflow:state_changed'
  // Health events
  | 'governance:health:update'
  // Legacy events (from governance-os-bridge)
  | 'governance-os:pipeline:completed'
  | 'governance-os:pipeline:stage'
  | 'governance-os:pipeline:started'
  | 'governance-os:action:locked'
  | 'governance-os:action:unlocked'
  | 'governance-os:approval:received'
  | 'governance-os:approval:required'
  | 'governance-os:approval:approved'
  | 'governance-os:voting:created'
  | 'governance-os:voting:vote_cast'
  | 'governance-os:health';

export interface GovernanceEventData {
  'governance:document:created': {
    id: string;
    type: string;
    title: string;
    state: string;
    createdBy: string;
    timestamp: string;
  };
  'governance:document:state_changed': {
    documentId: string;
    previousState: string;
    newState: string;
    changedBy: string;
    timestamp: string;
  };
  'governance:voting:created': {
    id: string;
    proposalId: string;
    title: string;
    status: string;
    riskLevel: string;
    timestamp: string;
  };
  'governance:voting:vote_cast': {
    votingId: string;
    house: 'mosscoin' | 'opensource';
    voterId: string;
    choice: 'for' | 'against' | 'abstain';
    timestamp: string;
  };
  'governance:voting:status_changed': {
    votingId: string;
    previousStatus: string;
    newStatus: string;
    mossCoinPassed?: boolean;
    openSourcePassed?: boolean;
    timestamp: string;
  };
  'governance:action:locked': {
    actionId: string;
    proposalId: string;
    actionType: string;
    reason: string;
    requiredApprovals: string[];
    timestamp: string;
  };
  'governance:action:unlocked': {
    actionId: string;
    unlockedBy: string;
    timestamp: string;
  };
  'governance:approval:director3': {
    approvalId: string;
    approverId: string;
    actionDescription: string;
    timestamp: string;
  };
  'governance:pipeline:progress': {
    pipelineId: string;
    issueId: string;
    stage: string;
    stageIndex: number;
    totalStages: number;
    status: 'started' | 'completed' | 'failed';
    result?: Record<string, unknown>;
    timestamp: string;
  };
  'governance:workflow:state_changed': {
    workflowId: string;
    workflowType: string;
    previousState: string;
    newState: string;
    issueId: string;
    timestamp: string;
  };
  'governance:health:update': {
    status: 'healthy' | 'degraded' | 'unhealthy';
    uptime: number;
    lastCheck: string;
    components: Record<string, 'healthy' | 'degraded' | 'unhealthy'>;
    timestamp: string;
  };
}

/**
 * Hook for subscribing to Governance OS real-time events
 */
export function useGovernanceEvents<T extends GovernanceEvent>(
  events: T[],
  callback: (event: T, data: unknown) => void
) {
  const { subscribe, isConnected } = useSocket();

  useEffect(() => {
    if (!isConnected) return;

    const unsubscribes = events.map(event =>
      subscribe(event, (data) => callback(event, data))
    );

    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
  }, [events, callback, subscribe, isConnected]);

  return { isConnected };
}

/**
 * Hook for subscribing to all governance events
 */
export function useAllGovernanceEvents(
  callback: (event: GovernanceEvent, data: unknown) => void
) {
  const allEvents: GovernanceEvent[] = [
    'governance:document:created',
    'governance:document:state_changed',
    'governance:voting:created',
    'governance:voting:vote_cast',
    'governance:voting:status_changed',
    'governance:action:locked',
    'governance:action:unlocked',
    'governance:approval:director3',
    'governance:pipeline:progress',
    'governance:workflow:state_changed',
    'governance:health:update',
  ];

  return useGovernanceEvents(allEvents, callback);
}
