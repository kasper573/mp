import type { TestRoomState } from "@mp/server";
import type { Room } from "colyseus.js";
import * as THREE from "three";
import Stats from "three/addons/libs/stats.module.js";

export function createApp(room: Room<TestRoomState>) {
  let currentPlayer: THREE.Object3D | undefined;
  const playerEntities: { [sessionId: string]: THREE.Object3D } = {};
  const intersectTargets: THREE.Object3D[] = [];
  const gridSize = 50;
  const gridDivisions = 50;
  const cellSize = gridSize / gridDivisions;
  const stats = new Stats();

  const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    1,
    10000,
  );

  camera.position.set(
    (gridSize * 2) / 3,
    (gridSize * 2) / 3,
    (gridSize * 2) / 3,
  );
  camera.lookAt(0, 0, 0);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf0f0f0);

  const map = new THREE.TextureLoader().load(
    "textures/square-outline-textured.png",
  );
  map.colorSpace = THREE.SRGBColorSpace;
  const cubeGeo = new THREE.BoxGeometry(cellSize, cellSize, cellSize);
  const cubeMaterial = new THREE.MeshLambertMaterial({
    color: 0xfeb74c,
    map: map,
  });

  const gridHelper = new THREE.GridHelper(gridSize, gridDivisions);
  scene.add(gridHelper);

  const rayCaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  const geometry = new THREE.PlaneGeometry(gridSize, gridSize);
  geometry.rotateX(-Math.PI / 2);

  const plane = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  scene.add(plane);
  intersectTargets.push(plane);

  const ambientLight = new THREE.AmbientLight(0x606060, 3);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 3);
  directionalLight.position.set(1, 0.75, 0.5).normalize();
  scene.add(directionalLight);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);

  renderer.domElement.addEventListener("pointermove", onPointerDown);
  renderer.domElement.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("resize", onWindowResize);

  setupPlayerEvents();
  requestAnimationFrame(render);

  function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  function onPointerDown(event: MouseEvent) {
    pointer.set(
      (event.clientX / window.innerWidth) * 2 - 1,
      -(event.clientY / window.innerHeight) * 2 + 1,
    );

    rayCaster.setFromCamera(pointer, camera);

    const [intersect] = rayCaster.intersectObjects(intersectTargets, false);

    if (intersect?.face) {
      currentPlayer?.position.copy(intersect.point);
      room.send(0, worldToMap(intersect.point));
    }
  }

  let lastRenderTime: DOMHighResTimeStamp | undefined = undefined;
  function render(time: DOMHighResTimeStamp) {
    const timeDelta = lastRenderTime === undefined ? 0 : time - lastRenderTime;
    lastRenderTime = time;

    update(timeDelta);
    renderer.render(scene, camera);
    stats.update();
    requestAnimationFrame(render);
  }

  function setupPlayerEvents() {
    room.state.players.onAdd((player, sessionId) => {
      const entity = new THREE.Mesh(cubeGeo, cubeMaterial);
      entity.position.copy(mapToWorld(player));
      scene.add(entity);

      playerEntities[sessionId] = entity;

      if (sessionId === room.sessionId) {
        currentPlayer = entity;
      } else {
        player.onChange(() => {
          entity.userData = { serverPos: mapToWorld(player) };
        });
      }
    });

    room.state.players.onRemove((player, sessionId) => {
      const entity = playerEntities[sessionId];
      if (entity) {
        scene.remove(entity);
        entity.removeFromParent();
        delete playerEntities[sessionId];
      }
    });
  }

  let elapsedTime = 0;
  const fixedTimeStep = 1000 / 60;
  function update(timeDelta: number): void {
    if (!currentPlayer) {
      return;
    }

    elapsedTime += timeDelta;
    while (elapsedTime >= fixedTimeStep) {
      elapsedTime -= fixedTimeStep;
      fixedTick();
    }
  }

  function fixedTick() {
    for (const sessionId in playerEntities) {
      if (sessionId === room.sessionId) {
        continue;
      }

      const entity = playerEntities[sessionId];
      const { serverPos } = entity.userData;

      entity.position.x = lerp(entity.position.x, serverPos.x, 0.2);
      entity.position.y = lerp(entity.position.y, serverPos.y, 0.2);
      entity.position.z = lerp(entity.position.z, serverPos.z, 0.2);
    }
  }

  return { renderer, stats };
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function worldToMap(v: THREE.Vector3Like): THREE.Vector2Like {
  return { x: v.x, y: v.z };
}

function mapToWorld(v: THREE.Vector2Like): THREE.Vector3Like {
  return { x: v.x, y: 0, z: v.y };
}
