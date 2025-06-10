import Pyroscope from "@pyroscope/nodejs";

// Initialize Pyroscope profiling
Pyroscope.init({
  serverAddress: process.env.PYROSCOPE_SERVER_ADDRESS || "http://pyroscope:4040",
  appName: "mp-server",
  tags: {
    version: process.env.MP_SERVER_BUILD_VERSION || "dev",
  },
});

Pyroscope.start();