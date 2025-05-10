import * as Pyroscope from "@mp/telemetry/pyroscope";

Pyroscope.init({
  serverAddress: process.env.PYROSCOPE_SERVER_ADDRESS,
  appName: process.env.PYROSCOPE_APPLICATION_NAME,
  wall: {
    collectCpuTime: true,
  },
});

Pyroscope.start();
