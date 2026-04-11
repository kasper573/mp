import { Health } from "../../components";
import { useEntityComponent, useLocalCharacterEntity } from "./hooks";

export function HealthBar() {
  const entity = useLocalCharacterEntity();
  const health = useEntityComponent(entity, Health);
  const value = health.value;
  if (!value) {
    return null;
  }
  return (
    <div role="status">
      <progress value={value.current} max={value.max} />
      <span>
        {" "}
        {value.current}/{value.max}
      </span>
    </div>
  );
}
