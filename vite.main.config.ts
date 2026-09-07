import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      external: [
        // @stoprocent/noble ships a native binding plus platform-specific
        // optional backends (mac/win/hci-socket/dbus) selected at
        // require-time based on os.platform(). Bundling it makes Rollup's
        // CJS interop eagerly evaluate every require() in that selection
        // logic (including ones for platforms we're not on), which throws
        // on missing optional deps like @stoprocent/bluetooth-hci-socket.
        // Keep it external so Node's real require() only ever resolves
        // the branch that actually runs. See
        // agentMemory/memories/noble-vite-bundling-bug.md.
        '@stoprocent/noble',
        // Same class of issue as noble above: serialport's native binding
        // (@serialport/bindings-cpp) is loaded via node-gyp-build's runtime
        // platform detection. Keep both external so that resolution happens
        // for real, at Node require-time, against the actual platform.
        'serialport',
        '@serialport/bindings-cpp',
      ],
    },
  },
});
