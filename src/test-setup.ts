// Mock the chrome extension APIs for unit tests

const storage: Record<string, unknown> = {};

const chromeMock = {
  storage: {
    local: {
      get: (keys: string | string[], callback: (result: Record<string, unknown>) => void) => {
        const keyList = Array.isArray(keys) ? keys : [keys];
        const result: Record<string, unknown> = {};
        for (const key of keyList) {
          if (storage[key] !== undefined) result[key] = storage[key];
        }
        callback(result);
      },
      set: (data: Record<string, unknown>, callback?: () => void) => {
        Object.assign(storage, data);
        callback?.();
      },
    },
  },
  runtime: {
    sendMessage: vi.fn(),
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
    lastError: null,
  },
  tabs: {
    query: vi.fn(),
    sendMessage: vi.fn(),
  },
  sidePanel: {
    setPanelBehavior: vi.fn().mockResolvedValue(undefined),
  },
};

// @ts-expect-error — global chrome mock for tests
globalThis.chrome = chromeMock;
