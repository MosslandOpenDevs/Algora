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
