import type { Application, Texture } from "@mp/graphics";
import { Assets, Particle, ParticleContainer } from "@mp/graphics";
import kittenUrl from "./kitten.png";
import { useGraphics } from "@mp/graphics/react";
import { useState } from "preact/hooks";
import { useQuery } from "@mp/rpc/react";

export function ParticleTester() {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const textureQuery = useQuery({
    queryKey: ["kittenTexture"],
    queryFn: () => Assets.load<Texture>(kittenUrl),
  });

  useGraphics(
    container,
    {
      antialias: true,
      eventMode: "none",
      roundPixels: true,
      texture: textureQuery.data,
    },
    buildStage,
  );

  return <div style={{ flex: 1 }} ref={setContainer} />;
}

function buildStage(app: Application, opt: { texture?: Texture }) {
  if (!opt.texture) {
    return;
  }

  const container = new ParticleContainer({
    dynamicProperties: {
      position: true, // default
      scale: false,
      rotation: false,
      color: false,
    },
  });

  for (let i = 0; i < 1000; i++) {
    const particle = new Particle({
      texture: opt.texture,
      x: Math.random() * 800,
      y: Math.random() * 600,
      scaleX: 0.2,
      scaleY: 0.2,
    });

    container.addParticle(particle);
  }

  app.stage.addChild(container);
}
