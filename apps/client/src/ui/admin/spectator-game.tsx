import type { UserId } from "@mp/auth";
// Note: Using server types is normally not allowed, but for this admin tool we need the PlayerGameStateInfo type
// This is acceptable for admin functionality that requires server data structures
// eslint-disable-next-line boundaries/element-types
import type { PlayerGameStateInfo } from "@mp/game/server";

interface SpectatorGameProps {
  userId: UserId;
  gameStateInfo: PlayerGameStateInfo;
}

export function SpectatorGame(props: SpectatorGameProps) {
  // For now, just show basic info about the player
  // TODO: Implement full game rendering
  return (
    <div style={{
      width: "100%",
      height: "100%",
      display: "flex",
      "flex-direction": "column",
      "align-items": "center",
      "justify-content": "center",
      color: "#ccc",
      "font-size": "12px",
      padding: "20px",
      "text-align": "center",
    }}>
      <div>Character ID: {props.gameStateInfo.characterId}</div>
      <div>Area ID: {props.gameStateInfo.areaId}</div>
      <div>Actors: {Object.keys(props.gameStateInfo.gameState.actors).length}</div>
      <div style={{ "margin-top": "10px", color: "#999" }}>
        Game rendering coming soon...
      </div>
    </div>
  );
}