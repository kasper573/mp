import * as Pyroscope from "@mp/telemetry/pyroscope";

Pyroscope.init({
  wall: {
    collectCpuTime: true,
  },
});

Pyroscope.start();
