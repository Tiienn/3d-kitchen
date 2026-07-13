# public/

Place the Blender-exported model here as:

    public/kitchen.glb

It is served at the runtime URL `/kitchen.glb` (see `KITCHEN_GLB_URL` in
`src/components/KitchenModel.tsx`).

Until the file exists, the app loads placeholder box geometry and shows a
"Demo geometry — Blender model pending" note in the header. Material and object
naming expected in the export:

- Materials: `MAT_cabinet`, `MAT_counter_granite`, `MAT_steel`,
  `MAT_cooktop_black`, `MAT_floor_tile`, `MAT_butcher_block`, `MAT_wall`,
  `MAT_glass`
- Object prefixes: `ROOM_`, `CAB_`, `CTR_`, `APP_`, `FIX_`, `WIN_`, `ISL_`,
  `STOOL_`
