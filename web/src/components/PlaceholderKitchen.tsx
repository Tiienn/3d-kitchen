import { useEffect, useState } from "react";
import * as THREE from "three";
import { useConfigurator } from "../store/useConfigurator";
import { useApplyFinishes } from "../three/useApplyFinishes";

/**
 * Simple box-primitive kitchen used when web/public/kitchen.glb is missing or
 * fails to load. An L of base cabinets, an island, counters, and a floor plane.
 * Material names match the Blender export contract so finish swaps work here too.
 */
export function PlaceholderKitchen() {
  const [root, setRoot] = useState<THREE.Group | null>(null);
  const setPlaceholderMode = useConfigurator((s) => s.setPlaceholderMode);

  useEffect(() => {
    setPlaceholderMode(true);
    return () => setPlaceholderMode(false);
  }, [setPlaceholderMode]);

  useApplyFinishes(root);

  // Base cabinet run height and counter thickness (metres).
  const cabH = 0.85;
  const ctrT = 0.05;
  const depth = 0.6;

  return (
    <group ref={setRoot} name="ROOM_placeholder">
      {/* Floor */}
      <mesh
        name="ROOM_floor"
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[5, 4]} />
        <meshStandardMaterial name="MAT_floor_tile" color="#cfc9be" roughness={0.4} />
      </mesh>

      {/* Back wall */}
      <mesh name="ROOM_wall_back" position={[0, 1.4, -2]} receiveShadow>
        <boxGeometry args={[5, 2.8, 0.08]} />
        <meshStandardMaterial name="MAT_wall" color="#e9e6df" roughness={0.9} />
      </mesh>
      {/* Side wall */}
      <mesh name="ROOM_wall_side" position={[-2.5, 1.4, 0]} receiveShadow>
        <boxGeometry args={[0.08, 2.8, 4]} />
        <meshStandardMaterial name="MAT_wall" color="#e9e6df" roughness={0.9} />
      </mesh>

      {/* --- Back cabinet run (L, part 1) --- */}
      <CabinetRun
        name="CAB_back"
        position={[0, cabH / 2, -1.7]}
        size={[3.6, cabH, depth]}
        cabH={cabH}
        ctrT={ctrT}
      />
      {/* --- Side cabinet run (L, part 2) --- */}
      <CabinetRun
        name="CAB_side"
        position={[-2.2, cabH / 2, 0.2]}
        size={[depth, cabH, 2.2]}
        cabH={cabH}
        ctrT={ctrT}
      />

      {/* --- Island --- */}
      <group name="ISL_island" position={[0.4, 0, 0.6]}>
        <mesh name="ISL_body" position={[0, cabH / 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[1.6, cabH, 0.9]} />
          <meshStandardMaterial name="MAT_cabinet" color="#f4f4f0" roughness={0.55} />
        </mesh>
        <mesh
          name="ISL_counter"
          position={[0, cabH + ctrT / 2, 0]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[1.7, ctrT, 1.0]} />
          <meshStandardMaterial
            name="MAT_counter_granite"
            color="#4a4a4d"
            roughness={0.3}
            metalness={0.05}
          />
        </mesh>
        {/* cooktop hint */}
        <mesh name="APP_cooktop" position={[0, cabH + ctrT + 0.005, 0]}>
          <boxGeometry args={[0.6, 0.02, 0.5]} />
          <meshStandardMaterial name="MAT_cooktop_black" color="#111214" roughness={0.3} />
        </mesh>
      </group>

      {/* Fridge block */}
      <mesh name="APP_fridge" position={[2.1, 0.9, -1.7]} castShadow receiveShadow>
        <boxGeometry args={[0.7, 1.8, 0.6]} />
        <meshStandardMaterial name="MAT_steel" color="#c7ccd1" roughness={0.35} metalness={0.6} />
      </mesh>
    </group>
  );
}

function CabinetRun({
  name,
  position,
  size,
  cabH,
  ctrT,
}: {
  name: string;
  position: [number, number, number];
  size: [number, number, number];
  cabH: number;
  ctrT: number;
}) {
  const [w, , d] = size;
  return (
    <group name={name} position={position}>
      <mesh name={`${name}_body`} castShadow receiveShadow>
        <boxGeometry args={size} />
        <meshStandardMaterial name="MAT_cabinet" color="#f4f4f0" roughness={0.55} />
      </mesh>
      <mesh
        name={`${name}_counter`}
        position={[0, cabH / 2 + ctrT / 2, 0]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[w + 0.04, ctrT, d + 0.04]} />
        <meshStandardMaterial
          name="MAT_counter_granite"
          color="#4a4a4d"
          roughness={0.3}
          metalness={0.05}
        />
      </mesh>
    </group>
  );
}
