# Local Linux environment attempt

The local AMD64 container ran under QEMU on Apple Silicon. Default Node 24 crashed; `--jitless` disabled WebAssembly required by Vite. Disabling high-tier JIT allowed Vite to start, but WebKit did not complete browser startup reliably. The isolated container was stopped. These attempts are environment failures, not counted as passed application tests.

The unchanged release commit is verified by the repository’s complete native Ubuntu Chrome/WebKit CI, including all three shards, before Pages/Docker deployment. Final CI and live results are recorded separately.
