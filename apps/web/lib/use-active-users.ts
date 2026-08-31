'use client';

import { useEffect, useState } from 'react';
import { apiClient } from './api-client';
import { socketClient } from './socket-client';

export function useActiveUsersCount(initialFallback = 0) {
  const [count, setCount] = useState<number>(initialFallback);

  useEffect(() => {
    let isMounted = true;

    // 1. Fetch initial count via HTTP
    apiClient
      .getActiveUserCount()
      .then((c) => {
        if (isMounted && c > 0) {
          setCount(c);
        }
      })
      .catch(() => {});

    // 2. Subscribe to real-time WebSocket active user count updates
    const unsub = socketClient.onActiveUsersCount((newCount) => {
      if (isMounted) {
        setCount(newCount);
      }
    });

    // 3. Request active user count from socket if connected
    socketClient.requestActiveUsersCount();

    return () => {
      isMounted = false;
      unsub();
    };
  }, []);

  return count;
}
